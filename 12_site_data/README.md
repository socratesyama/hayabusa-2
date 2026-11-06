# 12_site_data — WASD探索型・教育サイト構築用データ一式

このフォルダは、リポジトリ収録データを「歩ける・学べるサイト」に変換するための不足データを補完するもの。
前回の要件(用語説明を除く)に対応する。すべての事実データに出典を付与済み。

## 構成

| パス | 内容 | 前回指摘した不足への対応 |
|---|---|---|
| `poi_master.json` | 地点(POI)マスタ。TD1/TD2/SCI/MASCOT/MINERVA-II1/TM投下地点/候補地点/主要IAU地形。座標・日時・精度・教育フック・出典付き | 「地点マスタ(POI)」 |
| `event_asset_links.json` | 出来事↔画像↔試料↔MASCOTデータ↔3Dモデル↔SPICEの双方向リンク | 「イベント↔画像↔試料のリンク」 |
| `samples_metadata.json` | 試料8種(A0002〜C0007)の採取地点・データ対応・科学的意義・出典 | 「試料の来歴データ」 |
| `image_location_map.json` | 画像↔リュウグウ座標の対応(イベント単位+1枚単位の抽出方法) | 「画像↔座標の対応表」 |
| `education/quizzes.json` | クイズ10問(小中学生/中高生〜一般の2難易度) | 「クイズデータ」 |
| `education/mission_scenarios.json` | 学習ミッション5本(観察士・試料追跡・MASCOT体験・探査機視点・フルツアー) | 「ミッションシナリオ」 |
| `education/misconceptions.json` | よくある誤解8種と訂正(出典付き) | 「よくある誤解と訂正」 |
| `education/age_tier_guide.md` | 年齢3段階(のんびり/じっくり/せんもん)の表示設計指針 | 「年齢別の説明文」 |
| `provenance/source_registry.csv` | 全データの出典・ライセンス・クレジットの機械可読レジストリ | 「出典・ライセンスの機械可読版」 |
| `provenance/license_registry.json` | クレジット自動表示用のライセンス規則 | 同上 |
| `conversion/` | 変換スクリプト4種+README(タイル/標高・法線/LOD・当たり判定/画像ジオメトリ) | 「ブラウザ用タイル」「LOD」「法線・高度」「当たり判定」 |
| `generated/` | スクリプト実行済みの生成物(タイル425枚、標高・法線マップ、LOD・コリジョンメッシュ) | 同上 |
| `performance_budget.md` | 表示性能の予算・目標値 | 「パフォーマンス予算」 |
| `accessibility.md` | アクセシビリティ対応 | 「アクセシビリティ情報」 |
| `data_update_log.md` | データ更新履歴の管理方法 | 「データ更新履歴」 |

## データの信頼性について

- 座標・時刻・精度は、JAXA記者説明会資料・ISASトピックス・査読論文(Science, Nature Astronomy, A&A, Icarus, Proc. Jpn. Acad. Ser. B)で裏取り済み。
- 公開されていない値(MINERVA-II1着陸地点の精密座標など)は「非公開」と明記し、推測で埋めていない。
- TD2座標など複数の報告がある値は併記している。

## 使い方(サイト実装側)

1. 3Dシーンの初期化: `01_shape_models/` + `generated/`(タイル・LOD・コリジョン)
2. WASD移動の地形追従: `generated/ryugu_heightmap_2048.png` で足元の高度を参照
3. POIの配置・情報表示: `poi_master.json`
4. タイムライン・イベント連動: `event_asset_links.json` + `06_timeline_text/timeline.json`
5. 学習コンテンツ: `education/` 各ファイル
6. 出典表示: `provenance/source_registry.csv` + `license_registry.json` で自動付与
