import { Ephem, etOf, AU, C_KMS } from './ephem.js';
import { Scene } from './scene.js';
import { buildLUT, sampleLUT, NH } from './thermalcore.js';
import { v3, m3, clamp, ease, slerpDir, smooth } from './math.js';
import { EVENTS, SITES, FEATURES, INSTRUMENTS, RAIL, T_MIN, T_MAX, tToF, fToT, UTC } from './events.js';
import { UI } from './ui.js';

const $ = (s) => document.querySelector(s);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const NEAR_T0 = UTC(2018, 6, 27), NEAR_T1 = UTC(2019, 11, 20);
const MODES = ['onc', 'tir', 'lidar', 'sample'];

// ------------------------------------------------------------------ 状態
const S = {
  t: UTC(2018, 7, 12, 6), speed: 0, view: 'near', mode: 0, started: false, ready: false, clock: 0,
  cam: { mode: 'orbit', az: 0, el: 0.4, dist: 40000, site: null },
  camT: { az: 0, el: 0.4, dist: 40000 },
  farCam: { az: -1.9, el: 0.95, dist: 3.4, target: [0, 0, 0] }, farT: { az: -1.9, el: 0.95, dist: 3.4 },
  trans: null, lastPoseWorld: null, selected: null, grains: [], grainSel: null,
  log: { events: new Set(), instr: { onc: 0, tir: 0, lidar: 0, sample: 0 }, disc: new Set(), dwell: {}, grains: new Set(), jumps: 0 },
};
const eph = new Ephem(); let scene, ui, tiCPU = null, onc = null;

// ------------------------------------------------------------------ 起動
async function boot() {
  ui = new UI(S, { MODES, EVENTS, RAIL, INSTRUMENTS, tToF, fToT, SITES, FEATURES, NEAR_T0, NEAR_T1 });
  ui.boot('SPICE暦を読み込み: 探査機・地球・リュウグウの軌道');
  await eph.load('data/');
  ui.boot(`軌道 ${eph.nDaily.toLocaleString()} 日分、近傍 ${eph.proxT.length.toLocaleString()} 時刻`);
  scene = new Scene($('#gl'), eph);
  await scene.init((k, n) => {
    if (k === 'shape') ui.boot(`形状モデル ${n.toLocaleString()} 面`);
    if (k === 'maps') ui.boot(`ONC地図 ${n.toLocaleString()} px・高解像度地図・熱慣性地図`);
    if (k === 'lidar') ui.boot(`LIDAR 実測点 ${n.toLocaleString()} 点`);
  });
  S.scene = scene; ui.scene = scene;
  // CPU側の熱慣性地図とONC画像一覧
  const [tiBlob, manifest, samples] = await Promise.all([fetch('data/tex/ti.png').then((r) => r.blob()), fetch('data/onc_manifest.json').then((r) => r.json()), fetch('data/samples.json').then((r) => r.json())]);
  const bmp = await createImageBitmap(tiBlob); const oc = new OffscreenCanvas(bmp.width, bmp.height); const ctx = oc.getContext('2d'); ctx.drawImage(bmp, 0, 0);
  tiCPU = { data: ctx.getImageData(0, 0, bmp.width, bmp.height).data, w: bmp.width, h: bmp.height };
  onc = manifest; onc.items.sort((a, b) => a.t - b.t); S.onc = onc; S.samples = samples;
  ui.setSamples(samples);
  initCamera();
  ui.api = { flySite, jumpTo, setMode, start, setView, flyOrbit, select, selectGrain, surfacePoint, tempAt, shareUrl, writeUrl };
  applyUrl();
  if (!S.started) S.speed = 200;
  startThermal();
  ui.ready();
  requestAnimationFrame(loop);
  window.__ryugu = { S, scene, eph, ui, go: (o) => jumpTo(o) };
}

