import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Engine } from '../kernel/engine.js';

export function renderLatent(latent, { seconds = 20, sr = 48000, seed = 1, overrides = null } = {}) {
  const eng = new Engine({ sampleRate: sr, seed, latent, overrides });
  const events = [];
  eng.onEvent((e) => events.push(e));
  const n = Math.round(seconds * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  eng.render(L, R, 0, n);
  return { L, R, sr, engine: eng, events, noteRate: events.filter((e) => e.type === 'note').length / seconds };
}

export function mono(L, R) { const m = new Float32Array(L.length); for (let i = 0; i < L.length; i++) m[i] = 0.5 * (L[i] + R[i]); return m; }

export function writeWav(path, L, R, sr) {
  mkdirSync(dirname(path), { recursive: true });
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  // 正規化（-1 dBFS）。実験での音量差は energy 軸の効果として残したいので、ピークが 0.89 を超えるときだけ下げる。
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak > 0.89 ? 0.89 / peak : 1;
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
  }
  writeFileSync(path, buf);
}

// "size=0.9,ground.bright=0.1,figure.morph.n=1,medium=0.8" → 部分的な latent
// レイヤー名を省いた音源の軸は figure に入る
export function parseSet(str) {
  const z = {};
  if (!str) return z;
  for (const kv of str.split(',')) {
    const [path, v] = kv.split('=');
    let parts = path.split('.');
    const WORLD = ['distance', 'space', 'medium', 'D'];
    if (!['ground', 'figure'].includes(parts[0]) && !WORLD.includes(parts[0])) parts = ['figure', ...parts];
    let o = z;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
    o[parts[parts.length - 1]] = Number(v);
  }
  return z;
}
