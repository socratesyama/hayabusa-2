import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Terrain } from './terrain';
import { Rocks } from './rocks';
import { Clock, Sun, utcToEt, fmtJST, jstDate, jstMs, T_MIN } from './time';
import { getJSON, loadGravity, loadSc, scAtG, GRADE_LABEL, GRADE_LABEL_EN, HeightMap, loadRegistry, url, Gravity, ScTable } from './data';
import { sampleGravity } from './gravity';
import { V3, v3, geoToBody, bodyToGeo, bodyToThree, fmtLat, fmtLon, R_MEAN, DEG, hash2, surfDist } from './geo';
import { launch, advance, bodyOf, velBodyOf, isEscape, altitude, Orbit, OMEGA_763 } from './physics';
import { skyFor, applySky, Layer, PAPER } from './sky';
import { setRegistry, credit, mark } from './credits';
import { t, lang } from './i18n';
import { Hud, Hint, Card, Viewer, Intro, pickMode, tierText, Mode, esc } from './ui';
import { nearby, quizzesFor, World, Poi } from './search';
import { Sound } from './audio';
import { exportSession, Session } from './archive';
import { MascotReplay, MascotData, SITE, T_SEP, T_END } from './mascot';
import { Library } from './library';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 6000); scene.add(camera);
const hud = new Hud(), hint = new Hint(), card = new Card(), viewer = new Viewer(), sound = new Sound(); const library = new Library();
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------------- state
let layer: Layer = 'walk'; let mode: Mode = 1;
const EYE = 1.5, WALK = 1.4, DASH = 5.0, HOP_H = 0.8, HOP_D = 2.0, HOP_T = 0.6, JUMP_V = 0.30;
const P = { dir: geoToBody(4.3, 206.47, 1) as V3, fwd: [0, 0, 1] as V3, pitch: 0, stand: 0, hop: -1, hopFrom: 0, hopTo: 0, hopDir0: [0, 0, 0] as V3, hopDir1: [0, 0, 0] as V3, dip: 0 };
let orbit: Orbit | null = null; let pastMode = false;
const keys = new Set<string>(); let lastInput = performance.now(); const used = new Set<string>(); const hintShown: Record<string, number> = {};
const session: Session = { callsign: '', start: new Date().toISOString(), track: [], inspected: new Set(), quiz: [] };
let world: World; let G763!: Gravity, G340!: Gravity, G: Gravity; let sc!: ScTable; let sun!: Sun; let hm!: HeightMap; let terrain!: Terrain; let rocks!: Rocks; let mascot!: MascotReplay;
let timeline: any; const clock = new Clock(Date.now()); let lastDay = ''; let dayEvent = ''; let ready = false; let rotation: any;
let sunLight!: THREE.DirectionalLight; let burst!: THREE.Points; let scMesh: THREE.Object3D | null = null; let scDot!: THREE.Mesh; let starPts!: THREE.Points; let sunDot!: THREE.Mesh; let sunGlow!: THREE.Sprite; let shadow!: THREE.Mesh; let markers!: THREE.Group; let mascotMarker!: THREE.Mesh;
let nearHits: ReturnType<typeof nearby> = []; let mascotImg: HTMLImageElement | null = null; let mascotImgId = '';

function tr(p: V3) { const q = bodyToThree(p); return new THREE.Vector3(q[0], q[1], q[2]); }
function lookAt(from: V3, fwd: V3, up: V3, pitch: number) {
  const f = v3.norm(v3.sub(fwd, v3.mul(up, v3.dot(fwd, up)))); const r = v3.cross(f, up); const fp = v3.add(v3.mul(f, Math.cos(pitch)), v3.mul(up, Math.sin(pitch)));
  camera.position.copy(tr(from)); camera.up.copy(tr(up)); camera.lookAt(tr(v3.add(from, fp)));
}

// ---------------- ground (§4.2): rocks -> displacement patch -> collision mesh -> heightmap, highest wins
function groundAt(dir: V3): number { const base = terrain.groundRadius(dir); const pr = terrain.patchRadius(dir); const rt = rocks.topAt(v3.mul(dir, base)); return Math.max(base, pr ?? -Infinity, rt); }
function upAt(dir: V3, lat: number, lon: number): V3 { const g = sampleGravity(G, lat, lon); return v3.norm(v3.mul(g.g, -1)); }

// ---------------- init
async function boot() {
  Intro.line('2018-03-01'); const dot = document.createElement('div'); dot.style.cssText = 'width:2px;height:2px;border-radius:50%;background:#F0F0EB;margin-top:18px;transition:all 1.2s cubic-bezier(.16,1,.3,1)'; $('intro').appendChild(dot);
  const bump = (px: number) => { dot.style.width = dot.style.height = px + 'px'; dot.style.boxShadow = `0 0 ${px}px rgba(240,240,235,.5)`; };
  bump(4);
  const [reg, rot, sunT, hmap, g763, g340, scT, tl, poi, ev, locmap, samples, quizzes, mis, mis_c, gal, l2c, geo, mascam, mara, mag, mpos, sp] = await Promise.all([
    loadRegistry(), getJSON('data/rotation.json'), getJSON('data/sun_table.json'), HeightMap.load(), loadGravity('763'), loadGravity('340'), loadSc(), getJSON('data/timeline.json'),
    getJSON('data/poi_master.json'), getJSON('data/event_asset_links.json'), getJSON('data/image_location_map.json'), getJSON('data/samples_metadata.json'),
    getJSON('data/edu/quizzes.json'), getJSON('data/edu/mission_scenarios.json'), getJSON('data/edu/misconceptions.json'),
    getJSON('data/gallery_manifest.json'), getJSON('data/l2c_manifest.json'), getJSON('data/image_geometry.json'), getJSON('data/mascam_manifest.json'),
    getJSON('data/mara.json'), getJSON('data/mag.json'), getJSON('data/mascot_position.json'), getJSON('data/ryugu_surface_points.json')]);
  bump(10);
  setRegistry(reg); rotation = rot; sun = new Sun(sunT, rot); hm = hmap; G763 = g763; G340 = g340; G = G763; sc = scT; timeline = tl;
  const evMap = new Map<string, any>(); for (const e of locmap.event_level_map) evMap.set(e.gallery_folder, e);
  const gl = gal.images.map((g: any) => { const e = evMap.get(g.folder); return { id: g.id, folder: g.folder, lat: e?.target_latitude_deg ?? null, lon: e?.target_longitude_deg ?? null, date: e?.date_utc ?? '', event: e?.event ?? '' }; });
  const geoMap = new Map<string, any>(geo.images.map((x: any) => [x.file, x])); const l2cs = l2c.images.map((x: any) => { const g = geoMap.get(x.id); return { ...x, lat: g?.center_lat, lon: g?.center_lon }; });
  const iauPois = (sp.iau_named_features ?? []).filter((f: any) => !poi.poi.some((p: any) => (p.name_en ?? '').toLowerCase().includes(f.name.toLowerCase()) || (p.name_ja ?? '').includes(f.name))).map((f: any) => ({
    id: 'iau_' + f.name.toLowerCase().replace(/[^a-z]/g, ''), type: 'iau_feature', name_ja: f.name, name_en: f.name,
    lat: f.latitude_deg, lon: f.longitude_deg, latitude_deg: f.latitude_deg, longitude_deg: f.longitude_deg,
    description: `${f.type === 'Crater' ? 'クレーター' : f.type === 'Dorsum' ? '尾根(ドルスム)' : f.type === 'Fossa' ? '溝(フォッサ)' : f.type === 'Saxum' ? '岩塊(サクスム)' : f.type}　直径/長さ ${f.diameter_km}km　(IAU承認 ${f.approved})`,
    accuracy: `IAU公認の地形名（USGS Gazetteer）。座標は度単位の概略位置。`, nickname: '',
    sources: [{ label: 'USGS Astrogeology: Ryugu Nomenclature', url: 'https://planetarynames.wr.usgs.gov/SearchResults?Target=Ryugu' }] }));
  world = { pois: [...poi.poi.map((p: any) => ({ ...p, lat: p.latitude_deg, lon: p.longitude_deg })), ...iauPois], events: ev.events, gallery: gl, l2c: l2cs, samples, quizzes: quizzes.quizzes };
  (world as any).missions = mis.scenarios; (world as any).misc = mis_c.misconceptions;
  terrain = new Terrain(renderer); await terrain.init(hm); scene.add(terrain.group);
  rocks = new Rocks(hm); scene.add(rocks.group);
  mascot = new MascotReplay({ pos: mpos, imgs: mascam.images, mara, mag } as MascotData);
  library.init().then(() => library.attach(gl, l2cs, mascam.images, samples, sp, locmap)).catch(e => console.warn('library', e));
  buildExtras(); buildDust(); bump(30);
  const loader = new GLTFLoader(); try { const gl2 = await loader.loadAsync(url('assets/hayabusa2_spacecraft.glb')); scMesh = gl2.scene; scMesh.visible = false; scene.add(scMesh); } catch (e) { console.warn('glb', e); }
  clock.tMax = Date.now(); ready = true; $('intro').querySelectorAll('.line').forEach(() => 0);
}

