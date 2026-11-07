// P1-2 イベントメニューとカウントダウン — 「リュウグウ滞在約1年5ヶ月」の11イベントを軸にした時間旅行の導線。
// event_asset_links.json（日付・narrative・ギャラリー・POI）+ image_location_map.json（座標）+
// poi_master.json（POI座標）をマージし、イベント時刻（日付精度は現地太陽時12時、TD1のみ既知の接地時刻）を決定する。
import { Card, Viewer, esc } from './ui';
import { credit } from './credits';
import { lang } from './i18n';
import { utcToEt, Sun, fmtJST } from './time';
import { url } from './data';

export interface REvent {
  id: string; title: string; phase: string; narrative: string;
  dateStr: string;            // UTC日付（データ由来）
  ms: number;                 // イベント時刻（下記 timeNote 参照）
  lat: number | null; lon: number | null;
  gallery: string[];
  poiIds: string[];
  replay?: 'td1' | 'mascot';
  timeNote: 'exact' | 'noon' | 'date';   // 時刻精度
  inRange: boolean;           // 滞在期間内（スライダーで行ける）か
}

/** その日付・経度で最初の「現地太陽時12時」（太陽が南中する瞬間）を UTC ms で返す */
function localNoon(dateStr: string, lonDeg: number, sun: Sun): number {
  const day0 = Date.parse(dateStr + 'T00:00:00Z');
  let best = day0, bd = 1e12;
  for (let t = day0; t < day0 + 86400e3; t += 60e3) {
    const et = utcToEt(t);
    const s = sun.sunBody(et);
    const lt = sun.localTime(et, lonDeg, s.dir);
    const d = Math.abs(lt - 12);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

export function buildEvents(evJson: any, locmap: any, pois: any[], sun: Sun, td1Ms: number, t0: number, t1: number): REvent[] {
  const out: REvent[] = [];
  const poiMap = new Map<string, any>(pois.map(p => [p.id, p]));
  const evMap = new Map<string, any>(locmap.event_level_map.map((e: any) => [e.gallery_folder, e]));
  for (const e of evJson.events) {
    let lat: number | null = null, lon: number | null = null;
    for (const pid of e.poi_ids ?? []) { const p = poiMap.get(pid); if (p?.lat != null) { lat = p.lat; lon = p.lon; break; } }
    if (lat == null) for (const f of e.gallery ?? []) { const m = evMap.get(f); if (m?.target_latitude_deg != null) { lat = m.target_latitude_deg; lon = m.target_longitude_deg; break; } }
    let ms: number, timeNote: REvent['timeNote'];
    if (e.id === 'td1') { ms = td1Ms; timeNote = 'exact'; }
    else if (lat != null) { ms = localNoon(e.date, lon!, sun); timeNote = 'noon'; }
    else { ms = Date.parse(e.date + 'T03:00:00Z'); timeNote = 'date'; }   // 日付のみ: JST昼
    out.push({
      id: e.id, title: e.title_ja, phase: e.phase, narrative: e.narrative, dateStr: e.date,
      ms, lat, lon, gallery: e.gallery ?? [], poiIds: e.poi_ids ?? [],
      replay: e.id === 'td1' ? 'td1' : e.id === 'mascot_landing' ? 'mascot' : undefined,
      timeNote, inRange: ms >= t0 && ms <= t1,
    });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

/** 次のイベント（ms より後で最小）。二分探索相当（11要素なので線形で十分） */
export function nextEvent(evs: REvent[], ms: number): REvent | null {
  for (const e of evs) if (e.ms > ms) return e;
  return null;
}
export function lastEvent(evs: REvent[], ms: number): REvent | null {
  let r: REvent | null = null;
  for (const e of evs) if (e.ms <= ms) r = e;
  return r;
}
export function fmtCountdown(ms: number, ev: REvent): string {
  let s = Math.max(0, Math.floor((ev.ms - ms) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600), m = Math.floor((s - h * 3600) / 60);
  return d > 0 ? `${d}日 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : `${h}:${String(m).padStart(2, '0')}`;
}

export interface EventActions {
  goTo(ev: REvent): void;                 // この瞬間へ行く（時刻+場所, 演出E）
  openGallery(folders: string[], ev: REvent): void;
  enterTd1(): void; enterMascot(): void;
}

const TIME_NOTE_JA: Record<REvent['timeNote'], string> = {
  exact: '時刻は公表値（接地 2019-02-22 07:29:10 JST）',
  noon: '時刻は日付精度 — その日の現地太陽時12時（南中）に設定',
  date: '時刻は日付精度 — その日の JST 昼に設定',
};

export class EventUi {
  /** イベントに紐付かない観測運用フォルダ（ギャラリーのデータを使い切るため P1-6） */
  extras: { folder: string; date: string; label: string }[] = [];
  constructor(private card: Card, private viewer: Viewer, private evs: REvent[], private gallery: { id: string; folder: string; date: string; event: string }[], private act: EventActions) {}
  /** イベント一覧（日付順）+ その他の観測運用 */
  openList() {
    const ja = lang === 'ja';
    const rows = this.evs.map((e, i) => `<button class="lrow evrow" data-ev="${i}"><span>${esc(e.dateStr)}　${esc(e.title)}</span><span class="n">${esc(e.phase)}</span></button>`).join('');
    const exRows = this.extras.length ? `<h3>${ja ? 'その他の観測運用（位置情報なし）' : 'Other ops (no location)'}</h3>` +
      this.extras.map((x, i) => `<button class="lrow" data-ex="${i}"><span>${esc(x.date)}　${esc(x.label)}</span><span class="n">${this.gallery.filter(g => g.folder === x.folder).length}${ja ? '枚' : ' imgs'}</span></button>`).join('') : '';
    this.card.show(ja ? 'イベント — リュウグウ滞在 1年4ヶ月' : 'Events — the 1 yr 4 mo at Ryugu', `
      <p class="lnote">${ja ? '日付を選ぶと、その瞬間の時刻・場所へ移動できます（演出E）。' : 'Pick a date to travel to that moment (staging, E).'}</p>${rows}${exRows}`,
      'timeline');
    this.card.node.classList.add('lib');   // 長いリストはスクロール可能に
    this.card.node.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', () => this.detail(this.evs[+(b as HTMLElement).dataset.ev!].id)));
    this.card.node.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => {
      const x = this.extras[+(b as HTMLElement).dataset.ex!];
      const items = this.gallery.filter(g => g.folder === x.folder).map(g => ({ src: url(`assets/gallery/${x.folder}/${g.id}`), caption: `${x.label} ${x.date} ${g.id}`, kind: 'gallery' as const }));
      if (items.length) this.viewer.open(items, 0);
    }));
  }
  /** イベント詳細（スライダーのマーカークリックからも） */
  detail(id: string) {
    const e = this.evs.find(x => x.id === id); if (!e) return;
    const ja = lang === 'ja';
    const acts: string[] = [];
    if (e.inRange) acts.push(`<p><a href="#" id="evgo">${ja ? 'この瞬間へ行く' : 'Go to this moment'}</a>　${e.lat != null ? `（${e.lat.toFixed(1)}°${e.lat >= 0 ? 'N' : 'S'} ${e.lon!.toFixed(1)}°E への移動を含む）` : ''} <span class="lnote">時刻・場所の移動は演出E</span></p>`);
    else acts.push(`<p class="lnote">${ja ? '※リュウグウ滞在期間（2018-06-27〜2019-11-13）外のイベントです。時刻移動はできません。' : 'Outside the stay period (2018-06-27 – 2019-11-13); no time travel.'}</p>`);
    if (e.gallery.length) acts.push(`<p><a href="#" id="evgal">${ja ? `関連画像を見る（${e.gallery.map(f => this.gallery.filter(g => g.folder === f).length).join('+')}枚）` : 'Related images'}</a></p>`);
    if (e.replay === 'td1') acts.push(`<p><a href="#" id="evtd1">${ja ? '降下リプレイ: はやぶさ2のタッチダウンを見る' : 'TD1 descent replay'}</a>　(E)</p>`);
    if (e.replay === 'mascot') acts.push(`<p><a href="#" id="evmas">${ja ? '視点リプレイ: MASCOTの17時間を追う' : 'MASCOT replay'}</a>　(E)</p>`);
    const body = `<p>${esc(e.narrative)}</p>
      <p class="lnote">${esc(e.dateStr)}（UTC）— ${esc(fmtJST(e.ms))}　/ ${esc(TIME_NOTE_JA[e.timeNote])}</p>
      <p class="lnote">${ja ? '所属フェーズ' : 'Phase'}: ${esc(e.phase)}</p>
      ${acts.join('')}
      <div class="cr">${esc(credit('timeline'))}</div>`;
    this.card.show(e.title, body, 'timeline');
    document.getElementById('evgo')?.addEventListener('click', ev => { ev.preventDefault(); this.act.goTo(e); });
    document.getElementById('evgal')?.addEventListener('click', ev => { ev.preventDefault(); this.act.openGallery(e.gallery, e); });
    document.getElementById('evtd1')?.addEventListener('click', ev => { ev.preventDefault(); this.act.enterTd1(); });
    document.getElementById('evmas')?.addEventListener('click', ev => { ev.preventDefault(); this.act.enterMascot(); });
  }
  /** イベントのギャラリーフォルダを Viewer で開く（P1-6: ギャラリーはイベント経由） */
  openGalleryFolders(folders: string[], ev: REvent) {
    const items = folders.flatMap(f => this.gallery.filter(g => g.folder === f).map(g => ({
      src: url(`assets/gallery/${g.folder}/${g.id}`), caption: `${ev.title} ${g.date} ${g.id}`, kind: 'gallery' as const })));
    if (items.length) this.viewer.open(items, 0);
    else this.card.show(ev.title, `<p class="lnote">${lang === 'ja' ? '関連画像はありません。' : 'No related images.'}</p>`);
  }
}
