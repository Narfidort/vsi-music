#!/usr/bin/env node
// 理論とカーネルの整合性テスト。
// 各軸だけを low → high に動かし（他は中立）、理論が予測する音響手がかりが予測の向きに動くかを確かめる。
// 「カーネルが理論を実装している」ことの最低限の証明。理論を変えたらまずこれを通す。
// 注: レート（出来事の速さ）は、持続音のうなりがある状態では音声から頑健に測れないため、
//     当面は楽譜レベル（エンジンが出したノート数）で検証している。docs/03_kernel.md「未解決」を参照。
import { analyze } from '../kernel/analyze.js';
import { renderLatent, mono } from './lib.js';

// 図（figure）だけを鳴らし、地は無音にして各軸の効果を分離する。世界の軸はトップレベル。
const NEUTRAL = { distance: 0.2, space: 0.3, medium: 0, D: 0.8,
  ground: { density: 0 },
  figure: { size: 0.5, bright: 0.5, edge: 0.4, rough: 0.2, energy: 0.4, voice: 0, density: 0.7, lift: 0,
    morph: { rep: 0.5, long: 0.3, n: 0.2, q: 0, ri: 0 } } };
const WORLD = ['distance', 'space', 'medium', 'D'];
const at = (ax, v, fig = {}) => WORLD.includes(ax) ? { ...NEUTRAL, [ax]: v, figure: { ...NEUTRAL.figure, ...fig } }
  : ax.startsWith('voice:') ? { ...NEUTRAL, figure: { ...NEUTRAL.figure, voice: 1, [ax.slice(6)]: v } }
  : { ...NEUTRAL, figure: { ...NEUTRAL.figure, [ax]: v } };

// [軸, low, high, 特徴量, 期待される符号, 根拠]
const TESTS = [
  ['size', 0.1, 0.9, 'centroid', -1, '共鳴 ∝ 1/L'],
  ['size', 0.1, 0.9, 'noteRate', -1, '周期 ∝ √L（楽譜レベル）'],
  ['bright', 0.1, 0.9, 'balanceDb', +1, 'Balance（Fort & Schwartz）'],
  ['bright', 0.1, 0.9, 'centroid', +1, '前舌化 + 傾き'],
  ['edge', 0.1, 0.9, 'continuity', -1, 'Continuity（Fort & Schwartz）'],
  ['rough', 0.05, 0.9, 'roughness', +1, '20–150 Hz 変調（Winter /r/, Plomp & Levelt）'],
  ['energy', 0.1, 0.9, 'rms', +1, '音量'],
  ['energy', 0.1, 0.9, 'noteRate', +1, 'レート（楽譜レベル）'],
  ['medium', 0, 0.9, 'centroid', -1, '水中の高域吸収（高域を持つ明るい音源で）', { bright: 0.95, edge: 0.8 }],
  ['medium', 0, 0.9, 'noteRate', -1, '粘性（楽譜レベル）'],
  ['space', 0.05, 0.95, 'continuity', +1, '残響が谷を埋める'],
  ['distance', 0.05, 0.95, 'rms', -1, '直接音の逆距離減衰（主要手がかり。残響の水準は距離によらない）'],
  ['distance', 0.05, 0.95, 'balanceDb', -1, '空気吸収（副次的手がかり。高域を持つ音源で）', { bright: 0.95, edge: 0.8 }],
  ['density', 0.1, 0.9, 'noteRate', +1, '出来事の生起率（v0.2）'],
  ['density', 0.1, 0.9, 'continuity', +1, '無音の減少（v0.2）'],
  ['voice', 0, 1, 'continuity', +1, '声は励振が持続する／固体は撃力で減衰（v0.2）'],
  ['voice:edge', 0.1, 0.9, 'continuity', -1, '声でも Continuity が効く'],
  ['voice:bright', 0.1, 0.9, 'balanceDb', +1, '声でも Balance が効く'],
];

const sec = Number(process.argv[2] || 12);
const cache = new Map();
function feat(z) {
  const key = JSON.stringify(z);
  if (!cache.has(key)) { const { L, R, sr, noteRate } = renderLatent(z, { seconds: sec, seed: 7 }); cache.set(key, { ...analyze(mono(L, R), sr), noteRate }); }
  return cache.get(key);
}

let pass = 0;
const rows = [];
for (const [ax, lo, hi, f, sign, why, fig] of TESTS) {
  const a = feat(at(ax, lo, fig))[f], b = feat(at(ax, hi, fig))[f];
  const rel = Math.abs(b - a) / (Math.abs(a) + 1e-9);
  const dirOk = Math.sign(b - a) === sign;
  const ok = dirOk && rel >= 0.05;            // 5% 未満の変化は「効いていない」とみなす
  if (ok) pass++;
  rows.push(`${ok ? 'PASS' : dirOk ? 'WEAK' : 'FAIL'}  ${ax.padEnd(8)} ${String(lo).padStart(4)}→${String(hi).padEnd(4)} ${f.padEnd(11)} ${a.toFixed(3).padStart(9)} → ${b.toFixed(3).padStart(9)}  期待 ${sign > 0 ? '↑' : '↓'} (${(rel * 100).toFixed(0)}%)  ${why}`);
}
console.log(rows.join('\n'));
console.log(`\n${pass}/${TESTS.length} passed`);
process.exit(pass === TESTS.length ? 0 : 1);
