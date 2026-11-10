// 走行中の視界に重ねる地名・イベント注釈（ラベル層 + カード本文）。
// 地形への色付けは terrain.ts のシェーダ（Terrain.setFeatures）、ここは画面座標のラベルと、タップで開く説明を担当する。
import * as THREE from 'three';
import { V3, v3, bodyToThree, threeToBody, fmtLat, fmtLon, surfDist } from './geo';
import { PFeature, KIND_STYLE, candidatePoints, guidePoint, distanceTo, lineOfSight, regionsAt, eventState, eventChip, shaderAlpha, fmtDist, fmtExtent, STAY_END_MS } from './features_core';
import { fmtJST } from './time';
import { esc } from './ui';

export interface AnnotHooks {
  radiusAt(dir: V3): number;   // 単位方向 → 地面の半径(m)（高さ地図）
  open(id: string): void;      // ラベルのタップ
}
export interface ShaderItem { dir: V3; angR: number; band: boolean; rgb: [number, number, number]; alpha: number; }
export type TierMode = 0 | 1 | 2;   // のんびり / じっくり / せんもん

const MAX_LABELS = 7;        // 実際に見えている地物のラベル数の上限
const MAX_GUIDE = 4;         // 見えない地物の「方向の案内」の上限（近い順）
const FAR_SMALL_M = 500;     // 半径20m未満の小さな地点は、これより遠いとラベルを出さない（点にしかならない）

type LabelMode = 'vis' | 'hid' | 'edge';
interface Placed { p: PFeature; x: number; y: number; dist: number; score: number; w: number; sel: boolean; inside: boolean; mode: LabelMode; rot: number; right: boolean; }

export class Annotator {
  enabled = true;
  selectedId: string | null = null; private selUntil = 0;
  /** 直近フレームで画面に出した地物（実際に見えているもの / 方向の案内）。デバッグ・検証用 */
  visibleIds: string[] = []; guideIds: string[] = [];
  private root: HTMLElement; private pool = new Map<string, HTMLButtonElement>(); private keyOf = new Map<string, string>(); private lastShown = new Set<string>();
  private tmp = new THREE.Vector3();

  constructor(public feats: PFeature[], private hooks: AnnotHooks) {
    this.root = document.createElement('div'); this.root.id = 'annot'; this.root.setAttribute('aria-hidden', 'true'); document.body.appendChild(this.root);
  }
  select(id: string | null, ms = 9000) { this.selectedId = id; this.selUntil = id ? performance.now() + ms : 0; }
  private get focus(): string | null { return this.selectedId && performance.now() < this.selUntil ? this.selectedId : null; }

  /** いまの位置（単位方向）を含む地物。小さいものから。 */
  whereAmI(dir: V3): PFeature[] { return regionsAt(this.feats, dir, 0); }
  find(id: string): PFeature | undefined { return this.feats.find(f => f.id === id); }

  /** terrain.setFeatures に渡す項目（置ける地物のみ） */
  shaderItems(nowMs: number): ShaderItem[] {
    if (!this.enabled) return [];
    const foc = this.focus;
    return this.feats.filter(p => p.placed).map(p => ({
      dir: p.dir, angR: p.angR, band: p.shape === 'band', rgb: KIND_STYLE[p.kind].rgb, alpha: shaderAlpha(p, nowMs, p.id === foc),
    }));
  }

  hideAll() { for (const el of this.pool.values()) el.classList.add('off'); this.lastShown.clear(); this.visibleIds = []; this.guideIds = []; }