function buildExtras() {
  // star field: varied size / brightness / colour temperature, round soft points (was: uniform 1.6 px white dots)
  const sg = new THREE.BufferGeometry(); const N = 2600; const a = new Float32Array(N * 3), sz = new Float32Array(N), br = new Float32Array(N), cl = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = hash2(i, 1, 99) * 2 - 1, p = hash2(i, 2, 99) * Math.PI * 2, s = Math.sqrt(1 - u * u);
    a[i * 3] = s * Math.cos(p) * 4000; a[i * 3 + 1] = u * 4000; a[i * 3 + 2] = s * Math.sin(p) * 4000;
    const m = Math.pow(hash2(i, 3, 99), 3.2);                 // few bright, many faint
    sz[i] = 0.8 + m * 2.6; br[i] = 0.18 + 0.82 * m;
    const tp = hash2(i, 4, 99), w = hash2(i, 5, 99) * 0.55;   // slight colour-temperature spread
    if (tp < 0.5) { cl[i * 3] = 1 - 0.18 * w; cl[i * 3 + 1] = 1 - 0.05 * w; cl[i * 3 + 2] = 1; }
    else { cl[i * 3] = 1; cl[i * 3 + 1] = 1 - 0.10 * w; cl[i * 3 + 2] = 1 - 0.22 * w; }
  }
  sg.setAttribute('position', new THREE.BufferAttribute(a, 3)); sg.setAttribute('size', new THREE.BufferAttribute(sz, 1)); sg.setAttribute('bri', new THREE.BufferAttribute(br, 1)); sg.setAttribute('tint', new THREE.BufferAttribute(cl, 3));
  starPts = new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms: { uPr: { value: Math.min(devicePixelRatio, 2) } },
    vertexShader: `attribute float size; attribute float bri; attribute vec3 tint; uniform float uPr; varying float vB; varying vec3 vT;
      void main(){ vB=bri; vT=tint; gl_PointSize=size*uPr; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `precision highp float; varying float vB; varying vec3 vT;
      void main(){ float d=length(gl_PointCoord-0.5); float al=smoothstep(0.5,0.12,d)*vB; gl_FragColor=vec4(vT*al,al); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  })); scene.add(starPts);
  sunDot = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 8), new THREE.MeshBasicMaterial({ color: 0xFFF6E8 })); scene.add(sunDot);
  // sun glare (additive sprite) — visible whenever the sky is black and the sun is above the local horizon
  const gc = document.createElement('canvas'); gc.width = gc.height = 256; const g2 = gc.getContext('2d')!;
  const grd = g2.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,250,240,1)'); grd.addColorStop(0.12, 'rgba(255,246,228,0.55)'); grd.addColorStop(0.35, 'rgba(255,240,210,0.16)'); grd.addColorStop(1, 'rgba(255,240,210,0)');
  g2.fillStyle = grd; g2.fillRect(0, 0, 256, 256);
  sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sunGlow.scale.set(900, 900, 1); scene.add(sunGlow);
  shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false })); scene.add(shadow);
  scDot = new THREE.Mesh(new THREE.SphereGeometry(1.2, 6, 4), new THREE.MeshBasicMaterial({ color: 0xE8A33D })); scDot.visible = false; scene.add(scDot);
  sunLight = new THREE.DirectionalLight(0xffffff, 3.2); scene.add(sunLight);   // spacecraft only (terrain/rocks use their own N.L shader; no ambient anywhere)
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(90 * 3), 3));
  burst = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0x9a948c, size: 3, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false })); burst.frustumCulled = false; burst.visible = false; scene.add(burst);
  markers = new THREE.Group(); scene.add(markers);
  const mat = new THREE.MeshBasicMaterial({ color: 0xE8A33D, transparent: true, opacity: 0.85 });
  for (const p of world.pois) if (p.lat != null && p.lon != null) { const base = hm.radius(p.lat, p.lon); const d = geoToBody(p.lat, p.lon, 1);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 6), mat); const pos = tr(v3.mul(d, base + 3)); line.position.copy(pos); line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tr(d).normalize()); line.userData.poi = p.id; markers.add(line); }
  mascotMarker = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat); mascotMarker.visible = false; scene.add(mascotMarker);
  const r = hm.radius(SITE.lat, SITE.lon); mascotMarker.position.copy(tr(geoToBody(SITE.lat, SITE.lon, r + 0.15)));
  // mission markers (§4.10): the markers ARE the mission. First one appears at the player's feet once the callsign is assigned.
  const missions: any[] = (world as any).missions || []; if (missions[0]) for (const id of missions[0].route_pois) { const p = world.pois.find(x => x.id === id); if (p && p.lat != null) {
    const m2 = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), mat); m2.position.copy(tr(geoToBody(p.lat, p.lon!, hm.radius(p.lat, p.lon!) + 0.4))); markers.add(m2); } }
}

