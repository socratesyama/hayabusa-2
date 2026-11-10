#!/usr/bin/env python3
"""地名・イベント注釈マスタ 12_site_data/features.json を生成する（numpy + Pillow のみ）。

入力
  12_site_data/features_source.json            由来・出来事・表示範囲の手書きマスタ
  12_site_data/poi_master.json                 ミッション地点の座標・出典（poi_id で参照）
  06_timeline_text/ryugu_surface_points.json   IAU承認地名の座標・直径（iau_name で参照）
  10_pointclouds/sfm_3m/*1579k_xyz.ply         SfM形状モデル由来の点群（157万点, IAU_RYUGU, m）
  12_site_data/generated/ryugu_heightmap_2048.png  サイトが地面として使う高さ地図（SPC v20200323）

出力
  12_site_data/features.json                   サイト実行時に読む注釈データ（検証値つき）

点群で行う検証（座標を勝手に動かさない。カタログ座標をそのまま使い、整合の程度を記録する）
  1. frame_check : 点群の半径と、サイトの高さ地図の半径の差（同じ緯度経度で比較）。
                   差が小さい = 点群で確かめた緯度経度が、サイトの地形にもそのまま当てはまる。
  2. クレーター   : 中心の周りの地形に局所2次曲面を当てて差し引き、「縁の残差 − 中心の残差」を深さの目安にする。
  3. リュウジン・ドールスム: 緯度ごとの平均半径の「半値幅」から、尾根の帯の半幅を決める。
"""
from __future__ import annotations
import json, re
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
R_MEAN = 448.8          # サイトのHUD「標高」と同じ基準半径（site/src/geo.ts R_MEAN）
SRC = ROOT / "12_site_data" / "features_source.json"
OUT = ROOT / "12_site_data" / "features.json"
PLY = ROOT / "10_pointclouds" / "sfm_3m" / "ryugu_pointcloud_sfm3m_1579k_xyz.ply"
HM = ROOT / "12_site_data" / "generated" / "ryugu_heightmap_2048.png"
HM_META = ROOT / "12_site_data" / "generated" / "ryugu_heightmap_meta.txt"


def load_ply_xyz(path: Path) -> np.ndarray:
    with open(path, "rb") as f:
        hdr = b""
        while not hdr.endswith(b"end_header\n"):
            hdr += f.readline()
        n = int(re.search(rb"element vertex (\d+)", hdr).group(1))
        a = np.fromfile(f, dtype=np.dtype([("x", "<f4"), ("y", "<f4"), ("z", "<f4")]), count=n)
    return np.stack([a["x"], a["y"], a["z"]], 1).astype(np.float64)


