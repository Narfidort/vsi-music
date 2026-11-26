#!/usr/bin/env node
// 実験用の刺激と回答シートを生成する。docs/04_experiments.md の各実験に対応。
//   node tools/experiment.js exp01   （exp01〜exp05、または all）
// 出力: experiments/<exp>/stimuli/*.wav, sheet.md（回答用・盲検）, key.json（答え合わせ用。回答が終わるまで開かない）
import { writeFileSync, mkdirSync } from 'node:fs';
import { PRESETS, clampLatent, mergeLatent } from '../kernel/space.js';
import { derive } from '../kernel/physics.js';

const VERSION = 'v0.2';
import { onomatopoeia } from '../kernel/readout.js';
import { analyze } from '../kernel/analyze.js';
import { mulberry32 } from '../kernel/dsp.js';
import { renderLatent, writeWav, mono } from './lib.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function shuffle(arr, seed) {
  const r = mulberry32(seed), a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function build(name, title, conditions, { seconds, sheetHeader, sheetRow, seed = 11 }) {
  const dir = `experiments/${name}`;
  mkdirSync(`${dir}/stimuli`, { recursive: true });
  const order = shuffle(conditions, seed);
  const key = [];
  order.forEach((c, i) => {
    const id = LETTERS[i];
    const { L, R, sr } = renderLatent(c.latent, { seconds, seed: c.seed || 3, overrides: c.overrides || null });
    writeWav(`${dir}/stimuli/${id}.wav`, L, R, sr);
    key.push({ id, ...c, overrides: c.overridesLabel || (c.overrides ? 'custom' : null), readout: onomatopoeia(c.latent), features: analyze(mono(L, R), sr) });
    process.stdout.write(`${name} ${id} `);
  });
  writeFileSync(`${dir}/key.json`, JSON.stringify(key, null, 1));
  const rows = order.map((_, i) => sheetRow(LETTERS[i])).join('\n');
  writeFileSync(`${dir}/sheet.md`, `# ${title}（カーネル ${VERSION}）\n\n${sheetHeader}\n${rows}\n\n---\n回答日: \n気づいたこと（自由記述）:\n`);
  console.log(`\n→ ${dir}/sheet.md`);
}