// ---------------- sim step
function sunNow() { const et = utcToEt(clock.ms); return { et, ...sun.sunBody(et) }; }
function eyeUp(dir: V3) { const g = bodyToGeo(dir); return upAt(dir, g.lat, g.lon); }
function moveOnSurface(dist: number, side: number): V3 {
  const up = v3.norm(P.dir); const fwd = v3.norm(v3.sub(P.fwd, v3.mul(up, v3.dot(P.fwd, up)))); const right = v3.cross(fwd, up);
  const mv = v3.add(v3.mul(fwd, dist), v3.mul(right, side)); const nd = v3.norm(v3.add(P.dir, v3.mul(mv, 1 / Math.max(300, ground0()))));
  return nd;
}
const ground0 = () => R_MEAN;
function slopeFactor(deg: number) { return deg >= 35 ? 0 : deg <= 0 ? 1 : deg <= 30 ? 1 - 0.4 * deg / 30 : 0.6 - 0.12 * (deg - 30); }

let dashing = false; let flightTarget = 0;
let farHinted = false;
function startPhysics(velB: V3, why: string) {
  const g0 = groundAt(P.dir); const posB = v3.mul(P.dir, g0 + 0.02); const et = utcToEt(clock.ms);
  orbit = launch(posB, velB, et, G.meta.gm_effective_m3s2, 2 * Math.PI / (G.meta.period_h * 3600)); layer = 'ballistic'; used.add('phys'); P.hop = -1; farHinted = false;
  hud.announce(why);
  hint.show('飛行中 — Q: 地表に戻る / ホイール: 時間の早送り（弾道は実時間で進みます）', false, 7000);
}
/** return to the surface from ballistic flight / orbit (presentation shortcut; the sub-player point) */
function returnToSurface() {
  if (layer !== 'ballistic' && layer !== 'orbit') return;
  const d = v3.norm(orbit ? bodyOf(orbit) : P.dir);
  P.dir = d; P.stand = groundAt(d); orbit = null; layer = 'walk'; P.dip = 0.2;
  hint.show('地表に戻りました（演出）', false, 3000);
}
function stepWalk(dt: number) {
  const g = bodyToGeo(P.dir); const gs = sampleGravity(G, g.lat, g.lon);
  let f = 0, s = 0; if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  dashing = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && f > 0 && !keys.has('Space');
  if (joy.active) { f += -joy.y; s += joy.x; dashing = Math.hypot(joy.x, joy.y) > 0.95; }
  const len = Math.hypot(f, s); if (len > 0) {
    f /= Math.max(1, len); s /= Math.max(1, len); used.add('walk'); const spd = (dashing ? DASH : WALK) * slopeFactor(gs.slope); const nd = moveOnSurface(f * spd * dt, s * spd * dt);
    const ng = groundAt(nd), cur = P.stand; const rise = ng - cur; const ns = sampleGravity(G, bodyToGeo(nd).lat, bodyToGeo(nd).lon);
    if (rise > 0.4 || ns.slope >= 35) { /* wall / too steep: stop */ }
    else if (dashing && rise < -1.0) { // cliff edge while dashing -> physics layer with the real running speed (§4.2 b)
      P.dir = nd; const fw = v3.norm(v3.sub(P.fwd, v3.mul(P.dir, v3.dot(P.fwd, P.dir)))); P.stand = ng; startPhysics(v3.mul(fw, DASH), 'cliff'); return; }
    else { P.dir = nd; P.fwd = v3.norm(v3.sub(P.fwd, v3.mul(P.dir, v3.dot(P.fwd, P.dir)))); if (Math.floor(performance.now() / 500) !== stepTick) { stepTick = Math.floor(performance.now() / 500); sound.step(300); } }
  }
  // hop (演出): 0.8 m / 2 m / 0.6 s, completes inside the presentation layer
  if (P.hop >= 0) { P.hop += dt / HOP_T; if (P.hop >= 1) { P.hop = -1; P.dir = P.hopDir1; P.stand = P.hopTo; P.dip = 0.2; kickDust(v3.mul(P.dir, P.stand), v3.norm(P.dir), 0.1); } }
  else { const tg = groundAt(P.dir); if (P.stand > tg) P.stand = Math.max(tg, P.stand - Math.max(2, (P.stand - tg) * 8) * dt); else P.stand = tg; }
  P.dip = Math.max(0, P.dip - dt * 1.2);
}
let stepTick = 0;
function doHop() { if (P.hop >= 0 || layer !== 'walk') return; used.add('hop'); P.hopDir0 = P.dir; const nd = moveOnSurface(HOP_D, 0); P.hopDir1 = nd; P.hopFrom = P.stand; P.hopTo = groundAt(nd); P.hop = 0; }
function doPhysJump() { if (layer !== 'walk') return; const up = v3.norm(P.dir); const mov = keys.has('KeyW') || keys.has('ArrowUp') || (joy.active && joy.y < -0.3); const fw = v3.norm(v3.sub(P.fwd, v3.mul(up, v3.dot(P.fwd, up))));
  startPhysics(mov ? v3.add(v3.mul(fw, DASH), v3.mul(up, JUMP_V)) : v3.mul(up, JUMP_V), mov ? 'dash-jump' : 'jump'); }

function stepFlight(et: number, dt: number) {
  if (!orbit) return; const surf = (b: V3) => groundAt(b);
  if (!(isEscape(orbit)) || true) { // thrust: WASD as micro-acceleration (E)
    const th = 0.004; let tx = 0, ty = 0; if (keys.has('KeyW')) ty += 1; if (keys.has('KeyS')) ty -= 1; if (keys.has('KeyD')) tx += 1; if (keys.has('KeyA')) tx -= 1;
    if (tx || ty) { const b = bodyOf(orbit); const up = v3.norm(b); const fw = v3.norm(v3.sub(P.fwd, v3.mul(up, v3.dot(P.fwd, up)))); const rt = v3.cross(fw, up);
      const ab = v3.add(v3.mul(fw, ty * th), v3.mul(rt, tx * th)); const a = -orbit.omega * (orbit.t - orbit.t0), c = Math.cos(-a), s = Math.sin(-a); const ai: V3 = [c * ab[0] - s * ab[1], s * ab[0] + c * ab[1], ab[2]]; orbit.v = v3.add(orbit.v, v3.mul(ai, dt)); } }
  const hit = advance(orbit, et, surf); const b = bodyOf(orbit); P.dir = v3.norm(b);
  layer = isEscape(orbit) ? 'orbit' : 'ballistic';
  if (!farHinted && v3.len(b) - groundAt(v3.norm(b)) > 1500) { farHinted = true; hint.show('高度が上がっています — Q: 地表に戻る / ホイール: 時間の早送り', false, 6000); }
  if (hit && orbit.landed) {
    const vB = velBodyOf(orbit); const spd = v3.len(vB);
    P.stand = groundAt(P.dir); orbit = null; layer = 'walk'; P.dip = 0.2;
    kickDust(v3.mul(P.dir, P.stand), v3.norm(P.dir), Math.max(0.08, Math.min(1.2, spd)));
  }
}

