// 拍（パルス）層 v0.3。拍節の格子の上で起きる「衝突」の音（Gaver: 叩かれた固体）。
// 音色は地（ground）の音源の物理から導く:
//   low  … 大きな物体の衝突: 音高 ∝ 1/L、減衰 ∝ √L
//   tick … 小さな衝突: ノイズを共鳴させる。中心周波数 = 明るさ、減衰の速さ = 角
// 強さは活性 × 角 × 離散化（拍節がなければパルスもない）。

import { Biquad } from './dsp.js';

class Hit {
  constructor(sr) { this.sr = sr; this.bp = new Biquad(); this.active = false; }
  start(type, gain, p) {
    this.type = type; this.gain = gain; this.t = 0; this.active = true; this.ph = 0;
    this.f0 = p.lowFreq; this.tau = type === 'low' ? p.lowTau : p.tickTau;
    if (type === 'tick') this.bp.set('bp', p.tickFreq, 1.4, this.sr);
  }
  tick(rng) {
    if (!this.active) return 0;
    const t = this.t, env = Math.exp(-t / this.tau);
    let y;
    if (this.type === 'low') {
      const f = this.f0 * (1 + 1.5 * Math.exp(-t / 0.03)); // 衝突直後に音高が下がる
      this.ph += f / this.sr; y = Math.sin(2 * Math.PI * this.ph);
    } else y = this.bp.tick(rng() * 2 - 1) * 3;
    this.t += 1 / this.sr;
    if (env < 1e-4) this.active = false;
    return y * env * this.gain;
  }
}

export class Perc {
  constructor(sr, rng) { this.sr = sr; this.rng = rng; this.hits = Array.from({ length: 10 }, () => new Hit(sr)); this.next = 0; }
  static params(Pg, z) {
    return {
      lowFreq: Math.min(90, Math.max(40, 55 / Math.sqrt(Pg.L))),
      lowTau: 0.12 * Math.sqrt(Pg.L),
      tickFreq: Math.min(11000, 2200 + 7000 * z.bright),
      tickTau: 0.012 + 0.07 * Math.pow(1 - z.edge, 2),
    };
  }
  trigger(type, gain, p) {
    let h = this.hits.find((x) => !x.active);
    if (!h) { h = this.hits[this.next]; this.next = (this.next + 1) % this.hits.length; }
    h.start(type, gain, p);
  }
  tick() { let s = 0; for (const h of this.hits) s += h.tick(this.rng); return s; }

  // 1 小節ぶんのパターン（拍単位の時刻と種類と強さ）。密度と活性で打点が増える。
  static bar(rng, density, energy, intensity) {
    const ev = [{ at: 0, type: 'low', vel: 1 }];
    if (energy > 0.45) ev.push({ at: 2, type: 'low', vel: 0.8 });
    if (energy > 0.75) ev.push({ at: 3.5, type: 'low', vel: 0.6 });
    const sub = density * energy * intensity > 0.35 ? 4 : 2; // 8 分 or 16 分
    const metric = sub === 2 ? [1, 0.5, 0.8, 0.5, 0.9, 0.5, 0.8, 0.6] : [1, 0.3, 0.6, 0.3, 0.8, 0.3, 0.6, 0.35, 0.9, 0.3, 0.6, 0.3, 0.8, 0.3, 0.6, 0.4];
    const p = 0.25 + 0.75 * density;
    metric.forEach((w, i) => { if (rng() < p * (0.5 + 0.5 * w)) ev.push({ at: i / sub, type: 'tick', vel: 0.4 + 0.6 * w }); });
    return ev;
  }
}
