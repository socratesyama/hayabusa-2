#!/usr/bin/env bash
# Run order for the build-time pipeline (pure Python: numpy + Pillow; no spiceypy/astropy required).
set -euo pipefail
cd "$(dirname "$0")"
python3 spice_tables.py      # sun_table.json, rotation.json (+ asserts vs observing-conditions CSV)
python3 gravity_grid.py      # gravity_{763,340}.bin + grids
python3 mascot_convert.py    # mascam png + manifest, mara/mag json, mascot_position.json
python3 onc_assets.py        # l2c jpg, image_geometry.json, gallery_manifest.json
python3 spice_sc.py          # sc_table.bin
python3 temperature_curves.py
python3 - <<'PY'
import json
p='../../site/public/data/temperature_curves.json'; d=json.load(open(p))
d['mara_comparison']=dict(site='MASCOT (~22S), BP8-12 band', mara_K=[184.2,307.8], model_K_lat20_ti300=[209,327], note='Model is ~+19..25 K warmer than MARA brightness temperatures; no tuning applied. Shown as model estimate (D).')
json.dump(d,open(p,'w'),separators=(',',':'))
PY
bash ../../scripts/sync_assets.sh
