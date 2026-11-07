// §4.4 physics layer. Integrated in the inertial frame (= body frame at launch), RK4 adaptive, dt<=1 s.
// Above the surface gravity is a POINT MASS (GM from gravity meta) -> class D, shown with '*'.
import { V3, v3, DEG } from './geo';
export interface Orbit { t0: number; r: V3; v: V3; t: number; omega: number; gm: number; bounced: number; landed: boolean; }
export const OMEGA_763 = 2 * Math.PI / (7.6326 * 3600);
const acc = (r: V3, gm: number): V3 => { const d = v3.len(r); return v3.mul(r, -gm / (d * d * d)); };
function rk4(r: V3, v: V3, h: number, gm: number): [V3, V3] {
  const a1 = acc(r, gm), r2 = v3.add(r, v3.mul(v, h / 2)), v2 = v3.add(v, v3.mul(a1, h / 2)), a2 = acc(r2, gm);
  const r3 = v3.add(r, v3.mul(v2, h / 2)), v3_ = v3.add(v, v3.mul(a2, h / 2)), a3 = acc(r3, gm);
  const r4 = v3.add(r, v3.mul(v3_, h)), v4 = v3.add(v, v3.mul(a3, h)), a4 = acc(r4, gm);
  const rn = v3.add(r, v3.mul(v3.add(v3.add(v, v3.mul(v2, 2)), v3.add(v3.mul(v3_, 2), v4)), h / 6));
  const vn = v3.add(v, v3.mul(v3.add(v3.add(a1, v3.mul(a2, 2)), v3.add(v3.mul(a3, 2), a4)), h / 6));
  return [rn, vn];
}
/** launch from body-fixed position (m) with body-fixed velocity (m/s). Adds omega x r (§7.14). */
export function launch(posB: V3, velB: V3, t: number, gm: number, omega = OMEGA_763): Orbit {
  const w: V3 = [0, 0, omega]; const vi = v3.add(velB, v3.cross(w, posB));
  return { t0: t, r: posB, v: vi, t, omega, gm, bounced: 0, landed: false };
}
export const energy = (o: Orbit) => 0.5 * v3.dot(o.v, o.v) - o.gm / v3.len(o.r);   // inertial, point mass
export const isEscape = (o: Orbit) => energy(o) >= 0;
/** advance to time tTarget (s); surfaceR(dirBody) returns local surface radius. Returns true on contact. */
export function advance(o: Orbit, tTarget: number, surfaceR: (b: V3) => number, thrustB: V3 = [0, 0, 0]): boolean {
  let guard = 0;
  while (o.t < tTarget && guard++ < 20000) {
    const rr = v3.len(o.r), sp = Math.max(1e-4, v3.len(o.v));
    const h = Math.min(1, tTarget - o.t, Math.max(0.05, 0.02 * rr / sp));
    const [rn, vn] = rk4(o.r, o.v, h, o.gm);
    o.r = rn; o.v = vn; o.t += h;
    const b = bodyOf(o); 
    if (v3.len(o.r) <= surfaceR(v3.norm(b))) { return contact(o, surfaceR); }
  }
  return false;
}
/** inertial -> body-fixed: rotate by -omega * (t - t0) about +Z */
export function bodyOf(o: Orbit): V3 { const a = -o.omega * (o.t - o.t0), c = Math.cos(a), s = Math.sin(a); return [c * o.r[0] - s * o.r[1], s * o.r[0] + c * o.r[1], o.r[2]]; }
export function velBodyOf(o: Orbit): V3 { // v_b = Rz(-wt)(v_i - w x r_i)
  const a = -o.omega * (o.t - o.t0), c = Math.cos(a), s = Math.sin(a); const w: V3 = [0, 0, o.omega]; const vr = v3.sub(o.v, v3.cross(w, o.r));
  return [c * vr[0] - s * vr[1], s * vr[0] + c * vr[1], vr[2]]; }
// §4.4 re-landing: damp the normal component, one small bounce, then stop.
function contact(o: Orbit, surfaceR: (b: V3) => number): boolean {
  const b = bodyOf(o), n = v3.norm(b); const vb = velBodyOf(o); const vn = v3.dot(vb, n);
  if (o.bounced >= 1 || Math.abs(vn) < 0.02) { o.landed = true; return true; }
  o.bounced++;
  const vt = v3.sub(vb, v3.mul(n, vn)); const nv = v3.add(v3.mul(vt, 0.3), v3.mul(n, -vn * 0.3));
  o.r = v3.mul(n, surfaceR(n) + 0.01); const w: V3 = [0, 0, o.omega]; o.v = v3.add(nv, v3.cross(w, o.r)); o.t0 = o.t; // restart inertial frame at contact
  return false;
}
export function altitude(o: Orbit, surfaceR: (b: V3) => number) { const b = bodyOf(o); return v3.len(b) - surfaceR(v3.norm(b)); }
export const rad = (d: number) => d * DEG;
