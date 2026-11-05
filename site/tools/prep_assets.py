import numpy as np, os, json, glob, shutil, struct, io, datetime as dt, re
from PIL import Image
from scipy import ndimage

R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')) + '/'
OUT = R + 'site/data/'
os.makedirs(OUT + 'tex', exist_ok=True); os.makedirs(OUT + 'onc', exist_ok=True); os.makedirs(OUT + 'samples', exist_ok=True)

# ---------- 1. ONCベースマップ ----------
base = Image.open(R + '04_science_data/map_products/01_ONC_v-band_Basemap1/hyb2_onc_Global_01_l3dm_v06.jpg').convert('L')
base.save(OUT + 'tex/onc.jpg', quality=84, optimize=True)
print('onc.jpg', os.path.getsize(OUT + 'tex/onc.jpg') // 1024, 'KB', base.size)

# ---------- 2. 熱慣性マップ(cividisを逆引き) ----------
from matplotlib import colormaps
cmap = colormaps['cividis'](np.linspace(0, 1, 256))[:, :3] * 255
ti = Image.open(R + '04_science_data/map_products/07_TIR_Thermal_Inertia/Thermal_Inertia_Map.jpg').convert('RGB').resize((1800, 900), Image.NEAREST)
a = np.asarray(ti).astype(np.float32)
valid = a.sum(2) > 45
from scipy.spatial import cKDTree
idx = cKDTree(cmap).query(a.reshape(-1, 3))[1].reshape(900, 1800).astype(np.float32)   # 0..255 -> 10..400 tiu
val = np.where(valid, idx, 0)
w = valid.astype(np.float32)
sig = 14
num = ndimage.gaussian_filter(val * w, sig); den = ndimage.gaussian_filter(w, sig)
filled = np.where(den > 1e-4, num / np.maximum(den, 1e-4), idx[valid].mean())
filled = np.where(valid, val, filled)
# 経度方向の端で連続になるよう wrap 処理は省略(ぼかしのみ)
out = np.stack([np.clip(filled, 0, 255), valid * 255.0, np.zeros_like(filled)], 2).astype(np.uint8)
Image.fromarray(out).save(OUT + 'tex/ti.png', optimize=True)
tiu = 10 + (idx[valid] / 255.0) * 390
print('熱慣性 実測画素 %.0f%%  中央値 %.0f tiu (10-90%%: %.0f-%.0f)' % (valid.mean() * 100, np.median(tiu), np.percentile(tiu, 10), np.percentile(tiu, 90)))
print('ti.png', os.path.getsize(OUT + 'tex/ti.png') // 1024, 'KB')

# ---------- 3. ONCギャラリー(各運用日から等間隔に最大N枚) ----------
G = R + '02_onc_images/official_gallery_jaxa/'
labels = {
    'nav20180731': ('2018-07-31', '高度約6kmからの立体視観測'), 'nav20180805': ('2018-08-07', '低高度の連続観測(BOX-C)'),
    'nav20180911': ('2018-09-11', 'タッチダウンのリハーサル1'), 'nav20180920': ('2018-09-21', 'ローバ MINERVA-II1 の分離'),
    'nav20181002': ('2018-10-03', '着陸機 MASCOT の分離'), 'nav20181014': ('2018-10-14', 'タッチダウンのリハーサル2'),
    'nav20181024': ('2018-10-24', 'タッチダウンのリハーサル3'), 'nav20190221': ('2019-02-22', '第1回タッチダウン'),
    'nav20190307': ('2019-03-07', 'タッチダウン跡の確認'), 'nav20190404': ('2019-04-05', '衝突装置(SCI)の運用'),
    'nav20190424': ('2019-04-25', '人工クレーターの確認'), 'nav20190515': ('2019-05-16', '第2回タッチダウンのリハーサル1'),
    'nav20190529': ('2019-05-30', '第2回タッチダウンのリハーサル3'), 'nav20190612': ('2019-06-13', '第2回タッチダウンの最終確認'),
    'nav20190710': ('2019-07-11', '第2回タッチダウン')}
MAXPER = 20
man = []
for d in sorted(glob.glob(G + 'nav*')):
    nav = os.path.basename(d)
    fs = sorted(glob.glob(d + '/*.jpg'))
    pick = fs if len(fs) <= MAXPER else [fs[int(round(i * (len(fs) - 1) / (MAXPER - 1)))] for i in range(MAXPER)]
    for f in pick:
        m = re.match(r'(\d{12})\.jpg', os.path.basename(f))
        if not m: continue
        t = dt.datetime.strptime(m.group(1), '%Y%m%d%H%M').replace(tzinfo=dt.timezone.utc)
        name = nav + '_' + m.group(1) + '.jpg'
        shutil.copy(f, OUT + 'onc/' + name)
        man.append(dict(f=name, t=int(t.timestamp()), nav=nav))
json.dump(dict(items=man, labels={k: dict(date=v[0], title=v[1]) for k, v in labels.items()}), open(OUT + 'onc_manifest.json', 'w'), ensure_ascii=False)
print('ONC画像', len(man), '枚', sum(os.path.getsize(OUT + 'onc/' + m['f']) for m in man) // 1024, 'KB')

# ---------- 4. 試料: 顕微鏡画像とFTIR ----------
S = R + '04_science_data/ryugu_samples/'
grains = {}
for g, (chamber, site) in {'A0002': ('A', 'TD1'), 'A0004': ('A', 'TD1'), 'C0002': ('C', 'TD2'), 'C0003': ('C', 'TD2'), 'C0004': ('C', 'TD2')}.items():
    mic = sorted(glob.glob(S + g + '/%s_microscope-image_*_resize.png' % g))
    if not mic: continue
    im = Image.open(mic[0]).convert('RGB'); im.thumbnail((720, 720))
    im.save(OUT + 'samples/%s.jpg' % g, quality=82, optimize=True)
    # FTIR スペクトル: 最初の stack を 2.3-4.2 µm で間引き
    cands = sorted(glob.glob(S + g + '/ftir/*/%s_*stack*.csv' % g)) or sorted(glob.glob(S + g + '/ftir/*/%s_*.csv' % g))
    spec = None
    for c in cands[:3]:
        xs, ys = [], []
        ok = False
        for line in open(c, errors='ignore'):
            if line.startswith('XYDATA'): ok = True; continue
            if ok:
                p = line.strip().split(',')
                if len(p) == 2:
                    try: xs.append(float(p[0])); ys.append(float(p[1]))
                    except ValueError: pass
        if len(xs) > 1000:
            x = np.array(xs); y = np.array(ys)
            m = (x >= 2.3) & (x <= 4.2); x, y = x[m][::-1], y[m][::-1]
            k = max(len(x) // 190, 1); x, y = x[::k], y[::k]
            # 2.5 µm の値で規格化
            ref = np.interp(2.5, x, y)
            spec = dict(src=os.path.basename(c), x=[round(float(v), 3) for v in x], y=[round(float(v / ref), 4) for v in y])
            break
    grains[g] = dict(chamber=chamber, site=site, img='samples/%s.jpg' % g, spec=spec, microscope=os.path.basename(mic[0]))
    print(g, 'img', os.path.getsize(OUT + 'samples/%s.jpg' % g) // 1024, 'KB', 'spec', None if not spec else (len(spec['x']), 'pts', spec['src']))
json.dump(grains, open(OUT + 'samples.json', 'w'), ensure_ascii=False)

# ---------- 5. 探査機モデル(頂点クラスタリングで軽量化、平均色つき) ----------
glb = open(R + '11_spacecraft_model/hayabusa2_spacecraft.glb', 'rb').read()
jl, _ = struct.unpack('<I4s', glb[12:20]); J = json.loads(glb[20:20 + jl])
off = 20 + jl; bl, _ = struct.unpack('<I4s', glb[off:off + 8]); BIN = glb[off + 8:off + 8 + bl]
def acc(i):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    comp = {5126: ('f4', 4), 5123: ('u2', 2), 5125: ('u4', 4)}[a['componentType']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return np.frombuffer(BIN, dtype='<' + comp[0], count=a['count'] * n, offset=o).reshape(-1, n)
def tex_color(ti):
    img = J['images'][J['textures'][ti]['source']]; bv = J['bufferViews'][img['bufferView']]
    im = Image.open(io.BytesIO(BIN[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])).convert('RGB').resize((16, 16))
    return np.asarray(im).reshape(-1, 3).mean(0) / 255.0
mat_col = []
for m in J['materials']:
    pb = m['pbrMetallicRoughness']; f = np.array(pb.get('baseColorFactor', [1, 1, 1, 1])[:3])
    if 'baseColorTexture' in pb: f = f * tex_color(pb['baseColorTexture']['index'])
    mat_col.append(np.clip(f, 0, 1))
tri_pos = []; tri_col = []
for node in J['nodes']:
    mesh = J['meshes'][node['mesh']]
    M = np.eye(4)
    if 'matrix' in node: M = np.array(node['matrix']).reshape(4, 4).T
    else:
        t = np.array(node.get('translation', [0, 0, 0])); s = np.array(node.get('scale', [1, 1, 1]))
        M[:3, :3] = np.diag(s); M[:3, 3] = t
        if 'rotation' in node:
            x, y, z, w = node['rotation']
            Rm = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
            M[:3, :3] = Rm @ np.diag(s)
    for prim in mesh['primitives']:
        P = acc(prim['attributes']['POSITION']).astype(np.float64); I = acc(prim['indices']).reshape(-1, 3)
        P = (M[:3, :3] @ P.T).T + M[:3, 3]
        diag = np.linalg.norm(P.max(0) - P.min(0))
        cell = max(diag / 28.0, 0.012)
        key = np.floor((P - P.min(0)) / cell).astype(np.int64)
        kid = key[:, 0] * 1000003 + key[:, 1] * 1009 + key[:, 2]
        uniq, inv = np.unique(kid, return_inverse=True)
        cen = np.zeros((len(uniq), 3)); cnt = np.zeros(len(uniq))
        np.add.at(cen, inv, P); np.add.at(cnt, inv, 1); cen /= cnt[:, None]
        T = inv[I]; good = (T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])
        T = T[good]
        if len(T) == 0 or len(P) < 8:  # ごく小さい部品は元のまま
            T = I; cen = P
        col = mat_col[prim.get('material', 0)]
        tri_pos.append(cen[T].reshape(-1, 3)); tri_col.append(np.tile(col, (len(T) * 3, 1)))
pos = np.concatenate(tri_pos).astype('<f4'); colr = (np.concatenate(tri_col) * 255).astype('u1')
print('探査機', len(pos) // 3, '三角形', '範囲 m', pos.min(0), pos.max(0))
with open(OUT + 'craft.bin', 'wb') as fh:
    fh.write(struct.pack('<I', len(pos))); fh.write(pos.tobytes()); fh.write(colr.tobytes())
print('craft.bin', os.path.getsize(OUT + 'craft.bin') // 1024, 'KB')


# ---------- 6. 低緯度の高解像度ベースマップ(位置合わせ済み: 中心緯度 -1.6°, 経度ずれなし) ----------
Image.MAX_IMAGE_PIXELS = None
hi = Image.open(R + '04_science_data/map_products/03_ONC_v-band_Low-Latitude_High-Resolution_Basemap/hyb2_onc_20181003_MSC_l3dm_v06.jpg').convert('L')
W0, H0 = hi.size
ppd = W0 / 360.0; span = H0 / ppd
lat_c = -1.6
hi8 = hi.resize((8192, int(round(H0 * 8192 / W0))), Image.LANCZOS)
hi8.save(OUT + 'tex/onc_hi.jpg', quality=80, optimize=True)
json.dump(dict(lat_top=lat_c + span / 2, lat_bottom=lat_c - span / 2, width=hi8.size[0], height=hi8.size[1], px_per_deg=hi8.size[0] / 360.0),
          open(OUT + 'tex/onc_hi.json', 'w'))
print('onc_hi.jpg', hi8.size, os.path.getsize(OUT + 'tex/onc_hi.jpg') // 1024, 'KB', 'lat', lat_c + span / 2, lat_c - span / 2)