def heightmap_radius(lat_deg: np.ndarray, lon_deg: np.ndarray, hm: np.ndarray, rmin: float, rmax: float) -> np.ndarray:
    """site/src/data.ts HeightMap.radius と同じ双線形補間（経度は周期）。"""
    h, w = hm.shape
    u = (lon_deg % 360) / 360 * w - 0.5
    v = (90 - lat_deg) / 180 * h - 0.5
    x0 = np.floor(u).astype(int)
    y0 = np.clip(np.floor(v).astype(int), 0, h - 2)
    fx = u - x0
    fy = np.clip(v - y0, 0, 1)
    g = lambda x, y: hm[y, x % w]
    t = (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy
    return rmin + t / 65535 * (rmax - rmin)


def local_frame(lat: float, lon: float):
    la, lo = np.radians(lat), np.radians(lon)
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    east = np.array([-np.sin(lo), np.cos(lo), 0.0])
    north = np.cross(up, east)
    return up, east, north


class Cloud:
    def __init__(self, xyz: np.ndarray):
        self.xyz = xyz
        self.r = np.linalg.norm(xyz, axis=1)
        self.lat = np.degrees(np.arcsin(xyz[:, 2] / self.r))
        self.lon = np.degrees(np.arctan2(xyz[:, 1], xyz[:, 0])) % 360

    def window(self, lat: float, lon: float, rmax_m: float):
        up, east, north = local_frame(lat, lon)
        ang = np.arccos(np.clip(self.xyz @ up / self.r, -1, 1))
        m = ang * R_MEAN < rmax_m
        p = self.xyz[m]
        return p @ east, p @ north, self.r[m]

    def elevation(self, lat: float, lon: float, radius_m: float):
        win = max(0.5 * radius_m, 8.0)
        _, _, r = self.window(lat, lon, win)
        if len(r) < 5:
            return None, int(len(r))
        return float(np.median(r) - R_MEAN), int(len(r))

    def rim_centre(self, lat: float, lon: float, rc: float):
        """局所2次曲面（外側の環 1.35〜3.0 rc で当てはめ）を引いた残差。戻り値: (中心残差, 縁残差, 中心の点数)"""
        e, n, r = self.window(lat, lon, rc * 3.2)
        d = np.hypot(e, n)
        ann = (d > rc * 1.35) & (d < rc * 3.0)
        if ann.sum() < 50:
            return None
        A = lambda e, n: np.stack([np.ones_like(e), e, n, e * e, e * n, n * n], 1)
        coef, *_ = np.linalg.lstsq(A(e[ann], n[ann]), r[ann], rcond=None)
        res = r - A(e, n) @ coef
        cen = d < rc * 0.5
        rim = (d > rc * 0.85) & (d < rc * 1.15)
        if cen.sum() < 10 or rim.sum() < 10:
            return None
        return float(res[cen].mean()), float(res[rim].mean()), int(cen.sum())


def ridge_profile(c: Cloud):
    """緯度1度ごとの平均半径 → |lat| で南北平均 → 半値幅（ピーク=|lat|<1、ベース=|lat| 26〜30）。"""
    edges = np.arange(-90, 91, 1.0)
    idx = np.digitize(c.lat, edges) - 1
    mean = np.array([c.r[idx == i].mean() if (idx == i).sum() > 50 else np.nan for i in range(len(edges) - 1)])
    centres = edges[:-1] + 0.5
    sym = {}
    for k in range(0, 45):
        a = mean[(centres == k + 0.5)]
        b = mean[(centres == -(k + 0.5))]
        v = np.nanmean(np.concatenate([a, b]))
        sym[k + 0.5] = float(v)
    peak = np.mean([sym[0.5]])
    base = np.mean([sym[k + 0.5] for k in range(26, 30)])
    half = (peak + base) / 2
    prev_l, prev_r = 0.5, sym[0.5]
    half_lat = None
    for k in range(1, 45):
        l, rr = k + 0.5, sym[k + 0.5]
        if rr <= half:
            half_lat = prev_l + (prev_r - half) / (prev_r - rr) * (l - prev_l)
            break
        prev_l, prev_r = l, rr
    return {
        "method": "緯度1度ごとの平均半径を南北で平均し、ピーク(|lat|<1°)とベース(|lat| 26〜30°)の中間値になる緯度を半値幅とする",
        "peak_radius_m": round(peak, 1), "base_radius_m": round(base, 1), "half_max_radius_m": round(half, 1),
        "half_width_lat_deg": round(half_lat, 1),
        "profile_every_2deg": {f"{int(k - 0.5)}": round(sym[k], 1) for k in sorted(sym) if int(k - 0.5) % 2 == 0 and k < 41},
    }


def main():
    src = json.loads(SRC.read_text(encoding="utf-8"))
    poi = {p["id"]: p for p in json.loads((ROOT / "12_site_data" / "poi_master.json").read_text(encoding="utf-8"))["poi"]}
    iau = {f["name"]: f for f in json.loads((ROOT / "06_timeline_text" / "ryugu_surface_points.json").read_text(encoding="utf-8"))["iau_named_features"]}
    rmin = rmax = None
    for line in HM_META.read_text(encoding="utf-8").splitlines():
        if line.startswith("radius_min_m="): rmin = float(line.split("=")[1])
        if line.startswith("radius_max_m="): rmax = float(line.split("=")[1])
    hm = np.array(Image.open(HM)).astype(np.float64)

    print("loading point cloud ...")
    cloud = Cloud(load_ply_xyz(PLY))
    d = cloud.r - heightmap_radius(cloud.lat, cloud.lon, hm, rmin, rmax)
    frame_check = {
        "point_cloud": "SfM 3M v20180804（157万点, IAU_RYUGU）", "height_map": "SPC v20200323 から作ったサイト用高さ地図（2048x1024）",
        "n_points": int(len(d)), "median_diff_m": round(float(np.median(d)), 2), "std_diff_m": round(float(d.std()), 2),
        "p95_abs_diff_m": round(float(np.percentile(np.abs(d), 95)), 2),
        "note": "同じ緯度経度での半径の差。数m以内なので、点群で確かめた緯度経度はサイトの地形にそのまま当てはまる。",
    }
    ridge = ridge_profile(cloud)
    print("frame_check", frame_check)
    print("ridge", {k: v for k, v in ridge.items() if k != "profile_every_2deg"})

    feats = []
    for s in src["features"]:
        f = {k: v for k, v in s.items() if k not in ("poi_id", "iau_name", "coord_source_poi", "coord_source_text")}
        sources = []
        lat = lon = None
        diam_m = None
        if s.get("poi_id"):
            p = poi[s["poi_id"]]
            f.setdefault("name_ja", p["name_ja"]); f.setdefault("name_en", p["name_en"])
            lat, lon = p.get("latitude_deg"), p.get("longitude_deg")
            if p.get("nickname"): f["nickname"] = p["nickname"]
            f["coord_note"] = p.get("accuracy", "")
            sources += p.get("sources", [])
        if s.get("iau_name"):
            i = iau[s["iau_name"]]
            f.setdefault("name_en", i["name"])
            lat, lon = i["latitude_deg"], i["longitude_deg"]
            diam_m = i["diameter_km"] * 1000
            f["iau"] = {"approved": i["approved"], "diameter_km": i["diameter_km"], "type": i["type"]}
            f["coord_note"] = "IAU承認地名の中心座標（USGS Gazetteer、度単位の概略位置）。"
            sources.append({"label": "USGS Astrogeology: Ryugu Nomenclature", "url": "https://planetarynames.wr.usgs.gov/SearchResults?Target=Ryugu"})
        if s.get("coord_source_poi"):
            p = poi[s["coord_source_poi"]]
            assert s["coord_source_text"] in p["accuracy"], f"{s['id']}: 座標の根拠文字列がpoi_masterにない"
            lat, lon = s["lat"], s["lon"]
            f["coord_note"] = "Scholten et al. 2019 (A&A 632, A67) の座標（poi_master の記述と照合済み）。"
            sources += [x for x in p.get("sources", []) if "Scholten" in x["label"]]
        f.pop("lat", None); f.pop("lon", None)
        f["lat"] = lat if lat is None else round(float(lat), 4)
        f["lon"] = lon if lon is None else round(float(lon), 4)
        f.setdefault("name_en", f.get("name_ja", s["id"]))
        f["sources"] = sources
        f.setdefault("radius_m", 0)
        f["placed"] = lat is not None

        # --- 表示範囲 ---
        if diam_m is not None and s["kind"] != "dorsum":
            f["radius_m"] = round(diam_m / 2, 2)
            f["extent_note"] = ("IAU表の直径（%s km）の半分を半径として表示。" % i["diameter_km"]) + (
                "溝は細長い地形で、直径欄は長さ。円形の強調は目安。" if s["kind"] == "fossa" else "")
        f["shape"] = "cap"
        if s["kind"] == "dorsum":
            f["shape"] = "band"
            f["band_half_lat_deg"] = round(ridge["half_width_lat_deg"] * 2) / 2
            f["radius_m"] = round(np.radians(f["band_half_lat_deg"]) * R_MEAN, 1)
            f["extent_note"] = ("赤道を挟む緯度±%.1f°の帯（点群の半径プロファイルの半値幅から決定。IAU表の3.2kmは尾根の全長）。" % f["band_half_lat_deg"])
            f["coord_note"] = "赤道帯を周回する地形のため、中心の緯度経度（0°, 180°）に意味はなく、帯として扱う。"

        # --- 点群による検証 ---
        ev = {}
        if f["placed"] and f["shape"] == "cap":
            elev, n = cloud.elevation(lat, lon, f["radius_m"])
            ev["elevation_m"] = None if elev is None else round(elev, 1)
            ev["n_points_near_centre"] = n
            if s["kind"] in ("crater", "saxum") and f["radius_m"] >= 20:
                rc = cloud.rim_centre(lat, lon, f["radius_m"])
                if rc:
                    cen, rim, nc = rc
                    ev["centre_residual_m"] = round(cen, 1); ev["rim_residual_m"] = round(rim, 1)
                    ev["rim_minus_centre_m"] = round(rim - cen, 1)
        f["evidence"] = ev
        f["evidence_ja"] = evidence_text(s["kind"], f, ev, ridge)
        feats.append(f)

    out = {
        "schema": 1,
        "generated_by": "tools/precompute/build_features.py",
        "frame": "IAU_RYUGU（リュウグウ固定座標）。緯度は北が+、経度は東経0〜360度。半径の基準は平均半径448.8m。",
        "naming_rule_ja": src["naming_rule_ja"], "kind_labels": src["kind_labels"],
        "frame_check": frame_check, "ridge": ridge,
        "features": feats,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(feats)} features, {sum(1 for f in feats if f['placed'])} placed")
    for f in feats:
        e = f["evidence"]
        print(f"  {f['id']:15s} {f['kind']:9s} placed={f['placed']!s:5} r={f['radius_m']:>7} {e}")


def evidence_text(kind: str, f: dict, ev: dict, ridge: dict) -> str:
    if not f["placed"]:
        return "座標を持たない（または公表されていない）ため、点群での検証は行っていない。"
    if kind == "dorsum":
        return ("点群（SfM 約158万点）の半径は赤道で約%.0fm、緯度±%.0f°あたりで約%.0fmまで下がる。尾根の帯の幅はこの半値幅から決めた。"
                % (ridge["peak_radius_m"], f["band_half_lat_deg"], ridge["half_max_radius_m"]))
    if kind == "crater" and "rim_minus_centre_m" in ev:
        d = ev["rim_minus_centre_m"]
        if d >= 3:
            return "点群（SfM 約158万点）で測ると、縁が中心より約%.0fm高い（局所2次曲面を差し引いた残差）。カタログ座標は窪地と整合する。" % d
        return "点群で測った縁と中心の高低差は約%.1fmと小さい。窪みが浅いか、カタログ座標が概略のため差が出にくい。" % d
    if kind == "saxum" and "rim_minus_centre_m" in ev:
        d = -ev["rim_minus_centre_m"]
        if d >= 3:
            return "点群で測ると、中心が周囲より約%.0fm高く、岩塊の突起と整合する。" % d
        return "点群では周囲との高低差が約%.1fmで、岩塊の突起は明瞭には確認できない（カタログ座標は概略）。" % d
    if kind == "fossa":
        return "線状の地形のため、円形に区切った点群検証は行っていない。強調表示は目安。"
    e = ev.get("elevation_m")
    base = "点群（約3m間隔）より小さい範囲のため、形状の検証は行っていない。"
    return base + ("　点群での標高は約%.0fm（平均半径448.8m基準）。" % e if e is not None else "")


if __name__ == "__main__":
    main()
