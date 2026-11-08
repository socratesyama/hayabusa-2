// §4.6 stage 3: statistical rock scatter (Michikami et al. 2019): size-frequency power law ~ D^-2, b/a=0.71, c/a=0.44, angular.
// Deterministic from position (hash of cell indices) — same place, same rocks, forever (§7.18). Class D.
// v2 (realism pass): 4 displaced shape variants, Oren-Nayar lighting matched to the terrain,
// contact-shadow discs so rocks sit ON the ground, and a small-pebble field near the player.
import * as THREE from 'three';
import { V3, v3, hash2, bodyToThree, geoToBody, bodyToGeo } from './geo';
import type { HeightMap } from './data';
export interface Rock { p: V3; up: V3; a: number; b: number; c: number; rot: number; top: number; tone: number; }
const CELL = 3.0, RADIUS = 30, DMIN = 0.35, DMAX = 4.0;
const NVAR = 4, PER_VAR = 260;           // 4 variants x 260 = 1040 slots (was 900 uniform)
const PEB_CELL = 0.30, PEB_RADIUS = 14, PEB_MAX = 2400;

/** deterministic sine-sum displacement: same input position -> same output, so shared (welded) corners never crack */
function rockGeo(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 2);   // 320 faces: resolved angular facets up close, still low-poly look
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const waves: [number[], number][] = [];
  for (let w = 0; w < 4; w++) {
    const th = hash2(seed, 10 + w, 29) * Math.PI * 2, ph = Math.acos(hash2(seed, 20 + w, 29) * 2 - 1);
    waves.push([[Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)], 2 + Math.floor(hash2(seed, 30 + w, 29) * 4)]);
  }
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 2, y = p.getY(i) * 2, z = p.getZ(i) * 2;   // unit sphere
    let r = 1;
    for (const [d, f] of waves) r += 0.15 * Math.sin((d[0] * x + d[1] * y + d[2] * z) * f + seed);
    p.setXYZ(i, x * 0.5 * r, y * 0.5 * r, z * 0.5 * r);
  }
  g.computeVertexNormals();
  return g;
}

const rockVert = `attribute float tone; varying vec3 vN; varying vec3 vP; varying float vT;
void main(){ vT=tone; vP=position; vN=normalize(mat3(instanceMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.0);} `;
const rockFrag = `precision highp float; uniform vec3 sunDir; uniform vec3 camPos; varying vec3 vN; varying vec3 vP; varying float vT;
void main(){
  vec3 n=normalize(vN); vec3 l=normalize(sunDir); vec3 v=normalize(camPos-vP);
  float nl=max(dot(n,l),0.0), nv=max(dot(n,v),0.0);
  float s2=0.36, A=1.0-0.5*s2/(s2+0.33), B=0.45*s2/(s2+0.09);
  float cphi=max(dot(normalize(v-n*nv), normalize(l-n*nl)),0.0);
  float sa=max(acos(nl),acos(nv)), sb=min(acos(nl),acos(nv));
  float on=nl*(A+B*cphi*sin(sa)*tan(sb));            // Oren-Nayar, matched to the terrain shader
  vec3 alb=vec3(0.052,0.047,0.044)*(0.55+0.9*vT);     // Cb-type dark grey, per-rock tone
  vec3 col=alb*vec3(1.0,0.94,0.9)*on*1.35;
  gl_FragColor=vec4(pow(col,vec3(1.0/2.2)),1.0);
} `;

const shadowVert = `void main(){ gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.0); } `;
const shadowFrag = `precision highp float; uniform float op; varying vec2 vUv2;
void main(){ float d=length(vUv2-0.5)*2.0; float a=(1.0-smoothstep(0.35,1.0,d))*op; gl_FragColor=vec4(0.0,0.0,0.0,a); } `;

