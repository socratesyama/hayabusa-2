"""SPICE(SPK) を自前で読み、サイトで使う軌道・自転データを書き出す。
spiceypy が入手できない環境のため、DAF/SPK の type 2 / 9 / 13 を numpy で直接評価する。
出力: public/data/ephem.bin (Float32), public/data/ephem.json (メタ情報)
"""
import struct, json, sys, glob, os, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
SPK = os.path.join(REPO, '03_spice/spk') + '/'
OUT = os.path.join(REPO, 'site/data') + '/'
os.makedirs(OUT, exist_ok=True)
AU = 149597870.7
GM_SUN = 132712440041.93938
J2000_UNIX = 946727935.816  # 2000-01-01T11:58:55.816Z = ET 0 (UTC近似、差は数十秒)
ET_MINUS_UTC = 69.184       # 2017以降の TDB-UTC 近似


def utc_to_et(unix):
    return unix - J2000_UNIX + (ET_MINUS_UTC - 64.184 + 0) if False else unix - 946728000.0 + ET_MINUS_UTC


def et_to_unix(et):
    return et + 946728000.0 - ET_MINUS_UTC


class Seg:
    def __init__(self, buf, end, s):
        self.s = s
        self.type = s['type']
        self.start, self.stop = s['start'], s['end']
        self.target, self.center, self.frame = s['target'], s['center'], s['frame']
        n = s['ea'] - s['ba'] + 1
        self.d = np.frombuffer(buf, dtype=end + 'f8', count=n, offset=(s['ba'] - 1) * 8)
        if self.type == 2:
            init, intlen, rsize, nrec = self.d[-4:]
            self.init, self.intlen, self.rsize, self.nrec = init, intlen, int(rsize), int(nrec)
            self.recs = self.d[:self.rsize * self.nrec].reshape(self.nrec, self.rsize)
        elif self.type in (9, 13):
            n_states = int(self.d[-1]); w = int(self.d[-2])
            self.n = n_states
            self.states = self.d[:6 * n_states].reshape(n_states, 6)
            self.epochs = self.d[6 * n_states:7 * n_states]
            self.win = (w + 1) if self.type == 9 else max(w, 2)
            if self.type == 13:
                self.win = min(max(w, 2) * 1, 8)
        else:
            raise ValueError('unsupported type %d' % self.type)

    def pos(self, et):
        if self.type == 2:
            i = int((et - self.init) // self.intlen)
            i = min(max(i, 0), self.nrec - 1)
            r = self.recs[i]
            mid, rad = r[0], r[1]
            nc = (self.rsize - 2) // 3
            x = (et - mid) / rad
            T = np.empty(nc); T[0] = 1; T[1] = x
            for k in range(2, nc): T[k] = 2 * x * T[k - 1] - T[k - 2]
            c = r[2:].reshape(3, nc)
            return c @ T
        # Lagrange on positions (type 9; type 13 近似)
        i = int(np.searchsorted(self.epochs, et))
        w = self.win
        lo = min(max(i - w // 2, 0), self.n - w)
        ep = self.epochs[lo:lo + w]; st = self.states[lo:lo + w, :3]
        out = np.zeros(3)
        for j in range(w):
            l = 1.0
            for m in range(w):
                if m != j: l *= (et - ep[m]) / (ep[j] - ep[m])
            out += l * st[j]
        return out

    def state_v(self, et):
        """type 9 の速度も Lagrange で。位置の数値微分で代用。"""
        h = 30.0
        return (self.pos(et + h) - self.pos(et - h)) / (2 * h)


def load_all():
    segs = []
    for p in sorted(glob.glob(SPK + '*.bsp')):
        sys.path.insert(0, HERE)
        from daf import read_segments
        ss, buf, end = read_segments(p)
        for s in ss:
            try:
                g = Seg(buf, end, s)
                g.name = os.path.basename(p)
                segs.append(g)
            except ValueError:
                pass
    return segs


SEGS = load_all()


def find(target, center, et, name=None, frame=None):
    for g in SEGS:
        if g.target == target and g.center == center and g.start <= et <= g.stop:
            if name and name not in g.name: continue
            if frame is not None and g.frame != frame: continue
            return g
    return None


def p_wrt(target, center, et, name=None, frame=None):
    g = find(target, center, et, name, frame)
    return None if g is None else g.pos(et)


def ssb(body, et):
    if body == 399: return p_wrt(399, 3, et) + p_wrt(3, 0, et)
    if body == 10: return p_wrt(10, 0, et)
    if body == 3: return p_wrt(3, 0, et)
    raise KeyError(body)


def earth_helio(et): return ssb(399, et) - ssb(10, et)


# ---- Kepler 再現(リュウグウ) ----
def kepler_from_state(r, v, mu=GM_SUN):
    rn = np.linalg.norm(r); h = np.cross(r, v); hn = np.linalg.norm(h)
    e_vec = np.cross(v, h) / mu - r / rn
    e = np.linalg.norm(e_vec)
    a = 1 / (2 / rn - v @ v / mu)
    n = math.sqrt(mu / a ** 3)
    p_hat = e_vec / e
    w_hat = h / hn
    q_hat = np.cross(w_hat, p_hat)
    # 真近点角 -> 離心近点角 -> 平均近点角
    nu = math.atan2((r @ q_hat), (r @ p_hat))
    E = 2 * math.atan2(math.sqrt(1 - e) * math.sin(nu / 2), math.sqrt(1 + e) * math.cos(nu / 2))
    M = E - e * math.sin(E)
    return dict(a=a, e=e, n=n, p=p_hat, q=q_hat, M0=M)


def kepler_pos(k, dt):
    M = k['M0'] + k['n'] * dt
    E = M
    for _ in range(40):
        E -= (E - k['e'] * math.sin(E) - M) / (1 - k['e'] * math.cos(E))
    x = k['a'] * (math.cos(E) - k['e'])
    y = k['a'] * math.sqrt(1 - k['e'] ** 2) * math.sin(E)
    return x * k['p'] + y * k['q']


def ryugu_helio(et, kep=None, et0=None):
    g = find(2162173, 10, et, name='ryugu_20180601')
    if g is None: g = find(2162173, 10, et, name='hpk_proximity')
    if g is not None: return g.pos(et)
    return kepler_pos(kep, et - et0)


# ---- 自転(PCK) ----
RA, DEC = math.radians(96.43112), math.radians(-66.38741)
W0, W1 = 274.16225, 1131.98280286  # deg, deg/day


def body_matrix(et):
    d = et / 86400.0
    W = math.radians((W0 + W1 * d) % 360.0)
    def Rz(a): c, s = math.cos(a), math.sin(a); return np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])
    def Rx(a): c, s = math.cos(a), math.sin(a); return np.array([[1, 0, 0], [0, c, s], [0, -s, c]])
    return Rz(W) @ Rx(math.pi / 2 - DEC) @ Rz(RA + math.pi / 2)


OBL = math.radians(23.4392911)
def to_ecl(v):
    c, s = math.cos(OBL), math.sin(OBL)
    return np.array([v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]])


