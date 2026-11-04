#!/usr/bin/env python3
"""
SPICEカーネルを使って、はやぶさ2のリュウグウ周回期の位置を計算するサンプル。
ウェブサイトの「軌道アニメーション」や「観測条件の再現」の基礎となる処理。

必要環境: pip install spiceypy numpy
"""
import os
import numpy as np
import spiceypy as sp

HERE = os.path.dirname(os.path.abspath(__file__))
SPICE_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "03_spice"))

KERNELS = [
    "lsk/naif0012.tls",                                  # 時刻系
    "pck/ryugu_v10.tpc",                                  # リュウグウ自転
    "fk/hyb2_ryugu_v01.tf",                               # リュウグウ固定座標系
    "fk/hyb2_hp_v01.tf",                                  # HP(ホームポジション)座標系
    "spk/hyb2_hpk_20180627_20191119_v01.bsp",              # 探査機位置(リュウグウ滞在期)
    "spk/hyb2_20141203-20180628_0001h_final_ver1.bsp",     # 巡航期
    "spk/hyb2_20191107-20201202_0001h_final_ver1.bsp",    # 帰還期
    "spk/2162173_ryugu_v02.bsp",                          # リュウグウ星暦
    "spk/hyb2_de430_de440.bsp",                           # 惑星星暦
]


def load_kernels():
    for k in KERNELS:
        path = os.path.join(SPICE_DIR, k)
        if os.path.exists(path):
            sp.furnsh(path)
        else:
            print(f"[warn] not found: {path}")


def spacecraft_position(et):
    """リュウグウ中心・リュウグウ固定座標系(RYUGU_FIXED)での探査機位置 [km]"""
    state, _ = sp.spkezr("HAYABUSA2", et, "RYUGU_FIXED", "NONE", "RYUGU")
    return np.array(state[:3])


def sub_observer(pos):
    """位置ベクトルから距離・直下点(経度・緯度)を計算"""
    x, y, z = pos
    r = float(np.sqrt(x * x + y * y + z * z))
    lon = float(np.degrees(np.arctan2(y, x)) % 360)
    lat = float(np.degrees(np.arcsin(z / r)))
    return r, lon, lat


if __name__ == "__main__":
    load_kernels()

    # 例1: 通常観測時(ホームポジション付近)
    et = sp.str2et("2018-09-01 00:00:00")
    pos = spacecraft_position(et)
    r, lon, lat = sub_observer(pos)
    print(f"2018-09-01: 距離 {r:.2f} km, 直下点 経度 {lon:.1f}°, 緯度 {lat:.1f}°")

    # 例2: 第1回タッチダウン(TD1)当日
    et = sp.str2et("2019-02-22 06:00:00")
    pos = spacecraft_position(et)
    r, lon, lat = sub_observer(pos)
    print(f"2019-02-22 06:00 UTC: 距離 {r:.2f} km, 直下点 経度 {lon:.1f}°, 緯度 {lat:.1f}°")

    print("\n※ 表面高度を求める場合は DSK(sp.dskxsi) を併用すること。")
    print("※ 詳細な姿勢が必要な場合は CKカーネル(DARTSで公開)を追加ロード。")
