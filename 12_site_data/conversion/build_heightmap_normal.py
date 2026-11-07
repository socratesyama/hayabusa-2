#!/usr/bin/env python3
"""
リュウグウ形状モデル(OBJ)から、3D表面上のWASD移動に使える
正距円筒図法の標高マップ(グレースケールPNG)と法線マップ(RGB PNG)を生成する。

入力例: 01_shape_models/ryugu_shape_spc_200k_v20200323_web.obj
        (単位km・本体固定座標系 IAU_RYUGU・経度=東経0-360)
出力: ryugu_heightmap_{W}.png (16bitグレースケール。半径を0-65535に正規化)
      ryugu_normal_{W}.png    (RGB。表面の法線方向を[0,255]にマッピング)
      ryugu_heightmap_meta.txt (仕様+補間統計)

方式: 各三角形を(経度, 緯度)平面上に重心座標補間でラスタライズし、
      各ピクセルには「最も外側(半径が大きい)」の表面を残す(z-buffer相当)。
      経度の折り返し(0/360度)は、境界をまたぐ三角形を「シームを跨いだ座標系」で
      ラスタライズし、x座標を W で剰余を取って両端の両方に描画する
      (片側をクリップして捨てない。境界に穴を作らない)。
      残った穴は近傍最大値で埋めるが、その件数・距離・元形状との誤差を
      統計として出力・記録する。
      法線マップの経度方向勾配は周期差分(両端を接続)で計算する。

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


def rasterize(faces, px, py, r, H, W):
    """三角形ラスタライズ。経度折り返し(0/360境界)に対応し、両端の両方に描画する。"""
    buf = np.full((H, W), -np.inf)
    covered = np.zeros((H, W), dtype=bool)
    skipped = 0
    for fi in range(len(faces)):
        ia, ib, ic = faces[fi]
        xs = np.array([px[ia], px[ib], px[ic]])
        ys = np.array([py[ia], py[ib], py[ic]])
        rs = np.array([r[ia], r[ib], r[ic]])
        # 折り返し補正: 3頂点のpxがW/2以上離れる場合は中央値基準で再配置
        # (境界をまたぐ三角形を連続した座標系に置く)
        med = np.median(xs)
        xs = np.where(xs - med > W / 2, xs - W, xs)
        xs = np.where(med - xs > W / 2, xs + W, xs)
        # クリップせず、シームを跨いだ範囲をそのまま使う(描画時に % W で両端に落とす)
        xmin = int(np.floor(xs.min())) - 1
        xmax = int(np.ceil(xs.max())) + 1
        if xmax - xmin > W / 2 + 2:
            skipped += 1
            continue  # 極付近の異常に大きい三角形はスキップ(頂点散布でカバー)
        ymin = max(0, int(np.floor(ys.min())) - 1)
        ymax = min(H - 1, int(np.ceil(ys.max())) + 1)
        if ymin > ymax:
            continue
        # 重心座標による補間 (行ごとにベクトル化)
        (x0, x1, x2), (y0, y1, y2) = xs, ys
        det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(det) < 1e-9:
            continue
        xx = np.arange(xmin, xmax + 1)
        xi = xx % W  # 境界を跨ぐ部分は反対側の端にも描画される
        for yy in range(ymin, ymax + 1):
            l0 = ((y1 - y2) * (xx - x2) + (x2 - x1) * (yy - y2)) / det
            l1 = ((y2 - y0) * (xx - x2) + (x0 - x2) * (yy - y2)) / det
            l2 = 1.0 - l0 - l1
            m = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
            if not m.any():
                continue
            rr = l0 * rs[0] + l1 * rs[1] + l2 * rs[2]
            # 更新(同ピクセル重複なし: x範囲は W/2 以下のため xi は一意)
            row = buf[yy, xi]
            vals = np.where(m & (rr >= row), rr, row)
            buf[yy, xi] = vals
            covered[yy, xi] |= m
    return buf, covered, skipped


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
    # lon は atan2 の -pi..pi。東経0°を左端にするため 0..2pi に折り返す(旧: +0.5 で西経180°が左端になっていた)
    px = (np.mod(lon, 2 * np.pi) / (2 * np.pi)) * W
    py = (0.5 - lat / np.pi) * H

    buf, covered, skipped = rasterize(faces, px, py, r, H, W)
    print(f"rasterized. skipped huge faces: {skipped}")

    # 頂点も散布(穴埋め・保険)
    vx = np.clip((px).astype(int), 0, W - 1) % W
    vy = np.clip(py.astype(int), 0, H - 1)
    for i in range(len(v)):
        xi, yi = int(vx[i]), int(vy[i])
        if r[i] >= buf[yi, xi]:
            buf[yi, xi] = r[i]
        covered[yi, xi] = True

    holes = int((~covered).sum())
    print(f"rasterized. uncovered pixels: {holes} / {H*W} ({holes/(H*W)*100:.2f}%)")

    # 残った穴は近傍最大値で埋める(反復膨張)。
    # 補間した画素の「膨張距離」(何ステップで埋まったか)を記録し、
    # 元形状(最近傍頂点)との誤差を推定する。
    dist = np.zeros((H, W), dtype=np.int32)
    if holes:
        for step in range(1, 501):
            ys, xs = np.where(~covered)
            if len(ys) == 0:
                break
            progressed = False
            for yy, xx in zip(ys, xs):
                neigh = []
                for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    y2, x2 = yy + dy, (xx + dx) % W  # 経度方向は周期
                    if 0 <= y2 < H and covered[y2, x2]:
                        neigh.append(buf[y2, x2])
                if neigh:
                    buf[yy, xx] = max(neigh)
                    covered[yy, xx] = True
                    dist[yy, xx] = step
                    progressed = True
            if not progressed:
                break
        remaining = int((~covered).sum())
    else:
        remaining = 0

    # 補間統計: 膨張距離と、最近傍頂点の半径との差(誤差推定)
    filled = dist > 0
    n_filled = int(filled.sum())
    if n_filled:
        # 最近傍頂点を探索(粗いバケット索引)
        buckets = {}
        for i in range(len(v)):
            buckets.setdefault((int(vy[i]), int(vx[i])), []).append(r[i])
        max_px, errs = [], []
        yy, xx = np.where(filled)
        for y0, x0 in zip(yy, xx):
            found = None
            for rad in range(0, 12):
                for dy in range(-rad, rad + 1):
                    for dx in range(-rad, rad + 1):
                        key = (int(y0 + dy), int((x0 + dx) % W))
                        if key in buckets:
                            for rv in buckets[key]:
                                if found is None or abs(rv - buf[y0, x0]) < found:
                                    found = abs(rv - buf[y0, x0])
                if found is not None:
                    break
            if found is not None:
                errs.append(found)
        max_d = int(dist.max())
        err_med = float(np.median(errs)) if errs else float("nan")
        err_max = float(np.max(errs)) if errs else float("nan")
    else:
        max_d, err_med, err_max = 0, float("nan"), float("nan")

    # 万一まだ穴が残っていた場合(通常0): rmin で埋め、その旨を記録する
    if remaining > 0:
        print(f"WARNING: {remaining} px still uncovered after fill; set to radius_min")
        buf[~covered] = buf[covered].min()

    rmin, rmax = float(buf[covered].min()), float(buf.max())
    print(f"after fill: {remaining} uncovered; filled {n_filled} px "
          f"(max dilation step {max_d}, |Δr| vs nearest vertex med {err_med:.2f}m max {err_max:.2f}m)")
    print(f"radius range: {rmin:.1f} m - {rmax:.1f} m")

    # 16bit PNG
    norm = ((buf - rmin) / (rmax - rmin) * 65535.0).astype(np.uint16)
    Image.fromarray(norm).save(os.path.join(args.out_dir, f"ryugu_heightmap_{W}.png"))

    # 法線マップ: 勾配から(1pxの実距離で正規化)。
    # 経度方向は周期差分(左端と右端を接続)。緯度方向は端で片側差分。
    m_per_px = (2.0 * np.pi * rmax) / W
    gx = (np.roll(buf, -1, axis=1) - np.roll(buf, 1, axis=1)) / (2.0 * m_per_px)
    gy = np.gradient(buf, axis=0) / m_per_px
    inv = 1.0 / np.sqrt(gx * gx + gy * gy + 1.0)
    nx, ny, nz = -gx * inv, -gy * inv, inv
    rgb = np.stack([(nx + 1) / 2, (ny + 1) / 2, (nz + 1) / 2], axis=-1)
    Image.fromarray((rgb * 255).astype(np.uint8)).save(os.path.join(args.out_dir, f"ryugu_normal_{W}.png"))

    with open(os.path.join(args.out_dir, "ryugu_heightmap_meta.txt"), "w") as f:
        f.write("source_obj=ryugu_shape_spc_200k_v20200323_web.obj (units km, IAU_RYUGU)\n")
        f.write("projection=equirectangular, lon 0-360E (left=0), lat +90(top) to -90(bottom)\n")
        f.write(f"width_px={W}\nheight_px={H}\n")
        f.write(f"radius_min_m={rmin:.3f}\nradius_max_m={rmax:.3f}\n")
        f.write("heightmap: 0=radius_min, 65535=radius_max (16bit PNG)\n")
        f.write("normal map: RGB = surface normal xyz in [-1,1] mapped to [0,255]\n")
        f.write("method=triangle rasterization (barycentric, seam-wrap on lon 0/360) "
                "+ vertex scatter + max-dilation fill\n")
        f.write("normal map gradient: periodic in longitude (left/right edges connected)\n")
        f.write(f"fill_stats: filled_px={n_filled}, remaining_uncovered_px={remaining}, "
                f"max_dilation_step={max_d}, fill_error_vs_nearest_vertex_m(median)={err_med:.3f}, "
                f"fill_error_vs_nearest_vertex_m(max)={err_max:.3f}\n")
        f.write("fill_error: |filled radius - nearest mesh vertex radius|; upper-bound estimate "
                "(filled pixels take the max of neighbors, so they tend to overestimate height)\n")
        f.write("credit: JAXA/ISAS/DARTS (shape model SPC v20200323, Watanabe et al. 2019)\n")
    print("OK")


if __name__ == "__main__":
    main()
