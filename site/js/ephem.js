// SPICE から事前計算した暦(軌道・自転)をブラウザ側で評価する。
// 探査機位置・地球・リュウグウ位置は黄道座標(J2000黄道)。小惑星の向きは PCK(ryugu_v10.tpc) の定数から毎フレーム計算する。
import { m3, v3 } from './math.js';

export const AU = 149597870.7;
export const C_KMS = 299792.458;
const D2R = Math.PI / 180;
const ET_MINUS_UTC = 69.184;
const POLE_RA = 96.43112 * D2R, POLE_DEC = -66.38741 * D2R, W0 = 274.16225, W1 = 1131.98280286;
const OBL = 23.4392911 * D2R;
const E_J2000_TO_ECL = m3.Rx(OBL); // 受動回転: y' = cos y + sin z

export const etOf = (unix) => unix - 946728000 + ET_MINUS_UTC;
export const unixOf = (et) => et + 946728000 - ET_MINUS_UTC;

export class Ephem {
  async load(base = 'data/') {
    const [meta, daily, pt, pxyz] = await Promise.all([
      fetch(base + 'ephem.json').then((r) => r.json()),
      fetch(base + 'ephem_daily.bin').then((r) => r.arrayBuffer()),
      fetch(base + 'ephem_prox_t.bin').then((r) => r.arrayBuffer()),
      fetch(base + 'ephem_prox_xyz.bin').then((r) => r.arrayBuffer()),
    ]);
    this.meta = meta;
    this.daily = new Float32Array(daily);                 // 日次 10列
    this.nDaily = meta.daily_n;
    this.t0 = meta.daily_t0;
    this.proxT = new Float64Array(pt);
    const raw = new Float32Array(pxyz);                    // J2000 慣性, km
    this.proxP = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i += 3) {              // 黄道座標・メートルへ
      const e = m3.apply(E_J2000_TO_ECL, [raw[i], raw[i + 1], raw[i + 2]]);
      this.proxP[i] = e[0] * 1000; this.proxP[i + 1] = e[1] * 1000; this.proxP[i + 2] = e[2] * 1000;
    }
    this.kernelStart = this.t0;
    return this;
  }

  // 小惑星固定座標 -> 黄道座標 (行優先3x3)
  bodyToEcl(unix) {
    const d = etOf(unix) / 86400;
    const W = ((W0 + W1 * d) % 360 + 360) % 360 * D2R;
    const Mi2b = m3.mul(m3.mul(m3.Rz(W), m3.Rx(Math.PI / 2 - POLE_DEC)), m3.Rz(POLE_RA + Math.PI / 2));
    // body -> J2000 = Mi2b^T ; J2000 -> ecl = E
    return { b2e: m3.mul(E_J2000_TO_ECL, m3.T(Mi2b)), W: W / D2R };
  }

  row(unix) {
    let x = (unix - this.t0) / 86400;
    x = Math.min(Math.max(x, 0), this.nDaily - 1.0001);
    const i = Math.floor(x), f = x - i, a = i * 10, b = a + 10, D = this.daily;
    const o = new Float64Array(10);
    for (let k = 0; k < 10; k++) {
      const va = D[a + k], vb = D[b + k];
      o[k] = Number.isNaN(va) || Number.isNaN(vb) ? NaN : va + (vb - va) * f;
    }
    return o;
  }
  state(unix) {
    const r = this.row(unix);
    const craft = Number.isNaN(r[0]) ? null : [r[0], r[1], r[2]];
    return { craft, earth: [r[3], r[4], r[5]], ryugu: [r[6], r[7], r[8]], craftEarthKm: r[9] };
  }
  sunDirEcl(unix) { const r = this.row(unix); return v3.norm([-r[6], -r[7], -r[8]]); }
  sunAU(unix) { const r = this.row(unix); return Math.hypot(r[6], r[7], r[8]); }

  // リュウグウ中心から見た探査機位置(黄道座標, m)。データの無い時刻は null
  prox(unix) {
    const T = this.proxT, n = T.length;
    if (unix < T[0] || unix > T[n - 1]) return null;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= unix) lo = m; else hi = m; }
    const gap = T[hi] - T[lo];
    if (gap > 1000) return null;
    const f = (unix - T[lo]) / gap, P = this.proxP;
    return [P[lo * 3] + (P[hi * 3] - P[lo * 3]) * f, P[lo * 3 + 1] + (P[hi * 3 + 1] - P[lo * 3 + 1]) * f, P[lo * 3 + 2] + (P[hi * 3 + 2] - P[lo * 3 + 2]) * f];
  }
  hasProx(unix) { return unix >= this.proxT[0] && unix <= this.proxT[this.proxT.length - 1]; }

  // 軌道線用: 期間内の日次位置列(AU)
  pathSlice(col, u0, u1, onlyValid = true) {
    const out = [];
    const i0 = Math.max(0, Math.floor((u0 - this.t0) / 86400)), i1 = Math.min(this.nDaily - 1, Math.ceil((u1 - this.t0) / 86400));
    for (let i = i0; i <= i1; i++) {
      const a = i * 10 + col;
      const x = this.daily[a], y = this.daily[a + 1], z = this.daily[a + 2];
      if (onlyValid && Number.isNaN(x)) continue;
      out.push(x, y, z);
    }
    return new Float32Array(out);
  }
  lastCraftIndex() {
    for (let i = this.nDaily - 1; i >= 0; i--) if (!Number.isNaN(this.daily[i * 10])) return i;
    return 0;
  }
  kernelEnd() { return this.t0 + this.lastCraftIndex() * 86400; }
}
