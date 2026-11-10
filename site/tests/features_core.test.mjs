// features_core.ts の単体テスト（three.js不要）。TypeScriptでCJSに変換してから実行する。
// 実行: cd site && node tests/features_core.test.mjs
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);
let ts;
for (const c of ['typescript', join(dirname(process.execPath), '..', 'lib', 'node_modules', 'typescript')]) { try { ts = req(c); break; } catch { /* next */ } }
if (!ts) throw new Error('typescript が見つかりません（npm install 後に実行）');

const out = mkdtempSync(join(tmpdir(), 'fc-'));
for (const f of ['geo', 'features_core']) {
  const src = readFileSync(resolve(here, '..', 'src', f + '.ts'), 'utf8');
  writeFileSync(join(out, f + '.cjs'), ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText.replace(/require\("\.\/geo"\)/g, 'require("./geo.cjs")'));
}
const fc = req(join(out, 'features_core.cjs')); const geo = req(join(out, 'geo.cjs'));
const data = JSON.parse(readFileSync(resolve(here, '..', '..', '12_site_data', 'features.json'), 'utf8'));
const F = Object.fromEntries(data.features.map(f => [f.id, fc.prepare(f)]));
const all = Object.values(F);
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok', name); };
const off = (lat, lon, dEast, dNorth) => { // 地表上で東・北へ dEast/dNorth m ずれた方向（小距離の近似）
  return geo.geoToBody(lat + dNorth / geo.R_MEAN / geo.DEG, lon + dEast / geo.R_MEAN / geo.DEG / Math.cos(lat * geo.DEG), 1); };

ok('単位ベクトルと緯度経度の往復', () => {
  const g = geo.bodyToGeo(F.td1.dir); assert.ok(Math.abs(g.lat - 4.3) < 1e-6 && Math.abs(g.lon - 206.47) < 1e-6);
  assert.ok(Math.abs(Math.hypot(...F.urashima.dir) - 1) < 1e-12);
});
ok('円形の範囲判定（TD1 半径3m / ウラシマ 半径145m）', () => {
  assert.ok(fc.inRegion(F.td1, F.td1.dir));
  assert.ok(fc.inRegion(F.td1, off(4.3, 206.47, 2, 0)));
  assert.ok(!fc.inRegion(F.td1, off(4.3, 206.47, 10, 0)));
  assert.ok(fc.inRegion(F.td1, off(4.3, 206.47, 10, 0), 8));          // タップの余裕
  assert.ok(fc.inRegion(F.urashima, off(-8.1, 92.9, 100, 0)));
  assert.ok(!fc.inRegion(F.urashima, off(-8.1, 92.9, 200, 0)));
});
ok('帯（リュウジン・ドールスム）は赤道を挟む緯度帯', () => {
  const h = F.ryujin_dorsum.band_half_lat_deg; assert.ok(h >= 8 && h <= 16);
  assert.ok(fc.inRegion(F.ryujin_dorsum, geo.geoToBody(0, 12, 1)));
  assert.ok(fc.inRegion(F.ryujin_dorsum, geo.geoToBody(h - 0.5, 300, 1)));
  assert.ok(!fc.inRegion(F.ryujin_dorsum, geo.geoToBody(h + 1, 300, 1)));
});
ok('regionsAt は小さい地物から（TD1地点では TD1 → 尾根の順）', () => {
  const ids = fc.regionsAt(all, F.td1.dir).map(p => p.id); assert.equal(ids[0], 'td1'); assert.ok(ids.includes('ryujin_dorsum')); assert.equal(ids.at(-1), 'ryujin_dorsum');
});
ok('座標を持たない地物は範囲判定に出ない', () => {
  for (const id of ['minerva_ii1', 'candidate_l08', 'candidate_s01']) assert.ok(!F[id].placed && !fc.inRegion(F[id], F.td1.dir));
});
ok('視線判定: 球面では数十m先の地面は水平線の向こう、高い所からは見える', () => {
  const R = geo.R_MEAN; const flat = () => R;
  const a = geo.geoToBody(0, 0, R + 1.5), nearP = geo.geoToBody(0, 20 / R / geo.DEG, R), farP = geo.geoToBody(0, 200 / R / geo.DEG, R);
  assert.ok(fc.lineOfSight(a, nearP, flat), '20m先は見える');
  assert.ok(!fc.lineOfSight(a, farP, flat), '200m先は水平線の向こう（目の高さ1.5mの水平線は約37m）');
  assert.ok(fc.lineOfSight(geo.geoToBody(0, 0, R + 150), farP, flat), '高度150mなら見える');
});
ok('視線判定: 途中の岩（地面の隆起）が遮る', () => {
  const R = geo.R_MEAN; const bump = d => { const g = geo.bodyToGeo(d); return R + (Math.abs(g.lon - 0.05) < 0.02 && Math.abs(g.lat) < 1 ? 40 : 0); };
  const a = geo.geoToBody(0, 0, R + 60), t = geo.geoToBody(0, 0.1, R);
  assert.ok(!fc.lineOfSight(a, t, bump)); assert.ok(fc.lineOfSight(a, t, () => R));
});
ok('候補点: 小さい地点は中心のみ、クレーターは中心+内側4+縁8、帯は36', () => {
  assert.equal(fc.candidatePoints(F.td1).length, 1); assert.equal(fc.candidatePoints(F.urashima).length, 13); assert.equal(fc.candidatePoints(F.ryujin_dorsum).length, 36);
  for (const d of fc.candidatePoints(F.urashima)) assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9);
});
ok('案内点と距離', () => {
  const here = geo.geoToBody(0, 100, 1);
  assert.equal(fc.guidePoint(F.ryujin_dorsum, here), null);                       // 帯の中
  const gp = fc.guidePoint(F.ryujin_dorsum, geo.geoToBody(40, 100, 1)); const g = geo.bodyToGeo(gp); assert.ok(Math.abs(g.lat) < 1e-6 && Math.abs(g.lon - 100) < 1e-6);
  assert.ok(Math.abs(fc.distanceTo(F.td1, off(4.3, 206.47, 100, 0)) - 100) < 1);
});
ok('出来事の前後（TD1 2019-02-21T22:29:10Z）', () => {
  const t = Date.parse('2019-02-21T22:29:10Z');
  assert.equal(fc.eventState(F.td1, t - 1), 'before'); assert.equal(fc.eventState(F.td1, t), 'after'); assert.equal(fc.eventState(F.urashima, t), 'none');
  assert.equal(fc.shaderAlpha(F.sci_crater, t, false), 0.3);                      // 人工クレーターはまだない
  assert.equal(fc.eventChip(Date.parse('2020-12-06T00:00:00Z'), t).cls, 'later');
});
ok('距離の表示', () => { assert.equal(fc.fmtDist(42.4), '42m'); assert.equal(fc.fmtDist(234), '230m'); assert.equal(fc.fmtDist(1540), '1.5km'); });
console.log(`${n} tests passed`);
