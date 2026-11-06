import { Ephem } from './ephem.js';
import { Scene } from './scene.js';
import { Pencil } from './pencil.js';
import { v3, m3, clamp, ease } from './math.js';
import { SITES, UTC } from './events.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const pad = (n) => String(n).padStart(2, '0');
const jst = (t) => { const d = new Date((t + 9 * 3600) * 1000); return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${d.getUTCHours()}:${pad(d.getUTCMinutes())}`; };
const SECS = ['ryugu', 'shape', 'touchdown', 'sci', 'observation', 'samples'];
const T_SUN0 = UTC(2018, 7, 1), T_SUN1 = UTC(2019, 11, 1);
const R0 = 2300;

const S = { sec: 'ryugu', light: 'studio', site: 'td1', started: false, ready: false, clock: 0, tSun: UTC(2019, 2, 21, 22, 29), reveal: 0, revealT0: null, hold: 0, picked: null, off: 0, offv: 0, style: 'pencil', dark: 0, form: 1, formPlay: false, zoomed: false,
  cam: { az: 0.8, el: 0.35, dist: 5200, tg: [0, 0, 0] }, camT: { az: 0.8, el: 0.35, dist: R0, tg: [0, 0, 0] } };
const eph = new Ephem(); let scene, pencil, samples, onc, ctx2;

// ------------------------------------------------------------------ 起動
async function boot() {
  makePaper();
  await eph.load('data/');
  scene = new Scene($('#gl'), eph);
  await scene.init(() => {}, { light: true });
  pencil = new Pencil(); const n = await pencil.init(scene); S.n = n; pencil.ink = 1.15; $("#ink").value = 1.15;
  [samples, onc] = await Promise.all([fetch('data/samples.json').then((r) => r.json()), fetch('data/onc_manifest.json').then((r) => r.json())]);
  buildPanels(); bind(); readUrl();
  S.ready = true; $('#enter').disabled = false; S.revealT0 = performance.now();
  requestAnimationFrame(loop);
  window.__atlas = { S, scene, pencil, go, setStyle };
}
function makePaper() { // 紙の目: 小さなノイズを敷き詰める
  const c = document.createElement('canvas'); c.width = c.height = 220; const g = c.getContext('2d'); const im = g.createImageData(220, 220);
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < im.data.length; i += 4) { const v = 232 + Math.floor(rnd() * 23); im.data[i] = im.data[i + 1] = v; im.data[i + 2] = v - 3; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0); $('#paper').style.backgroundImage = `url(${c.toDataURL()})`;
}

// ------------------------------------------------------------------ 座標
function sunBody(t) { return m3.applyT(eph.bodyToEcl(t).b2e, eph.sunDirEcl(t)); }
function surfacePoint(lat, lon) {
  const la = lat * Math.PI / 180, lo = lon * Math.PI / 180; const u = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  return v3.mul(u, scene.surfaceRadius(u));
}
const sitePt = {}; const sp = (k) => (sitePt[k] ||= surfacePoint(SITES[k].lat, SITES[k].lon));
function eyeOf(c) { return v3.add(c.tg, [c.dist * Math.cos(c.el) * Math.cos(c.az), c.dist * Math.cos(c.el) * Math.sin(c.az), c.dist * Math.sin(c.el)]); }

// ------------------------------------------------------------------ 章の切り替え
function go(sec, opts = {}) {
  if (!SECS.includes(sec)) sec = 'ryugu';
  if (sec !== 'shape' && sec !== 'ryugu' && S.style === 'form') setStyle('pencil');
  S.sec = sec; document.body.dataset.sec = sec; S.started = S.started || sec !== 'ryugu';
  $$('#nav button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.go === sec)));
  const sheet = $('#sheet'); sheet.hidden = sec === 'ryugu';
  $$('#sheet section').forEach((x) => (x.hidden = x.dataset.sec !== sec));
  if (sec === 'sci') S.site = 'sci'; if (sec === 'touchdown' && S.site === 'sci') S.site = 'td1';
  if (opts.site) S.site = opts.site;
  // カメラと光
  if (sec === 'touchdown' || sec === 'sci') { S.light = 'sun'; S.tSun = SITES[S.site].t - 600; flyTo(S.site); syncLightUi(); renderSite(); }
  else { flyHome(); if (sec === 'ryugu') { S.light = 'studio'; syncLightUi(); } }
  $$('[data-site]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.site === S.site)));
  history.replaceState(null, '', sec === 'ryugu' ? location.pathname : `?s=${sec}${sec === 'touchdown' || sec === 'sci' ? '&site=' + S.site : ''}`);
  sheet.scrollTop = 0;
}
function flyHome() { S.camT.tg = [0, 0, 0]; S.camT.dist = R0; S.camT.el = 0.35; S.picked = null; }
function flyTo(k) {
  const P = sp(k), n = v3.norm(P); S.camT.tg = P; S.camT.dist = k === 'sci' ? 150 : 260;
  S.camT.az = Math.atan2(n[1], n[0]) + 0.9; S.camT.el = clamp(Math.asin(n[2]) * 0.3 + 0.5, 0.3, 1.0);
  S.picked = null;
}
function syncLightUi() {
  $$('[data-light]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.light === S.light)));
  $('#timebox').hidden = S.light !== 'sun';
  const f = (S.tSun - T_SUN0) / (T_SUN1 - T_SUN0); $('#tsun').value = clamp(f, 0, 1); $('#tsun-out').textContent = jst(S.tSun);
}

// ------------------------------------------------------------------ 画面の内容
function tag(c, t) { return `<i class="tag ${c}">${t}</i>`; }
function photo(item, cap) {
  const f = el('figure', 'photo'); const im = el('img'); im.src = 'data/onc/' + item.f; im.alt = 'ONCが撮影した画像'; im.loading = 'lazy'; im.width = 360; im.height = 360;
  im.addEventListener('click', () => lightbox(im.src, `${cap}　©JAXA`)); f.append(im, el('figcaption', null, `${cap}　©JAXA`)); return f;
}
function nearestImages(nav, n, around) { // その運用日の画像から、時刻の近いものを選ぶ
  const items = onc.items.filter((i) => i.nav === nav).sort((a, b) => Math.abs(a.t - around) - Math.abs(b.t - around)); return items.slice(0, n).sort((a, b) => a.t - b.t);
}
function renderSite() {
  const k = S.site; const st = SITES[k];
  if (S.sec === 'touchdown') {
    const b = $('#td-body'); b.replaceChildren();
    const rows = {
      td1: { nick: 'タマテバコ(玉手箱)', date: jst(st.t) + '(日本時間)', pos: '緯度 4.30°、経度 206.47°', note: '直径6mの領域をねらって降り、弾丸を撃って表面の物質を採りました。試料はチャンバーAに入っています。', nav: 'nav20190221', navLabel: '第1回タッチダウンの前後に撮った画像' },
      td2: { nick: 'ウチデノコヅチ(打出の小槌)', date: jst(st.t) + '(日本時間)', pos: '緯度 10.13°、経度 300.60°', note: '人工クレーターの中心から北へ約20 mの場所に降り、地下の物質を採りました。試料はチャンバーCに入っています。', nav: 'nav20190710', navLabel: '第2回タッチダウンの前後に撮った画像', alt: '資料によっては北緯10.04°とも書かれています。' },
    }[k];
    const d = el('div'); d.innerHTML = `<p class="td-title">${rows.nick}</p><dl class="facts"><dt>日時</dt><dd class="num">${rows.date} ${tag('obs', '実測')}</dd><dt>場所</dt><dd class="num">${rows.pos} ${tag('derived', '計算')}<small>公表された地点の座標です。${rows.alt || ''}地図上の位置は、形状モデルの表面に合わせています。</small></dd><dt>記録</dt><dd>${rows.note}</dd></dl><p class="small">いまの光は、この日時の太陽の向きです。${tag('derived', '計算')}</p>`;
    b.append(d);
    nearestImages(rows.nav, 2, st.t).forEach((it) => b.append(photo(it, `${rows.navLabel}　${jst(it.t)}`)));
  } else if (S.sec === 'sci') {
    const b = $('#sci-body'); b.replaceChildren(); const d = el('div');
    d.innerHTML = `<p class="td-title">おむすびころりん</p><p>2019年4月5日、小型の衝突装置(SCI)が、2 kgの銅の弾を表面にぶつけ、人工のクレーターを作りました。</p><dl class="facts"><dt>日時</dt><dd class="num">${jst(SITES.sci.t)}(日本時間) ${tag('obs', '実測')}</dd><dt>場所</dt><dd class="num">緯度 7.90°、経度 313.30° ${tag('derived', '計算')}</dd><dt>大きさ</dt><dd class="num">見かけの直径 14.5 m、深さ 1.7 m ${tag('obs', '実測')}<small>縁と縁のあいだは17.6 mです。</small></dd><dt>その後</dt><dd>約3か月後の第2回タッチダウンで、中心から北へ約20 mの地点の地下物質を採りました。</dd></dl>
    <div class="schema"><svg viewBox="0 0 320 120" role="img" aria-label="クレーターの断面の模式図"><path d="M12 40 C70 40 90 42 112 46 C130 50 140 86 160 88 C180 86 190 50 208 46 C230 42 250 40 308 40"/><line x1="112" y1="102" x2="208" y2="102"/><text x="128" y="116">14.5 m</text><line x1="228" y1="40" x2="228" y2="88"/><text x="234" y="68">1.7 m</text></svg><p class="small">${tag('illus', '説明用')}幅と深さの比(14.5 : 1.7)に合わせた断面の模式図です。実際の地形ではありません。</p></div>`;
    b.append(d);
    [['nav20190404', '衝突の前後に撮った画像'], ['nav20190424', '人工クレーターを確かめた画像']].forEach(([nav, lab]) => nearestImages(nav, 1, SITES.sci.t + (nav === 'nav20190424' ? 20 * 86400 : 0)).forEach((it) => b.append(photo(it, `${lab}　${jst(it.t)}`))));
  }
}
function buildObservation() {
  const b = $('#obs-body'); b.replaceChildren(); const labels = onc.labels;
  for (const nav of Object.keys(labels)) {
    const g = el('div', 'obs-group'); g.append(el('h3', null, labels[nav].title), el('p', 'when', labels[nav].date));
    const items = onc.items.filter((i) => i.nav === nav); const pick = [items[1], items[Math.floor(items.length / 2)], items[items.length - 2]].filter(Boolean);
    const row = el('div', 'obs-row');
    for (const it of pick) { const f = el('figure'); const im = el('img'); im.src = 'data/onc/' + it.f; im.alt = `${labels[nav].title}のONC画像`; im.loading = 'lazy'; im.width = 120; im.height = 120;
      im.addEventListener('click', () => lightbox(im.src, `${labels[nav].title}　${jst(it.t)}　©JAXA`)); f.append(im, el('figcaption', null, jst(it.t))); row.append(f); }
    g.append(row); b.append(g);
  }
}
function buildSamples() {
  const b = $('#smp-body'); b.replaceChildren();
  for (const [id, s] of Object.entries(samples)) {
    const g = el('div', 'grain'); g.append(el('h3', null, id), el('p', 'where', `${s.site === 'TD1' ? '第1回' : '第2回'}タッチダウン、チャンバー${s.chamber}`));
    const im = el('img'); im.src = 'data/' + s.img; im.alt = `${id}の顕微鏡画像`; im.loading = 'lazy'; im.width = 360; im.height = 360; g.append(im);
    if (s.spec) {
      const W = 300, H = 110, x0 = 2.3, x1 = 4.2, ys = s.spec.y, mn = Math.min(...ys), mx = Math.max(...ys), sp_ = Math.max(mx - mn, 1e-6);
      const pts = s.spec.x.map((x, i) => `${((x - x0) / (x1 - x0) * W).toFixed(1)},${(H - 6 - (ys[i] - mn) / sp_ * (H - 14)).toFixed(1)}`).join(' ');
      const x27 = (2.7 - x0) / (x1 - x0) * W; const tk = (x) => `<text x="${((x - x0) / (x1 - x0) * W).toFixed(1)}" y="${H + 14}" text-anchor="middle">${x}</text>`;
      const sv = el('div', 'spec'); sv.innerHTML = `<svg viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="赤外線スペクトル"><rect class="band" x="${(x27 - 3).toFixed(1)}" y="0" width="6" height="${H}"/><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.4"/>${tk(2.5)}${tk(3)}${tk(3.5)}${tk(4)}</svg>`;
      g.append(sv, el('p', 'small', '横軸は波長(µm)。2.7 µm付近の落ち込みは、水酸基を含む鉱物のしるしです。FTIRによる測定。'));
    }
    const t = el('p', 'small'); t.innerHTML = `${tag('obs', '実測')}画像とスペクトル: JAXA地球外物質研究グループ(キュレーション)のデータ`; g.append(t); b.append(g);
  }
}
function buildPanels() { buildObservation(); buildSamples(); }
function lightbox(src, cap) { const l = $('#lightbox'); l.querySelector('img').src = src; l.querySelector('figcaption').textContent = cap; l.hidden = false; $('#lb-x').focus(); }

