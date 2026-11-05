// GLSL ES 3.00。座標系はすべて「小惑星固定座標(メートル)」。
export const NOISE = `
float hash11(float p){ p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
vec3 hash31(float p){ vec3 p3 = fract(vec3(p) * vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xxy+p3.yzz)*p3.zyx); }
`;

export const BODY_VS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm;
uniform mat4 uVP, uLVP; uniform vec3 uSun; uniform int uMode; uniform float uSunAU;
uniform sampler2D uTI, uLUT;
out vec3 vPos, vNrm; out vec2 vUV; out vec4 vLP; out float vT; out float vTI;
const float PI = 3.14159265;
const int NG=20, NA=7, NB=12, NH=48;
float lutAt(int g,int a,int b,int h){ return texelFetch(uLUT, ivec2(b*NH + (h%NH), g*NA + a), 0).r; }
float lut(float gf,float af,float bf,float hf){
  int g0=int(floor(gf)), a0=int(floor(af)), b0=int(floor(bf)), h0=int(floor(hf));
  float fg=gf-float(g0), fa=af-float(a0), fb=bf-float(b0), fh=hf-float(h0);
  float s=0.;
  for(int dg=0;dg<2;dg++) for(int da=0;da<2;da++) for(int db=0;db<2;db++){
    float w=(dg==1?fg:1.-fg)*(da==1?fa:1.-fa)*(db==1?fb:1.-fb);
    int G=min(g0+dg,NG-1), A=min(a0+da,NA-1), B=min(b0+db,NB-1);
    float v=mix(lutAt(G,A,B,h0), lutAt(G,A,B,h0+1), fh);
    s+=w*v;
  }
  return s;
}
void main(){
  vPos = aPos; vNrm = aNrm;
  float r = length(aPos);
  float lon = atan(aPos.y, aPos.x); if(lon<0.) lon += 2.*PI;
  float lat = asin(clamp(aPos.z/r,-1.,1.));
  vUV = vec2(lon/(2.*PI), (PI*.5-lat)/PI);
  vLP = uLVP * vec4(aPos + aNrm*0.9, 1.);
  vT = 0.; vTI = 0.;
  if(uMode==1){
    vec3 n = normalize(aNrm);
    float phi = asin(clamp(n.z,-1.,1.)), lam = atan(n.y,n.x);
    float dlt = asin(clamp(uSun.z,-1.,1.)), lams = atan(uSun.y,uSun.x);
    float h = lam - lams; h = mod(h, 2.*PI);
    float a = sin(phi)*sin(dlt), b = cos(phi)*cos(dlt);
    float tiR = textureLod(uTI, vUV, 0.).r * 255.0;
    float gam = 10.0 + tiR/255.0*390.0; vTI = gam;
    float gf = clamp((log(gam)-log(20.))/(log(450.)-log(20.))*float(NG-1), 0., float(NG-1)-0.001);
    float af = clamp((a+0.26)/0.52*float(NA-1), 0., float(NA-1)-0.001);
    float bf = clamp(b*float(NB-1), 0., float(NB-1)-0.001);
    float hf = h/(2.*PI)*float(NH);
    vT = lut(gf,af,bf,hf) * pow(1.1896/uSunAU, 0.5);
  }
  gl_Position = uVP * vec4(aPos,1.);
}`;

export const BODY_FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D; precision highp sampler2DShadow;
in vec3 vPos, vNrm; in vec2 vUV; in vec4 vLP; in float vT; in float vTI;
uniform sampler2D uBase, uHi; uniform sampler2DShadow uShadow;
uniform vec3 uSun, uEye; uniform int uMode; uniform float uExposure, uBump, uLidarDim, uPulse;
uniform vec2 uHiLat; uniform float uShadowTexel;
uniform vec3 uMark[4]; uniform float uMarkR[4];
out vec4 o;
const float PI = 3.14159265;
vec3 ramp(float T){
  // 寒色から暖色へ。区切りは 150,200,240,280,320,360,400 K
  vec3 c0=vec3(.035,.06,.17), c1=vec3(.12,.26,.58), c2=vec3(.33,.62,.80), c3=vec3(.86,.86,.72), c4=vec3(.97,.70,.26), c5=vec3(.90,.31,.16), c6=vec3(1.,.93,.80);
  if(T<180.) return c0;
  if(T<215.) return mix(c0,c1,(T-180.)/35.);
  if(T<250.) return mix(c1,c2,(T-215.)/35.);
  if(T<275.) return mix(c2,c3,(T-250.)/25.);
  if(T<305.) return mix(c3,c4,(T-275.)/30.);
  if(T<335.) return mix(c4,c5,(T-305.)/30.);
  return mix(c5,c6,clamp((T-335.)/40.,0.,1.));
}
vec3 perturb(vec3 N, vec3 p, float h, float k){
  vec3 dpx=dFdx(p), dpy=dFdy(p); float dhx=dFdx(h), dhy=dFdy(h);
  vec3 r1=cross(dpy,N), r2=cross(N,dpx);
  float det=dot(dpx,r1);
  vec3 grad=sign(det)*(dhx*r1+dhy*r2);
  return normalize(abs(det)*N - k*grad);
}
float shadow(){
  vec3 p = vLP.xyz/vLP.w*.5+.5;
  if(p.x<0.||p.x>1.||p.y<0.||p.y>1.||p.z>1.) return 1.;
  float s=0.;
  for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++) s += texture(uShadow, vec3(p.xy+vec2(i,j)*uShadowTexel, p.z-0.0012));
  return s/9.;
}
void main(){
  vec3 N = normalize(vNrm);
  // 地図: 全球 3600x1800(約0.8 m/px) と 低緯度の高解像度(約0.36 m/px)
  float Lb = texture(uBase, vUV).r;
  float lat = (0.5-vUV.y)*180.;
  float L = Lb;
  if(lat < uHiLat.x && lat > uHiLat.y){
    float hv = (uHiLat.x-lat)/(uHiLat.x-uHiLat.y);
    float Lh = texture(uHi, vec2(vUV.x, hv)).r;
    float w = smoothstep(uHiLat.y, uHiLat.y+2.5, lat)*smoothstep(uHiLat.x, uHiLat.x-2.5, lat);
    L = mix(Lb, Lh, w);
  }
  float dist = length(uEye - vPos);
  N = perturb(N, vPos, L, uBump*smoothstep(260.,25.,dist));
  float mu0 = max(dot(N,uSun),0.);
  vec3 V = normalize(uEye - vPos);
  float mu = max(dot(N,V),0.02);
  float geo = max(dot(normalize(vNrm),uSun),0.);
  float sh = shadow();
  float refl = L * (mu0/(mu0+mu)) * 2.0 * sh;       // ロンメル=ゼーリガー則(暗い小惑星の反射)
  vec3 col;
  float amb = 0.018;
  if(uMode==1){
    vec3 tc = ramp(vT);
    float shade = 0.50 + 0.50*clamp(refl*1.2,0.,1.);
    col = tc*shade*uExposure;
  } else if(uMode==2){
    col = vec3(0.012,0.017,0.028) + vec3(0.025,0.035,0.05)*refl*uLidarDim + vec3(0.02,0.03,0.045)*pow(1.-mu,3.);
  } else {
    col = vec3(0.97,0.985,1.0)*refl*uExposure + vec3(0.7,0.8,1.0)*amb*L;
  }
  // 地点の目印(クリックした場所を示すリング)
  for(int i=0;i<4;i++){
    if(uMarkR[i]>0.){
      float d = length(vPos - uMark[i]);
      float ring = smoothstep(uMarkR[i]*1.0, uMarkR[i]*0.92, d) - smoothstep(uMarkR[i]*0.84, uMarkR[i]*0.76, d);
      col = mix(col, vec3(1.,.82,.4), ring*(0.55+0.45*uPulse));
    }
  }
  col = 1. - exp(-col*1.25);
  col = pow(col, vec3(1./2.2));
  o = vec4(col,1.);
}`;

