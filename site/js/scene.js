import { makeProgram, loadTexture, buffer } from './gl.js';
import * as S from './shaders.js';
import { v3, m3, perspective, ortho, lookAt, mul4, inv4, project, clamp } from './math.js';
import { NG, NA, NB, NH } from './thermalcore.js';

export class Scene {
  constructor(canvas, ephem) {
    this.canvas = canvas; this.eph = ephem;
    const gl = this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 が使えません');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.lutReady = false; this.stats = { tris: 0, lidar: 0, lutMs: 0 };
    this.mark = new Float32Array(12); this.markR = new Float32Array(4);
    this.lastVP = null; this.view = { near: null, far: null };
  }

  async init(step = () => {}, opts = {}) {
    const full = !opts.light;
    const gl = this.gl;
    this.pBody = makeProgram(gl, S.BODY_VS, S.BODY_FS, 'body');
    this.pDepth = makeProgram(gl, S.DEPTH_VS, S.DEPTH_FS, 'depth');
    this.pStar = makeProgram(gl, S.STAR_VS, S.STAR_FS, 'star');
    this.pSun = makeProgram(gl, S.SUN_VS, S.SUN_FS, 'sun');
    this.pCraft = makeProgram(gl, S.CRAFT_VS, S.CRAFT_FS, 'craft');
    this.pLidar = makeProgram(gl, S.LIDAR_VS, S.LIDAR_FS, 'lidar');
    this.pSample = makeProgram(gl, S.SAMPLE_VS, S.SAMPLE_FS, 'sample');
    this.pGrain = makeProgram(gl, S.GRAIN_VS, S.GRAIN_FS, 'grain');
    this.pLine = makeProgram(gl, S.LINE_VS, S.LINE_FS, 'line');
    this.pDot = makeProgram(gl, S.DOT_VS, S.DOT_FS, 'dot');

    // --- 形状モデル(SPC v20200323・約20万面) ---
    const mb = await (await fetch('data/ryugu_200k.bin')).arrayBuffer();
    const hd = new Uint32Array(mb, 0, 4); const nv = hd[0], nf = hd[1], sc = hd[2];
    const q = new Int16Array(mb.slice(16, 16 + nv * 6)); const idx = new Uint32Array(mb.slice(16 + nv * 6, 16 + nv * 6 + nf * 12));
    const pos = new Float32Array(nv * 3); for (let i = 0; i < pos.length; i++) pos[i] = q[i] / sc;
    const nrm = new Float32Array(nv * 3);
    for (let f = 0; f < nf; f++) {
      const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { nrm[k] += nx; nrm[k + 1] += ny; nrm[k + 2] += nz; }
    }
    for (let i = 0; i < nv; i++) { // 外向きに揃えて正規化
      let x = nrm[i * 3], y = nrm[i * 3 + 1], z = nrm[i * 3 + 2]; const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      if (x * pos[i * 3] + y * pos[i * 3 + 1] + z * pos[i * 3 + 2] < 0) { x = -x; y = -y; z = -z; }
      nrm[i * 3] = x; nrm[i * 3 + 1] = y; nrm[i * 3 + 2] = z;
    }
    this.mesh = { pos, nrm, idx, nv, nf };
    this.stats.tris = nf;
    this.vaoBody = gl.createVertexArray(); gl.bindVertexArray(this.vaoBody);
    buffer(gl, pos); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    buffer(gl, nrm); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    buffer(gl, idx, gl.ELEMENT_ARRAY_BUFFER);
    this.vaoDepth = gl.createVertexArray(); gl.bindVertexArray(this.vaoDepth);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.getParameter(gl.ARRAY_BUFFER_BINDING));
    this._buildRadiusGrid();
    step('shape', nf);

