# クレジット・ライセンス・利用条件まとめ

サイトを制作・公開する際に必ず確認・明記すべき事項をまとめた。**最終的には各提供元の最新の規約を確認すること**(規約は改訂されることがある)。

## 1. DARTSの科学データ(形状モデル・SPICE・ONC・LiDAR・TIR・NIRS3・MASCOT・試料データ)

- **提供元**: JAXA 宇宙科学研究所(ISAS) DARTS (Data ARchives and Transmission System)
- **ライセンス**: ISAS Data Policy / Government of Japan Standard Terms of Use (Version 2.0) / CC BY 4.0(はやぶさ2 PDS4バンドルの多くに適用)
- **データポリシー**: https://www.isas.jaxa.jp/en/researchers/data-policy/
- **クレジット例**:
  - 「Data: JAXA/ISAS/DARTS」
  - 英語論文等での謝辞例(DARTS推奨文):
    "This research made use of data obtained from Data ARchives and Transmission System (DARTS), provided by Center for Science-satellite Operation and Data Archive (C-SODA) at ISAS/JAXA."
- **推奨引用**: 各データセットにはDOIが付与されている(例: SPICE Kernel Archive Bundle = https://doi.org/10.17597/isas.darts/hyb2-00600)。使用したデータのDOI・バージョン・取得日を記録すること。

## 2. JAXA/はやぶさ2プロジェクトの画像・動画

- **提供元**: JAXA(www.jaxa.jp, www.hayabusa2.jaxa.jp, fanfun.jaxa.jp)
- **条件**: JAXAサイトポリシー(https://www.jaxa.jp/policy_j.html)に基づき、クレジット「(c) JAXA」または「提供:宇宙航空研究開発機構(JAXA)」を明記
- **注意**:
  - 個人・教育・研究目的の無償利用は原則可。**商用利用(商品販売・CM等)はJAXAの許諾が必要**(有償利用許諾手続きあり)
  - 「公式サイト」を名乗らないこと(非公式であることの明記)
  - JAXAのロゴ・マークの使用は許諾が必要
  - YouTube動画の埋め込みは申請不要(説明文に「JAXA Channelより引用」等の記載推奨)

## 3. 日本プラネタリウム協議会の3Dデータ(CC BY)

- **提供元**: 日本プラネタリウム協議会(https://planetarium.jp/ryugu/)
- **ライセンス**: CC BY(オリジナルのISASデータポリシーに則って提供)
- **元データ**: JAXA/会津大/神戸大の形状モデルをWeb/プラネタリウム用に変換したもの
- **クレジット例**: 「3Dデータ:日本プラネタリウム協議会(JAXA/会津大/神戸大のデータに基づく)」

## 4. 形状モデル・論文付属データの帰属

| データ | クレジット |
|---|---|
| SPC形状モデル(DSK) | JAXA/神戸大(Watanabe et al. 2019) |
| SfM形状モデル(OBJ・点群PLY含む) | JAXA/会津大/神戸大 |
| LIDAR L2地形時系列(実測点群) | JAXA/ISAS/DARTS(DOI: 10.17597/isas.darts/hyb2-00500) |
| 簡易形状模型(FBX) | JAXA宇宙探査イノベーションハブ/コンセプト/モルフォ/アイヴィス/ビュープラス(※科学・工学目的利用不可) |
| ONC画像 | JAXA, 東京大, 高知大, 立教大, 名古屋大, 千葉工大, 明治大, 会津大, 産総研 |
| MASCOT/MASCAM | DLR, CNES, JAXA |
| 論文の図 | 各論文の著作権(出版社)。転載は出版社の規約(CC BYの論文は可) |
| はやぶさ2本体3Dモデル(11_spacecraft_model/) | JAXA公開資料(パンフレット・プレスキット・「はやぶさ2の模型を作るための情報」等)の寸法・機器構成に基づく非公式簡易モデル。JAXAの設計データではない |

## 5. サイト全体での必須事項

1. **「非公式・ファンサイト」であることの明記**(JAXAの公式認定・後援を示唆する表現の禁止)
2. **主要データの出典表記**(データ提供: JAXA、ISAS、DARTS 等)
3. **使用データの記録**(データID・バージョン・取得日・URL) — 09_manifests/data_manifest.md に雛形あり
4. **科学的正確性の区分**: 「科学的再現」と「演出・イメージ」を明確に区別すること
5. **公式情報への導線**: JAXA/ISAS公式サイト・DARTSへのリンクを設けること

## 6. 詳細は一次情報で確認

- JAXAサイトポリシー: https://www.jaxa.jp/policy_j.html
- ISASデータポリシー: https://www.isas.jaxa.jp/en/researchers/data-policy/
- DARTS利用について: https://darts.isas.jaxa.jp/en/about
- 画像利用申請(JAXA): https://www.jaxa.jp/faq/image_use.html (案内ページ)