function startThermal() {
  const done = (lut, ms) => { scene.setLUT(lut, ms); ui.thermalDone(ms); };
  ui.boot('熱モデルを解く: 熱慣性×太陽高度×時角 の 1,680 通り');
  let w = null;
  try { w = new Worker('js/thermal.worker.js', { type: 'module' }); } catch (e) { w = null; }
  if (w) {
    let fell = false;
    const fb = () => { if (fell) return; fell = true; setTimeout(() => { const t0 = performance.now(); done(buildLUT(), performance.now() - t0); }, 30); };
    w.onmessage = (e) => done(e.data.lut, e.data.ms); w.onerror = fb; w.postMessage(1);
  } else setTimeout(() => { const t0 = performance.now(); done(buildLUT(), performance.now() - t0); }, 30);
}

// ------------------------------------------------------------------ 座標の補助
const sunBody = (t) => m3.applyT(eph.bodyToEcl(t).b2e, eph.sunDirEcl(t));
function siteFrame(P) {
  const n = v3.norm(P);
  let t1 = v3.cross([0, 0, 1], n); if (v3.len(t1) < 1e-3) t1 = [1, 0, 0]; t1 = v3.norm(t1);
  const t2 = v3.cross(n, t1);
  const lat = Math.asin(n[2]) * 180 / Math.PI; let lon = Math.atan2(n[1], n[0]) * 180 / Math.PI; if (lon < 0) lon += 360;
  return { p: P, n, t1, t2, lat, lon };
}
function surfacePoint(latDeg, lonDeg) {
  const la = latDeg * Math.PI / 180, lo = lonDeg * Math.PI / 180;
  const u = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  return v3.mul(u, scene.surfaceRadius(u));
}
function nearestVertexNormal(P) {
  const { pos, nrm, nv } = scene.mesh; let best = 1e18, bi = 0;
  for (let i = 0; i < nv; i++) { const dx = pos[i * 3] - P[0], dy = pos[i * 3 + 1] - P[1], dz = pos[i * 3 + 2] - P[2]; const d = dx * dx + dy * dy + dz * dz; if (d < best) { best = d; bi = i; } }
  return [nrm[bi * 3], nrm[bi * 3 + 1], nrm[bi * 3 + 2]];
}
function tiAt(P) { // 熱慣性(tiu)
  const n = v3.norm(P); let lon = Math.atan2(n[1], n[0]); if (lon < 0) lon += 2 * Math.PI; const lat = Math.asin(n[2]);
  const x = Math.min(tiCPU.w - 1, Math.floor(lon / (2 * Math.PI) * tiCPU.w)), y = Math.min(tiCPU.h - 1, Math.floor((Math.PI / 2 - lat) / Math.PI * tiCPU.h));
  const r = tiCPU.data[(y * tiCPU.w + x) * 4]; const valid = tiCPU.data[(y * tiCPU.w + x) * 4 + 1] > 128;
  return { tiu: 10 + r / 255 * 390, measured: valid };
}
function tempAt(P, t) { // 熱モデルによる表面温度と1日の曲線
  if (!scene.lutReady) return null;
  const n = nearestVertexNormal(P); const s = sunBody(t);
  const phi = Math.asin(clamp(n[2], -1, 1)), lam = Math.atan2(n[1], n[0]), dlt = Math.asin(clamp(s[2], -1, 1)), lams = Math.atan2(s[1], s[0]);
  const h = ((lam - lams) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const a = Math.sin(phi) * Math.sin(dlt), b = Math.cos(phi) * Math.cos(dlt);
  const ti = tiAt(P); const k = Math.pow(1.1896 / eph.sunAU(t), 0.5);
  const curve = []; for (let i = 0; i < 96; i++) curve.push(sampleLUT(scene.lut, ti.tiu, a, b, i / 96 * 2 * Math.PI) * k);
  const T = sampleLUT(scene.lut, ti.tiu, a, b, h) * k;
  const cosz = a + b * Math.cos(h);
  return { T, curve, h, ti, sunUp: cosz > 0 };
}

// ------------------------------------------------------------------ カメラ
function initCamera() {
  const sd = eph.sunDirEcl(S.t); const az = Math.atan2(sd[1], sd[0]);
  S.cam = { mode: 'orbit', az: az + 0.95, el: Math.asin(sd[2]) + 0.38, dist: 38000, site: null };
  S.camT = { az: S.cam.az, el: S.cam.el, dist: 2300 };
  S.farCam.az = -1.9; S.farCam.el = 0.95;
}
function flyOrbit(opts = {}) {
  S.trans = { t0: S.clock, dur: REDUCED ? 0.01 : (opts.dur || 2.0), from: S.lastPoseWorld };
  const sd = eph.sunDirEcl(S.t);
  S.cam.mode = 'orbit'; S.cam.site = null;
  const az = opts.az ?? (Math.atan2(sd[1], sd[0]) + 0.95), el = opts.el ?? (Math.asin(sd[2]) + 0.38);
  S.camT.az = S.cam.az = az; S.camT.el = S.cam.el = el; S.camT.dist = S.cam.dist = opts.dist || 2300;
}
function flySite(P, opts = {}) {
  S.trans = { t0: S.clock, dur: REDUCED ? 0.01 : (opts.dur || 2.2), from: S.lastPoseWorld };
  S.cam.mode = 'site'; S.cam.site = siteFrame(P);
  S.camT.az = S.cam.az = opts.az ?? -1.0; S.camT.el = S.cam.el = opts.el ?? 0.38; S.camT.dist = S.cam.dist = opts.dist || 380;
}
function poseBody(t, Rt, Rb) {
  const c = S.cam;
  if (c.mode === 'orbit') {
    const eW = [c.dist * Math.cos(c.el) * Math.cos(c.az), c.dist * Math.cos(c.el) * Math.sin(c.az), c.dist * Math.sin(c.el)];
    return { eye: m3.apply(Rt, eW), target: [0, 0, 0], up: m3.apply(Rt, [0, 0, 1]) };
  }
  const s = c.site; const dirv = v3.add(v3.mul(v3.add(v3.mul(s.t1, Math.cos(c.az)), v3.mul(s.t2, Math.sin(c.az))), Math.cos(c.el)), v3.mul(s.n, Math.sin(c.el)));
  return { eye: v3.add(s.p, v3.mul(dirv, c.dist)), target: v3.add(s.p, v3.mul(s.n, 0.5)), up: s.n };
}
function computePose(t, dt) {
  const { b2e } = eph.bodyToEcl(t); const Rb = b2e, Rt = m3.T(b2e);
  // 平滑化
  const k = 1 - Math.exp(-dt * 9);
  if (!(S.trans && S.trans.fix)) {
    S.cam.az += (S.camT.az - S.cam.az) * k; S.cam.el += (S.camT.el - S.cam.el) * k;
    S.cam.dist *= Math.exp((Math.log(S.camT.dist) - Math.log(S.cam.dist)) * k);
  }
  let pose = poseBody(t, Rt, Rb);
  if (S.trans) {
    const u = (S.clock - S.trans.t0) / S.trans.dur;
    if (u >= 1 || !S.trans.from) S.trans = null;
    else {
      const e = ease(u), f = S.trans.from;
      const fe = m3.apply(Rt, f.eye), ft = m3.apply(Rt, f.target), fu = m3.apply(Rt, f.up);
      const le = v3.len(fe), ne = v3.len(pose.eye);
      let eye;
      if (le > 560 && ne > 560) eye = v3.mul(slerpDir(fe, pose.eye, e), le + (ne - le) * e);
      else eye = v3.lerp(fe, pose.eye, e);
      pose = { eye, target: v3.lerp(ft, pose.target, e), up: v3.norm(v3.lerp(fu, pose.up, e)) };
    }
  }
  S.lastPoseWorld = { eye: m3.apply(Rb, pose.eye), target: m3.apply(Rb, pose.target), up: m3.apply(Rb, pose.up) };
  return pose;
}

// ------------------------------------------------------------------ 時刻・表示切替
function setView(v, immediate = false) {
  if (S.view === v) return;
  const sw = () => { S.view = v; ui.viewChanged(); };
  if (immediate || REDUCED) sw(); else ui.fade(sw);
}
function jumpTo({ t, view, site, mode, speed, dist, el, az }) {
  S.log.jumps++;
  if (t != null) S.t = t;
  if (mode != null) setMode(mode, true);
  if (speed != null) S.speed = speed;
  const inNear = S.t >= NEAR_T0 && S.t <= NEAR_T1;
  const want = view || (inNear ? 'near' : 'far');
  setView(want === 'near' && !inNear ? 'far' : want);
  if (S.view === 'near' || want === 'near') {
    if (site) { const st = SITES[site]; flySite(surfacePoint(st.lat, st.lon), { dist: dist || 260, el: el ?? 0.45, az: az ?? -0.9 }); }
    else if (S.cam.mode === 'site' && !site) flyOrbit({ dist: dist || 2300 });
  }
  ui.refresh(true);
}
function setMode(i, quiet) {
  if (typeof i === 'string') i = MODES.indexOf(i);
  S.mode = i; S.grainSel = null; ui.modeChanged(); S.log.disc.size;
  if (quiet) return;
  const id = MODES[i];
  if (i === 1) { if (S.view !== 'near') nearIfPossible(); if (S.speed < 60) S.speed = 3600; }
  if (i === 2) {
    nearIfPossible(); S.t = UTC(2018, 6, 30, 5, 30); S.speed = 86400; flyOrbit({ dist: 2100 });
  }
  if (i === 3) {
    nearIfPossible(); const st = S.t < UTC(2019, 5, 1) ? SITES.td1 : SITES.td2; S.t = st.t + 240; S.speed = 0;
    flySite(surfacePoint(st.lat, st.lon), { dist: 20, el: 0.34, az: -0.8 });
  }
  if (i === 0 && S.speed >= 86400 && S.view === 'near') S.speed = 600;
}
function nearIfPossible() {
  if (S.t < NEAR_T0 || S.t > NEAR_T1) S.t = UTC(2018, 7, 12, 6);
  if (S.view !== 'near') setView('near');
  if (S.cam.mode === 'site') flyOrbit({ dist: 2300 });
}
function start() {
  if (S.started) return; S.started = true; S.log.jumps++;
  ui.heroOut();
  const st = SITES.td1; S.t = st.t - 14 * 60; S.speed = 12; setMode(0, true);
  S.mode = 0; ui.modeChanged();
  flySite(surfacePoint(st.lat, st.lon), { dist: 110, el: 0.32, az: -0.95, dur: REDUCED ? 0.01 : 3.2 });
  S.farT.dist = 3.4;
  ui.hint('ドラッグで見回す。ホイールで高度を変える。');
}

// ------------------------------------------------------------------ 入力
function bindInput() {
  const cv = $('#gl'); let pts = new Map(), moved = 0, down = 0, last = null, pinch = 0;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; down = performance.now(); last = [e.clientX, e.clientY]; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  cv.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) { hover(e); return; }
    const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoom(pinch / d); pinch = d; moved += 10; return; }
    const dx = e.clientX - prev[0], dy = e.clientY - prev[1]; moved += Math.abs(dx) + Math.abs(dy);
    drag(dx, dy);
  });
  const up = (e) => {
    if (pts.size === 1 && moved < 6 && performance.now() - down < 500) click(e.clientX, e.clientY);
    pts.delete(e.pointerId); pinch = 0;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); pinch = 0; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); ui.togglePlay(); }
    if (e.key === 'Escape') ui.closePanels();
  });
}
function drag(dx, dy) {
  if (S.view === 'near') { S.camT.az -= dx * 0.0052 * (S.cam.mode === 'site' ? -1 : 1); S.camT.el = clamp(S.camT.el + dy * 0.0052, S.cam.mode === 'site' ? 0.03 : -1.45, 1.45); }
  else { S.farT.az -= dx * 0.005; S.farT.el = clamp(S.farT.el + dy * 0.005, -1.5, 1.5); }
}
function zoom(f) {
  if (S.view === 'near') {
    if (!S.started) return;
    if (S.cam.mode === 'orbit') S.camT.dist = clamp(S.camT.dist * f, 640, 90000);
    else {
      S.camT.dist = clamp(S.camT.dist * f, 6, 3200);
      if (S.camT.dist > 2200 && f > 1) flyOrbit({ dist: 2600 });
    }
  } else S.farT.dist = clamp(S.farT.dist * f, 0.04, 9);
}
function hover(e) { ui.hoverAt && ui.hoverAt(e.clientX, e.clientY); }
function click(cx, cy) {
  if (!S.started) return;
  if (S.view !== 'near') return;
  const r = $('#gl').getBoundingClientRect(); const nx = (cx - r.left) / r.width * 2 - 1, ny = -((cy - r.top) / r.height * 2 - 1);
  // 試料の粒
  if (S.mode === 3 && S.grains.length) {
    let best = null, bd = 28;
    for (const g of S.grains) { const p = scene.projectNear(g.p); if (!p) continue; const d = Math.hypot((p.x * r.width) - (cx - r.left), (p.y * r.height) - (cy - r.top)); if (d < bd) { bd = d; best = g; } }
    if (best) { selectGrain(best); return; }
  }
  const { eye, dir } = scene.rayFromNDC(nx, ny); const P = scene.pickRay(eye, dir);
  if (!P) return;
  select(P, true);
  if (S.cam.mode === 'orbit') flySite(P, { dist: 420, el: 0.5, az: Math.atan2(v3.dot(v3.sub(eye, P), siteFrame(P).t2), v3.dot(v3.sub(eye, P), siteFrame(P).t1)) });
}
function select(P) {
  const f = siteFrame(P); S.selected = { p: P, lat: f.lat, lon: f.lon, t: S.t };
  S.grainSel = null; ui.selectionChanged();
}
function selectGrain(g) {
  S.grains.forEach((x) => (x.sel = x === g)); S.grainSel = g.id; S.log.grains.add(g.id); ui.grainChanged(g);
}

