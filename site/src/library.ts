// データ書庫 (§4.13) — every dataset shipped in the repo is reachable from here:
// ONC gallery (783 imgs, 15 folders), ONC l2c terrain images, MASCAM 67 frames,
// MARA thermal model curves (D) with the MARA comparison, sample particles,
// gravity model parameters, and license/credit notices. Nothing is invented;
// folders without coordinates are labeled as such.
import { credit } from './credits';
import { Viewer, Card, esc } from './ui';
import { lang } from './i18n';
import { getJSON, url } from './data';

export interface LibData {
  gallery: any[];            // world.gallery rows {id,folder,lat,lon,date,event}
  locmap: any;               // image_location_map (event_level_map)
  l2c: any[];                // world.l2c rows
  mascam: any[];             // mascam_manifest.images
  samples: any;              // samples_metadata.json
  temp: any;                 // temperature_curves.json
  grav: { '763': any, '340': any };  // gravity_*.json metadata
  lic: any;                  // license_registry.json
  surfacePoints: any;        // ryugu_surface_points.json
}
export interface LibEnv {
  viewer: Viewer; card: Card;
  lat: () => number; localHour: () => number; subsolarLat: () => number;
}
export class Library {
  private d!: LibData; private env!: LibEnv; open_ = false;
  async init() {
    const [temp, lic, g763, g340] = await Promise.all([
      getJSON('data/temperature_curves.json'), getJSON('data/license_registry.json'),
      getJSON('data/gravity_763.json'), getJSON('data/gravity_340.json')]);
    this.d = { gallery: [], locmap: null, l2c: [], mascam: [], samples: null, temp, grav: { '763': g763, '340': g340 }, lic, surfacePoints: null };
  }
  /** called from main once world is built */
  attach(gallery: any[], l2c: any[], mascam: any[], samples: any, sp: any, locmap: any) { this.d.gallery = gallery; this.d.l2c = l2c; this.d.mascam = mascam; this.d.samples = samples; this.d.surfacePoints = sp; this.d.locmap = locmap; }
  get isOpen() { return this.open_; }
  get data() { return this.d; }
  /** sample-particle detail card (also linked from the TD1/TD2 POI cards) */
  showSample(env: LibEnv, id: string) {
    if (!this.d?.samples) return;
    const p = (this.d.samples.samples as any[]).find(x => x.id === id); if (!p) return;
    env.card.show(p.id, `<p>${esc(p.type)} — ${esc(p.size_note ?? '')}</p><p>${esc(p.science_note ?? '')}</p><p class="lnote">${esc((p.data_files ?? []).join('・'))}</p>${(p.sources ?? []).map((x: any) => x.url ? `<p class="lnote"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a></p>` : '').join('')}`, 'sample');
  }
  open(env: LibEnv) {
    this.env = env; this.open_ = true; env.card.node.classList.add('lib');
    const d = this.d;
    const folders: { f: string; date: string; event: string; note?: string }[] = [];
    const evMap = new Map<string, any>(d.locmap.event_level_map.map((e: any) => [e.gallery_folder, e]));
    const counts = new Map<string, number>(); for (const g of d.gallery) counts.set(g.folder, (counts.get(g.folder) ?? 0) + 1);
    for (const f of [...counts.keys()].sort()) {
      const e = evMap.get(f);
      folders.push(e ? { f, date: e.date_utc ?? '', event: e.event ?? '', note: e.target_latitude_deg == null ? e.location_note : undefined }
        : { f, date: `${f.slice(3, 7)}-${f.slice(7, 9)}-${f.slice(9, 11)}`, event: lang === 'ja' ? '全体観測運用（位置情報なし）' : 'global observation ops (no location data)', note: lang === 'ja' ? '画像の撮影位置データなし（到着・初期観測期の運用画像）' : 'no per-image location (arrival / early ops)' });
    }
    const galRows = folders.map(x => `<button class="lrow" data-gal="${esc(x.f)}"><span>${esc(x.date)}　${esc(x.event)}</span><span class="n">${counts.get(x.f)}${lang === 'ja' ? '枚' : ' imgs'}</span></button>${x.note ? `<p class="lnote">${esc(x.note)}</p>` : ''}`).join('');
    const l2cRows = d.l2c.map((x: any, i: number) => `<button class="lrow" data-l2c="${i}"><span>ONC l2c ${esc(x.id)}</span><span class="n">${x.lat != null ? `${x.lat.toFixed(1)}°,${(x.lon ?? 0).toFixed(1)}°` : '—'}</span></button>`).join('');
    const masRows = `<button class="lrow" data-mascam="1"><span>MASCAM 67枚（MASCOT 17時間）</span><span class="n">67 imgs</span></button>`;
    const g763 = d.grav['763'], g340 = d.grav['340'];
    const gravRows = `<table class="ltab"><tr><th></th><th>7.63h</th><th>3.40h</th></tr>
      <tr><td>plates</td><td>${g763.plates}</td><td>${g340.plates}</td></tr>
      <tr><td>density kg/m³</td><td>${g763.density}</td><td>${g340.density}</td></tr>
      <tr><td>GM m³/s²</td><td>${g763.gm_effective_m3s2.toPrecision(6)}</td><td>${g340.gm_effective_m3s2.toPrecision(6)}</td></tr>
      <tr><td>escape cm/s</td><td>${g763.escape_cm_s.min.toFixed(1)}–${g763.escape_cm_s.max.toFixed(1)}</td><td>${g340.escape_cm_s.min.toFixed(1)}–${g340.escape_cm_s.max.toFixed(1)}</td></tr></table>
      <p class="lnote">${lang === 'ja' ? '多面体(49,152板)重力モデル。3.40hは減速前の高速自転を再現する過去モード(P)。' : 'polyhedron (49,152-plate) gravity; 3.40h = pre-YORP past mode (P)'}</p>`;
    const licRows = d.lic.rules.map((r: any) => `<p class="lnote"><b>${esc(r.id)}</b> ${esc(r.provider)} — ${esc(r.license)}${r.policy_url ? ` <a href="${esc(r.policy_url)}" target="_blank" rel="noopener">policy</a>` : ''}</p>`).join('')
      + d.lic.mandatory_site_notices.map((n: string) => `<p class="lnote">• ${esc(n)}</p>`).join('');
    const body = `
      <h3>${lang === 'ja' ? 'ONC運用画像ギャラリー' : 'ONC gallery'}</h3>${galRows}
      <h3>ONC l2c ${lang === 'ja' ? '地形画像' : 'terrain images'}</h3>${l2cRows}
      <h3>MASCAM</h3>${masRows}
      <h3>${lang === 'ja' ? `表面温度モデル（MARA比較）${'*'}` : `Surface temp model (vs MARA)${'*'}`}</h3><div id="tempchart"></div>
      <h3>${lang === 'ja' ? '帰還試料' : 'Returned samples'}</h3><div id="libsamples"></div>
      <h3>${lang === 'ja' ? '重力モデル' : 'Gravity model'}</h3>${gravRows}
      <h3>${lang === 'ja' ? '出典・ライセンス' : 'Credits & licenses'}</h3>${licRows}
      <div class="cr">${esc(credit('gallery'))} / ${esc(credit('onc'))} / ${esc(credit('mascam'))}</div>`;
    this.env.card.show(lang === 'ja' ? 'データ書庫' : 'Data archive', body);
    this.renderTemp(); this.renderSamples();
    this.env.card.node.querySelectorAll('[data-gal]').forEach(b => b.addEventListener('click', () => this.openGal((b as HTMLElement).dataset.gal!)));
    this.env.card.node.querySelectorAll('[data-l2c]').forEach(b => b.addEventListener('click', () => this.env.viewer.open(
      this.d.l2c.map((x: any) => ({ src: url(x.jpg), caption: `ONC l2c ${x.id}${x.lat != null ? ` ${x.lat.toFixed(1)}° ${(x.lon ?? 0).toFixed(1)}°` : ''}`, kind: 'onc' as const })), +(b as HTMLElement).dataset.l2c!)));
    this.env.card.node.querySelector('[data-mascam]')?.addEventListener('click', () => this.env.viewer.open(
      this.d.mascam.map((x: any) => ({ src: url(x.png), caption: `MASCAM ${x.id} ${x.phase}${x.led && x.led !== 'NONE' ? ' / LED' : ''} ${x.utc.slice(11, 19)}Z`, kind: 'mascam' as const, certainty: x.certainty })), 0));
  }
  close() { this.open_ = false; this.env?.card.node.classList.remove('lib'); }
  /** open one gallery folder (all images, date-ordered) in the viewer */
  private openGal(f: string) {
    const evMap = new Map<string, any>(this.d.locmap.event_level_map.map((e: any) => [e.gallery_folder, e]));
    const e = evMap.get(f);
    const date = e?.date_utc ?? `${f.slice(3, 7)}-${f.slice(7, 9)}-${f.slice(9, 11)}`;
    const g = this.d.gallery.filter(x => x.folder === f);
    const cap = (x: any) => `${e?.event ?? (lang === 'ja' ? '全体観測運用' : 'global observation ops')} ${date} ${x.id}`;
    this.env.viewer.open(g.map(x => ({ src: url(`assets/gallery/${x.folder}/${x.id}`), caption: cap(x), kind: 'gallery' as const })), 0);
  }
  private renderSamples() {
    const el = this.env.card.node.querySelector('#libsamples') as HTMLElement; if (!el) return;
    const s = this.d.samples; const short = (x: string, n: number) => x.length > n ? x.slice(0, n) + '…' : x;
    const rows = (s.samples as any[]).map((p, i) => `<button class="lrow" data-smp="${i}"><span>${esc(p.id)}（${esc(p.type)}）</span><span class="n">${esc(short(p.size_note ?? '', 18))}</span></button>`).join('');
    const mt = s.mission_totals ?? {};
    el.innerHTML = rows + `<p class="lnote">${lang === 'ja' ? `総量 ${mt.total_mass_g ?? '?'}±${mt.total_mass_error_g ?? '?'}g（A室 ${mt.chamber_a_mass_g ?? '?'}g / C室 ${mt.chamber_c_mass_g ?? '?'}g / B室 ${mt.chamber_b_mass_g ?? '?'}g）— ${esc(s.sample_return_event?.date ?? '')} 帰還カプセルで回収` : `total ${mt.total_mass_g ?? '?'}±${mt.total_mass_error_g ?? '?'}g (A ${mt.chamber_a_mass_g ?? '?'}g / C ${mt.chamber_c_mass_g ?? '?'}g / B ${mt.chamber_b_mass_g ?? '?'}g)`}</p>`;
    el.querySelectorAll('[data-smp]').forEach(b => b.addEventListener('click', () => this.showSample(this.env, (s.samples as any[])[+(b as HTMLElement).dataset.smp!].id)));
  }
  /** 1D thermal model (D): curve at the player's latitude band, ti=300, dec nearest */
  private renderTemp() {
    const el = this.env.card.node.querySelector('#tempchart') as HTMLElement; if (!el) return;
    const T = this.d.temp;
    const latI = nearestIdx(T.lat_deg, this.env.lat()), tiI = T.ti_tiu.indexOf(300) >= 0 ? T.ti_tiu.indexOf(300) : 4;
    const decI = nearestIdx(T.subsolar_lat_deg, this.env.subsolarLat());
    const curve: number[] = T.curves_K[(latI * T.ti_tiu.length + tiI) * T.subsolar_lat_deg.length + decI];
    const n = curve.length, W = 340, H = 110, pad = 26;
    const lo = Math.min(...curve) - 8, hi = Math.max(...curve) + 8;
    const X = (i: number) => pad + (W - 2 * pad) * i / (n - 1), Y = (v: number) => H - pad - (H - 2 * pad) * (v - lo) / (hi - lo);
    const pts = curve.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const nowX = X(Math.round((this.env.localHour() / 24) * (n - 1)) % n);
    const mc = T.mara_comparison;
    const maraMin = Math.min(...mc.mara_K), maraMax = Math.max(...mc.mara_K);
    const hourLabels = [0, 6, 12, 18].map(h => `<text x="${X(h / 24 * (n - 1))}" y="${H - 6}" font-size="9" fill="#999" text-anchor="middle">${h}h</text>`).join('');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:420px">
      <polyline points="${pts}" fill="none" stroke="#E8A33D" stroke-width="1.6"/>
      <line x1="${pad}" y1="${Y(maraMax)}" x2="${W - pad}" y2="${Y(maraMax)}" stroke="#7FB4D9" stroke-dasharray="3 3"/><line x1="${pad}" y1="${Y(maraMin)}" x2="${W - pad}" y2="${Y(maraMin)}" stroke="#7FB4D9" stroke-dasharray="3 3"/>
      <line x1="${nowX}" y1="${pad - 8}" x2="${nowX}" y2="${H - pad}" stroke="#F0F0EB" stroke-width="1" opacity=".6"/>
      ${hourLabels}</svg>
      <p class="lnote">${lang === 'ja' ? `緯度${this.env.lat().toFixed(0)}°・TI 300・太陽赤緯${T.subsolar_lat_deg[decI]}°のモデル曲線（*D）。青破線=MARA実測レンジ(${maraMin.toFixed(0)}–${maraMax.toFixed(0)}K)、白線=現在の地方時。${esc(mc.note)}（MARA比較: モデル${mc.model_K_lat20_ti300.join('/')}K）` : `model curve at lat ${this.env.lat().toFixed(0)}°, TI 300 (*D). blue dashed = MARA measured ${maraMin.toFixed(0)}–${maraMax.toFixed(0)}K; white line = current local time. ${esc(mc.note)}`}</p>`;
  }
}
function nearestIdx(arr: number[], v: number) { let b = 0, bd = 1e12; for (let i = 0; i < arr.length; i++) { const d = Math.abs(arr[i] - v); if (d < bd) { bd = d; b = i; } } return b; }
