#!/usr/bin/env python3
"""
DSK (Digital Shape Kernel) 形式のリュウグウ形状モデルを Wavefront OBJ 形式へ変換する。
必要環境: pip install spiceypy numpy

使用例:
  python3 dsk_to_obj.py ryugu_shape_spc_200k_v20200323.bds output.obj

クレジット: 元データ JAXA/ISAS/DARTS (Watanabe et al. 2019 ほか)
"""
import sys
import numpy as np
import spiceypy as sp


def dsk_to_obj(dsk_path, obj_path):
    handle = sp.dasopr(dsk_path)
    dladsc = sp.dlabfs(handle)
    nv, nplates = sp.dskz02(handle, dladsc)
    print(f"{dsk_path}: vertices={nv}, plates={nplates}")
    verts = np.array(sp.dskv02(handle, dladsc, 1, nv)).reshape(nv, 3)
    plates = np.array(sp.dskp02(handle, dladsc, 1, nplates)).reshape(nplates, 3).astype(int)
    sp.dascls(handle)

    with open(obj_path, "w") as f:
        f.write(f"# Converted from DSK: {dsk_path}\n")
        f.write("# Credit: JAXA/ISAS/DARTS\n")
        f.write("# units: km, body-fixed frame IAU_RYUGU\n")
        for v in verts:
            f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
        for p in plates:
            f.write(f"f {p[0]} {p[1]} {p[2]}\n")
    print(f"written: {obj_path} ({nv} vertices / {nplates} plates)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    dsk_to_obj(sys.argv[1], sys.argv[2])
