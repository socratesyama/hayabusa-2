#!/usr/bin/env python3
"""
はやぶさ2探査機の3Dモデル生成スクリプト v3(高精細版)

出典(すべて本リポジトリ reference_docs/ に収録):
- はやぶさ2プロジェクト「『はやぶさ2』の模型を作るための情報 Ver.1.0」(2014-08-20)
  ・構体外形 X1600×Y1000×Z1250mm
  ・太陽電池パドル: 3枚/翼(各1360〜1400mm)、翼幅1360mm、アーム1130mm、展開全幅5980mm
  ・ホーン先端: 衛星分離面から850mm下方、中心から60mm偏心
  ・上面: XHGA-T(+Y側)・KaHGA-T(-Y側)の平面型アンテナ、外観全幅1876mm
  ・+X面: イオンエンジンITH-A〜D+中性化器NEUT-A〜D、IPPU-A/B
  ・-X面: スタートラッカ×2(上端)、カプセル(下部中央)、NIRS3(下部+Y側)
  ・下面: ONC-T/ONC-W1(-X+Y)、LIDAR(-X-Y)、TIR(+X+Y)、MINERVA-II1(+X-Y)、
    MINERVA-II2、TM-A〜E(リング上の円弧)、SCI、MASCOT(-Y面)
- Hayabusa2 Information Fact Sheet Ver.2.31(アンテナ構成・機器仕様)
- ISASシンポジウム資料「図1 はやぶさ2探査機とサンプラホーン」(ホーン仕様)
- JAXA筑波宇宙センター実物大モデル写真(Wikimedia Commons, CC BY 4.0, Σ64)(色調参考)

出力: hayabusa2_spacecraft.glb / .obj / .stl / parts_list.json / preview.png
非公式モデル。JAXAの設計データそのものではない。
"""
import json
import os
import numpy as np
import trimesh
from PIL import Image, ImageDraw, ImageFilter
from trimesh.transformations import translation_matrix, rotation_matrix

os.makedirs('textures', exist_ok=True)
np.random.seed(20261106)

# ================================================================ テクスチャ生成
def height_to_normal(h, strength=2.0):
    h = h / (h.max() - h.min() + 1e-9)
    gx = np.gradient(h, axis=1)
    gy = np.gradient(h, axis=0)
    n = np.dstack([-gx * strength, -gy * strength, np.ones_like(h) * 3])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)