// ---------------- landing dust (E, 演出): low-gravity ballistic puffs — on Ryugu, kicked regolith flies for metres
const DUST_N = 90; const DUST_G = 0.00013;   // ~ local surface gravity (mm/s² class)
let dust!: THREE.Points; let dustT = -1; let dustP: Float32Array; let dustV: Float32Array; let dustUp: V3 = [0, 0, 1];
function buildDust() {
  const g = new THREE.BufferGeometry(); dustP = new Float32Array(DUST_N * 3); dustV = new Float32Array(DUST_N * 3);
  g.setAttribute('position', new THREE.BufferAttribute(dustP, 3));
  dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8d857c, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
  dust.frustumCulled = false; dust.visible = false; scene.add(dust);
}
function kickDust(pBody: V3, up: V3, speed: number) {
  if (!dust) return; dustUp = v3.norm(up);
  const e1 = v3.norm(v3.cross(dustUp, [0, 0, 1])), e2 = v3.cross(dustUp, e1);
  const pT = bodyToThree(pBody); const uT = bodyToThree(dustUp); const t1 = bodyToThree(e1), t2 = bodyToThree(e2);
  for (let i = 0; i < DUST_N; i++) {
    const az = hash2(i, 1, 77) * Math.PI * 2, sp = (0.15 + hash2(i, 2, 77) * 0.85) * speed, vu = (0.05 + hash2(i, 3, 77) * 0.6) * speed;
    dustP[i * 3] = pT[0]; dustP[i * 3 + 1] = pT[1]; dustP[i * 3 + 2] = pT[2];
    dustV[i * 3] = t1[0] * Math.cos(az) * sp + t2[0] * Math.sin(az) * sp + uT[0] * vu;
    dustV[i * 3 + 1] = t1[1] * Math.cos(az) * sp + t2[1] * Math.sin(az) * sp + uT[1] * vu;
    dustV[i * 3 + 2] = t1[2] * Math.cos(az) * sp + t2[2] * Math.sin(az) * sp + uT[2] * vu;
  }
  dustT = 0; dust.visible = true;
}
function stepDust(dt: number) {
  if (dustT < 0 || !dust) return; dustT += dt;
  const u = bodyToThree(dustUp);
  for (let i = 0; i < DUST_N; i++) {
    dustV[i * 3] -= u[0] * DUST_G * dt; dustV[i * 3 + 1] -= u[1] * DUST_G * dt; dustV[i * 3 + 2] -= u[2] * DUST_G * dt;
    dustP[i * 3] += dustV[i * 3] * dt; dustP[i * 3 + 1] += dustV[i * 3 + 1] * dt; dustP[i * 3 + 2] += dustV[i * 3 + 2] * dt;
  }
  (dust.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  (dust.material as THREE.PointsMaterial).opacity = Math.max(0, 0.5 * (1 - dustT / 7));
  if (dustT > 7) { dustT = -1; dust.visible = false; }
}

// ---------------- frame
let prev = performance.now(); let wheelAccum = 0; const bgColor = new THREE.Color();
function frame(now: number) {
  requestAnimationFrame(frame); const dt = Math.min(0.1, (now - prev) / 1000); prev = now; if (!ready) return;
  // time: real time unless in MASCOT replay. Flight is real-time by design (§4.4) — use the wheel to fast-forward.
  if (layer !== 'mascot') clock.tick(dt);
  if (layer === 'td1') { if (clock.ms > TD1_B) { clock.set(TD1_B); clock.running = false; } else if (clock.ms < TD1_A) clock.set(TD1_A); }
  const S = sunNow();
  if (layer === 'walk') { stepWalk(dt); } else if (layer === 'ballistic' || layer === 'orbit') stepFlight(S.et, dt);
  else if (layer === 'mascot') { mascotStep(dt); }
  const gp = bodyToGeo(P.dir); terrain.updatePatch(gp.lat, gp.lon); rocks.update(gp.lat, gp.lon, (d, rb) => terrain.dispAt(d, rb)); rocks.setSun(S.dir);
  // camera
  let eyeB: V3; const upV = layer === 'ballistic' || layer === 'orbit' || layer === 'walk' ? eyeUp(P.dir) : v3.norm(P.dir);
  if (layer === 'ballistic' || layer === 'orbit') { eyeB = orbit ? bodyOf(orbit) : v3.mul(P.dir, groundAt(P.dir) + EYE); }
  else if (layer === 'mascot') { const r = hm.radius(SITE.lat, SITE.lon); eyeB = v3.mul(geoToBody(SITE.lat, SITE.lon, 1), r + 0.1); }
  else { let h = P.stand + EYE - P.dip; if (P.hop >= 0) { const u = P.hop; const base = P.hopFrom + (P.hopTo - P.hopFrom) * u; const arcH = 4 * HOP_H * u * (1 - u); h = base + EYE + arcH; const d = v3.norm(v3.add(v3.mul(P.hopDir0, 1 - u), v3.mul(P.hopDir1, u))); eyeB = v3.mul(d, h); } else eyeB = v3.mul(P.dir, h); }
  lookAt(eyeB!, P.fwd, upV, P.pitch); const cp = camera.position.clone();
  // sky (single source of truth)
  const sElev = v3.dot(S.dir, upV); const mascotDay = layer === 'mascot' && !mascot.isNight();
  const sky = skyFor(layer, sElev, mascotDay); applySky(sky);
  scene.background = sky.white ? bgColor.setHex(PAPER) : bgColor.setHex(0x000000); starPts.visible = !sky.white; starPts.position.copy(cp);
  const sunVis = !sky.white && sElev > 0.02; sunDot.visible = sunVis; sunGlow.visible = sunVis;   // §4.6: no sun in the white sky; hidden below the horizon
  sunDot.position.copy(cp).addScaledVector(tr(S.dir), 3500); sunGlow.position.copy(sunDot.position);
  terrain.setSun(S.dir, cp);
  // player shadow (E): along the sun direction from the player's feet
  const showShadow = layer === 'walk' && sElev > 0.03; shadow.visible = showShadow;
  if (showShadow) { const gr = P.stand; const sd = v3.norm(v3.sub(S.dir, v3.mul(v3.norm(P.dir), v3.dot(S.dir, v3.norm(P.dir))))); const len = Math.min(25, 1.7 / Math.tan(Math.asin(Math.min(1, sElev)))); const c0 = v3.add(v3.mul(P.dir, gr + 0.05), v3.mul(sd, -len / 2));
    shadow.position.copy(tr(c0)); const nT = tr(v3.norm(P.dir)); shadow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nT); const away = tr(sd).negate(); const ang = Math.atan2(away.dot(new THREE.Vector3(0, 1, 0).cross(nT)), away.dot(new THREE.Vector3(1, 0, 0)));
    shadow.rotateZ(ang); shadow.scale.set(len / 1, 0.5 / 0.5, 1); }
  spacecraft(S.et, gp);
  sunLight.position.copy(tr(S.dir).multiplyScalar(100)); sunLight.target.position.copy(cp);
  stepDust(dt);
  if (layer === 'td1') { if (scInfo) camera.lookAt(tr(scInfo.p)); else { camera.lookAt(camera.position.clone().add(tr(v3.norm(P.dir)).multiplyScalar(10))); } }
  td1Burst();
  nearHits = layer === 'walk' ? nearby(world, gp.lat, gp.lon, clock.ms) : [];
  hudUpdate(S, gp, upV); hints(); renderer.render(scene, camera);
  if (layer === 'walk' && now - lastTrack > 5000) { lastTrack = now; session.track.push({ t: new Date(clock.ms).toISOString(), lat: gp.lat, lon: gp.lon, layer }); }
  const m3 = mascot.active ? mascot.tempK() : null; if (sound.on) sound.field(layer === 'mascot' ? 20 : 10, m3);
}
let lastTrack = 0;

