import { Gravity, REC } from './data';
import { V3, bodyToGeo } from './geo';
export interface GSample { g: V3; gmag: number; esc: number; slope: number; plate: number; }
/** plate lookup O(1) via 0.5° grid; effective gravity = attract + centrifugal (CRefAcc) (§2.1) */
export function sampleGravity(G: Gravity, latDeg: number, lonDeg: number): GSample {
  const j = Math.max(0, Math.min(359, Math.floor((90 - latDeg) / 0.5))), i = Math.floor((((lonDeg % 360) + 360) % 360) / 0.5) % 720;
  const p = G.grid[j * 720 + i], o = p * REC, r = G.rec;
  const g: V3 = [r[o + 2] + r[o + 5], r[o + 3] + r[o + 6], r[o + 4] + r[o + 7]];
  return { g, gmag: Math.hypot(...g), esc: Math.sqrt(2 * (r[o + 8] + r[o + 9])), slope: r[o + 10], plate: p };
}
export const gAtBody = (G: Gravity, p: V3) => { const q = bodyToGeo(p); return sampleGravity(G, q.lat, q.lon); };
