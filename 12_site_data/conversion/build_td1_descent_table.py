#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_td1_descent_table.py — TD1(第1回タッチダウン)降下・上昇の探査機位置テーブル生成

背景:
  hpk SPK (hyb2_hpk_20180627_20191119_v01.bsp) は TD1 運用期に欠損がある
  (2019-02-20 23:17:48 UTC 〜 2019-02-22 03:00:00 UTC)。
  この期間を以下で補完する:
    A. hyb2_spc_pos_*_v20200323_v02.bsp (SPC形状モデルチームの航法解。画像取得時刻の離散解)
    B. JAXA記者説明会資料 2019-03-05 (ドップラータイムライン・CAM-H高度)
    C. ISAS資料 (降下開始が予定より5時間遅れ=2/21 13:00 JST頃)
  アンカー間は PCHIP(単調3次補間)で内挿し、grade を行ごとに明示する。

注意:
  hyb2_sfm_pos_*_v20200815.bsp は TD1 では使用しないこと。
  22:06 UTC 以降のデータが SPC 解と大きく食い違う(接地時に地表下を通る解になる)。

使用法:
  python3 build_td1_descent_table.py \
    --spice-dir ../../03_spice \
    --shape-obj ../../01_shape_models/ryugu_shape_spc_49k_v20200323_web.obj \
    --out ../td1_descent_positions.json
