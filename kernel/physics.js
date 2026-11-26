// 意味座標 → 合成パラメータ（docs/02_theory.md §3）。v0.2
// 原則: 各パラメータは1つの物理法則（または1つの知覚則）から導く。対応表は作らない。

const lerp = (a, b, t) => a + (b - a) * t;

// 中立管（一様な音響管）の共鳴: F_n = (2n-1) c / 4L。L≈17cm で 500, 1500, 2500, 3500 Hz。
const NEUTRAL_FORMANTS = [500, 1500, 2500, 3500];
const FORMANT_GAINS = [1.0, 0.7, 0.4, 0.22];
export const TONIC = 110; // 全レイヤーで共有する主音 [Hz]（和声の基準）

// 世界層（共有）
export function deriveWorld(w) {
  const viscosity = w.medium;
  // 直接音は距離に反比例して減衰し、拡散音場（残響）の水準は距離によらない → 直接音/残響比が下がる。
  const direct = 1 / (1 + 4 * w.distance);
  const revLevel = 0.3 + 0.35 * w.space;   // v0.3: 実在の曲よりステレオが広すぎたので下げた
  const rt60 = 0.25 + 9 * Math.pow(w.space, 1.6) * (1 + 0.5 * viscosity);
  // 水中: 人の聴感度は 0.25〜2 kHz に移る（Forum Acusticum 2023）→ 媒質 1 で約 2 kHz の低域通過。
  // 距離: 空気吸収で高域が減る（遠いほど最大 1.5 オクターブ下げる。知覚上の誇張を含む）。
  // v0.3 較正: 実際の水中（〜2 kHz）ではなく「水を描く音楽」に合わせる。水を題にした曲の重心は他より約 3 割低いだけだった（docs/05_corpus.md）
  const lowpass = Math.max(800, 18000 * Math.pow(2, -2.4 * viscosity) * Math.pow(2, -1.5 * w.distance));
  return {
    viscosity, direct, revLevel, rt60, lowpass, space: w.space, distance: w.distance, medium: w.medium,
    // 離散化 D
    pitchQuant: w.D, timeQuant: w.D, repeatProb: Math.pow(w.D, 0.7), D: w.D,
  };
}

// 音源層（地・図それぞれ）
export function deriveBody(z, W) {
  const viscosity = W.viscosity;
  // ---- 1. スケール則（size）: 長さ比 L 0.21 .. 4.76
  const L = Math.pow(2, 4.5 * (z.size - 0.5));

  // ---- 2. 明るさ: F2 の前舌化（u→i）とスペクトルの傾き（声）／高域減衰（固体）
  const f = NEUTRAL_FORMANTS.slice();
  f[1] = lerp(850, 2300, z.bright);
  f[0] = lerp(560, 330, z.bright * 0.6);
  const formants = f.map((F, i) => ({ freq: F / L, bw: (F / L) * 0.12, gain: FORMANT_GAINS[i] }));
  // 励振の傾き [dB/oct]: 暗 -13 ↔ 明 -4。活性が高いと励振が鋭くなる（Juslin & Laukka）。
  const tiltDb = Math.min(-2, lerp(-13, -4, z.bright) + 3 * (z.energy - 0.5));
  const hfDamp = lerp(3.5, 0.25, z.bright);         // 固体: 内部損失（木・フェルト ↔ 金属・ガラス）

  // ---- 固体音源（v0.2）: 非調和度 ∝ edge²、接触時間 8 ms ↔ 0.3 ms
  // 非調和度はピアノ（〜0.0004）〜ビブラフォン程度に抑える。v0.4 では 0.006 まであり、知覚される音高が最大 75 セント上ずっていた
  const inharm = 0.0001 + 0.0007 * z.edge * z.edge;
  const contact = lerp(0.008, 0.0003, z.edge);

  // ---- 5. 活性: GPR（ピッチ）・レート・音量
  // 固体: 同じ素材・形なら全モードが厳密に f ∝ 1/L。
  // 声: 声帯（GPR）と声道（VTL）は別の器官なので、ピッチは共鳴ほどは下がらない（Smith & Patterson）→ L^-0.6。
  // 基準 262 Hz（C4）: 実在の曲の旋律の中心（MIDI 61〜66）に合わせた較正（docs/05_corpus.md）
  const f0 = 262 * Math.pow(L, -lerp(1.0, 0.6, z.voice)) * Math.pow(2, (7 * (z.energy - 0.4)) / 12);
  const pitchRange = lerp(2, 9, z.energy);
  const gain = lerp(0.1, 0.55, z.energy);

  // イベントの周期 T ∝ √L（フルード相似則）／活性で速く／粘性で遅く
  const rate = Math.pow(2, 1.6 * (z.energy - 0.4)) * (1 - 0.5 * viscosity);
  const period = (0.26 * Math.sqrt(L)) / rate;
  const ringTau = 0.35 * L * (1 + viscosity) * lerp(1, 2.5, z.bright * (1 - z.voice)); // 金属は長く鳴る

  // ---- 3. 角: 連続性とアタック
  const attack = 0.002 + 0.22 * Math.pow(1 - z.edge, 2) * Math.sqrt(L) * (1 + viscosity);
  const burst = Math.pow(z.edge, 1.5) * z.voice;       // 子音的なノイズバーストは声のときだけ
  const floor = Math.pow(1 - z.edge, 1.5) * 0.7;

  // ---- 4. 粗さ
  const amDepth = 0.85 * z.rough;
  const amFreq = lerp(28, 70, z.rough) / Math.sqrt(L);
  const jitter = 0.012 * z.rough;
  const breath = lerp(0.01, 0.25, z.rough * z.rough) * lerp(0.3, 1, z.voice);
  const dissonance = z.rough;

  // ---- 6. 浮沈
  const driftSemis = 6 * z.lift;
  const registerSemis = 4 * z.lift;

  // ---- 密度（v0.2）: 0 = 鳴らない。フレーズ間の無音 ∝ (1-density)²、フレーズ内の出来事の数 ∝ density
  const density = z.density;
  const silence = 12 * Math.pow(1 - density, 2);  // 周期の何倍の無音を挟むか（上乗せ分）

  const glide = lerp(0.6, 0.02, W.D) + 0.25 * viscosity;
  return {
    L, formants, tiltDb, hfDamp, inharm, contact, f0, pitchRange, gain, period, ringTau,
    attack, burst, floor, amDepth, amFreq, jitter, breath, dissonance,
    driftSemis, registerSemis, density, silence, voice: z.voice, glide, morph: z.morph,
    massNorm: z.size, energyN: z.energy, liftN: z.lift, brightN: z.bright, edgeN: z.edge, roughN: z.rough,
    pitchQuant: W.pitchQuant, timeQuant: W.timeQuant, repeatProb: W.repeatProb, viscosity,
  };
}

export function derive(z) {
  const world = deriveWorld(z);
  return { world, ground: deriveBody(z.ground, world), figure: deriveBody(z.figure, world), texture: deriveBody(z.texture, world) };
}
