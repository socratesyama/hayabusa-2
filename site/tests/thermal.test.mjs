// thermal.ts の単体テスト（表の形・補間・周期性）。node tests/thermal.test.mjs
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const here = dirname(fileURLToPath(import.meta.url)); const req = createRequire(import.meta.url);
let ts; for (const c of ['typescript', join(dirname(process.execPath), '..', 'lib', 'node_modules', 'typescript')]) { try { ts = req(c); break; } catch { /* next */ } }
if (!ts) throw new Error('typescript が見つかりません');
const out = mkdtempSync(join(tmpdir(), 'th-'));
writeFileSync(join(out, 'thermal.cjs'), ts.transpileModule(readFileSync(resolve(here, '..', 'src', 'thermal.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText);
const th = req(join(out, 'thermal.cjs'));
// 合成データ: 緯度行 j・時刻 i で値が一意（j*1000+i）。形は generator と同じ（19 緯度 × 9 熱慣性 × 3 赤緯 × 96）。
const lat = Array.from({ length: 19 }, (_, j) => -90 + 10 * j), ti = [50, 100, 150, 200, 250, 300, 350, 400, 450], dec = [-8, 0, 8];
const curves = []; for (let j = 0; j < 19; j++) for (let t = 0; t < 9; t++) for (let d = 0; d < 3; d++) curves.push(Array.from({ length: 96 }, (_, i) => j * 1000 + t * 100 + d * 10 + i));
const T = { lat_deg: lat, ti_tiu: ti, subsolar_lat_deg: dec, curves_K: curves };
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok', name); };
ok('表は19x96で、選んだ熱慣性・赤緯の列を引く', () => { const t = th.buildThermalTable(T, 7.0); assert.equal(t.w, 96); assert.equal(t.h, 19); assert.equal(t.decDeg, 8); assert.equal(t.tiTiu, 300); assert.equal(t.data[0], 0 * 1000 + 5 * 100 + 2 * 10 + 0); assert.equal(t.data[3 * 96 + 7], 3 * 1000 + 5 * 100 + 2 * 10 + 7); });
ok('最寄りの赤道傾斜(-8/0/+8)を選ぶ', () => { assert.equal(th.buildThermalTable(T, -3).decDeg, 0); assert.equal(th.buildThermalTable(T, -6).decDeg, -8); });
ok('格子点ちょうどでは値がそのまま返る（列の中心 = (i+0.5)/96 日）', () => { const t = th.buildThermalTable(T, 0); const v = th.sampleThermal(t, -90 + 10 * 4, 24 * (10 + 0.5) / 96); assert.ok(Math.abs(v - t.data[4 * 96 + 10]) < 1e-3); });
ok('地方時は周期的（0hと24hで同じ）', () => { const t = th.buildThermalTable(T, 0); assert.ok(Math.abs(th.sampleThermal(t, 20, 0) - th.sampleThermal(t, 20, 24)) < 1e-6); });
ok('緯度は端で止まる（範囲外でも落ちない）', () => { const t = th.buildThermalTable(T, 0); assert.ok(Number.isFinite(th.sampleThermal(t, 95, 3)) && Number.isFinite(th.sampleThermal(t, -95, 3))); });
ok('形が違うデータは拒否する', () => { assert.throws(() => th.buildThermalTable({ ...T, lat_deg: lat.slice(1) }, 0)); });
console.log(`${n} tests passed`);
