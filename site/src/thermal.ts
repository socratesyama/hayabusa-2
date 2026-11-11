// 表面温度モデル（temperature_curves.json, 1次元熱伝導・確からしさ D）の表引き。three.js / DOM に依存しない。
// 表は「緯度(行) × 地方時(列)」。地方時0=真夜中、列は 15 分刻みの96個。緯度は -90..90 を 10° 刻み（19行）。
export const THERM_ROWS = 19, THERM_COLS = 96;
export interface ThermalTable { w: number; h: number; data: Float32Array; decDeg: number; tiTiu: number; }

export function nearestIdx(arr: number[], v: number): number {
  let b = 0; for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i] - v) < Math.abs(arr[b] - v)) b = i; return b;
}
/** 太陽直下緯度に最も近い格子(-8/0/+8°)・熱慣性 ti（既定300）の、緯度×地方時の表を作る */
export function buildThermalTable(T: any, subsolarLatDeg: number, ti = 300): ThermalTable {
  const nLat = T.lat_deg.length, nTi = T.ti_tiu.length, nDec = T.subsolar_lat_deg.length;
  if (nLat !== THERM_ROWS || T.curves_K[0].length !== THERM_COLS) throw new Error('temperature_curves.json の形が想定と違います');
  const tiI = T.ti_tiu.indexOf(ti) >= 0 ? T.ti_tiu.indexOf(ti) : nearestIdx(T.ti_tiu, ti);
  const decI = nearestIdx(T.subsolar_lat_deg, subsolarLatDeg);
  const data = new Float32Array(THERM_ROWS * THERM_COLS);
  for (let j = 0; j < nLat; j++) { const c: number[] = T.curves_K[(j * nTi + tiI) * nDec + decI]; for (let i = 0; i < THERM_COLS; i++) data[j * THERM_COLS + i] = c[i]; }
  return { w: THERM_COLS, h: THERM_ROWS, data, decDeg: T.subsolar_lat_deg[decI], tiTiu: T.ti_tiu[tiI] };
}
/** 緯度(度)・地方時(0–24h)の温度(K)。緯度は双一次補間、地方時は周期的に補間（GPU 側と同じ規則） */
export function sampleThermal(t: ThermalTable, latDeg: number, hour: number): number {
  const fy = Math.max(0, Math.min(t.h - 1, (latDeg + 90) / 10));
  const x = ((((hour / 24) * t.w - 0.5) % t.w) + t.w) % t.w, x0 = Math.floor(x), fx = x - x0, x1 = (x0 + 1) % t.w;
  const y0 = Math.min(t.h - 2, Math.floor(fy)), ty = fy - y0;
  const g = (xx: number, yy: number) => t.data[yy * t.w + xx];
  return (g(x0, y0) * (1 - fx) + g(x1, y0) * fx) * (1 - ty) + (g(x0, y0 + 1) * (1 - fx) + g(x1, y0 + 1) * fx) * ty;
}
