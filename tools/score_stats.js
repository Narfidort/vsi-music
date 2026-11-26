#!/usr/bin/env node
// 楽譜レベルの旋律統計（エンジンが出した figure のノート列から）。音声解析の誤差と生成器の性質を切り分けるため。
import { PRESETS, clampLatent } from '../kernel/space.js';
import { Engine } from '../kernel/engine.js';
for (const name of Object.keys(PRESETS)) {
  const e = new Engine({ seed: 3, latent: clampLatent(PRESETS[name]) });
  const fig = [];
  e.onEvent((ev) => { if (ev.type === 'note' && ev.layer === 'figure') fig.push(Math.round(ev.semi)); });
  const n = 48000 * 90; e.render(new Float32Array(n), new Float32Array(n));
  const iv = fig.slice(1).map((v, i) => Math.abs(v - fig[i])).filter((x) => x > 0);
  const r = (f) => iv.length ? (iv.filter(f).length / iv.length).toFixed(2) : '-';
  const mean = iv.length ? (iv.reduce((a, b) => a + b, 0) / iv.length).toFixed(1) : '-';
  console.log(name.padEnd(4), 'notes', String(fig.length).padStart(3), 'step', r((x) => x <= 2), 'leap', r((x) => x >= 5), 'meanInt', mean, 'range', fig.length ? Math.max(...fig) - Math.min(...fig) : '-', 'center', fig.length ? (fig.reduce((a, b) => a + b, 0) / fig.length + 45).toFixed(0) : '-');
}
