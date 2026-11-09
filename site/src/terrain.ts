import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { url, HeightMap } from './data';
import { V3, v3, bodyToThree, threeToBody, bodyToGeo, geoToBody, DEG } from './geo';
import { regolithOffset } from './regolith';

const TILE_DIR = 'assets/generated/tiles/01_ONC_v-band_Basemap1';
// Terrain shader: NO ambient light; N.L with a mild Oren-Nayar-like retro term (strong backscatter), no specular (§4.6).
const vert = `varying vec3 vP; varying vec3 vN; void main(){ vP=position; vN=normal; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const frag = `
precision highp float; varying vec3 vP; varying vec3 vN;
uniform sampler2D map; uniform sampler2D nmap; uniform sampler2D dmap; uniform vec3 sunDir; uniform vec3 camPos; uniform float shadowOn; uniform float useNmap; uniform float useD; uniform float dLevels;
// --- MASCAM-derived cm-scale detail (§4.6 stage 4, D): 7-level contrast-preserving atlas ---
// Each level keeps the base grain std; the shader picks the level by screen-space texel density
// (fwidth of the surface uv), so the grain reads as unresolved regolith speckle at any distance.
float dTex(vec2 uv, float level){
  float n = clamp(floor(level), 0.0, dLevels - 1.0);
  // level k occupies x in [k/dLevels, (k+1)/dLevels); uv is world-derived and unbounded —
  // RepeatWrapping tiles each level block, so no clamp (a clamp would freeze the grain to one point)
  vec2 a = vec2((n + uv.x) / dLevels, uv.y);
  // smooth blend between adjacent levels to avoid visible level bands
  float f = clamp(level - n, 0.0, 1.0);
  float n2 = min(n + 1.0, dLevels - 1.0);
  vec2 b = vec2((n2 + uv.x) / dLevels, uv.y);
  return mix(texture2D(dmap, a).r, texture2D(dmap, b).r, f);
}
float dTexG(vec2 uv, float level){
  float n = clamp(floor(level), 0.0, dLevels - 1.0);
  float f = clamp(level - n, 0.0, 1.0);
  float n2 = min(n + 1.0, dLevels - 1.0);
  vec2 a = vec2((n + uv.x) / dLevels, uv.y);
  vec2 b = vec2((n2 + uv.x) / dLevels, uv.y);
  return mix(texture2D(dmap, a).g, texture2D(dmap, b).g, f);
}

