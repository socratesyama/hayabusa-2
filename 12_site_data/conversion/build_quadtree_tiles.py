#!/usr/bin/env python3
"""
全球マップ(正距円筒図法・2:1)をタイル(z/x/y)に変換する。

元画像は縦横比2:1(経度360°×緯度180°)のため、正方形のタイルを作るには
経度方向の分割数を緯度方向の2倍にする必要がある。
    各ズーム: x方向 2^(z+1) 分割、y方向 2^z 分割
    タイル数: z0=2, z1=8, z2=32, z3=128 (合計170枚/地図)
これにより各タイルの元画像上の領域が正方形(ピクセル比1:1)になり、
3Dモデルへの貼り付け時に縦横の歪みが生じない。

出力: tiles/{map_name}/{z}/{x}/{y}.jpg (256x256)
Three.js/Cesium系の地球グロブ実装や、z階層の詳細表示に使える。

依存: numpy, Pillow (どちらも標準的な科学計算環境に含まれる)

使い方:
  python3 build_quadtree_tiles.py <入力画像(JPG/TIF)> <出力ディレクトリ> --max-zoom 3
  (リポジトリルートから)
  python3 12_site_data/conversion/build_quadtree_tiles.py \
      04_science_data/map_products/01_ONC_v-band_Basemap1/hyb2_onc_Global_01_l3dm_v06.jpg \
      12_site_data/generated/tiles/vband_basemap --max-zoom 3

注意: 入力は経度0-360°(左端=経度0)・緯度+90(上)〜-90(下)の全球正距円筒図法であること。
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image


def downsample(img: Image.Image, target: int) -> Image.Image:
    """高品質な縮小(LANCZOS)。タイルごとに必要な領域を切り出してから縮小する。"""
    return img.resize((target, target), Image.LANCZOS)


def build_tiles(src_path: str, out_dir: str, max_zoom: int, tile_size: int = 256) -> int:
    img = Image.open(src_path).convert("RGB")
    w, h = img.size
    if abs(w / h - 2.0) > 0.05:
        print(f"警告: 縦横比が2:1ではありません({w}x{h})。全球正距円筒図法の地図を指定してください。")
    # 最大ズームで十分な解像度があるように制限
    # (x方向の最大分割数は 2^(max_zoom+1)。元画像幅の半分までは品質を保てる)
    while (2 ** (max_zoom + 1)) * tile_size > w * 2:
        max_zoom -= 1
        if max_zoom < 0:
            raise ValueError("入力画像が小さすぎます")

    count = 0
    for z in range(max_zoom + 1):
        nx = 2 ** (z + 1)  # 経度方向(360°)の分割数
        ny = 2 ** z        # 緯度方向(180°)の分割数
        # 各タイルの元画像上の領域が正方形になることを保証(2:1画像の場合)
        tw, th = w / nx, h / ny
        if abs(tw - th) > 1.0:
            print(f"警告: z{z} でタイル領域が正方形になりません (tw={tw:.1f}, th={th:.1f})。入力画像の縦横比を確認してください。")
        for x in range(nx):
            for y in range(ny):
                # ソース画像上の対応領域 (正距円筒: x=経度, y=緯度)
                left = int(x * w / nx)
                right = int((x + 1) * w / nx)
                upper = int(y * h / ny)
                lower = int((y + 1) * h / ny)
                tile = img.crop((left, upper, right, lower))
                tile = tile.resize((tile_size, tile_size), Image.LANCZOS)
                d = os.path.join(out_dir, str(z), str(x))
                os.makedirs(d, exist_ok=True)
                tile.save(os.path.join(d, f"{y}.jpg"), quality=90)
                count += 1
    return count


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("src", help="入力画像(JPG/TIF)。経度0-360°(左端=0)・緯度+90(上)〜-90(下)の全球正距円筒図法")
    ap.add_argument("out_dir", help="出力ディレクトリ (tiles/{z}/{x}/{y}.jpg)")
    ap.add_argument("--max-zoom", type=int, default=3, help="最大ズーム(既定3)。タイルは x=2^(z+1) × y=2^z 分割")
    args = ap.parse_args()
    n = build_tiles(args.src, args.out_dir, args.max_zoom)
    print(f"OK: {n} tiles -> {args.out_dir}")