def make_mli():
    """金のMLI断熱材(鮮やかな山吹色のしわしわ金箔)"""
    S = 1024
    from scipy.spatial import Delaunay
    pts = np.column_stack([np.random.uniform(0, S, 260), np.random.uniform(0, S, 260)])
    tri = Delaunay(pts)
    img = Image.new('RGB', (S, S), (212, 168, 84))
    dr = ImageDraw.Draw(img)
    for t in tri.simplices:
        p = [tuple(pts[i]) for i in t]
        v = int(np.random.uniform(-55, 55))
        dr.polygon(p, fill=(212 + v, 168 + v, 84 + v // 2))
    for _ in range(420):
        x0, y0 = np.random.uniform(0, S, 2)
        ln = np.random.uniform(12, 90)
        ang = np.random.uniform(0, np.pi)
        c = int(np.random.uniform(200, 255))
        dr.line([x0, y0, x0 + ln * np.cos(ang), y0 + ln * np.sin(ang)],
                fill=(c, int(c * 0.82), int(c * 0.5)), width=1)
    base = np.asarray(img).astype(np.uint8)
    hs = np.random.uniform(0, 1, (96, 96))
    hs = np.asarray(Image.fromarray((hs * 255).astype(np.uint8))
                    .resize((S, S), Image.BICUBIC)).astype(np.float64) / 255
    h = 0.5 + (hs - 0.5) * 1.0
    Image.fromarray(base).save('textures/mli.png')
    Image.fromarray(height_to_normal(h, 4.0)).save('textures/mli_n.png')

def make_solar():
    """太陽電池パドル: 濃紺セル+白い細かい電極グリッド+銀フレーム(実物大モデルの見た目)"""
    W, H = 1536, 512
    img = Image.new('RGB', (W, H), (16, 22, 46))
    dr = ImageDraw.Draw(img)
    cs = 32  # セルサイズ
    for y in range(0, H, cs):
        for x in range(0, W, cs):
            v = np.random.uniform(-8, 8)
            dr.rectangle([x + 2, y + 2, x + cs - 2, y + cs - 2],
                         fill=tuple(int(max(0, c)) for c in (15 + v, 22 + v * 1.4, 50 + v * 2)))
            # 白い電極線(細かい格子)
            for i in range(1, 3):
                xx = x + 2 + (cs - 4) * i // 3
                dr.line([xx, y + 3, xx, y + cs - 3], fill=(200, 205, 218), width=1)
            yy = y + 2 + (cs - 4) // 2
            dr.line([x + 3, yy, x + cs - 3, yy], fill=(200, 205, 218), width=1)
    # 銀フレーム
    fr = 18
    dr.rectangle([0, 0, W, fr], fill=(150, 154, 162))
    dr.rectangle([0, H - fr, W, H], fill=(150, 154, 162))
    dr.rectangle([0, 0, fr, H], fill=(150, 154, 162))
    dr.rectangle([W - fr, 0, W, H], fill=(150, 154, 162))
    img.save('textures/solar.png')
    h = np.zeros((H, W))
    h[fr:H - fr, fr:W - fr] = 1.0
    Image.fromarray(height_to_normal(h, 1.2)).save('textures/solar_n.png')

def make_hga():
    """平面型高利得アンテナ: 銀色の薄膜+同心円パターン(実物はしわのある銀薄膜)"""
    S = 1024
    img = Image.new('RGB', (S, S), (198, 202, 210))
    dr = ImageDraw.Draw(img)
    cx = cy = S // 2
    # 放射状のセクタ(接続パッチの継ぎ目)
    for i in range(24):
        a0, a1 = i * 15, i * 15 + 15
        v = 194 + (i % 2) * 10
        dr.pieslice([cx - S * 0.46, cy - S * 0.46, cx + S * 0.46, cy + S * 0.46],
                    a0, a1, fill=(v, v + 3, v + 8))
    # 同心円のリブ
    for r in range(70, int(S * 0.46), 55):
        dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(160, 164, 174), width=3)
    # 中心給電部
    dr.ellipse([cx - 40, cy - 40, cx + 40, cy + 40], fill=(120, 124, 134))
    dr.ellipse([cx - 18, cy - 18, cx + 18, cy + 18], fill=(80, 82, 90))
    img.save('textures/hga.png')
    hs = np.random.uniform(0, 1, (64, 64))
    hs = np.asarray(Image.fromarray((hs * 255).astype(np.uint8))
                    .resize((S, S), Image.BICUBIC)).astype(np.float64) / 255
    Image.fromarray(height_to_normal(0.5 + (hs - 0.5) * 0.6, 1.6)).save('textures/hga_n.png')

def make_dark():
    S = 512
    n = np.random.normal(0, 5, (S, S, 3)) + np.array([28, 29, 32])
    img = Image.fromarray(np.clip(n, 0, 255).astype(np.uint8))
    dr = ImageDraw.Draw(img)
    for x in range(0, S, 128):
        dr.line([x, 0, x, S], fill=(18, 19, 21), width=2)
    for y in range(0, S, 128):
        dr.line([0, y, S, y], fill=(18, 19, 21), width=2)
    img.save('textures/dark.png')
    h = (np.random.rand(S, S) - 0.5)
    Image.fromarray(height_to_normal(h, 0.8)).save('textures/dark_n.png')

def make_white():
    S = 512
    img = Image.new('RGB', (S, S), (228, 230, 234))
    dr = ImageDraw.Draw(img)
    for x in range(0, S, 170):
        dr.line([x, 0, x, S], fill=(192, 196, 202), width=3)
    for y in range(0, S, 170):
        dr.line([0, y, S, y], fill=(192, 196, 202), width=3)
    img.save('textures/white.png')

def make_rad():
    """銀色のラジエータ(パネル継ぎ目)"""
    S = 512
    img = Image.new('RGB', (S, S), (176, 180, 188))
    dr = ImageDraw.Draw(img)
    for x in range(0, S, 100):
        dr.line([x, 0, x, S], fill=(140, 144, 152), width=4)
    for y in range(0, S, 100):
        dr.line([0, y, S, y], fill=(140, 144, 152), width=4)
    img.save('textures/rad.png')

def make_horn():
    """サンプラホーン中部: 蛇腹(ベローズ)の布+リングリブ"""
    S = 512
    img = Image.new('RGB', (S, S), (38, 40, 44))
    dr = ImageDraw.Draw(img)
    for y in range(0, S, 26):
        dr.rectangle([0, y, S, y + 12], fill=(52, 54, 60))
        dr.rectangle([0, y + 12, S, y + 18], fill=(96, 98, 104))  # 金属リング
    img.save('textures/horn.png')
    h = np.zeros((S, S))
    for y in range(0, S, 26):
        h[y + 12:y + 18, :] = 1.0
        h[y + 20:y + 24, :] = -0.6
    Image.fromarray(height_to_normal(h, 3.0)).save('textures/horn_n.png')

make_mli(); make_solar(); make_hga(); make_dark(); make_white(); make_rad(); make_horn()

# ================================================================ マテリアル
def texmat(tex_path, nmap_path=None, metallic=0.3, roughness=0.5):
    m = trimesh.visual.material.PBRMaterial(
        baseColorTexture=Image.open(tex_path),
        metallicFactor=metallic, roughnessFactor=roughness)
    if nmap_path:
        m.normalTexture = Image.open(nmap_path)
    return m

M_GOLD   = texmat('textures/mli.png', 'textures/mli_n.png', 0.92, 0.28)
M_SOLAR  = texmat('textures/solar.png', 'textures/solar_n.png', 0.25, 0.40)
M_HGA    = texmat('textures/hga.png', 'textures/hga_n.png', 0.70, 0.28)
M_DARK   = texmat('textures/dark.png', 'textures/dark_n.png', 0.35, 0.55)
M_WHITE  = texmat('textures/white.png', None, 0.10, 0.40)
M_RAD    = texmat('textures/rad.png', None, 0.60, 0.30)
M_HORN   = texmat('textures/horn.png', 'textures/horn_n.png', 0.15, 0.85)
M_SILVER = trimesh.visual.material.PBRMaterial(
    baseColorFactor=[0.84, 0.85, 0.88, 1.0], metallicFactor=0.95, roughnessFactor=0.20)
M_GOLDS  = trimesh.visual.material.PBRMaterial(
    baseColorFactor=[0.80, 0.62, 0.26, 1.0], metallicFactor=0.90, roughnessFactor=0.28)
M_BLACK  = trimesh.visual.material.PBRMaterial(
    baseColorFactor=[0.02, 0.02, 0.03, 1.0], metallicFactor=0.10, roughnessFactor=0.20)
M_NAVY   = trimesh.visual.material.PBRMaterial(
    baseColorFactor=[0.10, 0.12, 0.20, 1.0], metallicFactor=0.30, roughnessFactor=0.50)

# ================================================================ UVヘルパ
def box_uv(mesh, scale=1.0):
    v, f, n = mesh.vertices, mesh.faces, mesh.face_normals
    uv = np.zeros((len(f), 3, 2))
    for i in range(len(f)):
        axis = np.argmax(np.abs(n[i]))
        a, b = [k for k in range(3) if k != axis]
        for j in range(3):
            p = v[f[i, j]]
            uv[i, j] = (p[a] * scale, p[b] * scale)
    uv -= uv.min(axis=(0, 1), keepdims=True)
    span = float(np.max(uv.max(axis=(0, 1)) - uv.min(axis=(0, 1))))
    uv = (uv - uv.min(axis=(0, 1), keepdims=True)) / (span + 1e-9)
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv.reshape(-1, 2), material=mesh.visual.material)

