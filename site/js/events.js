// 時間軸のできごと・地点・用語(一次資料: 06_timeline_text/, 07_glossary_faq/)
export const UTC = (y, m, d, h = 0, mi = 0, s = 0) => Date.UTC(y, m - 1, d, h, mi, s) / 1000;

export const SITES = {
  td1: { id: 'td1', name: 'タマテバコ', full: '第1回タッチダウン地点', lat: 4.3, lon: 206.47, t: UTC(2019, 2, 21, 22, 29), chamber: 'A', grains: ['A0002', 'A0004'] },
  sci: { id: 'sci', name: 'おむすびころりん', full: '人工クレーター', lat: 7.9, lon: 313.3, t: UTC(2019, 4, 5, 2, 36) },
  td2: { id: 'td2', name: 'ウチデノコヅチ', full: '第2回タッチダウン地点', lat: 10.13, lon: 300.595, t: UTC(2019, 7, 11, 1, 6), chamber: 'C', grains: ['C0002', 'C0003', 'C0004'] },
};

export const EVENTS = [
  { id: 'launch', t: UTC(2014, 12, 3, 4, 22, 4), name: '打ち上げ', note: '2014年12月3日、H-IIAロケットで種子島から飛び立った。', view: 'far', key: true },
  { id: 'swingby', t: UTC(2015, 12, 3, 10, 8), name: '地球スイングバイ', note: '2015年12月3日。地球の重力で進路を曲げ、リュウグウへ向かった。', view: 'far' },
  { id: 'arrival', t: UTC(2018, 6, 27, 0, 35), name: 'リュウグウに到着', note: '2018年6月27日。高度およそ20 kmから観測を始めた。', view: 'near', key: true },
  { id: 'minerva', t: UTC(2018, 9, 21, 4, 6), name: 'ローバの分離', note: '2018年9月21日。MINERVA-II1の2台が表面に降り、跳ねながら撮影した。', view: 'near' },
  { id: 'mascot', t: UTC(2018, 10, 3, 1, 57), name: '着陸機MASCOTの分離', note: '2018年10月3日。着陸機は約17時間、表面で観測した。', view: 'near' },
  { id: 'td1', t: UTC(2019, 2, 21, 22, 29), name: '第1回タッチダウン', note: '2019年2月22日 7:29(日本時間)。表面の物質を採取した。', view: 'near', site: 'td1', key: true },
  { id: 'sci', t: UTC(2019, 4, 5, 2, 36), name: '人工クレーター', note: '2019年4月5日。銅の弾を衝突させ、地下の物質を露出させた。', view: 'near', site: 'sci', key: true },
  { id: 'td2', t: UTC(2019, 7, 11, 1, 6), name: '第2回タッチダウン', note: '2019年7月11日。人工クレーターの近くで、地下の物質を採取した。', view: 'near', site: 'td2', key: true },
  { id: 'depart', t: UTC(2019, 11, 13, 1, 5), name: 'リュウグウを出発', note: '2019年11月13日。地球へ向かった。', view: 'near' },
  { id: 'return', t: UTC(2020, 12, 5, 17, 30), name: '地球帰還', note: '2020年12月6日。カプセルが南オーストラリアに着地し、約5.4 gの試料が届いた。', view: 'far', key: true },
  { id: 'torifune', t: UTC(2026, 7, 5, 18, 30), name: 'トリフネの近くを通過', note: '2026年7月6日(日本時間)。小惑星トリフネの表面から約400 mまで近づいた。', view: 'far' },
  { id: 'ky26', t: UTC(2031, 7, 1), name: '1998 KY26 へ', note: '2031年に高速で自転する小さな小惑星へ到着する予定。', view: 'far', key: true },
];

