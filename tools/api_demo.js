// 口（core/api.js）だけで曲を作る試験。ゲームの状況が時間とともに変わる筋書きを流し、書き出して記録する。
//   node tools/api_demo.js [--sec 300] [--out listen/api/demo.wav]
import { Music } from '../core/api.js';
import { loadSamplesNode } from './node_samples.js';
import { writeWav } from './lib.js';
const a = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => { const [k, ...v] = s.trim().split(' '); return [k, v.join(' ')]; }));
loadSamplesNode();
const sr = 48000, sec = Number(a.sec || 300);
const records = [];
const music = new Music({ sampleRate: sr, seed: 3, scene: '焚き火・団らん', onFeedback: (r) => records.push(r) });
const log = [];
music.on('section', (e) => log.push(`${e.time.toFixed(1).padStart(6)}s 区間=${e.name}(${e.bars}) 歩容=${e.gait} ${e.bpm.toFixed(0)}BPM 調=${e.key >= 0 ? '+' : ''}${e.key} 進行=${e.prog}`));
music.on('transition', (e) => log.push(`${e.time.toFixed(1).padStart(6)}s ◇切り替え ${e.from} → ${e.to} ${e.bpm.toFixed(0)}BPM`));
music.on('cue', (e) => log.push(`${e.time.toFixed(1).padStart(6)}s ◆合図 ${e.name} → ${e.section}`));
// 筋書き: [時刻, 命令]（すべて JSON で表せる）
const script = [
  [0, { op: 'situation', args: { scene: '焚き火・団らん', intensity: 0.35 } }],
  [0, { op: 'bind', args: ['danger', { intensity: 0.6, 'ground.rough': 0.4, lift: -0.5, energy: 0.3 }] }],
  [40, { op: 'signal', args: ['danger', 0.5] }],
  [55, { op: "situation", args: { scene: "戦場・決意", intensity: 0.7 } }],
  [70, { op: 'cue', args: ['boss'] }],
  [95, { op: 'signal', args: ['danger', 0] }],
  [100, { op: 'situation', args: { scene: '追悼', intensity: 0.3 } }],
  [140, { op: 'situation', args: { blend: { 深海: 0.6, 神秘: 0.4 }, intensity: 0.4 } }],
  [180, { op: 'style', args: { motif: { degrees: [0, 2, 4, 7, 4, 2], rhythm: [[0, 4], [4, 2], [6, 2], [8, 6], [16, 4], [20, 12]] }, logo: true } }],
  [180, { op: 'situation', args: { scene: 'かわいい', intensity: 0.6 } }],
  [200, { op: 'feedback', args: [1, 'この旋律いい'] }],
  [230, { op: 'situation', args: { scene: '星空・希望', intensity: 0.5 } }],
  [265, { op: 'cue', args: ['silence'] }],
  [275, { op: 'situation', args: { scene: '恐怖', intensity: 0.7 } }],
  [320, { op: 'situation', args: { scene: '勝利', intensity: 0.8 } }],
];
const n = Math.round(sec * sr), L = new Float32Array(n), R = new Float32Array(n);
const block = 4800; let k = 0;
const t0 = Date.now();
for (let i = 0; i < n; i += block) {
  const t = i / sr;
  while (k < script.length && script[k][0] <= t) { const c = script[k++][1]; music.command(c); log.push(`${t.toFixed(1).padStart(6)}s ▶ ${c.op} ${JSON.stringify(c.args)}`); }
  music.render(L, R, i, Math.min(block, n - i));
}
const out = a.out || 'listen/api/demo.wav';
writeWav(out, L, R, sr);
console.log(log.join('\n'));
console.log(`\n${(sec / ((Date.now() - t0) / 1000)).toFixed(1)}x realtime → ${out}`);
console.log('記録:', JSON.stringify(records.map((r) => ({ kind: r.kind, score: r.score, note: r.note, gait: r.state?.gait, inst: r.state?.instruments }))));
console.log('最終状態:', JSON.stringify({ ...music.state(), latent: undefined }));