  /** 毎フレーム: 視界に入り地形に遮られていない地物にラベルを出す。見えない近くの地物は、方向の案内（地形の陰 / 画面端の矢印）にする。
   *  camera は lookAt 済みであること。guide=false（高い高度の飛行中など）では案内を出さない。 */
  update(camera: THREE.PerspectiveCamera, nowMs: number, on: boolean, eyeBody: V3, guide = true) {
    if (!on || !this.enabled) { this.hideAll(); return; }
    camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    const W = innerWidth, H = innerHeight; const foc = this.focus; const eyeDir = v3.norm(eyeBody);
    const inside = new Set(this.whereAmI(eyeDir).map(p => p.id));
    const vis: Placed[] = []; const gd: Placed[] = [];
    for (const p of this.feats) {
      if (!p.placed) continue;
      const isSel = p.id === foc; const isIn = inside.has(p.id);
      let best: { x: number; y: number; d2: number; dist: number } | null = null;
      for (const du of candidatePoints(p)) {
        const pos = v3.mul(du, this.hooks.radiusAt(du) + 0.3);
        const t = bodyToThree(pos); this.tmp.set(t[0], t[1], t[2]).project(camera);
        if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 0.94 || Math.abs(this.tmp.y) > 0.86) continue;   // 背後・画面外（端は切れないよう余白）
        const dist = v3.len(v3.sub(pos, eyeBody));
        const d2 = this.tmp.x * this.tmp.x + this.tmp.y * this.tmp.y;
        if (best && d2 >= best.d2) continue;
        if (!lineOfSight(eyeBody, pos, this.hooks.radiusAt)) continue;   // 地形の陰は「見えている」扱いにしない
        best = { x: (this.tmp.x + 1) / 2 * W, y: (1 - this.tmp.y) / 2 * H, d2, dist };
      }
      const wasShown = this.lastShown.has(p.id);
      const w = 30 + p.short_ja.length * 13 + 56;
      if (best && (isSel || p.radius_m >= 20 || best.dist <= FAR_SMALL_M)) {
        const score = p.priority * 100 + (isSel ? 1000 : 0) + (wasShown ? 35 : 0) + (isIn ? 20 : 0) - Math.min(90, best.dist / 40);
        vis.push({ p, x: best.x, y: best.y, dist: best.dist, score, w, sel: isSel, inside: isIn, mode: 'vis', rot: 0, right: false });
        continue;
      }
      if (!guide || isIn) continue;
      // 見えない: 中心（帯は最寄りの赤道）の方向を案内する。画面内なら「地形の陰」、画面外なら画面端の矢印。
      const gp = guidePoint(p, eyeDir); if (!gp) continue;
      const surf = distanceTo(p, eyeDir);
      const gpos = v3.mul(gp, this.hooks.radiusAt(gp) + 0.3); const t = bodyToThree(gpos); this.tmp.set(t[0], t[1], t[2]).project(camera);
      let nx = this.tmp.x, ny = this.tmp.y; const behind = this.tmp.z > 1; if (behind) { nx = -nx; ny = -ny; }
      const onScreen = !behind && Math.abs(nx) <= 0.94 && Math.abs(ny) <= 0.86;
      const m = Math.max(Math.abs(nx) / 0.94, Math.abs(ny) / 0.86, 1e-6); const sx = onScreen ? nx : nx / m * 0.94, sy = onScreen ? ny : ny / m * 0.86;
      gd.push({ p, x: (sx + 1) / 2 * W, y: (1 - sy) / 2 * H, dist: surf, score: -surf + p.priority * 40 + (wasShown ? 30 : 0), w: w + 24, sel: isSel, inside: false,
        mode: onScreen ? 'hid' : 'edge', rot: Math.atan2(-sy, sx), right: sx > 0.35 });
    }
    vis.sort((a, b) => b.score - a.score); gd.sort((a, b) => b.score - a.score);
    const placed: Placed[] = [];
    const fits = (it: Placed) => !placed.some(o => it.x < o.x + o.w + 6 && o.x < it.x + it.w + 6 && Math.abs(it.y - o.y) < 30);
    for (const it of vis) { if (placed.length >= MAX_LABELS) break; if (fits(it)) placed.push(it); }
    let ng = 0; for (const it of gd) { if (ng >= MAX_GUIDE) break; if (fits(it)) { placed.push(it); ng++; } }
    const now = new Set<string>();
    for (const it of placed) {
      now.add(it.p.id);
      const el = this.el(it.p);
      const st = eventState(it.p, nowMs);
      const rotK = Math.round(it.rot / (Math.PI / 12));
      const key = `${it.mode}|${fmtDist(it.dist)}|${st}|${it.inside ? 1 : 0}|${it.sel ? 1 : 0}|${it.mode === 'edge' ? rotK : 0}|${it.right ? 1 : 0}`;
      if (this.keyOf.get(it.p.id) !== key) {
        this.keyOf.set(it.p.id, key);
        const ks = KIND_STYLE[it.p.kind];
        el.classList.toggle('sel', it.sel); el.classList.toggle('future', st === 'before'); el.classList.toggle('in', it.inside);
        el.classList.toggle('hid', it.mode === 'hid'); el.classList.toggle('edge', it.mode === 'edge'); el.classList.toggle('rt', it.mode === 'edge' && it.right);
        const mark = it.mode === 'edge'
          ? `<i class="ar" style="color:${ks.css};transform:rotate(${(rotK * 15)}deg)">➤</i>`
          : `<i class="ag" style="color:${ks.css}">${ks.glyph}</i>`;
        el.innerHTML = mark + `<span class="an">${esc(it.p.short_ja)}</span>` +
          (it.inside ? '<span class="ac">ここ</span>' : `<span class="ad">${fmtDist(it.dist)}</span>`) +
          (it.mode === 'hid' ? '<span class="ac">地形の陰</span>' : '') + (st === 'before' ? '<span class="ac">これから</span>' : '');
        const where = it.mode === 'vis' ? '' : it.mode === 'hid' ? '。いまは地形の陰で見えません' : '。画面の外です';
        el.setAttribute('aria-label', `${it.p.short_ja}、${ks.label}、${fmtDist(it.dist)}${where}。タップで由来と出来事`);
      }
      el.style.transform = `translate3d(${Math.round(it.x)}px,${Math.round(it.y)}px,0)`; el.classList.remove('off');
    }
    for (const [id, el] of this.pool) if (!now.has(id)) el.classList.add('off');
    this.lastShown = now;
    this.visibleIds = placed.filter(i => i.mode === 'vis').map(i => i.p.id); this.guideIds = placed.filter(i => i.mode !== 'vis').map(i => i.p.id);
  }

  private el(p: PFeature): HTMLButtonElement {
    let el = this.pool.get(p.id);
    if (!el) {
      el = document.createElement('button'); el.type = 'button'; el.className = `al k-${p.kind} off`; el.tabIndex = -1; el.dataset.feat = p.id;
      el.style.setProperty('--c', KIND_STYLE[p.kind].css);
      el.addEventListener('click', e => { e.stopPropagation(); this.hooks.open(p.id); });
      // ラベルの上でのタッチ/ドラッグが視点操作に流れないようにする
      for (const ev of ['touchstart', 'touchmove', 'mousedown']) el.addEventListener(ev, e => e.stopPropagation(), { passive: true });
      this.root.appendChild(el); this.pool.set(p.id, el);
    }
    return el;
  }
}

