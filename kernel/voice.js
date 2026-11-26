// 音源。v0.2 で「声 ↔ 固体」を 1 つのモデルの連続的な端点として扱う（02_theory §2.1）。
//   声   : 調和的な倍音 × 励振の傾き × フォルマント包絡（ソースフィルタ理論）
//   固体 : 非調和なモード列 f_k = k f0 √((1+Bk²)/(1+B)) × 接触時間で決まる励振スペクトル × 高域ほど速い減衰
// 1 つの Voice は 1 つの発音体。音節（ノート）ごとに再トリガされる。

import { Biquad } from './dsp.js';

const TABLE_SIZE = 4096;
const SINE = new Float32Array(TABLE_SIZE + 1);
for (let i = 0; i <= TABLE_SIZE; i++) SINE[i] = Math.sin((2 * Math.PI * i) / TABLE_SIZE);
const MAX_H = 40;
const CTRL = 32; // 制御レート（サンプル）
// 弦楽器の胴体の共鳴（バイオリン族の典型的な山。Hz, 相対利得）。size に応じて 1/√L でずらす
const BODY = [[275, 1], [460, 0.8], [700, 0.55], [1050, 0.5], [1600, 0.6], [2450, 0.5], [3300, 0.3]];

function sine01(ph) {
  const x = ph * TABLE_SIZE, i = x | 0, fr = x - i;
  return SINE[i] + (SINE[i + 1] - SINE[i]) * fr;
}

// 相形態エンベロープ（02_theory §2.2.1）。t: オンセットからの秒。戻り値は 0..1。
function morphEnvelope(t, n) {
  const { dur, attack, ringTau, rel, morph } = n;
  const a = Math.min(1, t / attack);
  const att = a * a * (3 - 2 * a);
  let s = 0;
  if (morph.rep) { const e = dur * 0.6; s += morph.rep * (t < e ? 1 : Math.exp(-(t - e) / rel)); }
  if (morph.q) { const e = dur * 0.35; s += morph.q * (t < e ? 1 : Math.exp(-(t - e) / 0.006)); }
  if (morph.n) s += morph.n * Math.exp(-Math.max(0, t - attack) / ringTau);
  if (morph.long) s += morph.long * (t < dur ? 1 : Math.exp(-(t - dur) / (0.06 + rel)));
  if (morph.ri) { const e = dur * 1.4; s += morph.ri * (t < e ? 1 - 0.7 * (t / e) : 0.3 * Math.exp(-(t - e) / (0.1 + rel))); }
  return att * s;
}

export class Voice {
  constructor(sr, rng) {
    this.sr = sr; this.rng = rng;
    this.phase = new Float64Array(MAX_H);
    this.amps = new Float32Array(MAX_H);
    this.ratio = new Float32Array(MAX_H);
    this.nh = 0;
    this.active = false;
    this.freq = 220; this.target = 220; this.glideCoef = 1;
    this.t = 0; this.ctr = 0; this.amPh = 0; this.jit = 0; this.vibPh = 0;
    this.noise = new Biquad(); this.burstF = new Biquad();
    this.note = null; this.env = 0; this.norm = 1; this.stretch = 1;
  }

  trigger(note, P) {
    this.P0 = P; // v1.3: 鳴り始めた音の物理は固定する（途中で意味座標が動いても倍音の位置や音高がずれない）
    this.note = note;
    this.active = true;
    this.t = 0;
    this.freq = note.fromFreq || note.freq;
    this.target = note.freq;
    this.glideCoef = 1 - Math.exp(-1 / (Math.max(0.002, note.glideTime) * this.sr));
    // 固体は叩かれるたびに位相がそろう（撃力）。声は連続しているので位相を保つ。
    if (P.voice < 0.5) for (let h = 0; h < MAX_H; h++) this.phase[h] = 0;
    const F2 = P.formants[1].freq, F3 = P.formants[2].freq;
    this.noise.set('bp', F2, 2.0, this.sr);
    this.burstF.set('bp', Math.min(9000, (F2 + F3) * 0.6), 1.2, this.sr);
    this.updateAmps(P);
  }

  // 弓（擦弦）と息（気柱）: 持続的な励振（Gaver の scraped / blown）。v0.4
  //   弓: ヘルムホルツ運動 ≈ のこぎり波（1/h）× 胴体の多数の共鳴（∝ 1/L: 小さい胴 = バイオリン、大きい胴 = コントラバス）
  //   息: 閉管に近い奇数倍音の優勢 × 穏やかな傾き。息のノイズは tick で足す
  sustainedAmps(P, kind) {
    const f0 = this.freq, nyq = this.sr * 0.45;
    let ss = 0, nh = 0;
    for (let h = 1; h <= MAX_H; h++) {
      const f = h * f0;
      if (f > nyq) break;
      let a;
      if (kind === 'bow') {
        let body = 0.08;
        for (const [F, g] of BODY) { const Fc = F / Math.sqrt(P.L); const d = (f - Fc) / (Fc / 6); body += g / (1 + d * d); }
        a = (1 / h) * body * Math.pow(h, (P.tiltDb + 6) / 12);
      } else {
        a = (h % 2 ? 1 : 0.3) * Math.pow(h, -1.2 + (P.tiltDb + 8) / 10);
      }
      this.ratio[h - 1] = h; this.amps[h - 1] = a; ss += a * a; nh = h;
    }
    const norm = 1 / Math.sqrt(ss || 1);
    for (let h = 0; h < nh; h++) this.amps[h] *= norm;
    this.nh = nh;
  }