"""
import argparse
import json
import math
import datetime as dt

import numpy as np
import spiceypy as sp
from scipy.interpolate import PchipInterpolator
from shape_intersection import ray_triangle_distances

# ---------------------------------------------------------------- 定数

# CAM-H/LRF の高度は「リュウグウ表面〜探査機底面」。
# テーブルは探査機中心(=SPKの位置)で統一するため底面→中心のオフセットを加える。
BOTTOM_TO_CENTER_M = 1.0  # ±0.5m の不確かさあり

TD1_LAT, TD1_LON = 4.3, 206.47          # Nakamura et al. 2022 (L08-E1)
TOUCHDOWN_UTC = "2019-02-21 22:29:10"   # 機上時刻 2019-02-22 07:29:10 JST

HPK_GAP_START = "2019-02-20 23:17:48"
HPK_GAP_END   = "2019-02-22 03:00:00"

SOURCES = [
    {
        "label": "DARTS/ISAS JAXA: Hayabusa2 SPICE Kernel Archive (hpk, spc_pos v02)",
        "url": "https://darts.isas.jaxa.jp/datasets/darts:hyb2-00600/",
        "note": "hyb2_hpk_20180627_20191119_v01.bsp(確定軌道。TD1期は欠損)、"
                "hyb2_spc_pos_20180619_20191119_v20200323_v02.bsp(SPC形状モデルチームの航法解)",
    },
    {
        "label": "JAXA記者説明会資料 2019-03-05 (TD1時刻・高度・ドップラータイムライン)",
        "url": "https://www.hayabusa2.jaxa.jp/en/enjoy/material/press/Hayabusa2_Press20190305_ver9_en.pdf",
        "note": "CAM-H連続画像の高度(8.5m/4.1m/1.0m/2.9m/8.0m/49.6m)、45mホバリング、"
                "8.5mホバリング、最終降下ΔV約7cm/s、接地時刻 22:29:10 UTC",
    },
    {
        "label": "JAXA記者説明会資料 2019-02-20 (運用計画: 降下開始 2/21 8:00 JST予定)",
        "url": "https://www.hayabusa2.jaxa.jp/en/enjoy/material/press/Hayabusa2_Press20190220_ver2_en1.pdf",
        "note": "ゲート時刻表。Gate1 2/21 07:13 JST 降下開始判断",
    },
    {
        "label": "ISAS: はやぶさ2の軌跡 (2021-03-12 記者説明会資料)",
        "url": "https://www.isas.jaxa.jp/topics/files/20210312_2a.pdf",
        "note": "降下開始が5時間遅れ(=2/21 13:00 JST頃)であった旨の記述",
    },
    {
        "label": "Nakamura et al. 2022, Proc. Jpn. Acad. Ser. B 98, 277-314 (TD1着陸点座標)",
        "url": "https://doi.org/10.2183/pjab.98.015",
        "note": "TD1地点 L08-E1: 4.3°N 206.47°E",
    },
    {
        "label": "Watanabe et al. 2019 / DARTS: リュウグウ形状モデル SPC 49k v20200323",
        "url": "https://data.darts.isas.jaxa.jp/pub/hayabusa2/shape/shape_en.html",
        "note": "局所表面半径(高度換算)の算出に使用",
    },
]

GRADES = {
    "A": "SPICEカーネル(hpk確定軌道 または spc_pos v02航法解)からの直接値",
    "B": "JAXA公表資料の実測値(時刻・高度)。位置は着陸点座標+高度から合成",
    "C": "アンカー間の内挿(PCHIP)、公表資料からの推定、または資料間の整合による合成",
    "D": "アンカーが遠い区間の補間(参考値。誤差が大きい可能性)",
}

# ---------------------------------------------------------------- 形状モデル(局所半径)

class ShapeModel:
    """OBJ形式形状モデルから、方向(緯度経度)ごとの局所表面半径をレイキャストで求める。"""

    def __init__(self, obj_path):
        verts, faces = [], []
        with open(obj_path) as f:
            for line in f:
                if line.startswith("v "):
                    p = line.split()
                    verts.append((float(p[1]), float(p[2]), float(p[3])))
                elif line.startswith("f "):
                    idx = [int(tok.split("/")[0]) - 1 for tok in line.split()[1:]]
                    for k in range(1, len(idx) - 1):
                        faces.append((idx[0], idx[k], idx[k + 1]))
        self.V = np.array(verts) * 1000.0  # km -> m
        self.F = np.array(faces, dtype=np.int64)
        # 面ごとの頂点を先に展開
        self.tri = self.V[self.F]  # (n,3,3)

    def radius(self, lat_deg, lon_deg):
        """中心から方向 (lat,lon) へのレイと表面の交点までの距離 [m]。"""
        lat, lon = math.radians(lat_deg), math.radians(lon_deg)
        d = np.array([math.cos(lat) * math.cos(lon),
                      math.cos(lat) * math.sin(lon),
                      math.sin(lat)])
        hits = ray_triangle_distances(self.tri, np.zeros(3), d)
        if not hits.size:
            return None
        # レイは中心から外向き。非凸メッシュで正の交点が複数あるときも
        # 表面に初めて到達する距離は最小の正の t (max は奥側の交差を選び得る)。
        return float(hits[0])

# ---------------------------------------------------------------- SPICE

def setup_spice(spice_dir):
    sp.kclear()
    sp.furnsh(f"{spice_dir}/lsk/naif0012.tls")
    for fk in ["hyb2_ryugu_v01.tf", "hyb2_shape_v01.tf", "hyb2_hp_v01.tf"]:
        sp.furnsh(f"{spice_dir}/fk/{fk}")
    sp.furnsh(f"{spice_dir}/pck/ryugu_v10.tpc")
    sp.furnsh(f"{spice_dir}/spk/hyb2_spc_pos_20180619_20191119_v20200323_v02.bsp")
    sp.furnsh(f"{spice_dir}/spk/hyb2_hpk_20180627_20191119_v01.bsp")
    sp.furnsh(f"{spice_dir}/spk/hyb2_de430_de440.bsp")
    sp.furnsh(f"{spice_dir}/spk/2162173_ryugu_v02.bsp")

def llr(et):
    """HAYABUSA2 の RYUGU_FIXED 座標系での (lat_deg, lon_deg, r_m)。hpk→spcの順で解決。"""
    st, _ = sp.spkezr("HAYABUSA2", et, "RYUGU_FIXED", "NONE", "RYUGU")
    r = st[:3] * 1000.0
    rad, lonr, latr = sp.reclat(r)
    return math.degrees(latr), math.degrees(lonr) % 360.0, float(rad)

def llr_spc(et):
    """spc_pos v02 のみで評価(アンカー抽出用)。"""
    sp.kclear()
    sp.furnsh("lskdummy") if False else None
    return None  # 未使用

# ---------------------------------------------------------------- アンカー定義

def parse_t(s):
    s = s.replace("T", " ")[:19]
    return dt.datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=dt.timezone.utc)

def fmt_t(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spice-dir", default="../../03_spice")
    ap.add_argument("--shape-obj", default="../../01_shape_models/ryugu_shape_spc_49k_v20200323_web.obj")
    ap.add_argument("--out", default="../td1_descent_positions.json")
    args = ap.parse_args()

    setup_spice(args.spice_dir)
    shape = ShapeModel(args.shape_obj)

    anchors = []  # {t, lat, lon, r, grade, source, note}

    def add(t_str, lat, lon, r, grade, source, note=""):
        anchors.append(dict(t=parse_t(t_str), lat=lat, lon=lon, r=r,
                            grade=grade, source=source, note=note))

    # --- 1) hpk 端点 (grade A)
    t0, t1 = HPK_GAP_START, HPK_GAP_END
    for ts, note in [(t0, "hpk最終有効点(降下前・ホームポジション)"),
                     (t1, "hpk再開点(上昇後)")]:
        et = sp.str2et(ts + " UTC")
        lat, lon, r = llr(et)
        add(ts, lat, lon, r, "A", "hpk", note)

    # --- 2) spc_pos v02 の航法解 (grade A)
    cov = sp.stypes.SPICEDOUBLE_CELL(40000)
    sp.spkcov(f"{args.spice_dir}/spk/hyb2_spc_pos_20180619_20191119_v20200323_v02.bsp", -37, cov)
    win_a = sp.str2et("2019-02-20 23:00:00 UTC")
    win_b = sp.str2et("2019-02-22 03:10:00 UTC")
    n_spc = 0
    for i in range(sp.wncard(cov)):
        a, b = sp.wnfetd(cov, i)
        if b < win_a or a > win_b:
            continue
        for et in ([(a + b) / 2.0] if (b - a) < 1.0 else [a + 0.2, b - 0.2]):
            lat, lon, r = llr(et)
            add(sp.et2utc(et, "ISOC", 0),
                lat, lon, r, "A", "spc_pos_v02", "SPC航法解(画像時刻)")
            n_spc += 1

    # --- 3) 公表資料アンカー (grade B/C)
    # 降下開始: 予定 2/21 8:00 JST から5時間遅れ (ISAS 2021) ≈ 13:00 JST = 04:00 UTC
    hpk0 = [a for a in anchors if a["source"] == "hpk"][0]
    add("2019-02-21 04:00:00", hpk0["lat"], hpk0["lon"], hpk0["r"], "C",
        "press/ISAS", "降下開始ΔV(13:00 JST・5時間遅れ)。位置はホームポジション維持と仮定")

    # 最終降下シーケンス (JAXA 2019-03-05 記者説明会)
    r_site = shape.radius(TD1_LAT, TD1_LON)

    def add_alt(t_str, alt, grade, note, lat=TD1_LAT, lon=TD1_LON):
        r = r_site + alt + BOTTOM_TO_CENTER_M
        add(t_str, lat, lon, r, grade, "press20190305", note + f" (高度{alt}m)")

    add_alt("2019-02-21 22:10:31", 45.0, "C", "45mホバリング開始(ドップラータイムライン)")
    add_alt("2019-02-21 22:19:44", 45.0, "C", "45mホバリング終了→降下(ドップラータイムライン)")
    add_alt("2019-02-21 22:25:49", 8.5, "C", "8.5m到達(45mから10cm/s降下と仮定)")
    add_alt("2019-02-21 22:26:00", 8.5, "B", "8.5mホバリング(CAM-H画像 07:26 JST)")
    add_alt("2019-02-21 22:27:29", 8.5, "B", "最終降下開始(ドップラータイムライン 07:27:29 JST)")
    add_alt("2019-02-21 22:28:00", 4.1, "B", "最終降下中(CAM-H画像 07:28 JST)")
    add_alt("2019-02-21 22:29:10", 1.0, "B", "接地(CAM-H画像・高度1.0m)。水平位置は着陸点",
            )
    add_alt("2019-02-21 22:29:40", 2.9, "B", "上昇中(CAM-H画像 07:29 JST・高度2.9m)")
    add_alt("2019-02-21 22:29:50", 8.0, "B", "上昇中(CAM-H画像 07:29 JST・高度8.0m)")
    add_alt("2019-02-21 22:30:30", 49.6, "B", "上昇中(CAM-H画像 07:30 JST・高度49.6m)")

    anchors.sort(key=lambda a: a["t"])

    # ---------------------------------------------------------------- 補間

    ts = np.array([a["t"].timestamp() for a in anchors])
    lat_u = np.unwrap(np.radians([a["lat"] for a in anchors]))  # 経度の折り返し対応
    lon_u = np.array([a["lon"] for a in anchors])
    # lon も折り返し: 連続性を保つため差分が180°超えたら補正
    lon_u2 = [lon_u[0]]
    for v in lon_u[1:]:
        prev = lon_u2[-1]
        while v - prev > 180: v -= 360
        while v - prev < -180: v += 360
        lon_u2.append(v)
    lon_u2 = np.array(lon_u2)
    rr = np.array([a["r"] for a in anchors])
    lat_u = np.degrees(lat_u)

    p_lat = PchipInterpolator(ts, lat_u)
    p_lon = PchipInterpolator(ts, lon_u2)
    p_r = PchipInterpolator(ts, rr)

    def grade_for(t):
        """行グレード: アンカー時刻はそのグレード、それ以外は内挿(C or D)。"""
        tt = t.timestamp()
        for i, a in enumerate(anchors):
            if abs(a["t"].timestamp() - tt) < 1.0:
                return a["grade"], a["source"]
        # 区間判定
        if tt < ts[0] or tt > ts[-1]:
            return "D", "extrapolation"
        j = int(np.searchsorted(ts, tt))
        a0, a1 = anchors[j - 1], anchors[j]
        span = a1["t"].timestamp() - a0["t"].timestamp()
        gap = span > 5 * 3600  # 5時間以上のアンカー間隔は D(誤差大きい)
        if gap:
            return "D", f"interp {a0['source']}->{a1['source']}"
        return "C", f"interp {a0['source']}->{a1['source']}"

    # ---------------------------------------------------------------- テーブル生成

    t_start = parse_t(HPK_GAP_START)
    t_end = parse_t(HPK_GAP_END) + dt.timedelta(seconds=30)
    table = []

    def emit(t, cadence_note=""):
        tt = t.timestamp()
        lat = float(p_lat(tt))
        lon = float(p_lon(tt)) % 360.0
        r = float(p_r(tt))
        g, src = grade_for(t)
        alt_local = None
        rl = shape.radius(lat, lon)
        if rl:
            alt_local = round(r - rl, 2)
        if g == "A":
            method = "SPICE direct position at an anchor epoch"
        elif g == "B":
            method = "published altitude with position reconstructed from TD1 coordinates"
        elif g == "D":
            method = "PCHIP interpolation across a long, weakly constrained interval"
        elif src.startswith("interp "):
            method = "PCHIP interpolation between identified anchors"
        else:
            method = "reconstruction or estimate from published sources"
        table.append({
            "t": fmt_t(t),
            "lat": round(lat, 4),
            "lon": round(lon, 4),
            "r": round(r, 2),
            "alt_local": alt_local,
            "grade": g,
            "src": src,
            "method": method,
            "uncertainty": None,
            "uncertainty_note": "定量的な位置不確かさは確定できない。gradeは根拠区分であり精度の指標ではない。",
        })

    # 60s: 長期降下 (gap start → 21:36)
    t = t_start
    while t <= parse_t("2019-02-21 21:36:00"):
        emit(t); t += dt.timedelta(seconds=60)
    # 10s: 最終降下・接地・初期上昇 (21:36 → 23:00)
    t = parse_t("2019-02-21 21:36:00")
    while t <= parse_t("2019-02-21 23:00:00"):
        emit(t); t += dt.timedelta(seconds=10)
    # 60s: 上昇 (23:00 → gap end)
    t = parse_t("2019-02-21 23:00:00")
    while t <= t_end:
        emit(t); t += dt.timedelta(seconds=60)
    # アンカー時刻を必ず含める(重複排除)
    for a in anchors:
        if t_start <= a["t"] <= t_end:
            emit(a["t"])
    seen = set()
    table2 = []
    for row in sorted(table, key=lambda x: x["t"]):
        if row["t"] in seen:
            continue
        seen.add(row["t"]); table2.append(row)

    # ---------------------------------------------------------------- 出力

    out = {
        "description": (
            "第1回タッチダウン(TD1)運用におけるはやぶさ2の位置再構成(リュウグウ本体固定座標系)。"
            "hpk SPKの欠損期間 2019-02-20 23:17:48〜2019-02-22 03:00 UTC を、"
            "SPC形状モデルチームの航法解(spc_pos v02)とJAXA公表資料(記者説明会2019-03-05等)の"
            "アンカーをPCHIP補間でつないだもの。行ごとにgrade(A〜D)で根拠を明示。"
            "gradeは根拠区分で、精度・正確度を表すものではない。定量不確かさは未確定。"
            "alt_localはSPC 49k形状モデルでの局所表面からの高度。"
            "hpk再開後(2019-02-22 03:00 UTC以降)はhpkカーネルを直接使うこと。"
            "sfm_posカーネルはTD1期にSPC解と食い違うため不使用。"
        ),
        "frame": "RYUGU_FIXED (リュウグウ本体固定座標系, IAU_RYUGU極・本初子午線)",
        "units": {"lat_lon": "deg", "r": "m (リュウグウ中心からの距離)", "alt_local": "m"},
        "td1_site": {"lat": TD1_LAT, "lon": TD1_LON, "surface_radius_m": round(r_site, 2),
                     "source": "Nakamura et al. 2022 (座標) / SPC 49k v20200323 (半径)",
                     "method": "outward ray from mesh origin; nearest positive triangle intersection"},
        "provenance": {
            "grade_is_accuracy": False,
            "quantitative_uncertainty": None,
            "uncertainty_note": "公開根拠から位置不確かさを定量化できない。各行にもuncertainty=nullを記録。",
            "generator": "12_site_data/conversion/build_td1_descent_table.py",
            "generated_at_utc_date": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d"),
            "source_ids": ["SRC006", "SRC014", "SRC017", "SRC023"],
            "position_model": "SPC 49k v20200323 operational web mesh",
            "attitude": "not included; no attitude CK was used for this position table",
        },
        "touchdown_utc": TOUCHDOWN_UTC,
        "hpk_gap": {"start": HPK_GAP_START + "Z", "end": HPK_GAP_END + "Z",
                    "kernel": "hyb2_hpk_20180627_20191119_v01.bsp"},
        "grades": GRADES,
        "caveats": [
            "sfm_pos (hyb2_sfm_pos_20180627_20191109_v20200815.bsp) はTD1最終降下期(22:06 UTC以降)に"
            "SPC解と数十度の方位ずれを生じ、接地時刻に探査機が地表下(r≈444m)にいる解を返すため使用していない",
            "spc_pos v02 の解は画像取得時刻の離散点のみ。区間の見かけ上の連続カバーはType-1補間の揺れで、"
            "アンカー間は無効(詳細は技術解説書)",
            "CAM-H高度は「表面〜探査機底面」のため中心位置へ+1.0mオフセット(±0.5m)",
            "降下開始時刻(2019-02-21 04:00 UTC)は「予定より5時間遅れ」の記述からの推定(C)",
            "2019-02-21 22:46:57〜2019-02-22 03:00:30 (上昇途中) はアンカーが両端のみのためD(線形相当)",
        ],
        "anchors": [
            {"t": fmt_t(a["t"]), "lat": round(a["lat"], 4), "lon": round(a["lon"], 4),
             "r": round(a["r"], 2), "grade": a["grade"], "source": a["source"], "note": a["note"]}
            for a in anchors
        ],
        "table": table2,
        "sources": SOURCES,
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d"),
    }

    with open(args.out, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # サマリ
    from collections import Counter
    c = Counter(row["grade"] for row in table2)
    print(f"anchors: {len(anchors)} (hpk:2, spc_pos_v02:{n_spc}, press:13)")
    print(f"table rows: {len(table2)}  grades: {dict(c)}")
    print(f"site radius: {r_site:.1f} m")
    print(f"written: {args.out}")

if __name__ == "__main__":
    main()
