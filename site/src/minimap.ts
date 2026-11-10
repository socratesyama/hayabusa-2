// P2-2 3Dミニマップ — 画面右上に常設のリュウグウ全体図（現在地・視界方向・昼夜表示つき）。
// クリックで拡大モーダル: ドラッグ回転・ズーム・POIマーカー（TD1/TD2/SCI/MASCOT/MINERVA/IAU地形名）、
// 表面クリックで「ここへ移動」（演出E）。メイン renderer に setViewport/setScissor で追描画する。
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { url } from './data';
import { V3, v3, geoToBody, bodyToGeo, threeToBody } from './geo';
import { HeightMap } from './data';
import { Card } from './ui';
import { lang } from './i18n';


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
  private plRadius: number | null = null;   // 現在地のメッシュ実測半径（キャッシュ）
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
    document.getElementById('mm-close')!.addEventListener('click', e => { e.stopPropagation(); this.hideModal(); });
    const m = this.modalEl;
    m.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest('button')) return;   // ボタンではドラッグ/ポインタ捕捉を始めない（捕捉するとclickがボタンに届かず閉じられなかった）
      this.dragging = true; this.dragDist = 0; this.last = [e.clientX, e.clientY]; m.setPointerCapture(e.pointerId); });
    m.addEventListener('pointermove', e => { if (!this.dragging) return; const dx = e.clientX - this.last[0], dy = e.clientY - this.last[1]; this.dragDist += Math.hypot(dx, dy); this.az -= dx * 0.006; this.el = Math.max(-1.4, Math.min(1.4, this.el + dy * 0.005)); this.last = [e.clientX, e.clientY]; });
    const up = () => { this.dragging = false; };
    m.addEventListener('pointerup', up); m.addEventListener('pointercancel', up);
    m.addEventListener('wheel', e => { e.preventDefault(); this.dist = Math.max(700, Math.min(2600, this.dist * (1 + Math.sign(e.deltaY) * 0.12))); }, { passive: false });
    m.addEventListener('click', e => { if (this.dragDist > 6) return; if (e.target === m) this.pick(e as PointerEvent); });
  }

  private async loadMesh() {
    try {
      const parse = async (path: string) => {
        const txt = await (await fetch(url(path))).text();
        const o = new OBJLoader().parse(txt);
        const g = (o.children[0] as THREE.Mesh).geometry as THREE.BufferGeometry;
        const p = g.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i) * 1000, y = p.getY(i) * 1000, z = p.getZ(i) * 1000; p.setXYZ(i, x, z, -y); }
        g.deleteAttribute('normal'); g.deleteAttribute('uv');
        // 頂点を統合してから法線を計算する（統合しないと面ごとの法線になり角ばって見える）
        const mg = mergeVertices(g, 1e-3); mg.computeVertexNormals(); mg.computeBoundingSphere();
        return mg;
      };
      // 5k面を先に出して操作可能にし、展開マップでは49k面へ差し替える。
      const g = await parse('assets/generated/ryugu_lod3_5k.obj');
      this.mesh = new THREE.Mesh(g, this.mat);
      this.globe.add(this.mesh);
      this.repositionMarkers();   // メッシュ実測半径に合わせてマーカーを再配置（浮き防止）
      const hi = await parse('assets/shape/ryugu_shape_spc_49k_v20200323_web.obj');
      const old = this.mesh.geometry; this.mesh.geometry = hi; old.dispose();
      this.repositionMarkers();
    } catch (e) { console.warn('minimap mesh', e); }
  }

  /** lod3メッシュ表面の実際の半径（動径方向にレイキャスト）。ヒットしなければheightmap値 */
  private meshRadius(latDeg: number, lonDeg: number): number | null {
    if (!this.mesh) return null;
    const d = geoToBody(latDeg, lonDeg, 1);
    const dir3 = new THREE.Vector3(d[0], d[2], -d[1]);
    const far = 700;
    this.ray.set(dir3.clone().multiplyScalar(far), dir3.clone().negate());
    (this.ray as any).firstHitOnly = true;
    const h = this.ray.intersectObject(this.mesh, false);
    return h.length ? far - h[0].distance : null;
  }
  /** POIマーカー・現在地をメッシュ表面に密着させる */
  private repositionMarkers() {
    for (const m of this.markers.children as THREE.Object3D[]) {
      const poi = this.pois.find(p => p.id === (m.userData as any).poi);
      if (poi?.lat == null || poi.lon == null) continue;
      const r = this.meshRadius(poi.lat, poi.lon) ?? this.hm.radius(poi.lat, poi.lon);
      const d = geoToBody(poi.lat, poi.lon, r + 14);
      m.position.set(d[0], d[2], -d[1]);
    }
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
    // 現在地・視界マーカー（body固定座標 = グローブと同空間）。メッシュ実測半径に密着
    const lat = this.get.lat(), lon = this.get.lon();
    const r = (this.frameCount % 30 === 0 ? this.meshRadius(lat, lon) : null) ?? this.plRadius ?? this.hm.radius(lat, lon);
    if (this.frameCount % 30 === 0 && r) this.plRadius = r;
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
      // 描画範囲は CSS の #mmap-small の実際の位置に合わせる（CSS を変えても追従する）。WebGL の y 原点は画面下端。
      const rc = this.smallEl.getBoundingClientRect(), cr = this.renderer.domElement.getBoundingClientRect();
      const sw = Math.round(rc.width), sh = Math.round(rc.height);
      if (sw > 0 && sh > 0) {
        const x = Math.round(rc.left - cr.left), y = Math.round(cr.bottom - rc.bottom);
        this.renderer.setViewport(x, y, sw, sh); this.renderer.setScissor(x, y, sw, sh);
        this.camera.aspect = sw / sh; this.camera.updateProjectionMatrix();
        this.renderer.render(this.scene, this.camera);
      }
    }
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);
  }

  showModal() { this.open = true; this.modalEl.style.display = 'block'; this.smallEl.style.display = 'none'; this.card.hide(); }
  hideModal() { this.dragging = false; this.card.hide(); this.open = false; this.modalEl.style.display = 'none'; this.smallEl.style.display = 'block'; }

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
    document.getElementById('mmgo')?.addEventListener('click', ev => { ev.preventDefault(); this.hideModal(); this.card.hide(); this.act.teleport(g.lat, g.lon); });
  }
}