def hp_frame_to_j2000(et):
    """HYB2_HP_FRAME: +Z = Ryugu->Earth, +X = Sun方向に最も近い軸(Ryugu基準)。"""
    ry = ryugu_helio(et)                      # Sun->Ryugu
    ea = earth_helio(et)                      # Sun->Earth
    z = ea - ry; z /= np.linalg.norm(z)
    sun = -ry; sun /= np.linalg.norm(sun)
    x = sun - (sun @ z) * z; x /= np.linalg.norm(x)
    y = np.cross(z, x)
    return np.column_stack([x, y, z]), ry


def craft_helio(et):
    # 地球基準(2014-2018.49) / 太陽基準(2019.85-) / リュウグウ+HPK(その間)
    g = find(-37, 399, et)
    if g is not None: return earth_helio(et) + g.pos(et)
    g = find(-37, 10, et)
    if g is not None: return g.pos(et)
    g = find(-37, 2162173, et, frame=-37900)
    if g is not None:
        M, ry = hp_frame_to_j2000(et)
        return ry + M @ g.pos(et)
    return None


def craft_body(et):
    """探査機位置(Ryugu固定座標, km)。SfM位置(固定座標)を優先、なければHPK。"""
    g = find(-37, 2162173, et, name='sfm_pos', frame=2162173)
    if g is not None: return g.pos(et)
    g = find(-37, 2162173, et, frame=-37900)
    if g is None: return None
    M, _ = hp_frame_to_j2000(et)
    inert = M @ g.pos(et)
    return body_matrix(et) @ inert


def sun_dir_body(et):
    ry = ryugu_helio(et)
    s = -ry / np.linalg.norm(ry)
    return body_matrix(et) @ s


