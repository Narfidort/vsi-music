// Node 用: 録音のカタログと読み込み係をカーネルに差し込む
import { readFileSync, existsSync } from 'node:fs';
import { setCatalog, setLoader } from '../core/sampler.js';

const ROOT = new URL('../', import.meta.url).pathname;
export function readWav(path) {
  const b = readFileSync(path);
  let p = 12, fmt = null, data = null;
  while (p < b.length - 8) {
    const id = b.toString('ascii', p, p + 4), sz = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10) };
    if (id === 'data') { data = b.subarray(p + 8, p + 8 + sz); break; }
    p += 8 + sz + (sz & 1);
  }
  const n = data.length / 2 / fmt.ch, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = data.readInt16LE(i * 2 * fmt.ch) / 32768;
  return out;
}
export function loadSamplesNode() {
  const f = ROOT + 'assets/samples/catalog.json';
  if (!existsSync(f)) return false;
  setCatalog(JSON.parse(readFileSync(f, 'utf8')));
  setLoader((file) => readWav(ROOT + file));
  return true;
}