export const DEPTH_VS = `#version 300 es
precision highp float; layout(location=0) in vec3 aPos; uniform mat4 uLVP;
void main(){ gl_Position = uLVP*vec4(aPos,1.); }`;
export const DEPTH_FS = `#version 300 es
precision highp float; out vec4 o; void main(){ o=vec4(1.); }`;

export const STAR_VS = `#version 300 es
precision highp float; precision highp int;
layout(location=0) in vec4 aS;
uniform mat3 uSky; uniform mat4 uRotProj; uniform float uPx;
out float vB;
void main(){
  vec3 d = uSky*aS.xyz;
  vec4 p = uRotProj*vec4(d,1.);
  gl_Position = vec4(p.xy, p.w*0.99999, p.w);
  float m = aS.w;
  vB = 0.20 + 0.80/pow(m,1.15);
  gl_PointSize = (1.0 + 1.4/m) * uPx;
}`;
export const STAR_FS = `#version 300 es
precision highp float; in float vB; out vec4 o; uniform float uGain;
void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); if(d>.5) discard; o=vec4(vec3(.86,.9,1.)*vB*uGain,1.); }`;

export const SUN_VS = `#version 300 es
precision highp float; uniform mat4 uRotProj; uniform vec3 uDir; uniform float uSize;
void main(){ vec4 p=uRotProj*vec4(uDir,1.); gl_Position=vec4(p.xy,p.w*0.99999,p.w); gl_PointSize=uSize; }`;
export const SUN_FS = `#version 300 es
precision highp float; out vec4 o; void main(){ vec2 c=gl_PointCoord-.5; if(length(c)>.5) discard; o=vec4(1.,.97,.9,1.); }`;

export const CRAFT_VS = `#version 300 es
precision highp float; precision highp int;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aCol;
uniform mat4 uVP; uniform mat4 uModel; out vec3 vC; out vec3 vP;
void main(){ vec4 w=uModel*vec4(aPos,1.); vP=w.xyz; vC=aCol; gl_Position=uVP*w; }`;
export const CRAFT_FS = `#version 300 es
precision highp float; in vec3 vC; in vec3 vP; uniform vec3 uSun; out vec4 o;
void main(){
  vec3 n = normalize(cross(dFdx(vP), dFdy(vP)));
  float d = max(dot(n,uSun),0.);
  float d2 = max(dot(-n,uSun),0.)*0.18;
  vec3 c = vC*(0.07 + 1.25*d + d2);
  c = 1.-exp(-c*1.2); o=vec4(pow(c,vec3(1./2.2)),1.);
}`;