if __name__ == '__main__':
    import datetime as dt
    def U(y, mo, d, h=0, mi=0): return dt.datetime(y, mo, d, h, mi, tzinfo=dt.timezone.utc).timestamp()
    et_a = utc_to_et(U(2019, 1, 1))
    g = find(2162173, 10, et_a, name='ryugu_20180601')
    r = g.pos(et_a); v = g.state_v(et_a)
    kep = kepler_from_state(r, v)
    print('Ryugu a=%.4f au e=%.4f period=%.3f yr' % (kep['a'] / AU, kep['e'], 2 * math.pi / kep['n'] / 86400 / 365.25))
    for (y, mo, d) in [(2018, 7, 1), (2019, 10, 1), (2019, 11, 1)]:
        et = utc_to_et(U(y, mo, d))
        try:
            rr = ryugu_helio(et); kk = kepler_pos(kep, et - et_a)
            print(y, mo, 'kepler誤差 %.0f km' % np.linalg.norm(rr - kk))
        except Exception as ex:
            print('skip', ex)
    # 軌道データ検証: TD1 の高度
    et = utc_to_et(U(2019, 2, 21, 22, 29))
    cb = craft_body(et)
    print('TD1 近傍 craft_body km', cb, '距離 m', None if cb is None else np.linalg.norm(cb) * 1000)
    et = utc_to_et(U(2018, 7, 1))
    cb = craft_body(et); print('2018-07-01 距離 km', np.linalg.norm(cb))
    print('craft_helio launch+1y', craft_helio(utc_to_et(U(2015, 12, 3))) / AU)


