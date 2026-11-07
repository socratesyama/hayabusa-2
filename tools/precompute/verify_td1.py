#!/usr/bin/env python3
"""T5 verification of the TD1 section of site/public/data/sc_table.bin (reads the BINARY, i.e. what the site reads)."""
import os, sys, json, struct
import numpy as np
sys.path.insert(0, os.path.dirname(__file__)); from minispice import utc2et
ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
b = open(os.path.join(ROOT, 'site', 'public', 'data', 'sc_table.bin'), 'rb').read(); hl = struct.unpack('<I', b[:4])[0]; h = json.loads(b[4:4+hl]); n = h['n']; o = 4 + hl
et = np.frombuffer(b, '<f8', n, o); o += n*8; pos = np.frombuffer(b, '<f4', n*3, o).reshape(n, 3); o += n*12; gr = np.frombuffer(b, 'u1', n, o)
U = lambda s: utc2et(s.replace('Z', ''))
def at(t):
    e = U(t); i = int(np.argmin(abs(et - e))); return i, float(et[i] - e)
ok = True
def chk(name, cond, info=''):
    global ok; ok &= bool(cond); print(('PASS ' if cond else 'FAIL ') + name, info)
tbl = json.load(open(os.path.join(ROOT, '12_site_data', 'td1_descent_positions.json')))
R_site = tbl['td1_site']['surface_radius_m']
# 2 touchdown row
i, dt = at('2019-02-21T22:29:10Z'); alt = np.linalg.norm(pos[i]) - R_site
chk('2 grade B @22:29:10', gr[i] == 1 and abs(dt) < 1, f'grade={gr[i]} dt={dt:.2f}s')
rowc = next(r for r in tbl['table'] if r['t'] == '2019-02-21T22:29:10Z'); chk('2 alt_local ~2.0 m (table)', abs(rowc['alt_local'] - 2.0) < 0.6, f"alt_local={rowc['alt_local']} (|r|-{R_site}={alt:.2f})")
# 3 monotonic r 04:00..22:29
sel = (et >= U('2019-02-21T04:00:00Z')) & (et <= U('2019-02-21T22:29:10Z')); r = np.linalg.norm(pos[sel], axis=1)
worst = float(np.max(np.maximum.accumulate(-r)[:] * -1 - r)) if False else float(max(r[j] - r[:j].min() for j in range(1, len(r))))
chk('3 r monotonically decreasing (+5 m tolerance)', worst <= 5.0, f'max rise {worst:.2f} m over {sel.sum()} rows')
# 4 free-fall consistency 22:27:29 -> 22:29:10
i0, _ = at('2019-02-21T22:27:29Z'); i1, _ = at('2019-02-21T22:29:10Z'); T = et[i1] - et[i0]; d = float(np.linalg.norm(pos[i0]) - np.linalg.norm(pos[i1]))
g = 1.17e-4; v_dv = 0.07; fall_max = v_dv * T + 0.5 * g * T**2
chk('4 descent distance <= dV 7 cm/s * T + g T^2/2', d <= fall_max * 1.05 + 0.5, f'T={T:.0f}s drop={d:.2f} m, free-fall bound={fall_max:.2f} m (8.5 m hover -> ~2 m)')
# 5 CAM-H cross-check 22:30:30
i, dt = at('2019-02-21T22:30:30Z'); a = np.linalg.norm(pos[i]) - R_site
chk('5 alt_local@22:30:30 ~ 50.6 m (49.6 + 1.0 offset)', abs(a - 50.6) < 6, f'alt={a:.1f} m, grade={"ABCD"[gr[i]]}, dt={dt:.1f}s')
# 1 boundaries already asserted at build; report grades around the gap
print('grade counts in table:', {k: int((gr == v).sum()) for k, v in dict(A=0, B=1, C=2, D=3).items()})
sys.exit(0 if ok else 1)
