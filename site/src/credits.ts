// §4.8 — every displayed asset goes through credit(); there is no code path that shows an asset without a credit line.
// Credit strings come ONLY from source_registry.csv (never hard-coded). Only the kind->registry-id routing lives here.
import type { Src } from './data';
export type Certainty = 'A' | 'B' | 'C' | 'D' | 'E';
export const MARK: Record<Certainty, string> = { A: '', B: '', C: '†', D: '*', E: '' };
export type AssetKind = 'gallery' | 'onc' | 'mascam' | 'mara' | 'mag' | 'sample' | 'shape' | 'shape_sfm' | 'map' | 'spice' | 'spacecraft' | 'pointcloud' | 'poi' | 'timeline';
const ROUTE: Record<AssetKind, string> = { gallery: 'SRC005', onc: 'SRC004', mascam: 'SRC009', mara: 'SRC009', mag: 'SRC009', sample: 'SRC008', shape: 'SRC001', shape_sfm: 'SRC002',
  map: 'SRC007', spice: 'SRC006', spacecraft: 'SRC013', pointcloud: 'SRC012', poi: 'SRC017', timeline: 'SRC010' };
let reg = new Map<string, Src>();
export function setRegistry(r: Src[]) { reg = new Map(r.map(x => [x.id, x])); }
export function credit(kind: AssetKind): string {
  const s = reg.get(ROUTE[kind]); if (!s) return '出典: registry未登録（要確認）';
  return `${s.credit}（${s.license}）`;
}
/** certainty mark appended to a displayed value */
export const mark = (c: Certainty) => MARK[c];
