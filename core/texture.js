// 粒（texture）層 v1.1。拍節に乗らない環境の出来事（Gaver: 液体・燃焼）。docs/06_review.md §3.4, §4.6, §7
//
// v1.1: 焚き火の出来事を、評価者が書いたオノマトペから音象徴の理論で順方向に読み出して作る
//（02_theory §2: 子音 = 励振の種類、母音 = 大きさ・明るさ、語形 = 時間の形）。
//   チリチリッ … チ（破擦・高い）+ リ（はじき音 = 微小な撃力の反復）+ 重複 + っ（急停止）
//               → 微小なクリックの群れ（5〜25 個、間隔 5〜20 ms）が、ぴたっと止まる。いちばん多い
//   チリッ     … 同じ群れの短いもの（2〜4 個）
//   カリッ     … カ（硬い破裂・開いた母音 = 大きめ）+ リ（軽い鳴り）+ っ → 大きな一撃 + 木の短い鳴り（1〜2.5 kHz）
//   チチャァッ … チ・チ（2 回のはじけ）+ ャァ（開いた母音の持続 = 広帯域の噴出）+ っ → 2 回のクリックの後の
//               シューという噴出（湿った薪から水蒸気が吹き出す）。媒質（水分）があるときだけ
//   モクモク   … m（鼻音 = 丸く低い）+ o/u（後舌 = 暗い）+ 重複 → 低く柔らかいうねりの繰り返し（煙・炎の息）
// v1 の「プツプツ」（p = 唇の破裂 = 鈍い単発、u = 暗い）は、単発で鈍いクリックが等間隔に並んでいたため。
// 泡は液体の中でしか生じない（medium が大きいとき）。

import { Biquad } from '../kernel/dsp.js';

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
  constructor(sr) { this.sr = sr; this.f1 = new Biquad(); this.f2 = new Biquad(); this.active = false; }
  start(kind, o) {
    Object.assign(this, o, { kind, t: 0, ph: 0, active: true, fl: 0 });
    const sr = this.sr;
    if (kind === 'click') this.f1.set('hp', this.fc, 0.6, sr);
    if (kind === 'kari') { this.f1.set('hp', 2000, 0.6, sr); this.f2.set('bp', this.ring, 5, sr); }
    if (kind === 'hiss') { this.f1.set('bp', this.fc, 0.8, sr); this.f2.set('hp', 1500, 0.7, sr); }
  }
  tick(rng) {
    if (!this.active) return 0;
    const t = this.t, w = rng() * 2 - 1; let y = 0;
    switch (this.kind) {
      case 'click': y = this.f1.tick(w) * Math.exp(-t / this.decay) * 2.5; if (t > this.decay * 8) this.active = false; break;
      case 'kari': {
        const x = this.f1.tick(w) * Math.exp(-t / 0.0012) * 3;
        y = x + this.f2.tick(x + w * 0.3 * Math.exp(-t / 0.004)) * 6 * Math.exp(-t / this.ringT);
        if (t > 0.12) this.active = false; break;
      }
      case 'hiss': {
        // 噴出: 立ち上がり 10 ms、持続中は乱流でふるえ、最後は 6 ms で止まる（っ）
        this.fl += ((rng() * 2 - 1) - this.fl) * 0.02;
        const env = Math.min(1, t / 0.01) * (t < this.len ? 1 : Math.exp(-(t - this.len) / 0.006)) * (0.6 + 0.8 * Math.abs(this.fl));
        y = this.f2.tick(this.f1.tick(w)) * env * 1.4;
        if (t > this.len + 0.05) this.active = false; break;
      }
      case 'bubble': {
        const env = Math.exp(-t / this.decay);
        this.ph += this.freq * (1 + this.chirp * t) / this.sr; y = Math.sin(2 * Math.PI * this.ph) * env * Math.min(1, t / 0.002);
        if (env < 1e-3) this.active = false; break;
      }
    }
    this.t += 1 / this.sr;
    return y * this.amp;
  }
}

