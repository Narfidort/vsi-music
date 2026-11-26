// 電子音源（v1, docs/06_review.md §4.5）。
// 仮想音源としての電子音: 完全に周期的で、胴の共鳴を持たない「機械の身体」。離散化 D が極限（≥ 0.95、
// 人の揺らぎがない = 演奏者は機械）のときに推定される。
//   saw    … 弓の極限（ヘルムホルツ運動そのもの）
//   square … 閉管の極限（奇数倍音）。小さな電子の玩具（ゲーム機）
//   super  … のこぎり波の合奏（多数の奏者 = デチューン）
// 波形は PolyBLEP で帯域制限。低域通過フィルタの開閉とアンプの ADSR。

import { Biquad } from '../kernel/dsp.js';

function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

export class Synth {
  constructor(sr, rng) { this.sr = sr; this.rng = rng; this.active = false; this.lp = new Biquad(); this.lp2 = new Biquad(); this.ph = new Float64Array(7); }
  // note: { freq, dur, gain, wave, attack, decay, sustain, release, cutoff, envAmt, fdec }
  trigger(n) {
    this.n = n; this.active = true; this.t = 0; this.ctr = 0;
    this.u = n.wave === 'super' ? 7 : n.wave === 'saw' ? 2 : 1;
    this.from = n.glideFrom || n.freq; // ポルタメント（音高の滑り）
    this.det = [];
    for (let i = 0; i < this.u; i++) {
      const c = this.u === 1 ? 0 : (i / (this.u - 1) - 0.5) * (n.wave === 'super' ? 30 : 8);
      this.det.push(Math.pow(2, c / 1200)); this.ph[i] = this.rng();
    }
  }
  tick() {
    if (!this.active) return 0;
    const n = this.n, t = this.t, sr = this.sr;
    if (this.ctr-- <= 0) {
      this.ctr = 32;
      const fc = Math.min(sr * 0.42, n.cutoff * (1 + n.envAmt * Math.exp(-t / n.fdec)));
      this.lp.set('lp', fc, 0.8, sr); this.lp2.set('lp', fc, 0.6, sr);
    }
    let env;
    if (t < n.attack) env = t / n.attack;
    else if (t < n.dur) env = n.sustain + (1 - n.sustain) * Math.exp(-(t - n.attack) / n.decay);
    else { const e0 = n.sustain + (1 - n.sustain) * Math.exp(-(n.dur - n.attack) / n.decay); env = e0 * Math.exp(-(t - n.dur) / n.release); if (env < 1e-4) { this.active = false; return 0; } }
    let y = 0;
    for (let i = 0; i < this.u; i++) {
      const fq = n.freq + (this.from - n.freq) * Math.exp(-t / (n.glideTime || 0.04));
      const dt = fq * this.det[i] / sr;
      let p = this.ph[i] + dt; if (p >= 1) p -= 1; this.ph[i] = p;
      if (n.wave === 'sine') y += Math.sin(2 * Math.PI * p) * 1.4;
      else if (n.wave === 'square') { y += (p < 0.5 ? 1 : -1) + blep(p, dt) - blep((p + 0.5) % 1, dt); }
      else y += 2 * p - 1 - blep(p, dt);
    }
    y /= Math.sqrt(this.u);
    this.t += 1 / sr;
    return this.lp2.tick(this.lp.tick(y)) * env * n.gain * 0.5;
  }
}
