// 粒（texture）層 v0.4: 拍節に乗らない環境の出来事（Gaver: 液体・燃焼・多数の小さな衝突）。
// 02_theory Q1 の解決: 粗さには 2 種類ある。
//   ・密で周期的な変調（/r/ のふるえ、20〜150 Hz）→ 音源の rough（voice.js の AM）
//   ・疎でランダムな撃力の列（焚き火のはじけ、ぱちぱち）→ この層。rough = 出来事の「群れやすさ」
// 出来事は再生過程（間隔がガンマ分布）。間隔の変動係数 CV = 0.6 + 0.45·rough（滑らか = 規則的、粗い = ランダム）。
// v0.4 では「はじけは群れる」と仮定して自己励起過程にしたが、実録音の分析で否定された（焚き火の CV 0.75〜0.97、
// 泡は 0.67〜0.70 でむしろ規則的。docs/05_corpus.md）。
// 1 つの粒の音:
//   角が高い → 割れ（crack）: 撃力で共鳴体を鳴らす。共鳴周波数 ∝ 1/L、明るさで上下
//   角が低い → 泡（bubble）: Minnaert 共鳴 f = 3.26 / r [Hz·m]。半径 r は size から。浮上で音高が上がる
// 加えて、連続的な地鳴り（炎のごう音・水の轟き）: 低域通過ノイズの振幅が rough の速さで揺らぐ。

import { Biquad } from './dsp.js';

// ガンマ分布（形状 k、尺度 1）の標本（Marsaglia–Tsang。k < 1 は k+1 から補正）
function gammaSample(rng, k) {
  if (k < 1) return gammaSample(rng, k + 1) * Math.pow(rng(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { const u1 = Math.max(1e-12, rng()), u2 = rng(); x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

class Grain {
  constructor(sr) { this.sr = sr; this.bp = new Biquad(); this.active = false; }
  start(kind, freq, amp, decay, chirp) {
    this.kind = kind; this.freq = freq; this.amp = amp; this.decay = decay; this.chirp = chirp;
    this.t = 0; this.ph = 0; this.active = true; this.pan = 0;
    if (kind === 'crack') { this.bp.set('bp', freq, 3, this.sr); this.kick = 1; }
  }
  tick(rng) {
    if (!this.active) return 0;
    const t = this.t, env = Math.exp(-t / this.decay);
    let y;
    if (this.kind === 'crack') { y = this.bp.tick(this.kick ? (rng() * 2 - 1) * 8 : (rng() * 2 - 1) * 0.15 * env); this.kick = t < 0.0008 ? 1 : 0; }
    else { this.ph += this.freq * (1 + this.chirp * t) / this.sr; y = Math.sin(2 * Math.PI * this.ph); }
    this.t += 1 / this.sr;
    if (env < 1e-3) this.active = false;
    return y * env * this.amp;
  }
}

export class Texture {
  constructor(sr, rng) {
    this.sr = sr; this.rng = rng;
    this.grains = Array.from({ length: 24 }, () => new Grain(sr));
    this.next = 0; this.wait = 0;
    this.bedLp = new Biquad(); this.bedLp2 = new Biquad(); this.flick = 0; this.ctr = 0;
  }

  tick(P, z, world) {
    if (z.density < 0.01) return 0;
    const rng = this.rng, sr = this.sr;
    if (this.ctr-- <= 0) {
      this.ctr = 64;
      const fc = 150 + 2500 * z.bright * z.bright;
      this.bedLp.set('lp', fc, 0.7, sr); this.bedLp2.set('lp', fc, 0.7, sr);
    }
    // 生起率 [/s]: 密度で 0.3〜40、活性で増える
    const base = 0.3 * Math.pow(130, z.density) * (0.5 + z.energy);
    this.wait -= 1 / sr;
    if (this.wait <= 0) {
      // 次の間隔: ガンマ分布（形状 k = 1/CV²、平均 1/base）
      const cv = 0.6 + 0.45 * z.rough, k = 1 / (cv * cv);
      this.wait = gammaSample(rng, k) / (k * base);
      const L = P.L;
      const loud = Math.pow(rng(), 2.5); // 大きな出来事は稀（べき分布）
      if (rng() < z.edge) {
        // 割れ: 実録音の焚き火のはじけは重心 3.9〜4.7 kHz
        const f = Math.min(12000, (800 + 3000 * z.bright) / Math.sqrt(L) * Math.pow(2, (rng() - 0.5) * 2));
        this.fire('crack', f, 0.15 + 0.85 * loud, 0.004 + 0.02 * (1 - z.edge) + 0.01 * L, 0);
      } else {
        // 泡: Minnaert 共鳴。実録音の水中の泡は重心 300〜1300 Hz、1 つの響きは 100 ms 前後（ごぼごぼ）
        const r = 0.0005 * Math.pow(40, z.size) * (0.6 + 0.8 * rng()); // 半径 0.5 mm〜20 mm
        const f = Math.min(9000, 3.26 / r);
        this.fire('bubble', f, 0.12 + 0.4 * loud, 0.02 + 8 * r, 6 * (0.3 + world.medium));
      }
    }
    // 地鳴り（連続成分）: 揺らぎの速さ = rough
    this.flick += ((rng() * 2 - 1) - this.flick) * (0.0005 + 0.01 * z.rough);
    const bed = this.bedLp2.tick(this.bedLp.tick(rng() * 2 - 1)) * (0.6 + 3 * this.flick) * 0.25 * z.density * (0.3 + z.energy) * (1 - 0.6 * z.edge);
    let y = bed;
    for (const g of this.grains) y += g.tick(rng);
    return y * P.gain * 0.8;
  }

  fire(kind, f, amp, decay, chirp) {
    let g = this.grains.find((x) => !x.active);
    if (!g) { g = this.grains[this.next]; this.next = (this.next + 1) % this.grains.length; }
    g.start(kind, f, amp, decay, chirp);
  }
}
