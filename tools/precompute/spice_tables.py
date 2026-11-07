#!/usr/bin/env python3
"""§3.2 sun_table.json + rotation.json  (pure-numpy SPK reader; see minispice.py)
Sun/Earth direction in J2000 inertial frame, Ryugu-centred, 6 h step 2014-12-03..2027-12-31.
2018-06..2019-12 : SPK type 9 ephemeris of Ryugu (class A/B). Outside: two-body Kepler propagation
from the 2019-01-01 SPK state (class D, approximate). Earth/Sun from de430 (type 2)."""
import os, json, sys, csv
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from minispice import *
ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
SP = os.path.join(ROOT, '03_spice', 'spk'); OUT = os.path.join(ROOT, 'site', 'public', 'data')
os.makedirs(OUT, exist_ok=True)
AU = 149597870.7
GM_SUN = 1.32712440041e11  # km^3/s^2

ry = SPK(os.path.join(SP, '2162173_ryugu_20180601-20191230_0060_20181221.bsp'))
de = SPK(os.path.join(SP, 'hyb2_de430_de440.bsp'))
def seg_state(spk, tgt, et):
    s = spk.find(tgt, et); return None if s is None else spk.state(s, et)
def sun_ssb(et): return seg_state(de, 10, et)[:3]
def earth_ssb(et): return seg_state(de, 3, et)[:3] + seg_state(de, 399, et)[:3]
def ryugu_helio(et):  # J2000, relative to Sun
    s = ry.find(2162173, et); return None if s is None else ry.state(s, et)[:3]

# --- rotation constants (ryugu_v10.tpc)
tpc = open(os.path.join(ROOT, '03_spice', 'pck', 'ryugu_v10.tpc')).read()
def grab(key):
    import re
    m = re.search(key + r"\s*=\s*\(([^)]*)\)", tpc); return [float(x.replace('D', 'e')) for x in m.group(1).split()]
RA = grab('BODY2162173_POLE_RA')[0]; DEC = grab('BODY2162173_POLE_DEC')[0]
W0, WD = grab('BODY2162173_PM')[:2]
rotation = dict(epoch='J2000 TDB', pole_ra_deg=RA, pole_dec_deg=DEC, W0_deg=W0, rate_deg_per_day=WD,
                period_h=360.0 / WD * 24, retrograde_note='IAU north pole; Ryugu rotates retrograde w.r.t. orbital angular momentum',
                source='03_spice/pck/ryugu_v10.tpc', certainty='A')
json.dump(rotation, open(os.path.join(OUT, 'rotation.json'), 'w'), indent=1)

def Rz(a): c, s = np.cos(a), np.sin(a); return np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])
def Rx(a): c, s = np.cos(a), np.sin(a); return np.array([[1, 0, 0], [0, c, s], [0, -s, c]])
def j2000_to_body(et):
    d = et / 86400.0
    return Rz(np.radians(W0 + WD * d)) @ Rx(np.radians(90 - DEC)) @ Rz(np.radians(90 + RA))

# --- Kepler propagation from 2019-01-01
et_ref = utc2et('2019-01-01T00:00:00')
r0 = ryugu_helio(et_ref); dt = 30.0
v0 = (ryugu_helio(et_ref + dt) - ryugu_helio(et_ref - dt)) / (2 * dt)
def kepler(et):
    r0n = np.linalg.norm(r0); h = np.cross(r0, v0)
    a = 1 / (2 / r0n - v0 @ v0 / GM_SUN); n = np.sqrt(GM_SUN / a**3)
    e_vec = np.cross(v0, h) / GM_SUN - r0 / r0n; e = np.linalg.norm(e_vec)
    # universal-variable via eccentric anomaly
    P = e_vec / e; Q = np.cross(h / np.linalg.norm(h), P)
    E0 = np.arctan2((r0 @ Q) / (a * np.sqrt(1 - e**2)), (r0 @ P) / a + e); M0 = E0 - e * np.sin(E0)
    M = M0 + n * (et - et_ref); E = M
    for _ in range(40): E = E - (E - e * np.sin(E) - M) / (1 - e * np.cos(E))
    return a * (np.cos(E) - e) * P + a * np.sqrt(1 - e**2) * np.sin(E) * Q
def ryugu_helio_any(et):
    r = ryugu_helio(et)
    return (r, 'spk') if r is not None else (kepler(et), 'kepler')

# validate Kepler vs SPK over 2018-06..2019-12
errs = []
for d in range(0, 500, 20):
    et = utc2et('2018-07-01T00:00:00') + d * 86400; r = ryugu_helio(et)
    if r is not None: errs.append(np.linalg.norm(kepler(et) - r) / np.linalg.norm(r))
print('Kepler-vs-SPK max rel err (2018-19):', max(errs))

start = utc2et('2014-12-03T00:00:00'); n = int((utc2et('2027-12-31T00:00:00') - start) / 21600) + 1
rows = []; src = []
for i in range(n):
    et = start + i * 21600
    rh, s = ryugu_helio_any(et)
    sun_v = -rh                                   # Ryugu -> Sun (J2000)
    earth_helio = earth_ssb(et) - sun_ssb(et)
    ear_v = earth_helio - rh                      # Ryugu -> Earth
    ds = np.linalg.norm(sun_v); de_ = np.linalg.norm(ear_v)
    rows.append([*(sun_v / ds), ds / AU, *(ear_v / de_), de_ / AU]); src.append(0 if s == 'spk' else 1)
rows = np.array(rows)
spk_idx = [i for i, s in enumerate(src) if s == 0]
tbl = dict(epoch_et0=start, step_s=21600, n=n, columns=['sx', 'sy', 'sz', 'sun_au', 'ex', 'ey', 'ez', 'earth_au'],
           frame='J2000 inertial, Ryugu-centred (unit vectors, distances in AU)',
           data=np.round(rows, 5).flatten().tolist(),
           spk_range_utc=[et2utc(start + spk_idx[0] * 21600).isoformat(), et2utc(start + spk_idx[-1] * 21600).isoformat()],
           note='Rows outside spk_range_utc are two-body Kepler propagation (certainty D); inside are SPK (A).',
           certainty='C', source='03_spice (ryugu SPK type 9, de430/de440)')
json.dump(tbl, open(os.path.join(OUT, 'sun_table.json'), 'w'), separators=(',', ':'))

# --- verification vs RyuguViewingConditionRoughEstimate.csv
def sub_lonlat(vj, et):
    b = j2000_to_body(et) @ (vj/np.linalg.norm(vj)); return np.degrees(np.arctan2(b[1], b[0])) % 360, np.degrees(np.arcsin(b[2]))
cs = list(csv.reader(open(os.path.join(ROOT, '02_onc_images', 'onc_bundle_v03c', 'RyuguViewingConditionRoughEstimate.csv'))))[1:]
maxdl = maxdb = 0; cnt = 0
for r in cs[::40]:
    et = utc2et(r[0]); rh = ryugu_helio(et)
    if rh is None: continue
    lon, lat = sub_lonlat(-rh, et); dl = abs((lon - float(r[5]) + 180) % 360 - 180); db = abs(lat - float(r[6]))
    maxdl = max(maxdl, dl); maxdb = max(maxdb, db); cnt += 1
print(f'verify {cnt} rows: max dLon={maxdl:.3f} deg, max dLat={maxdb:.3f} deg')
assert maxdl < 5 and maxdb < 5, 'sub-solar point disagrees with CSV (>5 deg)'
