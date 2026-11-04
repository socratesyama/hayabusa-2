# 11_spacecraft_model — はやぶさ2本体の3Dモデル

はやぶさ2探査機「本体」の3Dモデル。JAXAの公式3Dモデルは公開されていないため、
JAXA公開資料の寸法・機器構成に基づいて構築した非公式の簡易再現モデル。

## ファイル

| ファイル | 内容 |
|---|---|
| hayabusa2_spacecraft.glb | 3Dモデル(glTFバイナリ)。81パーツ・86,812面。パーツごとにPBRテクスチャ(金MLIのしわ・太陽電池セル・アンテナパターン・ホーンリブ+正規マップ)を埋め込み。Three.js等でそのまま表示可 |
| hayabusa2_spacecraft.obj | 同内容のWavefront OBJ(+.mtl)。Blender等へインポート用 |
| hayabusa2_spacecraft.stl | 3Dプリント用の統合STL |
| parts_list.json | 全パーツの名称(日英)・説明・面数の一覧 |
| preview.png | three.jsでレンダリングした6方向プレビュー |
| build_hayabusa2_model.py | モデル生成スクリプト(Python / trimesh / PIL)。改変・再生成に使用可 |
| textures/ | 生成に使ったPBRテクスチャ一式(MLI・ソーラーセル・HGA・ホーン等+法線マップ) |
| reference_docs/ | モデル作成の根拠としたJAXA公式資料(下記) |

## 規格・構成(実機に準拠)

- 本体: 1.0(X)×1.6(Y)×1.25(Z)m、パドル展開幅 約6m、質量609kg(含燃料)
- 座標系: 機体座標系。+Z=太陽/地球向け(パドル・アンテナ面)、−Z=リュウグウ向け(ホーン・観測機器面)、+X=イオンエンジン面、−X=帰還カプセル・スタートラッカー面
- 太陽電池パドル: 3パネル×2翼(計6面)
- イオンエンジン: μ10×4基(2×2配置、ジンバル台上)
- サンプラホーン: 長さ約1m・直径20cmの円筒(下部・中部・上部ホーン+サンプルキャッチャ構成)。下部・上部はアルミ円筒、中部はベクトラン布。先端はベル状に開き、内側に折り返し(返し)を持つ — ISASシンポジウム資料「図1 はやぶさ2探査機とサンプラホーン」の仕様に準拠
- 主要パーツ: X帯/Ka帯平面アンテナ、サンプラホーン(先端折返し付き)、SCI、MASCOT、MINERVA-II×3、ONC-T/W1/W2、LIDAR、NIRS3、TIR、ターゲットマーカ×5、DCAM3、RCSポッド×4

## 寸法・構成の出典(reference_docs/)

| ファイル | 出典 |
|---|---|
| hayabusa2_brochure_sat33.pdf | JAXA「小惑星探査機はやぶさ2」パンフレット(寸法・機器一覧図) |
| hayabusa2_press_kit.pdf | はやぶさ2プロジェクトプレスキット(機体仕様・機器構成) |
| hayabusa2_model_data_v1.pdf | 「はやぶさ2の模型を作るための情報 Ver.1.0」(はやぶさ2プロジェクト、2014-08-20)※模型作成用の公式CAD図面集 |
| hayabusa2_model_p2022.pdf | JAXA広報用模型説明資料 |
| hayabusa2_factsheet_v15.pdf | 「はやぶさ2情報源 Fact Sheet Ver.1.5」(模型作成支援データ) |
| hayabusa2_factsheet_v2.31.pdf | 「Hayabusa2 Information Fact Sheet Ver.2.31」(英字・最新版。サンプラ(SMP)の仕様解説を含む) |
| isas2014_sampler_horn.pdf | ISASシンポジウム資料「図1 はやぶさ2探査機とサンプラホーン」(サンプラホーン=長さ1m・直径20cmの円筒という公式仕様の一次資料) |

- 機器配置(イオンエンジン=+Xパネル等)は NEC技報「Hayabusa2: System Design and Operational Results」の記述とも整合確認済み

## 注意(必ずお読みください)

- 本モデルは公開資料から読み取れる寸法・配置を近似した非公式の簡易モデルであり、JAXAの設計データ・CADデータそのものではありません
- クレジット例: 「はやぶさ2 3Dモデル: JAXA公開資料(パンフレット等)の寸法・機器構成に基づく非公式簡易モデル」
- 実機の正確な外観は reference_docs/ の公式資料およびJAXAの写真でご確認ください
