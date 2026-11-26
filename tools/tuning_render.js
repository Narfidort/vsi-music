#!/usr/bin/env node
// 各楽器の単音を書き出す（音程の客観検査用。tools/tuning_check.py が pYIN で測る）
import { Pluck } from '../kernel/pluck.js';
import { Voice } from '../kernel/voice.js';
import { derive } from '../kernel/physics.js';
import { clampLatent } from '../kernel/space.js';
import { mulberry32 } from '../kernel/dsp.js';
import { writeWav } from './lib.js';
const sr = 48000, rng = mulberry32(5);
const cases = [
  ['pluck_dark', 'pluck', { bright: 0.2, edge: 0.3 }], ['pluck_bright', 'pluck', { bright: 0.8, edge: 0.6 }],
  ['modal_soft', 'modal', { bright: 0.8, edge: 0.3 }], ['modal_hard', 'modal', { bright: 0.9, edge: 0.9 }],
  ['bow', 'bow', { bright: 0.4, edge: 0.2 }], ['blow', 'blow', { bright: 0.8, edge: 0.2 }],
];
for (const [name, instr, body] of cases) {
  for (const midi of [45, 57, 69, 81]) {
    const z = clampLatent({ figure: { ...body, size: 0.5, rough: 0, energy: 0.4, voice: 0 } });
    const P = derive(z).figure;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const note = { freq, dur: 1.2, attack: P.attack, ringTau: P.ringTau, rel: 0.1, morph: instr === 'bow' || instr === 'blow' ? { long: 1 } : { n: 1 }, gain: 0.5, burst: 0, burstDecay: 0.01, glideTime: 0.001, instr, vib: 0 };
    const v = instr === 'pluck' ? new Pluck(sr, rng) : new Voice(sr, rng);
    v.trigger(note, P);
    const n = sr * 1.5, L = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = v.tick(P);
    writeWav(`out/tuning/${name}_${midi}.wav`, L, L, sr);
  }
}
