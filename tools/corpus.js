#!/usr/bin/env node
// 実在の楽曲を、カーネルと同じ analyze() で測る（理論の手がかりを実音楽に当てる）。
//   node tools/corpus.js <フォルダ> [ラベル]      例: node tools/corpus.js corpus/WATER WATER
// フォルダ内の音声ファイル（mp3/m4a/opus/wav/flac/webm…）を ffmpeg で 48 kHz モノラルに変換し、
// 曲の中央 60 秒を 20 秒ごとに 3 区間測る。結果は corpus/features.jsonl に追記する。
// 音声ファイルそのものはローカルに置くだけで、リポジトリや外部には出さない。
import { execFileSync } from 'node:child_process';
import { readdirSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { analyze } from '../kernel/analyze.js';

const dir = process.argv[2];
const label = process.argv[3] || basename(dir || '');
if (!dir) { console.error('usage: node tools/corpus.js <folder> [label]'); process.exit(1); }
const EXT = new Set(['.mp3', '.m4a', '.opus', '.wav', '.flac', '.webm', '.ogg', '.aac']);
const SR = 48000;
mkdirSync('corpus', { recursive: true });

for (const f of readdirSync(dir).filter((x) => EXT.has(extname(x).toLowerCase()))) {
  const path = join(dir, f);
  const buf = execFileSync('ffmpeg', ['-v', 'quiet', '-i', path, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const x = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const seg = 20 * SR, mid = Math.floor(x.length / 2);
  const start = Math.max(0, mid - 1.5 * seg);
  const parts = [];
  for (let s = start; s + seg <= x.length && parts.length < 3; s += seg) parts.push(analyze(x.subarray(s, s + seg), SR));
  if (!parts.length) continue;
  const mean = {};
  for (const k of Object.keys(parts[0])) mean[k] = parts.reduce((a, p) => a + p[k], 0) / parts.length;
  const row = { label, file: f, seconds: x.length / SR, features: mean };
  appendFileSync('corpus/features.jsonl', JSON.stringify(row) + '\n');
  console.log(label, f, Object.entries(mean).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(' '));
}
