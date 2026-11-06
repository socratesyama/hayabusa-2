# 11_spacecraft_model — はやぶさ2本体の3Dモデル

はやぶさ2探査機「本体」の3Dモデル。JAXAの公式3Dモデルは公開されていないため、
JAXA公開資料(とくにプロジェクト配布の公式模型製作用図面集)の寸法・機器構成に
基づいて構築した非公式の高精細再現モデル。

## ファイル

| ファイル | 内容 |
|---|---|
| hayabusa2_spacecraft.glb | 3Dモデル(glTFバイナリ)。136パーツ・88,288面。パーツごとにPBRテクスチャ(金MLIのしわ+正規マップ・太陽電池セル+白電極グリッド・HGA薄膜+正規マップ・ホーン蛇腹+正規マップ)を埋め込み。Three.js等でそのまま表示可 |
| hayabusa2_spacecraft.obj | 同内容のWavefront OBJ(+.mtl)。Blender等へインポート用 |
| hayabusa2_spacecraft.stl | 3Dプリント用の統合STL |
| parts_list.json | 全パーツの名称(日英)・説明・面数の一覧 |
| preview.png | 6方向プレビュー(簡易陰影レンダ) |
| build_hayabusa2_model.py | モデル生成スクリプト(Python / trimesh / PIL / scipy / matplotlib)。改変・再生成に使用可 |
| textures/ | 生成に使ったPBRテクスチャ一式(MLI・ソーラーセル・HGA・ラジエータ・ホーン等+法線マップ) |
| reference_docs/ | モデル作成の根拠としたJAXA公式資料(下記) |

## 規格・構成(公式図面「模型を作るための情報 Ver.1.0」に準拠)

- 構体外形: **1.6(X)×1.0(Y)×1.25(Z)m**、パドル展開全幅5,980mm、質量609kg(含燃料)
- 座標系: 機体座標系。+Z=太陽/地球向け(HGA面)、−Z=リュウグウ向け(ホーン・観測機器面)、+X=イオンエンジン面(ITH-A〜D+中性化器4基+IPPU-A/B)、−X=帰還カプセル・STT×2・NIRS3面
- 太陽電池パドル: 3パネル×2翼(各パネル1,360〜1,400mm、ほぼ正方形)、翼はX方向に4,228mm・Y方向1,360mm、アーム(ヨーク)1,130mm、パドル面は上面デッキ直下
- 上面: XHGA-T(+Y側)+KaHGA-T(-Y側)の2基(浅皿状の平面型、上面外形1,876mm)、X-MGA、YLGA-A、DCAM3+アンテナ、CSAS-A/B
- 下面: サンプラホーン(中心から約60mm偏心、先端は分離面から850mm下方)、TM-A〜E(リング上の円弧)、ONC-T/W1、LIDAR、TIR、SCI、FLA、LRF-S1/S2、MINERVA-II1A/1B、MINERVA-II2、XLGA-C
- −Y面: MASCOT(NESS)、ONC-W2、CAM-H。±Y面: 銀ラジエータパネル
- サンプラホーン: 長さ約1m・直径20cmの円筒(下部・中部・上部ホーン+サンプルキャッチャ構成)。下部・上部はアルミ円筒、中部はベクトラン布(蛇腹)。先端はベル状に開き、外側に補強リブ、内側に折り返し(返し)を持つ — ISASシンポジウム資料「図1 はやぶさ2探査機とサンプラホーン」の仕様に準拠
- 帰還カプセル: -X面下部中央、熱防御シールド(アブレータ)が外向き
- RCSスラスタポッド×4(本体四隅)、μ10イオンエンジン4基(2×2配置、突出パネル上)

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
