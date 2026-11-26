// 理論が「音響の手がかり」として予測する量を、実際に生成した音から測る。
// カーネルが理論どおりに動いているかを確かめるためのもの（self-check と実験の記録に使う）。

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j], ai = im[i + j];
        const br = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const bi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ar + br; im[i + j] = ai + bi;
        re[i + j + len / 2] = ar - br; im[i + j + len / 2] = ai - bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

const pct = (arr, p) => { const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

export function analyze(x, sr) {
  // --- スペクトル: 重心と Balance（Fort & Schwartz: 低域/高域のエネルギー比。境界は 1 kHz とする）
  const N = 4096, hop = 2048;
  const spec = new Float64Array(N / 2);
  let frames = 0;
  for (let s = 0; s + N <= x.length; s += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) spec[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  let num = 0, den = 0, lo = 0, hi = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = (k * sr) / N;
    num += f * spec[k]; den += spec[k];
    if (f < 1000) lo += spec[k]; else hi += spec[k];
  }
  const centroid = num / (den || 1);
  const balanceDb = 10 * Math.log10((hi + 1e-12) / (lo + 1e-12));

  // --- 振幅包絡（窓 30 ms・ホップ 5 ms の RMS。低い f0 の周期そのものを包絡として拾わないための窓長）
  const w = Math.round(sr * 0.005), win = Math.round(sr * 0.03);
  const env = [];
  for (let s = 0; s + win <= x.length; s += w) { let e = 0; for (let i = 0; i < win; i++) e += x[s + i] ** 2; env.push(Math.sqrt(e / win)); }
  const rms = Math.sqrt(env.reduce((a, b) => a + b * b, 0) / env.length);
  // Continuity: 包絡の下位 10% 値 / 上位 10% 値（Fort & Schwartz の min/max 比の頑健な版）
  const continuity = pct(env, 0.1) / (pct(env, 0.9) + 1e-9);
  // 時間レート: スペクトルフラックス（5 ms ホップ、対数振幅の正の変化の和）の変調スペクトルの
  // 0.5〜12 Hz における重心 [Hz]。音量の谷がなくても、ピッチや音色が変わればそれを出来事として数える。
  // 24 本の対数帯域にまとめてから差分をとる（息のノイズの細かな揺らぎを拾わないため）
  const NF = 1024, hf = Math.round(sr * 0.005), NB = 24;
  const edges = Array.from({ length: NB + 1 }, (_, i) => Math.round((80 * Math.pow(8000 / 80, i / NB) * NF) / sr));
  // 出来事 = 多くの帯域が同時に立ち上がること。うなり（狭帯域のゆっくりした揺れ = 変動強度）は数えない。
  const flux = [], hist = [];
  for (let s = 0; s + NF <= x.length; s += hf) {
    const re = new Float64Array(NF), im = new Float64Array(NF);
    for (let i = 0; i < NF; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / NF));
    fft(re, im);
    const band = new Float64Array(NB);
    for (let bnd = 0; bnd < NB; bnd++) { let e = 0; for (let k = edges[bnd]; k < Math.max(edges[bnd] + 1, edges[bnd + 1]); k++) e += re[k] ** 2 + im[k] ** 2; band[bnd] = 10 * Math.log10(1e-10 + e); }
    hist.push(band);
    if (hist.length > 5) {
      const back = hist[hist.length - 5]; // 20 ms 前と比べる
      let rising = 0, active = 0;
      for (let bnd = 0; bnd < NB; bnd++) { if (band[bnd] > -60) { active++; if (band[bnd] - back[bnd] > 3) rising++; } }
      flux.push(active ? rising / active : 0);
    }
  }
  // 40 ms の移動平均で平滑化し、適応閾値（中央値 + 0.3·(98パーセンタイル − 中央値)）を超える局所最大を出来事として数える（不応期 70 ms）
  const sm = flux.map((_, i) => { let a = 0, c = 0; for (let j = Math.max(0, i - 4); j <= Math.min(flux.length - 1, i + 4); j++) { a += flux[j]; c++; } return a / c; });
  const med = pct(sm, 0.5), hiP = pct(sm, 0.98);
  let ev = 0, lastEv = -100;
  for (let i = 1; i < sm.length - 1; i++) {
    if (sm[i] > Math.max(0.2, med + 0.3 * (hiP - med)) && sm[i] >= sm[i - 1] && sm[i] > sm[i + 1] && i - lastEv > 14) { ev++; lastEv = i; }
  }
  const onsetRate = ev / (x.length / sr);

  // --- ラフネスの代理指標: 包絡の変調スペクトルの 20〜150 Hz 成分の比率（1 ms 包絡）
  const w2 = Math.round(sr * 0.001), env2 = [];
  for (let s = 0; s + w2 <= x.length; s += w2) { let e = 0; for (let i = 0; i < w2; i++) e += Math.abs(x[s + i]); env2.push(e / w2); }
  const M = 1024, fsE = sr / w2;
  let rIn = 0, rAll = 0;
  for (let s = 0; s + M <= env2.length; s += M / 2) {
    const re = new Float64Array(M), im = new Float64Array(M);
    let mean = 0; for (let i = 0; i < M; i++) mean += env2[s + i]; mean /= M;
    for (let i = 0; i < M; i++) re[i] = (env2[s + i] - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / M));
    fft(re, im);
    for (let k = 1; k < M / 2; k++) {
      const f = (k * fsE) / M, p = re[k] ** 2 + im[k] ** 2;
      if (f > 2) rAll += p;
      if (f >= 20 && f <= 150) rIn += p;
    }
  }
  const roughness = rIn / (rAll || 1);

  return { centroid, balanceDb, continuity, onsetRate, roughness, rms };
}