def cyl_uv(mesh, scale=1.0):
    v, f, n = mesh.vertices, mesh.faces, mesh.face_normals
    uv = np.zeros((len(f), 3, 2))
    for i in range(len(f)):
        vertical = np.abs(n[i, 2]) < 0.7
        for j in range(3):
            p = v[f[i, j]]
            if vertical:
                uv[i, j, 0] = (np.arctan2(p[1], p[0]) / (2 * np.pi) + 0.5) * scale * 4
            else:
                uv[i, j, 0] = (p[0] + p[1]) * scale
            uv[i, j, 1] = p[2] * scale * 4
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv.reshape(-1, 2), material=mesh.visual.material)

def disc_uv(mesh, scale=1.0):
    """円盤(上面はX-Y平面投影)"""
    v, f, n = mesh.vertices, mesh.faces, mesh.face_normals
    uv = np.zeros((len(f), 3, 2))
    for i in range(len(f)):
        if abs(n[i, 2]) > 0.7:
            for j in range(3):
                p = v[f[i, j]]
                uv[i, j] = (p[0] * scale, p[1] * scale)
        else:
            for j in range(3):
                p = v[f[i, j]]
                uv[i, j] = ((p[0] + p[1]) * scale, p[2] * scale)
    uv -= uv.min(axis=(0, 1), keepdims=True)
    span = float(np.max(uv.max(axis=(0, 1)) - uv.min(axis=(0, 1))))
    uv = (uv - uv.min(axis=(0, 1), keepdims=True)) / (span + 1e-9)
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv.reshape(-1, 2), material=mesh.visual.material)

# ================================================================ パーツ構築
parts = []
def add(mesh, name, name_en, desc, m, uv='box', scale=1.0):
    mesh.unmerge_vertices()
    mesh.visual = trimesh.visual.TextureVisuals(material=m)
    if uv == 'box': box_uv(mesh, scale)
    elif uv == 'cyl': cyl_uv(mesh, scale)
    elif uv == 'disc': disc_uv(mesh, scale)
    parts.append((mesh, name, name_en, desc))

def prim_box(name, name_en, desc, extents, center, m, uv='box', scale=1.0, rounded=None):
    mesh = trimesh.creation.box(extents=extents)
    if rounded:
        mesh = mesh.subdivide_to_size(rounded)
        trimesh.smoothing.filter_laplacian(mesh, iterations=6, lamb=0.55)
    mesh.apply_translation(center)
    add(mesh, name, name_en, desc, m, uv, scale)

def prim_cyl(name, name_en, desc, radius, height, center, m, axis='z', uv='cyl', scale=1.0, sections=48):
    mesh = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    if axis == 'x':
        mesh.apply_transform(rotation_matrix(np.pi / 2, [0, 1, 0]))
    elif axis == 'y':
        mesh.apply_transform(rotation_matrix(np.pi / 2, [1, 0, 0]))
    mesh.apply_translation(center)
    add(mesh, name, name_en, desc, m, uv, scale)

def prim_frustum(name, name_en, desc, r_top, r_bot, height, center, m, uv='cyl', scale=1.0, sections=48):
    ang = np.linspace(0, 2 * np.pi, sections, endpoint=False)
    top = np.c_[r_top * np.cos(ang), r_top * np.sin(ang), np.full(sections, height / 2)]
    bot = np.c_[r_bot * np.cos(ang), r_bot * np.sin(ang), np.full(sections, -height / 2)]
    verts = np.vstack([top, bot, [[0, 0, height / 2], [0, 0, -height / 2]]])
    faces = []
    for i in range(sections):
        j = (i + 1) % sections
        faces += [[i, j, sections + j], [i, sections + j, sections + i]]
        faces += [[i, j, 2 * sections]]
        faces += [[sections + j, sections + i, 2 * sections + 1]]
    mesh = trimesh.Trimesh(vertices=verts, faces=np.array(faces))
    mesh.merge_vertices(); mesh.fix_normals()
    mesh.apply_translation(center)
    add(mesh, name, name_en, desc, m, uv, scale)

def prim_sphere(name, name_en, desc, radius, center, m):
    mesh = trimesh.creation.icosphere(subdivisions=3, radius=radius)
    mesh.apply_translation(center)
    add(mesh, name, name_en, desc, m, 'box', radius * 2)

def prim_torus(name, name_en, desc, major, tube, center, m, axis='z'):
    mesh = trimesh.creation.torus(major_radius=major, minor_radius=tube,
                                  major_sections=48, minor_sections=14)
    if axis == 'x':
        mesh.apply_transform(rotation_matrix(np.pi / 2, [0, 1, 0]))
    mesh.apply_translation(center)
    add(mesh, name, name_en, desc, m, 'box', major)