// 時間軸(縦レール)の区間。実時間と画面上の長さは比例させない
export const RAIL = [
  { t0: UTC(2014, 12, 3), t1: UTC(2018, 6, 20), f0: 0.0, f1: 0.17, name: '巡航' },
  { t0: UTC(2018, 6, 20), t1: UTC(2019, 11, 25), f0: 0.17, f1: 0.70, name: 'リュウグウ' },
  { t0: UTC(2019, 11, 25), t1: UTC(2021, 1, 1), f0: 0.70, f1: 0.80, name: '帰還' },
  { t0: UTC(2021, 1, 1), t1: UTC(2031, 12, 31), f0: 0.80, f1: 1.0, name: '拡張' },
];
export const T_MIN = RAIL[0].t0, T_MAX = RAIL[RAIL.length - 1].t1;
export function tToF(t) {
  for (const s of RAIL) if (t <= s.t1) return s.f0 + (s.f1 - s.f0) * Math.max(0, (t - s.t0) / (s.t1 - s.t0));
  return 1;
}
export function fToT(f) {
  f = Math.min(Math.max(f, 0), 1);
  for (const s of RAIL) if (f <= s.f1) return s.t0 + (s.t1 - s.t0) * (f - s.f0) / (s.f1 - s.f0);
  return T_MAX;
}

// IAU承認の地名(2018-12)。経度は東経0-360度
export const FEATURES = [
  { n: 'ウラシマ', en: 'Urashima', k: 'crater', lat: -8.1, lon: 92.9, d: 290, note: 'リュウグウ最大のクレーター。直径は約290 m。' },
  { n: 'オトヒメ', en: 'Otohime Saxum', k: 'boulder', lat: -69.8, lon: 274.4, d: 160, note: 'リュウグウ最大の岩塊。南極に近い。' },
  { n: 'モモタロウ', en: 'Momotaro', k: 'crater', lat: -12.5, lon: 51.9, d: 190, note: '4番目に大きいクレーター。' },
  { n: 'キンタロウ', en: 'Kintaro', k: 'crater', lat: 0.4, lon: 157.8, d: 170, note: '5番目に大きいクレーター。' },
  { n: 'キビダンゴ', en: 'Kibidango', k: 'crater', lat: -31.2, lon: 50.0, d: 130, note: '桃太郎が旅に持った、きびだんごの名。' },
  { n: 'サンドリヨン', en: 'Cendrillon', k: 'crater', lat: 31.9, lon: 350.5, d: 220, note: '赤道の尾根の外で最大のクレーター。' },
  { n: 'ブラボー', en: 'Brabo', k: 'crater', lat: 4.5, lon: 229.7, d: 140, note: 'オランダの童話の若者にちなむ。' },
  { n: 'コロボック', en: 'Kolobok', k: 'crater', lat: -1.5, lon: 333.5, d: 180, note: 'ロシアの童話に出てくる、転がるパンの名。' },
  { n: 'トコヨ', en: 'Tokoyo Fossa', k: 'trench', lat: -49.4, lon: 166.2, d: 560, note: '最も大きな溝状の凹地。' },
  { n: 'ホウライ', en: 'Horai Fossa', k: 'trench', lat: 32.1, lon: 296.6, d: 330, note: '2番目に大きな溝状の凹地。' },
  { n: 'エジマ', en: 'Ejima Saxum', k: 'boulder', lat: -32.0, lon: 101.1, d: 70, note: '形成の歴史を知る手がかりになる岩塊。' },
  { n: 'カタフォ', en: 'Catafo Saxum', k: 'boulder', lat: -5.5, lon: 0.0, d: 50, note: '経度0度の基準にされた岩塊。' },
  { n: 'リュウジン', en: 'Ryujin Dorsum', k: 'ridge', lat: 0.0, lon: 180.0, d: 3200, note: '赤道をぐるりと囲む尾根。' },
];

export const INSTRUMENTS = [
  { id: 'onc', label: 'ONC', gloss: '見る', long: '光学航法カメラ。表面の色と質感' },
  { id: 'tir', label: 'TIR', gloss: '熱', long: '中間赤外カメラ。表面温度' },
  { id: 'lidar', label: 'LIDAR', gloss: '形', long: 'レーザ高度計。距離と起伏' },
  { id: 'sample', label: 'SAMPLE', gloss: '物質', long: '持ち帰った粒子。約5.4 g' },
];
