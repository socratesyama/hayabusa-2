# 12_site_data — WASD探索型・教育サイト構築用データ一式

このフォルダは、リポジトリ収録データを「歩ける・学べるサイト」に変換するための不足データを補完するもの。
前回の要件(用語説明を除く)に対応する。収録データはサイト再構成用の主要公開データであり、完全なミッションアーカイブではない。各データの根拠と限界は個別に確認する。

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
| `td1_descent_positions.json` | hpk欠損区間のTD1位置再構成。行ごとにgrade/source/method/uncertaintyを記録 | SPICE直接値・公表値・補間・推定を区別 |
| `science_audit.md` / `tests/` | 科学量の監査記録と交点・TD1データの自動検証 | 表示値の根拠・検証済み範囲・未解決点を記録 |
| `provenance/license_registry.json` | クレジット自動表示用のライセンス規則 | 同上 |
| `conversion/` | 変換スクリプト4種+README(タイル/標高・法線/LOD・当たり判定/画像ジオメトリ) | 「ブラウザ用タイル」「LOD」「法線・高度」「当たり判定」 |

※タイルは縦横比2:1の正距円筒図法に対応し、各ズームで x=2^(z+1)×y=2^z 分割(タイルは元画像上で正方形・歪みなし)。z0=2枚、z1=8枚、z2=32枚、z3=128枚/地図。 |
| `generated/` | スクリプト実行済みの生成物(タイル850枚=5地図×170枚、標高・法線マップ、LOD・コリジョンメッシュ) | 同上 |
| `performance_budget.md` | 表示性能の予算・目標値 | 「パフォーマンス予算」 |
| `accessibility.md` | アクセシビリティ対応 | 「アクセシビリティ情報」 |
| `data_update_log.md` | データ更新履歴の管理方法 | 「データ更新履歴」 |

## データの根拠と限界について

- TD1テーブルのA/B/C/D gradeは根拠・生成方法の分類で、測定精度や正確度を示すものではない。根拠のない定量不確かさは付与せず、`uncertainty: null`とする。
- TD1欠損区間はSPICE直接値だけではなく、離散SPC航法解・公表資料のアンカー・補間・推定を含む再構成である。詳細な監査と再生成方法は`science_audit.md`を参照。
- TD1の運用表面半径はSPC v20200323 49k Web OBJで算出する。200k面モデルを使用していると誤認させない。
- 座標・時刻・精度の各主張は、JAXA記者説明会資料・ISASトピックス・査読論文(Science, Nature Astronomy, A&A, Icarus, Proc. Jpn. Acad. Ser. B)等の個別出典と照合する。
- 公開されていない値(MINERVA-II1着陸地点の精密座標など)は「非公開」と明記し、推測で埋めていない。
- TD2座標など複数の報告がある値は併記している。

## 使い方(サイト実装側)

1. 3Dシーンの初期化: `01_shape_models/` + `generated/`(タイル・LOD・コリジョン)
2. WASD移動の地形追従: `generated/ryugu_heightmap_2048.png` で足元の高度を参照
3. POIの配置・情報表示: `poi_master.json`
4. タイムライン・イベント連動: `event_asset_links.json` + `06_timeline_text/timeline.json`
5. 学習コンテンツ: `education/` 各ファイル
6. 出典表示: `provenance/source_registry.csv` + `license_registry.json` で自動付与
