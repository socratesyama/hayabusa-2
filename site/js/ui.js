import { C_KMS } from './ephem.js';
import { clamp, v3 } from './math.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const pad = (n) => String(n).padStart(2, '0');
const jst = (t) => { const d = new Date((t + 9 * 3600) * 1000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() }; };
export const fmtDate = (t) => { const j = jst(t); return `${j.y}年${j.m}月${j.d}日 ${j.h}:${pad(j.mi)}`; };
export const fmtDateS = (t) => { const j = jst(t); return `${j.y}年${j.m}月${j.d}日 ${j.h}:${pad(j.mi)}:${pad(j.s)}`; };
const fmtDay = (t) => { const j = jst(t); return `${j.y}年${j.m}月${j.d}日`; };
const iso = (t) => new Date(t * 1000).toISOString().replace('.000Z', 'Z');
const SPEEDS = [1, 60, 600, 3600, 86400, 864000];
const speedLabel = (s) => (s === 0 ? '停止' : s < 60 ? `${s}倍速` : s < 3600 ? `${Math.round(s / 60)}分/秒` : s < 86400 ? `${Math.round(s / 3600)}時間/秒` : `${Math.round(s / 86400)}日/秒`);
const deg = (r) => r * 180 / Math.PI;

export class UI {
  constructor(S, C) {
    this.S = S; this.C = C; this.scene = null; this.api = null; this.lastBag = null; this.thermalMs = null; this.discTimer = 0; this.hintTimer = 0; this.labelPool = []; this.farPool = [];
    this.buildRail(); this.buildInstruments(); this.bindChrome();
  }
  // ---------------------------------------------------------------- 起動の表示
  boot(line) {
    const ul = $('#boot'); const li = el('li', null, line); ul.appendChild(li);
    while (ul.children.length > 7) ul.removeChild(ul.firstChild);
  }
  ready() { document.body.classList.add('ready'); const b = $('#go'); b.disabled = false; b.textContent = '降り立つ'; setTimeout(() => $('#boot').classList.add('quiet'), 3600); this.viewChanged(); this.modeChanged(); this.refresh(true); }
  thermalDone(ms) { this.thermalMs = ms; this.boot(`熱モデル 1,680 通りを ${ms.toFixed(0)} ms で解いた`); }
  setSamples(s) { this.samples = s; }
  heroOut(quick) { document.body.classList.add('on'); if (quick) document.body.classList.add('instant'); $('#hero').hidden = true; }
  fade(fn) { const f = $('#fade'); f.classList.add('show'); setTimeout(() => { fn(); setTimeout(() => f.classList.remove('show'), 80); }, 420); }
  hint(text, ms = 6000) { const h = $('#hint'); h.textContent = text; h.classList.add('show'); clearTimeout(this.hintTimer); this.hintTimer = setTimeout(() => h.classList.remove('show'), ms); }
  discover(text) {
    const d = $('#discover'); d.querySelector('p').textContent = text; d.classList.add('show'); clearTimeout(this.discTimer); this.discTimer = setTimeout(() => d.classList.remove('show'), 8000);
  }

