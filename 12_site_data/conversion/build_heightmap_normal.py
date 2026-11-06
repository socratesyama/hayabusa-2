#!/usr/bin/env python3
"""
リュウグウ形状モデル(OBJ)から、3D表面上のWASD移動に使える
正距円筒図法の標高マップ(グレースケールPNG)と法線マップ(RGB PNG)を生成する。

入力例: 01_shape_models/ryugu_shape_spc_200k_v20200323_web.obj
        (単位km・本体固定座標系 IAU_RYUGU・経度=東経0-360)
出力: ryugu_heightmap_{W}.png (16bitグレースケール。半径を0-65535に正規化)
      ryugu_normal_{W}.png    (RGB。表面の法線方向を[0,255]にマッピング)

方式: 各三角形を(経度, 緯度)平面上に重心座標補間でラスタライズし、
      各ピクセルには「最も外側(半径が大きい)」の表面を残す(z-buffer相当)。
      経度の折り返し(0/360度)は両端で重ねて描画して処理する。

依存: numpy, Pillow

使い方(リポジトリルートから):
  python3 12_site_data/conversion/build_heightmap_normal.py \
      01_shape_models/ryugu_shape_spc_200k_v20200323_web.obj \
      12_site_data/generated --width 2048
"""
import argparse
import os

import numpy as np
from PIL import Image


def load_obj(path):
    verts, faces = [], []
    with open(path) as f:
        for line in f:
            if line.startswith("v "):
                verts.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("f "):
                faces.append([int(p.split("/")[0]) - 1 for p in line.split()[1:4]])
    return np.asarray(verts, dtype=np.float64), np.asarray(faces, dtype=np.int64)


