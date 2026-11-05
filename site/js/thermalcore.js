// 昼夜の温度変化を解く一次元熱伝導モデル(後退オイラー法・表面は放射平衡)。
// パラメータ: 熱慣性 Γ・太陽の高さを決める (a, b)・時角 h。結果は表面温度の LUT。
export const NG = 20, NA = 7, NB = 12, NH = 48;
export const G_MIN = 20, G_MAX = 450, A_MAX = 0.26;
const SIG = 5.670374e-8, EMIS = 0.9, ALBEDO = 0.015, RHOC = 1.0e6;
const S0 = 1361 / (1.1896 * 1.1896);     // リュウグウ軌道の平均距離での太陽定数
const PERIOD = 360 / 1131.98280286 * 86400;
const NZ = 26, NSTEP = 96;

export function gammaAt(i) { return Math.exp(Math.log(G_MIN) + (Math.log(G_MAX) - Math.log(G_MIN)) * i / (NG - 1)); }
export const aAt = (i) => -A_MAX + 2 * A_MAX * i / (NA - 1);
export const bAt = (i) => i / (NB - 1);

export function solveCycle(gamma, a, b, out, off) {
  const k = gamma * gamma / RHOC, kappa = k / RHOC;
  const delta = Math.sqrt(kappa * PERIOD / Math.PI);
  const z = new Float64Array(NZ); for (let i = 1; i < NZ; i++) z[i] = delta * 0.05 * Math.pow(1.28, i - 1);
  const dz = new Float64Array(NZ - 1); for (let i = 0; i < NZ - 1; i++) dz[i] = z[i + 1] - z[i];
  const dt = PERIOD / NSTEP;
  const Q = new Float64Array(NSTEP);
  let mean = 0;
  for (let s = 0; s < NSTEP; s++) { const c = a + b * Math.cos(2 * Math.PI * s / NSTEP); Q[s] = S0 * (1 - ALBEDO) * Math.max(c, 0); mean += Q[s]; }
  mean /= NSTEP;
  const T = new Float64Array(NZ).fill(Math.pow(Math.max(mean, 1) / (EMIS * SIG), 0.25));
  const A = new Float64Array(NZ), B = new Float64Array(NZ), Cc = new Float64Array(NZ), R = new Float64Array(NZ), cp = new Float64Array(NZ), dp = new Float64Array(NZ);
  const Cap = new Float64Array(NZ); Cap[0] = RHOC * dz[0] / 2; for (let i = 1; i < NZ - 1; i++) Cap[i] = RHOC * (dz[i - 1] + dz[i]) / 2; Cap[NZ - 1] = RHOC * dz[NZ - 2] / 2;
  let prev = 0;
  for (let cyc = 0; cyc < 16; cyc++) {
    let tsum = 0;
    for (let s = 0; s < NSTEP; s++) {
      const To = T[0];
      const rad3 = 4 * EMIS * SIG * To * To * To, rad4 = 3 * EMIS * SIG * To * To * To * To;
      // 三重対角
      B[0] = Cap[0] / dt + rad3 + k / dz[0]; Cc[0] = -k / dz[0]; R[0] = Cap[0] / dt * T[0] + Q[s] + rad4;
      for (let i = 1; i < NZ - 1; i++) { A[i] = -k / dz[i - 1]; Cc[i] = -k / dz[i]; B[i] = Cap[i] / dt + k / dz[i - 1] + k / dz[i]; R[i] = Cap[i] / dt * T[i]; }
      A[NZ - 1] = -k / dz[NZ - 2]; B[NZ - 1] = Cap[NZ - 1] / dt + k / dz[NZ - 2]; R[NZ - 1] = Cap[NZ - 1] / dt * T[NZ - 1];
      cp[0] = Cc[0] / B[0]; dp[0] = R[0] / B[0];
      for (let i = 1; i < NZ; i++) { const m = B[i] - A[i] * cp[i - 1]; cp[i] = Cc[i] / m; dp[i] = (R[i] - A[i] * dp[i - 1]) / m; }
      T[NZ - 1] = dp[NZ - 1]; for (let i = NZ - 2; i >= 0; i--) T[i] = dp[i] - cp[i] * T[i + 1];
      if (cyc >= 1 && s % (NSTEP / NH) === 0) { /* 出力は収束後の周期で */ }
      tsum += T[0];
      if (s % (NSTEP / NH) === 0) out[off + s / (NSTEP / NH)] = T[0];
    }
    const m = tsum / NSTEP;
    if (cyc >= 3 && Math.abs(m - prev) < 0.02) break;
    prev = m;
  }
}

export function buildLUT(onProgress) {
  const lut = new Float32Array(NG * NA * NB * NH);
  let n = 0; const tot = NG * NA * NB;
  for (let g = 0; g < NG; g++) for (let a = 0; a < NA; a++) for (let b = 0; b < NB; b++) {
    solveCycle(gammaAt(g), aAt(a), bAt(b), lut, (((g * NA + a) * NB + b) * NH));
    n++;
  }
  return lut;
}

// CPU側の LUT 参照(クリック地点の温度曲線用・GPUと同じ補間)
export function sampleLUT(lut, gamma, a, b, h) {
  const gf = Math.min(Math.max((Math.log(gamma) - Math.log(G_MIN)) / (Math.log(G_MAX) - Math.log(G_MIN)) * (NG - 1), 0), NG - 1.0001);
  const af = Math.min(Math.max((a + A_MAX) / (2 * A_MAX) * (NA - 1), 0), NA - 1.0001);
  const bf = Math.min(Math.max(b * (NB - 1), 0), NB - 1.0001);
  let hf = ((h % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * NH;
  const g0 = Math.floor(gf), a0 = Math.floor(af), b0 = Math.floor(bf), h0 = Math.floor(hf) % NH, h1 = (h0 + 1) % NH;
  const fg = gf - g0, fa = af - a0, fb = bf - b0, fh = hf - Math.floor(hf);
  let s = 0;
  for (let dg = 0; dg < 2; dg++) for (let da = 0; da < 2; da++) for (let db = 0; db < 2; db++) {
    const w = (dg ? fg : 1 - fg) * (da ? fa : 1 - fa) * (db ? fb : 1 - fb);
    const base = (((g0 + dg) * NA + (a0 + da)) * NB + (b0 + db)) * NH;
    s += w * (lut[base + h0] * (1 - fh) + lut[base + h1] * fh);
  }
  return s;
}