function spacecraft(et: number, gp: { lat: number; lon: number }) {
  const r = layer === 'mascot' ? null : scAtG(sc, et); scDot.visible = false; if (scMesh) scMesh.visible = false; scInfo = null;
  if (!r) return; const p = r.p; const eyeP = v3.mul(P.dir, groundAt(P.dir) + EYE); const dist = v3.len(v3.sub(p, eyeP)); const pg = bodyToGeo(p);
  scInfo = { alt: v3.len(p) - hm.radius(pg.lat, pg.lon), dist, lat: pg.lat, lon: pg.lon, grade: r.grade, p };
  if (scMesh && dist < 800) { scMesh.visible = true; scMesh.position.copy(tr(p)); scMesh.scale.setScalar(1);
    // attitude: NO CK kernels -> approximation (D). Model -Z (sampler horn) points at the surface (down); model Y = panel axis.
    const n = tr(v3.norm(p)); scMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); }
  else { scDot.visible = true; scDot.position.copy(tr(p)); scDot.scale.setScalar(Math.max(1, dist / 400)); }
}
let scInfo: { alt: number; dist: number; lat: number; lon: number; grade: number; p: V3 } | null = null;
const compass = (from: { lat: number; lon: number }, to: { lat: number; lon: number }) => { const y = Math.sin((to.lon - from.lon) * DEG) * Math.cos(to.lat * DEG), x = Math.cos(from.lat * DEG) * Math.sin(to.lat * DEG) - Math.sin(from.lat * DEG) * Math.cos(to.lat * DEG) * Math.cos((to.lon - from.lon) * DEG); const b = (Math.atan2(y, x) / DEG + 360) % 360; return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(b / 45) % 8]; };

function hudUpdate(S: { et: number; dir: V3; au: number }, gp: { lat: number; lon: number; r: number }, up: V3) {
  const T = t(); const d = jstDate(clock.ms); if (d !== lastDay) { lastDay = d; const ev = findEvents(d); dayEvent = ev ? ` — ${ev}` : ''; }
  if (layer === 'td1') {
    const gl = scInfo ? (lang === 'ja' ? GRADE_LABEL : GRADE_LABEL_EN)[scInfo.grade] : ''; const atTd = Math.abs(clock.ms - TD1_MS) < 1500;
    hud.set(0, fmtJST(clock.ms).replace(' JST', ':' + String(new Date(clock.ms).getUTCSeconds()).padStart(2, '0') + ' JST') + (atTd ? ' — 接地' : ''));
    hud.set(1, scInfo ? `はやぶさ2 高度 ${scInfo.alt >= 100 ? (scInfo.alt >= 1000 ? (scInfo.alt / 1000).toFixed(2) + 'km' : scInfo.alt.toFixed(0) + 'm') : scInfo.alt.toFixed(1) + 'm'}（中心）　${compass(gp, scInfo)}${gl ? '  [' + gl + ']' : ''}` : `はやぶさ2 ${T.no_data}`);
    hud.set(2, `姿勢は降下方向に合わせた近似${mark('D')}（CKカーネルなし）　ホイール: 10秒　Shift: 60秒　Space: 再生　E: 終了`); return; }
  if (layer === 'mascot') {
    const jst = fmtJST(mascot.t) + ''; hud.set(0, jst.replace(' JST', ':' + String(new Date(mascot.t).getUTCSeconds()).padStart(2, '0') + ' JST')); hud.set(1, mascot.position());
    const mc = library.data?.temp?.mara_comparison; const diffs = mc ? mc.model_K_lat20_ti300.map((m: number, i: number) => m - mc.mara_K[i]) : [];
    const cmp = diffs.length ? `　1D熱伝導モデル${mark('D')}は+${Math.min(...diffs).toFixed(0)}〜+${Math.max(...diffs).toFixed(0)}K高い` : '';
    const pos = mascot.posTopo(); const tk = mascot.tempK(); if (mascot.phase() === 'end') hud.set(2, T.mascot_end); else if (pos && mascot.phase() !== 'surface') { hud.set(2, `高度 ${pos[2].toFixed(1)}m`); } else hud.set(2, tk != null ? `岩温度 ${tk.toFixed(1)}K（MARA BP8-12）${cmp}` : ''); return; }
  hud.set(0, fmtJST(clock.ms) + dayEvent);
  const elev = (layer === 'walk' ? P.stand : gp.r) - R_MEAN; const ll = `${fmtLat(gp.lat)} ${fmtLon(gp.lon)}  ${T.elev} ${Math.round(elev)}m`; hud.set(1, ll);
  let l3: string; if ((layer === 'ballistic' || layer === 'orbit') && orbit) { const a = altitude(orbit, groundAt); const spd = v3.len(velBodyOf(orbit)); l3 = `${layer === 'orbit' ? T.esc_orbit : T.ballistic} ${a > 1000 ? (a / 1000).toFixed(1) + 'km' : a.toFixed(0) + 'm'} 速度 ${(spd * 100).toFixed(1)}cm/s（${T.pm}${mark('D')}）`; }
  else { const gs = sampleGravity(G, gp.lat, gp.lon); l3 = `${T.gravity} ${(gs.gmag * 1000).toFixed(2)}mm/s²  ${T.escape} ${(gs.esc * 100).toFixed(0)}cm/s${G === G340 ? '  [3.40h]' : ''}`; }
  if (scInfo) { const gl = (lang === 'ja' ? GRADE_LABEL : GRADE_LABEL_EN)[scInfo.grade]; l3 += `  はやぶさ2 ${scInfo.alt > 1000 ? (scInfo.alt / 1000).toFixed(1) + 'km' : scInfo.alt.toFixed(0) + 'm'} ${compass(gp, scInfo)}${gl ? ' [' + gl + ']' : ''}`; }
  else if (clock.ms >= Date.UTC(2018, 5, 27) && clock.ms <= Date.UTC(2019, 10, 19)) l3 += `  はやぶさ2 ${T.no_data}`;
  hud.set(2, l3);
}
function findEvents(d: string): string {
  const out: string[] = []; for (const ph of timeline.phases) for (const e of ph.events) if (e.date === d) out.push(e.event); return out[0] ? out[0].slice(0, 28) : ''; }

