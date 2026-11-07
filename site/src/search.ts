// §4.7 — spatial search over (lat, lon, time). Linear scans; no server.
import { surfDist } from './geo';
export interface Poi { id: string; type: string; name_ja: string; name_en: string; lat: number | null; lon: number | null; [k: string]: any; }
export interface Hit { kind: 'poi' | 'gallery' | 'l2c' | 'sample' | 'event' | 'quiz'; id: string; dist: number; ref: any; }
export interface World {
  pois: Poi[]; events: any[]; gallery: { id: string; folder: string; lat: number | null; lon: number | null; date: string; event: string }[];
  l2c: { id: string; day: string; utc: string; jpg: string; has_geometry: boolean; lat?: number; lon?: number }[];
  samples: any; quizzes: any[];
}
export function nearby(w: World, lat: number, lon: number, ms: number): Hit[] {
  const out: Hit[] = [];
  for (const p of w.pois) if (p.lat != null && p.lon != null) { const d = surfDist(lat, lon, p.lat, p.lon); if (d <= 100) out.push({ kind: 'poi', id: p.id, dist: d, ref: p }); }
  for (const g of w.gallery) if (g.lat != null && g.lon != null) { const d = surfDist(lat, lon, g.lat, g.lon); if (d <= 500) out.push({ kind: 'gallery', id: g.id, dist: d, ref: g }); }
  for (const g of w.l2c) if (g.lat != null && g.lon != null) { const d = surfDist(lat, lon, g.lat, g.lon); if (d <= 500) out.push({ kind: 'l2c', id: g.id, dist: d, ref: g }); }
  return out.sort((a, b) => a.dist - b.dist);
}
export function samplesAt(w: World, lat: number, lon: number) {
  const r: any[] = []; for (const c of (w.samples?.chambers ?? [])) if (c.latitude_deg != null && surfDist(lat, lon, c.latitude_deg, c.longitude_deg) <= 100) r.push(c); return r;
}
export function quizzesFor(w: World, poiId: string) { return w.quizzes.filter(q => q.poi_id === poiId); }
