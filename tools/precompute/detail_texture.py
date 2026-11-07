#!/usr/bin/env python3
"""§4.6 stage 4 — MASCAM-derived cm-scale detail texture for the near-field ground.

Source: MASCAM frame mcam_1086250971_110_00203_n_rdr.png — MASCOT descent, 2018-10-03
02:07:49 UTC, sun-lit (no LED), response code 00203, DARTS calibrated (Jaumann et al.
2019). Chosen from all 67 frames as the most continuous fine-grain regolith surface
(assessed 2026-11-07): frame 110 shows uniform fine regolith across the whole FOV.
Crop: the fine-grain band above the central lens-flare band (rows 2-27%), square
window to avoid anisotropic stretching. The flare band (rows ~30-50%) and the rough
bottom third are excluded.
Output: 12_site_data/generated/ryugu_detail_256.png (256x256) — R = height grain (high-pass
luminance), G = albedo grain. NOT seam-tiled on purpose: the runtime samples it with
mirrored-repeat wrapping (THREE.MirroredRepeatWrapping), which is seam-free.
Runtime use: bump-perturbs the ground shader near the camera (tangent-plane
projection, ~0.18 m scale). Certainty: measured A applied elsewhere = D; disclosed
on the experts page.

Usage: python3 detail_texture.py
"""
import numpy as np
from PIL import Image
import os

SRC = os.path.join(os.path.dirname(__file__), '../../site/public/assets/mascam/mcam_1086250971_110_00203_n_rdr.png')
OUT = os.path.join(os.path.dirname(__file__), '../../12_site_data/generated/ryugu_detail_256.png')
N = 256  # output tile size (2 mm texels at 0.5 m scale -> resolved pebble grain from 1.5 m eye height)

img = np.asarray(Image.open(SRC).convert('L'), dtype=np.float64) / 255.0
H, W = img.shape
# square crop in the fine-grain band above the central flare band
c = img[int(H * 0.02):int(H * 0.27), int(W * 0.30):int(W * 0.55)]

# ---- high-pass: keep cm-scale grain, drop the illumination gradient
from scipy import ndimage as ndi  # scipy is in requirements
low = ndi.gaussian_filter(c, 12)
hp = c - low
# normalise to [-1,1]-ish
hp = hp / (np.percentile(np.abs(hp), 99) + 1e-9)
hp = np.clip(hp, -1, 1)
# ---- resample to N x N
h8 = np.asarray(
    Image.fromarray(((hp * 0.5 + 0.5) * 255).astype(np.uint8)).resize((N, N), Image.LANCZOS),
    dtype=np.float64)

height = np.clip(h8, 0, 255).astype(np.uint8)
# albedo grain: same map, stronger contrast (cm-scale brightness variation ~±15%)
alb = np.clip(128 + (h8 - 128) * 1.6, 0, 255).astype(np.uint8)
out = np.zeros((N, N, 3), dtype=np.uint8)
out[..., 0] = height
out[..., 1] = alb
out[..., 2] = 128
Image.fromarray(out).save(OUT)
print(f'detail texture -> {OUT}  (source: MASCAM {os.path.basename(SRC)}, MASCOT降下中・太陽光のみ, JAXA/DLR)')
