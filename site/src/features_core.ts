// 地名・イベント注釈の純粋な計算（three.js / DOM に依存しない。node で単体テストできる）。
// データは 12_site_data/features.json（tools/precompute/build_features.py が点群で検証して生成）。
// 座標系は geo.ts と同じ: 本体固定座標（IAU_RYUGU）、経度は東経0–360°、緯度は北が+。
import { V3, v3, geoToBody, R_MEAN, DEG } from './geo';

export type FeatureKind = 'crater' | 'dorsum' | 'fossa' | 'saxum' | 'touchdown' | 'impact' | 'lander' | 'marker' | 'rover' | 'candidate';
export interface FeatureEvent { utc: string; precision: 'second' | 'minute' | 'date'; title: string; text: string; }
export interface FeatureSource { label: string; url?: string; }
export interface Feature {
  id: string; kind: FeatureKind; name_ja: string; name_en: string; short_ja: string; nickname?: string;
  lat: number | null; lon: number | null; placed: boolean;
  radius_m: number; shape: 'cap' | 'band'; band_half_lat_deg?: number; extent_note: string;
  priority: 1 | 2 | 3; origin_ja?: string; summary_ja: string;
  events: FeatureEvent[]; event_ids: string[];
  coord_note?: string; evidence_ja: string; evidence: Record<string, number | null>;
  iau?: { approved: string; diameter_km: number; type: string };
  sources: FeatureSource[];
}
export interface FeatureFile {
  schema: number; frame: string; naming_rule_ja: string; kind_labels: Record<string, string>;
  frame_check: { median_diff_m: number; std_diff_m: number; p95_abs_diff_m: number; n_points: number };
  ridge: { half_width_lat_deg: number };
  features: Feature[];
}
/** 実行時に使う形: 方向ベクトル・角半径・イベント時刻(ms)を前計算したもの */
export interface PFeature extends Feature {
  dir: V3;            // 中心方向（単位ベクトル, 本体固定系）。帯(band)では使わない
  angR: number;       // 角半径(rad)。帯では緯度の半幅(rad)
  eventMs: number[];  // events[i].utc の ms
}

/** 種類ごとの見た目。色だけに頼らないよう、記号(glyph)と日本語ラベルを必ず併記する。 */
export const KIND_STYLE: Record<FeatureKind, { label: string; glyph: string; css: string; rgb: [number, number, number] }> = {
  crater:    { label: 'クレーター',       glyph: '○', css: '#60A5FA', rgb: [0.38, 0.65, 0.98] },
  dorsum:    { label: '尾根',             glyph: '═', css: '#A78BFA', rgb: [0.65, 0.55, 0.98] },
  fossa:     { label: '溝',               glyph: '≡', css: '#C084FC', rgb: [0.75, 0.52, 0.99] },
  saxum:     { label: '岩塊',             glyph: '◆', css: '#34D399', rgb: [0.20, 0.83, 0.60] },
  touchdown: { label: 'タッチダウン',     glyph: '★', css: '#E8A33D', rgb: [0.91, 0.64, 0.24] },
  impact:    { label: '人工クレーター',   glyph: '◎', css: '#FB923C', rgb: [0.98, 0.57, 0.24] },
  lander:    { label: '着陸機',           glyph: '▲', css: '#F472B6', rgb: [0.96, 0.45, 0.71] },
  marker:    { label: 'ターゲットマーカ', glyph: '✚', css: '#2DD4BF', rgb: [0.18, 0.83, 0.75] },
  rover:     { label: 'ローバ',           glyph: '▲', css: '#F472B6', rgb: [0.96, 0.45, 0.71] },
  candidate: { label: '候補地点',         glyph: '◇', css: '#94A3B8', rgb: [0.58, 0.64, 0.72] },
};

export function prepare(f: Feature): PFeature {
  const placed = f.placed && f.lat != null && f.lon != null;
  const dir: V3 = placed && f.shape === 'cap' ? geoToBody(f.lat!, f.lon!, 1) : [0, 0, 1];
  const angR = f.shape === 'band' ? (f.band_half_lat_deg ?? 0) * DEG : f.radius_m / R_MEAN;
  return { ...f, dir, angR, eventMs: f.events.map(e => Date.parse(e.utc)) };
}

/** dir（単位ベクトル）が地物の範囲内か。slopM はタップしやすさのための余裕(m)。 */
export function inRegion(p: PFeature, dir: V3, slopM = 0): boolean {
  if (!p.placed) return false;
  if (p.shape === 'band') return Math.abs(Math.asin(Math.max(-1, Math.min(1, dir[2])))) <= p.angR + slopM / R_MEAN;
  return v3.dot(dir, p.dir) >= Math.cos(Math.min(Math.PI, p.angR + slopM / R_MEAN));
}
/** dir を含む地物を、小さいもの（点→クレーター→帯）の順で返す */
export function regionsAt(list: PFeature[], dir: V3, slopM = 0): PFeature[] {
  return list.filter(p => inRegion(p, dir, slopM)).sort((a, b) => a.angR - b.angR);
}

