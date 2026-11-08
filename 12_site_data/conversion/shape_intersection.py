"""Ray/triangle intersection primitives for shape-model validation.

Distances use the same units as the input mesh. The ray direction is normalized
so the returned parameter is a physical distance from the ray origin.
"""
from __future__ import annotations

import numpy as np


def ray_triangle_distances(triangles: np.ndarray, origin: np.ndarray,
                           direction: np.ndarray, epsilon: float = 1e-12) -> np.ndarray:
    """Return sorted positive ray intersections with a triangle soup.

    This is a vectorized two-sided Moller-Trumbore test. For a ray starting
    inside a closed/star-shaped body, the first exit is the smallest strictly
    positive t. A non-convex mesh may yield several positive intersections;
    callers must choose the one matching their physical question.
    """
    tri = np.asarray(triangles, dtype=np.float64)
    o = np.asarray(origin, dtype=np.float64)
    d = np.asarray(direction, dtype=np.float64)
    if tri.ndim != 3 or tri.shape[1:] != (3, 3):
        raise ValueError("triangles must have shape (n, 3, 3)")
    if o.shape != (3,) or d.shape != (3,):
        raise ValueError("origin and direction must be 3-vectors")
    norm = np.linalg.norm(d)
    if not np.isfinite(norm) or norm == 0:
        raise ValueError("direction must be finite and non-zero")
    if not np.all(np.isfinite(tri)) or not np.all(np.isfinite(o)):
        raise ValueError("mesh and origin must be finite")
    d = d / norm
    v0, v1, v2 = tri[:, 0], tri[:, 1], tri[:, 2]
    e1, e2 = v1 - v0, v2 - v0
    p = np.cross(np.broadcast_to(d, e2.shape), e2)
    det = np.einsum("ij,ij->i", e1, p)
    non_parallel = np.abs(det) > epsilon
    inv_det = np.zeros_like(det)
    inv_det[non_parallel] = 1.0 / det[non_parallel]
    offset = o - v0
    u = np.einsum("ij,ij->i", offset, p) * inv_det
    q = np.cross(offset, e1)
    v = np.einsum("j,ij->i", d, q) * inv_det
    t = np.einsum("ij,ij->i", e2, q) * inv_det
    hit = (non_parallel & (u >= -epsilon) & (v >= -epsilon) &
           (u + v <= 1.0 + epsilon) & (t > epsilon))
    return np.sort(t[hit])
