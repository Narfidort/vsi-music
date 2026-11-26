#!/usr/bin/env node
// 使い方:
//   node tools/render.js --preset 深海 --sec 30 --out out/deepsea.wav
//   node tools/render.js --set size=0.9,bright=0.1,medium=0.9 --out out/x.wav
import { PRESETS, clampLatent, mergeLatent } from '../kernel/space.js';
import { onomatopoeia } from '../kernel/readout.js';
import { analyze } from '../kernel/analyze.js';
import { renderLatent, writeWav, mono, parseSet } from './lib.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const base = args.preset ? PRESETS[args.preset] : {};
if (args.preset && !base) { console.error('unknown preset. available:', Object.keys(PRESETS).join(' ')); process.exit(1); }
const latent = mergeLatent(clampLatent(base), parseSet(args.set));
const sec = Number(args.sec || 20);
const t0 = Date.now();
const { L, R, sr } = renderLatent(latent, { seconds: sec, seed: Number(args.seed || 1) });
const out = args.out || `out/${args.preset || 'render'}.wav`;
writeWav(out, L, R, sr);
const f = analyze(mono(L, R), sr);
console.log(JSON.stringify({ out, onomatopoeia: onomatopoeia(latent), renderSec: (Date.now() - t0) / 1000, features: f }, null, 1));
