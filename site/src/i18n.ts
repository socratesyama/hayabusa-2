// §5.8 — copy lives here, not in components. ja default, en fallback.
export type Lang = 'ja' | 'en';
const D = {
  ja: {
    hint_keys: '歩く: WASD / ホップ: Space / 時間: 下のスライダー / 調べる: E / イベント: V', hint_keys_touch: '歩く: 左のスティック / ホップ: ↑ / 時間: 下のスライダー / 調べる: タップ',
    modes: ['のんびり', 'じっくり', 'せんもん'], callsign_fmt: (n: string, k: number) => `${n} — あなたは${k}番目の探査機です`,
    m01: '※歩行は演出です。実際の重力は地球の約6〜8万分の1',
    idle_time: 'のスクロールで時間を動かせます', wheel_note: 'ホイールはズームではなく時間です',
    idle: ['下のスライダーで時間を動かせます（2018-06-27〜2019-11-13）', '近くに調べられるものがあります（E）', '岩の上には乗れます（Space）', '右下の丸いボタンで、ジャンプして宇宙へ出られます（もう一度押すと地表に戻ります）', 'ダッシュ: Shift+W', '記録(R)・モード(M)・イベント(V)'],
    sound_on: '音で温度・磁場・足元の硬さが変わります', no_data: 'データなし', hopbtn: 'ホップ', rec_saved: '記録を保存しました',
    mascot_end: 'MASCOT 運用終了 — 17時間07分', mascot_enter: 'MASCOTの17時間を追う', td1_enter: '逆視点: はやぶさ2のタッチダウンを見る',
    gravity: '重力', escape: '脱出', ballistic: '弾道 高度', esc_orbit: '脱出軌道 高度', pm: '点質量近似', elev: '標高', loading: '読み込み中',
    experts: '専門家の皆さんへ', loaded: 'データ読み込み完了',
  },
  en: {
    hint_keys: 'Walk: WASD / Hop: Space / Time: slider below / Inspect: E / Events: V', hint_keys_touch: 'Walk: left stick / Hop: ↑ / Time: slider below / Inspect: tap',
    modes: ['Relaxed', 'Thorough', 'Expert'], callsign_fmt: (n: string, k: number) => `${n} — you are probe #${k}`,
    m01: '* Walking is a staging device. Real gravity is about 1/60,000–1/80,000 of Earth\'s.',
    idle_time: ': scroll to move through time', wheel_note: 'The wheel moves time, not zoom',
    idle: ['Move time with the slider below (2018-06-27 – 2019-11-13)', 'Something to inspect is nearby (E)', 'You can stand on rocks (Space)', 'The round button at bottom right jumps you into space (press again to return)', 'Dash: Shift+W', 'Record (R) / Mode (M) / Events (V)'],
    sound_on: 'Sound now follows temperature, magnetic field and ground hardness', no_data: 'no data', hopbtn: 'Hop', rec_saved: 'Record saved',
    mascot_end: 'MASCOT mission end — 17 h 07 min', mascot_enter: 'Follow MASCOT\'s 17 hours', td1_enter: 'Reverse view: watch Hayabusa2 touch down',
    gravity: 'gravity', escape: 'escape', ballistic: 'ballistic alt', esc_orbit: 'escape orbit alt', pm: 'point-mass approx', elev: 'elev', loading: 'loading',
    experts: 'For experts', loaded: 'data loaded',
  },
};
// 言語は日本語に統一（§酷評対応: イベント・narrative等のデータが日本語のみのため、
// 英語UIとの混在は魅力伝達を損なう。辞書は将来の完全二言語化に備えて残す）
export let lang: Lang = 'ja';
export const setLang = (l: Lang) => { lang = l; };
export const t = () => D[lang];
