#!/usr/bin/env python3
"""§3.4 ONC: l2c tgz -> jpg (<=N per day), l2dbpc tgz -> image_geometry.json, gallery manifest."""
import os, re, sys, json, glob, tarfile, tempfile, shutil
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__)); from fitsmini import read_fits
ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
B = os.path.join(ROOT, '02_onc_images', 'onc_bundle_v03c'); D = os.path.join(ROOT, 'site', 'public', 'data'); A = os.path.join(ROOT, 'site', 'public', 'assets')
os.makedirs(D, exist_ok=True)
PER_DAY = int(os.environ.get('ONC_PER_DAY', 12))
FN = re.compile(r'hyb2_onc_(\d{8})_(\d{6})_([tw]\d?)([a-z0-9]+)_l2(?:c|dbpc)\.fit')

# --- geometry (4 days)
geo = []
for tgz in sorted(glob.glob(os.path.join(B, 'geometry_l2dbpc_latlon', '*.tgz'))):
    with tempfile.TemporaryDirectory() as td:
        tarfile.open(tgz).extractall(td, filter='data')
        for p in sorted(glob.glob(os.path.join(td, '*', '*.fit'))):
            m = FN.search(p)
            if not m: continue
            try:
                (h, a), = read_fits(p)[:1]
                lon, lat = a[0], a[1]
                ok = np.isfinite(lon) & np.isfinite(lat) & (lat > -90.5) & (lat <= 90.5) & (lon >= 0) & (lon <= 360.5)
                if ok.sum() < 100: continue
                # circular median of lon
                ang = np.radians(lon[ok]); cl = np.degrees(np.arctan2(np.sin(ang).mean(), np.cos(ang).mean())) % 360
                d, t, cam, band = m.groups()
                geo.append(dict(file=os.path.basename(p).replace('l2dbpc', 'l2c'), utc=f'{d[:4]}-{d[4:6]}-{d[6:]}T{t[:2]}:{t[2:4]}:{t[4:]}Z', camera=cam + band,
                    center_lat=round(float(np.median(lat[ok])), 3), center_lon=round(float(cl), 3), valid_ratio=round(float(ok.mean()), 3), certainty='A'))
            except Exception as e: print('geo skip', p, e)
json.dump(dict(images=geo, note='l2dbpc backplanes exist for 4 days only (20180626, 20180911, 20181014, 20181024)'), open(os.path.join(D, 'image_geometry.json'), 'w'), separators=(',', ':'))
print('geometry', len(geo))
geo_files = {g['file'] for g in geo}

# --- l2c -> jpg
l2c = []
for tgz in sorted(glob.glob(os.path.join(B, 'data_calibrated_l2c', '*.tgz'))):
    day = os.path.basename(tgz)[:8]; out = os.path.join(A, 'onc_l2c', day); os.makedirs(out, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        tf = tarfile.open(tgz)
        names = sorted(n for n in tf.getnames() if n.endswith('.fit'))
        # prefer files with geometry, then even spread
        pri = [n for n in names if os.path.basename(n) in geo_files]; rest = [n for n in names if n not in pri]
        pick = (pri[::max(1, len(pri)//PER_DAY)] + rest[::max(1, len(rest)//PER_DAY)])[:PER_DAY]
        for n in pick:
            tf.extract(n, td, filter='data'); p = os.path.join(td, n)
            try:
                h, a = read_fits(p)[0]
                if a.ndim == 3: a = a[0]
                a = np.nan_to_num(a); lo, hi = np.percentile(a, [1, 99.7]); hi = max(hi, lo + 1e-9)
                im = Image.fromarray((np.clip((a - lo) / (hi - lo), 0, 1) ** 0.6 * 255).astype('uint8'))
                im = im.resize((1024, int(1024 * a.shape[0] / a.shape[1])), Image.LANCZOS)
                base = os.path.basename(n)[:-4]; im.save(os.path.join(out, base + '.jpg'), quality=88)
                m = FN.search(n); d, t = m.group(1), m.group(2)
                l2c.append(dict(id=os.path.basename(n), day=day, utc=f'{d[:4]}-{d[4:6]}-{d[6:]}T{t[:2]}:{t[2:4]}:{t[4:]}Z', jpg=f'assets/onc_l2c/{day}/{base}.jpg',
                                has_geometry=os.path.basename(n) in geo_files, certainty='A', stretch=[float(lo), float(hi)]))
            except Exception as e: print('l2c skip', n, e)
json.dump(dict(images=l2c), open(os.path.join(D, 'l2c_manifest.json'), 'w'), separators=(',', ':'))
print('l2c', len(l2c))

# --- gallery manifest
loc = json.load(open(os.path.join(ROOT, '12_site_data', 'image_location_map.json')))
gal = []
for fo in sorted(glob.glob(os.path.join(ROOT, '02_onc_images', 'official_gallery_jaxa', 'nav*'))):
    for f in sorted(glob.glob(os.path.join(fo, '*.jpg'))):
        n = os.path.basename(f)[:-4]; fol = os.path.basename(fo)
        gal.append(dict(id=os.path.basename(f), folder=fol, utc_hint=n if re.fullmatch(r'\d{12}', n) else None))
json.dump(dict(images=gal, location_map_keys=list(loc.keys()) if isinstance(loc, dict) else None), open(os.path.join(D, 'gallery_manifest.json'), 'w'), separators=(',', ':'))
print('gallery', len(gal))
