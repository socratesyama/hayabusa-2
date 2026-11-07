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
- 実装: 事前計算（太陽方向・自転・重力表・探査機位置・MASCOT・ONC・温度モデル）、歩行層、物理層（RK4・点質量）、岩の散布、MASCOT 再生、逆視点 TD1（等級表示つき）、検索、出典、アーカイブ出力、専門家ページ。
- **未検証**: この環境はネットワークが無く three/vite を導入できなかったため、`npm run build` とブラウザ実行は一度も行っていない。型チェックは three をスタブにして通しただけ。
- 未実装: 頂点ディスプレイスメント、投影影（シャドウマップ）、MASCAM 由来の法線マップ、点群表示、温度モデルの UI 反映（データのみ生成）。
- 検収値の不一致: TD1 地点の脱出速度は計算で約37.0 cm/s、重力は約0.088 mm/s²。指示書の期待値（33.4 cm/s、0.11–0.13）と合わない。式は仕様どおりで調整はしていない。
- TD1: `12_site_data/td1_descent_positions.json` で hpk 欠損区間を置換（`tools/precompute/spice_sc.py`、検証は `verify_td1.py`）。sfm_pos は不使用。
