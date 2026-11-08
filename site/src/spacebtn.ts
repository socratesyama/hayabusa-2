import { HAYABUSA_SIL } from './hayabusa_sil';

/**
 * 地上⇄宇宙の切替ボタン（演出E）。
 *  地上: 黒地に白いはやぶさ2 → 押すとジャンプして宇宙へ
 *  宇宙: 白地に黒いリュウグウ → 押すと地表へ戻る
 *  この世界から出入りする唯一の操作（キーボードの代替はない）
 * 見た目は「状態」に従う: 状態が変わった瞬間（ボタン・キー・自然着地のどれが原因でも）、1.5秒の粒子変形を再生する。
 *  シルエット→粒に拡散(0-30%)→粒の色と地が反転(30-50%)→粒が集まって別の形(50-100%)
 */
export type SpaceState = 'ground' | 'space';
const S = 96, N = 1500, DUR = 1500, SIZE = 76, FIT = 0.8;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)), lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const eio = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, eout = (t: number) => 1 - Math.pow(1 - t, 3);
const gray = (v: number) => `rgb(${v},${v},${v})`;

function ryugu(c: CanvasRenderingContext2D) {
  c.lineJoin = 'round'; c.lineWidth = 7; c.strokeStyle = c.fillStyle;
  const P = [[48, 11], [68, 26], [84, 46], [70, 64], [48, 85], [26, 64], [12, 46], [28, 26]];
  c.beginPath(); P.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); c.stroke();
  ([[22, 40, 5], [76, 38, 4], [60, 70, 4], [36, 72, 3.5], [50, 16, 3]] as number[][]).forEach(b => { c.beginPath(); c.arc(b[0], b[1], b[2], 0, 7); c.fill(); });
}

