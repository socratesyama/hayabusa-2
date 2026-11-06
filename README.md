# はやぶさ2・リュウグウ ウェブサイト構築用 完全データセット

「どんな人でもわかりやすく楽しく、はやぶさ2に触れられる」ウェブページを構築するために必要な素材を一括収集したデータセット。収集日: 2026-11-03。

**重要**: 本データセットは非公式の制作素材であり、JAXA・ISASの公式提供物ではありません。サイト公開時は「非公式」であることと、各データの出典・クレジット(08_references/credits_and_licenses.md)を必ず明記してください。

## ディレクトリ構成

| フォルダ | 内容 | サイトでの使い方 |
|---|---|---|
| 01_shape_models/ | リュウグウ3D形状モデル。DSK(SPKICE)・Web用OBJ・テクスチャ付きFBX・重力係数(3.40h・7.63h版) | 3D表示(Three.js等)の本体。49k面=軽量、200k面=高品質 |
| 02_onc_images/ | ONC画像。科学データ(L2C tgz 9日分+幾何情報l2dbpc_latlon 4日分)・公式ギャラリー厳選画像783枚・インデックス | ヒーロー画像、ギャラリー、タッチダウン演出 |
| 03_spice/ | SPICEカーネル一式(軌道・時刻系・座標系) | 軌道アニメーション、観測幾何の再現 |
| 04_science_data/ | 全球ベースマップ・アルベド地図・熱慣性地図(JPG/GeoTIFF)・リュウグウ試料顕微鏡画像・FTIR・MicrOmegaデータ | 3Dテクスチャ、データレイヤー切替表示、試料紹介 |
| 05_mascot/ | MASCOT着陸機MASCAMの全較正画像・MARA/MAG較正データ | 「リュウグウ着陸体験」コンテンツ、着陸機の科学データ |
| 06_timeline_text/ | ミッション年表(JSON/MD)・探査機概要・リュウグウファクトシート・IAU地名一覧・着陸地点座標・観測運用サマリー | 年表UI、解説ページ本文、地図上の出来事表示 |
| 07_glossary_faq/ | 用語集・FAQ | 用語ツールチップ、FAQページ |
| 08_references/ | 論文リスト・公式リンク集・クレジット・ライセンス | 出典ページ、参考リンク |
| 09_manifests/ | データマニフェスト(収集記録・未収録大容量データの入手先)・追加データ一覧(拡張計画)・変換ツール | データ管理、拡張時のガイド |
| 10_pointclouds/ | リュウグウ高精細点群(SfM 3M=157万点+PLY、LIDAR実測39.6万点+PLY) | 点群表示、比較(形状モデル vs 実測) |
| 11_spacecraft_model/ | はやぶさ2本体の3Dモデル(GLB/OBJ/STL、80パーツ・PBRテクスチャ付き)+公式資料 | 探査機本体の3D表示、3Dプリント |
| 12_site_data/ | WASD探索型・教育サイト構築用データ一式。地点(POI)マスタ・出来事↔画像↔試料リンク・試料メタデータ・画像↔座標対応・クイズ/ミッション/誤解訂正・出典レジストリ・変換スクリプト・生成済みタイル/標高・法線マップ/LOD・当たり判定メッシュ | リュウグウを歩ける教育サイトの実装 |

## すぐ始めるには(MVP)

1. **3Dリュウグウ**: `01_shape_models/web_ready_planetarium/SHAPE_SFM_200k_v20180804_Y.obj.zip` を展開し、テクスチャ `04_science_data/map_products/01_ONC_v-band_Basemap1/hyb2_onc_Global_01_l3dm_v06.jpg` を貼って Three.js で表示
   - **高精細点群なら**: `10_pointclouds/sfm_3m/ryugu_pointcloud_sfm3m_316k_color_web.ply` を Three.js PLYLoader で読み込むだけ
   - **探査機本体なら**: `11_spacecraft_model/hayabusa2_spacecraft.glb` を GLTFLoader で読み込むだけ
   - さらに高品質な最終版は `01_shape_models/ryugu_shape_spc_200k_v20200323_web.obj`(本データセットでDSKから変換済み)
2. **年表**: `06_timeline_text/timeline.json` を読み込んでインタラクティブ年表に
3. **ギャラリー**: `02_onc_images/official_gallery_jaxa/` の783枚を日付順に表示(インデックス: `02_onc_images/gallery_index.md`)
4. **地図レイヤー**: `04_science_data/map_products/` のJPGを地図/テクスチャ切替表示
5. **解説テキスト**: `06_timeline_text/`・`07_glossary_faq/` をそのままページ本文に

## 主な収録データのバージョン(引用時に記録すること)

- 形状モデル: SPC v20200323(最終版)・SfM v20180804/v20200815
- ONC画像: v03c(較正済みL2C)
- SPICE: hyb2_spice_v001(2025-02-14版メタカーネル)
- 地図プロダクト: v06(ベースマップ)
- 取得日: 2026-11-03 / 取得元: data.darts.isas.jaxa.jp, www.hayabusa2.jaxa.jp, planetarium.jp, curation.isas.jaxa.jp

## 含めていない大容量データ(必要になったら)

- ONC全期間アーカイブ(数百GB)→ 09_manifests/data_manifest.md に代表日のURLとサイズあり
- LiDAR点群・TIR/NIRS3生データ → DARTSのPDS4バンドル
- 姿勢履歴CKカーネル(数GB)
- リュウグウ試料データベース(RS-DBS)の全データ → https://curation.isas.jaxa.jp/sample-curation/ryugu/

## ライセンス

- DARTS科学データ: ISASデータポリシー(CC BY 4.0、出典明記)
- JAXA公式画像: クレジット「©JAXA」表記。商用利用は要許諾
- 詳細: 08_references/credits_and_licenses.md
