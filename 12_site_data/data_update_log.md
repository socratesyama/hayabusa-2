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

### 2026-11-06(品質修正)

- `conversion/build_quadtree_tiles.py`: 2:1正距円筒図法のタイル分割を修正。旧来の正方形分割(2^z×2^z)では経度方向が圧縮され3D貼り付け時に歪むため、x=2^(z+1)×y=2^z 分割(元画像上で正方形タイル)に変更。全タイルを再生成(425枚→850枚、5地図×170枚)。
- `conversion/build_heightmap_normal.py`: 経度0/360°境界をまたぐ三角形の描画を修正(旧:境界外をクリップ→反対端に描かず、穴を近傍最大値で埋めていた。境界の不連続は中央値0.32m/最大5.58m)。新:シーム跨ぎ座標のままラスタライズし両端に描画(境界列差 中央値0.11m≒内部隣接列差0.10m)。法線マップの経度勾配も周期差分に変更。補間統計(補間px数・膨張距離・最近傍頂点との誤差)をmetaに記録(2048px版: 補間8,778px=0.42%、最大膨張2px、誤差中央値3.0m/最大9.3m)。標高・法線マップ(1024/2048px)を再生成。
- `education/quizzes.json`: q08(オトヒメ・サクスムの直径)の正解番号を修正(0→1。正解は「約160m」、解説と整合。USGS地名データ0.16kmと整合)。
- `samples_metadata.json`: 試料総量5.424gとA+B+Cの和5.275gの差(約0.15g)について、数値を変更せず注記を追加(キャッチャ全体計量 vs 室別計量の差=「その他」分+不確かさ。JAXA記者説明会2021-12-06、Nakato et al. 2022 doi:10.2343/geochemj.GJ22017 を出典に追加)。
- `11_spacecraft_model/LICENSE` を追加(MIT。source_registry.csv SRC013が参照)。ルートREADME.mdの探査機モデル記述を修正(80パーツ→136パーツ・88,288面、11_spacecraft_model/README.mdとparts_list.json=136と整合)。
- `provenance/source_registry.csv`: SRC013のライセンス表記を実際のLICENSEファイル(11_spacecraft_model/LICENSE)に対応する形に修正。
