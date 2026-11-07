// P2-2 3Dミニマップ — 画面右上に常設のリュウグウ全体図（現在地・視界方向・昼夜表示つき）。
// クリックで拡大モーダル: ドラッグ回転・ズーム・POIマーカー（TD1/TD2/SCI/MASCOT/MINERVA/IAU地形名）、
// 表面クリックで「ここへ移動」（演出E）。メイン renderer に setViewport/setScissor で追描画する。
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { url } from './data';
import { V3, v3, geoToBody, bodyToGeo, threeToBody } from './geo';
import { HeightMap } from './data';
import { Card } from './ui';
import { lang } from './i18n';

const SMALL = matchMedia('(pointer:coarse)').matches ? 104 : 148;   // 常設ミニマップの一辺 (CSS px)

const vert = `varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP=position; vN=normal; vec4 mv=modelViewMatrix*vec4(position,1.0); vV=-mv.xyz; gl_Position=projectionMatrix*mv; }`;
const frag = `
precision highp float; varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform sampler2D map; uniform vec3 sunDir;
const float PI=3.14159265;
vec2 uvOf(vec3 b){ float lon=atan(b.y,b.x); if(lon<0.0) lon+=2.0*PI; float lat=asin(clamp(b.z/length(b),-1.0,1.0)); return vec2(lon/(2.0*PI), 0.5+lat/PI); }
void main(){
  vec3 n = normalize(vN); vec3 l = normalize(sunDir); vec3 v = normalize(vV);
  float nl = max(dot(n,l), 0.0);
  vec3 alb = pow(texture2D(map, uvOf(vec3(vP.x,-vP.z,vP.y))).rgb, vec3(2.2));
  vec3 col = alb * (0.08 + 1.15*nl);   // 微かな地球光＋太陽直達（昼夜が見える）
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);   // 輪郭光: 黒い宇宙背景でもシルエットが見える
  col += vec3(0.09, 0.09, 0.10) * rim;
  gl_FragColor = vec4(pow(col, vec3(1.0/2.2)), 1.0);
}`;

export interface MiniActions {
  teleport(lat: number, lon: number): void;   // 演出E
  openEventFor(poiId: string): void;          // POIに対応するイベント詳細
  openPoi(poiId: string): void;               // 既存のPOIカード
}

