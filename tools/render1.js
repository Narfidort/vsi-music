// カーネル v1 のオフライン書き出し。 node tools/render1.js --preset 怒り --sec 120 --out listen/v1/怒り.wav [--seed 1]
import { Engine } from '../core/engine.js';
import { PRESETS } from '../core/presets.js';
import { writeWav } from './lib.js';
const a = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => { const [k, ...v] = s.trim().split(' '); return [k, v.join(' ')]; }));
const sr = 48000, sec = Number(a.sec || 60), name = a.preset || '深海';
const eng = new Engine({ sampleRate: sr, seed: Number(a.seed || 1), latent: PRESETS[name] });
const log = []; let notes = 0;
eng.onEvent((e) => { if (e.type === 'section') log.push(`${e.time.toFixed(1)}s ${e.name} 歩容=${e.gait} ${e.bpm.toFixed(0)}BPM 進行=${e.prog}`); if (e.type === 'note') notes++; });
const n = Math.round(sec * sr), L = new Float32Array(n), R = new Float32Array(n);
const t = Date.now(); eng.render(L, R, 0, n);
writeWav(a.out || `listen/v1/${name}.wav`, L, R, sr);
console.log(`${name}: ${(sec / ((Date.now() - t) / 1000)).toFixed(1)}x realtime, ${(notes / sec).toFixed(1)} notes/s`);
console.log(log.join('\n'));
console.log('楽器:', [...(eng.used || [])].join(' '));
