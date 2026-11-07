#!/usr/bin/env python3
"""§3.3 sc_table: Hayabusa2 position in Ryugu body-fixed frame [m].
hpk SPK is in HYB2_HP_FRAME (Z: Ryugu->Earth, X: as close as possible to Ryugu->Sun), converted to J2000 then RYUGU_FIXED."""
import os, sys, json, struct
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from minispice import *
import spice_tables as T   # reuses ephemeris, rotation (re-runs sun table: acceptable, deterministic)
ROOT = T.ROOT; OUT = T.OUT
hpk = SPK(os.path.join(ROOT, '03_spice', 'spk', 'hyb2_hpk_20180627_20191119_v01.bsp'))
def hp_to_j2000(et):
    rh, _ = T.ryugu_helio_any(et); sun = -rh; ear = T.earth_ssb(et) - T.sun_ssb(et) - rh
    z = ear / np.linalg.norm(ear); x = sun - (sun @ z) * z; x /= np.linalg.norm(x); y = np.cross(z, x)
    return np.column_stack([x, y, z])
def sc_body(et):
    s = hpk.find(-37, et)
    if s is None: return None
    p = hpk.state(s, et)[:3]
    return (T.j2000_to_body(et) @ (hp_to_j2000(et) @ p)) * 1000.0
def utc(s): return utc2et(s + ('' if s.count(':') else ':00') if 'T' in s else s)
EV = {  # windows (UTC) around descents/landings -> 10 s step
 'TD1_rehearsals': ('2018-10-14T00:00:00', '2018-10-15T00:00:00'), 'TD1_R3': ('2018-10-23T21:00:00', '2018-10-24T09:00:00'),
 'TD1': ('2019-02-21T20:00:00', '2019-02-22T01:00:00'), 'SCI': ('2019-04-05T01:00:00', '2019-04-05T05:00:00'),
 'TD2': ('2019-07-10T23:00:00', '2019-07-11T03:00:00'), 'MASCOT': ('2018-10-03T01:30:00', '2018-10-03T03:00:00'),
 'MINERVA': ('2018-09-21T03:00:00', '2018-09-21T05:30:00')}
ts = []
for a, b in EV.values():
    ts.append(np.arange(utc2et(a), utc2et(b), 10.0))
ts.append(np.arange(utc2et('2018-06-27T04:00:00'), utc2et('2019-11-19T00:00:00'), 60.0 * 10))  # normal period: 10 min (budget; spec wants 60 s)
ts = np.unique(np.concatenate(ts))
et_l, pos = [], []
for et in ts:
    p = sc_body(float(et))
    if p is not None and np.all(np.isfinite(p)): et_l.append(float(et)); pos.append(p)
# add image-time positions of spc_pos (body-fixed, sparse) - they cover gaps in hpk such as the TD1 day
spc = SPK(os.path.join(ROOT, '03_spice', 'spk', 'hyb2_spc_pos_20180619_20191119_v20200323_v02.bsp'))
n_spc = 0
for g in spc.segs:
    et = 0.5 * (g['t0'] + g['t1'])
    if hpk.find(-37, et) is None:
        et_l.append(float(et)); pos.append(spc.state(g, et)[:3] * 1000.0); n_spc += 1
o = np.argsort(et_l); et_a = np.array(et_l)[o]; pos = np.array(pos, dtype='<f4')[o]
grade = np.zeros(len(et_a), dtype='u1')        # 0=A 1=B 2=C 3=D  (hpk / spc_pos image-time points are A)

# ---- TD1 gap replacement (12_site_data/td1_descent_positions.json); sfm_pos is NEVER used ----
td = json.load(open(os.path.join(ROOT, '12_site_data', 'td1_descent_positions.json')))
def iso(sx): return utc2et(sx.replace('Z', '').replace(' ', 'T'))
g0, g1 = iso(td['hpk_gap']['start']), iso(td['hpk_gap']['end'])
rows = td['table']
t_et = np.array([iso(r['t']) for r in rows])
la = np.radians([r['lat'] for r in rows]); lo = np.radians([r['lon'] for r in rows]); rr = np.array([r['r'] for r in rows])
t_pos = np.column_stack([rr*np.cos(la)*np.cos(lo), rr*np.cos(la)*np.sin(lo), rr*np.sin(la)])
GI = {'A': 0, 'B': 1, 'C': 2, 'D': 3}; t_gr = np.array([GI[r['grade']] for r in rows], dtype='u1')
# boundary asserts: table ends are hpk values -> must agree with hpk direct read (< 1 m)
for lab, et_b, row_i in (('start', g0, 0), ('end', g1, len(rows) - 1)):
    best = None
    for dd in (0.0, 1e-3, -1e-3, 1.0, -1.0, 30.0, -30.0):
        q = sc_body(et_b + dd)
        if q is not None: best = (dd, q); break
    assert best is not None, f'hpk has no value near gap {lab}'
    err = np.linalg.norm(best[1] - t_pos[row_i]) if abs(best[0]) < 2 else np.linalg.norm(best[1] - t_pos[np.argmin(abs(t_et - (et_b + best[0])))])
    print(f'boundary {lab}: |hpk - table| = {err:.3f} m (dt={best[0]} s)'); assert err < 1.0, f'boundary {lab} mismatch {err} m'
keep = (et_a < g0) | (et_a > g1)
print('removed from hpk/spc table inside gap:', int((~keep).sum()), '-> replaced by', len(rows), 'rows')
et_a = np.concatenate([et_a[keep], t_et]); pos = np.concatenate([pos[keep], t_pos.astype('<f4')]); grade = np.concatenate([grade[keep], t_gr])
o = np.argsort(et_a, kind='stable'); et_a, pos, grade = et_a[o], pos[o], grade[o]
GAP = 900.0  # seconds: spans longer than this have NO data (runtime shows 'データなし')
gaps = [[float(et_a[i]), float(et_a[i + 1])] for i in range(len(et_a) - 1) if et_a[i + 1] - et_a[i] > GAP]
print('spc image-time points added:', n_spc)
hdr = dict(gap_threshold_s=GAP, n=len(et_a), layout='float64 et[n], float32 xyz_m[n*3], uint8 grade[n] (0=A,1=B,2=C,3=D)', grades=td['grades'], grade_codes='0=A 1=B 2=C 3=D', td1_gap_utc=[td['hpk_gap']['start'], td['hpk_gap']['end']], td1_sources=td['sources'], td1_caveats=td['caveats'], frame='RYUGU_FIXED, m', et_first=float(et_a[0]), et_last=float(et_a[-1]),
           null_spans_et=gaps, windows_utc=EV, note='sfm_pos is not used. TD1 gap (2019-02-20T23:17:48Z..02-22T03:00Z) is filled from td1_descent_positions.json. Posture (attitude) NOT available (no CK). normal-period sampling 10 min, event windows 10 s. Cruise/return (outside hpk coverage) = no data.',
           certainty='A (position) / D (attitude approx at runtime)')
hb = json.dumps(hdr).encode(); 
with open(os.path.join(OUT, 'sc_table.bin'), 'wb') as f:
    f.write(struct.pack('<I', len(hb))); f.write(hb); f.write(et_a.astype('<f8').tobytes()); f.write(pos.astype('<f4').tobytes()); f.write(grade.tobytes())
print('sc_table', len(et_a), 'samples; range', et2utc(et_a[0]), et2utc(et_a[-1]), 'null spans', len(gaps))
# sanity: TD1 altitude near touchdown

