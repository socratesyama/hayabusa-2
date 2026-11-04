#!/usr/bin/env python3
"""
はやぶさ2探査機の3Dモデル生成スクリプト v2(高品質版)
JAXA公開資料の寸法・機器構成に基づき、PBRテクスチャ(正規マップ付き)と
細部形状を組み込んで構築する。非公式モデル。

出力: hayabusa2_spacecraft.glb / .obj / .stl / parts_list.json / preview.png
"""
import json
import os
import numpy as np
import trimesh
from PIL import Image, ImageDraw, ImageFilter
from trimesh.transformations import translation_matrix, rotation_matrix
from scipy.spatial import Delaunay

os.makedirs('textures', exist_ok=True)
np.random.seed(20260403)

# ================================================================ テクスチャ生成
def height_to_normal(h, strength=2.0):
    """高度マップ→法線マップ"""
    h = h / (h.max() - h.min() + 1e-9)
    gx = np.gradient(h, axis=1)
    gy = np.gradient(h, axis=0)
    n = np.dstack([-gx * strength, -gy * strength, np.ones_like(h) * 3])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)

def make_mli():
    """金のMLI断熱材(しわしわの金箔)"""
    S = 1024
    h = np.full((S, S), 0.5, dtype=np.float64)
    # ランダム三角形のしわ
    pts = np.column_stack([np.random.uniform(0, S, 220), np.random.uniform(0, S, 220)])
    tri = Delaunay(pts)
    img = Image.new('RGB', (S, S), (196, 152, 72))
    dr = ImageDraw.Draw(img)
    for t in tri.simplices:
        p = [tuple(pts[i]) for i in t]
        v = np.random.uniform(-70, 70)
        shade = int(v)
        col = (196 + shade, 152 + shade, 72 + shade // 2)
        dr.polygon(p, fill=col)
    # ハイライトの筋
    for _ in range(300):
        x0, y0 = np.random.uniform(0, S, 2)
        ln = np.random.uniform(10, 80)
        ang = np.random.uniform(0, np.pi)
        x1 = x0 + ln * np.cos(ang); y1 = y0 + ln * np.sin(ang)
        c = int(np.random.uniform(190, 255))
        dr.line([x0, y0, x1, y1], fill=(c, int(c*0.8), int(c*0.45)), width=1)
    base = np.asarray(img).astype(np.float32)
    # 高度マップ(しわ感を出すため三角形ノイズを低解像度で再現)
    hs = np.random.uniform(0, 1, (64, 64))
    hs = np.asarray(Image.fromarray((hs * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC)).astype(np.float64) / 255
    h = 0.5 + (hs - 0.5) * 0.9
    normal = height_to_normal(h, 3.5)
    Image.fromarray(base.astype(np.uint8)).save('textures/mli.png')
    Image.fromarray(normal).save('textures/mli_n.png')

def make_solar():
    """太陽電池パドル(セル+グリッド+フレーム)"""
    W, H = 1024, 512
    img = Image.new('RGB', (W, H), (18, 26, 44))
    dr = ImageDraw.Draw(img)
    cs = 56  # セルサイズ
    for y in range(0, H, cs):
        for x in range(0, W, cs):
            v = np.random.uniform(-14, 14)
            cell = tuple(int(max(0, c)) for c in (16 + v, 30 + v * 1.2, 58 + v * 1.6))
            dr.rectangle([x + 3, y + 3, x + cs - 3, y + cs - 3], fill=cell)
            # セル内の細い電極線
            for i in range(1, 4):
                xx = x + 3 + (cs - 6) * i // 4
                dr.line([xx, y + 5, xx, y + cs - 5], fill=(46, 62, 96), width=1)
    # 銀フレーム
    fr = 22
    dr.rectangle([0, 0, W, fr], fill=(158, 162, 170))
    dr.rectangle([0, H - fr, W, H], fill=(158, 162, 170))
    dr.rectangle([0, 0, fr, H], fill=(158, 162, 170))
    dr.rectangle([W - fr, 0, W, H], fill=(158, 162, 170))
    # バスバー
    dr.line([W // 2, 0, W // 2, H], fill=(158, 162, 170), width=6)
    img.save('textures/solar.png')
    h = np.zeros((H, W))
    h[fr:H - fr, fr:W - fr] = 1.0  # セル部が盛り上がる
    Image.fromarray(height_to_normal(h, 1.5)).save('textures/solar_n.png')

def make_hga():
    """平面型高利得アンテナ(パッチアレイ風)"""
    S = 1024
    img = Image.new('RGB', (S, S), (205, 208, 214))
    dr = ImageDraw.Draw(img)
    # 放射状のセクタパターン
    cx = cy = S // 2
    for i in range(36):
        a0 = i * 10
        a1 = a0 + 10
        v = 196 + (i % 3) * 8
        dr.pieslice([cx - S*0.44, cy - S*0.44, cx + S*0.44, cy + S*0.44], a0, a1, fill=(v, v + 2, v + 6))
    # 同心円
    for r in range(60, int(S * 0.44), 90):
        dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(168, 172, 180), width=3)
    img.save('textures/hga.png')

def make_dark():
    """ダークマット(微細なノイズ+パネルライン)"""
    S = 512
    n = np.random.normal(0, 6, (S, S, 3)) + np.array([30, 31, 34])
    img = Image.fromarray(np.clip(n, 0, 255).astype(np.uint8))
    dr = ImageDraw.Draw(img)
    for x in range(0, S, 128):
        dr.line([x, 0, x, S], fill=(20, 21, 23), width=2)
    for y in range(0, S, 128):
        dr.line([0, y, S, y], fill=(20, 21, 23), width=2)
    img.save('textures/dark.png')
    h = (np.random.rand(S, S) - 0.5)
    Image.fromarray(height_to_normal(h, 0.8)).save('textures/dark_n.png')

def make_white():
    """白い外板(継ぎ目)"""
    S = 512
    img = Image.new('RGB', (S, S), (232, 234, 238))
    dr = ImageDraw.Draw(img)
    for x in range(0, S, 170):
        dr.line([x, 0, x, S], fill=(196, 200, 206), width=3)
    for y in range(0, S, 170):
        dr.line([0, y, S, y], fill=(196, 200, 206), width=3)
    img.save('textures/white.png')

def make_horn():
    """サンプラホーンの布地(縦リブ)"""
    S = 512
    img = Image.new('RGB', (S, S), (44, 46, 50))
    dr = ImageDraw.Draw(img)
    for x in range(0, S, 20):
        dr.line([x, 0, x, S], fill=(64, 66, 72), width=7)
    for x in range(0, S, 20):
        dr.line([x + 9, 0, x + 9, S], fill=(30, 31, 34), width=4)
    img.save('textures/horn.png')
    h = np.zeros((S, S))
    h[:, ::20] = 1.0
    h[:, 9::20] = -1.0
    Image.fromarray(height_to_normal(h, 2.5)).save('textures/horn_n.png')

make_mli(); make_solar(); make_hga(); make_dark(); make_white(); make_horn()

# ================================================================ マテリアル
def mat(color, metallic=0.3, roughness=0.5, tex=None, nmap=None, tex_scale=None):
    kw = dict(baseColorFactor=[color[0]/255, color[1]/255, color[2]/255, 1.0],
              metallicFactor=metallic, roughnessFactor=roughness)
    if tex:
        kw['baseColorTexture'] = trimesh.visual.material.TextureVisuals(
            uv=np.zeros((0, 2)), material=None) if False else None
    return trimesh.visual.material.PBRMaterial(**kw)

def texmat(tex_path, nmap_path=None, metallic=0.3, roughness=0.5, tint=(255, 255, 255)):
    t = Image.open(tex_path)
    m = trimesh.visual.material.PBRMaterial(
        baseColorTexture=t,
        metallicFactor=metallic, roughnessFactor=roughness,
        baseColorFactor=[tint[0]/255, tint[1]/255, tint[2]/255, 1.0])
    if nmap_path:
        m.normalTexture = Image.open(nmap_path)
    return m

M_GOLD  = texmat('textures/mli.png', 'textures/mli_n.png', 0.85, 0.38)
M_SOLAR = texmat('textures/solar.png', 'textures/solar_n.png', 0.25, 0.42)
M_HGA   = texmat('textures/hga.png', None, 0.65, 0.30)
M_DARK  = texmat('textures/dark.png', 'textures/dark_n.png', 0.35, 0.55)
M_WHITE = texmat('textures/white.png', None, 0.10, 0.40)
M_HORN  = texmat('textures/horn.png', 'textures/horn_n.png', 0.15, 0.85)
M_SILVER = trimesh.visual.material.PBRMaterial(
    baseColorFactor=[0.82, 0.83, 0.86, 1.0], metallicFactor=0.95, roughnessFactor=0.22)
M_GOLDS = trimesh.visual.material.PBRMaterial(
    baseColorFactor=[0.78, 0.60, 0.25, 1.0], metallicFactor=0.9, roughnessFactor=0.3)
M_BLACK = trimesh.visual.material.PBRMaterial(
    baseColorFactor=[0.02, 0.02, 0.03, 1.0], metallicFactor=0.1, roughnessFactor=0.2)

# ================================================================ UV付与ヘルパ
def box_uv(mesh, scale=1.0):
    """面法線に基づくボックス投影UV"""
    v = mesh.vertices
    f = mesh.faces
    n = mesh.face_normals
    uv = np.zeros((len(f), 3, 2))
    for i in range(len(f)):
        axis = np.argmax(np.abs(n[i]))
        a, b = [k for k in range(3) if k != axis]
        for j in range(3):
            p = v[f[i, j]]
            uv[i, j, 0] = p[a] * scale
            uv[i, j, 1] = p[b] * scale
    uv -= uv.min(axis=(0, 1), keepdims=True)
    span = float(np.max(uv.max(axis=(0, 1)) - uv.min(axis=(0, 1))))
    uv = (uv - uv.min(axis=(0, 1), keepdims=True)) / (span + 1e-9)
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv.reshape(-1, 2), material=mesh.visual.material)

def cyl_uv(mesh, scale=1.0):
    """円筒面ラップUV"""
    v = mesh.vertices
    f = mesh.faces
    n = mesh.face_normals
    uv = np.zeros((len(f), 3, 2))
    for i in range(len(f)):
        vertical = np.abs(n[i, 2]) < 0.7
        for j in range(3):
            p = v[f[i, j]]
            if vertical:
                uv[i, j, 0] = (np.arctan2(p[1], p[0]) / (2 * np.pi) + 0.5) * scale * 3
            else:
                uv[i, j, 0] = (p[0] + p[1]) * scale
            uv[i, j, 1] = p[2] * scale * 3
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv.reshape(-1, 2), material=mesh.visual.material)

# ================================================================ パーツ構築
parts = []
def add(mesh, name, desc, m, uv='box', scale=1.0):
    # 頂点を面コーナーごとに分割(頂点単位UVのため)
    mesh.unmerge_vertices()
    mesh.visual = trimesh.visual.TextureVisuals(material=m)
    if uv == 'box': box_uv(mesh, scale)
    elif uv == 'cyl': cyl_uv(mesh, scale)
    parts.append((mesh, name, desc))

def prim_box(name, desc, extents, center, m, uv='box', scale=1.0, rounded=None):
    mesh = trimesh.creation.box(extents=extents)
    if rounded:
        mesh = mesh.subdivide_to_size(rounded)
        trimesh.smoothing.filter_laplacian(mesh, iterations=6, lamb=0.55)
    mesh.apply_translation(center)
    add(mesh, name, desc, m, uv, scale)

def prim_cyl(name, desc, radius, height, center, m, axis='z', uv='cyl', scale=1.0, sections=48):
    mesh = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    if axis == 'x':
        mesh.apply_transform(rotation_matrix(np.pi/2, [0, 1, 0]))
    elif axis == 'y':
        mesh.apply_transform(rotation_matrix(np.pi/2, [1, 0, 0]))
    mesh.apply_translation(center)
    add(mesh, name, desc, m, uv, scale)

def prim_frustum(name, desc, r_top, r_bot, height, center, m, uv='cyl', scale=1.0, sections=48):
    ang = np.linspace(0, 2 * np.pi, sections, endpoint=False)
    top = np.c_[r_top*np.cos(ang), r_top*np.sin(ang), np.full(sections, height/2)]
    bot = np.c_[r_bot*np.cos(ang), r_bot*np.sin(ang), np.full(sections, -height/2)]
    verts = np.vstack([top, bot, [[0, 0, height/2], [0, 0, -height/2]]])
    faces = []
    for i in range(sections):
        j = (i + 1) % sections
        faces += [[i, j, sections + j], [i, sections + j, sections + i]]
        faces += [[i, j, 2 * sections]]
        faces += [[sections + j, sections + i, 2 * sections + 1]]
    mesh = trimesh.Trimesh(vertices=verts, faces=np.array(faces))
    mesh.merge_vertices(); mesh.fix_normals()
    mesh.apply_translation(center)
    add(mesh, name, desc, m, uv, scale)

def prim_sphere(name, desc, radius, center, m):
    mesh = trimesh.creation.icosphere(subdivisions=3, radius=radius)
    mesh.apply_translation(center)
    add(mesh, name, desc, m, 'box', radius * 2)

def prim_torus(name, desc, major, tube, center, m, axis='z'):
    mesh = trimesh.creation.torus(major_radius=major, minor_radius=tube,
                                  major_sections=48, minor_sections=16)
    if axis == 'x':
        mesh.apply_transform(rotation_matrix(np.pi/2, [0, 1, 0]))
    mesh.apply_translation(center)
    add(mesh, name, desc, m, 'box', major)

# ================================================================ 本体(丸み付き)
prim_box('本体 (Main Body)', '箱型本体 1.0×1.6×1.25m。表面は金の断熱材(MLI)で覆われる',
         [1.0, 1.6, 1.25], [0, 0, 0], M_GOLD, rounded=0.045, scale=1.6)

# ================================================================ 太陽電池パドル(3パネル×2翼)
for s, side in [(1, '左'), (-1, '右')]:
    for i in range(3):
        yc = 0.84 + 0.355 + i * 0.735
        prim_box(f'太陽電池パドル {side}翼パネル{i+1} (SAP Panel)',
                 '高効率3接合太陽電池。3パネル×2翼、計6面で1460W@1.42AUを発電',
                 [1.06, 0.69, 0.032], [0, s * yc, 0.02], M_SOLAR, scale=2.2)
        if i < 2:
            prim_box(f'パドルヒンジ ({side}翼{i+1}-{i+2})', 'パネル間の折りたたみヒンジ',
                     [0.12, 0.07, 0.055], [0, s * (0.84 + 0.71 + i * 0.735), 0.02], M_SILVER)
    prim_box(f'パドル取付ブラケット ({side}翼)', '本体側面とパドルを接続する架台',
             [0.16, 0.12, 0.22], [0, s * 0.88, 0.02], M_GOLDS)

# ================================================================ 上部デッキ(+Z)
# X帯 高利得アンテナ(平面・円形)
prim_cyl('X帯高利得アンテナ (X-band HGA)', 'X帯の平面型高利得アンテナ。パラボラを平面化して着陸機の搭載スペースを確保',
        0.40, 0.045, [0, 0.38, 0.665], M_HGA, uv='box', scale=1.4)
prim_torus('X帯HGA外周リム', '', 0.40, 0.014, [0, 0.38, 0.672], M_SILVER)
# Ka帯 高利得アンテナ(小さな皿)
prim_frustum('Ka帯高利得アンテナ (Ka-band HGA)', '高速通信用に新規追加されたKa帯アンテナ(皿型)',
             0.29, 0.10, 0.11, [0, -0.44, 0.71], M_HGA, uv='cyl', scale=1.4)
prim_torus('Ka帯HGA外周リム', '', 0.29, 0.012, [0, -0.44, 0.755], M_SILVER)
prim_cyl('Ka帯HGAフィード', '', 0.022, 0.16, [0, -0.44, 0.80], M_DARK)
# 中利得・低利得アンテナ
prim_cyl('X帯中利得アンテナ (X-band MGA)', '中利得アンテナ(円錐ホーン型)',
         0.06, 0.14, [0.30, -0.05, 0.71], M_DARK)
prim_cyl('X帯低利得アンテナ (X-band LGA)', '全方向性の低利得アンテナ(ロッド型)',
         0.015, 0.16, [0.36, 0.62, 0.71], M_WHITE)
# DCAM3
prim_cyl('DCAM3 (分離カメラ)', 'SCI衝突実験の様子を撮影するため分離される小型カメラ',
         0.05, 0.09, [-0.30, -0.62, 0.68], M_DARK)

# ================================================================ 下部デッキ(-Z)
# --- サンプラホーン: ISAS仕様「長さ1m・直径20cmの円筒」(下部・中部・上部ホーン+キャッチャ) ---
# 下部・上部はアルミ円筒、中部はベクトラン布。先端内側に折り返し(返し)。
prim_cyl('サンプラホーン取付リング (Horn Mount)', 'ホーン上部と本体の接続部',
         0.16, 0.08, [0, 0, -0.665], M_GOLDS)
prim_cyl('サンプルキャッチャ (Sample Catcher)', 'ホーン最上部の試料容器。3室に分かれ、複数回の採取試料を別々に保管',
         0.13, 0.10, [0, 0, -0.72], M_DARK)
prim_cyl('上部ホーン (Upper Horn)', 'アルミ円筒。直径20cm・全長約1mのホーンの上段',
         0.10, 0.25, [0, 0, -0.875], M_WHITE)
prim_cyl('中部ホーン (Middle Horn)', 'ベクトラン布製の円筒。着地時の衝撃を吸収する伸縮構造',
         0.10, 0.30, [0, 0, -1.15], M_HORN, scale=2.0)
prim_cyl('下部ホーン (Lower Horn)', 'アルミ円筒。ホーンの下段',
         0.10, 0.15, [0, 0, -1.375], M_WHITE)
for z in [-1.00, -1.30]:
    prim_torus('ホーン接合リング', '下部・中部・上部ホーンの接合部の補強リング',
               0.10, 0.012, [0, 0, z], M_SILVER)
prim_frustum('サンプラホーン先端ベル (Horn Bell)', '先端がリュウグウ表面に触れると弾(タンタル玉)を発射し、跳ね上がった物質を捕集',
             0.10, 0.24, 0.14, [0, 0, -1.52], M_WHITE, scale=1.0)
prim_torus('ホーン先端折返し (Horn Cuff)', '先端内側の折り返し(返し)。1〜5mmの礫を引っかけて捕獲する',
           0.24, 0.013, [0, 0, -1.585], M_SILVER)

# カメラ・センサ群
prim_box('ONC-T (光学航法カメラ・望遠)', '望遠光学航法カメラ。科学観測にも使用',
         [0.15, 0.15, 0.11], [0.33, -0.35, -0.69], M_DARK, rounded=0.02)
prim_cyl('ONC-T レンズ', '', 0.048, 0.06, [0.33, -0.35, -0.755], M_BLACK)
prim_torus('ONC-T レンズフード', '', 0.055, 0.008, [0.33, -0.35, -0.77], M_DARK)
prim_box('ONC-W1 (光学航法カメラ・広角)', '広角光学航法カメラ(機体下面側)',
         [0.13, 0.13, 0.10], [0.33, -0.55, -0.685], M_DARK, rounded=0.02)
prim_cyl('ONC-W1 レンズ', '', 0.042, 0.06, [0.33, -0.55, -0.75], M_BLACK)
prim_box('LIDAR (レーザ高度計)', 'レーザパルスの往復時間からリュウグウまでの距離を測定',
         [0.13, 0.13, 0.11], [0.33, 0.00, -0.69], M_DARK, rounded=0.02)
prim_cyl('LIDAR 光学系', '', 0.042, 0.06, [0.33, 0.00, -0.755], M_BLACK)
prim_box('NIRS3 (近赤外分光計)', '3μm帯の吸収から含水鉱物や有機物を検出',
         [0.16, 0.11, 0.11], [0.33, 0.20, -0.69], M_DARK, rounded=0.02)
prim_cyl('NIRS3 光学系', '', 0.037, 0.06, [0.33, 0.20, -0.755], M_BLACK)
prim_box('TIR (熱赤外カメラ)', '表面温度分布を撮影し、熱慣性を調査',
         [0.11, 0.11, 0.09], [0.30, 0.40, -0.685], M_DARK, rounded=0.02)
prim_cyl('TIR 光学系', '', 0.037, 0.06, [0.30, 0.40, -0.74], M_BLACK)
# SCI
prim_cyl('SCI (衝突装置)', '火薬で2kgの銅弾を約7.2km/sに加速し、人工クレーター(おむすびころりん)を作った世界初の装置',
         0.28, 0.30, [-0.15, -0.55, -0.78], M_DARK)
prim_cyl('SCI 先端キャップ', '', 0.24, 0.04, [-0.15, -0.55, -0.945], M_GOLDS)
# 着陸機
prim_box('MASCOT (小型着陸機)', 'ドイツDLR・フランスCNES開発。リュウグウ表面で約17時間観測',
         [0.30, 0.22, 0.13], [-0.30, 0.30, -0.71], M_DARK, rounded=0.02)
prim_cyl('MINERVA-II1A (ローバ)', 'リュウグウ表面をホッピング移動した自律小型ローバ(イブー)',
         0.095, 0.10, [-0.35, 0.60, -0.685], M_SILVER)
prim_cyl('MINERVA-II1B (ローバ)', '自律小型ローバ(アウル)',
         0.095, 0.10, [-0.20, 0.63, -0.685], M_SILVER)
prim_cyl('MINERVA-II2 (ローバ)', '自律小型ローバII2',
         0.085, 0.09, [-0.45, -0.10, -0.685], M_SILVER)
# ターゲットマーカ
for i in range(5):
    prim_sphere(f'ターゲットマーカ{i+1} (Target Marker)',
                'タッチダウンの目印として表面に投下される反射材入りの小球',
                0.036, [0.15 + i * 0.08, -0.15, -0.69], M_WHITE)

# ================================================================ +X面: イオンエンジン
prim_box('イオンエンジン・ジンバル台 (IES Gimbal)', 'μ10イオンエンジン4基を載せる2軸ジンバル架台',
         [0.07, 1.02, 0.80], [0.535, 0, 0.10], M_DARK)
for yy in [-0.24, 0.24]:
    for zz in [-0.12, 0.34]:
        prim_cyl('イオンエンジン μ10 (Ion Engine)', 'キセノンをマイクロ波放電でイオン化して高速噴射。推力10mN×4基、最大3基同時運転',
                 0.105, 0.15, [0.645, yy, zz], M_DARK, axis='x')
        prim_torus('イオンエンジン放電グリッド', 'マイクロ波放電の加速グリッド',
                   0.105, 0.012, [0.725, yy, zz], M_SILVER, axis='x')

# ================================================================ −X面: 帰還カプセル・スタートラッカー
prim_cyl('帰還カプセル (Re-entry Capsule)', 'サンプルコンテナを内蔵し、約12km/sで大気圏に再突入。2020年12月6日、ウーメラ砂漠に着地',
         0.20, 0.18, [-0.60, 0.35, 0.25], M_WHITE, axis='x')
prim_frustum('帰還カプセル 熱防御シールド', '再突入時の熱から守るアブレータ',
             0.205, 0.235, 0.05, [-0.705, 0.35, 0.25], M_GOLDS, scale=1.0)
prim_torus('帰還カプセル 分離リング', '', 0.205, 0.012, [-0.51, 0.35, 0.25], M_SILVER, axis='x')
prim_cyl('スタートラッカー1 (Star Tracker)', '恒星を撮像して姿勢を決定する装置',
         0.055, 0.17, [-0.60, -0.30, 0.42], M_DARK, axis='x')
prim_torus('スタートラッカー1 バッフル', '', 0.062, 0.008, [-0.695, -0.30, 0.42], M_BLACK, axis='x')
prim_cyl('スタートラッカー2 (Star Tracker)', '恒星を撮像して姿勢を決定する装置(冗長系)',
         0.055, 0.17, [-0.60, -0.52, 0.15], M_DARK, axis='x')
prim_torus('スタートラッカー2 バッフル', '', 0.062, 0.008, [-0.695, -0.52, 0.15], M_BLACK, axis='x')
prim_box('ONC-W2 (光学航法カメラ・広角2)', '広角光学航法カメラ(機体側面)',
         [0.10, 0.10, 0.08], [-0.55, -0.02, -0.30], M_DARK, rounded=0.02)

# ================================================================ RCSスラスタ
for sx in [-1, 1]:
    for sy in [-1, 1]:
        prim_box('RCSスラスタポッド (RCS Thrusters)', '化学推進系20Nスラスタ(計12基)。姿勢制御・軌道修正に使用',
                 [0.13, 0.13, 0.21], [sx * 0.50, sy * 0.80, 0.30], M_GOLDS, rounded=0.02)
        for k, (ax, d) in enumerate([('x', sx), ('y', sy)]):
            prim_cyl('RCS ノズル', '', 0.032, 0.11,
                     [sx * 0.585, sy * 0.80 + (d * 0.07 if ax == 'y' else 0), 0.30 + (k - 0.5) * 0.07],
                     M_BLACK, axis=ax if ax == 'x' else 'y')

# ================================================================ 書き出し
scene = trimesh.Scene()
for mesh, name, desc in parts:
    scene.add_geometry(mesh, node_name=name, geom_name=name)

scene.export('hayabusa2_spacecraft.glb')
scene.export('hayabusa2_spacecraft.obj')

merged = trimesh.util.concatenate([m for m, _, _ in parts])
merged.export('hayabusa2_spacecraft.stl')

with open('parts_list.json', 'w', encoding='utf-8') as f:
    json.dump([
        {'name': n, 'description': d,
         'faces': int(m.faces.shape[0]), 'vertices': int(m.vertices.shape[0])}
        for m, n, d in parts
    ], f, ensure_ascii=False, indent=2)

print(f'parts: {len(parts)}, total faces: {merged.faces.shape[0]}')
print('exported: hayabusa2_spacecraft.glb / .obj / .stl / parts_list.json')

# ---------------------------------------------------------- プレビュー
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

fig = plt.figure(figsize=(14, 7), dpi=100)
for k, (elev, azim, title) in enumerate([
        (18, -55, 'isometric'), (5, -90, 'top (+Z)'), (30, 0, 'side (+X)'), (25, 180, 'capsule side (-X)')]):
    ax = fig.add_subplot(2, 2, k + 1, projection='3d')
    for m, n, d in parts:
        tris = m.vertices[m.faces]
        matv = m.visual.material
        if hasattr(matv, 'baseColorTexture') and matv.baseColorTexture is not None:
            base = [0.7, 0.65, 0.5]
        else:
            bc = matv.baseColorFactor
            base = [float(c) for c in bc[:3]]
            base = [c / 255.0 if c > 1 else c for c in base]
        pc = Poly3DCollection(tris, facecolor=base, edgecolor='none')
        ax.add_collection3d(pc)
    ax.set_xlim(-3.2, 3.2); ax.set_ylim(-3.2, 3.2); ax.set_zlim(-2, 2)
    ax.set_box_aspect((1, 1, 0.6))
    ax.view_init(elev=elev, azim=azim)
    ax.set_title(title)
    ax.axis('off')
    ax.set_facecolor('#0a0d12')
plt.tight_layout()
plt.savefig('preview.png', facecolor='#0a0d12', bbox_inches='tight')
print('preview.png saved')