  // ---------------------------------------------------------------- 時間のレール
  buildRail() {
    const { EVENTS, tToF } = this.C; const rail = $('#rail'); this.ticks = [];
    for (const seg of this.C.RAIL) { const s = el('i', 'seg'); s.style.top = seg.f0 * 100 + '%'; s.style.height = (seg.f1 - seg.f0) * 100 + '%'; s.dataset.name = seg.name; rail.appendChild(s); }
    for (const ev of EVENTS) {
      const b = el('button', 'tick' + (ev.key ? ' key' : '')); b.style.top = tToF(ev.t) * 100 + '%'; b.setAttribute('aria-label', ev.name);
      b.appendChild(el('span', null, ev.name)); b.addEventListener('click', (e) => { e.stopPropagation(); this.goEvent(ev); });
      rail.appendChild(b); this.ticks.push({ b, ev });
    }
    const th = el('div', 'thumb'); rail.appendChild(th); this.thumb = th;
    let drag = false;
    const setF = (e) => { const r = rail.getBoundingClientRect(); const f = clamp((e.clientY - r.top) / r.height, 0, 1); const t = this.C.fToT(f); this.scrub(t); };
    rail.addEventListener('pointerdown', (e) => { if (e.target.closest('.tick')) return; drag = true; rail.setPointerCapture(e.pointerId); setF(e); });
    rail.addEventListener('pointermove', (e) => { if (drag) setF(e); });
    const end = () => { if (!drag) return; drag = false; this.api && this.api.writeUrl(); };
    rail.addEventListener('pointerup', end); rail.addEventListener('pointercancel', end);
    rail.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); this.scrub(this.S.t + (e.key === 'ArrowDown' ? 1 : -1) * 86400 * (e.shiftKey ? 30 : 1)); } });
  }
  scrub(t) {
    const S = this.S, { NEAR_T0, NEAR_T1 } = this.C; S.t = clamp(t, this.C.fToT(0), this.C.fToT(1)); S.speed = 0;
    const inNear = S.t >= NEAR_T0 && S.t <= NEAR_T1;
    if (inNear && S.view === 'far' && !S.userFar) this.api.setView('near');
    if (!inNear && S.view === 'near') this.api.setView('far');
    this.syncPlay(); this.refresh();
  }
  goEvent(ev) {
    const site = ev.site; const lead = site ? 150 : 0;
    this.api.jumpTo({ t: ev.t - lead, view: ev.view, site, speed: site ? 6 : 0, mode: site ? 0 : undefined });
    this.S.userFar = ev.view === 'far';
    this.syncPlay();
    this.discover(ev.note);
  }

  // ---------------------------------------------------------------- 観測装置
  buildInstruments() {
    const box = $('#instr');
    this.C.INSTRUMENTS.forEach((it, i) => {
      const b = el('button', 'ins'); b.dataset.i = i; b.setAttribute('aria-pressed', 'false'); b.title = it.long;
      b.appendChild(el('b', null, it.label)); b.appendChild(el('span', null, it.gloss));
      b.addEventListener('click', () => { this.api.setMode(i); this.refresh(true); });
      box.appendChild(b);
    });
  }
  modeChanged() { document.querySelectorAll('.ins').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.i === this.S.mode))); document.body.dataset.mode = this.C.MODES[this.S.mode]; this.buildCard(); this.syncPlay(); }
  viewChanged() { document.body.dataset.view = this.S.view; $('#viewbtn').textContent = this.S.view === 'near' ? '太陽系を見る' : 'リュウグウへ'; this.syncPlay(); if (this.S.view === 'far') { for (const l of this.labelPool) l.hidden = true; } else for (const l of this.farPool) l.hidden = true; }

  // ---------------------------------------------------------------- 周辺の操作
  bindChrome() {
    $('#go').addEventListener('click', () => this.api && this.api.start());
    $('#play').addEventListener('click', () => this.togglePlay());
    $('#speed').addEventListener('click', () => { const S = this.S; const i = SPEEDS.findIndex((x) => x >= (S.speed || 1)); S.speed = SPEEDS[(i + 1) % SPEEDS.length]; this.syncPlay(); });
    $('#viewbtn').addEventListener('click', () => { const S = this.S; if (S.view === 'near') { S.userFar = true; this.api.setView('far'); } else { S.userFar = false; const { NEAR_T0, NEAR_T1 } = this.C; if (S.t < NEAR_T0 || S.t > NEAR_T1) { this.api.jumpTo({ t: this.C.EVENTS.find((e) => e.id === 'arrival').t + 86400 * 20, view: 'near' }); } else this.api.setView('near'); } this.refresh(true); });
    $('#backbtn').addEventListener('click', () => this.togglePanel('back'));
    $('#sharebtn').addEventListener('click', () => this.openReport());
    $('#aboutbtn').addEventListener('click', () => this.togglePanel('about'));
    $('#aboutlink').addEventListener('click', (e) => { e.preventDefault(); this.togglePanel('about'); });
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.closePanels()));
    $('#grain-close').addEventListener('click', () => { this.S.grainSel = null; this.S.grains.forEach((g) => (g.sel = false)); $('#grain').classList.remove('show'); document.body.classList.remove('grain-open'); });
    $('#jump').addEventListener('submit', (e) => { e.preventDefault(); this.jumpForm(); });
    $('#copyurl').addEventListener('click', () => this.copy(this.api.shareUrl(), '#copyurl'));
    $('#copyjson').addEventListener('click', () => this.copy(JSON.stringify(this.exportData(), null, 2), '#copyjson'));
    $('#dljson').addEventListener('click', () => { const b = new Blob([JSON.stringify(this.exportData(), null, 2)], { type: 'application/json' }); const a = el('a'); a.href = URL.createObjectURL(b); a.download = 'ryugu_conditions.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
    addEventListener('resize', () => this.scene && this.scene.resize());
  }
  togglePlay() { const S = this.S; if (S.speed) { this._prev = S.speed; S.speed = 0; } else S.speed = this._prev || 60; this.syncPlay(); }
  syncPlay() { const S = this.S; $('#play').textContent = S.speed ? '止める' : '動かす'; $('#speed').textContent = S.speed ? speedLabel(S.speed) : '速さ'; $('#speed').disabled = !S.speed && false; }
  togglePanel(id) { const p = $('#' + id); const open = p.hidden; this.closePanels(); p.hidden = !open; document.body.classList.toggle('panel-' + id, open); if (open) p.querySelector('.x')?.focus(); }
  closePanels() { ['back', 'about', 'report'].forEach((id) => { $('#' + id).hidden = true; document.body.classList.remove('panel-' + id); }); }
  async copy(text, sel) { const b = $(sel); const old = b.dataset.l || b.textContent; b.dataset.l = old; try { await navigator.clipboard.writeText(text); b.textContent = 'コピーした'; } catch { b.textContent = '選択してコピー'; } setTimeout(() => (b.textContent = old), 1800); }
  jumpForm() {
    const f = $('#jump'); const tv = f.t.value.trim(), la = f.lat.value.trim(), lo = f.lon.value.trim(); const o = {};
    if (tv) { let s = tv.replace(' ', 'T'); if (!/(Z|[+-]\d\d:?\d\d)$/.test(s)) s += '+09:00'; const v = Date.parse(s) / 1000; if (!isNaN(v)) { o.t = v; o.speed = 0; } }
    if (la !== '' && lo !== '' && !isNaN(+la) && !isNaN(+lo)) { this.api.jumpTo({ ...o, view: 'near' }); const P = this.api.surfacePoint(+la, +lo); this.api.select(P); this.api.flySite(P, { dist: 320, el: 0.4 }); }
    else if (o.t != null) this.api.jumpTo(o);
    this.syncPlay(); this.refresh(true);
  }

  // ---------------------------------------------------------------- 地図上のラベル
  labels(pose) {
    const S = this.S, sc = this.scene; if (!sc) return; let n = 0;
    const put = (name, P, cls) => {
      const p = sc.projectNear(P); if (!p || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;
      const nrm = v3.norm(P); if (v3.dot(nrm, v3.norm(pose.eye)) < 0.25 && v3.len(pose.eye) > 600) return; // 裏側のものは出さない
      let l = this.labelPool[n]; if (!l) { l = el('div', 'lab'); $('#labels').appendChild(l); this.labelPool[n] = l; }
      n++; l.hidden = false; if (l.textContent !== name) l.textContent = name; l.className = 'lab ' + cls; l.style.transform = `translate(${(p.x * innerWidth).toFixed(1)}px,${(p.y * innerHeight).toFixed(1)}px)`;
    };
    if (S.started) {
      for (const k of ['td1', 'sci', 'td2']) { const st = this.C.SITES[k]; put(st.name, this.api.surfacePoint(st.lat, st.lon), 'site'); }
      const alt = v3.len(pose.eye);
      if (alt < 1400) for (const f of this.C.FEATURES) if (f.k !== 'ridge') put(f.n, this.api.surfacePoint(f.lat, f.lon), 'feat');
    }
    for (let i = n; i < this.labelPool.length; i++) this.labelPool[i].hidden = true;
  }
  farLabels(st) {
    const sc = this.scene; if (!sc) return; const items = [['地球', st.earth], ['リュウグウ', st.ryugu], ['太陽', [0, 0, 0]]]; if (st.craft) items.push(['はやぶさ2', st.craft]); let n = 0;
    for (const [name, P] of items) {
      const p = sc.projectFar(P); if (!p || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue;
      let l = this.farPool[n]; if (!l) { l = el('div', 'lab far'); $('#labels').appendChild(l); this.farPool[n] = l; }
      n++; l.hidden = false; l.textContent = name; l.style.transform = `translate(${(p.x * innerWidth).toFixed(1)}px,${(p.y * innerHeight).toFixed(1)}px)`;
    }
    for (let i = n; i < this.farPool.length; i++) this.farPool[i].hidden = true;
  }
  hoverAt() {}

  // ---------------------------------------------------------------- 毎フレーム
  frame() {
    const S = this.S; const f = this.C.tToF(S.t);
    this.thumb.style.top = f * 100 + '%';
    const d = fmtDay(S.t); if (d !== this._d) { this._d = d; $('#date').textContent = d; }
    const t2 = `${jst(S.t).h}:${pad(jst(S.t).mi)}`; if (t2 !== this._t2) { this._t2 = t2; $('#clock').textContent = t2 + ' 日本時間'; }
    const near = this.C.EVENTS.reduce((b, e) => (Math.abs(e.t - S.t) < Math.abs(b.t - S.t) ? e : b)); const on = Math.abs(near.t - S.t) < (near.view === 'far' ? 86400 * 40 : 3600 * 8);
    this.ticks.forEach(({ b, ev }) => b.classList.toggle('now', on && ev === near));
  }
  refresh(force) { this.frame(); if (force) this.buildCard(); }

  // ---------------------------------------------------------------- 証拠カード
  placeName(lat, lon) {
    const near = (a) => { const dl = (a.lon - lon + 540) % 360 - 180, dp = a.lat - lat; return Math.hypot(dl * Math.cos(lat * Math.PI / 180), dp) * Math.PI / 180 * 450; };
    let best = null, bd = 1e9;
    for (const s of Object.values(this.C.SITES)) { const d = near(s); if (d < bd && d < 90) { bd = d; best = s.name; } }
    for (const f of this.C.FEATURES) { if (f.k === 'ridge') continue; const d = near(f); if (d < Math.max(f.d * 0.6, 60) && d < bd) { bd = d; best = f.n; } }
    return best;
  }
  selectionChanged() { this.buildCard(); this.api && this.api.writeUrl(); }
  buildCard() {
    const c = $('#card'); const S = this.S; const mode = this.C.MODES[S.mode]; const it = this.C.INSTRUMENTS[S.mode];
    c.dataset.mode = mode; c.querySelector('.ins-name').textContent = `${it.label}　${it.gloss}`; c.querySelector('.ins-long').textContent = it.long;
    this.lastCardMode = mode;
  }
  update(bag, st, e) {
    this.lastBag = bag; const S = this.S; const sc = this.scene; if (!sc) return;
    const c = $('#card'); const mode = this.C.MODES[S.mode];
    // 場所
    const probe = bag.probe; let lat = null, lon = null;
    if (S.view === 'near' && probe) { const n = v3.norm(probe); lat = deg(Math.asin(n[2])); lon = deg(Math.atan2(n[1], n[0])); if (lon < 0) lon += 360; }
    const place = lat != null ? this.placeName(lat, lon) : null;
    const head = S.view === 'far' ? '太陽系' : (S.selected ? '選んだ地点' : S.cam.mode === 'site' ? '降りた地点' : 'リュウグウ上空');
    c.querySelector('.place').textContent = S.view === 'far' ? '太陽系' : place ? `${place}` : head;
    c.querySelector('.coords').textContent = S.view === 'far' ? `太陽から ${this.C ? (e && this.lastSun || '') : ''}` : lat != null ? `緯度 ${lat.toFixed(2)}°　経度 ${lon.toFixed(2)}°` : '';
    if (S.view === 'far') { const sa = sc.eph.sunAU(S.t); c.querySelector('.coords').textContent = `リュウグウは太陽から ${sa.toFixed(2)} au`; }
    c.querySelector('.when').textContent = fmtDate(S.t) + (S.view === 'near' && bag.alt != null ? `　高度 ${bag.alt >= 1000 ? (bag.alt / 1000).toFixed(1) + ' km' : Math.max(0, Math.round(bag.alt)) + ' m'}` : '');
    // 装置ごとの本体
    const body = c.querySelector('.body'); const sig = mode + (S.view === 'far' ? 'f' : 'n');
    if (S.view === 'far') { body.replaceChildren(el('p', 'note', S.t > this.C.EVENTS.find((x) => x.id === 'return').t ? 'はやぶさ2は、次の小惑星へ向かっている。' : 'はやぶさ2の軌道。リュウグウは、地球の軌道に近い。')); this._sig = sig; return; }
    if (mode === 'onc') this.cardOnc(body); else if (mode === 'tir') this.cardTir(body, bag); else if (mode === 'lidar') this.cardLidar(body); else this.cardSample(body);
    // 裏側
    if (!$('#back').hidden) this.fillBack(bag, st, e);
  }
  cardOnc(body) {
    const S = this.S, on = S.onc; if (!on) return; let best = null, bd = 1e12;
    for (const m of on.items) { const d = Math.abs(m.t - S.t); if (d < bd) { bd = d; best = m; } }
    const key = best && bd < 3 * 3600 ? best.f : null;
    if (key === this._onc && body.dataset.k === 'onc') { return; }
    this._onc = key; body.dataset.k = 'onc';
    if (!key) { const p = el('p', 'note', 'この時刻の観測画像はない。時間を動かすと、撮影した瞬間に出会える。'); body.replaceChildren(p); return; }
    const lab = on.labels[best.nav]; const im = el('img', 'thumbimg'); im.src = 'data/onc/' + key; im.alt = 'ONCが撮影した画像'; im.loading = 'lazy';
    const cap = el('p', 'note', `${lab ? lab.title : ''}。${fmtDate(best.t)} に撮影。©JAXA`);
    body.replaceChildren(im, cap);
  }
  cardTir(body, bag) {
    body.dataset.k = 'tir'; const T = bag.T; if (!T) { body.replaceChildren(el('p', 'note', '熱モデルを解いている。')); return; }
    const W = 220, H = 56; const mn = Math.min(...T.curve), mx = Math.max(...T.curve), sp = Math.max(mx - mn, 1);
    const pts = T.curve.map((v, i) => `${(i / 95 * W).toFixed(1)},${(H - 4 - (v - mn) / sp * (H - 10)).toFixed(1)}`).join(' ');
    const hx = (T.h / (2 * Math.PI)) * W; const hy = H - 4 - (T.T - mn) / sp * (H - 10);
    const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="自転1周分の温度曲線"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="4" class="dot"/></svg>`;
    const wrap = el('div', 'curve'); wrap.innerHTML = svg;
    const big = el('p', 'big', `${Math.round(T.T)} K`); big.appendChild(el('span', null, `　${Math.round(T.T - 273.15)} ℃　${T.sunUp ? '昼' : '夜'}`));
    const note = el('p', 'note', `熱慣性 ${Math.round(T.ti.tiu)} tiu${T.ti.measured ? '' : '(周辺からの推定)'}。自転1周で ${Math.round(mn)}〜${Math.round(mx)} K。熱モデルによる推定値で、観測値そのものではない。`);
    body.replaceChildren(big, wrap, note);
  }
  cardLidar(body) {
    body.dataset.k = 'lidar'; const sc = this.scene, S = this.S; const lt = sc.lidar; const tt = S.t - lt.t0;
    let lo = 0, hi = lt.n; while (lo < hi) { const m = (lo + hi) >> 1; if (lt.times[m] <= tt) lo = m + 1; else hi = m; }
    const big = el('p', 'big', `${lo.toLocaleString()} 点`); big.appendChild(el('span', null, `　/ ${lt.n.toLocaleString()}`));
    const note = el('p', 'note', lo === 0 ? '2018年6月30日から、レーザが測った点が現れる。時間を動かす。' : 'レーザが往復する時間から、一点ずつ距離を測った。実測の点だけを描いている。');
    body.replaceChildren(big, note);
  }
  cardSample(body) {
    body.dataset.k = 'sample'; if (body.querySelector('.mass')) return;
    const m = el('div', 'mass'); m.innerHTML = `<div class="m"><i class="d big"></i><span>約5.4 g<br>持ち帰った</span></div><div class="m"><i class="d small"></i><span>0.1 g<br>目標の最小値</span></div>`;
    const note = el('p', 'note', '2か所で採った粒が、地球に届いた。浮かぶ粒をタップすると、実物の顕微鏡画像が開く。');
    body.replaceChildren(m, note);
  }
  grainChanged(g) {
    const s = this.samples && this.samples[g.id]; if (!s) return; const p = $('#grain'); p.classList.add('show'); document.body.classList.add('grain-open');
    p.querySelector('h3').textContent = g.id; p.querySelector('.where').textContent = `${s.site === 'TD1' ? '第1回' : '第2回'}タッチダウン　チャンバー${s.chamber}`;
    const img = p.querySelector('img'); img.src = 'data/' + s.img; img.alt = `${g.id}の顕微鏡画像`;
    const sv = p.querySelector('.spec');
    if (s.spec) {
      const W = 300, H = 120, x0 = 2.3, x1 = 4.2; const ys = s.spec.y; const mn = Math.min(...ys), mx = Math.max(...ys), sp = Math.max(mx - mn, 1e-6);
      const pts = s.spec.x.map((x, i) => `${((x - x0) / (x1 - x0) * W).toFixed(1)},${(H - 6 - (ys[i] - mn) / sp * (H - 14)).toFixed(1)}`).join(' ');
      const tick = (x) => `<text x="${((x - x0) / (x1 - x0) * W).toFixed(1)}" y="${H + 14}" text-anchor="middle">${x}</text>`;
      const x27 = (2.7 - x0) / (x1 - x0) * W;
      sv.innerHTML = `<svg viewBox="0 0 ${W} ${H + 20}" role="img" aria-label="赤外線スペクトル"><rect x="${(x27 - 3).toFixed(1)}" y="0" width="6" height="${H}" class="band"/><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5"/>${tick(2.5)}${tick(3)}${tick(3.5)}${tick(4)}</svg>`;
      p.querySelector('.specnote').textContent = '横軸は波長(µm)。2.7 µm付近の落ち込みは、水酸基を含む鉱物のしるし。FTIRによる実測。';
    } else { sv.replaceChildren(); p.querySelector('.specnote').textContent = ''; }
    p.querySelector('.credit').textContent = '画像・スペクトル: JAXA／ISAS 分析チーム公開データ';
  }

  // ---------------------------------------------------------------- 裏側
  fillBack(bag, st, e) {
    const S = this.S, sc = this.scene, eph = sc.eph; const set = (id, v) => { const n = $('#b-' + id); if (n && n.textContent !== v) n.textContent = v; };
    const et = (S.t - 946728000 + 69.184);
    set('et', et.toFixed(1) + ' s'); set('w', (deg(e.W) % 360 + 360 % 360).toFixed(2) + '°');
    const sb = S.sunBody; if (sb) { set('sub', `緯度 ${deg(Math.asin(sb[2])).toFixed(2)}°　経度 ${((deg(Math.atan2(sb[1], sb[0])) + 360) % 360).toFixed(2)}°`); }
    set('au', eph.sunAU(S.t).toFixed(4) + ' au'); set('delay', st.craftEarthKm ? (st.craftEarthKm / C_KMS).toFixed(1) + ' 秒(探査機と地球)' : '—');
    set('lut', this.thermalMs != null ? this.thermalMs.toFixed(0) + ' ms' : '計算中'); set('fps', bag.fps.toFixed(0) + ' fps');
    set('tris', `${sc.stats.tris.toLocaleString()} 面`); set('lidar', `${sc.stats.lidar.toLocaleString()} 点`);
    set('track', `${eph.proxT.length.toLocaleString()} 時刻`);
  }

  // ---------------------------------------------------------------- 探査レポートと研究者向け出力
  exportData() {
    const S = this.S, sc = this.scene; const b = this.lastBag || {}; const out = { generated_by: 'RYUGU unofficial fan site', time_utc: iso(S.t), et_s: +(S.t - 946728000 + 69.184).toFixed(3), instrument: this.C.MODES[S.mode], view: S.view, url: this.api.shareUrl() };
    if (b.probe) { const n = v3.norm(b.probe); out.lat_deg = +deg(Math.asin(n[2])).toFixed(3); out.lon_deg_east = +((deg(Math.atan2(n[1], n[0])) + 360) % 360).toFixed(3); }
    if (b.T) { out.thermal_model = { temperature_K: +b.T.T.toFixed(1), thermal_inertia_tiu: +b.T.ti.tiu.toFixed(0), note: 'model estimate (1D thermal model), not an observation' }; }
    if (S.onc) { let best = null, bd = 1e12; for (const m of S.onc.items) { const d = Math.abs(m.t - S.t); if (d < bd) { bd = d; best = m; } } if (best && bd < 86400) out.nearest_onc_image = { file: best.f, time_utc: iso(best.t), operation: best.nav, delta_s: Math.round(bd) }; }
    out.sources = { archive: 'https://data.darts.isas.jaxa.jp/', mission: 'https://www.hayabusa2.jaxa.jp/', spice: sc.eph.meta.sources, license: 'Data: JAXA/ISAS/DARTS (CC BY 4.0). ©JAXA' };
    out.grains_opened = [...S.log.grains];
    return out;
  }
  openReport() {
    const S = this.S, L = S.log; const r = $('#report'); this.closePanels(); r.hidden = false; document.body.classList.add('panel-report');
    const dwell = Object.entries(L.dwell).sort((a, b) => b[1] - a[1])[0];
    const total = Object.values(L.instr).reduce((a, b) => a + b, 0) || 1;
    const names = { onc: 'ONC', tir: 'TIR', lidar: 'LIDAR', sample: 'SAMPLE' };
    const main = Object.entries(L.instr).sort((a, b) => b[1] - a[1])[0];
    const lines = [];
    lines.push(`この探査の時刻は ${fmtDate(S.t)}(日本時間)。`);
    if (dwell) { const [la, lo] = dwell[0].split(','); lines.push(`いちばん長くいたのは、緯度${la}°、経度${lo}°のあたり。約${Math.max(1, Math.round(dwell[1]))}秒、滞在した。`); }
    lines.push(`使った時間が最も長い装置は ${names[main[0]]}(${Math.round(main[1] / total * 100)}%)。`);
    lines.push(L.disc.size ? `出会った発見は ${L.disc.size} 件。` : 'まだ発見カードには出会っていない。降りて、時間を動かしてみる。');
    if (L.grains.size) lines.push(`顕微鏡で見た粒は ${[...L.grains].join('、')}。`);
    const list = r.querySelector('.lines'); list.replaceChildren(...lines.map((t) => el('p', null, t)));
    r.querySelector('.urlbox').value = this.api.shareUrl();
    r.querySelector('.urlbox').onfocus = (e) => e.target.select();
  }
}