    if (full) {
    // --- テクスチャ(ONC基準地図・低緯度の高解像度地図・熱慣性) ---
    const [base, hi, ti, hiMeta] = await Promise.all([
      loadTexture(gl, 'data/tex/onc.jpg'), loadTexture(gl, 'data/tex/onc_hi.jpg'), loadTexture(gl, 'data/tex/ti.png', { mips: false }),
      fetch('data/tex/onc_hi.json').then((r) => r.json()),
    ]);
    this.tex = { base: base.tex, hi: hi.tex, ti: ti.tex }; this.hiMeta = hiMeta;
    step('maps', base.w);
    }

    // --- 影(太陽方向の深度マップ) ---
    this.shadowSize = 2048;
    this.shadowTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE], [gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.shadowFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    if (full) {
    // --- 星・探査機・LIDAR点群 ---
    const st = new Float32Array(await (await fetch('data/stars.bin')).arrayBuffer());
    this.nStars = st.length / 4; this.vaoStar = gl.createVertexArray(); gl.bindVertexArray(this.vaoStar);
    buffer(gl, st); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);

    const cb = await (await fetch('data/craft.bin')).arrayBuffer();
    const cn = new Uint32Array(cb, 0, 1)[0];
    this.nCraft = cn; this.vaoCraft = gl.createVertexArray(); gl.bindVertexArray(this.vaoCraft);
    buffer(gl, new Float32Array(cb, 4, cn * 3)); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    buffer(gl, new Uint8Array(cb, 4 + cn * 12, cn * 3)); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.UNSIGNED_BYTE, true, 0, 0);
    step('craft', cn / 3);

    const lb = await (await fetch('data/lidar.bin')).arrayBuffer();
    const lh = new Float64Array(lb, 0, 2); const ln = new Uint32Array(lb, 16, 1)[0];
    this.lidar = { t0: lh[0], scale: 1 / lh[1], n: ln, tMax: 0 };
    const lq = new Int16Array(lb.slice(20, 20 + ln * 6)); const lt = new Float32Array(lb.slice(20 + ln * 6, 20 + ln * 10));
    this.lidar.tMax = lt[ln - 1]; this.lidar.times = lt; this.lidar.q = lq;
    this.vaoLidar = gl.createVertexArray(); gl.bindVertexArray(this.vaoLidar);
    buffer(gl, lq); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.SHORT, false, 0, 0);
    buffer(gl, lt); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    this.stats.lidar = ln; step('lidar', ln);
    }

    this.vaoEmpty = gl.createVertexArray();
    this.vaoGrain = gl.createVertexArray(); gl.bindVertexArray(this.vaoGrain);
    this.bufGrain = buffer(gl, new Float32Array(5 * 4), gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
    if (full) this._initFar();
    this.lutTex = gl.createTexture();
    gl.bindVertexArray(null);
  }

  // 熱モデルの結果(LUT)を GPU へ
  setLUT(lut, ms) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, NB * NH, NG * NA, 0, gl.RED, gl.FLOAT, lut);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.lut = lut; this.lutReady = true; this.stats.lutMs = ms;
  }

  _buildRadiusGrid() {
    const W = 720, H = 360, R = new Float32Array(W * H), { pos, nv } = this.mesh;
    for (let i = 0; i < nv; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], r = Math.hypot(x, y, z);
      let lon = Math.atan2(y, x); if (lon < 0) lon += 2 * Math.PI;
      const lat = Math.asin(z / r);
      const u = Math.min(W - 1, Math.floor(lon / (2 * Math.PI) * W)), v = Math.min(H - 1, Math.floor((Math.PI / 2 - lat) / Math.PI * H));
      if (r > R[v * W + u]) R[v * W + u] = r;
    }
    for (let it = 0; it < 6; it++) { // 空のセルを近傍で埋める
      let empty = 0;
      for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) if (R[v * W + u] === 0) {
        let s = 0, n = 0;
        for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const uu = (u + du + W) % W, vv = Math.min(H - 1, Math.max(0, v + dv)); const r = R[vv * W + uu]; if (r > 0) { s += r; n++; } }
        if (n) R[v * W + u] = s / n; else empty++;
      }
      if (!empty) break;
    }
    this.rgrid = { R, W, H };
  }
  surfaceRadius(dir) { // dir: 単位ベクトル(小惑星固定座標)
    const { R, W, H } = this.rgrid;
    let lon = Math.atan2(dir[1], dir[0]); if (lon < 0) lon += 2 * Math.PI;
    const lat = Math.asin(clamp(dir[2], -1, 1));
    const fu = lon / (2 * Math.PI) * W - 0.5, fv = (Math.PI / 2 - lat) / Math.PI * H - 0.5;
    const u0 = Math.floor(fu), v0 = Math.floor(fv), a = fu - u0, b = fv - v0;
    const g = (u, v) => R[Math.min(H - 1, Math.max(0, v)) * W + ((u % W) + W) % W];
    return (g(u0, v0) * (1 - a) + g(u0 + 1, v0) * a) * (1 - b) + (g(u0, v0 + 1) * (1 - a) + g(u0 + 1, v0 + 1) * a) * b;
  }
  pickRay(eye, dir) { // 視線と地表の交点(固定座標)。当たらなければ null
    // 外接球(半径600 m)との交点から前進
    const b = v3.dot(eye, dir), c = v3.dot(eye, eye) - 600 * 600; const disc = b * b - c;
    if (disc < 0) return null;
    let t = -b - Math.sqrt(disc); if (t < 0) t = 0;
    const tEnd = -b + Math.sqrt(disc);
    let prev = t;
    for (; t < tEnd; t += 1.5) {
      const p = v3.add(eye, v3.mul(dir, t)); const r = v3.len(p);
      if (r < this.surfaceRadius(v3.mul(p, 1 / r))) {
        let lo = prev, hi = t; for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; const pm = v3.add(eye, v3.mul(dir, m)); const rm = v3.len(pm); if (rm < this.surfaceRadius(v3.mul(pm, 1 / rm))) hi = m; else lo = m; }
        const pp = v3.add(eye, v3.mul(dir, hi)); const rp = v3.len(pp); return v3.mul(pp, this.surfaceRadius(v3.mul(pp, 1 / rp)) / rp);
      }
      prev = t;
    }
    return null;
  }

  resize() {
    const c = this.canvas, w = Math.floor(c.clientWidth * this.dpr), h = Math.floor(c.clientHeight * this.dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.aspect = w / h;
  }

  _initFar() {
    const gl = this.gl, e = this.eph;
    const mk = (arr) => { const b = buffer(gl, arr); return { b, n: arr.length / 3 }; };
    const u0 = e.t0 + 86400 * 1330, u1 = u0 + 366 * 86400;
    this.far = {
      earth: mk(e.pathSlice(3, u0, u1)),
      ryugu: mk(e.pathSlice(6, e.t0 + 86400 * 1270, e.t0 + 86400 * 1790)),
      craft: mk(e.pathSlice(0, e.t0, e.t0 + 86400 * 4100)),
      dyn: buffer(gl, new Float32Array(6 * 3), gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW),
    };
    this.far.craftT0 = e.t0;
    this.vaoLine = gl.createVertexArray();
  }

  // ---------------------------------------------------------------- 描画: 近接(リュウグウ)
  drawNear(st) {
    const gl = this.gl; this.resize();
    const { W, H } = { W: this.canvas.width, H: this.canvas.height };
    const { eye, target, up } = st.pose;
    const sun = st.sun, alt = Math.max(st.altitude, 1);
    const near = clamp(alt * 0.08, 0.12, 60), far = 400000;
    const fov = (this.aspect < 1 ? 62 : 46) * Math.PI / 180;
    const proj = perspective(fov, this.aspect, near, far), view = lookAt(eye, target, up);
    const vp = mul4(proj, view); this.lastVP = vp; this.view.near = { vp, eye, fov };

    // 影の深度マップ
    const lightV = lookAt(v3.mul(sun, 900), [0, 0, 0], Math.abs(sun[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1]);
    const lvp = mul4(ortho(-620, 620, -620, 620, 100, 1800), lightV);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo); gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.colorMask(false, false, false, false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
    gl.useProgram(this.pDepth.p); gl.uniformMatrix4fv(this.pDepth.U.uLVP, false, lvp);
    gl.bindVertexArray(this.vaoBody); gl.drawElements(gl.TRIANGLES, this.mesh.nf * 3, gl.UNSIGNED_INT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.colorMask(true, true, true, true);

    // 本画面
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.clearColor(0.012, 0.016, 0.026, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    // 星と太陽(無限遠)
    const viewRot = new Float32Array(view); viewRot[12] = viewRot[13] = viewRot[14] = 0;
    const rotProj = mul4(proj, viewRot);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.pStar.p);
    gl.uniformMatrix3fv(this.pStar.U.uSky, false, m3.toGL(st.e2b)); gl.uniformMatrix4fv(this.pStar.U.uRotProj, false, rotProj);
    gl.uniform1f(this.pStar.U.uPx, this.dpr); gl.uniform1f(this.pStar.U.uGain, st.mode === 2 ? 0.7 : 1.0);
    gl.bindVertexArray(this.vaoStar); gl.drawArrays(gl.POINTS, 0, this.nStars);
    gl.useProgram(this.pSun.p); gl.uniformMatrix4fv(this.pSun.U.uRotProj, false, rotProj);
    gl.uniform3fv(this.pSun.U.uDir, sun); gl.uniform1f(this.pSun.U.uSize, 11 * this.dpr);
    gl.drawArrays(gl.POINTS, 0, 1);
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST);

    // 小惑星本体
    const P = this.pBody, U = P.U; gl.useProgram(P.p);
    gl.uniformMatrix4fv(U.uVP, false, vp); gl.uniformMatrix4fv(U.uLVP, false, lvp);
    gl.uniform3fv(U.uSun, sun); gl.uniform3fv(U.uEye, eye); gl.uniform1i(U.uMode, st.mode); gl.uniform1f(U.uSunAU, st.sunAU);
    gl.uniform1f(U.uExposure, st.mode === 1 ? 0.95 : 0.3); gl.uniform1f(U.uBump, 0.55); gl.uniform1f(U.uLidarDim, 0.4); gl.uniform1f(U.uPulse, 0.5 + 0.5 * Math.sin(st.clock * 4));
    gl.uniform2f(U.uHiLat, this.hiMeta.lat_top, this.hiMeta.lat_bottom); gl.uniform1f(U.uShadowTexel, 1 / this.shadowSize);
    gl.uniform3fv(U.uMark, this.mark); gl.uniform1fv(U.uMarkR, this.markR);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex.base); gl.uniform1i(U.uBase, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex.hi); gl.uniform1i(U.uHi, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex); gl.uniform1i(U.uShadow, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.tex.ti); gl.uniform1i(U.uTI, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.lutTex); gl.uniform1i(U.uLUT, 4);
    gl.bindVertexArray(this.vaoBody); gl.drawElements(gl.TRIANGLES, this.mesh.nf * 3, gl.UNSIGNED_INT, 0);

    // LIDAR: 実測の足跡
    if (st.mode === 2) {
      const L = this.pLidar, LU = L.U; gl.useProgram(L.p);
      gl.uniformMatrix4fv(LU.uVP, false, vp); gl.uniform1f(LU.uScale, this.lidar.scale); gl.uniform1f(LU.uTmax, st.lidarT);
      gl.uniform1f(LU.uPx, this.dpr * 2.8); gl.uniform3fv(LU.uEye, eye); gl.uniform1f(LU.uRef, 492);
      gl.bindVertexArray(this.vaoLidar); gl.drawArrays(gl.POINTS, 0, this.lidar.n);
    }
    // 試料: 粒子と名前のある粒
    if (st.mode === 3 && st.site) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const A = this.pSample, AU = A.U; gl.useProgram(A.p);
      gl.uniformMatrix4fv(AU.uVP, false, vp); gl.uniform3fv(AU.uSite, st.site.p); gl.uniform3fv(AU.uN, st.site.n); gl.uniform3fv(AU.uT1, st.site.t1); gl.uniform3fv(AU.uT2, st.site.t2);
      gl.uniform1f(AU.uTime, st.clock); gl.uniform1f(AU.uPx, this.dpr); gl.uniform1f(AU.uBase, 0.2); gl.uniform3fv(AU.uEye, eye);
      gl.bindVertexArray(this.vaoEmpty); gl.drawArrays(gl.POINTS, 0, 9000);
      gl.disable(gl.BLEND);
      if (st.grains && st.grains.length) {
        const arr = new Float32Array(st.grains.length * 4);
        st.grains.forEach((g, i) => { arr[i * 4] = g.p[0]; arr[i * 4 + 1] = g.p[1]; arr[i * 4 + 2] = g.p[2]; arr[i * 4 + 3] = g.sel ? 1 : 0; });
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufGrain); gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr);
        gl.useProgram(this.pGrain.p); gl.uniformMatrix4fv(this.pGrain.U.uVP, false, vp); gl.uniform1f(this.pGrain.U.uPx, this.dpr); gl.uniform3fv(this.pGrain.U.uEye, eye);
        gl.bindVertexArray(this.vaoGrain); gl.drawArrays(gl.POINTS, 0, st.grains.length);
      }
    }
    // はやぶさ2
    if (st.craft) {
      const c = st.craft;
      const d = v3.len(v3.sub(eye, c.p));
      if (d < 1800) {
        const M = new Float32Array([c.x[0], c.x[1], c.x[2], 0, c.y[0], c.y[1], c.y[2], 0, c.z[0], c.z[1], c.z[2], 0, c.p[0], c.p[1], c.p[2], 1]);
        gl.useProgram(this.pCraft.p); gl.uniformMatrix4fv(this.pCraft.U.uVP, false, vp); gl.uniformMatrix4fv(this.pCraft.U.uModel, false, M); gl.uniform3fv(this.pCraft.U.uSun, sun);
        gl.bindVertexArray(this.vaoCraft); gl.drawArrays(gl.TRIANGLES, 0, this.nCraft);
      }
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.pDot.p); gl.uniformMatrix4fv(this.pDot.U.uVP, false, vp);
      const cb = this._tmpBuf || (this._tmpBuf = gl.createBuffer()); gl.bindVertexArray(this.vaoLine); gl.bindBuffer(gl.ARRAY_BUFFER, cb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(c.p), gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.uniform1f(this.pDot.U.uSize, clamp(24 / Math.max(d / 400, 0.4), 5, 11) * this.dpr * (d < 150 ? 0 : 1)); gl.uniform4f(this.pDot.U.uColor, 1, 1, 1, 1);
      gl.drawArrays(gl.POINTS, 0, 1);
      gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST);
    }
    gl.bindVertexArray(null);
  }

  // ---------------------------------------------------------------- 描画: 太陽系
  drawFar(st) {
    const gl = this.gl; this.resize(); const W = this.canvas.width, H = this.canvas.height;
    const { az, el, dist, target } = st.farCam;
    const eye = v3.add(target, [dist * Math.cos(el) * Math.cos(az), dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el)]);
    const proj = perspective(34 * Math.PI / 180, this.aspect, dist * 0.01, dist * 40), view = lookAt(eye, target, [0, 0, 1]);
    const vp = mul4(proj, view); this.view.far = { vp, eye };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.clearColor(0.012, 0.016, 0.026, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // 星(黄道座標のまま)
    const viewRot = new Float32Array(view); viewRot[12] = viewRot[13] = viewRot[14] = 0;
    gl.useProgram(this.pStar.p); gl.uniformMatrix3fv(this.pStar.U.uSky, false, m3.toGL([1, 0, 0, 0, 1, 0, 0, 0, 1]));
    gl.uniformMatrix4fv(this.pStar.U.uRotProj, false, mul4(proj, viewRot)); gl.uniform1f(this.pStar.U.uPx, this.dpr); gl.uniform1f(this.pStar.U.uGain, 0.55);
    gl.bindVertexArray(this.vaoStar); gl.drawArrays(gl.POINTS, 0, this.nStars);

    const L = this.pLine; gl.useProgram(L.p); gl.uniformMatrix4fv(L.U.uVP, false, vp);
    const line = (buf, n, mode, col, first = 0) => {
      gl.bindVertexArray(this.vaoLine); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.uniform4fv(L.U.uColor, col); gl.drawArrays(mode, first, n);
    };
    line(this.far.earth.b, this.far.earth.n, gl.LINE_STRIP, [0.42, 0.66, 1, 0.38]);
    line(this.far.ryugu.b, this.far.ryugu.n, gl.LINE_STRIP, [0.9, 0.92, 0.96, 0.2]);
    line(this.far.craft.b, this.far.craft.n, gl.LINE_STRIP, [1, 1, 1, 0.09]);
    const k = clamp(Math.floor((st.t - this.far.craftT0) / 86400) + 1, 0, this.far.craft.n);
    if (k > 1) line(this.far.craft.b, k, gl.LINE_STRIP, [1, 1, 1, 0.6]);
    // 点: 太陽・地球・リュウグウ・探査機
    const s = this.eph.state(st.t);
    const dyn = new Float32Array([0, 0, 0, ...s.earth, ...s.ryugu, ...(s.craft || [NaN, NaN, NaN])]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.far.dyn); gl.bufferSubData(gl.ARRAY_BUFFER, 0, dyn.subarray(0, 12));
    const D = this.pDot; gl.useProgram(D.p); gl.uniformMatrix4fv(D.U.uVP, false, vp);
    gl.bindVertexArray(this.vaoLine); gl.bindBuffer(gl.ARRAY_BUFFER, this.far.dyn); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const dot = (i, size, col) => { gl.uniform1f(D.U.uSize, size * this.dpr); gl.uniform4fv(D.U.uColor, col); gl.drawArrays(gl.POINTS, i, 1); };
    dot(0, 13, [1, 0.93, 0.78, 1]); dot(1, 8, [0.42, 0.66, 1, 1]); dot(2, 6, [0.92, 0.94, 0.98, 1]);
    if (s.craft) dot(3, 7, [1, 1, 1, 1]);
    gl.disable(gl.BLEND); gl.bindVertexArray(null);
  }

  projectNear(p) { if (!this.view.near) return null; const r = project(this.view.near.vp, p); return r[2] > 0 ? { x: (r[0] * 0.5 + 0.5), y: (1 - (r[1] * 0.5 + 0.5)), w: r[2] } : null; }
  projectFar(p) { if (!this.view.far) return null; const r = project(this.view.far.vp, p); return r[2] > 0 ? { x: (r[0] * 0.5 + 0.5), y: (1 - (r[1] * 0.5 + 0.5)), w: r[2] } : null; }
  rayFromNDC(nx, ny) { // 近接ビューの視線(固定座標)
    const { vp, eye } = this.view.near; const iv = inv4(vp);
    const un = (z) => { const x = iv[0] * nx + iv[4] * ny + iv[8] * z + iv[12], y = iv[1] * nx + iv[5] * ny + iv[9] * z + iv[13], zz = iv[2] * nx + iv[6] * ny + iv[10] * z + iv[14], w = iv[3] * nx + iv[7] * ny + iv[11] * z + iv[15]; return [x / w, y / w, zz / w]; };
    const p1 = un(1); return { eye, dir: v3.norm(v3.sub(p1, eye)) };
  }
}
