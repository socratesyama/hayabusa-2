#!/usr/bin/env python3
"""P3-2: audit sc_table.bin against what is published about Hayabusa2's motion around Ryugu.
 - Home Position (HP, ~20 km) is a quasi-stationary hover on the Earth line (HP frame: Z = Ryugu->Earth, X toward the Sun side):
   in the INERTIAL sense the craft barely moves, so in the body-fixed frame it must circle once per rotation (7.63 h).
 - Checks: frame correctness (angle between craft position and Earth direction during HP), altitude levels per phase, data gaps."""
import os, sys, json, struct, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); from minispice import utc2et, et2utc
ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..')); D = os.path.join(ROOT, 'site', 'public', 'data')
b = open(f'{D}/sc_table.bin', 'rb').read(); hl = struct.unpack('<I', b[:4])[0]; h = json.loads(b[4:4+hl]); n = h['n']; o = 4 + hl
et = np.frombuffer(b, '<f8', n, o); o += n*8; pos = np.frombuffer(b, '<f4', n*3, o).reshape(n, 3).astype(float); o += n*12; gr = np.frombuffer(b, 'u1', n, o)
st = json.load(open(f'{D}/sun_table.json')); rot = json.load(open(f'{D}/rotation.json')); T = np.array(st['data']).reshape(-1, 8)
def body_dirs(e):
    f = (e - st['epoch_et0']) / st['step_s']; i = int(f); u = f - i; r = T[i]*(1-u) + T[i+1]*u
    ra, dec, W = np.radians(rot['pole_ra_deg']), np.radians(rot['pole_dec_deg']), np.radians(rot['W0_deg'] + rot['rate_deg_per_day']*e/86400)
    Rz = lambda a: np.array([[np.cos(a), np.sin(a), 0], [-np.sin(a), np.cos(a), 0], [0, 0, 1]]); Rx = lambda a: np.array([[1, 0, 0], [0, np.cos(a), np.sin(a)], [0, -np.sin(a), np.cos(a)]])
    M = Rz(W) @ Rx(np.pi/2 - dec) @ Rz(np.pi/2 + ra); s = M @ r[:3]; ea = M @ r[4:7]; return s/np.linalg.norm(s), ea/np.linalg.norm(ea)
# subsample: every ~3 h
idx = np.arange(0, n, 18); rows = []
for i in idx:
    e = et[i]; s, ea = body_dirs(e); p = pos[i]; r = np.linalg.norm(p); u = p/r
    rows.append((et2utc(e), r, np.degrees(np.arccos(np.clip(u@ea, -1, 1))), np.degrees(np.arccos(np.clip(u@s, -1, 1)))))
rows = [x for x in rows]
print('date        r_km   ang(sc,Earth)  ang(sc,Sun)   [every ~3 h, summarised per month by median]')
import collections; by = collections.defaultdict(list)
for t, r, ae, asn in rows: by[t.strftime('%Y-%m')].append((r, ae, asn))
for k in sorted(by): v = np.array(by[k]); print(k, 'n=%3d'%len(v), 'r median %7.2f km (min %6.3f max %7.2f)'%(np.median(v[:,0])/1000, v[:,0].min()/1000, v[:,0].max()/1000), ' ang_Earth med %5.1f deg  ang_Sun med %5.1f deg'%(np.median(v[:,1]), np.median(v[:,2])))
# HP-phase check: samples with r in 15..25 km
hp = np.array([(r, ae) for t, r, ae, asn in rows if 15000 < r < 25000]); print('\nHP-like samples (15-25 km): n=%d  ang(sc,Earth): median %.1f, 90%% %.1f deg'%(len(hp), np.median(hp[:,1]), np.percentile(hp[:,1], 90)))
print('null spans (no data):', len(h['null_spans_et'])); 
for a, c in h['null_spans_et'][:12]: print('  ', et2utc(a).isoformat(timespec='minutes'), '->', et2utc(c).isoformat(timespec='minutes'), '(%.1f h)'%((c-a)/3600))
print('coverage', et2utc(et[0]).isoformat(timespec='minutes'), '..', et2utc(et[-1]).isoformat(timespec='minutes'))
# sampling density
dt = np.diff(et); print('sample step: median %.0f s, max(non-gap) %.0f s'%(np.median(dt), dt[dt < 900].max()))