// ------------------------------------------------------------------ URL
let urlTimer = 0;
function writeUrl() {
  const p = new URLSearchParams();
  p.set('time', new Date(S.t * 1000).toISOString().replace('.000Z', 'Z'));
  p.set('i', MODES[S.mode]);
  if (S.view === 'near' && S.cam.mode === 'site' && S.cam.site) { p.set('lat', S.cam.site.lat.toFixed(2)); p.set('lon', S.cam.site.lon.toFixed(2)); p.set('alt', Math.round(S.camT.dist)); }
  history.replaceState(null, '', '?' + p.toString());
}
export function shareUrl() { writeUrl(); return location.href; }
function applyUrl() {
  const p = new URLSearchParams(location.search); if (!(p.has('time') || p.has('i') || p.has('lat'))) return;
  let t = p.get('time');
  if (t) { if (!/(Z|[+-]\d\d:?\d\d)$/.test(t)) t += '+09:00'; const v = Date.parse(t) / 1000; if (!isNaN(v)) S.t = v; }
  const i = MODES.indexOf(p.get('i')); if (i >= 0) { S.mode = i; ui.modeChanged(); }
  S.started = true; ui.heroOut(true); S.speed = 0;
  const inNear = S.t >= NEAR_T0 && S.t <= NEAR_T1;
  if (!inNear) { S.view = 'far'; ui.viewChanged(); return; }
  if (p.has('lat') && p.has('lon')) { flySite(surfacePoint(+p.get('lat'), +p.get('lon')), { dist: +(p.get('alt') || 300), dur: 0.01 }); }
  else { flyOrbit({ dist: 2300, dur: 0.01 }); }
}

