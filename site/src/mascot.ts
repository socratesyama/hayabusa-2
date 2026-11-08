// §4.11.1 MASCOT view: a RECORD replay (no movement). Everything is time-synced to real data; nothing is invented.
import type { V3 } from './geo';
export interface MascamImg { id: string; phase: string; utc: string; led: string | null; led_nm: number | null; exposure_ms: number | null; png: string; }
export interface MascotData { pos: { t0_utc: string; rows: number[][]; sp1: { lat: number; lon_e: number; radius_m: number } }; imgs: MascamImg[]; mara: any; mag: any; }
export const T_SEP = Date.UTC(2018, 9, 3, 1, 57, 20);      // separation (UTC)
export const T_REST = Date.UTC(2018, 9, 3, 2, 14, 17);     // SP1 at rest
export const T_END = Date.UTC(2018, 9, 3, 19, 4, 0);       // battery exhausted
export const T_TRAJ_END = T_SEP + 1380e3;                 // SPK位置(1秒刻み)の終端（降下・バウンド後に静止）
export const SITE = { lat: -22.294, lon: 317.161 };        // final rest position (poi mascot_landing)
export class MascotReplay {
  active = false; t = T_SEP; playing = true; mult = 1; private imgTimes: number[];
  constructor(public d: MascotData) { this.imgTimes = d.imgs.map(i => Date.parse(i.utc)); }
  enter() { this.active = true; this.t = T_SEP; this.playing = true; this.mult = 1; }
  exit() { this.active = false; }
  scrub(dMs: number) { this.t = Math.max(T_SEP, Math.min(T_END, this.t + dMs)); }
  /** 最も近い撮影までの時間（秒） */
  private nearestImgDist(): number { let d = 1e9; for (const x of this.imgTimes) d = Math.min(d, Math.abs(x - this.t) / 1000); return d; }
  /** 自動再生の速さ（記録時間の秒/実時間の秒）。降下は×30、撮影のある時間帯はゆっくり、何も起きない時間帯は速く飛ばす（演出E） */
  autoSpeed(): number { if (this.t < T_TRAJ_END) return 30; return Math.max(10, Math.min(10000, this.nearestImgDist() * 2)); }   // 全体で約3分
  advance(dtReal: number) { if (!this.playing || this.finished) return; this.t = Math.min(T_END, this.t + dtReal * 1000 * this.autoSpeed() * this.mult); if (this.t >= T_END) this.playing = false; }
  /** 次/前の撮影時刻へ（なければ両端） */
  seekImage(dir: 1 | -1) { const c = this.imgTimes.filter(x => dir > 0 ? x > this.t + 1500 : x < this.t - 1500); this.t = c.length ? (dir > 0 ? Math.min(...c) : Math.max(...c)) : (dir > 0 ? T_END : T_SEP); }
  /** スクラブバー(0..1)⇔時刻: 前半30%は降下の23分、残りは静止後の16時間44分 */
  static fromBar(p: number) { return p < 0.3 ? T_SEP + p / 0.3 * (T_TRAJ_END - T_SEP) : T_TRAJ_END + (p - 0.3) / 0.7 * (T_END - T_TRAJ_END); }
  toBar() { return this.t < T_TRAJ_END ? (this.t - T_SEP) / (T_TRAJ_END - T_SEP) * 0.3 : 0.3 + (this.t - T_TRAJ_END) / (T_END - T_TRAJ_END) * 0.7; }
  get finished() { return this.t >= T_END; }
  phase(): 'descent' | 'bounce' | 'surface' | 'end' { return this.t < Date.UTC(2018, 9, 3, 2, 3) ? 'descent' : this.t < T_REST ? 'bounce' : this.t < T_END ? 'surface' : 'end'; }
  /** SPK position in topocentric frame (m), 1 s steps; null outside SPK coverage of the descent/bounce */
  posTopo(): V3 | null {
    const k = Math.round((this.t - T_SEP) / 1000); const r = this.d.pos.rows; if (k < 0 || k >= r.length) return null; const row = r[Math.min(k, r.length - 1)]; return [row[1], row[2], row[3]]; }
  /** the real image closest in time at or before t (the one MASCAM had just taken) */
  imageAt(): { img: MascamImg; ageS: number } | null {
    let best = -1; for (let i = 0; i < this.imgTimes.length; i++) if (this.imgTimes[i] <= this.t && (best < 0 || this.imgTimes[i] > this.imgTimes[best])) best = i;
    if (best < 0) return null; const age = (this.t - this.imgTimes[best]) / 1000; if (age > 40 * 60) return null; return { img: this.d.imgs[best], ageS: age };
  }
  /** MARA rock temperature (K) of BP8-12, null if missing (-999 -> null; never interpolated, §7.22) */
  tempK(): number | null {
    const rows = this.d.mara.rows as { utc: string; t: (number | null)[] }[]; let best: any = null, bd = 1e12;
    for (const r of rows) { const d = Math.abs(Date.parse(r.utc) - this.t); if (d < bd) { bd = d; best = r; } }
    return best && bd < 90e3 ? best.t[3] : null;
  }
  position(): string {
    const p = this.imageAt(); const ph = this.phase();
    if (ph === 'descent') return '降下中'; if (ph === 'bounce') return 'バウンド中'; if (ph === 'end') return '運用終了';
    return p ? `SP1付近 / ${p.img.phase}` : 'SP1（静止）';
  }
  /** impact times from the MAG detection (A; candidates, see mag.json note) */
  impacts(): number[] { return (this.d.mag.impact_candidates ?? []).map((c: any) => Date.parse(c.utc)); }
  isNight(): boolean { const im = this.imageAt(); return !!im && im.img.led != null; }
  /** MAG磁場強度（nT）: tに最も近い実測行の|B|。範囲外はnull（音響化・MASCOTサイト近傍用） */
  magNow(): number | null {
    const rows = this.d.mag.rows as number[][]; if (!rows?.length) return null;
    let best: number[] | null = null, bd = 1e12;
    for (const r of rows) { const d = Math.abs(this.t0() + r[0] * 1000 - this.t); if (d < bd) { bd = d; best = r; } }
    if (!best || bd > 120e3) return null;
    return Math.hypot(best[1], best[2], best[3]);
  }
  private t0() { return Date.parse(this.d.mag.t0_utc); }
}