# ================================================================ 本体
# 構体外形 X1600×Y1000×Z1250mm(公式模型資料)。金MLIで覆われた丸みのある箱
prim_box('本体 (Main Body)', 'Main Body',
         '構体外形 1.6(X)×1.0(Y)×1.25(Z)m。表面は金のMLI断熱材で覆われる。+Z=HGA/太陽・地球方向、-Z=リュウグウ方向(科学機器)、+X=イオンエンジン面、-X=カプセル・STT面',
         [1.6, 1.0, 1.25], [0, 0, 0], M_GOLD, rounded=0.05, scale=1.2)

# ---- 側面ラジエータ(±Y面: 銀色パネルのモザイク、公式図面の斜線領域) ----
for sy in [1, -1]:
    for (rx, ry, rz, cx_, cz_) in [(0.34, 0.20, 0.02, -0.35, 0.28), (0.34, 0.20, 0.02, 0.10, 0.28),
                                    (0.30, 0.16, 0.02, 0.45, 0.30), (0.40, 0.24, 0.02, -0.25, -0.10),
                                    (0.26, 0.15, 0.02, 0.30, -0.18)]:
        prim_box(f'ラジエータパネル ({ "±Y" if sy>0 else "-Y"}面)', 'Radiator Panel',
                 '機器排熱用の銀色ラジエータパネル。+Y/-Y面に複数枚が貼られる',
                 [rx, 0.015, rz], [cx_, sy * 0.508, cz_], M_RAD, scale=1.5)
# -X面の大型ラジエータ
prim_box('-X面ラジエータ', 'Radiator Panel (-X)',
         '-X面中央上部の放熱パネル(公式図面の斜線領域)',
         [0.015, 0.62, 0.34], [-0.808, 0.05, 0.18], M_RAD, scale=1.5)

# ================================================================ 太陽電池パドル
# 3枚/翼(各1360〜1400mm)、翼幅1360mm、アーム1130mm、全スパン5980mm
# パネル配置: X方向に -2114..-754 / -700..700 / 754..2114 (中央が1400mm)
PANEL_Z = 0.45  # パドル面の高さ(上面デッキ直下)
for s, side in [(1, '+Y'), (-1, '-Y')]:
    # SADA(パドル駆動機構)+ヨーク(2本フレーム、X間隔660mm)
    prim_box(f'パドル駆動機構 SADA ({side}翼)', 'SADA (Paddle Drive)',
             '太陽電池パドルの駆動機構。太陽方向へパドルを追従させる',
             [0.60, 0.10, 0.18], [0, s * 0.545, PANEL_Z], M_GOLDS)
    for fx in [-0.33, 0.33]:
        prim_box(f'パドルヨーク ({side}翼)', 'Paddle Yoke',
                 '本体とパネルを接続するアーム(長さ1130mm、2本フレーム)',
                 [0.10, 1.13, 0.09], [fx, s * (0.50 + 1.13 / 2), PANEL_Z], M_GOLDS)
    # パネル3枚
    spans = [(-2.114, -0.754), (-0.700, 0.700), (0.754, 2.114)]
    for i, (x0, x1) in enumerate(spans):
        w = x1 - x0
        prim_box(f'太陽電池パドル {side}翼パネル{i + 1}', 'Solar Array Panel',
                 '高効率3接合太陽電池。片翼3枚×2翼=6面で2.6kW級を発電',
                 [w, 1.36, 0.028], [(x0 + x1) / 2, s * (1.630 + 0.68), PANEL_Z], M_SOLAR, scale=2.0)
    # パネル間ヒンジ(金 color)
    for hx in [-0.727, 0.727]:
        prim_box(f'パドルヒンジ ({side}翼)', 'Panel Hinge',
                 'パネル間の折りたたみヒンジ(展開時の関節)',
                 [0.09, 1.30, 0.045], [hx, s * 2.31, PANEL_Z], M_GOLDS)
    # パネル裏面のハーネス(ダークボックス数個)
    for hx in [-1.5, 0.0, 1.5]:
        prim_box(f'パドル裏ハーネス ({side}翼)', 'Paddle Harness',
                 'パネル裏面の配線ハーネス(公式図面「太陽電池パドルの裏側」)',
                 [0.30, 0.04, 0.02], [hx, s * 2.31, PANEL_Z - 0.025], M_DARK)

# ================================================================ 上面デッキ(+Z)
# X帯HGA(平面型、+Y側、直径約0.88m) — 全外形1876mmの根拠
prim_frustum('X帯高利得アンテナ (XHGA)', 'X-band High-Gain Antenna',
             'X帯(8GHz)の平面型高利得アンテナ。パラボラを平面化して着陸機搭載スペースを確保。+Z面+Y側に搭載',
             0.44, 0.395, 0.05, [0.10, 0.49, 0.655], M_HGA, uv='disc', scale=1.0, sections=72)
prim_cyl('XHGA中心給電部', 'XHGA Feed', 'アンテナ中心の給電部',
         0.05, 0.03, [0.10, 0.49, 0.692], M_SILVER, sections=24)
prim_torus('XHGA外周リム', 'XHGA Rim', '平面アンテナの外周フレーム',
           0.44, 0.015, [0.10, 0.49, 0.682], M_SILVER)
prim_cyl('XHGA取付架台', 'XHGA Pedestal', '平面アンテナの取付・指向架台',
         0.10, 0.06, [0.10, 0.49, 0.625], M_GOLDS, sections=32)
# Ka帯HGA(平面型、-Y側、直径約0.76m)
prim_frustum('Ka帯高利得アンテナ (KaHGA)', 'Ka-band High-Gain Antenna',
             '高速通信用に新規追加されたKa帯(32GHz)平面アンテナ。X帯の約4倍のデータ伝送。+Z面-Y側に搭載',
             0.38, 0.34, 0.045, [0.10, -0.52, 0.655], M_HGA, uv='disc', scale=1.0, sections=72)
