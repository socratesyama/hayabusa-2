import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const required = [
  'public/data/rotation.json',
  'public/data/sun_table.json',
  'public/data/gravity_763.json',
  'public/data/gravity_340.json',
  'public/assets/generated/ryugu_lod3_5k.obj',
  'public/assets/generated/ryugu_heightmap_2048.png',
];
const missing = required.filter((relative) => !existsSync(join(root, relative)));
if (missing.length) {
  console.error('生成済みサイトアセットがありません。先に npm run precompute を実行してください。');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}
for (const relative of required) {
  if (statSync(join(root, relative)).size === 0) {
    console.error(`空のアセットです: ${relative}`);
    process.exit(1);
  }
}
