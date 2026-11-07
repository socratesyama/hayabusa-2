// §4.6 stage 3: statistical rock scatter (Michikami et al. 2019): size-frequency power law ~ D^-2, b/a=0.71, c/a=0.44, angular.
// Deterministic from position (hash of cell indices) — same place, same rocks, forever (§7.18). Class D.
import * as THREE from 'three';
import { V3, v3, hash2, bodyToThree, geoToBody, bodyToGeo } from './geo';
import type { HeightMap } from './data';
export interface Rock { p: V3; up: V3; a: number; b: number; c: number; rot: number; top: number; tone: number; }
const CELL = 3.0, RADIUS = 30, DMIN = 0.35, DMAX = 4.0;
export class Rocks {
  mesh: THREE.InstancedMesh; list: Rock[] = []; private cx = 1e9; private cy = 1e9; MAX = 900;
  constructor(private hm: HeightMap) {
    const geo = new THREE.IcosahedronGeometry(0.5, 0); // faceted, angular
    const mat = new THREE.ShaderMaterial({ vertexShader: `attribute float tone; varying vec3 vN; varying float vT; void main(){ vT=tone; vN=normalize(mat3(instanceMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.0);} `,
      fragmentShader: `precision highp float; uniform vec3 sunDir; varying vec3 vN; varying float vT; void main(){ float nl=max(dot(normalize(vN),normalize(sunDir)),0.0); vec3 alb=vec3(0.05,0.045,0.043)*(0.7+0.6*vT); gl_FragColor=vec4(pow(alb*nl*6.0,vec3(1.0/2.2)),1.0);} `, uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) } } });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.MAX); this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.geometry.setAttribute('tone', new THREE.InstancedBufferAttribute(new Float32Array(this.MAX), 1));
  }
  setSun(d: V3) { const t = bodyToThree(d); (this.mesh.material as THREE.ShaderMaterial).uniforms.sunDir.value.set(t[0], t[1], t[2]); }
  /** regenerate around player (lat/lon deg) when moved > 5 m */
  update(lat: number, lon: number) {
    const R = 450, la = lat * Math.PI / 180; const dLat = CELL / R, dLon = CELL / (R * Math.max(0.15, Math.cos(la)));
    const ci = Math.round(lon * Math.PI / 180 / dLon), cj = Math.round(la / dLat);
    if (Math.abs(ci - this.cx) < 2 && Math.abs(cj - this.cy) < 2) return; this.cx = ci; this.cy = cj;
    this.list = []; const n = Math.ceil(RADIUS / CELL); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    const tone = (this.mesh.geometry.getAttribute('tone') as THREE.InstancedBufferAttribute); let k = 0;
    for (let dj = -n; dj <= n && k < this.MAX; dj++) for (let di = -n; di <= n && k < this.MAX; di++) {
      if (di * di + dj * dj > n * n) continue; const I = ci + di, J = cj + dj;
      const h = hash2(I, J, 7); if (h > 0.34) continue;                       // ~34% of cells hold a rock
      const D = Math.min(DMAX, DMIN * Math.pow(1 - hash2(I, J, 11) * 0.999, -0.5)); // N(>D) ~ D^-2
      const clat = (J + hash2(I, J, 3) * 0.8 - 0.4) * dLat, clon = (I + hash2(I, J, 5) * 0.8 - 0.4) * dLon;
      const latd = clat * 180 / Math.PI, lond = ((clon * 180 / Math.PI) % 360 + 360) % 360; if (Math.abs(latd) > 89) continue;
      const rr = this.hm.radius(latd, lond); const up = geoToBody(latd, lond, 1); const a = D, b = D * 0.71, c = D * 0.44;
      const rock: Rock = { p: v3.mul(up, rr), up, a, b, c, rot: hash2(I, J, 13) * Math.PI * 2, top: c * 0.35, tone: hash2(I, J, 17) };
      this.list.push(rock);
      const u = bodyToThree(up); const upT = new THREE.Vector3(u[0], u[1], u[2]);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), upT); const spin = new THREE.Quaternion().setFromAxisAngle(upT, rock.rot); q.premultiply(spin);
      const pt = bodyToThree(rock.p); pos.set(pt[0] + u[0] * c * 0.15, pt[1] + u[1] * c * 0.15, pt[2] + u[2] * c * 0.15); s.set(a, c, b); // a long axis, c up(short) : flat & angular
      m.compose(pos, q, s); this.mesh.setMatrixAt(k, m); tone.setX(k, rock.tone); k++;
    }
    this.mesh.count = k; this.mesh.instanceMatrix.needsUpdate = true; tone.needsUpdate = true;
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