// ---------------- カード本文 ----------------
export interface CardCtx { nowMs: number; mode: TierMode; evTitle(id: string): string | undefined; canTravel: boolean; }

function fmtEventTime(ms: number, precision: string, utc: string): string {
  return precision === 'date' ? `${utc.slice(0, 10)}（日付のみ）` : fmtJST(ms);
}
const num = (v: number | null | undefined, d = 1) => v == null ? '—' : v.toFixed(d);

export function featureCard(p: PFeature, ctx: CardCtx): { title: string; html: string } {
  const ks = KIND_STYLE[p.kind]; const m = ctx.mode;
  const chips: string[] = [`<span class="fchip k" style="--c:${ks.css}">${ks.glyph} ${esc(ks.label)}</span>`];
  if (p.placed) {
    chips.push(p.shape === 'band' ? '<span class="fchip">赤道</span>' : `<span class="fchip">${fmtLat(p.lat!)} ${fmtLon(p.lon!)}</span>`);
    chips.push(`<span class="fchip">${esc(fmtExtent(p))}</span>`);
  } else chips.push('<span class="fchip">座標は公表されていません</span>');
  if (p.iau) chips.push(`<span class="fchip">IAU承認 ${esc(p.iau.approved)}</span>`);
  else if (p.nickname) chips.push(`<span class="fchip">愛称（IAU非公式）</span>`);

  const parts: string[] = [`<p class="fchips">${chips.join('')}</p>`, `<p>${esc(p.summary_ja)}</p>`];
  if (p.origin_ja) parts.push(`<h3>${p.iau ? '名前の由来' : '愛称の由来'}</h3><p>${esc(p.origin_ja)}</p>`);

  const evs = p.events.map((e, i) => ({ e, ms: p.eventMs[i] }));
  const showEv = m === 0 ? evs.slice(0, 1) : evs;
  if (showEv.length) {
    parts.push('<h3>ここで起きたこと</h3>');
    for (const { e, ms } of showEv) {
      const ch = eventChip(ms, ctx.nowMs);
      parts.push(`<div class="fev"><div class="fevh"><b>${esc(fmtEventTime(ms, e.precision, e.utc))}</b><span class="fchip ${ch.cls}">${esc(ch.text)}</span></div><div>${esc(e.title)} — ${esc(e.text)}</div></div>`);
    }
    if (evs.some(x => x.ms > ctx.nowMs && x.ms <= STAY_END_MS)) parts.push('<p class="lnote">下のスライダーで時間を進めると、その瞬間にここで何が起きるか見られます。</p>');
  }
  if (m >= 1) parts.push(`<h3>点群で確かめた位置</h3><p>${esc(p.evidence_ja)}</p>`);
  if (m >= 2) {
    const ev = p.evidence;
    const rows: string[] = [];
    if (p.coord_note) rows.push(`<tr><th>座標の根拠</th><td>${esc(p.coord_note)}</td></tr>`);
    rows.push(`<tr><th>表示範囲</th><td>${esc(p.extent_note)}</td></tr>`);
    if (ev && Object.keys(ev).length) rows.push(`<tr><th>点群の実測値</th><td>標高 ${num(ev.elevation_m)}m（平均半径448.8m基準）/ 中心付近の点 ${ev.n_points_near_centre ?? '—'}個` +
      (ev.rim_minus_centre_m != null ? ` / 縁−中心 ${num(ev.rim_minus_centre_m)}m` : '') + '</td></tr>');
    parts.push(`<table class="ftab">${rows.join('')}</table>`);
    if (p.sources.length) parts.push('<p class="lnote">出典: ' + p.sources.map(s => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)).join(' / ') + '</p>');
  }
  const acts: string[] = [];
  if (p.placed && ctx.canTravel) acts.push(`<button type="button" class="fbtn" data-act="go">ここへ行く（演出E）</button>`);
  for (const id of p.event_ids) { const t = ctx.evTitle(id); if (t) acts.push(`<button type="button" class="fbtn" data-act="ev" data-ev="${esc(id)}">出来事: ${esc(t)}</button>`); }
  if (acts.length) parts.push(`<div class="fact">${acts.join('')}</div>`);
  const title = p.iau ? `${p.name_ja}（${p.name_en}）` : p.name_ja;
  return { title, html: parts.join('') };
}