  updateAmps(P) {
    const kind = this.note && this.note.instr;
    if (kind === 'bow' || kind === 'blow') return this.sustainedAmps(P, kind);
    const f0 = this.freq, nyq = this.sr * 0.45, v = P.voice, B = P.inharm;
    const k = P.tiltDb / 6.0206;
    let ss = 0, nh = 0;
    for (let h = 1; h <= MAX_H; h++) {
      const rModal = h * Math.sqrt((1 + B * h * h) / (1 + B));
      const r = v * h + (1 - v) * rModal;
      const f = r * f0;
      if (f > nyq) break;
      // 声: 傾き × フォルマント包絡
      let env = 0.015;
      for (const fm of P.formants) { const d = (f - fm.freq) / (fm.bw * 0.5); env += fm.gain / (1 + d * d); }
      const aVoice = Math.pow(h, k) * env;
      // 固体: 接触時間で決まる励振（短いほど広帯域）× 傾き（明るさ）× 時間とともに高域から減衰
      // 励振の帯域: 接触時間 × 明るさ × 大きさ（pluck.js と同じ物理。楽器が切り替わっても軸の向きが保たれるように）
      const exc = 1 / Math.sqrt(1 + (f * P.contact * 0.25 * Math.pow(2, -2 * (P.brightN - 0.5)) * P.L) ** 2);
      const decay = Math.exp(-this.t * P.hfDamp * (f / 1000) / Math.max(0.3, P.L));
      const aSolid = exc * Math.pow(h, k * 0.5) * decay;
      const a = v * aVoice + (1 - v) * aSolid;
      this.ratio[h - 1] = r; this.amps[h - 1] = a; ss += a * a; nh = h;
    }
    // 調律の補正: 非調和な倍音で知覚される音高が上ずる分だけ全体を下げる（ピアノのストレッチ調律と同じ考え）。
    // 知覚音高 ≈ 下位の倍音の r_h/h の振幅加重平均
    if (this.t === 0 && v < 0.5) {
      let num = 0, den = 0;
      // 音高知覚の優勢領域（〜1.5 kHz まで）の倍音で加重
      for (let h = 1; h <= nh; h++) { if (this.ratio[h - 1] * f0 > 2500 && h > 1) break; const w = this.amps[h - 1]; num += w * (this.ratio[h - 1] / h); den += w; }
      this.stretch = den > 0 ? num / den : 1;
    }
    if (v < 0.5 && this.stretch) for (let h = 0; h < nh; h++) this.ratio[h] /= this.stretch;
    // 正規化は「叩いた瞬間」の大きさで行う（減衰そのものは残す）
    if (this.t === 0 || P.voice >= 0.5) this.norm = 1 / Math.sqrt(ss || 1);
    for (let h = 0; h < nh; h++) this.amps[h] *= this.norm;
    this.nh = nh;
  }

  tick(P) {
    if (!this.active) return 0;
    P = this.P0 || P;
    const n = this.note, sr = this.sr;
    if (this.ctr-- <= 0) {
      this.ctr = CTRL;
      this.env = morphEnvelope(this.t, n);
      if (this.t > n.dur && this.env < 1e-4) { this.active = false; return 0; }
      this.updateAmps(P);
    }
    this.freq += (this.target - this.freq) * this.glideCoef;
    // ジッタ（非周期性）。遅い揺らぎにするとピッチのふらつきになってしまうので、速く小さくする
    this.jit += ((this.rng() * 2 - 1) - this.jit) * 0.05;
    // ビブラート（弓・息のみ）: 発音から 0.25 秒かけて深くなる。深さ ∝ 活性
    let vib = 0;
    if (n.vib) { this.vibPh += 5.4 / sr; vib = n.vib * Math.min(1, this.t / 0.25) * Math.sin(2 * Math.PI * this.vibPh); }
    const f = this.freq * (1 + P.jitter * this.jit * 3 + vib);
    let y = 0;
    for (let h = 0; h < this.nh; h++) {
      let ph = this.phase[h] + (this.ratio[h] * f) / sr;
      ph -= Math.floor(ph);
      this.phase[h] = ph;
      y += this.amps[h] * sine01(ph);
    }
    this.amPh += P.amFreq / sr; if (this.amPh >= 1) this.amPh -= 1;
    const am = 1 - P.amDepth * (0.5 + 0.5 * sine01(this.amPh));
    const w = this.rng() * 2 - 1;
    y += this.noise.tick(w) * (n.instr === 'blow' ? 0.35 + P.breath * 3 : n.instr === 'bow' ? 0.08 + P.breath : P.breath * 3);
    if (n.burst > 0 && this.t < n.burstDecay * 6) y += this.burstF.tick(w) * n.burst * 4 * Math.exp(-this.t / n.burstDecay);
    this.t += 1 / sr;
    return y * am * this.env * n.gain;
  }
}

export class VoicePool {
  constructor(size, sr, rng) { this.voices = Array.from({ length: size }, () => new Voice(sr, rng)); this.next = 0; this.lastFreq = 0; }
  trigger(note, P) {
    let v = this.voices.find((x) => !x.active);
    if (!v) { v = this.voices[this.next]; this.next = (this.next + 1) % this.voices.length; }
    v.trigger({ ...note, fromFreq: P.voice >= 0.5 ? (this.lastFreq || note.freq) : note.freq }, P);
    this.lastFreq = note.freq;
  }
  tick(P) { let s = 0; for (const v of this.voices) s += v.tick(P); return s; }
}
