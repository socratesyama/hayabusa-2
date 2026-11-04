# RYUGU — THE ASTEROID YOU CAN VISIT

はやぶさ2の公開科学データから、リュウグウを「読む」のではなく「触れて探索する」ためのインタラクティブなデータ体験サイトです。

## このブランチで実装したもの

- Three.jsによる3Dシーンと、SfM色付き点群（Web用約31.6万点）の表示
- LIDAR実測点群（396,649点）への切替
- はやぶさ2探査機のGLBモデル（81パーツ）への切替
- 5つの主要ミッションイベントを切り替えるタイムライン
- TD1・SCIクレーター・TD2の緯度経度表示と3D上の概略マーカー
- 現在の時間・座標・装置モードをURLクエリへ反映する共有リンク
- ブラウザ内のField Logとテキストレポート出力
- TIR熱慣性マップの静的プレビュー
- スマートフォン向けレイアウト、キーボード操作、prefers-reduced-motion対応

## 起動方法

このサイトはES Modulesとfetchでリポジトリ内のデータを読み込むため、`file://` ではなくHTTPサーバー経由で開いてください。

```bash
python -m http.server 8000
```

その後、ブラウザで `http://localhost:8000/` を開きます。Three.jsは固定バージョンをCDNから読み込みます。初回表示にはネットワーク接続が必要です。

## 使用データと表示上の注意

| 表示 | 実際に読み込むデータ | 注意 |
|---|---|---|
| ONC / Surface | `10_pointclouds/sfm_3m/ryugu_pointcloud_sfm3m_316k_color_web.ply` | SfM形状点群へONC v-band全球ベースマップの色を付与したもの。生のONC画像を3Dメッシュへ直接貼ったものではありません。 |
| LIDAR / Topography | `10_pointclouds/lidar_l2_topo/ryugu_pointcloud_lidar_2018jun-sep_color.ply` | LIDAR L2地形時系列を結合した実測点群。SfMとは別データセットであり、厳密な共登録表示ではありません。 |
| Hayabusa2 model | `11_spacecraft_model/hayabusa2_spacecraft.glb` | 公開資料をもとに作成された非公式の近似モデルであり、JAXAの設計CADではありません。 |
| TIR | `04_science_data/map_products/07_TIR_Thermal_Inertia/Thermal_Inertia_Map.jpg` | 静的な熱慣性マップのプレビューです。時間変化する表面温度や、3D表面へ登録されたTIRデータではありません。 |
| Timeline / coordinates | `06_timeline_text/timeline.json`, `06_timeline_text/ryugu_surface_points.json` | リポジトリ同梱の機械可読データを読み込みます。3D上の地点マーカーは表示用の概略投影で、厳密な観測視野再投影ではありません。 |

このMVPは、SPICEの連続軌道再生、CKによる高精度姿勢復元、TIR時系列温度アニメーション、LIDARとSfMの厳密な座標共登録までは実装していません。表示可能な範囲を超えて科学的再現を主張しないことを優先しています。

## クレジット・利用条件

サイト全体はJAXAの公式サイトではありません。画像・科学データ・モデルごとに提供元とライセンスが異なるため、公開・再配布時には `08_references/credits_and_licenses.md` と各提供元の最新ポリシーを必ず確認してください。JAXA公式画像には所定のクレジットが必要で、商用利用には許諾が必要となる場合があります。

主要なデータの出典・バージョン・取得記録は元データセットの `09_manifests/data_manifest.md` を参照してください。