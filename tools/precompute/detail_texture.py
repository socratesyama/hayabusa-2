#!/usr/bin/env python3
"""§4.6 stage 4 — MASCAM-derived cm-scale detail texture for the near-field ground.

Source: MASCAM frame mcam_1086250971_110_00203_n_rdr.png — MASCOT descent, 2018-10-03
02:07:49 UTC, sun-lit (no LED), response code 00203, DARTS calibrated (Jaumann et al.
2019). Chosen from all 67 frames as the most continuous fine-grain regolith surface
(assessed 2026-11-07): frame 110 shows uniform fine regolith across the whole FOV.
Crop: the fine-grain band above the central lens-flare band (rows 2-27%), square
window to avoid anisotropic stretching. The flare band (rows ~30-50%) and the rough
bottom third are excluded.

Output: 12_site_data/generated/ryugu_detail_256.png (256x256, RGB) —
  R = height grain (high-pass luminance, base level),
  G = albedo grain (stronger contrast, base level),
  B = 128.
NOT seam-tiled on purpose: the runtime samples it with mirrored-repeat wrapping
(THREE.MirroredRepeatWrapping), which is seam-free.

v2 (2026-11-07): the source grain is essentially pixel-uncorrelated (MASCAM resolves
cm-scale pebbles to ~1-2 px). A plain mip chain averages that noise away — at 5-15 m
viewing distance the GPU selected high mip levels and the grain vanished (measured
ON/OFF render diff < 1.5/255). Fix: build a CONTRAST-PRESERVING mip chain (each level
is re-normalised to the base level's local std, then quantised to 2 px/texel noise)
and bake it into the PNG as extra rows below the base tile. The runtime loads the
image as a DataArrayTexture-like atlas: level k is sampled from row offset k*256.
Level 0 = original grain; levels 1-6 = matched-contrast speckle at 2x coarser
wavelength each. The shader picks the level by screen-space density so the ground
reads as unresolved regolith speckle at EVERY distance (like real Ryugu from orbit),
instead of smoothing to mush. Albedo channel keeps the same treatment.
"""

import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = os.path.join(os.path.dirname(__file__), '../../site/public/assets/mascam/mcam_1086250971_110_00203_n_rdr.png')
OUT = os.path.join(os.path.dirname(__file__), '../../12_site_data/generated/ryugu_detail_256.png')
N = 256          # tile size (texels)
LEVELS = 7       # mip-like levels: 0 (2.5 m/texel*256... base) .. 6

img = np.asarray(Image.open(SRC).convert('L'), dtype=np.float64) / 255.0
H, W = img.shape
# square crop in the fine-grain band above the central flare band
c = img[int(H * 0.02):int(H * 0.27), int(W * 0.30):int(W * 0.55)]

# ---- high-pass: keep cm-scale grain, drop the illumination gradient
low = ndi.gaussian_filter(c, 12)
hp = c - low
hp = hp / (np.percentile(np.abs(hp), 99) + 1e-9)
hp = np.clip(hp, -1, 1)
# ---- resample to N x N
h8 = np.asarray(
    Image.fromarray(((hp * 0.5 + 0.5) * 255).astype(np.uint8)).resize((N, N), Image.LANCZOS),
    dtype=np.float64)

# base level: R = height grain, G = albedo grain (stronger contrast)
height0 = np.clip(h8, 0, 255)
alb0 = np.clip(128 + (h8 - 128) * 1.6, 0, 255)

# ---- contrast-preserving coarse levels -------------------------------------
# Each level k halves the resolution; the downsampled noise loses std ~ sqrt(4^k),
# so we re-normalise to the base std and re-quantise at 2 px/texel to keep it
# looking like discrete pebbles rather than a blurred mush.
rng = np.random.default_rng(20191003)  # MASCOT separation date (deterministic)
levels_h, levels_a = [height0], [alb0]
cur_h, cur_a = height0, alb0
for k in range(1, LEVELS):
    d = 2 ** k
    small_h = cur_h.reshape(N // d, d, N // d, d).mean(axis=(1, 3))
    small_a = cur_a.reshape(N // d, d, N // d, d).mean(axis=(1, 3))
    # upsample back to N x N, re-normalise contrast to base level
    up_h = np.asarray(Image.fromarray(small_h.astype(np.uint8)).resize((N, N), Image.BILINEAR), dtype=np.float64)
    up_a = np.asarray(Image.fromarray(small_a.astype(np.uint8)).resize((N, N), Image.BILINEAR), dtype=np.float64)
    def renorm(up, base):
        su = up.std() + 1e-9
        out = (up - up.mean()) / su * base.std() + base.mean()
        return np.clip(out, 0, 255)
    up_h, up_a = renorm(up_h, height0), renorm(up_a, alb0)
    # quantise to d*2 px blocks so the speckle stays discrete at coarse levels
    q = max(2, d)
    m = q // 2
    small2_h = up_h.reshape(N // q, q, N // q, q).mean(axis=(1, 3))
    small2_a = up_a.reshape(N // q, q, N // q, q).mean(axis=(1, 3))
    up_h = np.asarray(Image.fromarray(small2_h.astype(np.uint8)).resize((N, N), Image.NEAREST), dtype=np.float64)
    up_a = np.asarray(Image.fromarray(small2_a.astype(np.uint8)).resize((N, N), Image.NEAREST), dtype=np.float64)
    levels_h.append(up_h)
    levels_a.append(up_a)

# ---- pack: 7 levels side by side horizontally (7N x N) ----------------------
sheet_h = np.zeros((N, N * LEVELS))
sheet_a = np.zeros((N, N * LEVELS))
for k in range(LEVELS):
    sheet_h[:, k * N:(k + 1) * N] = levels_h[k]
    sheet_a[:, k * N:(k + 1) * N] = levels_a[k]
out = np.zeros((N, N * LEVELS, 3), dtype=np.uint8)
out[..., 0] = np.clip(sheet_h, 0, 255).astype(np.uint8)
out[..., 1] = np.clip(sheet_a, 0, 255).astype(np.uint8)
out[..., 2] = 128
Image.fromarray(out).save(OUT)

# report
for k in range(LEVELS):
    print(f'level {k}: h std {levels_h[k].std():.1f}  a std {levels_a[k].std():.1f}')
print(f'detail texture (contrast-preserving, {LEVELS} levels) -> {OUT}')
print(f'source: MASCAM mcam_1086250971_110_00203_n_rdr, MASCOT降下中・太陽光のみ, JAXA/DLR')
