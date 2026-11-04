# データマニフェスト(収集ファイル一覧・取得記録)

このZIPに含まれるデータと、**含めていない大容量データの入手先**を記録する。
取得日: 2026-11-03 / 取得元: JAXA DARTS (data.darts.isas.jaxa.jp), はやぶさ2プロジェクトサイト, 日本プラネタリウム協議会, JAXA地球外試料キュレーション

## ディレクトリ構成

```
hayabusa2_dataset/
├── README.md                      … このデータセットの説明
├── 01_shape_models/               … リュウグウ3D形状モデル(DSK/OBJ/重力係数)
├── 02_onc_images/                 … ONC画像(生データtgz + 公式ギャラリー厳選画像)
├── 03_spice/                      … SPICEカーネル(軌道・姿勢・時刻系)
├── 04_science_data/                … 科学可視化データ(地図プロダクト・試料画像)
├── 05_mascot/                     … MASCOT着陸機 MASCAM画像
├── 06_timeline_text/               … ミッション年表・概要・ファクトシート(テキスト)
├── 07_glossary_faq/                … 用語集・FAQ(テキスト)
├── 08_references/                  … 論文リスト・公式リンク・クレジット・ライセンス
└── 09_manifests/                   … 本ファイル
```

## 1. 形状モデル(01_shape_models/)

| ファイル | 内容 | 取得元 |
|---|---|---|
| ryugu_shape_spc_49k_v20200323.bds (+.xml) | SPC形状モデル 49k面 最終版(DSK形式) | DARTS hyb2_spice/dsk |
| ryugu_shape_spc_200k_v20200323.bds (+.xml) | SPC形状モデル 200k面 最終版(DSK形式) | 同上 |
| ryugu_shape_sfm_50k_v20200815.bds (+.xml) | SfM形状モデル 50k面(DSK形式) | 同上 |
| gravity_coefficients_SFM_49k_3.40.txt | 重力係数(自転周期3.40h用) | DARTS paper/Watanabe_2019 |
| gravity_coefficients_SFM_49k_7.63.txt | 重力係数(リュウグウ実自転7.63h用) | 同上 |
| gravity_Gf.h / gravity_GFandSlope.cpp | 重力計算ツール(ソース) | 同上 |
| web_ready_planetarium/… | Web・プラネタリウム用変換データ(OBJ 200k/800k、Y-up版、テクスチャ付きFBX、ベースマップTIFF) | 日本プラネタリウム協議会(CC BY) |

**未収録(大容量)**: ryugu_shape_sfm_3m_v20200815.bds(100MB・最大精度)、sfm/pc 800k版
→ https://data.darts.isas.jaxa.jp/pub/pds4/data/hyb2/hyb2_spice/spice_kernels/dsk/

## 2. ONC画像(02_onc_images/)