prim_cyl('KaHGA中心給電部', 'KaHGA Feed', 'アンテナ中心の給電部',
         0.04, 0.03, [0.10, -0.52, 0.688], M_SILVER, sections=24)
prim_torus('KaHGA外周リム', 'KaHGA Rim', '平面アンテナの外周フレーム',
           0.38, 0.015, [0.10, -0.52, 0.679], M_SILVER)
prim_cyl('KaHGA取付架台', 'KaHGA Pedestal', '平面アンテナの取付・指向架台',
         0.09, 0.06, [0.10, -0.52, 0.625], M_GOLDS, sections=32)
# X帯中利得アンテナ(ホーン型、KaHGA手前)
prim_cyl('X帯中利得アンテナ (X-MGA)', 'X-band Medium-Gain Antenna',
         'X帯中利得アンテナ(ホーン型)。HGAの指向が取れない局面で使用',
         0.055, 0.16, [-0.35, -0.30, 0.73], M_DARK, sections=32)
prim_torus('X-MGA開口リム', 'X-MGA Aperture Rim', '', 0.055, 0.008, [-0.35, -0.30, 0.815], M_SILVER)
# Y帯低利得アンテナ(LGA-A: 上面の塔)
prim_cyl('Y帯低利得アンテナ (YLGA-A)', 'Y-band Low-Gain Antenna',
         '全方位性の低利得アンテナ(緊急時通信)。機体各面に分散配置',
         0.014, 0.22, [0.72, -0.18, 0.74], M_WHITE, sections=16)
# DCAM3(分離カメラ、-X側中央やや+Y)
prim_cyl('DCAM3 (分離カメラ)', 'Deployable Camera (DCAM3)',
         'SCI衝突実験の様子を上空から撮影するため分離される小型カメラ',
         0.05, 0.09, [-0.55, 0.12, 0.68], M_DARK, sections=32)
# DCAM3-ANT(+X,-Y角のアンテナ塔)
prim_box('DCAM3アンテナ (DCAM3-ANT)', 'DCAM3 Antenna',
         '分離したDCAM3との通信アンテナ',
         [0.05, 0.05, 0.24], [0.68, -0.36, 0.74], M_GOLDS)
prim_cyl('DCAM3-ANTホイップ', '', '', 0.008, 0.16, [0.68, -0.36, 0.90], M_WHITE, sections=12)
# CSAS(粗太陽センサ、-X,-Y角)
for i, (cx_, cy_) in enumerate([(-0.66, -0.34), (-0.66, -0.24)]):
    prim_box(f'粗太陽センサ CSAS-{"B" if i==0 else "A"}', 'Coarse Sun Aspect Sensor',
             '太陽方向を粗く検出するセンサ(姿勢制御用)',
             [0.06, 0.06, 0.05], [cx_, cy_, 0.65], M_DARK)
# 上面の小型機器ボックス(TXBF・スイッチ類の代替)
prim_box('通信系機器ボックス', 'Communication Equipment Box',
         'X帯/Ka帯通信用の電子機器(フィルタ・スイッチ等)',
         [0.16, 0.10, 0.08], [0.55, 0.10, 0.67], M_DARK)

# ================================================================ 下面デッキ(-Z)
HZ = -0.625  # 本体下面
HORN_X, HORN_Y = -0.03, 0.05  # ホーン中心の偏心(約60mm)
# 中央の円形分離リング構造(CSAS/PAF分離面)
prim_cyl('下面中央リング構造', 'Bottom Center Ring',
         'ロケットとの分離面を構成する中央リング。タッチダウン時の基部構造',
         0.46, 0.06, [0, 0, HZ - 0.01], M_GOLD, uv='cyl', scale=1.5, sections=72)
prim_torus('分離リング外周トーラス', 'Separation Ring Torus',
           '衛星分離面(1575mm径級)の外周',
           0.46, 0.025, [0, 0, HZ - 0.02], M_GOLDS)
# SCI(衝突装置、-X側中央。円錐が-Zを向く)
prim_cyl('SCI (小型衝突装置)', 'Small Carry-on Impactor',
         '火薬で2kgの銅弾を約2km/sに加速し、人工クレーター(おむすびころりん)を作った世界初の装置',
         0.155, 0.26, [-0.42, -0.10, HZ - 0.10], M_DARK, uv='cyl', scale=1.5, sections=48)
prim_cyl('SCI先端キャップ', 'SCI Cap', 'SCIの分離時キャップ',
         0.13, 0.04, [-0.42, -0.10, HZ - 0.25], M_GOLDS, sections=48)
# --- サンプラホーン(全長約1m、先端は分離面から850mm下) ---
prim_cyl('サンプラホーン取付部', 'Sampler Horn Mount',
         'ホーンと本体下面の接続構造',
         0.15, 0.07, [HORN_X, HORN_Y, HZ - 0.035], M_GOLDS, sections=48)
prim_cyl('サンプルキャッチャ', 'Sample Catcher',
         'ホーン最上部の試料容器。3室に分かれ、複数回の採取試料を別々に保管',
         0.125, 0.10, [HORN_X, HORN_Y, HZ - 0.12], M_DARK, sections=48)
prim_cyl('上部ホーン (アルミ円筒)', 'Upper Horn (Aluminum)',
         '直径20cm・全長約1mのサンプラホーンの上段(アルミ円筒)',
         0.10, 0.22, [HORN_X, HORN_Y, HZ - 0.28], M_WHITE, sections=48)