export class Texture {
  constructor(sr, rng) {
    this.sr = sr; this.rng = rng;
    this.grains = Array.from({ length: 40 }, () => new Grain(sr)); this.k = 0; this.wait = 0;
    this.pending = []; // 群れの中の予定されたクリック [時刻, 振幅, fc]
    this.lpA = new Biquad(); this.lpB = new Biquad(); this.swell = 0; this.swellT = 0; this.ctr = 0; this.time = 0;
  }
  tick(P, z, world) {
    if (z.density < 0.01) return 0;
    const rng = this.rng, sr = this.sr, liquid = world.medium;
    // v1.3: BGM の粒の層は液体の中の音（泡・水のうねり）だけ。燃焼のはじけ（焚き火）はゲームのオブジェクトの効果音で、BGM の担当外。
    // v1.2 までは媒質の割合で泡と燃焼を混ぜていたので、深海（media 0.85）でも 15% の出来事が焚き火の音になっていた
    if (liquid < 0.5) return 0;
    if (this.ctr-- <= 0) { this.ctr = 256; const fc = 150 + 350 * z.bright; this.lpA.set('lp', fc, 0.7, sr); this.lpB.set('lp', fc, 0.7, sr); }
    const base = 0.3 * Math.pow(130, z.density) * (0.5 + z.energy);
    this.wait -= 1 / sr;
    if (this.wait <= 0) {
      const cv = 0.6 + 0.45 * z.rough, k = 1 / (cv * cv);
      this.wait = gammaSample(rng, k) / (k * base);
      const loud = Math.pow(rng(), 2.5);
      if (true) {
        const r = 0.0005 * Math.pow(40, z.size) * (0.6 + 0.8 * rng());
        this.fire('bubble', { freq: Math.min(9000, 3.26 / r), amp: 0.12 + 0.4 * loud, decay: 0.02 + 8 * r, chirp: 6 * (0.3 + liquid) });
      } else {
        // 燃焼の出来事の種類: 粗さ（はじき音 r = 群れ）、角（硬い破裂 k）、水分（噴出）
        const wChiri = 0.3 + z.rough, wKari = 0.15 * z.edge, wChicha = 0.6 * liquid, s = wChiri + wKari + wChicha;
        const u = rng() * s, fcBase = (2500 + 4000 * z.bright) / Math.sqrt(P.L);
        if (u < wChiri) {
          // チリチリッ / チリッ: 群れの大きさはべき分布（小さい群れが多い）
          const n = loud > 0.25 ? 5 + Math.floor(20 * loud) : 2 + Math.floor(3 * rng());
          let at = this.time; const a0 = 0.15 + 0.6 * loud;
          for (let i = 0; i < n; i++) { this.pending.push([at, a0 * (0.4 + 0.6 * rng()) * (i === n - 1 ? 1.3 : 1), fcBase * Math.pow(2, (rng() - 0.5))]); at += 0.004 - 0.008 * Math.log(Math.max(1e-6, rng())); }
        } else if (u < wChiri + wKari) {
          this.fire('kari', { amp: 0.5 + 0.5 * loud, ring: 1000 + 1500 * rng(), ringT: 0.015 + 0.02 * rng() });
          this.pending.push([this.time + 0.03 + 0.03 * rng(), 0.2, fcBase]);
        } else {
          this.pending.push([this.time, 0.5, fcBase], [this.time + 0.025 + 0.02 * rng(), 0.45, fcBase]);
          this.fire('hiss', { amp: 0.06 + 0.1 * loud, fc: 2500 + 2500 * rng(), len: 0.15 + 0.3 * rng(), delayStart: 0.05 });
        }
      }
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const [at, a, fc] = this.pending[i];
      if (at <= this.time) { this.fire('click', { amp: a, fc, decay: 0.0003 + 0.0005 * rng() }); this.pending.splice(i, 1); }
    }
    // モクモク: 低く柔らかいうねり（1〜2 秒ごとに膨らんでしぼむ）
    this.swellT -= 1 / sr;
    if (this.swellT <= 0) { this.swellT = 0.8 + 1.6 * rng(); this.swellTarget = 0.3 + 1.2 * rng(); }
    this.swell += ((this.swellTarget ?? 0.5) - this.swell) * (1 / (0.5 * sr));
    const moku = this.lpB.tick(this.lpA.tick(rng() * 2 - 1)) * this.swell * 0.45 * (1 - 0.7 * liquid);
    const under = liquid > 0.5 ? this.lpB.tick(this.lpA.tick(rng() * 2 - 1)) * 0.4 : 0;
    let y = (moku + under) * z.density * (0.3 + z.energy);
    for (const g of this.grains) y += g.tick(rng);
    this.time += 1 / sr;
    return y * P.gain * 0.8;
  }
  fire(kind, o) {
    let g = this.grains.find((x) => !x.active);
    if (!g) { g = this.grains[this.k]; this.k = (this.k + 1) % this.grains.length; }
    g.start(kind, o);
  }
}
