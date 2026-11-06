#!/usr/bin/env python3
"""
ONCバンドル v03c の l2dbpc(緯度経度バックプレーンFITS)から、
各画像の「視野中心の緯度経度」を抽出してJSON化する。
出典: DARTS はやぶさ2 ONCアーカイブ (https://darts.isas.jaxa.jp/pub/hayabusa2/onc_bundle/)

依存: numpy, astropy(FITS読み取り)

使い方(リポジトリルートから):
  # 1日分のtgzを展開して
  tar xzf 02_onc_images/onc_bundle_v03c/geometry_l2dbpc_latlon/20181024_l2dbpc_latlon_v03c.tgz -C /tmp
  python3 12_site_data/conversion/extract_image_geometry.py /tmp/20181024 out.json

出力JSON: [{file, utc_datetime, camera_band, center_lat_deg, center_lon_deg, valid_pixel_ratio}, ...]
"""
import argparse
import glob
import json
import os
import re
import sys

import numpy as np

try:
    from astropy.io import fits
except ImportError:
    sys.exit("astropy が必要です: pip install astropy")


FILENAME_RE = re.compile(
    r"hyb2_onc_(\d{8})_(\d{6})_([tw]\d?)([a-z0-9]+)_l2dbpc\.fit")


def extract_one(path):
    m = FILENAME_RE.search(os.path.basename(path))
    if not m:
        return None
    date, time, cam, band = m.groups()
    with fits.open(path) as hdul:
        # l2dbpc: 拡張に緯度・経度マップ(画像と同サイズ)
        lat_data, lon_data = None, None
        for hdu in hdul[1:]:
            if hdu.data is None:
                continue
            name = (hdu.name or "").lower()
            arr = np.asarray(hdu.data)
            if arr.ndim != 2:
                continue
            if "lat" in name or lat_data is None and arr.size and np.abs(arr).max() <= 90:
                if "lat" in name:
                    lat_data = arr
            elif "lon" in name or lon_data is None and arr.size and arr.max() <= 360:
                if "lon" in name:
                    lon_data = arr
        if lat_data is None or lon_data is None:
            # 拡張名が付いていない場合は順序で推定(1つ目=緯度, 2つ目=経度が一般的)
            planes = [np.asarray(h.data) for h in hdul[1:] if h.data is not None and np.asarray(h.data).ndim == 2]
            if len(planes) >= 2:
                lat_data, lon_data = planes[0], planes[1]
            else:
                return None
    valid = np.isfinite(lat_data) & np.isfinite(lon_data) & (lat_data != -999)
    if valid.sum() < 10:
        return None
    return {
        "file": os.path.basename(path),
        "utc_datetime": f"{date[:4]}-{date[4:6]}-{date[6:]}T{time[:2]}:{time[2:4]}:{time[4:]}",
        "camera_band": f"{cam}{band}",
        "center_lat_deg": round(float(np.median(lat_data[valid])), 4),
        "center_lon_deg": round(float(np.median(lon_data[valid]) % 360.0), 4),
        "valid_pixel_ratio": round(float(valid.mean()), 4),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("dir", help="l2dbpc FITSが入ったディレクトリ")
    ap.add_argument("out", help="出力JSONパス")
    args = ap.parse_args()
    files = sorted(glob.glob(os.path.join(args.dir, "*.fit")))
    results = [r for r in (extract_one(p) for p in files) if r]
    with open(args.out, "w") as f:
        json.dump({
            "description": "ONC画像の視野中心緯度経度(l2dbpcバックプレーンから抽出)",
            "source": "JAXA/ISAS/DARTS ONC bundle v03c (https://darts.isas.jaxa.jp/pub/hayabusa2/onc_bundle/)",
            "note": "center_lat/lonは有効ピクセルの中央値。正確な視野中心が必要な場合はSPICEで計算すること",
            "images": results,
        }, f, ensure_ascii=False, indent=1)
    print(f"OK: {len(results)} images -> {args.out}")


if __name__ == "__main__":
    main()