prim_cyl('中部ホーン (ベクトラン布・蛇腹)', 'Middle Horn (Bellows)',
         'ベクトラン布製の蛇腹構造。着地時の衝撃を吸収する伸縮部',
         0.10, 0.30, [HORN_X, HORN_Y, HZ - 0.54], M_HORN, uv='cyl', scale=2.2, sections=48)
prim_cyl('下部ホーン (アルミ円筒)', 'Lower Horn (Aluminum)',
         'ホーンの下段(アルミ円筒)',
         0.10, 0.14, [HORN_X, HORN_Y, HZ - 0.76], M_WHITE, sections=48)
prim_frustum('サンプラホーン先端ベル', 'Horn Bell (Sampling Horn)',
             '先端がリュウグウ表面に触れると弾(タンタル玉)を発射し、跳ね上がった物質を捕集',
             0.10, 0.22, 0.13, [HORN_X, HORN_Y, HZ - 0.90], M_WHITE, scale=1.0, sections=48)
for rib_i, (rz, rr) in enumerate([(HZ-0.905, 0.113), (HZ-0.935, 0.145), (HZ-0.955, 0.185)]):
    prim_torus(f'ホーンベル補強リブ{rib_i+1}', 'Horn Bell Rib', 'ベル外側の補強リング',
               rr, 0.008, [HORN_X, HORN_Y, rz], M_SILVER)
prim_torus('ホーン先端折返し (返し)', 'Horn Cuff',
           '先端内側の折り返し。1〜5mmの礫を引っかけて捕獲する',
           0.215, 0.013, [HORN_X, HORN_Y, HZ - 0.955], M_SILVER)
# --- ターゲットマーカ5個(リング上、-Y側の円弧) ---
for i in range(5):
    ang = np.pi * (0.15 + 0.7 * i / 4)  # -Y側半円弧
    tx = 0.40 * np.cos(ang)
    ty = -0.40 * np.sin(ang)
    prim_sphere(f'ターゲットマーカ TM-{"ABCDE"[i]}', 'Target Marker',
                'タッチダウンの目印として表面に投下される反射材入りの小球(直径10cm)。中には88万人の名前入りシート',
                0.05, [tx, ty, HZ - 0.03], M_WHITE)
# --- 観測機器(下面デッキ) ---
prim_box('ONC-T (光学航法カメラ・望遠)', 'ONC-T (Telescopic Camera)',
         '望遠光学航法カメラ(視野6.35°)。科学観測にも使用。下面-X+Y側',
         [0.15, 0.15, 0.11], [-0.55, 0.28, HZ - 0.05], M_DARK, rounded=0.02)
prim_cyl('ONC-Tレンズ', 'ONC-T Lens', '', 0.048, 0.05, [-0.55, 0.28, HZ - 0.13], M_BLACK, sections=32)
prim_torus('ONC-Tレンズフード', 'ONC-T Hood', '', 0.056, 0.008, [-0.55, 0.28, HZ - 0.15], M_DARK)
prim_box('ONC-W1 (光学航法カメラ・広角)', 'ONC-W1 (Wide Camera)',
         '広角光学航法カメラ(視野65°)。下面に下向き。ONC-Tの隣',
         [0.13, 0.13, 0.10], [-0.55, 0.10, HZ - 0.05], M_DARK, rounded=0.02)
prim_cyl('ONC-W1レンズ', 'ONC-W1 Lens', '', 0.042, 0.05, [-0.55, 0.10, HZ - 0.125], M_BLACK, sections=32)
prim_torus('ONC-W1レンズフード', 'ONC-W1 Hood', '', 0.050, 0.008, [-0.55, 0.10, HZ - 0.145], M_DARK)
prim_box('LIDAR (レーザ高度計)', 'Laser Altimeter (LIDAR)',
         'レーザパルス往復時間で距離を測定(30m〜25km)。下面-X-Y側',
         [0.13, 0.13, 0.11], [-0.42, -0.33, HZ - 0.05], M_DARK, rounded=0.02)
prim_cyl('LIDAR光学系', 'LIDAR Optics', '', 0.042, 0.05, [-0.42, -0.33, HZ - 0.13], M_BLACK, sections=32)
prim_box('TIR (熱赤外カメラ)', 'Thermal Infrared Camera (TIR)',
         '8〜12μm帯で表面温度分布を撮影し熱慣性を調査。下面+X+Y側',
         [0.11, 0.11, 0.09], [0.45, 0.30, HZ - 0.045], M_DARK, rounded=0.02)
prim_cyl('TIRフード', 'TIR Hood', '', 0.045, 0.06, [0.45, 0.30, HZ - 0.12], M_BLACK, sections=32)
# FLA(フラッシュライト)とLRF
prim_box('FLA (フラッシュライト)', 'Flash Light (FLA)',
         'タッチダウン時にターゲットマーカを照らすストロボ',
         [0.08, 0.08, 0.06], [-0.30, 0.33, HZ - 0.03], M_DARK)
prim_box('LRF-S1 (レーザレンジファインダ)', 'Laser Range Finder (LRF-S1)',
         'タッチダウン直前の高度・姿勢を測る短距離レーザセンサ',
         [0.07, 0.07, 0.05], [HORN_X + 0.20, HORN_Y + 0.10, HZ - 0.025], M_DARK)
prim_box('LRF-S2 (レーザレンジファインダ)', 'Laser Range Finder (LRF-S2)',
         'タッチダウン直前の高度・姿勢を測る短距離レーザセンサ',
         [0.07, 0.07, 0.05], [HORN_X + 0.22, HORN_Y - 0.12, HZ - 0.025], M_DARK)
