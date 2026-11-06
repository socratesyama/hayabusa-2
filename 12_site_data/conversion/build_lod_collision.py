#!/usr/bin/env python3
"""
リュウグウ形状モデル(OBJ)から、WASD移動用の軽量メッシュ(LOD)と
当たり判定用コリジョンメッシュを生成する。

- 200k面 → 指定面数に頂点間引き(頂点クラスタリング)で削減
- 出力は Three.js の GLTFLoader で直接読める標準 OBJ

依存: numpy のみ(Python標準+numpyで動作。trimesh等は不要)

使い方(リポジトリルートから):
  python3 12_site_data/conversion/build_lod_collision.py \
      01_shape_models/ryugu_shape_spc_200k_v20200323_web.obj \
      12_site_data/generated
"""
import argparse
import os

import numpy as np


def load_obj(path):
    verts, faces = [], []
    with open(path) as f:
        for line in f:
            if line.startswith("v "):
                verts.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("f "):
                faces.append([int(p.split("/")[0]) - 1 for p in line.split()[1:4]])
    return np.asarray(verts), np.asarray(faces, dtype=np.int64)


def cluster_decimate(verts, faces, target_faces):
    """頂点クラスタリングによる簡易メッシュ削減。
    空間を格子に分割し、各セルの頂点をその重心に統合する。"""
    v_min, v_max = verts.min(axis=0), verts.max(axis=0)
    # 面数に応じて格子解像度を決める(概算: 格子数^3/2 ≈ 面数)
    grid = max(2, int(round((target_faces * 2) ** (1.0 / 3.0))))
    idx = np.floor((verts - v_min) / (v_max - v_min + 1e-12) * (grid - 1)).astype(np.int64)
    # セルID -> 新頂点
    cell_ids, inverse = np.unique(idx, axis=0, return_inverse=True)
    new_verts = np.zeros((len(cell_ids), 3))
    counts = np.zeros(len(cell_ids))
    np.add.at(new_verts, inverse, verts)
    np.add.at(counts, inverse, 1)
    new_verts /= counts[:, None]
    # 面を張り替え(縮退した面は除去)
    new_faces = inverse[faces]
    keep = (
        (new_faces[:, 0] != new_faces[:, 1])
        & (new_faces[:, 1] != new_faces[:, 2])
        & (new_faces[:, 2] != new_faces[:, 0])
    )
    return new_verts, new_faces[keep]


def save_obj(path, verts, faces, comment):
    with open(path, "w") as f:
        f.write(f"# {comment}\n")
        f.write(f"# credit: JAXA/ISAS/DARTS (shape model SPC v20200323, Watanabe et al. 2019)\n")
        f.write(f"# units: km, body-fixed frame IAU_RYUGU\n")
        for v in verts:
            f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
        for t in faces:
            f.write(f"f {t[0]+1} {t[1]+1} {t[2]+1}\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("obj", help="入力OBJ(単位km, IAU_RYUGU)")
    ap.add_argument("out_dir", help="出力ディレクトリ")
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)

    verts, faces = load_obj(args.obj)
    print(f"source: {len(verts)} verts / {len(faces)} faces")

    # LOD3(遠景用・超軽量) / LOD2(中景) / LOD1(近景・元の49kも活用)
    # コリジョンはLOD2相当で十分(200kは当たり判定には重い)
    for name, target in [("lod3_5k", 5000), ("lod2_15k", 15000)]:
        nv, nf = cluster_decimate(verts, faces, target)
        out = os.path.join(args.out_dir, f"ryugu_{name}.obj")
        save_obj(out, nv, nf, f"Ryugu LOD mesh {name} (decimated from SPC v20200323)")
        print(f"  {out}: {len(nv)} verts / {len(nf)} faces")

    # コリジョン用(LOD2と同じ解像度で別名管理)
    nv, nf = cluster_decimate(verts, faces, 15000)
    out = os.path.join(args.out_dir, "ryugu_collision_15k.obj")
    save_obj(out, nv, nf, "Ryugu collision mesh (decimated from SPC v20200323)")
    print(f"  {out}: {len(nv)} verts / {len(nf)} faces")
    print("OK")


if __name__ == "__main__":
    main()
