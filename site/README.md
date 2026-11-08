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