# 着陸機・ローバ(下面デッキ)
prim_box('MASCOT射出機構 (NESS)', 'MASCOT Ejection (NESS)',
         '小型着陸機MASCOTの搭載・射出機構。MASCOT本体は-Y面に露出',
         [0.34, 0.30, 0.10], [0.30, -0.30, HZ - 0.05], M_DARK)
prim_cyl('MINERVA-II1A (ローバ)', 'MINERVA-II1A Rover',
         'リュウグウ表面をホッピング移動した自律小型ローバ(イブー)。下面+X-Y側',
         0.09, 0.11, [0.48, -0.12, HZ - 0.05], M_SILVER, sections=32)
prim_cyl('MINERVA-II1B (ローバ)', 'MINERVA-II1B Rover',
         '自律小型ローバ(アウル)',
         0.09, 0.11, [0.48, -0.32, HZ - 0.05], M_SILVER, sections=32)
prim_cyl('MINERVA-II2 (ローバ)', 'MINERVA-II2 Rover',
         '自律小型ローバII2(東北大学等)。下面-X-Y側',
         0.08, 0.10, [-0.15, -0.38, HZ - 0.05], M_SILVER, sections=32)
# 下面の低利得アンテナ
prim_cyl('X帯低利得アンテナ (XLGA-C)', 'X-band Low-Gain Antenna (XLGA-C)',
         '下面側の低利得アンテナ',
         0.013, 0.12, [0.55, 0.05, HZ - 0.06], M_WHITE, axis='z', sections=12)

# ================================================================ +X面: イオンエンジン
# IESパネル(黒) + μ10×4(2×2) + 中性化器×4 + IPPU-A/B
prim_box('イオンエンジン搭載パネル (IES)', 'Ion Engine Panel',
         'μ10イオンエンジン4基を搭載する+X面の黒いパネル(2軸ジンバルで推力方向を制御)',
         [0.10, 0.76, 0.66], [0.85, 0, 0.05], M_DARK, scale=1.5)
for yy, zz in [(-0.17, 0.22), (0.17, 0.22), (-0.17, -0.20), (0.17, -0.20)]:
    prim_cyl('イオンエンジン μ10', 'Ion Engine (μ10)',
             'キセノンをマイクロ波放電でイオン化し高速噴射。推力10mN×4基、最大3基同時運転',
             0.105, 0.14, [0.88, yy, zz], M_DARK, axis='x', sections=48)
    prim_torus('μ10加速グリッド', 'Ion Engine Grid',
               'マイクロ波放電の加速グリッド',
               0.105, 0.012, [0.95, yy, zz], M_SILVER, axis='x')
    prim_cyl('μ10放電面', 'Ion Engine Discharge',
             'マイクロ波放電室',
             0.085, 0.02, [0.955, yy, zz], M_BLACK, axis='x', sections=32)
    prim_cyl('中性化器 (NEUT)', 'Neutralizer',
             'イオンビームを中性化する電子放出器',
             0.028, 0.10, [0.88, yy * 0.55, zz + 0.14 * (1 if yy > 0 else -1) * 0.4],
             M_DARK, axis='x', sections=24)
# IPPU(電源処理装置、+X面上端/下端)
prim_box('IPPU-A (イオンエンジン電源)', 'Ion Power Processing Unit (IPPU-A)',
         'イオンエンジンの電源処理装置A。+X面上端',
         [0.10, 0.55, 0.12], [0.86, 0, 0.48], M_GOLDS)
prim_box('IPPU-B (イオンエンジン電源)', 'Ion Power Processing Unit (IPPU-B)',
         'イオンエンジンの電源処理装置B。+X面下端',
         [0.10, 0.55, 0.12], [0.86, 0, -0.48], M_GOLDS)
# +X面の低利得アンテナ(LGA-B)
prim_cyl('X帯低利得アンテナ (XLGA-B)', 'X-band Low-Gain Antenna (XLGA-B)',
         '+X面下端の低利得アンテナ',
         0.013, 0.12, [0.80, -0.30, -0.55], M_WHITE, axis='x', sections=12)

# ================================================================ -X面: STT・カプセル・NIRS3
# スタートラッカ2基(上端、横に並列)
for i, cy_ in enumerate([0.12, -0.12]):
    prim_cyl(f'スタートラッカ{i + 1} (STT)', 'Star Tracker',
             '恒星を撮像して姿勢を決定する装置。-X面上端に2基(冗長系)',
             0.055, 0.17, [-0.72, cy_, 0.48], M_DARK, axis='x', sections=32)
    prim_torus(f'STTバッフル{i + 1}', 'STT Baffle', 'スタートラッカの遮光バッフル',
               0.062, 0.010, [-0.815, cy_, 0.48], M_BLACK, axis='x')
# 帰還カプセル(下部中央、熱防御シールドが外向き)
prim_cyl('帰還カプセル (SRC)', 'Re-entry Capsule',
         'サンプルコンテナを内蔵。2020年12月6日、約12km/sで大気圏再突入しウーメラ砂漠に着地。-X面下部中央',
         0.20, 0.17, [-0.72, 0, -0.32], M_WHITE, axis='x', sections=48)
prim_frustum('帰還カプセル熱防御シールド', 'Capsule Heat Shield',
             '再突入時(約3000℃)の熱から守るアブレータ。外側(-X)を向く',
             0.205, 0.24, 0.06, [-0.825, 0, -0.32], M_GOLDS, scale=1.0, sections=48)
prim_torus('帰還カプセル分離リング', 'Capsule Separation Ring', '',
           0.205, 0.012, [-0.645, 0, -0.32], M_SILVER, axis='x')
