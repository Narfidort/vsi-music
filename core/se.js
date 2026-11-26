// 効果音（SE）層（v1.1, docs/06_review.md §7）。
// 理論: 効果音は新しい層ではなく、粒（texture）の層が完全に離散化されたもの。
//   D < 0.95: 環境の出来事は拍節に乗らない（焚き火のはじけ、泡）
//   D ≥ 0.95: 機械の演奏（DAW）では、環境の出来事も格子と和音に量子化される → 効果音
// 出来事の種類は粒の層の相形態から（02_theory §2.2.1 の相互作用の読み）:
//   ん（撥音: 鳴らしっぱなし）→ ちりん・きらきら（鈴、トライアングル、鉄琴の駆け上がり）
//   っ（促音: 急停止）       → ぽん・こっ（泡がはじける、木魚・クラベス）
//   重複（反復）             → しゃらしゃら（鈴、タンバリン、ギロ）
//   -り（転がって完了）       → ぴょーん・ぴゅー（音高が滑る: ばね、レーザー）。Yunomi の「その他」パートで毎秒 2〜3 回
//   ー（持続）               → しゅわー（上昇するノイズ。区間の変わり目）
import { Biquad } from '../kernel/dsp.js';
import { PercSample, catalog } from './sampler.js';

class Blip {
  constructor(sr) { this.sr = sr; this.active = false; this.f = new Biquad(); }
  start(kind, o) {
    Object.assign(this, o, { kind, t: 0, ph: 0, active: true });
    if (kind === 'sweep') this.f.set('bp', 500, 1.5, this.sr);
  }
  tick(rng) {
    if (!this.active) return 0;
    const t = this.t, sr = this.sr; let y = 0, f;
    switch (this.kind) {
      case 'pop': // ぽん: 泡の Minnaert 共鳴が浮上で上がる。とても短い
        f = this.freq * (1 + 6 * t); this.ph += f / sr; y = Math.sin(2 * Math.PI * this.ph) * Math.exp(-t / 0.035) * Math.min(1, t / 0.001);
        if (t > 0.25) this.active = false; break;
      case 'boing': // ぴょーん: ばねの音高が上がり、揺れながら減衰
        f = this.freq * Math.pow(2, Math.min(1, t / 0.12)) * (1 + 0.06 * Math.sin(2 * Math.PI * 16 * t) * Math.exp(-t / 0.2));
        this.ph += f / sr; y = Math.sin(2 * Math.PI * this.ph) * Math.exp(-t / 0.18) * Math.min(1, t / 0.003);
        if (t > 0.8) this.active = false; break;
      case 'pew': { // ぴゅー: 矩形波が 2 オクターブ下へ滑る
        f = this.freq * Math.pow(2, -2 * Math.min(1, t / 0.18)); this.ph += f / sr; const p = this.ph % 1;
        y = (p < 0.5 ? 0.5 : -0.5) * Math.exp(-t / 0.12); if (t > 0.5) this.active = false; break;
      }
      case 'sweep': { // しゅわー: 帯域ノイズの中心が 1 拍で上がる
        if ((this.ctr = (this.ctr || 0) - 1) <= 0) { this.ctr = 64; this.f.set('bp', 400 * Math.pow(2, 4.5 * Math.min(1, t / this.len)), 1.5, sr); }
        y = this.f.tick(rng() * 2 - 1) * Math.min(1, t / this.len) * 1.5; if (t > this.len) this.active = false; break;
      }
    }
    this.t += 1 / sr;
    return y * this.amp;
  }
}

export class SELayer {
  constructor(sr, rng) {
    this.sr = sr; this.rng = rng;
    this.blips = Array.from({ length: 16 }, () => new Blip(sr)); this.percs = Array.from({ length: 16 }, () => new PercSample(sr)); this.k = 0;
  }
  // kind: ping / sparkle は呼び出し側が鉄琴の音として予定する。ここでは音高のない録音と合成の効果音
  trigger(kind, gain, freq) {
    const rng = this.rng;
    const rec = { rattle: ['sleigh', 'tamb', 'guiro'], wood: ['woodblock_hi', 'claves', 'cowbell'], ping: ['triangle', 'belltree'], crash: ['crash'], zap: ['zap'] }[kind];
    if (rec && catalog()) {
      const p = this.percs.find((x) => !x.active) || this.percs[this.k++ % this.percs.length];
      p.trigger(rec[Math.floor(rng() * rec.length)], gain, 1, rng); return;
    }
    const b = this.blips.find((x) => !x.active) || this.blips[this.k++ % this.blips.length];
    b.start(kind, { amp: gain, freq, len: 0.6 });
  }
  tick() { let s = 0; for (const b of this.blips) s += b.tick(this.rng); for (const p of this.percs) if (p.active) s += p.tick(); return s; }
}
