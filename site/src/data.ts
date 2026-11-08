import { decodeGray16 } from './png16';
import type { V3 } from './geo';
const base = import.meta.env.BASE_URL || './';
export const url = (p: string) => base + p.replace(/^\//, '');
export async function getJSON<T = any>(p: string): Promise<T> { const r = await fetch(url(p)); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); }
export async function getBin(p: string) { const r = await fetch(url(p)); if (!r.ok) throw new Error(p + ' ' + r.status); return r.arrayBuffer(); }

// ---------- time / rotation / sun
export interface SunTable { epoch_et0: number; step_s: number; n: number; data: number[]; spk_range_utc: [string, string]; }
export interface Rotation { pole_ra_deg: number; pole_dec_deg: number; W0_deg: number; rate_deg_per_day: number; period_h: number; }

// ---------- gravity
export interface Gravity {
  rec: Float32Array; grid: Uint32Array; meta: { gm_effective_m3s2: number; escape_cm_s: { min: number; max: number }; period_h: number };
}
export const REC = 14; // lat lon ax ay az cx cy cz Gpot Rpot slope px py pz
export async function loadGravity(tag: '763' | '340'): Promise<Gravity> {
  const [rec, grid, meta] = await Promise.all([getBin(`data/gravity_${tag}.bin`), getBin(`data/gravity_grid_${tag}.bin`), getJSON(`data/gravity_${tag}.json`)]);
  return { rec: new Float32Array(rec), grid: new Uint32Array(grid), meta };
}

// ---------- spacecraft table (positions + per-row grade A/B/C/D; TD1 gap filled from td1_descent_positions.json)
export interface ScTable { et: Float64Array; pos: Float32Array; grade: Uint8Array; gaps: [number, number][]; gapThreshold: number; }
export type Grade = 0 | 1 | 2 | 3; // A B C D
export async function loadSc(): Promise<ScTable> {
  const b = await getBin('data/sc_table.bin'); const dv = new DataView(b); const hl = dv.getUint32(0, true);
  const hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(b, 4, hl))); const n = hdr.n; let o = 4 + hl;
  const et = new Float64Array(b.slice(o, o + n * 8)); o += n * 8; const pos = new Float32Array(b.slice(o, o + n * 12)); o += n * 12; const grade = new Uint8Array(b.slice(o, o + n));
  return { et, pos, grade, gaps: hdr.null_spans_et, gapThreshold: hdr.gap_threshold_s };
}
/** Body-fixed position (m) + grade, or null when there is NO data (never invented). Linear interpolation (T2);
 *  the grade of an interpolated point is the WORSE of its two neighbours. Outside the TD1 table the normal rows are used. */
export function scAtG(t: ScTable, et: number): { p: V3; grade: Grade } | null {
  const n = t.et.length; if (et < t.et[0] || et > t.et[n - 1]) return null;
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t.et[m] <= et) lo = m; else hi = m; }
  if (t.et[hi] - t.et[lo] > t.gapThreshold) return null;
  const f = (et - t.et[lo]) / (t.et[hi] - t.et[lo] || 1); const a = lo * 3, c = hi * 3;
  // exact hit on a node keeps that node's grade (e.g. touchdown instant stays B)
  const g = (f <= 1e-6 ? t.grade[lo] : f >= 1 - 1e-6 ? t.grade[hi] : Math.max(t.grade[lo], t.grade[hi])) as Grade;
  return { p: [0, 1, 2].map(i => t.pos[a + i] * (1 - f) + t.pos[c + i] * f) as V3, grade: g };
}
export const scAt = (t: ScTable, et: number): V3 | null => scAtG(t, et)?.p ?? null;
export const GRADE_LABEL: Record<number, string> = { 0: 'A:SPICE航法サンプル', 1: 'B:公表高度・座標から位置再構成', 2: 'C:公開点の補間・再構成', 3: 'D:遠隔アンカー間の推定' };
export const GRADE_LABEL_EN: Record<number, string> = { 0: 'A:SPICE navigation sample', 1: 'B:position reconstructed from published altitude/coordinates', 2: 'C:interpolated/reconstructed', 3: 'D:estimate between distant anchors' };

// ---------- heightmap (16 bit) : radius = rmin + v/65535 * (rmax-rmin)
export const RMIN = 379.789, RMAX = 527.332;
export class HeightMap {
  constructor(public w: number, public h: number, public d: Uint16Array) {}
  static async load() { const r = await decodeGray16(url('assets/generated/ryugu_heightmap_2048.png')); return new HeightMap(r.w, r.h, r.data); }
  /** radius (m) at lat/lon degrees, bilinear, periodic in lon */
  radius(latDeg: number, lonDeg: number): number {
    const u = (((lonDeg % 360) + 360) % 360) / 360 * this.w - 0.5, v = (90 - latDeg) / 180 * this.h - 0.5;
    const x0 = Math.floor(u), y0 = Math.max(0, Math.min(this.h - 2, Math.floor(v))), fx = u - x0, fy = Math.max(0, Math.min(1, v - y0));
    const g = (x: number, y: number) => this.d[y * this.w + (((x % this.w) + this.w) % this.w)];
    const t = (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
    return RMIN + (t / 65535) * (RMAX - RMIN);
  }
}

// ---------- credits (single source: source_registry.csv)
export interface Src { id: string; category: string; provider: string; license: string; credit: string; local_path: string; }
export function parseCsv(txt: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = '', q = false;
  for (let i = 0; i < txt.length; i++) { const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c; }
  if (f || row.length) { row.push(f); rows.push(row); } return rows;
}
export async function loadRegistry(): Promise<Src[]> {
  const rows = parseCsv(await (await fetch(url('data/source_registry.csv'))).text()); const hd = rows[0];
  const ix = (k: string) => hd.indexOf(k);
  return rows.slice(1).filter(r => r.length > 5).map(r => ({ id: r[ix('id')], category: r[ix('category')], provider: r[ix('provider')], license: r[ix('license')], credit: r[ix('credit_required')], local_path: r[ix('local_path')] }));
}