| ファイル | 内容 | 取得元 |
|---|---|---|
| onc_bundle_v03c/data_calibrated_l2c/20180626_l2c_v03c.tgz | リュウグウ到着時期の較正済みONC画像(約71MB) | DARTS ONC Bundle |
| onc_bundle_v03c/data_calibrated_l2c/20190222_l2c_v03c.tgz | 第1回タッチダウン(TD1)当日の較正済み画像(約24MB) | 同上 |
| onc_bundle_v03c/data_calibrated_l2c/20190405_l2c_v03c.tgz | SCI(人工クレーター)運用当日の較正済み画像(約4MB) | 同上 |
| onc_bundle_v03c/Eventlist.txt | 全観測イベント一覧(447行) | 同上 |
| onc_bundle_v03c/Readme.txt / RyuguViewingConditionRoughEstimate.csv | 説明・可視条件一覧 | 同上 |
| official_gallery_jaxa/navYYYYMMDD/*.jpg | プロジェクトサイトに掲載された厳選画像(16観測日分、フルサイズ) | www.hayabusa2.jaxa.jp |

**未収録(大容量)**: ONC L2C全期間アーカイブ(1日ごとのtgz。数百GB規模)
→ https://data.darts.isas.jaxa.jp/pub/hayabusa2/onc_bundle/data/v03c/data_calibrated_l2c/
代表日のサイズ例: 20180921(MINERVA-II1)=248MB / 20181003(MASCOT)=619MB / 20190425(人工クレーター観測)=185MB / 20190711(TD2)=372MB / 20191113(出発)=196MB

## 3. SPICEカーネル(03_spice/)

| 内容 | ファイル群 | 備考 |
|---|---|---|
| 探査機軌道(SPK) | hyb2_*.bsp 全11ファイル | 打上げ〜2023年までの全期間+リュウグウ星暦 |
| 惑星星暦 | hyb2_de430_de440.bsp | 地球等の位置計算用 |
| リュウグウ本体 | 2162173_ryugu_v02.bsp / ryugu_v10.tpc | 位置・自転・形状定数 |
| 姿勢(FK) | hyb2_hp/ryugu/mascot/shape_v01.tf | 座標系定義 |
| 機器情報(IK) | ONC/LIDAR/NIRS3/TIR/MASCOT用 | 視野・取付角 |
| 時刻系 | hyb2_20230214_v01.tsc(SCLK) / naif0012.tls(LSK) | 探査機時刻↔UTC変換 |
| メタカーネル | hyb2_2018/2019/2020_v02.tm | ロード用まとめ |

**未収録**: 姿勢履歴(CK, 数GB規模)・予測CK。必要時は
→ https://data.darts.isas.jaxa.jp/pub/pds4/data/hyb2/hyb2_spice/spice_kernels/ck/

## 4. 科学可視化データ(04_science_data/)

| 内容 | ファイル |
|---|---|
| リュウグウ全球ベースマップ(v帯) | map_products/01, 02(2枚組、JPG+GeoTIFF) |
| 低緯度高解像度ベースマップ | map_products/03(JPGのみ。GeoTIFF 128MBは未収録) |
| 正反射率カラー/モノクロ地図 | map_products/04, 05 |
| 可視分光スロープ地図 | map_products/06 |
| 熱慣性地図(TIR) | map_products/07(JPG+GeoTIFF+凡例) |
| リュウグウ試料顕微鏡画像 | ryugu_samples/A0002, A0004, C0002-C0007(_resize.png) |

**未収録(大容量)**: TIR生データ、NIRS3生データ、LiDAR点群フルセット
→ https://data.darts.isas.jaxa.jp/pub/pds4/data/hyb2/(hyb2_tir / hyb2_nirs3 / hyb2_lidar)

## 5. MASCOT(05_mascot/)

MASCAM較正済み画像(Descent + MP_1b〜MP_3b、VIC形式+PDS4ラベル)。
未収録: MARA熱放射計・磁力計データ → DARTS hyb2_mascot_mara / hyb2_mascot_mag

## 6. テキスト資料(06〜08/)

ミッション年表(timeline.json/md)、概要、ファクトシート、地名一覧、用語集、FAQ、論文リスト、公式リンク、クレジット・ライセンス。すべてJAXA/ISAS公式情報に基づいて編集したもの。

## 7. 高精細点群(10_pointclouds/)— 追加収集 2026-11-04

| ファイル | 取得元 | 備考 |
|---|---|---|
| sfm_3m/SHAPE_SFM_3M_v20180804.obj | DARTS paper/Watanabe_2019 (data.darts.isas.jaxa.jp/pub/hayabusa2/paper/Watanabe_2019/) | SfM形状モデル3M面版・オリジナル(163MB、頂点1,579,014) |
| sfm_3m/ryugu_pointcloud_sfm3m_*.ply | 上記を当方でPLY点群化(m単位・ベースマップ色付き) | 157万点フル版+31.6万点Web軽量版 |
| lidar_l2_topo/hyb2_ldr_l2_aocsm_topo_ts_*.csv | DARTS LIDARバンドル L2地形時系列 (doi:10.17597/isas.darts/hyb2-00500) | 52ファイル、2018-06-30〜09-07 |
| lidar_l2_topo/ryugu_pointcloud_lidar_*.ply | 上記を結合した実測点群(396,649点) | 色=重心からの距離 |

## 8. 探査機本体3Dモデル(11_spacecraft_model/)— 作成 2026-11-04

| ファイル | 内容 |
|---|---|
| hayabusa2_spacecraft.glb / .obj / .stl | JAXA公開資料の寸法・機器構成に基づき当方で構築した非公式モデル(81パーツ・86,812面、PBRテクスチャ・法線マップ埋め込み済み)。サンプラホーンはISAS資料の公式仕様(長さ1m・直径20cmの円筒、下部・中部・上部ホーン+キャッチャ、先端折返し)に準拠 |
| parts_list.json / preview.png / build_hayabusa2_model.py | パーツ一覧・プレビュー・生成スクリプト |
| reference_docs/*.pdf | 出典: JAXAパンフレット・プレスキット・「はやぶさ2の模型を作るための情報 Ver.1.0」等(非公式モデル作成の根拠) |

※JAXAのはやぶさ2探査機本体の公式3Dモデルは2026-11時点で公開されていないため、公開資料から構築した非公式簡易モデルとして収録。

## バージョン管理の注意

- 使用したデータのバージョン(DSK v20200323等)・取得日(2026-11-03)・取得元URLをサイト側でも記録すること
- DARTSデータは改訂されることがあるため、公開前に最新版の確認を推奨
