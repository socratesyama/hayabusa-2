"""Scientific regression tests for radial intersections on Ryugu meshes."""
import math
import json
import pathlib
import sys
import unittest

import numpy as np

CONVERSION = pathlib.Path(__file__).resolve().parents[1] / "conversion"
sys.path.insert(0, str(CONVERSION))
from shape_intersection import ray_triangle_distances  # noqa: E402

REPO = pathlib.Path(__file__).resolve().parents[2]


def cube_triangles(half_extent: float) -> np.ndarray:
    """Triangulated axis-aligned cube, centered at the origin."""
    s = half_extent
    vertices = np.array([
        [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
        [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s],
    ], dtype=float)
    quads = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
             (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return np.array([vertices[list(face)] for q in quads
                     for face in ((q[0], q[1], q[2]), (q[0], q[2], q[3]))])


def scalar_ray_hits(triangles: np.ndarray, origin: np.ndarray,
                    direction: np.ndarray) -> list[float]:
    """Independent scalar plane/barycentric implementation used as an oracle."""
    d = direction / np.linalg.norm(direction)
    hits = []
    for a, b, c in triangles:
        normal = np.cross(b - a, c - a)
        denominator = float(np.dot(normal, d))
        if abs(denominator) < 1e-14:
            continue
        t = float(np.dot(normal, a - origin) / denominator)
        if t <= 1e-9:
            continue
        point = origin + t * d
        v0, v1, v2 = b - a, c - a, point - a
        d00, d01, d11 = np.dot(v0, v0), np.dot(v0, v1), np.dot(v1, v1)
        d20, d21 = np.dot(v2, v0), np.dot(v2, v1)
        denom = d00 * d11 - d01 * d01
        if abs(denom) < 1e-20:
            continue
        beta = (d11 * d20 - d01 * d21) / denom
        gamma = (d00 * d21 - d01 * d20) / denom
        if beta >= -1e-9 and gamma >= -1e-9 and beta + gamma <= 1 + 1e-9:
            hits.append(t)
    return sorted(hits)


def load_obj_triangles(path: pathlib.Path) -> np.ndarray:
    vertices, faces = [], []
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            if line.startswith("v "):
                vertices.append([float(value) for value in line.split()[1:4]])
            elif line.startswith("f "):
                indices = [int(token.split("/")[0]) - 1
                           for token in line.split()[1:]]
                faces.extend((indices[0], indices[i], indices[i + 1])
                             for i in range(1, len(indices) - 1))
    return np.asarray(vertices, dtype=np.float64)[np.asarray(faces)] * 1000.0


class RayIntersectionTests(unittest.TestCase):
    def test_convex_cube_first_surface_hit(self):
        hits = ray_triangle_distances(cube_triangles(2), np.zeros(3), [1, 0, 0])
        self.assertGreaterEqual(len(hits), 1)
        self.assertAlmostEqual(float(hits[0]), 2.0, places=9)

    def test_multiple_surfaces_choose_nearest_positive_hit(self):
        # Nested closed surfaces create multiple positive intersections along +X.
        triangles = np.concatenate((cube_triangles(1), cube_triangles(3)))
        hits = ray_triangle_distances(triangles, np.zeros(3), [1, 0, 0])
        unique = np.unique(np.round(hits, 9))
        self.assertEqual(unique.tolist(), [1.0, 3.0])
        self.assertEqual(float(hits[0]), 1.0)
        self.assertGreater(float(hits[-1]), float(hits[0]))

    def test_td1_site_radius_against_independent_scalar_intersector(self):
        mesh_path = REPO / "01_shape_models/ryugu_shape_spc_49k_v20200323_web.obj"
        triangles = load_obj_triangles(mesh_path)
        lat, lon = math.radians(4.3), math.radians(206.47)
        direction = np.array([math.cos(lat) * math.cos(lon),
                              math.cos(lat) * math.sin(lon), math.sin(lat)])
        vectorized = ray_triangle_distances(triangles, np.zeros(3), direction)
        scalar = scalar_ray_hits(triangles, np.zeros(3), direction)
        self.assertTrue(len(vectorized), "TD1 ray must intersect the 49k mesh")
        self.assertTrue(len(scalar), "independent TD1 ray test must find intersections")
        self.assertAlmostEqual(float(vectorized[0]), scalar[0], places=6)
        # Independent scalar plane/barycentric solution for this repository's mesh.
        self.assertAlmostEqual(float(vectorized[0]), 509.5853692813, places=6)
        # Reproduce the old bug: using the unit direction as the ray origin shifts
        # the reported distance by exactly 1 m for a unit direction vector.
        legacy_origin = direction
        legacy = ray_triangle_distances(triangles, legacy_origin, direction)
        self.assertAlmostEqual(float(vectorized[0] - legacy[0]), 1.0, places=6)

    def test_invalid_direction_is_rejected(self):
        with self.assertRaises(ValueError):
            ray_triangle_distances(cube_triangles(1), np.zeros(3), [0, 0, 0])

    def test_td1_dataset_touchdown_anchor_and_provenance(self):
        dataset = json.loads((REPO / "12_site_data/td1_descent_positions.json")
                             .read_text(encoding="utf-8"))
        self.assertFalse(dataset["provenance"]["grade_is_accuracy"])
        self.assertIsNone(dataset["provenance"]["quantitative_uncertainty"])
        self.assertAlmostEqual(dataset["td1_site"]["surface_radius_m"], 509.59, places=2)
        self.assertEqual(dataset["td1_site"]["method"],
                         "outward ray from mesh origin; nearest positive triangle intersection")
        touchdown = next(row for row in dataset["table"]
                         if row["t"] == "2019-02-21T22:29:10Z")
        self.assertEqual(touchdown["grade"], "B")
        self.assertAlmostEqual(touchdown["alt_local"], 2.0, places=2)
        self.assertAlmostEqual(touchdown["r"] - dataset["td1_site"]["surface_radius_m"],
                               touchdown["alt_local"], places=2)
        for row in dataset["table"]:
            self.assertIn(row["grade"], "ABCD")
            self.assertIn("method", row)
            self.assertIsNone(row["uncertainty"])
            self.assertTrue(row["uncertainty_note"])
        times = [row["t"] for row in dataset["table"]]
        self.assertEqual(times, sorted(set(times)))
        for anchor in dataset["anchors"]:
            if dataset["hpk_gap"]["start"] <= anchor["t"] <= dataset["hpk_gap"]["end"]:
                self.assertIn(anchor["t"], times)


if __name__ == "__main__":
    unittest.main()