# ================= データ書き出し =================
def build():
    import datetime as dt
    def U(y, mo, d, h=0, mi=0): return dt.datetime(y, mo, d, h, mi, tzinfo=dt.timezone.utc).timestamp()
    global KEP, ET0
    et0 = utc_to_et(U(2019, 1, 1))
    g = find(2162173, 10, et0, name='ryugu_20180601')
    KEP = kepler_from_state(g.pos(et0), g.state_v(et0)); ET0 = et0
    # ryugu_helio をグローバルKepler対応に差し替え
    def rh(et):
        for nm in ('ryugu_20180601', 'hpk_proximity', 'approach_od'):
            gg = find(2162173, 10, et, name=nm)
            if gg is not None: return gg.pos(et)
        return kepler_pos(KEP, et - ET0)
    globals()['ryugu_helio'] = rh

    # ---- 1. 日次テーブル(黄道座標, AU) ----
    t0, t1 = U(2014, 12, 3), U(2026, 1, 1)
    rows = []; days = []
    d = t0
    while d <= t1:
        et = utc_to_et(d)
        ea = earth_helio(et); ry = rh(et); cr = craft_helio(et)
        c = to_ecl(cr) / AU if cr is not None else np.full(3, np.nan)
        ed = np.linalg.norm((cr if cr is not None else ry) - ea)
        rows.append(np.concatenate([c, to_ecl(ea) / AU, to_ecl(ry) / AU, [ed]]))
        days.append(d)
        d += 86400.0
    daily = np.array(rows, dtype=np.float32)
    # ---- 2. 近傍フェーズ: 探査機位置を「小惑星固定座標」で集め、固定座標で補間して慣性系(J2000, km)で保存 ----
    lo_et, hi_et = utc_to_et(U(2018, 6, 20)), utc_to_et(U(2019, 11, 25))
    samples = []  # (unix, body-fixed km)
    for x in SEGS:
        if x.type == 9 and x.frame == 2162173 and x.target == -37 and ('sfm_pos' in x.name or ('spc_pos' in x.name and 'v02' not in x.name)):
            for e, s_ in zip(x.epochs, x.states):
                if lo_et < e < hi_et: samples.append((et_to_unix(e), s_[:3].copy()))
        if x.type == 9 and x.frame == -37900 and 'hpk_20180627' in x.name:
            for e in np.arange(max(x.start, lo_et), min(x.stop, hi_et), 1800.0):
                Mh, _ = hp_frame_to_j2000(e)
                samples.append((et_to_unix(e), body_matrix(e) @ (Mh @ x.pos(e))))
    # 公表された着陸地点(タッチダウン)で空白を結ぶ。探査機位置データが公開kernelに無い区間の補間用
    import json as _j
    sp = _j.load(open(os.path.join(REPO, '06_timeline_text/ryugu_surface_points.json')))['mission_events']
    mesh = np.fromfile(OUT + 'ryugu_49k.bin', dtype='<i2', count=25350 * 3, offset=16).reshape(-1, 3) / 60.0 / 1000.0
    mu = mesh / np.linalg.norm(mesh, axis=1)[:, None]; mr = np.linalg.norm(mesh, axis=1)
    anchors = []
    for key, tt in (('td1_first_touchdown', U(2019, 2, 21, 22, 29)), ('td2_second_touchdown', U(2019, 7, 11, 1, 6))):
        lat = math.radians(sp[key]['latitude_deg']); lon = math.radians(sp[key]['longitude_deg'])
        u = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
        i = int(np.argmax(mu @ u)); anchors.append((tt, u * (mr[i] + 0.0018)))
    samples += anchors
    samples.sort(key=lambda a: a[0])
    ts = np.array([s_[0] for s_ in samples]); ps = np.array([s_[1] for s_ in samples])
    keep = np.concatenate([[True], np.diff(ts) > 1.0]); ts, ps = ts[keep], ps[keep]
    print('近傍サンプル', len(ts), '(うち固定アンカー', len(anchors), ')')
    grid = list(np.arange(U(2018, 6, 27), U(2019, 11, 20), 900.0))
    for (y, mo, dd, h, mi, before, after) in [(2019, 2, 21, 22, 29, 4 * 3600, 3600), (2019, 4, 5, 2, 36, 2 * 3600, 3600), (2019, 7, 11, 1, 6, 3 * 3600, 3600), (2018, 9, 21, 4, 6, 3 * 3600, 3600), (2018, 10, 3, 1, 57, 3 * 3600, 3600)]:
        c = U(y, mo, dd, h, mi)
        grid += list(np.arange(c - before, c + after, 60.0))
    grid = np.array(sorted(set(grid)))
    out_t = []; out_p = []
    for t in grid:
        i = np.searchsorted(ts, t)
        if i <= 0 or i >= len(ts): continue
        a_, b_ = ts[i - 1], ts[i]
        if b_ - a_ > 75 * 60: continue
        f = (t - a_) / (b_ - a_)
        pb = ps[i - 1] * (1 - f) + ps[i] * f                 # 固定座標で補間
        out_t.append(t); out_p.append(body_matrix(utc_to_et(t)).T @ pb)   # 慣性系(J2000)へ
    out_t = np.array(out_t, dtype=np.float64); out_p = np.array(out_p, dtype=np.float32)
    print('近傍グリッド', len(out_t), '距離範囲 km', np.linalg.norm(out_p, axis=1).min(), np.linalg.norm(out_p, axis=1).max())
    # 保存
    daily.tofile(OUT + 'ephem_daily.bin')
    out_t.tofile(OUT + 'ephem_prox_t.bin')
    out_p.tofile(OUT + 'ephem_prox_xyz.bin')
    meta = dict(
        daily_t0=t0, daily_step=86400.0, daily_n=len(daily),
        daily_cols=['craft_x_au', 'craft_y_au', 'craft_z_au', 'earth_x_au', 'earth_y_au', 'earth_z_au', 'ryugu_x_au', 'ryugu_y_au', 'ryugu_z_au', 'craft_earth_km'],
        prox_n=len(out_t), prox_t0=float(out_t[0]), prox_t1=float(out_t[-1]),
        pole_ra_deg=96.43112, pole_dec_deg=-66.38741, pm_w0_deg=274.16225, pm_rate_deg_per_day=1131.98280286,
        et_minus_utc_s=ET_MINUS_UTC, obliquity_deg=23.4392911, au_km=AU,
        sources=['SPICE hyb2_spice_v001 (DARTS)', 'hyb2_sfm_pos / hyb2_spc_pos (body-fixed craft positions)', 'hyb2_hpk (home-position keeping)', 'hyb2_de430_de440 (planets)', 'ryugu_v10.tpc (rotation)'],
        ryugu_kepler=dict(a_au=KEP['a'] / AU, e=KEP['e']),
    )
    json.dump(meta, open(OUT + 'ephem.json', 'w'), ensure_ascii=False, indent=1)
    print('daily rows', len(daily), 'craft valid', int(np.isfinite(daily[:, 0]).sum()))
    # 検証: 探査機最遠(地球距離)
    print('地球-探査機 最大 %.0f 万km, 2018-06-27 の距離 %.0f 万km' % (np.nanmax(daily[:, 9]) / 1e4, daily[int((U(2018, 6, 27) - t0) / 86400), 9] / 1e4))

if __name__ == '__main__' and len(sys.argv) > 1 and sys.argv[1] == 'build':
    build()