export class Rocks {
  group = new THREE.Group();
  list: Rock[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private shadowMesh: THREE.InstancedMesh;
  private pebbleMesh: THREE.InstancedMesh;
  private mat: THREE.ShaderMaterial; private shadowMat: THREE.ShaderMaterial;
  private cx = 1e9; private cy = 1e9; private px = 1e9; private py = 1e9;
  private playerUp: V3 = [0, 0, 1]; private lastElev = 2;
  constructor(private hm: HeightMap) {
    this.mat = new THREE.ShaderMaterial({ vertexShader: rockVert, fragmentShader: rockFrag, uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) }, camPos: { value: new THREE.Vector3() } } });
    const geo0 = rockGeo(1);
    for (let v = 0; v < NVAR; v++) {
      const geo = v === 0 ? geo0 : rockGeo(2 + v * 3);
      const m = new THREE.InstancedMesh(geo, this.mat, PER_VAR);
      m.count = 0; m.frustumCulled = false; m.geometry.setAttribute('tone', new THREE.InstancedBufferAttribute(new Float32Array(PER_VAR), 1));
      this.meshes.push(m); this.group.add(m);
    }
    // contact shadows: soft radial discs, oriented to the local ground, slightly anti-sun offset
    this.shadowMat = new THREE.ShaderMaterial({ vertexShader: `varying vec2 vUv2; void main(){ vUv2=uv; gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.0); } `, fragmentShader: shadowFrag, uniforms: { op: { value: 0.5 } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.shadowMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 18), this.shadowMat, NVAR * PER_VAR);
    this.shadowMesh.count = 0; this.shadowMesh.frustumCulled = false; this.shadowMesh.renderOrder = 1;
    this.group.add(this.shadowMesh);
    // pebbles: small-scale ground clutter near the player (visual only, no collision)
    const pm = new THREE.ShaderMaterial({ vertexShader: rockVert, fragmentShader: rockFrag, uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) }, camPos: { value: new THREE.Vector3() } } });
    this.pebbleMesh = new THREE.InstancedMesh(rockGeo(31), pm, PEB_MAX);
    this.pebbleMesh.count = 0; this.pebbleMesh.frustumCulled = false;
    this.pebbleMesh.geometry.setAttribute('tone', new THREE.InstancedBufferAttribute(new Float32Array(PEB_MAX), 1));
    this.group.add(this.pebbleMesh);
  }
  setSun(d: V3) {
    const t = bodyToThree(d);
    for (const m of [this.mat, this.pebbleMesh.material as THREE.ShaderMaterial]) m.uniforms.sunDir.value.set(t[0], t[1], t[2]);
    const elev = v3.dot(d, this.playerUp);
    this.shadowMat.uniforms.op.value = Math.max(0, 0.55 * Math.min(1, elev * 6));   // fade shadows out at low sun
    if (Math.abs(elev - this.lastElev) > 0.04) { this.lastElev = elev; this.placeShadows(); }
  }
  /** regenerate around player (lat/lon deg) when moved > 5 m. ground(dir, rBase) gives the regolith
   *  relief offset (m) so rocks sit ON the displaced surface, not floating above it (§4.6 stage 2). */
  update(lat: number, lon: number, ground?: (dir: V3, rBase: number) => number) {
    this.playerUp = geoToBody(lat, lon, 1);
    // 岩の格子は「位置だけ」で決まる固定格子（緯度行ごとに経度の分割数を整数で固定）。
    // 以前は格子幅がプレイヤーの緯度で変わったため、歩くたびに岩の配置が組み変わっていた。
    const R = 450, la = lat * Math.PI / 180, lonR = lon * Math.PI / 180; const dLat = CELL / R;
    if (this.cx < 1e8) { let dl = lonR - this.cx; dl = Math.atan2(Math.sin(dl), Math.cos(dl)); if (Math.hypot((la - this.cy) * R, dl * R * Math.max(0.15, Math.cos(la))) < 2 * CELL) return; }
    this.cx = lonR; this.cy = la; const cj = Math.round(la / dLat);
    this.list = []; const n = Math.ceil(RADIUS / CELL); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    const counts = new Array(NVAR).fill(0);
    for (const mesh of this.meshes) { (mesh.geometry.getAttribute('tone') as THREE.InstancedBufferAttribute).needsUpdate = true; }
    for (let dj = -n; dj <= n; dj++) {
      const J = cj + dj, latRow = J * dLat; if (Math.abs(latRow) > 89 * Math.PI / 180) continue;
      const NJ = Math.max(1, Math.round(2 * Math.PI * R * Math.max(0.15, Math.cos(latRow)) / CELL)), dLon = 2 * Math.PI / NJ, ci = Math.round(lonR / dLon);
      for (let di = -n; di <= n; di++) {
      if (di * di + dj * dj > n * n) continue; const I = (((ci + di) % NJ) + NJ) % NJ;   // 経度方向は周回で正規化（0°/360°の継ぎ目でも同じ岩）
      const h = hash2(I, J, 7); if (h > 0.55) continue;                       // ~55% of cells hold a rock (~0.06/m², Michikami et al. 2019 class estimate)
      const D = Math.min(DMAX, DMIN * Math.pow(1 - hash2(I, J, 11) * 0.999, -0.5)); // N(>D) ~ D^-2
      const clat = (J + hash2(I, J, 3) * 0.8 - 0.4) * dLat, clon = (I + hash2(I, J, 5) * 0.8 - 0.4) * dLon;
      const latd = clat * 180 / Math.PI, lond = ((clon * 180 / Math.PI) % 360 + 360) % 360; if (Math.abs(latd) > 89) continue;
      const rBase = this.hm.radius(latd, lond); const up = geoToBody(latd, lond, 1); const a = D, b = D * 0.71, c = D * 0.44;
      const rr = rBase + (ground ? ground(up, rBase) : 0);
      const rock: Rock = { p: v3.mul(up, rr), up, a, b, c, rot: hash2(I, J, 13) * Math.PI * 2, top: c * 0.35, tone: hash2(I, J, 17) };
      this.list.push(rock);
      const v = (I * 7 + J * 13 + Math.floor(hash2(I, J, 19) * 99)) % NVAR; const mesh = this.meshes[v]; const k = counts[v]; if (k >= PER_VAR) continue;
      const u = bodyToThree(up); const upT = new THREE.Vector3(u[0], u[1], u[2]);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), upT); const spin = new THREE.Quaternion().setFromAxisAngle(upT, rock.rot); q.premultiply(spin);
      const pt = bodyToThree(rock.p); pos.set(pt[0] + u[0] * c * 0.15, pt[1] + u[1] * c * 0.15, pt[2] + u[2] * c * 0.15); s.set(a, c, b); // a long axis, c up(short) : flat & angular
      m.compose(pos, q, s); mesh.setMatrixAt(k, m); (mesh.geometry.getAttribute('tone') as THREE.InstancedBufferAttribute).setX(k, rock.tone); counts[v]++;
      }
    }
    this.meshes.forEach((mesh, i) => { mesh.count = counts[i]; mesh.instanceMatrix.needsUpdate = true; });
    this.placeShadows();
    this.updatePebbles(lat, lon, ground);
  }
  private updatePebbles(lat: number, lon: number, ground?: (dir: V3, rBase: number) => number) {
    const R = 450, la = lat * Math.PI / 180, lonR = lon * Math.PI / 180; const dLat = PEB_CELL / R;
    if (this.px < 1e8) { let dl = lonR - this.px; dl = Math.atan2(Math.sin(dl), Math.cos(dl)); if (Math.hypot((la - this.py) * R, dl * R * Math.max(0.15, Math.cos(la))) < 3 * PEB_CELL) return; }
    this.px = lonR; this.py = la; const cj = Math.round(la / dLat);
    const n = Math.ceil(PEB_RADIUS / PEB_CELL); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    const tone = (this.pebbleMesh.geometry.getAttribute('tone') as THREE.InstancedBufferAttribute); let k = 0;
    for (let dj = -n; dj <= n && k < PEB_MAX; dj++) {
      const J = cj + dj, latRow = J * dLat; if (Math.abs(latRow) > 89 * Math.PI / 180) continue;
      const NJ = Math.max(1, Math.round(2 * Math.PI * R * Math.max(0.15, Math.cos(latRow)) / PEB_CELL)), dLon = 2 * Math.PI / NJ, ci = Math.round(lonR / dLon);
      for (let di = -n; di <= n && k < PEB_MAX; di++) {
      if (di * di + dj * dj > n * n) continue; const I = (((ci + di) % NJ) + NJ) % NJ;
      if (hash2(I, J, 71) > 0.3) continue;   // 密度は位置に依存せず一定（以前は近距離だけ密度を変えていたため、歩くと小石が出入りしていた）。0.3×約6900セル≈2100 < PEB_MAX
      const D = 0.03 + hash2(I, J, 73) * 0.27;
      const clat = (J + (hash2(I, J, 75) - 0.5) * 0.9) * dLat, clon = (I + (hash2(I, J, 77) - 0.5) * 0.9) * dLon;
      const latd = clat * 180 / Math.PI, lond = ((clon * 180 / Math.PI) % 360 + 360) % 360; if (Math.abs(latd) > 89) continue;
      const rBase = this.hm.radius(latd, lond); const up = geoToBody(latd, lond, 1);
      const rr = rBase + (ground ? ground(up, rBase) : 0);
      const u = bodyToThree(up); const upT = new THREE.Vector3(u[0], u[1], u[2]);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), upT); const spin = new THREE.Quaternion().setFromAxisAngle(upT, hash2(I, J, 79) * Math.PI * 2); q.premultiply(spin);
      const pt = bodyToThree(v3.mul(up, rr)); pos.set(pt[0] + u[0] * D * 0.1, pt[1] + u[1] * D * 0.1, pt[2] + u[2] * D * 0.1); s.set(D, D * 0.6, D * 0.75);
      m.compose(pos, q, s); this.pebbleMesh.setMatrixAt(k, m); tone.setX(k, hash2(I, J, 81)); k++;
      }
    }
    this.pebbleMesh.count = k; this.pebbleMesh.instanceMatrix.needsUpdate = true; tone.needsUpdate = true;
  }
  private placeShadows() {
    const t = this.mat.uniforms.sunDir.value as THREE.Vector3;
    const sunB: V3 = [t.x, -t.z, t.y];   // three -> body
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    let k = 0;
    for (const r of this.list) {
      const u = bodyToThree(r.up); const upT = new THREE.Vector3(u[0], u[1], u[2]);
      // anti-sun horizontal offset (shadow leans away from the sun)
      const sd = v3.norm(v3.sub(sunB, v3.mul(r.up, v3.dot(sunB, r.up))));
      const off = v3.mul(v3.sub(v3.mul(r.up, v3.dot(sd, r.up)), sd), Math.min(r.c, 1.5));
      const pt = bodyToThree(v3.add(r.p, off)); pos.set(pt[0], pt[1], pt[2]);
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), upT);
      const sc = Math.max(r.a, r.b) * 1.6; s.set(sc, sc, 1);
      m.compose(pos, q, s); this.shadowMesh.setMatrixAt(k++, m);
    }
    this.shadowMesh.count = k; this.shadowMesh.instanceMatrix.needsUpdate = true;
  }
  /** height of the highest rock top above radius r at body position p (collision proxy = ellipsoid footprint of a rock) */
  topAt(p: V3): number {
    let best = -Infinity; const g = v3.norm(p);
    for (const r of this.list) { const d = v3.len(v3.sub(v3.mul(g, v3.len(r.p)), r.p)); const ax = r.a * 0.5; if (d > ax) continue; const f = Math.sqrt(1 - (d / ax) ** 2);
      const rad = v3.len(r.p) + r.c * 0.15 + r.c * 0.5 * f * 0.9; if (rad > best) best = rad; }
    return best;
  }
  stepHeightAhead(p: V3, dir: V3, dist: number) { return this.topAt(v3.add(p, v3.mul(dir, dist))); }
}
export { bodyToGeo };
