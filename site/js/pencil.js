// 鉛筆の描画。実測の形状点群(SfM 3M モデルの頂点、約31.6万点)を、点ごとに短い鉛筆の線として毎フレーム描く。
// 画像フィルターではない: 線の位置・向き・濃さ・有無は、点の3D座標、法線、太陽の向き、影、地図の明るさから、GPUで計算している。
import { makeProgram, buffer } from './gl.js';
import { v3, perspective, lookAt, mul4, ortho, clamp } from './math.js';

const VS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2DShadow;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in float aLum;
uniform mat4 uVP, uLVP; uniform vec3 uSun, uEye; uniform float uPlain, uTarget, uPx, uPxPerM, uInk, uDensity, uBias, uSpacing, uTime, uReveal, uDark, uSpin, uForm, uFormOn;
uniform sampler2DShadow uShadow; uniform float uShadowTexel;
out vec2 vDir; out float vAlpha, vLen, vWid, vSeed, vPlain, vTone, vDark;
float hash(float n){ return fract(sin(n*12.9898+4.1414)*43758.5453); }
void main(){
  float id = float(gl_VertexID);
  float h1=hash(id), h2=hash(id+17.3), h3=hash(id+91.7), h4=hash(id+5.9);
  vec3 N = normalize(aNrm);
  float fF = 1.; if(uFormOn > 0.5) fF = smoothstep(0., 1., clamp(uForm*1.6 - h4*0.6, 0., 1.));
  float cs0 = cos(uSpin), sn0 = sin(uSpin); mat3 R = mat3(cs0, sn0, 0., -sn0, cs0, 0., 0., 0., 1.);
  vec3 V = normalize(uEye - R*aPos); vec3 Nr = R*N;
  float mu0 = dot(N, uSun);
  // 影(太陽側から見た深度マップ)
  vec4 lp = uLVP*vec4(aPos + N*1.5,1.); vec3 sp = lp.xyz/lp.w*.5+.5; float sh = 1.;
  if(sp.x>0.&&sp.x<1.&&sp.y>0.&&sp.y<1.&&sp.z<1.){
    sh = 0.;
    for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++) sh += texture(uShadow, vec3(sp.xy+vec2(i,j)*uShadowTexel, sp.z-0.0016));
    sh /= 9.;
  }
  float light = max(mu0,0.)*sh;
  float alb = aLum;                                        // 0..1 (ONC地図の明るさ)
  float d = (1. - clamp(light*1.25, 0., 1.)) * 0.92;                // 暗さ
  d = clamp(d + (0.40 - alb)*0.45, 0., 1.);                 // 地図の暗い所(岩など)は濃く
  float rim = pow(1. - max(dot(Nr,V),0.), 2.2);
  d = max(d, rim*0.5);
  // 線の向き: 表面に沿う方向(法線と、軸から作った接線)を画面へ投影
  vec3 axis = abs(N.z) > 0.9 ? vec3(1.,0.,0.) : vec3(0.,0.,1.);
  vec3 T1 = normalize(cross(N, axis)); vec3 T2 = cross(N, T1);
  vec3 T = (d > 0.55 && h2 > 0.5) ? T2 : T1;               // 濃い所は交差する線(クロスハッチ)
  vec3 dS = normalize(vec3(h1-.5, h2-.5, h3-.5) + vec3(1e-3));
  vec3 scat = aPos*(1.5+2.4*h4) + dS*140.;
  vec3 pw = R*mix(scat, aPos + N*uBias, fF);
  vec4 c0 = uVP*vec4(pw,1.), c1 = uVP*vec4(pw + R*T*4.,1.);
  vec2 s0 = c0.xy/c0.w, s1 = c1.xy/c1.w; vec2 dv = s1 - s0; float dl = length(dv);
  vec2 dir = dl > 1e-6 ? dv/dl : vec2(1.,0.);
  float wob = (h3-0.5)*0.55; float cs=cos(wob), sn=sin(wob); dir = vec2(dir.x*cs - dir.y*sn, dir.x*sn + dir.y*cs);
  float dist = length(uEye - pw);
  float pxm = uPxPerM/dist;
  float len = clamp(uSpacing*pxm*4.6*(0.75+0.6*h2), 7.*uPx, 52.*uPx);
  vDir = dir; vLen = len; vWid = (0.9 + 0.8*h3)*uPx; vSeed = h2*40.;
  vAlpha = (0.22 + 0.45*h3) * uInk * (0.6 + 0.5*d);
  // 点を出すか: 画面あたりの描画量(被覆)が、暗さに応じた目標になるように、点を間引く
  float ptsPx2 = 1./((pxm*uSpacing)*(pxm*uSpacing));
  float cov = ptsPx2 * len * vWid * 0.7 * vAlpha;
  float want = uTarget * (0.02 + 0.98*smoothstep(0.18, 0.9, d)) * uDensity;
  float p = clamp(want/max(cov,1e-4), 0., 1.);
  float ang = atan(aPos.y, aPos.x)/6.2831853 + 0.5;
  float reveal = step(fract(ang)*0.84 + h4*0.16, uReveal);
  bool keep = (h1 < p) && reveal > 0.5;
  vPlain = uPlain;
  vTone = clamp((0.15 + 0.85*light)*(0.55 + 0.9*alb), 0., 1.); vDark = uDark;
  if(uPlain > 0.5){ keep = reveal > 0.5; vAlpha = mix(0.3, 0.92, fF); gl_PointSize = max(mix(1.2, 1.9, fF)*uPx, 1.1*pxm*uSpacing*fF); }
  else gl_PointSize = len + 4.*uPx;
  gl_Position = keep && c0.w > 0. ? c0 : vec4(2.,2.,2.,1.);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vDir; in float vAlpha, vLen, vWid, vSeed, vPlain, vTone, vDark; out vec4 o;