// ------------------------------------------------------------------ 入力
function bind() {
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  $('#enter').addEventListener('click', () => go('shape'));
  $('#sheet-x').addEventListener('click', () => go('ryugu'));
  $('#lb-x').addEventListener('click', () => ($('#lightbox').hidden = true));
  $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') $('#lightbox').hidden = true; });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('#lightbox').hidden) $('#lightbox').hidden = true; else if (S.sec !== 'ryugu') go('ryugu'); } });
  $$('[data-site]').forEach((b) => b.addEventListener('click', () => go('touchdown', { site: b.dataset.site })));
  $$('[data-style]').forEach((b) => b.addEventListener('click', () => setStyle(b.dataset.style)));
  $('#form').addEventListener('input', (e) => { S.formPlay = false; S.form = +e.target.value; });
  $$('[data-light]').forEach((b) => b.addEventListener('click', () => { S.light = b.dataset.light; syncLightUi(); }));
  $('#ink').addEventListener('input', (e) => (pencil.ink = +e.target.value));
  $('#tsun').addEventListener('input', (e) => { S.tSun = T_SUN0 + (T_SUN1 - T_SUN0) * +e.target.value; $('#tsun-out').textContent = jst(S.tSun); });
  const cv = $('#gl'); const pts = new Map(); let moved = 0, down = 0, pinch = 0;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; down = performance.now(); S.hold = S.clock + 4; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  cv.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); S.hold = S.clock + 4;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoom(pinch / d); pinch = d; moved += 10; return; }
    const dx = e.clientX - prev[0], dy = e.clientY - prev[1]; moved += Math.abs(dx) + Math.abs(dy);
    S.camT.az -= dx * 0.0052; S.camT.el = clamp(S.camT.el + dy * 0.0052, -1.45, 1.45); S.cam.az = S.camT.az; S.cam.el = S.camT.el;
  });
  const up = (e) => { if (pts.size === 1 && moved < 6 && performance.now() - down < 500) pts.delete(e.pointerId); pinch = 0; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); pinch = 0; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); S.hold = S.clock + 4; zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  addEventListener('resize', () => scene && scene.resize());
}
function setStyle(k) {
  S.style = k; pencil.plain = k !== 'pencil'; pencil.formOn = k === 'form';
  $$('[data-style]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.style === k)));
  $('#formbox').hidden = k !== 'form'; document.body.classList.toggle('dark', k === 'form');
  if (k === 'form') { S.form = 0; S.formPlay = !REDUCED; if (REDUCED) S.form = 1; S.zoomed = false; S.reveal = 1; S.camT.tg = [0, 0, 0]; $('#form').value = S.form; }
  else { pencil.spin = 0; pencil.form = 1; if (S.sec === 'shape' || S.sec === 'ryugu') S.camT.dist = R0; }
}
function zoom(f) { S.zoomed = true; const min = S.camT.tg[0] || S.camT.tg[1] || S.camT.tg[2] ? 30 : 700; S.camT.dist = clamp(S.camT.dist * f, min, 9000); }
function pick(cx, cy) {
  const r = $('#gl').getBoundingClientRect(); const { eye, dir } = scene.rayFromNDC((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height * 2 - 1)); const P = scene.pickRay(eye, dir);
  S.picked = P ? P : null;
}
function readUrl() {
  const p = new URLSearchParams(location.search); const s = p.get('s'); if (!s) return;
  S.reveal = 1; go(SECS.includes(s) ? s : 'ryugu', { site: SITES[p.get('site')] ? p.get('site') : undefined });
  S.cam.dist = S.camT.dist; S.cam.az = S.camT.az; S.cam.el = S.camT.el; S.cam.tg = [...S.camT.tg];
}

// ------------------------------------------------------------------ 注釈(赤鉛筆)
const notes = $('#notes'); const NS = 'http://www.w3.org/2000/svg';
function wobbleCircle(r, seed) { // 少しずれて閉じない手描きの円
  let d = ''; for (let i = 0; i <= 48; i++) { const a = seed + i / 46 * Math.PI * 2 * 1.04, rr = r * (1 + 0.07 * Math.sin(i * 1.7 + seed * 3)); d += (i ? 'L' : 'M') + (Math.cos(a) * rr).toFixed(1) + ' ' + (Math.sin(a) * rr).toFixed(1); } return d;
}
const noteEls = {};
function note(id, label, P, eye, side = 1) {
  let g = noteEls[id]; if (!g) { g = noteEls[id] = document.createElementNS(NS, 'g'); const c = document.createElementNS(NS, 'path'); c.setAttribute('d', wobbleCircle(11, id.length)); const l = document.createElementNS(NS, 'path'); const t = document.createElementNS(NS, 'text'); g.append(c, l, t); notes.append(g); g._l = l; g._t = t; }
  const p = scene.projectNear(P); const facing = v3.dot(v3.norm(P), v3.norm(v3.sub(eye, P))) > 0.12;
  if (!p || !facing || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) { g.style.display = 'none'; return; }
  g.style.display = ''; const x = p.x * innerWidth, y = p.y * innerHeight; g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
  g._t.setAttribute('x', 18); g._t.setAttribute('y', 5);
  if (g._t.textContent !== label) g._t.textContent = label;
}
function hide(id) { if (noteEls[id]) noteEls[id].style.display = 'none'; }

// ------------------------------------------------------------------ ループ
let last = performance.now(), nTxt = '';
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.1); last = now; S.clock += dt;
  // 点が描かれていく
  if (S.revealT0 != null && S.reveal < 1) { S.reveal = REDUCED ? 1 : clamp((now - S.revealT0) / 6500, 0, 1); }
  pencil.reveal = ease(S.reveal) * 1.001;
  const done = Math.round(S.n * clamp(pencil.reveal, 0, 1)); const txt = S.reveal >= 1 ? `${S.n.toLocaleString()} 点を描きました。` : `${done.toLocaleString()} / ${S.n.toLocaleString()} 点`;
  if (txt !== nTxt) { nTxt = txt; $('#drawing-n').textContent = txt; $('#drawing-text').textContent = S.reveal >= 1 ? '' : 'リュウグウを描いています。'; }
  // 点が集まる(形成)と、紙から夜への切り替え
  S.dark += ((S.style === 'form' ? 1 : 0) - S.dark) * (1 - Math.exp(-dt * 3)); pencil.dark = S.dark < 0.002 ? 0 : S.dark;
  if (S.style === 'form') {
    if (S.formPlay) { S.form = Math.min(1, S.form + dt / 11); $('#form').value = S.form; if (S.form >= 1) S.formPlay = false; }
    const e = S.form * S.form * (3 - 2 * S.form); pencil.form = S.form; pencil.spin = (1 - e) * Math.PI * 6;
    if (!S.zoomed) S.camT.dist = R0 * (1.9 - 0.75 * e);
    $('#form-out').textContent = S.form >= 1 ? `${S.n.toLocaleString()} 点` : `${Math.round(S.n * Math.min(1, S.form * 1.6)).toLocaleString()} 点`;
  }
  // カメラ
  if (S.sec === 'ryugu' && S.clock > S.hold && !REDUCED && S.reveal >= 0.3) S.camT.az += dt * 0.07;
  const c = S.cam, T = S.camT, k = 1 - Math.exp(-dt * 5);
  if (S.sec === 'ryugu' && innerWidth <= 760) T.dist = R0 * 1.45; else if (S.sec === 'ryugu') T.dist = R0;
  c.az += (T.az - c.az) * k; c.el += (T.el - c.el) * k; c.dist *= Math.exp((Math.log(T.dist) - Math.log(c.dist)) * k);
  for (let i = 0; i < 3; i++) c.tg[i] += (T.tg[i] - c.tg[i]) * k;
  const eye = eyeOf(c); const alt = Math.max(v3.len(eye) - scene.surfaceRadius(v3.norm(eye)), 2);
  // 光: 製図灯は見る人に対して左上から。太陽は暦から。
  let sun;
  if (S.light === 'sun') sun = sunBody(S.tSun);
  else { const fw = v3.norm(v3.sub(eye, c.tg)), rt = v3.norm(v3.cross([0, 0, 1], fw)), upv = v3.cross(fw, rt); sun = v3.norm(v3.add(v3.add(v3.mul(fw, 0.62), v3.mul(upv, 0.55)), v3.mul(rt, -0.55))); }
  pencil.target = innerWidth <= 760 ? 0.2 : 0.42; const wide = innerWidth > 760; S.off += ((wide ? (S.sec === 'ryugu' ? -1.25 : 1) : 0) - S.off) * (1 - Math.exp(-dt * 4));
  const rt0 = v3.norm(v3.cross([0, 0, 1], v3.norm(v3.sub(eye, c.tg)))); const upv0 = v3.cross(v3.norm(v3.sub(eye, c.tg)), rt0); const nar = innerWidth <= 760; S.offv += ((nar ? (S.sec === 'ryugu' ? 0.3 : 0.2) : 0) - S.offv) * (1 - Math.exp(-dt * 4));
  const tgv = v3.sub(v3.add(c.tg, v3.mul(rt0, c.dist * 0.17 * S.off)), v3.mul(upv0, c.dist * S.offv));
  pencil.draw({ pose: { eye, target: tgv, up: [0, 0, 1] }, sun, altitude: alt, clock: S.clock });
  // 注釈
  const show = { td1: S.sec === 'touchdown', td2: S.sec === 'touchdown', sci: S.sec === 'sci' };
  const names = { td1: 'TD1', td2: 'TD2', sci: 'SCI' };
  for (const kk of ['td1', 'sci', 'td2']) { if (show[kk] && S.reveal >= 1) note(kk, names[kk], sp(kk), eye, 1); else hide(kk); }
}
boot().catch((e) => { console.error(e); const m = $('#fail'); m.hidden = false; m.querySelector('p').textContent = String(e.message || e); });
