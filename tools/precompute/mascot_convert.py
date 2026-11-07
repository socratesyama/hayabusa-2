#!/usr/bin/env python3
"""§3.5 MASCOT conversion: MASCAM VIC->PNG(+manifest), MARA/MAG tab->JSON, SPK lander position, MAG impact detection."""
import os, re, sys, json, glob, datetime as dt
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from minispice import SPK, utc2et, et2utc
ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
D = os.path.join(ROOT, 'site', 'public', 'data'); A = os.path.join(ROOT, 'site', 'public', 'assets', 'mascam')
os.makedirs(D, exist_ok=True); os.makedirs(A, exist_ok=True)
M = os.path.join(ROOT, '05_mascot')

def tag(x, name):
    m = re.search(r'<%s>([^<]*)</%s>' % (name, name), x); return m.group(1).strip() if m else None

# ---- 1,4 MASCAM
man = []; skipped = []
for vic in sorted(glob.glob(os.path.join(M, 'mascam_data_calibrated', '*', '*.vic'))):
    base = os.path.basename(vic)[:-4]; phase = os.path.basename(os.path.dirname(vic))
    try:
        raw = open(vic, 'rb').read()
        hdr = raw[:4096].decode('latin1'); nl = int(re.search(r'NL=(\d+)', hdr)[1]); ns = int(re.search(r'NS=(\d+)', hdr)[1])
        lblsize = int(re.search(r'LBLSIZE=(\d+)', hdr)[1]); recsize = int(re.search(r'RECSIZE=(\d+)', hdr)[1])
        off = lblsize  # label + binary header (NLB=0)
        arr = np.frombuffer(raw, dtype='<f4', count=nl * ns, offset=off).reshape(nl, ns).copy()
        arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
        lo, hi = np.percentile(arr, [0.5, 99.5]); hi = max(hi, lo + 1e-9)
        img = np.clip((arr - lo) / (hi - lo), 0, 1) ** (1 / 1.6)
        Image.fromarray((img * 255).astype('uint8')).save(os.path.join(A, base + '.png'), optimize=True)
        x = open(vic[:-4] + '.xml', encoding='utf8').read()
        led = re.search(r'<img:LED_Illumination_Source>\s*<img:name>([^<]*)</img:name>.*?<img:illumination_wavelength[^>]*>([^<]*)<', x, re.S)
        exp = re.search(r'<img:exposure_duration[^>]*>([^<]*)<', x)
        man.append(dict(id=base, phase=phase, utc=tag(x, 'start_date_time'), utc_stop=tag(x, 'stop_date_time'),
            led=(led[1] if led else None), led_nm=(float(led[2]) if led else None),
            exposure_ms=(float(exp[1]) if exp else None), png=f'assets/mascam/{base}.png', display_stretch=[float(lo), float(hi)],
            certainty='A', source='DARTS MASCOT MASCAM calibrated (Jaumann et al. 2019)'))
    except Exception as e:
        skipped.append((base, str(e)))
man.sort(key=lambda m: m['utc'])
json.dump(dict(images=man, skipped=skipped), open(os.path.join(D, 'mascam_manifest.json'), 'w'), indent=1)
print('MASCAM', len(man), 'ok', len(skipped), 'skipped')

# ---- 2 MARA / MAG
def num(v): return None if float(v) <= -998 else float(v)
mara = []
for ln in open(os.path.join(M, 'mara_data_calibrated', 'mascot_mara_ryugu_science_calibrated.tab')):
    p = ln.split()
    if len(p) < 21: continue
    mara.append(dict(utc=p[0], local=p[1], status=p[2], t=[num(p[i]) for i in (3, 6, 9, 12, 15, 18)]))
json.dump(dict(sensors=['Si-LP', 'BP8-9.5', 'BP9.5-11.5', 'BP8-12', 'BP13.5-15.5', 'sensor6'], unit='K',
               note='-999 in source = missing -> null. HUD rock temperature uses BP8-12 (index 3).', rows=mara,
               certainty='A'), open(os.path.join(D, 'mara.json'), 'w'), separators=(',', ':'))
mag = []
for f in glob.glob(os.path.join(M, 'mag_data_sci_calibrated', '*.tab')):
    for ln in open(f):
        p = ln.split()
        if len(p) < 7: continue
        mag.append((dt.datetime.strptime(p[1], '%Y%m%dT%H%M%S.%f').replace(tzinfo=dt.timezone.utc), float(p[2]), float(p[3]), float(p[4]), int(p[6])))
mag.sort(key=lambda r: r[0])
t0 = mag[0][0]
B = np.array([[r[1], r[2], r[3]] for r in mag]); ts = np.array([(r[0] - t0).total_seconds() for r in mag])
# impact detection: spikes of |dB/dt| inside bounce window
win = [(r[0].hour * 3600 + r[0].minute * 60 + r[0].second + r[0].microsecond / 1e6) for r in mag]
win = np.array(win); sel = (win >= 1 * 3600 + 57 * 60) & (win <= 2 * 3600 + 20 * 60)
dB = np.linalg.norm(np.gradient(B, ts, axis=0), axis=1)
impacts = []
if sel.sum() > 10:
    thr = np.median(dB[sel]) + 6 * 1.4826 * np.median(np.abs(dB[sel] - np.median(dB[sel])))
    idx = np.where(sel & (dB > thr))[0]
    last = -99
    for i in idx:
        if ts[i] - last > 30: impacts.append(dict(utc=mag[i][0].isoformat(), dBdt_nT_s=float(dB[i]), certainty='A'))
        last = ts[i]
print('MAG samples', len(mag), 'impact candidates', len(impacts))
dec = max(1, len(mag) // 20000)
json.dump(dict(t0_utc=t0.isoformat(), unit='nT', columns=['t_s', 'Bx', 'By', 'Bz', 'quality'],
               rows=[[round(float(ts[i]), 3), *[round(float(v), 3) for v in B[i]], mag[i][4]] for i in range(0, len(mag), dec)], decimation=dec,
               impact_candidates=impacts, impact_note='threshold detection of |dB/dt| spikes; Jaumann/Scholten report 3 ground contacts - candidates are NOT verified against that count',
               certainty='A'), open(os.path.join(D, 'mag.json'), 'w'), separators=(',', ':'))

# ---- 3 SPK position (topocentric frame -37701, km -> m), 1 s
spk = SPK(os.path.join(ROOT, '03_spice', 'spk', 'hyb2_mascot_lander_v02.bsp'))
t0e = utc2et('2018-10-03T01:57:20'); rows = []
for k in range(0, 23 * 60 + 1):
    et = t0e + k; s = spk.find(-37700, et)
    if s is None or s['center'] != -37701: continue
    rows.append([k, *np.round(spk.state(s, et)[:3] * 1000, 3).tolist()])
json.dump(dict(t0_utc='2018-10-03T01:57:20Z', frame='HAYABUSA2_MASCOT_TOPO (-37701), origin at landing site, metres',
    site=dict(lat=-22.294, lon_e=317.161), tkframe_angles_deg=[-317.1610, -127.2940, -90.0], columns=['dt_s', 'x', 'y', 'z'], rows=rows,
    sp1=dict(lat=-22.2065, lon_e=317.2991, radius_m=446.25, ref='Scholten et al. 2019, A&A 632, A67'),
    certainty='A (SPK) / B (SP1 constants)'), open(os.path.join(D, 'mascot_position.json'), 'w'), separators=(',', ':'))
print('mascot pos rows', len(rows))
