// P1-2 イベントメニューとカウントダウン — 「リュウグウ滞在約1年5ヶ月」の11イベントを軸にした時間旅行の導線。
// event_asset_links.json（日付・narrative・ギャラリー・POI）+ image_location_map.json（座標）+
// poi_master.json（POI座標）をマージし、イベント時刻（日付精度は現地太陽時12時、TD1のみ既知の接地時刻）を決定する。
import { Card, Viewer, esc } from './ui';
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
  timeNote: 'exact' | 'impact' | 'noon' | 'date';   // 時刻精度
  inRange: boolean;           // 滞在期間内（スライダーで行ける）か
}

/** SCI衝突の公表時刻（2019-04-05 11:36 JST = 02:36 UTC） */
export const SCI_MS = Date.UTC(2019, 3, 5, 2, 36, 0);

/** ギャラリーフォルダごとの1行キャプション（画像の中身を説明する） */
export const FOLDER_NOTE: Record<string, string> = {
  nav20180731: '到着直前の遠方からの全域観測 — 回転するリュウグウ全体が見える',
  nav20180805: '近距離観測 — 表面の地形と岩の分布が初めて詳しく撮られた',
  nav20180911: '中距離観測 — 着陸候補地の選定のための精密撮影',
  nav20181014: 'MASCOT着陸後の観測 — 着陸地点の姿を上空から確認',
  nav20180920: 'MINERVA-II1(イブー・アウル)の分離運用 — ローバーがリュウグウへ降りる',
  nav20181002: 'MASCOT分離 — 10時3分、着陸機が投下され17時間の運用が始まる',
  nav20181024: 'TD1リハーサル3 — タッチダウンの最終確認と目標マーカーTM-Bの投下',
  nav20190221: '第1回タッチダウン(TD1) — サンプラーホーンが地表に触れ、弾丸を撃って試料を採取',
  nav20190307: 'TD1後の観測 — 採取跡の確認と、SCIの目標地点(S01)の検討',
  nav20190404: 'SCI運用 — 探査機は降下後に退避し、銅弾がリュウグウに衝突した',
  nav20190424: '人工クレーターの観測 — 掘り出された地下物質の近くで、新たなクレーターが確認された',
  nav20190515: 'TD2リハーサル1 — 人工クレーター付近への着陸に向けた降下練習',
  nav20190529: 'TD2リハーサル3 — 最終降下確認と目標マーカーTM-Aの投下',
  nav20190612: 'TD2最終確認(P1) — 着陸の直前チェック',
  nav20190710: '第2回タッチダウン(TD2) — 人工クレーターの縁に降り立ち、地下の試料を採取',
};

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
    else if (e.id === 'sci_impact') { ms = SCI_MS; timeNote = 'impact'; }
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
  impact: '時刻は公表値（銅弾衝突 2019-04-05 11:36 JST）',
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
      const items = this.gallery.filter(g => g.folder === x.folder).map(g => ({ src: url(`assets/gallery/${x.folder}/${g.id}`), caption: `${FOLDER_NOTE[x.folder] ?? x.label}（${x.date}）`, kind: 'gallery' as const }));
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
      ${acts.join('')}`;
    // 出典クレジットは card.show の creditKind 引数で1回だけ表示（二重表示防止）
    this.card.show(e.title, body, 'timeline');
    document.getElementById('evgo')?.addEventListener('click', ev => { ev.preventDefault(); this.act.goTo(e); });
    document.getElementById('evgal')?.addEventListener('click', ev => { ev.preventDefault(); this.act.openGallery(e.gallery, e); });
    document.getElementById('evtd1')?.addEventListener('click', ev => { ev.preventDefault(); this.act.enterTd1(); });
    document.getElementById('evmas')?.addEventListener('click', ev => { ev.preventDefault(); this.act.enterMascot(); });
  }
  /** イベントのギャラリーフォルダを Viewer で開く（P1-6: ギャラリーはイベント経由） */
  openGalleryFolders(folders: string[], ev: REvent) {
    const items = folders.flatMap(f => this.gallery.filter(g => g.folder === f).map(g => ({
      src: url(`assets/gallery/${g.folder}/${g.id}`), caption: `${FOLDER_NOTE[g.folder] ?? ev.title}（${g.date}）`, kind: 'gallery' as const })));
    if (items.length) this.viewer.open(items, 0);
    else this.card.show(ev.title, `<p class="lnote">${lang === 'ja' ? '関連画像はありません。' : 'No related images.'}</p>`);
  }
}
