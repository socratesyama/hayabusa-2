# RYUGU 38cm/s — site

実装指示書 v5 に基づくサイト本体（Vite + TypeScript + three.js）。JAXA/ISAS 非公式。

## ビルド
```bash
bash tools/precompute/run_all.sh   # numpy + Pillow のみ。spiceypy/astropy 不要（自前の SPK/FITS リーダ）
cd site && npm install && npm run build   # dev: npm run dev
```
`site/public/data` と `site/public/assets` は生成物（.gitignore）。`.github/workflows/pages.yml` が CI でビルドして Pages に配備する。

## Cloudflare Pages（1ファイル25MiB制限）
- Build command: `bash scripts/build_site.sh`　/　Build output directory: `site/dist`　/　Root directory: リポジトリのルート
- **リポジトリのルートや `site/public` 以外を公開しない**（ルートには100MiB級の `.tgz`/`.tif` がある）。スクリプトは dist 内の25MiB超ファイルを検出すると失敗する。

## 実装済み / 未実装 / 未検証
- 実装: 事前計算（太陽方向・自転・重力表・探査機位置・MASCOT・ONC・温度モデル）、歩行層、物理層（RK4・点質量）、岩の散布、MASCAM ディテールテクスチャ（アルベド・バンプ多スケール）、MASCOT 再生（MARA 比較つき）、逆視点 TD1（等級表示つき）、検索、出典、アーカイブ出力、専門家ページ、データ書庫（G キー: ギャラリー783枚・l2c・MASCAM67枚・温度モデル曲線・帰還試料8粒子・重力モデル・ライセンス）、IAU 公認地形名 POI 10件追加（USGS Gazetteer 由来）。
- 未実装: 頂点ディスプレイスメント（MASCAM テクスチャ由来の高さは断片的。指示書の1m級全域は別途検討）、投影影（シャドウマップ）、点群表示。
- 検収値の注意: TD1 地点の現在実装モデルは脱出速度約37.0 cm/s、重力約0.088 mm/s²を返す。論文・指示書に記載されたTD1基準値（33.4 cm/s、0.11–0.13）とは定義または入力条件の差が未解決であり、HUDの値はモデル値（*）として表示する。公開値として断定しない。
- TD1: `12_site_data/td1_descent_positions.json` で hpk 欠損区間を、SPC位置点とJAXA公表資料のアンカーからPCHIP補間して生成する（`tools/precompute/spice_sc.py`、検証は `verify_td1.py`）。HUDには補間であることを表示する。sfm_pos は不使用。

## 地名ガイド（視界に地図を投影）

走行中、視界に入った地形に色と名前を重ね、名前をタップすると由来と出来事が開く。

- **データ**: `12_site_data/features_source.json`（由来・出来事の手書き）＋ `poi_master.json` / `ryugu_surface_points.json`（座標・直径）→ `python3 tools/precompute/build_features.py` が SfM点群157万点で検証して `12_site_data/features.json` を生成（コミット済み。`scripts/sync_assets.sh` が配布先へコピー）。IAU承認13地名＋ミッション地点（TD1・TD2・SCI人工クレーター・MASCOT・TM-A/B など）。座標を持たない MINERVA-II1 / L08 / S01 は地図に置かず、リストと説明のみ。
- **検証**: 点群と地形高さ地図の半径差は中央値−1.0m・標準偏差2.6m（`frame_check`）。7クレーターはすべて縁が中心より3〜24m高く、3岩塊は中心が周囲より12〜46m高い。尾根の帯の半幅は半径プロファイルの半値幅（±12.5°）。カタログ座標は動かさず、整合の程度だけを記録する。
- **表示**: 色付けは `terrain.ts` のシェーダ（本体固定系の角半径／緯度帯）、ラベルは `annot.ts`（視線が地形に遮られないものだけ。目の高さ1.5mの水平線は約37m先なので、見えない近くの地物は「地形の陰」「画面端の矢印」で方向を案内）、計算は `features_core.ts`。
- **操作**: ラベルまたは地面をタップ/クリックで説明、N=表示切替、L=地名・出来事リスト。カードの「ここへ行く」で地物の手前へ移動（時刻は動かさない）。
- **テスト**: `python3 -m unittest discover -s tools/precompute/tests -p 'test_features.py'` / `cd site && npm run test:features`
- **未検証**: ブラウザでの実描画（シェーダのコンパイル・ラベル位置・タップ判定）。岩（rocks.ts）は色付けの対象外。

## 操作まわりの変更（運転感・閉じる動作）
- 運転: 旋回で車体が傾き、加減速でピッチ、速度で視野角と揺れが変化。画面下に計器（速度・操舵・アクセル）。`prefers-reduced-motion` では揺れを弱める。
- モバイル: 画面の左半分に触れるとその場にスティックが出る（浮動・不感帯あり）。右半分は見回し。
- 閉じる: すべてのカードに右上の×、Esc でビューア→カード→全体図→リプレイの順に閉じる。全体図の✕はポインタ捕捉で効かなかった不具合を修正。TD1リプレイにタッチ用バー。
- 読み込み: 白い点の代わりにリュウグウが大きくなる。
- 一時廃止: モード切替（Mキー・ボタン・書庫の行）、温度と音の連動。

## デザイン刷新 v2
- 配置トークン（`--edge-*`, `--dock`, `--fs-min`）で下部の積み順を統一: フッター/時間スライダー < 運転パネル < ヒント < カード。
- 運転パネルは左下に集約（速度・操舵・アクセル・いまいる地名）。カードを開くと隠れる。
- 本文・補足は12px以上（フッターの免責のみ11px）。カードの×は枠付きの丸ボタン。
- 地名ガイドのオフ状態をアイコンの斜線で表示。全体図の入口に「全体図」ラベル。
- ファビコンと読み込み画面は実形状モデルの輪郭。
- ライト/ダーク切替は対象外（常にダーク）。

## 影と夜側の色（terrain.ts / thermal.ts）
- 地形の影: 高さ地図を R16F テクスチャにして、フラグメントごとに太陽方向へレイマーチ（`SHADE_GLSL`。岩のシェーダも共有）。
- 夜側・陰の色: 弱い光の色相を、`temperature_curves.json` の（緯度×地方時）の表面温度で決める。`thermal.ts` が表を作る（`npm run test:thermal`）。
- 運転パネルに現在地のモデル地表温度を表示。
- GPUでの見え方は未確認（合成の尾根を使ったヘッドレスWebGL2のテストで、影の向き・長さと夜色の計算のみ確認）。