/** ラベルを付ける候補の点（単位ベクトル）。リュウグウは小さく、歩く目の高さ(1.5m)での地平線は約37m先。
 *  窪地の中心は縁に隠れやすいので、中心・内側の4点・縁の8点を候補にして、見えている部分に注釈する。帯は赤道上の36点。 */
export function candidatePoints(p: PFeature): V3[] {
  if (p.shape === 'band') { const out: V3[] = []; for (let k = 0; k < 36; k++) out.push(geoToBody(0, k * 10, 1)); return out; }
  const c = p.dir; const east = v3.norm(v3.cross([0, 0, 1], c)); const north = v3.cross(c, east);
  const at = (a: number, th: number): V3 => v3.norm(v3.add(c, v3.add(v3.mul(east, a * Math.cos(th)), v3.mul(north, a * Math.sin(th)))));
  const pts: V3[] = [c];
  if (p.angR * R_MEAN >= 12) {
    for (let k = 0; k < 4; k++) pts.push(at(p.angR * 0.5, k * Math.PI / 2));
    for (let k = 0; k < 8; k++) pts.push(at(p.angR, k * Math.PI / 4));
  }
  return pts;
}
/** 見えないときの案内に使う点: 円形の地物は中心、帯は観測者の経度の赤道上の点。観測者が帯の中なら null（案内不要）。 */
export function guidePoint(p: PFeature, eyeDir: V3): V3 | null {
  if (p.shape !== 'band') return p.dir;
  if (inRegion(p, eyeDir, 0)) return null;
  return geoToBody(0, ((Math.atan2(eyeDir[1], eyeDir[0]) / DEG) % 360 + 360) % 360, 1);
}
/** 観測者の足元から地物までの地表距離(m)。帯は帯の縁まで。 */
export function distanceTo(p: PFeature, eyeDir: V3): number {
  if (p.shape === 'band') return Math.max(0, (Math.abs(Math.asin(Math.max(-1, Math.min(1, eyeDir[2])))) - p.angR) * R_MEAN);
  return Math.acos(Math.max(-1, Math.min(1, v3.dot(eyeDir, p.dir)))) * R_MEAN;
}

/** 視線が地形に遮られていないか。eye/target は本体固定系の位置(m)、radiusAt は単位方向 → 地面の半径(m)。 */
export function lineOfSight(eye: V3, target: V3, radiusAt: (dir: V3) => number): boolean {
  const d = v3.len(v3.sub(target, eye));
  const steps = Math.max(6, Math.min(48, Math.ceil(d / 20)));
  const margin = 2.0 + 0.003 * d;   // 高さ地図の誤差(約2.6m RMS)を見込む
  for (let i = 1; i < steps; i++) {
    const t = i / steps; const q = v3.add(eye, v3.mul(v3.sub(target, eye), t)); const r = v3.len(q);
    if (r < radiusAt(v3.mul(q, 1 / r)) - margin) return false;
  }
  return true;
}

export type EventState = 'none' | 'before' | 'after';
/** その地物の最初の出来事が、いまの時刻（シミュレーション時計）より前か後か */
export function eventState(p: PFeature, nowMs: number): EventState {
  if (!p.eventMs.length) return 'none';
  return nowMs >= Math.min(...p.eventMs) ? 'after' : 'before';
}
export const STAY_END_MS = Date.UTC(2019, 10, 13);   // リュウグウ出発（時計の終端）
export function eventChip(ms: number, nowMs: number): { text: string; cls: 'past' | 'future' | 'later' } {
  if (ms > STAY_END_MS) return { text: '滞在期間のあと', cls: 'later' };
  return ms <= nowMs ? { text: '発生済み', cls: 'past' } : { text: 'まだ先（時計はこの前）', cls: 'future' };
}

/** シェーダに渡す強さ。出来事の前の「人工クレーター」はまだ存在しないので弱く、他は地図上の場所として常に見せる。 */
export function shaderAlpha(p: PFeature, nowMs: number, focused: boolean): number {
  if (focused) return 1;
  const st = eventState(p, nowMs);
  if (p.kind === 'impact' && st === 'before') return 0.3;
  return st === 'before' ? 0.7 : 0.9;
}

export function fmtDist(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)}km`;
  if (m >= 100) return `${Math.round(m / 10) * 10}m`;
  return `${Math.round(m)}m`;
}
export function fmtExtent(p: Feature): string {
  if (p.shape === 'band') return `赤道を挟む緯度±${(p.band_half_lat_deg ?? 0).toFixed(1)}°の帯`;
  const d = p.radius_m * 2; return d >= 1000 ? `直径 約${(d / 1000).toFixed(1)}km` : d >= 100 ? `直径 約${Math.round(d)}m` : `直径 約${d % 1 ? d.toFixed(1) : d.toFixed(0)}m`;
}