// ------------------------------------------------------------------ 発見
const DISC = [
  { id: 'touch', ok: (c) => c.near && Math.abs(S.t - SITES.td1.t) < 25 && c.craftAlt != null && c.craftAlt < 6 && c.nearSite === 'td1', text: '2019年2月22日 7:29。この瞬間、はやぶさ2は地表に触れた。' },
  { id: 'sci', ok: (c) => c.near && c.nearSite === 'sci' && c.camDist < 260, text: 'ここは人工クレーター。銅の弾の衝突で、地下の物質が現れた。' },
  { id: 'night', ok: (c) => c.near && S.mode === 1 && c.T != null && c.T < 205 && !c.sunUp, text: '夜のリュウグウは、急速に冷える。' },
  { id: 'day', ok: (c) => c.near && S.mode === 1 && c.T != null && c.T > 335 && c.sunUp, text: () => `昼の地表は、約${Math.round(S.__T)} Kまで温まる。熱モデルによる推定。` },
  { id: 'lidar', ok: (c) => c.near && S.mode === 2 && S.speed > 0, text: 'レーザの往復時間から、一点ずつ距離を測っている。' },
  { id: 'grain', ok: () => S.grainSel != null, text: '予定していた量の約54倍が、地球に戻った。' },
];
let discCool = 0;
function checkDiscoveries(ctx) {
  if (S.clock < discCool) return;
  for (const d of DISC) {
    if (S.log.disc.has(d.id)) continue;
    if (d.ok(ctx)) { S.log.disc.add(d.id); S.__T = ctx.T; ui.discover(typeof d.text === 'function' ? d.text() : d.text); discCool = S.clock + 7; return; }
  }
  // 名前のある地形
  if (ctx.near && S.cam.mode !== undefined && ctx.camDist < 1900) {
    for (const f of FEATURES) {
      if (f.k === 'ridge' || S.log.disc.has('f:' + f.en)) continue;
      const P = surfacePoint(f.lat, f.lon); const e = ctx.eyeBody;
      const ang = Math.acos(clamp(v3.dot(v3.norm(P), v3.norm(e)), -1, 1)); const arc = ang * v3.len(P);
      if (arc < Math.max(f.d * 0.55, 60) && ctx.altitude < 1500) { S.log.disc.add('f:' + f.en); ui.discover(`${f.n}。${f.note}`); discCool = S.clock + 7; return; }
    }
  }
}