const float PI=3.14159265;
vec2 uvOf(vec3 b){ float lon=atan(b.y,b.x); if(lon<0.0) lon+=2.0*PI; float lat=asin(clamp(b.z/length(b),-1.0,1.0)); return vec2(lon/(2.0*PI), 0.5+lat/PI); }
// --- procedural regolith (deterministic value noise; Class E presentation of surface texture) ---
float h31(vec3 p){ p=fract(p*vec3(1031.0,1030.0,1029.0)); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
float vnoise(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm3(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=p*2.13+vec3(19.1,7.7,3.3); a*=0.5; } return s; }
float fbm2(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<2;i++){ s+=a*vnoise(p); p=p*2.13+vec3(19.1,7.7,3.3); a*=0.5; } return s; }
// --- MASCAM-derived cm-scale detail (§4.6 stage 4, D): tangent-plane projected, mirrored-repeat, 2 scales ---
float dmapH(vec2 uv, float level){
  float h1 = dTex(uv, level);                                   // base level: resolved grain
  float h2 = dTex(uv * 0.24 + vec2(0.37, 0.71), min(level, dLevels-1.0));  // ~10 m scale undulation
  return h1 + 0.5 * h2;
}
void main(){
  vec3 b = vec3(vP.x, -vP.z, vP.y);              // three -> body
  vec2 uv = uvOf(b);
  vec3 n = normalize(vN);
  float dist = length(camPos - vP);
  float det = 1.0 - smoothstep(25.0, 110.0, dist);
  if(useNmap>0.5){ vec3 nb = texture2D(nmap, uv).xyz*2.0-1.0; vec3 nt = vec3(nb.x, nb.z, -nb.y); if(length(nb)>0.5) n = normalize(mix(n, normalize(nt), 0.85*(1.0-0.8*det))); }   // near the camera the geometric (patch) normals win
  // near-field regolith detail: albedo mottling + bump, fades out with distance (no far-field aliasing)
  float n0 = 0.5;
  vec2 duvD = vec2(0.0); float haveD = 0.0; float detD = 0.0; float dLvl = 0.0;
  if(det > 0.002){
    vec3 q = vP * 1.7;                            // ~0.6 m base grain
    n0 = fbm3(q);
    float e = 0.35;
    vec3 g = vec3(fbm2(q+vec3(e,0.0,0.0))-n0, fbm2(q+vec3(0.0,e,0.0))-n0, fbm2(q+vec3(0.0,0.0,e))-n0) / e;
    g -= n * dot(g, n);                           // keep the gradient tangent
    n = normalize(n - g * (0.10 * det));          // bump
    // MASCAM grain bump: analytic gradient in a stable east/north tangent frame (continuous everywhere
    // except the poles — the walk site is at 4.3N; no helper-axis switching -> no projection wedges)
    if(useD > 0.5){
      vec3 dirB = normalize(b);
      float lon = atan(dirB.y, dirB.x);
      vec3 eastB = vec3(-sin(lon), cos(lon), 0.0);
      vec3 northB = cross(dirB, eastB);
      vec3 t1 = vec3(eastB.x, eastB.z, -eastB.y);      // body -> three
      vec3 t2 = vec3(northB.x, northB.z, -northB.y);
      duvD = vec2(dot(vP, t1), dot(vP, t2)) / 2.5;
      haveD = 1.0;
      detD = 1.0 - smoothstep(10.0, 45.0, dist);        // pebble-scale grain: visible 2-15 m, gone by ~45 m
      // level choice: 2.5 m tile -> 256 texels; a texel spans 2.5/256 m on the ground.
      // Choose the level whose block size (~2^level * 2 texels) stays >= ~2 screen px.
      float texels = fwidth(duvD.x) * 256.0;            // texels per screen pixel (approx, x only)
      dLvl = clamp(log2(max(texels, 1.0)) - 1.0, 0.0, dLevels - 1.0);
      float e = 1.0 / 256.0;                            // one texel
      float h0 = dmapH(duvD, dLvl);
      float A = 0.03 * det * detD;                      // relief amplitude (m) — dm-scale microtopography
      vec3 g = ((dmapH(duvD + vec2(e, 0.0), dLvl) - h0) * t1 + (dmapH(duvD + vec2(0.0, e), dLvl) - h0) * t2) * (A / (2.5 / 256.0));
      g -= n * dot(g, n);                               // keep the gradient tangent
      n = normalize(n - g);
    }
  }
  vec3 l = normalize(sunDir); vec3 v = normalize(camPos-vP);
  float nl = max(dot(n,l),0.0), nv = max(dot(n,v),0.0);
  // Oren-Nayar (sigma ~0.6): high-roughness diffuse -> backscatter / opposition-like brightening
  float s2=0.36, A=1.0-0.5*s2/(s2+0.33), B=0.45*s2/(s2+0.09);
  float cphi = max(dot(normalize(v-n*nv), normalize(l-n*nl)),0.0);
  float sa = max(acos(nl), acos(nv)), sb = min(acos(nl), acos(nv));
  float on = nl*(A + B*cphi*sin(sa)*tan(sb));
  vec3 alb = texture2D(map, uv).rgb;
  alb = pow(alb, vec3(2.2));
  // mid-scale albedo mottling (always on) + near-field grain and speckle
  alb *= 0.72 + 0.56 * fbm3(vP * 0.045);
  if(det > 0.002){
    alb *= mix(1.0, 0.45 + 1.1 * n0, 0.8 * det);
    alb *= mix(1.0, 0.75 + 0.5 * h31(floor(vP * 14.0)), 0.5 * det);  // pebble speckle
    if(haveD > 0.5) alb *= mix(1.0, 0.65 + 0.70 * dTexG(duvD, dLvl), 0.9 * detD);  // MASCAM pebble grain ~2.5 m scale (level-matched speckle)
    if(haveD > 0.5) alb *= mix(1.0, 0.75 + 0.50 * dTexG(duvD * 4.0 + vec2(0.83, 0.29), dLvl), 0.8 * (1.0 - smoothstep(1.5, 5.0, dist)));  // MASCAM fine grain ~0.6 m scale (very close)
    if(haveD > 0.5) alb *= mix(1.0, 0.78 + 0.44 * dTexG(duvD / 2.8 + vec2(0.61, 0.23), min(dLvl, dLevels - 1.0)), 0.85 * (1.0 - smoothstep(30.0, 120.0, dist)));  // MASCAM mottling ~7 m scale
    if(haveD > 0.5) alb *= mix(1.0, 0.86 + 0.28 * dTexG(duvD / 16.0 + vec2(0.11, 0.53), min(dLvl, dLevels - 1.0)), 0.75 * (1.0 - smoothstep(60.0, 220.0, dist)));  // MASCAM mottling ~8 m scale (bridges to the 22 m procedural mottling)
  }
  vec3 col = alb * vec3(1.0,0.94,0.9) * on * 1.35;   // slight reddish dark grey (Cb-type)
  gl_FragColor = vec4(pow(col, vec3(1.0/2.2)), 1.0);
}`;

export class Terrain {
  group = new THREE.Group(); mat!: THREE.ShaderMaterial; mesh!: THREE.Mesh; collision?: THREE.Mesh; hm!: HeightMap;
  patch!: THREE.Mesh; private patchMat!: THREE.ShaderMaterial; private patchGeo!: THREE.BufferGeometry;
  pLat = 1e9; pLon = 1e9; private patchCenter: V3 = [0, 0, 1]; patchHalf = 0; dLevels = 7;
  private static readonly PATCH_SEG = 128; private static readonly PATCH_SPAN = 80;
  private ray = new THREE.Raycaster(); private tex!: THREE.CanvasTexture; ntex?: THREE.Texture;
  constructor(public renderer: THREE.WebGLRenderer) {}
  async init(hm: HeightMap) {
    this.hm = hm;
    const loader = new OBJLoader();
    const parse = async (p: string, scaleKm = true) => { const o = loader.parse(await (await fetch(url(p))).text()); const g = (o.children[0] as THREE.Mesh).geometry as THREE.BufferGeometry; return g; };
    const toThree = (g: THREE.BufferGeometry) => { // OBJ km body frame -> metres three frame
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) * 1000, y = p.getY(i) * 1000, z = p.getZ(i) * 1000; p.setXYZ(i, x, z, -y); }
      g.deleteAttribute('normal'); g.deleteAttribute('uv');   // uvはシェーダ内でワールド座標から作るので不要
      const mg = mergeVertices(g, 1e-3); mg.computeVertexNormals(); mg.computeBoundingSphere(); return mg; };   // 頂点を統合して法線を滑らかにする（面ごとの法線だと三角形が見える）
    this.tex = new THREE.CanvasTexture(await this.composite(1)); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { map: { value: this.tex }, nmap: { value: null }, dmap: { value: null }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, camPos: { value: new THREE.Vector3() }, shadowOn: { value: 0 }, useNmap: { value: 0 }, useD: { value: 0 }, dLevels: { value: 7 } } });
    this.initPatch();   // after mat: the patch clones it (with polygonOffset) and shares its textures
    // lod3 immediately, then 49k
    const g0 = toThree(await parse('assets/generated/ryugu_lod3_5k.obj')); this.mesh = new THREE.Mesh(g0, this.mat); this.group.add(this.mesh);
    (async () => { try { const g1 = toThree(await parse('assets/shape/ryugu_shape_spc_49k_v20200323_web.obj')); this.mesh.geometry.dispose(); this.mesh.geometry = g1; } catch (e) { console.warn('49k mesh', e); } })();
    (async () => { try { const g = toThree(await parse('assets/generated/ryugu_collision_15k.obj')); this.collision = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ visible: false })); this.group.add(this.collision); } catch (e) { console.warn('collision', e); } })();
    // normal map + finer tiles in background
    new THREE.TextureLoader().load(url('assets/generated/ryugu_normal_2048.png'), (t: any) => { t.colorSpace = THREE.NoColorSpace; t.wrapS = THREE.RepeatWrapping; this.ntex = t; this.mat.uniforms.nmap.value = t; this.mat.uniforms.useNmap.value = 1; this.patchMat.uniforms.nmap.value = t; this.patchMat.uniforms.useNmap.value = 1; });
    // MASCAM cm-scale detail grain (§4.6 stage 4): 7-level contrast-preserving
    // atlas (levels side by side; each level keeps the base grain std so the
    // speckle stays visible at any distance — a normal mip chain would average
    // the pixel-uncorrelated MASCAM grain into mush). Mirrored-repeat = seam-free.
    new THREE.TextureLoader().load(url('assets/generated/ryugu_detail_256.png'), (t: any) => {
      t.colorSpace = THREE.NoColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
      t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
      this.dLevels = Math.max(1, Math.floor((t.image?.width ?? 256) / 256));
      this.mat.uniforms.dmap.value = t; this.mat.uniforms.useD.value = 1; this.mat.uniforms.dLevels.value = this.dLevels;
      this.patchMat.uniforms.dmap.value = t; this.patchMat.uniforms.useD.value = 1; this.patchMat.uniforms.dLevels.value = this.dLevels;
    });
    this.composite(2).then(c => { this.swapTex(c); this.composite(3).then(c3 => this.swapTex(c3)).catch(() => 0); }).catch(() => 0);
  }
  private swapTex(c: HTMLCanvasElement) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; this.tex.dispose(); this.tex = t; this.mat.uniforms.map.value = t; this.patchMat.uniforms.map.value = t; }
  /** composite tiles of zoom z into one canvas (x: 2^(z+1), y: 2^z, 256 px tiles) */
  private async composite(z: number): Promise<HTMLCanvasElement> {
    const nx = 2 ** (z + 1), ny = 2 ** z; const c = document.createElement('canvas'); c.width = nx * 256; c.height = ny * 256; const g = c.getContext('2d')!;
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    await Promise.all(Array.from({ length: nx * ny }, (_, i) => { const x = i % nx, y = Math.floor(i / nx); return new Promise<void>(res => {
      const im = new Image(); im.onload = () => { g.drawImage(im, x * 256, y * 256); res(); }; im.onerror = () => res(); im.src = url(`${TILE_DIR}/${z}/${x}/${y}.jpg`); }); }));
    return c;
  }
  setSun(dirBody: V3, cam: THREE.Vector3) {
    const t = bodyToThree(dirBody); const d = new THREE.Vector3(t[0], t[1], t[2]);
    this.mat.uniforms.sunDir.value.copy(d); this.mat.uniforms.camPos.value.copy(cam);
    if (this.patchMat) { this.patchMat.uniforms.sunDir.value.copy(d); this.patchMat.uniforms.camPos.value.copy(cam); }
  }
  // ---------------- near-field displacement patch (§4.6 stage 2, E演出) ----------------
  /** 30-50 cm fBm relief on a local grid around the player; deterministic; collision-matched via dispAt() */
  private initPatch() {
    const SEG = Terrain.PATCH_SEG, N = SEG + 1;
    this.patchGeo = new THREE.BufferGeometry();
    this.patchGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * N * 3), 3));
    const idx = new Uint32Array(SEG * SEG * 6); let k = 0;
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) { const a = j * N + i; idx[k++] = a; idx[k++] = a + 1; idx[k++] = a + N; idx[k++] = a + 1; idx[k++] = a + N + 1; idx[k++] = a + N; }
    this.patchGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.patchMat = this.mat.clone();   // shares texture objects; uniforms synced in setSun/swapTex
    this.patchMat.polygonOffset = true; this.patchMat.polygonOffsetFactor = -2; this.patchMat.polygonOffsetUnits = -2;
    this.patch = new THREE.Mesh(this.patchGeo, this.patchMat);
    this.patch.frustumCulled = false; this.patch.renderOrder = 0;
    this.group.add(this.patch);
  }
  /** rebuild the patch around (lat, lon) when the player has moved > 4 m */
  updatePatch(latDeg: number, lonDeg: number) {
    const R = 450;
    if (Math.abs(latDeg - this.pLat) * DEG * R < 4 && Math.abs(lonDeg - this.pLon) * DEG * R * Math.max(0.2, Math.cos(latDeg * DEG)) < 4) return;
    this.pLat = latDeg; this.pLon = lonDeg;
    const SEG = Terrain.PATCH_SEG, SPAN = Terrain.PATCH_SPAN, N = SEG + 1;
    this.patchCenter = geoToBody(latDeg, lonDeg, 1); this.patchHalf = (SPAN / 2) / R;
    const la = latDeg * DEG, lo = lonDeg * DEG, cosLa = Math.max(0.15, Math.cos(la));
    const pos = this.patchGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const e = (i / SEG - 0.5) * SPAN, n = (j / SEG - 0.5) * SPAN;
      const la2 = la + n / R, lo2 = lo + e / (R * cosLa);
      const dir: V3 = [Math.cos(la2) * Math.cos(lo2), Math.cos(la2) * Math.sin(lo2), Math.sin(la2)];
      const rBase = this.hm.radius(la2 / DEG, (((lo2 / DEG) % 360) + 360) % 360);
      const d = Math.max(Math.abs(e), Math.abs(n)) / (SPAN / 2);
      const taper = 1 - (d <= 0.75 ? 0 : d >= 1 ? 1 : (d - 0.75) / 0.25 * (2 - (d - 0.75) / 0.25)); // smooth fade at the rim
      const r = rBase + taper * regolithOffset(dir, rBase);
      const p = bodyToThree(v3.mul(dir, r));
      pos.setXYZ(j * N + i, p[0], p[1], p[2]);
    }
    pos.needsUpdate = true;
    this.patchGeo.computeVertexNormals();
    this.patchGeo.computeBoundingSphere();
  }
  /** displaced ground radius at dir (unit, body frame), or null outside the patch */
  patchRadius(dir: V3): number | null {
    if (!this.patchHalf) return null;
    const c = v3.dot(dir, this.patchCenter);   // cos of angular distance from patch centre
    if (c < Math.cos(this.patchHalf * 1.15)) return null;
    const g = bodyToGeo(dir);
    const rBase = this.hm.radius(g.lat, g.lon);
    const a = Math.acos(Math.min(1, c)) / this.patchHalf;   // 0..~1.15
    const taper = a <= 0.75 ? 1 : a >= 1 ? 0 : 1 - (a - 0.75) / 0.25 * (2 - (a - 0.75) / 0.25);
    return rBase + taper * regolithOffset(dir, rBase);
  }
  /** ground offset callback for rock/pebble placement (full relief inside the patch, 0 outside) */
  dispAt(dir: V3, rBase: number): number {
    const p = this.patchRadius(dir);
    return p == null ? 0 : p - rBase;
  }
  /** radius of the collision mesh along the radial direction (m), or null */
  meshRadius(dirBody: V3, near: number): number | null {
    if (!this.collision) return null; const d = bodyToThree(dirBody);
    this.ray.set(new THREE.Vector3(d[0] * (near + 60), d[1] * (near + 60), d[2] * (near + 60)), new THREE.Vector3(-d[0], -d[1], -d[2]));
    (this.ray as any).firstHitOnly = true; const h = this.ray.intersectObject(this.collision, false); return h.length ? near + 60 - h[0].distance : null;
  }
  /** ground radius = max of (collision mesh, heightmap) — rocks are added by caller (§4.2 order) */
  groundRadius(dirBody: V3): number {
    const g = bodyToGeo(dirBody); const hmR = this.hm.radius(g.lat, g.lon); const m = this.meshRadius(dirBody, hmR); return m == null ? hmR : Math.max(hmR, m);
  }
}
export { v3, threeToBody, geoToBody };
