# 変換スクリプト一式(サイト構築用)

リポジトリ内の生データを、ブラウザで直接使える形式に変換するスクリプト。
いずれもリポジトリルートから実行する。依存は numpy / Pillow(astropyはgeometry抽出時のみ)。

## スクリプト一覧

| スクリプト | 入力 | 出力 | 用途 |
|---|---|---|---|
| `build_quadtree_tiles.py` | 全球マップ(JPG/TIF、2:1正距円筒) | `tiles/{z}/{x}/{y}.jpg` | グロブ表示の詳細ズーム |
| `build_heightmap_normal.py` | 形状モデルOBJ(200k面) | 16bit標高PNG + 法線PNG + 補間統計 | WASD移動の地形追従・凹凸表現 |
| `build_lod_collision.py` | 形状モデルOBJ(200k面) | LODメッシュ(5k/15k面) + 当たり判定メッシュ | 低スペック端末向け表示・物理当たり |
| `extract_image_geometry.py` | l2dbpc緯度経度FITS(tgz展開後) | 画像ごとの中心座標JSON | 画像↔リュウグウ表面座標の対応 |

### タイルの分割方式(重要)

入力は縦横比2:1(経度360°×緯度180°)の正距円筒図法。**経度方向の分割数を緯度方向の2倍**にする
ことで、各タイルの元画像上の領域が正方形(ピクセル比1:1)になり、3Dモデルへの貼り付け時に
縦横の歪みが生じない。

- 各ズーム: x方向 `2^(z+1)` 分割、y方向 `2^z` 分割
- タイル数: z0=2、z1=8、z2=32、z3=128(合計170枚/地図、5地図で850枚)

## 実行例

```bash
# タイル生成(全5種の全球マップ。legend画像を除く主図を指定すること)
declare -A SRC=(
  [01_ONC_v-band_Basemap1]=hyb2_onc_Global_01_l3dm_v06.jpg
  [04_ONC_Normal_Albedo_RGB]=JADE_Ryugu_NormAlbedoV1j_rgb_bvx.jpg
  [05_ONC_Normal_Albedo_v-band]=v-band_Normal_albedo_map.jpg
  [06_ONC_Vis_Slope_b-x]=b-x_Slope_Map.jpg
  [07_TIR_Thermal_Inertia]=Thermal_Inertia_Map.jpg
)
for m in "${!SRC[@]}"; do
  python3 12_site_data/conversion/build_quadtree_tiles.py \
    "04_science_data/map_products/$m/${SRC[$m]}" \
    "12_site_data/generated/tiles/$m" --max-zoom 3
done

# 標高・法線マップ
python3 12_site_data/conversion/build_heightmap_normal.py \
  01_shape_models/ryugu_shape_spc_200k_v20200323_web.obj 12_site_data/generated --width 2048

# LOD・コリジョン
python3 12_site_data/conversion/build_lod_collision.py \
  01_shape_models/ryugu_shape_spc_200k_v20200323_web.obj 12_site_data/generated

# 画像ジオメトリ抽出(例: 20181024)
tar xzf 02_onc_images/onc_bundle_v03c/geometry_l2dbpc_latlon/20181024_l2dbpc_latlon_v03c.tgz -C /tmp
python3 12_site_data/conversion/extract_image_geometry.py /tmp/20181024 /tmp/geom20181024.json
```

## 座標系の注意

- 形状モデルOBJ・地図ともに**リュウグウ本体固定座標系(IAU_RYUGU)**。経度は東経0-360度。
- リュウグウは**逆行自転**のため、太陽系基準の「北」と地理的な「北」が逆。地図・3D・ONC画像で南北の向きが違って見えることがある([ISASの注記](https://www.isas.jaxa.jp/topics/001826.html))。
- ONC公式ギャラリーの画像は必ずしも北が上ではない。POI配置時は `poi_master.json` の座標と `image_location_map.json` を照合すること。

## 出典(生成物に必ず付与)

- 形状モデル: JAXA/ISAS/DARTS(SPC v20200323, Watanabe et al. 2019)
- 全球マップ: JAXA/ISAS/DARTS(v06)
- 生成物のライセンスは元データのライセンスを継承(ISAS Data Policy / CC BY 4.0)。詳細は `../provenance/source_registry.csv`
