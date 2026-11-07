import type { Rotation, SunTable } from './data';
import { DEG, V3 } from './geo';
const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const LEAPS: [number, number][] = [[Date.UTC(2017, 0, 1), 37], [Date.UTC(2015, 6, 1), 36], [Date.UTC(2012, 6, 1), 35]];
export function utcToEt(ms: number): number {
  let dat = 35; for (const [t, d] of LEAPS) if (ms >= t) { dat = d; break; }
  const tt = (ms - J2000_UTC_MS) / 1000 + dat + 32.184; return tt + 0.001657 * Math.sin((357.53 + 0.9856003 * tt / 86400) * DEG);
}
export const T_MIN = Date.UTC(2014, 11, 3);
export const T_MAX_TABLE = Date.UTC(2027, 11, 31);
/** リュウグウ滞在期間（P1-1）: 到着 2018-06-27 〜 出発 2019-11-13。サイトの時間範囲はこれに限定する。 */
export const MISSION_T0 = Date.UTC(2018, 5, 27);
export const MISSION_T1 = Date.UTC(2019, 10, 13);
/** 起動時の既定時刻: 最後に訪れた時刻（localStorage）なければ到着日 */
export function initialMissionMs(): number {
  try { const v = +(localStorage.getItem('ryugu_t') ?? ''); if (v >= MISSION_T0 && v <= MISSION_T1) return v; } catch { /* ignore */ }
  return MISSION_T0;
}
export const fmtJST = (ms: number) => { const d = new Date(ms + 9 * 3600e3); const p = (n: number, l = 2) => String(n).padStart(l, '0'); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} JST`; };
export const jstDate = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
export const jstMs = (s: string) => Date.parse(s.replace(' ', 'T') + '+09:00');

export class Clock {
  ms = Date.now(); running = true; onJump?: (dt: number) => void;
  constructor(public tMax = Date.now()) {}
  tick(dtReal: number) { if (this.running) this.set(this.ms + dtReal * 1000); }
  set(ms: number) { this.ms = Math.max(T_MIN, Math.min(this.tMax, ms)); }
  jump(dms: number) { const o = this.ms; this.set(this.ms + dms); this.onJump?.(this.ms - o); }
}

export class Sun {
  private m: number[]; constructor(private tbl: SunTable, private rot: Rotation) { this.m = [0, 0, 0, 0, 0, 0, 0, 0, 0]; }
  /** J2000 -> body-fixed rotation matrix (row-major) = Rz(W) Rx(90-dec) Rz(90+ra) */
  matrix(et: number): number[] {
    const r = this.rot, W = (r.W0_deg + r.rate_deg_per_day * et / 86400) * DEG, a = (90 + r.pole_ra_deg) * DEG, d = (90 - r.pole_dec_deg) * DEG;
    const Rz = (t: number) => [Math.cos(t), Math.sin(t), 0, -Math.sin(t), Math.cos(t), 0, 0, 0, 1];
    const Rx = (t: number) => [1, 0, 0, 0, Math.cos(t), Math.sin(t), 0, -Math.sin(t), Math.cos(t)];
    const mul = (A: number[], B: number[]) => { const C = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j]; return C; };
    return mul(Rz(W), mul(Rx(d), Rz(a)));
  }
  private interp(et: number, off: number): { v: V3; d: number } {
    const t = this.tbl; const f = Math.max(0, Math.min(t.n - 1.001, (et - t.epoch_et0) / t.step_s)); const i = Math.floor(f), u = f - i; const c = 8;
    const g = (k: number, o: number) => t.data[(i + k) * c + off + o];
    const v: V3 = [0, 1, 2].map(o => g(0, o) * (1 - u) + g(1, o) * u) as V3; const l = Math.hypot(...v); return { v: [v[0] / l, v[1] / l, v[2] / l], d: g(0, 3) * (1 - u) + g(1, 3) * u };
  }
  /** unit vector body -> Sun, in the body-fixed frame, and distance in AU */
  sunBody(et: number): { dir: V3; au: number } { const { v, d } = this.interp(et, 0); return { dir: this.apply(this.matrix(et), v), au: d }; }
  earthBody(et: number): { dir: V3; au: number } { const { v, d } = this.interp(et, 4); return { dir: this.apply(this.matrix(et), v), au: d }; }
  private apply(M: number[], v: V3): V3 { return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]]; }
  /** Local solar time (hours, 0..24) at body longitude lonDeg */
  localTime(et: number, lonDeg: number, sunDir: V3): number {
    const sunLon = Math.atan2(sunDir[1], sunDir[0]) / DEG; return (((12 + (lonDeg - sunLon) / 15) % 24) + 24) % 24; }
}