// ---------------- idle hints (§5.3.1): flight-control comms, only unused features, max 3 times each
const HINT_ORDER: [string, number][] = [['time', 0], ['inspect', 1], ['hop', 2], ['phys', 3], ['dash', 4], ['misc', 5]];
function hints() {
  if (performance.now() - lastInput < 25000 || card.isOpen || viewer.isOpen || layer !== 'walk' || mode < 0 || hintsOff) { return; }
  for (const [k, i] of HINT_ORDER) { if (used.has(k) || (hintShown[k] ?? 0) >= 3) continue; const text = (k === 'inspect' && !nearHits.length) ? null : t().idle[i]; if (!text) continue;
    hint.show(`${session.callsign} — ${text}`); hintShown[k] = (hintShown[k] ?? 0) + 1; lastInput = performance.now() - 15000; return; }
}
let hintsOff = false;
function activity(kind?: string) { lastInput = performance.now(); hint.hide(); if (kind) used.add(kind); }

// ---------------- interaction
const joy = { active: false, x: 0, y: 0 };
function interact() {
  if (card.isOpen) { if (mascotPoi) { enterMascot(); } else card.hide(); return; }
  if (viewer.isOpen) { viewer.close(); return; }
  const h = nearHits[0]; if (!h) return; used.add('inspect');
  if (h.kind === 'poi') openPoi(h.ref as Poi);
  else if (h.kind === 'gallery') { const g = world.gallery.filter(x => x.folder === h.ref.folder); viewer.open(g.map(x => ({ src: url(`assets/gallery/${x.folder}/${x.id}`), caption: `${x.event} ${x.date} ${x.id}`, kind: 'gallery' as const })), Math.max(0, g.findIndex(x => x.id === h.id))); session.inspected.add(h.id); }
  else if (h.kind === 'l2c') { const l = world.l2c.filter(x => x.lat != null); viewer.open(l.map(x => ({ src: url(x.jpg), caption: `ONC l2c ${x.id}`, kind: 'onc' as const })), Math.max(0, l.findIndex(x => x.id === h.id))); session.inspected.add(h.id); }
}
let mascotPoi = false;
function openPoi(p: Poi) {
  session.inspected.add(p.id); const body = mode === 0 ? `${p.nickname ? `<p>${esc(p.nickname)}</p>` : ''}<p>${esc(p.education_hook ?? p.description)}</p>` : mode === 1 ? `<p>${esc(p.description)}</p>` : `<p>${esc(p.description)}</p><p>${esc(p.accuracy ?? '')}</p>`;
  const refs = (mode === 2 && p.sources) ? '<p>' + p.sources.map((s: any) => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)).join(' / ') + '</p>' : '';
  const q = quizzesFor(world, p.id).filter(x => mode === 0 ? x.difficulty === 'elementary' : mode === 1 ? true : x.difficulty === 'advanced' || true)[0];
  mascotPoi = p.id === 'mascot_landing'; let extra = '';
  if (p.id === 'td1') extra = `<p><a href="#" id="td1go">${esc(t().td1_enter)}</a></p>`; if (mascotPoi) extra = `<p><a href="#" id="mgo">${esc(t().mascot_enter)}</a>　(E)</p>`;
  const chamber = p.id === 'td1' ? 'A' : 'C';
  const parts = (p.id === 'td1' || p.id === 'td2') ? (world.samples?.samples ?? []).filter((s: any) => s.chamber === chamber) : [];
  const samp = (p.id === 'td1' || p.id === 'td2') ? `<p>試料: チャンバー${chamber}（${esc((world.samples?.chambers ?? []).find((c: any) => c.chamber === chamber)?.note ?? '')}）</p>${parts.length ? `<p>配布粒子: ${parts.map((s: any) => `<a href="#" class="smp" data-id="${esc(s.id)}">${esc(s.id)}</a>`).join(' ')}</p>` : ''}` : '';
  card.show(p.name_ja, body + refs + samp + extra + (q ? quizHtml(q) : ''), 'poi', p.sources?.[0]?.label);
  card.node.querySelectorAll('.q button').forEach(b => b.addEventListener('click', () => answer(q, +(b as HTMLElement).dataset.i!, b as HTMLElement)));
  document.getElementById('mgo')?.addEventListener('click', e => { e.preventDefault(); enterMascot(); }); document.getElementById('td1go')?.addEventListener('click', e => { e.preventDefault(); enterTd1(); });
  card.node.querySelectorAll('a.smp').forEach(a => a.addEventListener('click', e => { e.preventDefault(); library.showSample({ viewer, card, lat: () => bodyToGeo(P.dir).lat, localHour: () => libLocalHour(), subsolarLat: () => libSubsolarLat() }, (a as HTMLElement).dataset.id!); }));
}
// ---------------- data archive (§4.13): G key / archive button — every dataset reachable
function libLocalHour() { const S = sunNow(); return sun.localTime(S.et, bodyToGeo(P.dir).lon, S.dir); }
function libSubsolarLat() { const S = sunNow(); return Math.asin(Math.max(-1, Math.min(1, S.dir[2]))) / DEG; }
function openLibrary() {
  if (!library.data) { hint.show('データ書庫を読み込み中…', false, 2000); return; }
  used.add('misc'); library.open({ viewer, card, lat: () => bodyToGeo(P.dir).lat, localHour: libLocalHour, subsolarLat: libSubsolarLat });
}
card.onClose = () => { mascotPoi = false; library.close(); };
const quizHtml = (q: any) => `<div class="q"><p>${esc(q.question)}</p>${q.choices.map((c: string, i: number) => `<button data-i="${i}">${i + 1}. ${esc(c)}</button>`).join('')}<p class="ex" style="opacity:.0"></p></div>`;
function answer(q: any, i: number, el: HTMLElement) { const ok = i === q.answer_index; el.classList.add(ok ? 'ok' : 'no'); session.quiz.push({ id: q.id, ok });
  if (ok) { const ex = card.node.querySelector('.ex') as HTMLElement; ex.style.opacity = '1'; ex.textContent = q.explanation; } }

