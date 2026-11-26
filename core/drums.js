// 打楽器（v1）。拍節の上の衝突音。種類は歩容が決める（叩きつける = ティンパニ、跳ねる = ドラムマシン）。
//   kick  … 膜の衝突: 張力が戻るにつれ音高が下がる（150 → 45 Hz）
//   clap / snare … 多数の小さな衝突（帯域ノイズ）。スネアは膜の胴鳴り付き
//   hat / ohat … 薄い金属板: 高域のノイズ、短い / 長い
//   timp  … 張られた大きな膜（ティンパニ）: 非調和なモード 1, 1.5, 1.98, 2.44 と柔らかいマレット

import { Biquad } from '../kernel/dsp.js';

class Hit {
  constructor(sr) { this.sr = sr; this.f1 = new Biquad(); this.f2 = new Biquad(); this.active = false; this.ph = new Float64Array(4); }
  start(type, gain, freq) {
    Object.assign(this, { type, gain, freq, t: 0, active: true }); this.ph.fill(0);
    const sr = this.sr;
    if (type === 'clap') this.f1.set('bp', 1200, 1.2, sr);
    if (type === 'snare') this.f1.set('hp', 1500, 0.7, sr);
    if (type === 'hat' || type === 'ohat') { this.f1.set('hp', 7000, 0.7, sr); this.f2.set('hp', 7000, 0.7, sr); }
    if (type === 'timp') this.f1.set('lp', 300, 0.7, sr);
  }
  tick(rng) {
    if (!this.active) return 0;
    const t = this.t, sr = this.sr, w = rng() * 2 - 1;
    let y = 0, life;
    switch (this.type) {
      case 'kick': {
        const f = 45 + 110 * Math.exp(-t / 0.035); this.ph[0] += f / sr;
        y = Math.sin(2 * Math.PI * this.ph[0]) * Math.exp(-t / 0.28) + w * 0.4 * Math.exp(-t / 0.002); life = 1.4; break;
      }
      case 'clap': {
        const burst = [0, 0.011, 0.022].reduce((s, o) => s + (t >= o ? Math.exp(-(t - o) / 0.004) : 0), 0);
        y = this.f1.tick(w) * (burst + 0.5 * Math.exp(-t / 0.09)) * 2.5; life = 0.5; break;
      }
      case 'snare': {
        this.ph[0] += 190 / sr;
        y = Math.sin(2 * Math.PI * this.ph[0]) * Math.exp(-t / 0.05) * 0.7 + this.f1.tick(w) * Math.exp(-t / 0.12) * 1.3; life = 0.6; break;
      }
      case 'hat': y = this.f2.tick(this.f1.tick(w)) * Math.exp(-t / 0.025) * 1.5; life = 0.2; break;
      case 'ohat': y = this.f2.tick(this.f1.tick(w)) * Math.exp(-t / 0.18) * 1.2; life = 1; break;
      case 'timp': {
        const R = [1, 1.5, 1.98, 2.44], A = [1, 0.5, 0.3, 0.15], T = [1.4, 0.9, 0.6, 0.4];
        for (let k = 0; k < 4; k++) { this.ph[k] += this.freq * R[k] / sr; y += A[k] * Math.sin(2 * Math.PI * this.ph[k]) * Math.exp(-t / T[k]); }
        y += this.f1.tick(w) * Math.exp(-t / 0.01) * 0.8; life = 3; break;
      }
    }
    this.t += 1 / sr;
    if (t > life) this.active = false;
    return y * this.gain;
  }
}

export class Drums {
  constructor(sr, rng) { this.sr = sr; this.rng = rng; this.hits = Array.from({ length: 16 }, () => new Hit(sr)); this.k = 0; this.lastKick = -1; }
  trigger(type, gain, freq = 55, time = 0) {
    let h = this.hits.find((x) => !x.active);
    if (!h) { h = this.hits[this.k]; this.k = (this.k + 1) % this.hits.length; }
    h.start(type, gain, freq);
    if (type === 'kick') this.lastKick = time;
  }
  tick() { let s = 0; for (const h of this.hits) s += h.tick(this.rng); return s; }
}