// ------------------------------------------------------------------ メインループ
let last = performance.now(), acc = 0, fpsN = 0, fpsT = 0, fps = 60;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.1); last = now; S.clock += dt;
  fpsN++; fpsT += dt; if (fpsT > 0.5) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
  // 時間を進める
  if (S.speed && S.started !== undefined) {
    S.t += dt * S.speed;
    if (S.view === 'near' && S.t > NEAR_T1) { S.t = NEAR_T1; setView('far'); S.speed = Math.min(S.speed, 864000); }
    if (S.t > T_MAX) { S.t = T_MAX; S.speed = 0; ui.syncPlay(); }
    if (S.mode === 2 && S.view === 'near' && S.t > UTC(2018, 9, 8)) { S.speed = 0; ui.syncPlay(); }
  }
  const t = S.t, st = eph.state(t);
  const e = eph.bodyToEcl(t);
  const sun = m3.applyT(e.b2e, eph.sunDirEcl(t));
  const bag = { fps, W: e.W };
  S.sunBody = sun;
  if (S.view === 'near') {
    const pose = computePose(t, dt);
    const alt = v3.len(pose.eye) - scene.surfaceRadius(v3.norm(pose.eye));
    // 探査機(固定座標へ)
    let craft = null, craftAlt = null;
    const pr = eph.prox(t);
    if (pr) {
      const p = m3.applyT(e.b2e, pr);
      const z = v3.norm(m3.applyT(e.b2e, v3.norm(v3.sub(st.earth, st.ryugu))));    // +Z: 地球方向(HPの姿勢)
      let x = v3.sub(sun, v3.mul(z, v3.dot(sun, z))); x = v3.len(x) < 1e-3 ? [1, 0, 0] : v3.norm(x);
      craft = { p, x, y: v3.cross(z, x), z };
      craftAlt = v3.len(p) - scene.surfaceRadius(v3.norm(p));
    }
    // 目印: 選択点と3つの地点
    const mk = scene.mark, mr = scene.markR; mr.fill(0);
    if (S.selected) { mk.set(S.selected.p, 0); mr[0] = clamp(pose && S.camT.dist * 0.018, 1.2, 22); }
    let i = 1; for (const k of ['td1', 'sci', 'td2']) { const P = surfacePoint(SITES[k].lat, SITES[k].lon); mk.set(P, i * 3); mr[i] = clamp(S.camT.dist * 0.014, 3, 30); i++; }
    // 試料の場面
    let siteInfo = null; S.grains = [];
    if (S.mode === 3) {
      const key = S.t < UTC(2019, 5, 1) ? 'td1' : 'td2'; const sd = SITES[key]; const P = surfacePoint(sd.lat, sd.lon); const f = siteFrame(P);
      siteInfo = { p: P, n: f.n, t1: f.t1, t2: f.t2 };
      const list = sd.grains, ang = (S.clock * 0.04);
      S.grains = list.map((id, k) => {
        const a = k / list.length * Math.PI * 2 + 0.7 + Math.sin(S.clock * 0.3 + k) * 0.08, r = 2.2 + k * 0.9 + Math.cos(S.clock * 0.2 + k * 2) * 0.25, h = 1.4 + 0.5 * Math.sin(S.clock * 0.5 + k * 1.7);
        const p = v3.add(v3.add(P, v3.add(v3.mul(f.t1, Math.cos(a) * r), v3.mul(f.t2, Math.sin(a) * r))), v3.mul(f.n, 0.2 + h));
        return { id, p, sel: S.grainSel === id };
      });
    }
    const lidarT = clamp(t - scene.lidar.t0, -1, 1e9);
    scene.drawNear({ pose, sun, altitude: Math.max(alt, 2), mode: S.mode, sunAU: eph.sunAU(t), e2b: m3.T(e.b2e), clock: S.clock, lidarT, craft, site: siteInfo, grains: S.grains });
    // 描画後の情報
    bag.eye = pose.eye; bag.alt = alt; bag.craft = craft; bag.craftAlt = craftAlt;
    if ((acc += dt) > 0.25) {
      acc = 0;
      // 選択点・カメラ直下の温度
      let probe = S.selected ? S.selected.p : (S.cam.mode === 'site' ? S.cam.site.p : v3.mul(v3.norm(pose.eye), scene.surfaceRadius(v3.norm(pose.eye))));
      const T = S.mode === 1 || true ? tempAt(probe, t) : null;
      let nearSite = null, camSite = Infinity; for (const k of ['td1', 'sci', 'td2']) { const d = v3.len(v3.sub(pose.eye, surfacePoint(SITES[k].lat, SITES[k].lon))); if (d < camSite) { camSite = d; nearSite = k; } }
      const ctx = { near: true, T: T && T.T, sunUp: T && T.sunUp, nearSite: camSite < 500 ? nearSite : null, camDist: camSite, craftAlt, altitude: alt, eyeBody: pose.eye };
      if (S.started) checkDiscoveries(ctx);
      bag.T = T; bag.probe = probe;
      // 滞在の記録
      if (S.started && S.cam.mode === 'site') { const key = `${Math.round(S.cam.site.lat / 5) * 5},${Math.round(S.cam.site.lon / 10) * 10}`; S.log.dwell[key] = (S.log.dwell[key] || 0) + 0.25; }
      S.log.instr[MODES[S.mode]] += 0.25;
      ui.update(bag, st, e);
      if ((urlTimer += 0.25) > 1.5) { urlTimer = 0; if (S.started) writeUrl(); }
    }
    ui.labels(pose);
  } else {
    // 太陽系ビュー: ズームが近いほど、探査機(または地球)へ注目点を寄せる
    const fc = S.farCam, ft = S.farT; const k = 1 - Math.exp(-dt * 6);
    fc.az += (ft.az - fc.az) * k; fc.el += (ft.el - fc.el) * k; fc.dist *= Math.exp((Math.log(ft.dist) - Math.log(fc.dist)) * k);
    if (!S.farHold && !S.started === false) ft.az += dt * 0.012;
    const focus = st.craft || st.ryugu; const w = 1 - smooth(0.25, 1.6, fc.dist);
    fc.target = v3.mul(focus, w);
    scene.drawFar({ farCam: fc, t });
    if ((acc += dt) > 0.25) { acc = 0; ui.update(bag, st, e); S.log.instr.onc += 0.25; if ((urlTimer += 0.25) > 1.5) { urlTimer = 0; if (S.started) writeUrl(); } }
    ui.farLabels(st);
  }
  ui.frame(dt);
}
bindInput();
export { S, eph, jumpTo, setMode, start, flyOrbit, flySite, surfacePoint, tempAt, select, selectGrain, nearestVertexNormal, onc, siteFrame, NEAR_T0, NEAR_T1, setView, MODES };
boot().catch((e) => { console.error(e); document.body.classList.add('failed'); const m = $('#fail'); if (m) { m.hidden = false; m.querySelector('p').textContent = String(e.message || e); } });