function enterMascot() { card.hide(); layer = 'mascot'; mascot.enter(); clock.running = false; P.pitch = -0.38; hint.show('ホイール: MASCOTの時間を進める / E: 終了', false, 5000); }
const TD1_MS = Date.UTC(2019, 1, 21, 22, 29, 10), TD1_A = Date.UTC(2019, 1, 20, 23, 17, 48), TD1_B = Date.UTC(2019, 1, 22, 3, 0, 0);
const TD1_SITE = { lat: 4.3, lon: 206.47 };
function enterTd1() {
  card.hide(); layer = 'td1'; orbit = null; P.dir = geoToBody(TD1_SITE.lat, TD1_SITE.lon, 1); P.stand = groundAt(P.dir); P.hop = -1;
  clock.running = false; clock.set(Date.UTC(2019, 1, 21, 22, 19, 0)); hint.show('ホイール: 時間（10秒刻み）/ Space: 再生 / E: 終了　22:29:10 UTC（07:29:10 JST）が接地', false, 7000); used.add('time');
}
function exitTd1() { layer = 'walk'; clock.running = true; clock.set(Date.now()); burst.visible = false; P.stand = groundAt(P.dir); }
/** touchdown projectile burst (minimal particles, deterministic). t = seconds since 22:29:10 UTC. Effect only; not data. */
function td1Burst() {
  const dts = (clock.ms - TD1_MS) / 1000; if (layer !== 'td1' || dts < 0 || dts > 8) { burst.visible = false; return; }
  const up = v3.norm(P.dir), base = v3.mul(up, groundAt(P.dir) + 0.05), pa = (burst.geometry.getAttribute('position') as THREE.BufferAttribute);
  const e1 = v3.norm(v3.cross(up, [0, 0, 1])), e2 = v3.cross(up, e1);
  for (let i = 0; i < pa.count; i++) { const az = hash2(i, 1, 41) * Math.PI * 2, sp = 0.15 + hash2(i, 2, 41) * 0.5, vu = 0.1 + hash2(i, 3, 41) * 0.4;
    const q = v3.add(base, v3.add(v3.mul(v3.add(v3.mul(e1, Math.cos(az)), v3.mul(e2, Math.sin(az))), sp * dts), v3.mul(up, vu * dts - 0.5 * 0.0002 * dts * dts))); const th = bodyToThree(q); pa.setXYZ(i, th[0], th[1], th[2]); }
  pa.needsUpdate = true; burst.visible = true; (burst.material as THREE.PointsMaterial).opacity = Math.max(0, 0.9 * (1 - dts / 8));
}
function exitMascot() { mascot.exit(); layer = 'walk'; clock.running = true; clock.set(Date.now()); P.dir = geoToBody(SITE.lat, SITE.lon, 1); P.stand = groundAt(P.dir); P.pitch = 0; mascotMarker.visible = true; (document.getElementById('mascot-img'))?.remove(); mascotImg = null; mascotImgId = ''; }
function mascotStep(dt: number) {
  const im = mascot.imageAt(); const id = im?.img.id ?? '';
  if (id !== mascotImgId) { mascotImgId = id; const old = document.getElementById('mascot-img'); old?.remove(); mascotImg = null;
    if (im) { const e = new Image(); e.id = 'mascot-img'; e.src = url(im.img.png); e.alt = `MASCAM ${im.img.id}`; e.style.cssText = 'position:fixed;inset:12% 18%;margin:auto;max-width:64vw;max-height:76vh;object-fit:contain;opacity:0;transition:opacity .5s;z-index:3;pointer-events:none'; document.body.appendChild(e); requestAnimationFrame(() => e.style.opacity = '1'); mascotImg = e;
      mascotCap(`${im.img.id}${im.img.led ? ' / LED ' + im.img.led : ''}`, true); } else mascotCap('', false); }
  if (mascot.finished && !mascotEnded) { mascotEnded = true; hint.show(t().mascot_end); }
}
let mascotEnded = false;
function mascotCap(text: string, on: boolean) { let c = document.getElementById('mascot-cap'); if (!c) { c = document.createElement('div'); c.id = 'mascot-cap'; c.style.cssText = 'position:fixed;left:0;right:0;bottom:40px;text-align:center;font:11px "IBM Plex Mono",monospace;opacity:.6;z-index:4;color:#F0F0EB'; document.body.appendChild(c); } c.textContent = on ? `${text}　${credit('mascam')}` : ''; }