const EXPS = {
  // P4: 情景語の座標は、その語に「合う」音を生む
  exp01() {
    const words = ['深海', '星空', '焚き火', '怒り', '悲しみ', '優しさ'];
    build('exp01', '実験01 情景語マッチング（予測 P4）', words.map((w) => ({ label: w, latent: clampLatent(PRESETS[w]) })), {
      seconds: 30,
      sheetHeader: `各刺激を聴き、それぞれの語にどのくらい合うかを 1（全く合わない）〜7（とても合う）で記入してください。「最も合う語」は自由記述（前回のように混合でも可）。「聴ける」は 1（耐えられない）〜7（ずっと聴いていられる）。\n先入観を避けるため、key.json は回答が終わるまで開かないでください。\n\n| 刺激 | ${words.join(' | ')} | 最も合う語 | 聴ける 1–7 |\n|---|${words.map(() => '---').join('|')}|---|---|`,
      sheetRow: (id) => `| ${id} | ${words.map(() => ' ').join(' | ')} | | |`,
    });
  },
  // P2: 聴き手が付けるオノマトペと読み出し器の一致（図だけを鳴らす）
  exp02() {
    const r = mulberry32(2026);
    const morphs = ['rep', 'q', 'n', 'long', 'ri'];
    const conds = Array.from({ length: 10 }, (_, i) => {
      const z = { distance: 0.2, space: 0.3, medium: 0, D: 0.8, ground: { density: 0 },
        figure: { size: r(), bright: r(), edge: r(), rough: r() * 0.9, energy: 0.2 + 0.6 * r(), voice: 0, density: 0.6, lift: 0, morph: { [morphs[i % 5]]: 1 } } };
      return { label: `rand${i}`, latent: clampLatent(z), seed: 10 + i };
    });
    build('exp02', '実験02 オノマトペ自由記述（予測 P2）', conds, {
      seconds: 15,
      sheetHeader: '各刺激を聴いて、頭に浮かんだ擬音語・擬態語を1つ（ひらがな/カタカナ）書いてください。考え込まず、最初に浮かんだもので構いません。\n\n| 刺激 | オノマトペ | 確信度 1–5 |\n|---|---|---|',
      sheetRow: (id) => `| ${id} | | |`,
    });
  },
  // P5: D による「話し声 → 歌」の相転移。反復の寄与 > 量子化の寄与（ここは声が主題なので voice = 1）
  exp03() {
    const base = clampLatent(PRESETS['独り言']);
    const conds = [];
    for (const D of [0, 0.2, 0.4, 0.6, 0.8, 1]) conds.push({ label: `D=${D}`, latent: { ...base, D } });
    conds.push({ label: 'repeat-only', latent: { ...base, D: 0 }, overrides: { figure: { repeatProb: 1 } }, overridesLabel: 'repeatProb=1, quant=0' });
    conds.push({ label: 'quant-only', latent: { ...base, D: 0 }, overrides: { figure: { pitchQuant: 1, timeQuant: 1, glide: 0.02, repeatProb: 0 } }, overridesLabel: 'quant=1, repeatProb=0' });
    build('exp03', '実験03 独り言 ↔ 音楽の連続体（予測 P5）', conds, {
      seconds: 25,
      sheetHeader: '※ この実験だけは「声」そのものが主題なので、合成の声が鳴ります。\n各刺激が「話している声」に聞こえるか「歌・音楽」に聞こえるかを 1（完全に話し声）〜7（完全に音楽）で記入してください。途中で聞こえ方が変わったら、その秒数もメモしてください。\n\n| 刺激 | 話し声1–7音楽 | 変わった時刻 | メモ |\n|---|---|---|---|',
      sheetRow: (id) => `| ${id} | | | |`,
    });
  },
  // P6: 物理則で連動させた size は、単独パラメータより「大きく」かつ自然
  exp04() {
    const neutral = clampLatent({ D: 0.8, ground: { density: 0 }, figure: { size: 0.5, density: 0.5, morph: { n: 0.6, rep: 0.4 } } });
    const conds = [];
    for (const size of [0.15, 0.85]) {
      const z = mergeLatent(neutral, { figure: { size } });
      const Pz = derive(z).figure;
      conds.push({ label: `full size=${size}`, latent: z });
      conds.push({ label: `formant/mode-only size=${size}`, latent: neutral, overrides: { figure: { formants: Pz.formants, L: Pz.L } }, overridesLabel: 'formants, L(高域減衰)' });
      conds.push({ label: `pitch-only size=${size}`, latent: neutral, overrides: { figure: { f0: Pz.f0 } }, overridesLabel: 'f0' });
      conds.push({ label: `tempo-only size=${size}`, latent: neutral, overrides: { figure: { period: Pz.period, ringTau: Pz.ringTau, attack: Pz.attack } }, overridesLabel: 'period/ringTau/attack' });
    }
    build('exp04', '実験04 大きさの物理連動（予測 P6）', conds, {
      seconds: 15,
      sheetHeader: '音を出している「もの」の大きさを 1（とても小さい）〜7（とても大きい）で、その音の自然さを 1（不自然・作り物っぽい）〜7（自然）で記入してください。\n\n| 刺激 | 大きさ 1–7 | 自然さ 1–7 | 何の音っぽい？ |\n|---|---|---|---|',
      sheetRow: (id) => `| ${id} | | | |`,
    });
  },
  // P3: 音色の粗さと和声の不協和は同じ「ざらざら」（地と図が同時に鳴るので和声が生じる）
  exp05() {
    const base = clampLatent({ D: 0.9, space: 0.35,
      ground: { size: 0.7, rough: 0, density: 0.6, morph: { long: 1 } },
      figure: { size: 0.4, rough: 0, density: 0.5, edge: 0.3, morph: { long: 0.5, n: 0.5 } } });
    const hiP = derive(mergeLatent(base, { ground: { rough: 0.9 }, figure: { rough: 0.9 } }));
    const timbre = (l) => ({ amDepth: hiP[l].amDepth, amFreq: hiP[l].amFreq, jitter: hiP[l].jitter, breath: hiP[l].breath });
    const conds = [
      { label: 'none', latent: base },
      { label: 'timbre-only', latent: base, overrides: { ground: timbre('ground'), figure: timbre('figure') }, overridesLabel: 'AM/jitter/breath' },
      { label: 'harmony-only', latent: base, overrides: { ground: { dissonance: 0.9 }, figure: { dissonance: 0.9 } }, overridesLabel: 'dissonance' },
      { label: 'both', latent: mergeLatent(base, { ground: { rough: 0.9 }, figure: { rough: 0.9 } }) },
    ];
    build('exp05', '実験05 粗さの統一（予測 P3）', conds, {
      seconds: 20,
      sheetHeader: '各刺激の「ざらざら感」を 1（つるつる）〜7（ざらざら）で、「不穏さ」を 1〜7 で記入してください。\n\n| 刺激 | ざらざら 1–7 | 不穏さ 1–7 | メモ |\n|---|---|---|---|',
      sheetRow: (id) => `| ${id} | | | |`,
    });
  },
};

const which = process.argv[2] || 'all';
for (const [k, f] of Object.entries(EXPS)) if (which === 'all' || which === k) f();
