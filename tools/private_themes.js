// 個人用の主題: 自分で用意した楽譜（corpus/scores/<分類>/*.musicxml など）を変換して corpus/scores/_themes.json にまとめる。
//   node tools/private_themes.js [--dir corpus/scores]
// corpus/ は git の対象外。ローカルのサーバー（tools/server.js、127.0.0.1 だけ）が GET /api/private-themes で配り、
// 操作盤（web/ui）がそれを読めたときだけ、テーマの一覧と無限メドレーに加える。公開サイト（GitHub Pages）には出ない。
// 著作権のある曲は、私的に楽しむ範囲で使う（配布・公開には権利者の許諾が要る）。
// 個別に直したいときは _overrides.json に { "ファイル名": { "start": 61, "bars": 8, "part": 0, "scene": "夜・切なさ" } } を書く。
import { execFile } from 'node:child_process';
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { promisify } from 'node:util';
const run = promisify(execFile);
const ROOT = new URL('../', import.meta.url).pathname;
const a = process.argv.indexOf('--dir'), DIR = join(ROOT, a > 0 ? process.argv[a + 1] : 'corpus/scores');
const EXT = ['.musicxml', '.mxl', '.xml', '.mid', '.midi', '.abc', '.krn'];
const files = [];
for (const d of readdirSync(DIR)) { const p = join(DIR, d); if (statSync(p).isDirectory()) for (const f of readdirSync(p)) if (EXT.includes(extname(f).toLowerCase())) files.push([d, join(p, f)]); }
const manifest = existsSync(join(DIR, '_manifest.json')) ? JSON.parse(readFileSync(join(DIR, '_manifest.json'), 'utf8')) : [];
const overrides = existsSync(join(DIR, '_overrides.json')) ? JSON.parse(readFileSync(join(DIR, '_overrides.json'), 'utf8')) : {};
const labelOf = (f) => manifest.find((m) => m.file && basename(m.file) === basename(f))?.label;
// 場面の目安（無限メドレーの出発点。メドレーはそこから近い場面へ動いていく）
function sceneOf(cat, name, minor) {
  if (/battle|ganondorf|knights|bloody|戦|level5|unravel|guren|gate ?of/i.test(name)) return '戦場・決意';
  if (/save|safe ?room|serenity|promise/i.test(name)) return '部屋・安らぎ';
  if (cat === 'vocaloid') return minor ? '電脳・切なさ' : 'ポップ・わくわく';
  if (cat === 'game') return minor ? '城・神秘' : '草原・希望';
  return minor ? '夜・切なさ' : '街・楽しい';
}
const out = {}, failed = [];
const queue = [...files];
async function worker() {
  for (let job; (job = queue.shift());) {
    const [cat, f] = job, o = overrides[basename(f)] || {};
    const args = [join(ROOT, 'tools/score2theme.py'), f, '--json'];
    for (const k of ['start', 'bars', 'part', 'key']) if (o[k] !== undefined) args.push('--' + k, String(o[k]));
    if (o.minor) args.push('--minor');
    try {
      const { stdout } = await run(join(ROOT, '.venv/bin/python'), args, { maxBuffer: 1 << 24, timeout: 300000 });
      const r = JSON.parse(stdout.trim().split('\n').pop());
      const label = labelOf(f) || basename(f, extname(f));
      const name = label.replace(/\s*\(\d{4}\)\s*$/, '');
      out[name] = { melody: r.melody, chords: r.chords, source: `${label}・${r.key}${r.minor ? ' 短調' : ' 長調'}・${r.start} 小節目から（個人用）`, scene: o.scene || sceneOf(cat, name, r.minor), category: cat, private: true };
      process.stdout.write('.');
    } catch (e) { failed.push(basename(f)); process.stdout.write('x'); }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
writeFileSync(join(DIR, '_themes.json'), JSON.stringify(out, null, 1));
console.log(`\n${Object.keys(out).length} 曲 → ${join(DIR, '_themes.json')}${failed.length ? `（失敗: ${failed.join(', ')}）` : ''}`);