def to_latlon_radius(v_m):
    r = np.linalg.norm(v_m, axis=1)
    lat = np.arcsin(np.clip(v_m[:, 2] / r, -1.0, 1.0))
    lon = np.arctan2(v_m[:, 1], v_m[:, 0])  # -pi..pi
    return lat, lon, r


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("obj", help="入力OBJ(単位km, IAU_RYUGU)")
    ap.add_argument("out_dir", help="出力ディレクトリ")
    ap.add_argument("--width", type=int, default=2048, help="経度方向ピクセル数")
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    W, H = args.width, args.width // 2

    verts, faces = load_obj(args.obj)
    print(f"loaded {len(verts)} verts / {len(faces)} faces")
    v = verts * 1000.0  # km -> m

    lat, lon, r = to_latlon_radius(v)
    # ピクセル座標(float、経度0-360を左端-右端へ)
    px = (lon / (2 * np.pi) + 0.5) * W
    py = (0.5 - lat / np.pi) * H

    buf = np.zeros((H, W), dtype=np.float64)
    covered = np.zeros((H, W), dtype=bool)

    # 経度折り返し対応: 3頂点のpxが2W以上離れる場合は中央値基準で再配置
    for fi in range(len(faces)):
        ia, ib, ic = faces[fi]
        xs = np.array([px[ia], px[ib], px[ic]])
        ys = np.array([py[ia], py[ib], py[ic]])
        rs = np.array([r[ia], r[ib], r[ic]])
        # 折り返し補正
        med = np.median(xs)
        xs = np.where(xs - med > W / 2, xs - W, xs)
        xs = np.where(med - xs > W / 2, xs + W, xs)
        xmin = max(0, int(np.floor(xs.min())) - 1)
        xmax = min(W - 1, int(np.ceil(xs.max())) + 1)
        if xmin > xmax:
            continue
        ymin = max(0, int(np.floor(ys.min())) - 1)
        ymax = min(H - 1, int(np.ceil(ys.max())) + 1)
        if ymin > ymax:
            continue
        if xmax - xmin > W / 2 or ymax - ymin > H / 2:
            continue  # 極付近の異常に大きい三角形はスキップ(頂点散布でカバー)
        # 重心座標による補間
        (x0, x1, x2), (y0, y1, y2) = xs, ys
        det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(det) < 1e-9:
            continue
        for yy in range(ymin, ymax + 1):
            for xx in range(xmin, xmax + 1):
                l0 = ((y1 - y2) * (xx - x2) + (x2 - x1) * (yy - y2)) / det
                l1 = ((y2 - y0) * (xx - x2) + (x0 - x2) * (yy - y2)) / det
                l2 = 1.0 - l0 - l1
                if l0 < -0.02 or l1 < -0.02 or l2 < -0.02:
                    continue
                rr = l0 * rs[0] + l1 * rs[1] + l2 * rs[2]
                xi = xx % W
                if rr >= buf[yy, xi]:
                    buf[yy, xi] = rr
                    covered[yy, xi] = True

    # 頂点も散布(穴埋め・保険)
    for i in range(len(v)):
        xi = int(px[i]) % W
        yi = int(py[i]) % H
        if r[i] >= buf[yi, xi]:
            buf[yi, xi] = r[i]
            covered[yi, xi] = True

    holes = int((~covered).sum())
    print(f"rasterized. uncovered pixels: {holes} / {H*W} ({holes/(H*W)*100:.2f}%)")

    # 残った穴は近傍最大値で埋める(反復膨張)
    if holes:
        for _ in range(500):
            ys, xs = np.where(~covered)
            if len(ys) == 0:
                break
            progressed = False
            for yy, xx in zip(ys, xs):
                neigh = []
                for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    y2, x2 = yy + dy, xx + dx
                    if 0 <= y2 < H and 0 <= x2 < W and covered[y2, x2]:
                        neigh.append(buf[y2, x2])
                if neigh:
                    buf[yy, xx] = max(neigh)
                    covered[yy, xx] = True
                    progressed = True
            if not progressed:
                break
        print(f"after fill: {int((~covered).sum())} uncovered")

    rmin, rmax = float(buf.min()), float(buf.max())
    print(f"radius range: {rmin:.1f} m - {rmax:.1f} m")

    # 16bit PNG
    norm = ((buf - rmin) / (rmax - rmin) * 65535.0).astype(np.uint16)
    Image.fromarray(norm).save(os.path.join(args.out_dir, f"ryugu_heightmap_{W}.png"))

    # 法線マップ: 勾配から(1pxの実距離で正規化)
    m_per_px = (2.0 * np.pi * rmax) / W
    gx = np.gradient(buf, axis=1) / m_per_px
    gy = np.gradient(buf, axis=0) / m_per_px
    inv = 1.0 / np.sqrt(gx * gx + gy * gy + 1.0)
    nx, ny, nz = -gx * inv, -gy * inv, inv
    rgb = np.stack([(nx + 1) / 2, (ny + 1) / 2, (nz + 1) / 2], axis=-1)
    Image.fromarray((rgb * 255).astype(np.uint8)).save(
        os.path.join(args.out_dir, f"ryugu_normal_{W}.png"))

    with open(os.path.join(args.out_dir, "ryugu_heightmap_meta.txt"), "w") as f:
        f.write("source_obj=ryugu_shape_spc_200k_v20200323_web.obj (units km, IAU_RYUGU)\n")
        f.write("projection=equirectangular, lon 0-360E (left=0), lat +90(top) to -90(bottom)\n")
        f.write(f"width_px={W}\nheight_px={H}\n")
        f.write(f"radius_min_m={rmin:.3f}\nradius_max_m={rmax:.3f}\n")
        f.write("heightmap: 0=radius_min, 65535=radius_max (16bit PNG)\n")
        f.write("normal map: RGB = surface normal xyz in [-1,1] mapped to [0,255]\n")
        f.write("method=triangle rasterization (barycentric) + vertex scatter + max-dilation fill\n")
        f.write("credit: JAXA/ISAS/DARTS (shape model SPC v20200323, Watanabe et al. 2019)\n")
    print("OK")


if __name__ == "__main__":
    main()