/** 地名・出来事リスト（Lキー）: 視界に入っていなくても、すべての収録地点に触れる入口 */
export function placesListHtml(feats: PFeature[], here: { lat: number; lon: number }, insideIds: Set<string>): string {
  const dist = (p: PFeature) => p.placed && p.shape === 'cap' ? surfDist(here.lat, here.lon, p.lat!, p.lon!) : Infinity;
  const row = (p: PFeature) => {
    const ks = KIND_STYLE[p.kind]; const d = dist(p);
    const right = insideIds.has(p.id) ? 'いまここ' : !p.placed ? '座標なし' : p.shape === 'band' ? '赤道' : fmtDist(d);
    return `<button class="lrow" type="button" data-feat="${esc(p.id)}"><span><i class="ag" style="color:${ks.css}">${ks.glyph}</i> ${esc(p.short_ja)}</span><span class="n">${esc(ks.label)}　${esc(right)}</span></button>`;
  };
  const mission = feats.filter(p => ['touchdown', 'impact', 'lander', 'marker', 'rover', 'candidate'].includes(p.kind)).sort((a, b) => b.priority - a.priority || dist(a) - dist(b));
  const terrain = feats.filter(p => ['crater', 'dorsum', 'fossa', 'saxum'].includes(p.kind)).sort((a, b) => b.priority - a.priority || dist(a) - dist(b));
  return `<p class="lnote">名前を選ぶと、由来と、そこで起きたことが開きます。走行中は、視界に入った地形に名前が重なります（Nキーで表示切替）。</p>` +
    `<h3>ミッションの場所（タッチダウン・着陸機など）</h3>${mission.map(row).join('')}<h3>リュウグウの地形名（IAU承認）</h3>${terrain.map(row).join('')}`;
}

export { threeToBody };
