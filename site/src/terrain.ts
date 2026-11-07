import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { url, HeightMap } from './data';
import { V3, v3, bodyToThree, threeToBody, bodyToGeo, geoToBody } from './geo';

const TILE_DIR = 'assets/generated/tiles/01_ONC_v-band_Basemap1';
// Terrain shader: NO ambient light; N.L with a mild Oren-Nayar-like retro term (strong backscatter), no specular (§4.6).
const vert = `varying vec3 vP; varying vec3 vN; void main(){ vP=position; vN=normal; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const frag = `
precision highp float; varying vec3 vP; varying vec3 vN;
uniform sampler2D map; uniform sampler2D nmap; uniform vec3 sunDir; uniform vec3 camPos; uniform float shadowOn; uniform float useNmap;
const float PI=3.14159265;
vec2 uvOf(vec3 b){ float lon=atan(b.y,b.x); if(lon<0.0) lon+=2.0*PI; float lat=asin(clamp(b.z/length(b),-1.0,1.0)); return vec2(lon/(2.0*PI), 0.5+lat/PI); }
void main(){
  vec3 b = vec3(vP.x, -vP.z, vP.y);              // three -> body
  vec2 uv = uvOf(b);
  vec3 n = normalize(vN);
  if(useNmap>0.5){ vec3 nb = texture2D(nmap, uv).xyz*2.0-1.0; vec3 nt = vec3(nb.x, nb.z, -nb.y); if(length(nb)>0.5) n = normalize(mix(n, normalize(nt), 0.85)); }
  vec3 l = normalize(sunDir); vec3 v = normalize(camPos-vP);
  float nl = max(dot(n,l),0.0), nv = max(dot(n,v),0.0);
  // Oren-Nayar (sigma ~0.6): high-roughness diffuse -> backscatter / opposition-like brightening
  float s2=0.36, A=1.0-0.5*s2/(s2+0.33), B=0.45*s2/(s2+0.09);
  float cphi = max(dot(normalize(v-n*nv), normalize(l-n*nl)),0.0);
  float sa = max(acos(nl), acos(nv)), sb = min(acos(nl), acos(nv));
  float on = nl*(A + B*cphi*sin(sa)*tan(sb));
  vec3 alb = texture2D(map, uv).rgb;
  alb = pow(alb, vec3(2.2));
  vec3 col = alb * vec3(1.0,0.94,0.9) * on * 1.35;   // slight reddish dark grey (Cb-type)
  gl_FragColor = vec4(pow(col, vec3(1.0/2.2)), 1.0);
}`;

export class Terrain {
  group = new THREE.Group(); mat!: THREE.ShaderMaterial; mesh!: THREE.Mesh; collision?: THREE.Mesh; hm!: HeightMap;
  private ray = new THREE.Raycaster(); private tex!: THREE.CanvasTexture; ntex?: THREE.Texture;
  constructor(public renderer: THREE.WebGLRenderer) {}
  async init(hm: HeightMap) {
    this.hm = hm;
    const loader = new OBJLoader();
    const parse = async (p: string, scaleKm = true) => { const o = loader.parse(await (await fetch(url(p))).text()); const g = (o.children[0] as THREE.Mesh).geometry as THREE.BufferGeometry; return g; };
    const toThree = (g: THREE.BufferGeometry) => { // OBJ km body frame -> metres three frame
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) * 1000, y = p.getY(i) * 1000, z = p.getZ(i) * 1000; p.setXYZ(i, x, z, -y); }
      g.deleteAttribute('normal'); g.computeVertexNormals(); g.computeBoundingSphere(); return g; };
    this.tex = new THREE.CanvasTexture(await this.composite(1)); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { map: { value: this.tex }, nmap: { value: null }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, camPos: { value: new THREE.Vector3() }, shadowOn: { value: 0 }, useNmap: { value: 0 } } });
    // lod3 immediately, then 49k
    const g0 = toThree(await parse('assets/generated/ryugu_lod3_5k.obj')); this.mesh = new THREE.Mesh(g0, this.mat); this.group.add(this.mesh);
    (async () => { try { const g1 = toThree(await parse('assets/shape/ryugu_shape_spc_49k_v20200323_web.obj')); this.mesh.geometry.dispose(); this.mesh.geometry = g1; } catch (e) { console.warn('49k mesh', e); } })();
    (async () => { try { const g = toThree(await parse('assets/generated/ryugu_collision_15k.obj')); this.collision = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ visible: false })); this.group.add(this.collision); } catch (e) { console.warn('collision', e); } })();
    // normal map + finer tiles in background
    new THREE.TextureLoader().load(url('assets/generated/ryugu_normal_2048.png'), (t: any) => { t.colorSpace = THREE.NoColorSpace; t.wrapS = THREE.RepeatWrapping; this.ntex = t; this.mat.uniforms.nmap.value = t; this.mat.uniforms.useNmap.value = 1; });
    this.composite(2).then(c => { this.swapTex(c); this.composite(3).then(c3 => this.swapTex(c3)).catch(() => 0); }).catch(() => 0);
  }
  private swapTex(c: HTMLCanvasElement) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; this.tex.dispose(); this.tex = t; this.mat.uniforms.map.value = t; }
  /** composite tiles of zoom z into one canvas (x: 2^(z+1), y: 2^z, 256 px tiles) */
  private async composite(z: number): Promise<HTMLCanvasElement> {
    const nx = 2 ** (z + 1), ny = 2 ** z; const c = document.createElement('canvas'); c.width = nx * 256; c.height = ny * 256; const g = c.getContext('2d')!;
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    await Promise.all(Array.from({ length: nx * ny }, (_, i) => { const x = i % nx, y = Math.floor(i / nx); return new Promise<void>(res => {
      const im = new Image(); im.onload = () => { g.drawImage(im, x * 256, y * 256); res(); }; im.onerror = () => res(); im.src = url(`${TILE_DIR}/${z}/${x}/${y}.jpg`); }); }));
    return c;
  }
  setSun(dirBody: V3, cam: THREE.Vector3) { const t = bodyToThree(dirBody); this.mat.uniforms.sunDir.value.set(t[0], t[1], t[2]); this.mat.uniforms.camPos.value.copy(cam); }
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
