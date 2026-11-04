# 10_pointclouds — リュウグウ 高精細点群データ

リュウグウの「高精細点群」を目的別に3系統収録したフォルダ。

## 構成

### sfm_3m/ — 形状モデル由来の最高精細点群(157万点)

| ファイル | 内容 |
|---|---|
| SHAPE_SFM_3M_v20180804.obj | はやぶさ2 SfM形状モデル 3M面(300万三角形)版・オリジナルOBJ(163MB)。頂点数1,579,014。単位km |
| ryugu_pointcloud_sfm3m_1579k_xyz.ply | 上記を点群(PLY binary)に変換したもの。単位をmに変換済み |
| ryugu_pointcloud_sfm3m_1579k_color.ply | 同上+ONC v帯全球ベースマップ(hyb2_onc_Global_01_l3dm_v06)を頂点色として付与 |
| ryugu_pointcloud_sfm3m_316k_color_web.ply | 1/5間引きのWeb表示用軽量版(約31.6万点) |

- 出典: JAXA はやぶさ2プロジェクト(SfM形状モデル: 会津大学・神戸大学)、Watanabe et al. 2019 Science
- 取得元: DARTS `https://data.darts.isas.jaxa.jp/pub/hayabusa2/paper/Watanabe_2019/SHAPE_SFM_3M_v20180804.obj`
- 色: `04_science_data/map_products/01_ONC_v-band_Basemap1/hyb2_onc_Global_01_l3dm_v06.jpg`(等経緯度投影を頂点方向からサンプリング)

### lidar_l2_topo/ — LIDAR実測点群(探査機がレーザで実際に測った点)

| ファイル | 内容 |
|---|---|
| hyb2_ldr_l2_aocsm_topo_ts_*.csv | LIDARバンドル L2地形時系列データ52ファイル(2018-06-30〜2018-09-07)。11列: 時刻/距離/経度/緯度/高度/TOPO_XYZ/探査機位置XYZ |
| ryugu_pointcloud_lidar_2018jun-sep_xyz.ply | 全52ファイルのレーザ足跡点(TOPO_X/Y/Z)を結合した実測点群(396,649点、単位m) |
| ryugu_pointcloud_lidar_2018jun-sep_color.ply | 同上+重心からの距離を色付け(青=低地、黄=高地) |

- 出典: はやぶさ2 LIDARバンドル — DARTS DOI: [10.17597/isas.darts/hyb2-00500](https://doi.org/10.17597/isas.darts/hyb2-00500)
- 取得元: `https://data.darts.isas.jaxa.jp/pub/hayabusa2/lidar_bundle/data/Ryugu/l2/`
- 座標系: 小惑星固定座標系(asteroid-fixed)、単位m

## PLY形式について

- binary_little_endian 形式。x/y/z float32、色付き版はred/green/blue uint8。
- MeshLab・Blender・CloudCompare・three.js(PLYLoader)などでそのまま開けます。

## クレジット

- SfM 3M形状モデル: © JAXA はやぶさ2プロジェクト(会津大学・神戸大学による作成)
- LIDARデータ: © JAXA/ISAS/DARTS
- ベースマップ: © JAXA はやぶさ2プロジェクト ONCチーム
- ISASデータポリシー(CC BY 4.0、出典明記)に基づき使用。詳細は `08_references/credits_and_licenses.md`