export const LIDAR_VS = `#version 300 es
precision highp float; precision highp int;
layout(location=0) in vec3 aPos; layout(location=1) in float aT;
uniform mat4 uVP; uniform float uScale, uTmax, uPx, uEyeDist, uRef; uniform vec3 uEye;
out vec3 vC; out float vA;
void main(){
  vec3 p = aPos*uScale;
  float age = uTmax - aT;
  if(age < 0.0){ gl_Position = vec4(2.,2.,2.,1.); gl_PointSize = 0.; vA=0.; vC=vec3(0.); return; }
  float r = length(p);
  float h = clamp((r-uRef)/70.+.5, 0., 1.);
  vec3 low = vec3(.10,.30,.62), high = vec3(.80,.95,1.);
  vC = mix(low, high, h);
  float fresh = exp(-age/2400.);
  vC = mix(vC, vec3(1.,.92,.55), fresh*0.9);
  vA = 1.0;
  vec3 q = p*1.0015;
  gl_Position = uVP*vec4(q,1.);
  float d = length(uEye - q);
  gl_PointSize = clamp(uPx*(900./max(d,30.)) , 1.0, 7.0) * (1.0+fresh*1.6);
}`;
export const LIDAR_FS = `#version 300 es
precision highp float; in vec3 vC; in float vA; out vec4 o;
void main(){ if(vA<=0.) discard; vec2 c=gl_PointCoord-.5; if(length(c)>.5) discard; o=vec4(vC,1.); }`;

export const SAMPLE_VS = `#version 300 es
precision highp float; precision highp int;
uniform mat4 uVP; uniform vec3 uSite, uN, uT1, uT2; uniform float uTime, uPx, uCount, uBase; uniform vec3 uEye;
out float vA;
${NOISE}
void main(){
  float id = float(gl_VertexID);
  vec3 h = hash31(id*1.37+11.);
  vec3 h2 = hash31(id*3.11+5.);
  float rr = 1.0 + 7.0*h.x*h.x;
  float ang = h.y*6.2831853;
  float life = fract(h.z + uTime*(0.012+0.02*h2.x));
  float hgt = 0.08 + life*(2.0+5.0*h2.y);
  vec3 p = uSite + (cos(ang+uTime*0.05*h2.z)*uT1 + sin(ang+uTime*0.05*h2.z)*uT2)*rr*(1.0+life*0.8) + uN*(uBase+hgt);
  p += (cos(uTime*0.6+id)*uT1 + sin(uTime*0.5+id*1.7)*uT2)*0.07;
  float d = length(uEye - p);
  gl_Position = uVP*vec4(p,1.);
  gl_PointSize = clamp(uPx*(7.0/max(d,3.)), 1.0, 5.0);
  vA = smoothstep(0.,0.1,life)*smoothstep(1.,0.75,life);
}`;
export const SAMPLE_FS = `#version 300 es
precision highp float; in float vA; out vec4 o;
void main(){ vec2 c=gl_PointCoord-.5; if(length(c)>.5) discard; o=vec4(vec3(.96,.74,.30)*(0.35+0.65*vA),1.); if(vA<0.05) discard; }`;

export const GRAIN_VS = `#version 300 es
precision highp float; precision highp int;
layout(location=0) in vec3 aPos; layout(location=1) in float aSel;
uniform mat4 uVP; uniform float uPx; uniform vec3 uEye;
out float vSel;
void main(){ gl_Position=uVP*vec4(aPos,1.); float d=length(uEye-aPos); gl_PointSize=clamp(uPx*(70./max(d,4.)),10.,34.); vSel=aSel; }`;
export const GRAIN_FS = `#version 300 es
precision highp float; in float vSel; out vec4 o;
void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); if(d>.5) discard;
  vec3 gold=vec3(.95,.72,.28); vec3 col = d>.38 ? vec3(1.,.97,.88) : gold*(0.8+0.5*(0.5-d));
  if(vSel>0.5 && d>.30) col=vec3(1.); o=vec4(col,1.); }`;

export const LINE_VS = `#version 300 es
precision highp float; layout(location=0) in vec3 aPos; uniform mat4 uVP; void main(){ gl_Position=uVP*vec4(aPos,1.); }`;
export const LINE_FS = `#version 300 es
precision highp float; uniform vec4 uColor; out vec4 o; void main(){ o=uColor; }`;
export const DOT_VS = `#version 300 es
precision highp float; layout(location=0) in vec3 aPos; uniform mat4 uVP; uniform float uSize; void main(){ gl_Position=uVP*vec4(aPos,1.); gl_PointSize=uSize; }`;
export const DOT_FS = `#version 300 es
precision highp float; uniform vec4 uColor; out vec4 o; void main(){ vec2 c=gl_PointCoord-.5; if(length(c)>.5) discard; o=uColor; }`;
