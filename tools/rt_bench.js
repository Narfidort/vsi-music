// 実時間の余裕を測る: 128 サンプルのブロックごとの処理時間（48 kHz で 2.67 ms が予算）
import { Music } from '../core/api.js';
import { loadSamplesNode } from './node_samples.js';
loadSamplesNode();
const sr = 48000, B = 128, budget = (B / sr) * 1000;
for (const scene of ['深海', '怒り', 'かわいい', '悲しみ', '恐怖', '勝利']) {
  const m = new Music({ sampleRate: sr, seed: 2, scene });
  const L = new Float32Array(B), R = new Float32Array(B), ts = [];
  for (let i = 0; i < (sr * 60) / B; i++) { const t = performance.now(); m.render(L, R, 0, B); ts.push(performance.now() - t); }
  ts.sort((a, b) => a - b);
  const p = (q) => ts[Math.floor(ts.length * q)];
  console.log(`${scene.padEnd(5)} 平均 ${(ts.reduce((a, b) => a + b) / ts.length).toFixed(3)}ms  p99 ${p(0.99).toFixed(3)}ms  p99.9 ${p(0.999).toFixed(3)}ms  最大 ${ts[ts.length - 1].toFixed(2)}ms  予算 ${budget.toFixed(2)}ms  超過 ${ts.filter((x) => x > budget).length}`);
}
