"""features.json（地名・イベント注釈マスタ）の整合テスト。点群そのものは読まず、生成済みJSONだけを検査する（高速）。
実行: python3 -m unittest discover -s tools/precompute/tests -p 'test_features.py'
"""
import json, math, re, unittest
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
F = json.loads((ROOT / "12_site_data" / "features.json").read_text(encoding="utf-8"))
POI = {p["id"]: p for p in json.loads((ROOT / "12_site_data" / "poi_master.json").read_text(encoding="utf-8"))["poi"]}
IAU = {f["name"]: f for f in json.loads((ROOT / "06_timeline_text" / "ryugu_surface_points.json").read_text(encoding="utf-8"))["iau_named_features"]}
EVENTS = {e["id"] for e in json.loads((ROOT / "12_site_data" / "event_asset_links.json").read_text(encoding="utf-8"))["events"]}
KINDS = set(F["kind_labels"])
FEATS = F["features"]
BY_ID = {f["id"]: f for f in FEATS}


class FeaturesJson(unittest.TestCase):
    def test_unique_ids_and_known_kinds(self):
        self.assertEqual(len(BY_ID), len(FEATS))
        for f in FEATS:
            self.assertIn(f["kind"], KINDS, f["id"])

    def test_every_poi_and_iau_name_is_covered(self):
        # 「タッチダウン地点など、地上でのイベントに含まれる重要な場所はすべて収録」の確認
        for pid in ("td1", "td2", "sci_crater", "mascot_landing", "minerva_ii1", "tm_a", "tm_b", "candidate_l08", "candidate_s01", "ryujin_dorsum", "otohime_saxum", "urashima_crater"):
            self.assertTrue(any(pid == f["id"] or pid.replace("_crater", "") == f["id"] for f in FEATS), f"poi {pid} が注釈にない")
        have = {f["iau"]["diameter_km"] and f["name_en"] for f in FEATS if f.get("iau")}
        self.assertEqual(have, set(IAU), "IAU承認13地名がすべて入っていること")
        self.assertEqual(len(IAU), 13)

    def test_coordinates_match_sources(self):
        for f in FEATS:
            if not f["placed"]:
                self.assertIsNone(f["lat"], f["id"]); continue
            self.assertTrue(-90 <= f["lat"] <= 90, f["id"])
            self.assertTrue(0 <= f["lon"] < 360, f["id"])
            if f.get("iau"):
                i = IAU[f["name_en"]]
                self.assertEqual((f["lat"], f["lon"]), (round(i["latitude_deg"], 4), round(i["longitude_deg"], 4)), f["id"])
                self.assertAlmostEqual(f["radius_m"], i["diameter_km"] * 500, places=1) if f["shape"] == "cap" else None
            for pid, p in POI.items():
                if pid == f["id"] and p.get("latitude_deg") is not None:
                    self.assertEqual((f["lat"], f["lon"]), (round(p["latitude_deg"], 4), round(p["longitude_deg"], 4)), f["id"])

    def test_every_placed_feature_has_extent_and_sources(self):
        for f in FEATS:
            if f["placed"]:
                self.assertGreater(f["radius_m"], 0, f["id"])
                self.assertTrue(f["extent_note"], f["id"])
                self.assertTrue(f["sources"], f"{f['id']} に出典がない")
                self.assertIn(f["shape"], ("cap", "band"))

    def test_events_dates_parse_and_event_ids_exist(self):
        for f in FEATS:
            for e in f["events"]:
                datetime.strptime(e["utc"], "%Y-%m-%dT%H:%M:%SZ")
                self.assertIn(e["precision"], ("second", "minute", "date"))
                self.assertTrue(e["title"] and e["text"])
            for eid in f["event_ids"]:
                self.assertIn(eid, EVENTS, f"{f['id']}: event_id {eid} が event_asset_links にない")

    def test_touchdown_times_match_published_values(self):
        # 公表値: TD1 接地 2019-02-22 07:29:10 JST / SCI 起爆 2019-04-05 11:36 JST / TD2 2019-07-11 10:06:18 JST
        self.assertEqual(BY_ID["td1"]["events"][0]["utc"], "2019-02-21T22:29:10Z")
        self.assertEqual(BY_ID["sci_crater"]["events"][0]["utc"], "2019-04-05T02:36:00Z")
        self.assertEqual(BY_ID["td2"]["events"][0]["utc"], "2019-07-11T01:06:18Z")

    def test_frame_check_is_small(self):
        c = F["frame_check"]
        self.assertGreater(c["n_points"], 1_000_000)
        self.assertLess(abs(c["median_diff_m"]), 3.0)
        self.assertLess(c["std_diff_m"], 5.0)
        self.assertLess(c["p95_abs_diff_m"], 8.0)

    def test_craters_are_depressions_in_point_cloud(self):
        craters = [f for f in FEATS if f["kind"] == "crater"]
        self.assertEqual(len(craters), 7)
        for f in craters:
            self.assertGreater(f["evidence"]["rim_minus_centre_m"], 0, f"{f['id']}: 縁が中心より高いこと")
            self.assertIn("点群", f["evidence_ja"])

    def test_saxa_are_bumps_in_point_cloud(self):
        for f in (x for x in FEATS if x["kind"] == "saxum"):
            self.assertLess(f["evidence"]["rim_minus_centre_m"], 0, f"{f['id']}: 中心が周囲より高いこと")

    def test_ridge_band_is_the_measured_half_width(self):
        d = BY_ID["ryujin_dorsum"]
        self.assertEqual(d["shape"], "band")
        self.assertAlmostEqual(d["band_half_lat_deg"], round(F["ridge"]["half_width_lat_deg"] * 2) / 2)
        self.assertTrue(8 <= d["band_half_lat_deg"] <= 16)
        self.assertGreater(F["ridge"]["peak_radius_m"], F["ridge"]["base_radius_m"] + 30)

    def test_mascot_cp1_coordinates_are_in_poi_master_text(self):
        self.assertIn("-22.595S, 314.914E", POI["mascot_landing"]["accuracy"])
        f = BY_ID["mascot_cp1"]
        self.assertEqual((f["lat"], f["lon"]), (-22.595, 314.914))

    def test_text_has_no_unfinished_markers(self):
        for f in FEATS:
            for k in ("name_ja", "short_ja", "summary_ja", "evidence_ja"):
                self.assertTrue(f.get(k), f"{f['id']}.{k}")
                self.assertNotRegex(f[k], r"TODO|XXX|\?\?\?")


if __name__ == "__main__":
    unittest.main()