# NIRS3(-X面下部+Y側に張り出す)
prim_box('NIRS3 (近赤外分光計)', 'Near-Infrared Spectrometer (NIRS3)',
         '3μm帯の吸収から含水鉱物や有機物を検出。光学系は-X面下部+Y側に張り出し、下向きに観測',
         [0.16, 0.12, 0.13], [-0.79, 0.30, -0.38], M_DARK, rounded=0.02)
prim_cyl('NIRS3光学系', 'NIRS3 Optics', '近赤外望遠鏡の開口',
         0.037, 0.05, [-0.79, 0.30, -0.47], M_BLACK, axis='z', sections=24)

# ================================================================ -Y面: MASCOT・ONC-W2・CAM-H
prim_box('MASCOT (小型着陸機)', 'MASCOT Lander',
         '独DLR・仏CNES開発の小型着陸機(30×28×19cm)。2018年10月3日に分離、リュウグウ表面で約17時間観測。-Y面上部に露出',
         [0.30, 0.06, 0.28], [0.28, -0.505, 0.22], M_DARK, rounded=0.015)
prim_box('ONC-W2 (光学航法カメラ・広角2)', 'ONC-W2 (Wide Camera)',
         '側面(横)向きの広角光学航法カメラ。ローバ分離や降下の監視に使用。-Y面下端',
         [0.10, 0.10, 0.08], [-0.30, -0.505, -0.42], M_DARK, rounded=0.02)
prim_cyl('CAM-H (モニタカメラ)', 'Monitor Camera (CAM-H)',
         'タッチダウン直後の撮影に使用された小型モニタカメラ。-Y面下端',
         0.02, 0.06, [0.12, -0.50, -0.50], M_BLACK, axis='y', sections=16)

# ================================================================ RCSスラスタ(4隅)
for sx in [-1, 1]:
    for sy in [-1, 1]:
        prim_box(f'RCSスラスタポッド ({"+" if sx>0 else "-"}X{"+" if sy>0 else "-"}Y)',
                 'RCS Thruster Pod',
                 '化学推進20Nスラスタ(12基)。姿勢制御・軌道修正に使用。本体四隅に配置',
                 [0.14, 0.14, 0.22], [sx * 0.76, sy * 0.44, 0.28], M_GOLDS, rounded=0.02)
        # ノズル3本(外向き2+上向き1)
        prim_cyl('RCSノズル', 'RCS Nozzle', '', 0.030, 0.10,
                 [sx * 0.86, sy * 0.50, 0.28], M_BLACK, axis='x', sections=16)
        prim_cyl('RCSノズル', 'RCS Nozzle', '', 0.030, 0.10,
                 [sx * 0.76, sy * 0.54, 0.36], M_BLACK, axis='y', sections=16)
        prim_cyl('RCSノズル', 'RCS Nozzle', '', 0.030, 0.09,
                 [sx * 0.76, sy * 0.44, 0.43], M_BLACK, axis='z', sections=16)

# ================================================================ 書き出し
scene = trimesh.Scene()
for mesh, name, name_en, desc in parts:
    scene.add_geometry(mesh, node_name=name, geom_name=name)

scene.export('hayabusa2_spacecraft.glb')
scene.export('hayabusa2_spacecraft.obj')

merged = trimesh.util.concatenate([m for m, _, _, _ in parts])
merged.export('hayabusa2_spacecraft.stl')

with open('parts_list.json', 'w', encoding='utf-8') as f:
    json.dump([
        {'name': n, 'name_en': ne, 'description': d,
         'faces': int(m.faces.shape[0]), 'vertices': int(m.vertices.shape[0])}
        for m, n, ne, d in parts
    ], f, ensure_ascii=False, indent=2)

print(f'parts: {len(parts)}, total faces: {merged.faces.shape[0]}')

# ---------------------------------------------------------- プレビュー(簡易陰影付け)
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

def part_color(m):
    matv = m.visual.material
    if hasattr(matv, 'baseColorTexture') and matv.baseColorTexture is not None:
        t = np.asarray(matv.baseColorTexture.convert('RGB').resize((8, 8))).mean(axis=(0, 1))
        return t / 255.0
    bc = matv.baseColorFactor
    c = [float(x) for x in bc[:3]]
    return [x / 255.0 if x > 1 else x for x in c]

fig = plt.figure(figsize=(16, 10), dpi=100)
views = [(18, -55, 'isometric'), (35, -90, 'bottom (-Z) science deck'),
         (5, 0, 'side (-Y) MASCOT face'), (5, 90, 'side (+Y)'),
         (30, 180, '-X capsule face'), (25, 0, '+X ion engine face')]
light = np.array([0.4, 0.35, 0.85]); light /= np.linalg.norm(light)
for k, (elev, azim, title) in enumerate(views):
    ax = fig.add_subplot(2, 3, k + 1, projection='3d')
    for m, n, ne, d in parts:
        tris = m.vertices[m.faces]
        col = np.array(part_color(m))
        # 面法線で簡易ランバート陰影
        fn = m.face_normals
        lam = np.clip(fn @ light, 0, 1) * 0.75 + 0.25
        pc = Poly3DCollection(tris, facecolor=np.clip(col[None, :] * lam[:, None], 0, 1),
                              edgecolor='none')
        ax.add_collection3d(pc)
    ax.set_xlim(-3.1, 3.1); ax.set_ylim(-3.1, 3.1); ax.set_zlim(-1.9, 1.4)
    ax.set_box_aspect((3.1, 3.1, 1.65))
    ax.view_init(elev=elev, azim=azim)
    ax.set_title(title, color='#e8e8ec', pad=10)
    ax.axis('off')
    ax.set_facecolor('#0a0d12')
plt.tight_layout()
plt.savefig('preview.png', facecolor='#0a0d12', bbox_inches='tight')
print('preview.png saved')