float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash2(i),hash2(i+vec2(1,0)),f.x), mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),f.x), f.y); }
void main(){
  if(vPlain > 0.5){ float r = length(gl_PointCoord-0.5)*2.; if(r>1.) discard; vec3 col = mix(vec3(mix(0.10,0.64,vTone)), vec3(0.08+0.74*vTone)*vec3(1.,0.985,0.95), vDark); o = vec4(col, vAlpha*(1.0 - smoothstep(0.5,1.0,r))); return; }
  float S = vLen + 4.*vWid/ max(vWid,0.001) * 1.;           // おおよその点の大きさ(px)
  vec2 q = (gl_PointCoord - 0.5) * vec2(1., -1.) * (vLen + 4.);
  float u = dot(q, vDir), v = dot(q, vec2(-vDir.y, vDir.x));
  float half_ = vLen * 0.5;
  float along = 1.0 - smoothstep(half_*0.55, half_, abs(u) + vnoise(vec2(u*0.3, vSeed))*half_*0.25);
  float w = vWid * (0.55 + 0.45*vnoise(vec2(u*0.12, vSeed+3.)));
  float across = 1.0 - smoothstep(w*0.2, w, abs(v));
  float grain = 0.55 + 0.45*vnoise(gl_FragCoord.xy*0.9 + vSeed);   // 紙の目に引っかかるかすれ
  float a = along*across*grain*vAlpha;
  if(a < 0.01) discard;
  o = vec4(mix(vec3(0.17,0.17,0.20), vec3(0.93,0.91,0.85), vDark), a);
}`;

const SVS = `#version 300 es
precision highp float; layout(location=0) in vec4 aS; uniform mat4 uVP; uniform float uPx, uT, uA; out float vB;
void main(){ vec4 c = uVP*vec4(aS.xyz*1000.,1.); gl_Position = vec4(c.xy, c.w*0.99999, c.w);
  gl_PointSize = (1.0 + aS.w*1.9)*uPx; vB = (0.3 + 0.7*aS.w)*(0.78 + 0.22*sin(uT*1.3 + aS.x*57.))*uA; }`;
const SFS = `#version 300 es
precision highp float; in float vB; out vec4 o;
void main(){ float r = length(gl_PointCoord-0.5)*2.; if(r>1.) discard; o = vec4(0.88,0.92,1.0, vB*(1.0 - smoothstep(0.2,1.0,r))); }`;
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };

export class Pencil {
  async init(scene) {
    const gl = scene.gl; this.scene = scene; this.gl = gl;
    this.prog = makeProgram(gl, VS, FS, 'pencil');
    const ab = await (await fetch('data/pencil.bin')).arrayBuffer();
    const h = new Uint32Array(ab, 0, 4); const n = h[0], sc = h[1];
    const q = new Int16Array(ab.slice(16, 16 + n * 6)); const pos = new Float32Array(n * 3); for (let i = 0; i < pos.length; i++) pos[i] = q[i] / sc;
    const nrm = new Int8Array(ab.slice(16 + n * 6, 16 + n * 9)); const lum = new Uint8Array(ab.slice(16 + n * 9, 16 + n * 10));
    this.n = n; this.pos = pos; this.spacing = 2.72;
    this._buildRadiusGrid();
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    buffer(gl, pos); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    buffer(gl, nrm); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.BYTE, true, 0, 0);
    buffer(gl, lum); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindVertexArray(null);
    this.sp = makeProgram(gl, SVS, SFS, 'stars');
    const ns = 2200, st = new Float32Array(ns * 4); let sd = 12345; const rn = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < ns; i++) { const z = rn() * 2 - 1, a = rn() * 6.2832, r = Math.sqrt(1 - z * z); st.set([r * Math.cos(a), r * Math.sin(a), z, Math.pow(rn(), 3)], i * 4); }
    this.starVao = gl.createVertexArray(); gl.bindVertexArray(this.starVao); buffer(gl, st); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null); this.ns = ns;
    this.dark = 0; this.spin = 0; this.form = 1; this.formOn = false;
    this.plain = false; this.ink = 1; this.target = 0.5; this.density = 1; this.reveal = 1;
    return n;
  }
  _buildRadiusGrid() {
    // Site markers and ray picking use the visible SfM point-cloud envelope.
    const W=720,H=360,R=new Float32Array(W*H),P=this.pos;
    for(let i=0;i<this.n;i++){
      const x=P[i*3],y=P[i*3+1],z=P[i*3+2],r=Math.hypot(x,y,z);
      if(!(r>0)||!Number.isFinite(r))continue;
      let lon=Math.atan2(y,x);if(lon<0)lon+=2*Math.PI;
      const lat=Math.asin(clamp(z/r,-1,1));
      const u=Math.min(W-1,Math.floor(lon/(2*Math.PI)*W));
      const v=Math.min(H-1,Math.floor((Math.PI/2-lat)/Math.PI*H));
      if(r>R[v*W+u])R[v*W+u]=r;
    }
    // Fill holes from a snapshot each pass to avoid scan-order bias.
    for(let it=0;it<8;it++){
      const prev=R.slice();let filled=0;
      for(let v=0;v<H;v++)for(let u=0;u<W;u++){
        const at=v*W+u;if(prev[at]>0)continue;
        let sum=0,count=0;
        for(const [du,dv] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const uu=(u+du+W)%W,vv=Math.min(H-1,Math.max(0,v+dv)),value=prev[vv*W+uu];
          if(value>0){sum+=value;count++;}
        }
        if(count){R[at]=sum/count;filled++;}
      }
      if(!filled)break;
    }
    // Unobserved angular cells fall back to the existing SPC reference grid,
    // never to an arbitrary mean radius.
    const ref=this.scene?.rgrid?.R;
    for(let i=0;i<R.length;i++)if(!(R[i]>0)||!Number.isFinite(R[i])){
      const value=ref && ref.length===R.length ? ref[i] : 0;
      if(value>0 && Number.isFinite(value))R[i]=value;
      // If both sources have a hole here, preserve it as unavailable instead
      // of inventing a radius. Ray picking naturally skips that direction.
    }
    this.rgrid={R,W,H};
  }

  draw(st) {
    const sc = this.scene, gl = this.gl; sc.resize();
    const W = sc.canvas.width, H = sc.canvas.height; const { eye, target, up } = st.pose; const sun = st.sun;
    const alt = Math.max(st.altitude, 1), near = clamp(alt * 0.08, 0.5, 60), far = 400000;
    const fov = (sc.aspect < 1 ? 62 : 46) * Math.PI / 180;
    const proj = perspective(fov, sc.aspect, near, far), view = lookAt(eye, target, up), vp = mul4(proj, view);
    sc.lastVP = vp; sc.view.near = { vp, eye, fov };
    // 影の深度マップ
    const lightV = lookAt(v3.mul(sun, 900), [0, 0, 0], Math.abs(sun[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1]);
    const lvp = mul4(ortho(-620, 620, -620, 620, 100, 1800), lightV);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sc.shadowFbo); gl.viewport(0, 0, sc.shadowSize, sc.shadowSize);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.colorMask(false, false, false, false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
    gl.useProgram(sc.pDepth.p); gl.uniformMatrix4fv(sc.pDepth.U.uLVP, false, lvp);
    gl.bindVertexArray(sc.vaoBody); gl.drawElements(gl.TRIANGLES, sc.mesh.nf * 3, gl.UNSIGNED_INT, 0);
    // 本画面: 紙の色で塗りつぶし、隠れる線を消すための深度だけを描く(形状メッシュは見せない)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.colorMask(true, true, true, true);
    const k = this.dark; gl.clearColor(0.957 + (0.016 - 0.957) * k, 0.945 + (0.018 - 0.945) * k, 0.914 + (0.026 - 0.914) * k, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.colorMask(false, false, false, false); gl.uniformMatrix4fv(sc.pDepth.U.uLVP, false, mul4(vp, rotZ(this.spin)));
    gl.drawElements(gl.TRIANGLES, sc.mesh.nf * 3, gl.UNSIGNED_INT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.colorMask(true, true, true, true);
    if (this.dark > 0.01) { // 星(無限遠。形状に隠れる)
      const sv = mul4(proj, lookAt([0, 0, 0], v3.sub(target, eye), up)); gl.useProgram(this.sp.p);
      gl.depthMask(false); gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(this.sp.U.uVP, false, sv); gl.uniform1f(this.sp.U.uPx, sc.dpr); gl.uniform1f(this.sp.U.uT, st.clock || 0); gl.uniform1f(this.sp.U.uA, this.dark);
      gl.bindVertexArray(this.starVao); gl.drawArrays(gl.POINTS, 0, this.ns);
    }
    // 点群を鉛筆の線として描く
    const P = this.prog, U = P.U; gl.useProgram(P.p);
    gl.depthMask(false); gl.depthFunc(gl.LEQUAL); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(U.uVP, false, vp); gl.uniformMatrix4fv(U.uLVP, false, lvp); gl.uniform3fv(U.uSun, sun); gl.uniform3fv(U.uEye, eye);
    gl.uniform1f(U.uPx, sc.dpr); gl.uniform1f(U.uPxPerM, H / (2 * Math.tan(fov / 2))); gl.uniform1f(U.uPlain, this.plain ? 1 : 0); gl.uniform1f(U.uInk, this.ink); gl.uniform1f(U.uTarget, this.target); gl.uniform1f(U.uDensity, this.density);
    gl.uniform1f(U.uBias, clamp(alt * 0.01, 2.5, 9)); gl.uniform1f(U.uSpacing, this.spacing); gl.uniform1f(U.uTime, st.clock || 0); gl.uniform1f(U.uReveal, this.reveal); gl.uniform1f(U.uDark, this.dark); gl.uniform1f(U.uSpin, this.spin); gl.uniform1f(U.uForm, this.form); gl.uniform1f(U.uFormOn, this.formOn ? 1 : 0);
    gl.uniform1f(U.uShadowTexel, 1 / sc.shadowSize);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, sc.shadowTex); gl.uniform1i(U.uShadow, 2);
    gl.bindVertexArray(this.vao); gl.drawArrays(gl.POINTS, 0, this.n);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS); gl.bindVertexArray(null);
  }
}
