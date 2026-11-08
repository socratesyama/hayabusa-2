// §4.1 — the ONLY place where body-fixed <-> three.js axes and north/south are defined.
// Body frame (IAU_RYUGU): +X to lon 0, +Y to lon 90E, +Z = IAU north (Ryugu is retrograde: IAU north != orbital north).
// three.js is Y-up right-handed: three = (bx, bz, -by). World frame == body-fixed frame (the sun direction rotates instead).
export const R_MEAN = 448.8;           // m, mean radius used for 'elevation'
export const DEG = Math.PI / 180;
export type V3 = [number, number, number];
export const v3 = {
  add: (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a: V3) => Math.hypot(a[0], a[1], a[2]),
  norm: (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
export function geoToBody(latDeg: number, lonDeg: number, r = 1): V3 {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  return [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)];
}
export function bodyToGeo(p: V3): { lat: number; lon: number; r: number } {
  const r = v3.len(p);
  return { lat: Math.asin(p[2] / (r || 1)) / DEG, lon: ((Math.atan2(p[1], p[0]) / DEG) % 360 + 360) % 360, r };
}
export const bodyToThree = (p: V3): V3 => [p[0], p[2], -p[1]];
export const threeToBody = (p: V3): V3 => [p[0], -p[2], p[1]];
/** great-circle distance between two lat/lon points on a sphere of radius R_MEAN (m) */
export function surfDist(la1: number, lo1: number, la2: number, lo2: number): number {
  const a = geoToBody(la1, lo1), b = geoToBody(la2, lo2);
  return 2 * R_MEAN * Math.asin(Math.min(1, v3.len(v3.sub(a, b)) / 2));
}
export function fmtLat(l: number) { return `${Math.abs(l).toFixed(1)}°${l >= 0 ? 'N' : 'S'}`; }
export function fmtLon(l: number) { const n = ((l % 360) + 360) % 360, rounded = Number(n.toFixed(1)); return `${(rounded >= 360 ? 0 : rounded).toFixed(1)}°E`; }
// deterministic hash for position-seeded generation (no Math.random in world generation)
export function hash2(a: number, b: number, s = 0): number {
  let h = (a * 374761393 + b * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
