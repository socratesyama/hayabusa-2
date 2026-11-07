#!/usr/bin/env python3
"""§3.6 gravity tables -> Float32 bin + 720x360 lat/lon -> plate lookup grid."""
import os, json, numpy as np
ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'site', 'public', 'data'); os.makedirs(OUT, exist_ok=True)
G = 6.67259e-11
for tag, fn in (('763', 'gravity_coefficients_SFM_49k_7.63.txt'), ('340', 'gravity_coefficients_SFM_49k_3.40.txt')):
    rows = np.loadtxt(os.path.join(ROOT, '01_shape_models', fn), comments='#')
    assert rows.shape == (49152, 20), rows.shape
    # cols: 0 id,1-3 center km,4 lon,5 lat,6-8 CRef,9-11 attract,12 Gpot,13 Rpot,14 Tpot,15 slope,16-18 normal,19 area
    lon, lat = rows[:, 4], rows[:, 5]
    rec = np.column_stack([lat, lon, rows[:, 9:12], rows[:, 6:9], rows[:, 12], rows[:, 13], rows[:, 15], rows[:, 1:4] * 1000]).astype('<f4')
    rec.tofile(os.path.join(OUT, f'gravity_{tag}.bin'))
    # lookup: nearest plate center by direction (use unit centres)
    c = rows[:, 1:4]; cn = c / np.linalg.norm(c, axis=1, keepdims=True)
    la = np.radians(90 - (np.arange(360) + 0.5) * 0.5); lo = np.radians((np.arange(720) + 0.5) * 0.5)
    grid = np.zeros((360, 720), dtype='<u4')
    for j in range(360):
        d = np.stack([np.cos(la[j]) * np.cos(lo), np.cos(la[j]) * np.sin(lo), np.full_like(lo, np.sin(la[j]))], 1)
        grid[j] = np.argmax(d @ cn.T, axis=1)
    grid.tofile(os.path.join(OUT, f'gravity_grid_{tag}.bin'))
    Gp = rows[:, 12]; r = np.linalg.norm(c, axis=1) * 1000
    gm_eff = float(np.mean(Gp * r))
    esc = np.sqrt(2 * (Gp + rows[:, 13]))
    json.dump(dict(plates=49152, density=1200, period_h=float(tag) / 100 if tag == '340' else 7.63, G=G,
        record_floats=['lat', 'lon', 'ax', 'ay', 'az', 'cx', 'cy', 'cz', 'Gpot', 'Rpot', 'slope_deg', 'px_m', 'py_m', 'pz_m'],
        grid='uint32 720x360 (0.5 deg, row0 = +90 lat, col0 = lon 0), values = plate index',
        gm_effective_m3s2=gm_eff, escape_cm_s=dict(min=float(esc.min() * 100), max=float(esc.max() * 100)),
        certainty='B', source='01_shape_models/' + fn), open(os.path.join(OUT, f'gravity_{tag}.json'), 'w'), indent=1)
    print(tag, 'GM_eff', gm_eff, 'esc cm/s', esc.min() * 100, esc.max() * 100)
    if tag == '763':  # TD1 check
        la0, lo0 = 4.3, 206.47
        j = int((90 - la0) / 0.5); i = int(lo0 / 0.5); p = grid[j, i]
        print('TD1 plate', p, 'escape cm/s', esc[p] * 100, '|g| mm/s2', np.linalg.norm(rows[p, 9:12] + rows[p, 6:9]) * 1000)