// ---------------- input
addEventListener('keydown', e => {
  if (!ready) return; activity(); if (viewer.isOpen) { if (e.key === 'ArrowRight') viewer.step(1); else if (e.key === 'ArrowLeft') viewer.step(-1); else if (e.key === 'Escape' || e.code === 'KeyE') viewer.close(); return; }
  if (card.isOpen && /^[1-4]$/.test(e.key)) { (card.node.querySelectorAll('.q button')[+e.key - 1] as HTMLElement)?.click(); return; }
  keys.add(e.code);
  if (e.code === 'KeyE') { if (layer === 'mascot') { exitMascot(); } else if (layer === 'td1') { exitTd1(); } else interact(); }
  if (e.code === 'Space' && layer === 'td1') { e.preventDefault(); clock.running = !clock.running; return; }
  if (e.code === 'Space') { e.preventDefault(); if (e.shiftKey) doPhysJump(); else { doHop(); } }
  if (e.code === 'KeyQ') returnToSurface();
  if (e.code === 'KeyP') { G = G === G340 ? G763 : G340; hint.show(G === G340 ? '過去モード: 自転周期 3.40h（重力表 3.40h）' : '現在: 自転周期 7.63h', false, 3000); }
  if (e.code === 'KeyR') recordNow(); if (e.code === 'KeyS') toggleSound(); if (e.code === 'KeyM') changeMode(); if (e.code === 'KeyG') openLibrary();
  if (e.shiftKey && e.code === 'KeyW') used.add('dash');
});
addEventListener('keyup', e => keys.delete(e.code)); addEventListener('blur', () => keys.clear());
let drag = false, lx = 0, ly = 0;
canvas.addEventListener('mousedown', e => { drag = true; lx = e.clientX; ly = e.clientY; activity(); });
addEventListener('mouseup', () => drag = false);
addEventListener('mousemove', e => { if (!drag) return; look(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY; });
function look(dx: number, dy: number) { const up = v3.norm(P.dir); const a = -dx * 0.004; const f = v3.norm(v3.sub(P.fwd, v3.mul(up, v3.dot(P.fwd, up)))); const r = v3.cross(up, f); P.fwd = v3.norm(v3.add(v3.mul(f, Math.cos(a)), v3.mul(r, Math.sin(a)))); P.pitch = Math.max(-1.4, Math.min(1.4, P.pitch - dy * 0.004)); }
let wheelHinted = false;
canvas.addEventListener('wheel', e => { e.preventDefault(); activity('time'); const dir = Math.sign(e.deltaY) * -1; // wheel up = forward in time
  if (!wheelHinted) { wheelHinted = true; hint.show(t().wheel_note, false, 3000); }
  if (layer === 'mascot') { mascot.scrub(dir * (e.shiftKey ? 3600e3 : 120e3)); return; }
  if (layer === 'td1') { clock.running = false; clock.jump(dir * (e.shiftKey ? 60e3 : 10e3)); clock.set(Math.max(TD1_A, Math.min(TD1_B, clock.ms))); return; }
  clock.running = false; const step = e.shiftKey ? 86400e3 : 3600e3; clock.jump(dir * step); clock.running = true; if (layer === 'ballistic' || layer === 'orbit') { /* flight integrates forward on following frames */ } }, { passive: false });
// touch (passive:false so we can preventDefault — skill: threejs touch events)
const stick = $('stick'), knob = $('knob'); let touchLook = -1, tlx = 0, tly = 0, dateSwipe = -1, dsx = 0;
canvas.addEventListener('touchstart', e => { e.preventDefault(); activity(); for (const tt of Array.from(e.changedTouches)) { if (tt.clientX > innerWidth / 2 && touchLook < 0) { touchLook = tt.identifier; tlx = tt.clientX; tly = tt.clientY; } else if (tt.clientY < 90 && tt.clientX < innerWidth * 0.6) { dateSwipe = tt.identifier; dsx = tt.clientX; } } }, { passive: false });
canvas.addEventListener('touchmove', e => { e.preventDefault(); for (const tt of Array.from(e.changedTouches)) { if (tt.identifier === touchLook) { look(tt.clientX - tlx, tt.clientY - tly); tlx = tt.clientX; tly = tt.clientY; } else if (tt.identifier === dateSwipe) { const dx = tt.clientX - dsx; if (Math.abs(dx) > 16) { clock.jump(Math.sign(dx) * 3600e3); dsx = tt.clientX; used.add('time'); } } } }, { passive: false });
canvas.addEventListener('touchend', e => { for (const tt of Array.from(e.changedTouches)) { if (tt.identifier === touchLook) touchLook = -1; if (tt.identifier === dateSwipe) dateSwipe = -1; } if (!e.touches.length) { /* tap = inspect */ } });
canvas.addEventListener('click', e => { if ((e as any).pointerType === 'touch' || matchMedia('(pointer:coarse)').matches) { if (nearHits.length || card.isOpen || viewer.isOpen) interact(); } });
stick.addEventListener('touchstart', e => { e.preventDefault(); joy.active = true; moveJoy(e.touches[0]); }, { passive: false });
stick.addEventListener('touchmove', e => { e.preventDefault(); moveJoy(e.touches[0]); }, { passive: false });
stick.addEventListener('touchend', () => { joy.active = false; joy.x = joy.y = 0; knob.style.transform = ''; });
function moveJoy(t0: Touch) { const r = stick.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; let x = (t0.clientX - cx) / (r.width / 2), y = (t0.clientY - cy) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } joy.x = x; joy.y = y; knob.style.transform = `translate(${x * 35}px,${y * 35}px)`; }
const hopbtn = $('hopbtn'); let hopTimer = 0;
hopbtn.addEventListener('touchstart', e => { e.preventDefault(); if (layer === 'ballistic' || layer === 'orbit') { returnToSurface(); return; } hopTimer = window.setTimeout(() => { hopTimer = -1; doPhysJump(); }, 600); }, { passive: false });
hopbtn.addEventListener('touchend', e => { e.preventDefault(); if (hopTimer > 0) { clearTimeout(hopTimer); doHop(); } hopTimer = 0; }, { passive: false });
$('viewer').addEventListener('click', () => viewer.close());
$('b-sound').addEventListener('click', toggleSound); $('b-rec').addEventListener('click', recordNow); $('b-mode').addEventListener('click', changeMode); $('b-lib').addEventListener('click', openLibrary);
function toggleSound() { const on = sound.toggle(); $('b-sound').classList.toggle('active', on); if (on) hint.show(t().sound_on, false, 4000); }
function recordNow() { exportSession(session); hint.show(t().rec_saved, false, 2500); }
async function changeMode() { $('intro').style.display = 'flex'; $('intro').classList.remove('off'); $('intro').querySelector('#modes')?.remove(); mode = await pickMode(); Intro.off(); hintsOff = false; }

// ---------------- start-up
(async function main() {
  frameStart();
  try { await boot(); } catch (e) { Intro.line('データの読み込みに失敗しました: ' + String(e) + '（npm run precompute を実行しましたか？）'); return; }
  mode = await pickMode(); document.getElementById('modes')?.remove();
  // callsign + landing
  let n = 0; try { n = +(localStorage.getItem('ryugu_cs') ?? (Math.floor(hash2(Date.now() % 100000, 1, 5) * 9000) + 1000)); localStorage.setItem('ryugu_cs', String(n)); } catch { n = 4242; }
  session.callsign = `HYB2-WALK-${String(n).padStart(4, '0')}`; const T = t(); const g0 = bodyToGeo(P.dir); const up0 = eyeUp(P.dir);
  P.fwd = v3.norm(v3.cross(up0, [1, 0, 0])); P.stand = groundAt(P.dir); Intro.line(T.callsign_fmt(session.callsign, 5)); await new Promise(r => setTimeout(r, 1400)); Intro.off();
  hint.show(matchMedia('(pointer:coarse)').matches ? T.hint_keys_touch : T.hint_keys, true, 20000); setTimeout(() => hint.show(T.m01, true, 10000), 20500);
  lastInput = performance.now();
})();
function frameStart() { requestAnimationFrame(frame); }
// debugging / acceptance hooks (read-only state)
(window as any).__ryugu = { get layer() { return layer; }, get orbit() { return orbit; }, get pois() { return world.pois.map((p: any) => p.id); }, get near() { return nearHits.map((h: any) => h.kind + ':' + h.id); }, setPast(on: boolean) { G = on ? G340 : G763; }, get past() { return G === G340; }, get patch() { return { half: terrain.patchHalf, lat: terrain.pLat, lon: terrain.pLon }; }, get mat() { const pm = (terrain as any).patchMat; return { useD: terrain.mat?.uniforms?.useD?.value, dmap: terrain.mat?.uniforms?.dmap?.value?.uuid ?? null, dmapImg: terrain.mat?.uniforms?.dmap?.value?.image?.width + 'x' + terrain.mat?.uniforms?.dmap?.value?.image?.height, useDpatch: pm?.uniforms?.useD?.value, dmapPatch: pm?.uniforms?.dmap?.value?.uuid ?? null, dmapPatchSame: pm?.uniforms?.dmap?.value === terrain.mat?.uniforms?.dmap?.value, patchVisible: terrain.patch?.visible, patchVerts: terrain.patch?.geometry?.getAttribute('position')?.count }; }, setD(on: boolean) { terrain.mat.uniforms.useD.value = on ? 1 : 0; (terrain as any).patchMat.uniforms.useD.value = on ? 1 : 0; }, setPatch(v: boolean) { terrain.patch.visible = v; }, setMesh(v: boolean) { terrain.mesh.visible = v; } };
