// 最小限の DSP プリミティブ。外部依存なし（Node / AudioWorklet 共通）。

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// RBJ biquad
export class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(type, freq, q, sr) {
    const w = 2 * Math.PI * Math.min(freq, sr * 0.45) / sr;
    const cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; }
    else { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } // hp
    a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  tick(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// 8 本のディレイによるフィードバック・ディレイ・ネットワーク残響。RT60 から各ループのゲインを決める。
export class FDN {
  constructor(sr) {
    this.sr = sr;
    const ms = [29.7, 37.1, 41.1, 43.7, 47.3, 53.1, 59.3, 67.1];
    this.baseLen = ms.map((m) => Math.round((m / 1000) * sr));
    this.max = Math.max(...this.baseLen) * 3 + 8;
    this.buf = this.baseLen.map(() => new Float32Array(this.max));
    this.idx = 0;
    this.len = this.baseLen.slice();
    this.g = new Float32Array(8);
    this.damp = new Float32Array(8);
    this.dampCoef = 0.3;
    this.v = new Float32Array(8);
    // 入力拡散: 直列オールパス 4 段（モード密度を上げ、くし形フィルタ状の色付けを防ぐ）
    this.ap = [4.7, 3.6, 12.7, 9.3].map((m) => ({ buf: new Float32Array(Math.round((m / 1000) * sr)), i: 0 }));
    this.apIn = [0, 0];
  }
  diffuse(x) {
    for (const a of this.ap) {
      const d = a.buf[a.i], y = -0.7 * x + d;
      a.buf[a.i] = x + 0.7 * y;
      a.i = (a.i + 1) % a.buf.length;
      x = y;
    }
    return x;
  }
  // v1.3: 遅延線の長さは最初に一度だけ決め、以後は変えない。
  // 長さを連続的に変えると、残響の中の音が伸び縮みする遅延線を通ることになり、音高がずれる（ドップラー効果）。
  // 空間の広さは RT60（ループの利得）と残響の量で表す。
  set(rt60, sizeScale, dampCoef) {
    if (!this.fixedSize) this.fixedSize = sizeScale;
    for (let i = 0; i < 8; i++) {
      this.len[i] = Math.min(this.max - 2, Math.round(this.baseLen[i] * this.fixedSize));
      this.g[i] = Math.pow(10, (-3 * this.len[i]) / (rt60 * this.sr));
    }
    this.dampCoef = dampCoef;
  }
  tick(x, out) {
    x = this.diffuse(x);
    const v = this.v, M = this.max;
    for (let i = 0; i < 8; i++) {
      let r = this.idx - this.len[i]; if (r < 0) r += M;
      const s = this.buf[i][r];
      this.damp[i] += (1 - this.dampCoef) * (s - this.damp[i]);
      v[i] = this.damp[i] * this.g[i];
    }
    // 8x8 アダマール（高速版）
    for (let h = 1; h < 8; h <<= 1)
      for (let i = 0; i < 8; i += h << 1)
        for (let j = i; j < i + h; j++) { const a = v[j], b = v[j + h]; v[j] = a + b; v[j + h] = a - b; }
    const n = 1 / Math.sqrt(8);
    for (let i = 0; i < 8; i++) this.buf[i][this.idx] = v[i] * n + (i & 1 ? -x : x) * (i < 4 ? 1 : 0.7);
    this.idx = (this.idx + 1) % M;
    out[0] = (v[0] + v[2] + v[4] + v[6]) * n * 0.5;
    out[1] = (v[1] + v[3] + v[5] + v[7]) * n * 0.5;
  }
}
