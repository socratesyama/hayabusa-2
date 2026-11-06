# データ更新ログ

DARTS・JAXA公式サイトの更新に追従するための管理方法と、本フォルダ作成時の記録。

## 更新チェックの頻度と対象

| 対象 | 確認先 | 頻度 |
|---|---|---|
| ONCバンドルの新バージョン | https://darts.isas.jaxa.jp/pub/hayabusa2/onc_bundle/ (Readme.txtのバージョン履歴) | 四半期ごと |
| SPICEカーネル | https://darts.isas.jaxa.jp/datasets/hyb2_spice_v001 | 四半期ごと |
| リュウグウ試料データ | https://darts.isas.jaxa.jp/datasets/curation-ryugu-samples | 四半期ごと |
| 形状モデル・地図 | DARTS各データセットページ | 半年ごと |
| IAU地名(新承認) | https://planetarynames.wr.usgs.gov/Page/Ryugu/target | 半年ごと |
| JAXA公式発表(新成果) | https://global.jaxa.jp/projects/sat/hayabusa2/topics.html | 月次 |

## 更新時の手順

1. 上位データを更新したら `09_manifests/data_manifest.md` に取得日・バージョンを記録
2. `12_site_data/provenance/source_registry.csv` の retrieved_date を更新
3. 座標・時刻に影響する更新の場合、`poi_master.json` の該当項目を出典付きで更新
4. 生成物(タイル・標高マップ・LOD)は `conversion/` のスクリプトで再生成
5. 本ファイルに追記(下記の形式)

## 変更履歴

### 2026-11-06(初回作成)

- `poi_master.json`: POI 12件を作成。座標・時刻の出典は JAXA記者説明会資料(2019-03-05, 2019-06-11, 2019-07-25)、ISASトピックス、Science 368, 67-71 (Arakawa et al. 2020)、Proc. Jpn. Acad. Ser. B 98, 277 (Nakamura et al. 2022)、A&A 632, A67-A68 (Scholten et al. 2019)、Icarus 368, 114592 (Yoshimitsu et al. 2021) で裏取り。
- `samples_metadata.json`: 試料8種のメタデータを作成。Yada et al. 2021 Nature Astronomy と ISAS地球外試料キュレーションセンターで裏取り。
- `event_asset_links.json` / `image_location_map.json`: リポジトリ内データとの対応を作成。
- `education/`: クイズ10問・ミッション5本・誤解訂正8種・年齢別ガイドを作成。
- `provenance/`: 出典レジストリ(CSV)とライセンス規則(JSON)を作成。
- `conversion/` + `generated/`: タイル(425枚、5地図×z0-z3)、標高・法線マップ(1024/2048px)、LOD・コリジョンメッシュを生成。
- MINERVA-II1着陸地点の精密座標は未公表のため null とし、推測で埋めていない。
