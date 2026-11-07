// §4.6 stage 2 — near-field regolith relief (E演出). Deterministic fBm value noise shared by
// the displacement patch (geometry + collision) and the rock/pebble placement, so the ground
// you see is the ground you walk on. Same character as the fragment-shader grain (0.6 m scale).
import { V3 } from './geo';

// GLSL-mirrored hash (h31) + value noise + 3-octave fBm (lacunarity 2.13, offsets 19.1/7.7/3.3)
function h31(x: number, y: number, z: number): number {
  let px = ((x * 1031) % 1 + 1) % 1, py = ((y * 1030) % 1 + 1) % 1, pz = ((z * 1029) % 1 + 1) % 1;
  const d = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += d; py += d; pz += d;
  return (((px + py) * pz) % 1 + 1) % 1;
}
function vnoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const c = (a: number, b: number, cc: number) => h31(ix + a, iy + b, iz + cc);
  const l = (a: number, b: number, t: number) => a * (1 - t) + b * t;
  return l(l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy),
           l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
export function fbm3(x: number, y: number, z: number): number {
  let s = 0, a = 0.5, px = x, py = y, pz = z;
  for (let i = 0; i < 3; i++) { s += a * vnoise(px, py, pz); const nx = px * 2.13 + 19.1, ny = py * 2.13 + 7.7, nz = pz * 2.13 + 3.3; px = nx; py = ny; pz = nz; a *= 0.5; }
  return s;
}
/** regolith relief offset (m) above the heightmap radius at body direction dir (unit).
 *  Base lift 0.32 m keeps the patch above the 49k display mesh (measured deviation: p95 +0.25 m,
 *  p99 +0.50 m, max +1.36 m vs the 200k-derived heightmap) so the relief is never buried; the
 *  fBm part is the §4.6 stage-2 30-50 cm relief. Deterministic. */
export function regolithOffset(dir: V3, rBase: number): number {
  const q = rBase * 0.37;   // sample at absolute position (m) — base wavelength ~2.7 m + octaves to ~0.6 m
  return 0.32 + 0.40 * fbm3(dir[0] * q, dir[1] * q, dir[2] * q);
}
