// はじかれた弦（Karplus–Strong の拡張）。v0.4
// 物理: 弦の長さ = 遅延線の長さ（音高）、ループ内の低域通過 = 弦と駒の損失（暗いほど大きい）、
//       励振 = 指・爪・ピックの接触（edge が鋭いほど広帯域）、ループの利得 = 減衰時間 τ。
// 相形態: 促音（っ）= 指で止める（dur の 35% で強く減衰）、撥音（ん）= 鳴らしっぱなし。

export class Pluck {
  constructor(sr, rng) {
    this.sr = sr; this.rng = rng;
    this.buf = new Float32Array(Math.ceil(sr / 25) + 4);
    this.active = false;
  }

  trigger(note, P) {
    this.P0 = P; // 鳴り始めた音の物理は固定する
    const sr = this.sr;
    this.note = note; this.active = true; this.t = 0;
    this.delay = Math.max(2, sr / note.freq);
    // ループ内の低域通過の係数（大きいほど暗い）。遅延を補正して音高を合わせる
    this.b = 0.05 + 0.4 * (1 - P.brightN);
    this.delay -= this.b / (1 - this.b);
    this.len = Math.min(this.buf.length - 2, Math.ceil(this.delay) + 2);
    const tau = Math.max(0.6, note.ringTau * 2.2);
    this.gPer = Math.exp(-1 / (note.freq * tau));
    // 励振: ノイズを接触時間で平滑化（丸い = 指の腹、尖った = 爪・ピック）
    // 励振の帯域: 固体と同じ接触時間（P.contact）から。大きい物体ほど励振も低い（÷L）、暗いほど柔らかい
    const fc = Math.min(sr * 0.4, (0.5 / P.contact) * Math.pow(2, 2 * (P.brightN - 0.5)) / P.L);
    const smooth = Math.exp(-2 * Math.PI * fc / sr);
    let s = 0, mean = 0;
    for (let i = 0; i < this.buf.length; i++) this.buf[i] = 0;
    const n = Math.ceil(this.delay);
    // 最初の 1 周期に読まれる位置（書き込み位置の delay 手前）に励振を置く
    const N = this.buf.length, at = (i) => (N - n + i) % N;
    for (let i = 0; i < n; i++) { s += (1 - smooth) * ((this.rng() * 2 - 1) - s); this.buf[at(i)] = s; mean += s; }
    mean /= n;
    let pk = 1e-9; for (let i = 0; i < n; i++) { this.buf[at(i)] -= mean; pk = Math.max(pk, Math.abs(this.buf[at(i)])); }
    for (let i = 0; i < n; i++) this.buf[at(i)] /= pk;
    this.w = 0; this.prev = 0; this.dc = 0; this.dcx = 0; this.envF = 1;
    this.attack = Math.max(0.001, note.attack);
    this.stopAt = note.morph.q > 0.5 ? note.dur * 0.35 : note.dur + 2 * tau; // 指で止める時刻
  }

  tick(P) {
    P = this.P0 || P;
    if (!this.active) return 0;
    const sr = this.sr, N = this.buf.length;
    // 分数遅延の読み出し
    let rp = this.w - this.delay; while (rp < 0) rp += N;
    const i0 = Math.floor(rp), fr = rp - i0;
    const x = this.buf[i0 % N] * (1 - fr) + this.buf[(i0 + 1) % N] * fr;
    let g = this.gPer;
    if (this.t > this.stopAt) g *= 0.995; // 止める
    const y = (x * (1 - this.b) + this.prev * this.b) * g;
    this.prev = y;
    this.buf[this.w] = y;
    this.w = (this.w + 1) % N;
    this.t += 1 / sr;
    // DC 除去
    const o = y - this.dcx + 0.995 * this.dc; this.dcx = y; this.dc = o;
    // 包絡（瞬時値ではなく）で終了を判定する
    this.envF = Math.max(Math.abs(y), this.envF * 0.9995);
    if (this.t > 0.2 && this.envF < 1e-4) this.active = false;
    if (this.t > this.stopAt + 0.5) this.active = false;
    // アタック: 丸い接触（指の腹）ほどゆっくり立ち上がる（固体と同じ P.attack）
    const a = Math.min(1, this.t / this.attack);
    // 粗さ: 弦のびびり（さわり・フレットや枠への接触）= 他の音源と同じ 20〜150 Hz の振幅変調
    this.amPh = (this.amPh || 0) + P.amFreq / sr; if (this.amPh >= 1) this.amPh -= 1;
    const am = 1 - P.amDepth * (0.5 + 0.5 * Math.sin(2 * Math.PI * this.amPh));
    return o * this.note.gain * 0.7 * a * a * am;
  }
}