export class MiniMap {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 50, 4000);
  globe = new THREE.Group();
  mat!: THREE.ShaderMaterial;
  mesh?: THREE.Mesh;
  playerDot!: THREE.Mesh;
  viewCone!: THREE.Mesh;
  markers = new THREE.Group();
  open = false;
  private az = 0.6; private el = 0.35; private dist = 1350;    // モーダル視点
  private smallAz = 0.6;                       // 常設視点（ゆっくり公転）
  private dragging = false; private last = [0, 0]; private dragDist = 0;
  private ray = new THREE.Raycaster();
  private frameCount = 0;
  private modalEl: HTMLDivElement;
  private smallEl: HTMLDivElement;

  constructor(private renderer: THREE.WebGLRenderer, private card: Card, private hm: HeightMap, private pois: any[], private act: MiniActions,
    private get: { lat: () => number; lon: () => number; fwd: () => V3; sunDir: () => V3; tex: () => THREE.Texture | undefined; bg: () => THREE.Color }) {
    this.camera.position.set(0, 0, 1350);
    this.scene.add(this.globe);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    this.globe.add(this.markers);
    this.mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { map: { value: null }, sunDir: { value: new THREE.Vector3(1, 0, 0) } } });
    this.loadMesh();
    // 現在地（琥珀の点）+ 視界方向（短い円錐）
    this.playerDot = new THREE.Mesh(new THREE.SphereGeometry(9, 10, 8), new THREE.MeshBasicMaterial({ color: 0xE8A33D }));
    this.playerDot.renderOrder = 2;
    this.globe.add(this.playerDot);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(16, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xE8A33D, transparent: true, opacity: 0.55 }));
    cone.geometry.translate(0, -30, 0);   // 円錐の頭を原点に
    this.viewCone = cone; this.viewCone.renderOrder = 2;
    this.globe.add(this.viewCone);
    this.buildMarkers();
    // DOM: 常設（右上）+ モーダル
    this.smallEl = document.createElement('div');
    this.smallEl.id = 'mmap-small'; this.smallEl.title = lang === 'ja' ? 'リュウグウ全体図を開く' : 'Open globe map';
    document.body.appendChild(this.smallEl);
    this.smallEl.addEventListener('click', () => this.showModal());
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'mmap-full';
    this.modalEl.innerHTML = `<div class="mm-bar"><span>${lang === 'ja' ? 'リュウグウ全体図 — ドラッグ: 回転 / ホイール: ズーム / マーカー・表面クリックで移動' : 'Globe — drag rotate / wheel zoom / click to move'}</span><button id="mm-close" aria-label="閉じる">✕</button></div>`;
    document.body.appendChild(this.modalEl);
    this.modalEl.style.display = 'none';
    document.getElementById('mm-close')!.addEventListener('click', () => this.hideModal());
    const m = this.modalEl;
    m.addEventListener('pointerdown', e => { this.dragging = true; this.dragDist = 0; this.last = [e.clientX, e.clientY]; m.setPointerCapture(e.pointerId); });
    m.addEventListener('pointermove', e => { if (!this.dragging) return; const dx = e.clientX - this.last[0], dy = e.clientY - this.last[1]; this.dragDist += Math.hypot(dx, dy); this.az -= dx * 0.006; this.el = Math.max(-1.4, Math.min(1.4, this.el + dy * 0.005)); this.last = [e.clientX, e.clientY]; });
    const up = () => { this.dragging = false; };
    m.addEventListener('pointerup', up); m.addEventListener('pointercancel', up);
    m.addEventListener('wheel', e => { e.preventDefault(); this.dist = Math.max(700, Math.min(2600, this.dist * (1 + Math.sign(e.deltaY) * 0.12))); }, { passive: false });
    m.addEventListener('click', e => { if (this.dragDist > 6) return; if (e.target === m) this.pick(e as PointerEvent); });
  }

  private async loadMesh() {
    try {
      const txt = await (await fetch(url('assets/generated/ryugu_lod3_5k.obj'))).text();
      const o = new OBJLoader().parse(txt);
      const g = (o.children[0] as THREE.Mesh).geometry as THREE.BufferGeometry;
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) * 1000, y = p.getY(i) * 1000, z = p.getZ(i) * 1000; p.setXYZ(i, x, z, -y); }
      g.deleteAttribute('normal'); g.computeVertexNormals(); g.computeBoundingSphere();
      this.mesh = new THREE.Mesh(g, this.mat);
      this.globe.add(this.mesh);
    } catch (e) { console.warn('minimap mesh', e); }
  }

  /** POIマーカー（ミッション地点 + IAU地形名） */
  private buildMarkers() {
    const geo = new THREE.SphereGeometry(11, 8, 6);
    for (const p of this.pois) {
      if (p.lat == null || p.lon == null) continue;
      const r = this.hm.radius(p.lat, p.lon);
      const d = geoToBody(p.lat, p.lon, r + 14);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: p.type === 'mission_event' ? 0xE8A33D : p.type === 'iau_feature' ? 0x7FB4D9 : 0xC9C4BC }));
      m.position.set(d[0], d[2], -d[1]);
      m.userData.poi = p.id;
      this.markers.add(m);
    }
  }

  private setCam() {
    const s = this.open ? [this.az, this.el, this.dist] : [this.smallAz, 0.42, 1380];
    const [az, el, d] = s;
    this.camera.position.set(d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
    this.camera.lookAt(0, 0, 0);
  }

  /** 毎フレーム: メイン描画後に呼ぶ */
  render(dt: number) {
    this.frameCount++;
    // 注: かつて frameCount%2 で描画を間引いていたが、メイン描画が毎フレーム
    // 全画面をクリアするためスキップフレームでミニマップ領域が空になりチラつく。
    // 5k面の低ポリグローブなので毎フレーム描画しても負荷は軽い。
    const tex = this.get.tex();
    if (tex) this.mat.uniforms.map.value = tex;
    const sd = this.get.sunDir(); this.mat.uniforms.sunDir.value.set(sd[0], sd[1], sd[2]);
    this.scene.background = this.get.bg();   // メインと同じ空色（角の黒ズミ防止）
    // 現在地・視界マーカー（body固定座標 = グローブと同空間）
    const lat = this.get.lat(), lon = this.get.lon();
    const r = this.hm.radius(lat, lon);
    const d = geoToBody(lat, lon, r + 16);
    this.playerDot.position.set(d[0], d[2], -d[1]);
    const fwd = this.get.fwd();
    const up = v3.norm(geoToBody(lat, lon, 1));
    const fh = v3.norm(v3.sub(fwd, v3.mul(up, v3.dot(fwd, up))));   // 接平面へ射影
    const f3 = new THREE.Vector3(fh[0], fh[2], -fh[1]);
    this.viewCone.position.copy(this.playerDot.position);
    // 円錐は apex が原点・-Y 方向へ開くように translate 済み → -Y を fwd 方向へ向ける
    this.viewCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), f3.normalize());
    this.smallAz += dt * 0.07;   // 常設図はゆっくり公転（約90秒/周）
    this.setCam();
    const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
    // three.js の setViewport/setScissor は CSS px 単位（内部で pixelRatio 倍される）
    this.renderer.setScissorTest(true);
    if (this.open) {
      this.renderer.setViewport(0, 0, w, h); this.renderer.setScissor(0, 0, w, h);
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
    } else {
      // WebGLのy原点は画面下端。CSSの #mmap-small は right:16px / top:16px なので一致させる
      const x = Math.round(w - SMALL - 16), y = Math.round(h - SMALL - 16);
      this.renderer.setViewport(x, y, SMALL, SMALL); this.renderer.setScissor(x, y, SMALL, SMALL);
      this.camera.aspect = 1; this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
    }
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);
  }

  showModal() { this.open = true; this.modalEl.style.display = 'block'; this.smallEl.style.display = 'none'; this.card.hide(); }
  hideModal() { this.open = false; this.modalEl.style.display = 'none'; this.smallEl.style.display = 'block'; }

  /** モーダル内クリック: マーカー→POI/イベント、表面→ここへ移動 */
  private pick(e: PointerEvent) {
    if (!this.mesh) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nd = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(nd, this.camera);
    const hits = this.ray.intersectObjects([...this.markers.children, this.mesh], false);
    if (!hits.length) return;
    const h = hits[0];
    const poi = h.object.userData.poi as string | undefined;
    if (poi) { this.act.openPoi(poi); return; }
    // 表面: 緯度経度へ変換し「ここへ移動」パネル
    const b = threeToBody([h.point.x, h.point.y, h.point.z]);
    const g = bodyToGeo(b);
    const ja = lang === 'ja';
    this.card.show(ja ? 'この地点へ移動しますか？' : 'Move here?', `
      <p>${ja ? `緯度 ${g.lat.toFixed(2)}° / 経度 ${g.lon.toFixed(1)}°E` : `lat ${g.lat.toFixed(2)}° / lon ${g.lon.toFixed(1)}°E`}</p>
      <p><a href="#" id="mmgo">${ja ? 'ここへ移動する' : 'Move here'}</a>　<span class="lnote">${ja ? '瞬間移動は演出E' : 'instant move is staging (E)'}</span></p>`);
    document.getElementById('mmgo')?.addEventListener('click', ev => { ev.preventDefault(); this.hideModal(); this.act.teleport(g.lat, g.lon); });
  }
}
