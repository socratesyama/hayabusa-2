"""SfM PLY -> site/data/pencil.bin. Normals are PCA estimates; luminance is derived from PLY vertex RGB."""
from pathlib import Path
import struct
import numpy as np
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "10_pointclouds/sfm_3m/ryugu_pointcloud_sfm3m_316k_color_web.ply"
MESH = ROOT / "01_shape_models/ryugu_shape_spc_200k_v20200323_web.obj"
OUT = ROOT / "site/data/pencil.bin"
SCALE, K = 60.0, 16
TYPES = {
    "char": "i1", "int8": "i1", "uchar": "u1", "uint8": "u1",
    "short": "<i2", "int16": "<i2", "ushort": "<u2", "uint16": "<u2",
    "int": "<i4", "int32": "<i4", "uint": "<u4", "uint32": "<u4",
    "float": "<f4", "float32": "<f4", "double": "<f8", "float64": "<f8",
}


def read_ply(path):
    raw = path.read_bytes()
    end = raw.find(b"end_header")
    if end < 0:
        raise ValueError("PLY has no end_header")
    nl = raw.find(b"\n", end)
    if nl < 0:
        raise ValueError("PLY header has no terminating newline")
    header_end = nl + 1
    lines = raw[:header_end].decode("ascii").splitlines()
    fmt = next((x.split() for x in lines if x.startswith("format ")), [])
    if len(fmt) < 3 or fmt[1] != "binary_little_endian":
        raise ValueError("Only binary_little_endian PLY 1.0 is supported")
    count, element, props = None, None, []
    for line in lines:
        p = line.split()
        if not p or p[0] in ("ply", "format", "comment", "obj_info", "end_header"):
            continue
        if p[0] == "element":
            element = p[1]
            if element == "vertex":
                if count is not None:
                    raise ValueError("Duplicate vertex elements")
                count = int(p[2])
            elif count is None:
                raise ValueError("Vertex must be the first PLY element")
        elif p[0] == "property" and element == "vertex":
            if len(p) != 3 or p[1] not in TYPES:
                raise ValueError(f"Unsupported vertex property: {line}")
            props.append((p[2], np.dtype(TYPES[p[1]])))
    if count is None or count < K:
        raise ValueError(f"Invalid PLY vertex count: {count}")
    names = [n for n, _ in props]
    if len(names) != len(set(names)):
        raise ValueError("Duplicate vertex property names")

    def channel(*names_to_try):
        for name in names_to_try:
            if name in names:
                return name
        raise ValueError(f"Missing RGB channel {names_to_try}; got {names}")

    rgb_names = (channel("r", "red"), channel("g", "green"), channel("b", "blue"))
    if not all(x in names for x in ("x", "y", "z")):
        raise ValueError("PLY must contain x, y, z properties")
    dt = np.dtype(props, align=False)
    size = count * dt.itemsize
    payload = raw[header_end:header_end + size]
    if len(payload) != size:
        raise ValueError(f"Truncated vertex block: expected {size}, got {len(payload)}")
    a = np.frombuffer(payload, dtype=dt, count=count)
    points = np.column_stack([a[x] for x in ("x", "y", "z")]).astype(np.float64)
    raw_rgb = np.column_stack([a[x] for x in rgb_names])
    if not np.isfinite(points).all() or not np.isfinite(raw_rgb.astype(np.float64)).all():
        raise ValueError("PLY contains non-finite coordinates or colors")
    rgb = raw_rgb.astype(np.float64)
    if raw_rgb.dtype.kind in "ui" and np.iinfo(raw_rgb.dtype).max > 255:
        rgb *= 255.0 / np.iinfo(raw_rgb.dtype).max
    elif raw_rgb.dtype.kind == "f" and rgb.min() >= 0 and rgb.max() <= 1:
        rgb *= 255.0
    return points, np.clip(np.rint(rgb), 0, 255).astype(np.uint8), count, rgb_names


def read_obj_vertices(path):
    v = []
    with path.open(encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.startswith("v "):
                q = line.split()
                if len(q) >= 4:
                    v.append([float(x) for x in q[1:4]])
    if not v:
        raise ValueError("No vertices in reference SPC OBJ")
    v = np.asarray(v, dtype=np.float64)
    if not np.isfinite(v).all():
        raise ValueError("SPC OBJ contains non-finite vertices")
    if np.abs(v).max() < 5:
        v *= 1000.0
    return v


def main():
    if not SRC.is_file() or not MESH.is_file():
        raise FileNotFoundError(f"Required source missing: {SRC} or {MESH}")
    P, rgb, n, rgb_names = read_ply(SRC)
    print("PLY points:", n, "RGB:", rgb_names)
    print("Bounds (m):", P.min(0).round(2), P.max(0).round(2))
    print("Centroid (m):", P.mean(0).round(3))

    # Nearest mesh VERTEX distance is only a coarse diagnostic, not surface distance.
    M = read_obj_vertices(MESH)
    sample = P[::max(1, len(P) // 20000)]
    d, _ = cKDTree(M).query(sample)
    print("Nearest SPC-vertex distance (coarse; m): median %.2f / p90 %.2f / max %.2f"
          % (np.median(d), np.percentile(d, 90), d.max()))

    tree = cKDTree(P)
    _, ids = tree.query(P, k=K)
    Q = P[ids].astype(np.float32)
    Q -= Q.mean(axis=1, keepdims=True)
    cov = np.einsum("nki,nkj->nij", Q, Q, optimize=True)
    _, vec = np.linalg.eigh(cov)
    N = vec[:, :, 0].astype(np.float64)
    flip = np.einsum("ni,ni->n", N, P - P.mean(0)) < 0
    N[flip] *= -1
    if not np.isfinite(N).all():
        raise ValueError("PCA normal calculation produced non-finite values")

    scaled = P * SCALE
    if SCALE <= 0 or np.abs(scaled).max() > np.iinfo(np.int16).max:
        raise OverflowError("Coordinates exceed int16 range at the configured scale")
    lum = (rgb.astype(np.float32) @ np.array([.299, .587, .114], np.float32))
    lum = np.clip(np.rint(lum), 0, 255).astype(np.uint8)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("wb") as f:
        f.write(struct.pack("<4I", n, int(SCALE), 0, 0))
        f.write(np.rint(scaled).astype("<i2").tobytes())
        f.write(np.clip(np.rint(N * 127), -127, 127).astype("i1").tobytes())
        f.write(lum.tobytes())
    expected = 16 + n * 10
    if OUT.stat().st_size != expected:
        raise IOError(f"pencil.bin size mismatch: expected {expected}, got {OUT.stat().st_size}")
    print(f"Wrote {OUT} ({OUT.stat().st_size:,} bytes); luminance source = PLY vertex RGB")


if __name__ == "__main__":
    main()