export class SpaceButton {
  private cv: HTMLCanvasElement; private cx: CanvasRenderingContext2D; private img = new Image(); private tints: Record<string, HTMLCanvasElement> = {};
  private HP: number[][] = []; private RP: number[][] = []; private D: number[][] = [];
  private state: SpaceState | null = null; private anim: { t0: number; from: SpaceState; to: SpaceState } | null = null; private want: SpaceState | null = null; private ready = false; private k = 1;
  private reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(private el: HTMLButtonElement, onPress?: () => void) {
    this.cv = document.createElement('canvas'); const K = devicePixelRatio || 1; this.cv.width = this.cv.height = SIZE * K; this.k = SIZE * K / S; this.el.appendChild(this.cv); this.cx = this.cv.getContext('2d')!;
    this.el.addEventListener('click', e => { if (e.detail) this.el.blur(); if (!this.anim) onPress?.(); });   // マウス/タッチ後はフォーカスを外し、Spaceが二重に効かないようにする
    this.img.onload = () => { this.HP = this.pick(this.sample(this.draw(c => this.hayabusa(c, '#000')))); this.RP = this.pick(this.sample(this.draw(c => { c.fillStyle = '#000'; ryugu(c); }))); this.ready = true; if (this.want) this.sync(this.want); };
    this.img.src = HAYABUSA_SIL;
  }
  get busy() { return !!this.anim; }
  private tinted(col: string) { if (!this.tints[col]) { const o = document.createElement('canvas'); o.width = o.height = S; const c = o.getContext('2d')!; c.drawImage(this.img, 0, 0, S, S); c.globalCompositeOperation = 'source-in'; c.fillStyle = col; c.fillRect(0, 0, S, S); this.tints[col] = o; } return this.tints[col]; }
  private hayabusa(c: CanvasRenderingContext2D, col: string) { c.drawImage(this.tinted(col), 0, 0); }
  private draw(fn: (c: CanvasRenderingContext2D) => void) { const o = document.createElement('canvas'); o.width = o.height = S; const c = o.getContext('2d')!; fn(c); return c.getImageData(0, 0, S, S).data; }
  private sample(d: Uint8ClampedArray) { const p: number[][] = []; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3] > 128) p.push([x, y]); return p; }
  private pick(m: number[][]) { return Array.from({ length: N }, () => { const p = m[(Math.random() * m.length) | 0]; return [p[0] + Math.random() - .5, p[1] + Math.random() - .5]; }); }
  private shape(c: CanvasRenderingContext2D, s: SpaceState, col: number) { if (s === 'ground') this.hayabusa(c, col > 127 ? '#fff' : '#000'); else { c.fillStyle = gray(col); ryugu(c); } }
  private label(s: SpaceState) { this.el.setAttribute('aria-label', s === 'ground' ? 'ジャンプして宇宙へ' : '地表に戻る'); this.el.title = this.el.getAttribute('aria-label')!; }
  private rest(s: SpaceState) {
    const g = s === 'ground', bg = g ? 0 : 255, fg = 255 - bg, c = this.cx; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = gray(bg); c.fillRect(0, 0, this.cv.width, this.cv.height);
    const o = S * (1 - FIT) / 2 * this.k; c.setTransform(this.k * FIT, 0, 0, this.k * FIT, o, o); this.shape(c, s, fg); this.label(s);
  }
  private frame(p: number, from: SpaceState) {
    const g = from === 'ground', A = g ? this.HP : this.RP, B = g ? this.RP : this.HP, D = this.D, c = this.cx; const bgA = g ? 0 : 255, bgB = 255 - bgA;
    const cs = eio(clamp((p - .30) / .20, 0, 1)), bg = Math.round(lerp(bgA, bgB, cs)), pc = Math.round(lerp(bgB, bgA, cs));
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = gray(bg); c.fillRect(0, 0, this.cv.width, this.cv.height); const o = S * (1 - FIT) / 2 * this.k; c.setTransform(this.k * FIT, 0, 0, this.k * FIT, o, o);
    const sp = eout(clamp(p / .30, 0, 1)), ga = eio(clamp((p - .50) / .50, 0, 1)), sIn = 1 - clamp(p / .06, 0, 1), sOut = clamp((p - .94) / .06, 0, 1);
    if (sIn > 0) { c.globalAlpha = sIn; this.shape(c, from, pc); c.globalAlpha = 1; }
    c.fillStyle = gray(pc); const r = 1.15;
    for (let i = 0; i < N; i++) { const a = A[i], b = B[i], d = D[i]; let x: number, y: number;
      if (p < .5) { x = a[0] + d[0] * sp; y = a[1] + d[1] * sp; } else { x = lerp(a[0] + d[0], b[0], ga); y = lerp(a[1] + d[1], b[1], ga); }
      if (p > .3 && p < .75) { x += Math.sin(p * 18 + i) * 1.1; y += Math.cos(p * 16 + i * 1.7) * 1.1; }
      c.fillRect(x - r, y - r, r * 2, r * 2); }
    if (sOut > 0) { c.globalAlpha = sOut; this.shape(c, g ? 'space' : 'ground', pc); c.globalAlpha = 1; }
  }
  private tick = (now: number) => {
    const a = this.anim; if (!a) return; const p = clamp((now - a.t0) / DUR, 0, 1); this.frame(p, a.from);
    if (p >= 1) { this.anim = null; this.state = a.to; this.rest(a.to); this.sync(this.want); return; } requestAnimationFrame(this.tick);
  };
  /** 毎フレーム呼ぶ: 望ましい状態(null=非表示)に合わせる。状態が変われば変形を再生 */
  sync(want: SpaceState | null) {
    this.want = want; this.el.style.display = want ? 'block' : 'none'; if (!want || !this.ready || this.anim) return;
    if (this.state === null || this.reduce) { this.state = want; this.rest(want); return; }
    if (want === this.state) return;
    this.D = this.HP.map(() => { const a = Math.random() * 6.283, l = 14 + Math.random() * 34; return [Math.cos(a) * l, Math.sin(a) * l]; });
    this.anim = { t0: performance.now(), from: this.state, to: want }; this.el.setAttribute('aria-busy', 'true'); requestAnimationFrame(this.tick);
    setTimeout(() => this.el.removeAttribute('aria-busy'), DUR);
  }
}
