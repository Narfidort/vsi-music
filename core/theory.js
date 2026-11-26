// VSI v1 の音楽語彙（docs/06_review.md §4）。
// 歩容（どう動くか）・和声進行・楽式は、新しいつまみではなく身体の軸から物理的に選ぶ。
// 型そのもの（伴奏型・進行・楽式）は伝統の語彙から持ち込み、作らない。

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11], dorian: [0, 2, 3, 5, 7, 9, 10],
};
export const QUAL = {
  M: [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], dom7: [0, 4, 7, 10], dim7: [0, 3, 6, 9],
  M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], add9: [0, 4, 7, 14], sus2: [0, 2, 7],
};
// 和音 = [根音（主音からの半音）, 質, 低音（省略 = 根音）]
// 和音の質が配列なら、その音（主音からの半音。小数 = 微分音も可）をそのまま使う（各国の音階のドローン和音）
export const chordPcs = (c) => (Array.isArray(c[1]) ? c[1].map((x) => (((c[0] + x) % 12) + 12) % 12) : QUAL[c[1]].map((x) => (c[0] + x) % 12));

// ---- 各国の音階（スタイルマナーの scale）。半音の小数 = 微分音。近似であり、地域・流派で異なる ----
export const WORLD_SCALES = {
  陽音階: [0, 2, 5, 7, 9],           // 日本の民謡（律・民謡音階）
  都節: [0, 1, 5, 7, 8],             // 日本の陰音階（箏曲・演歌）
  琉球: [0, 4, 5, 7, 11],            // 沖縄
  五声: [0, 2, 4, 7, 9],             // 中国の五声（宮調）・東アジアの長調五音
  短五音: [0, 3, 5, 7, 10],          // マイナー・ペンタトニック（アフリカ、ケルト、ブルースの基礎）
  ヒジャーズ: [0, 1, 4, 5, 7, 8, 10], // アラブ・トルコ（マカーム・ヒジャーズ。12 平均律近似）
  ラースト: [0, 2, 3.5, 5, 7, 9, 10.5], // アラブ（マカーム・ラースト。四分音を含む）
  バヤーティー: [0, 1.5, 3, 5, 7, 8, 10], // アラブ（マカーム・バヤーティー）
  バイラヴ: [0, 1, 4, 5, 7, 8, 11],  // インド（ラーガ・バイラヴ = 朝のラーガ）
  ペロッグ: [0, 1.2, 2.8, 6.6, 7.3], // ジャワのガムラン（ペロッグの五音の一例。セント近似）
  スレンドロ: [0, 2.4, 4.8, 7.2, 9.6], // ジャワのガムラン（ほぼ等分の五音）
  ブルース: [0, 3, 5, 6, 7, 10],
  全音音階: [0, 2, 4, 6, 8, 10],      // ドビュッシーの浮遊
  ドリア: [0, 2, 3, 5, 7, 9, 10],    // ケルト・中世
};
// 音階から作る旋法的な進行（ドローン）: 主和音（1・3・5 番目の音）と隣の和音を往復する。機能和声の終止はしない
export function scaleProgression(name) {
  const s = WORLD_SCALES[name], n = s.length, at = (i) => s[((i % n) + n) % n] + 12 * Math.floor(i / n);
  const triad = (i) => [0, at(i + 2) - at(i), at(i + 4) - at(i)];
  return { name: `${name}の旋法`, scale: name, ch: [[at(0), triad(0)], [at(0), triad(0)], [at(n - 1) % 12, triad(n - 1)], [at(0), triad(0)], [at(0), triad(0)], [at(1) % 12, triad(1)], [at(n >= 7 ? 3 : 2) % 12, triad(n >= 7 ? 3 : 2)], [at(0), triad(0)]], drive: 0, chroma: 0, sink: 0, float: 0.5, energy: 0.5, world: true };
}

// 和声進行（伝統の定型）。特徴: minor 調, drive 導音の引力（強い運動 = 強い磁場）, chroma 半音階性, sink 下行, float 浮遊, energy
export const PROGRESSIONS = [
  { name: 'I-V-vi-IV', scale: 'major', ch: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']], drive: 0.5, chroma: 0, sink: 0, float: 0.2, energy: 0.6 },
  { name: '王道 IV-V-iii-vi', scale: 'major', ch: [[5, 'M7'], [7, 'M'], [4, 'm7'], [9, 'm']], drive: 0.6, chroma: 0, sink: 0, float: 0.2, energy: 0.85 },
  { name: 'I-vi-IV-V', scale: 'major', ch: [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M']], drive: 0.5, chroma: 0, sink: 0, float: 0.1, energy: 0.5 },
  { name: '子守歌 I-IV-I-V7', scale: 'major', ch: [[0, 'M'], [5, 'M'], [0, 'M'], [7, 'dom7']], drive: 0.4, chroma: 0, sink: 0, float: 0.3, energy: 0.2 },
  { name: 'カノン', scale: 'major', ch: [[0, 'M'], [7, 'M', 11], [9, 'm'], [4, 'm', 7], [5, 'M'], [0, 'M', 4], [5, 'M'], [7, 'M']], drive: 0.35, chroma: 0, sink: 0.3, float: 0.4, energy: 0.3 },
  { name: 'リディア I-II', scale: 'lydian', ch: [[0, 'M7'], [2, 'M'], [0, 'M7'], [2, 'add9']], drive: 0, chroma: 0, sink: 0, float: 1, energy: 0.1 },
  { name: 'I-IV-vi-IV', scale: 'major', ch: [[0, 'add9'], [5, 'M7'], [9, 'm7'], [5, 'M7']], drive: 0.1, chroma: 0, sink: 0, float: 0.6, energy: 0.2 },
  { name: 'エオリア i-VII-VI-VII', scale: 'minor', ch: [[0, 'm'], [10, 'M'], [8, 'M'], [10, 'M']], drive: 0, chroma: 0, sink: 0.2, float: 0.7, energy: 0.25 },
  { name: 'ドリア i-IV', scale: 'dorian', ch: [[0, 'm7'], [5, 'M'], [0, 'm7'], [5, 'sus2']], drive: 0, chroma: 0, sink: 0, float: 0.9, energy: 0.15 },
  { name: '叙事 i-VI-III-VII', scale: 'minor', ch: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], drive: 0.1, chroma: 0, sink: 0.1, float: 0.3, energy: 0.5 },
  // 泣き（v1.1）: 属和音で解決を求め、偽終止で裏切る（Sloboda 1991: 涙は倚音・反復進行・期待の裏切りと結びつく）
  { name: 'i-VI-iv-V', scale: 'harmonic', ch: [[0, 'm'], [8, 'M'], [5, 'm'], [7, 'dom7']], drive: 0.5, chroma: 0.1, sink: 0.4, float: 0.2, energy: 0.5 },
  { name: '泣きの王道 VI-VII-v-i', scale: 'minor', ch: [[8, 'M7'], [10, 'M'], [7, 'm7'], [0, 'm']], drive: 0.3, chroma: 0, sink: 0.3, float: 0.3, energy: 0.55 },
  // 恐怖: 半音上の和音との往復（フリギアの ♭II）、減和音
  { name: '恐怖 i-♭II', scale: 'minor', ch: [[0, 'm'], [1, 'M'], [0, 'm'], [6, 'dim']], drive: 0.2, chroma: 0.9, sink: 0.4, float: 0.3, energy: 0.75 },
  { name: '不穏 i-♭VI-iv°', scale: 'harmonic', ch: [[0, 'm'], [8, 'M'], [5, 'dim'], [7, 'dom7']], drive: 0.5, chroma: 0.7, sink: 0.3, float: 0.2, energy: 0.7 },
  // 勝利: 主和音と属和音の強い往復、♭VI-♭VII-I（英雄的な終止）
  { name: '凱歌 I-IV-V-I', scale: 'major', ch: [[0, 'M'], [5, 'M'], [7, 'M'], [0, 'M']], drive: 0.8, chroma: 0, sink: 0, float: 0, energy: 0.9 },
  { name: '英雄 I-♭VI-♭VII-I', scale: 'major', ch: [[0, 'M'], [8, 'M'], [10, 'M'], [0, 'M']], drive: 0.7, chroma: 0.3, sink: 0, float: 0.1, energy: 0.95 },
  { name: 'ラメント i-v-iv-V', scale: 'harmonic', ch: [[0, 'm'], [7, 'm', 10], [5, 'm', 8], [7, 'M']], drive: 0.3, chroma: 0.2, sink: 1, float: 0.1, energy: 0.2 },
  { name: 'アンダルシア i-VII-VI-V', scale: 'harmonic', ch: [[0, 'm'], [10, 'M'], [8, 'M'], [7, 'M']], drive: 0.7, chroma: 0.2, sink: 0.5, float: 0, energy: 0.7 },
  { name: '悲愴 i-iv-V7-i', scale: 'harmonic', ch: [[0, 'm'], [5, 'm'], [7, 'dom7'], [0, 'm']], drive: 1, chroma: 0.3, sink: 0.2, float: 0, energy: 0.8 },
  { name: '激情 i-VI-N6-V7', scale: 'harmonic', ch: [[0, 'm'], [8, 'M'], [1, 'M', 5], [7, 'dom7']], drive: 1, chroma: 0.8, sink: 0.3, float: 0, energy: 0.95 },
  { name: '減七 i-vii°7-i-V7', scale: 'harmonic', ch: [[0, 'm'], [11, 'dim7'], [0, 'm'], [7, 'dom7']], drive: 1, chroma: 0.6, sink: 0, float: 0, energy: 0.9 },
];

// 長短 = 和声の明るさ（v0.5 から継続: 浮沈 − 粗さ + 少しの明るさ）。カテゴリカルに決める
export function harmonicBrightness(m) { return 0.45 + 1.0 * m.hLift - 1.2 * (m.rough - 0.2) + 0.3 * (m.hBright - 0.5); }

export function harmonyTarget(m) {
  const minor = harmonicBrightness(m) < 0.5;
  return {
    minor, drive: m.energy * (0.4 + 0.6 * m.D), chroma: m.energy * Math.max(m.rough, m.tremble || 0),
    sink: Math.min(1, 2 * Math.max(0, -m.lift) * (1 - m.energy)), float: m.space * (1 - m.energy), energy: m.energy,
  };
}

// 目標に近い順に並べる（同じ長短の中だけ）
export function rankProgressions(t, weights = {}) {
  const d = (p) => 2 * (p.drive - t.drive) ** 2 + 2 * (p.chroma - t.chroma) ** 2 + 2 * (p.sink - t.sink) ** 2 + (p.float - t.float) ** 2 + 2 * (p.energy - t.energy) ** 2;
  const e = (p) => d(p) - 0.3 * Math.log(weights[p.name] ?? 1); // スタイルの偏り
  return PROGRESSIONS.filter((p) => (p.scale === 'major' || p.scale === 'lydian') !== t.minor).sort((a, b) => e(a) - e(b));
}

// ---- 歩容（gait）: 身体の運動の型 ----
// 運動の量は身体の軸から: 活性 E、質量 M（size）、浮沈、粗さ（動揺）、角（滑らかさの逆）、近さ（1 − 距離）、広がり
// 世界の広がり・近さも動き方を決める（広い空間 = 漂う、腕の中 = 揺れる）
const W = { E: 3, M: 1.5, lift: 1.5, R: 1.5, edge: 1, near: 1.5, space: 2.5 };
export const GAITS = {
  漂う:     { proto: { E: 0.2, M: 0.6, lift: 0, R: 0.1, edge: 0.2, near: 0.3, space: 0.9 }, beats: 4, sub: 2, bpm: [62, 80], hr: 2 },
  揺れる:   { proto: { E: 0.25, M: 0.45, lift: 0.15, R: 0.05, edge: 0.15, near: 0.85, space: 0.3 }, beats: 2, sub: 3, bpm: [50, 62], hr: 1 },
  嘆く:     { proto: { E: 0.2, M: 0.5, lift: -0.5, R: 0.1, edge: 0.2, near: 0.55, space: 0.5 }, beats: 4, sub: 2, bpm: [58, 70], hr: 1 },
  // 泣く（v1.1）: Huron の区別。寂しさ（melancholy）= 低い覚醒・沈む、泣き（grief）= 沈むのに覚醒が高い（声を上げて泣く）
  泣く:     { proto: { E: 0.5, M: 0.5, lift: -0.4, R: 0.08, edge: 0.15, near: 0.6, space: 0.6 }, beats: 4, sub: 2, bpm: [60, 72], hr: 1 },
  // 震える（恐怖）: 小さく弱い身体が強く覚醒し沈む。トレモロ（震え）、心臓の鼓動の低音、半音でぶつかる高音
  震える:   { proto: { E: 0.85, M: 0.35, lift: -0.4, R: 0.3, edge: 0.35, near: 0.5, space: 0.55 }, beats: 4, sub: 4, bpm: [96, 120], hr: 2 },
  // 行進（勝利・勇気）: 大きく強い身体が上へ向かって規則正しく進む。ズン・チャの伴奏、付点のファンファーレ
  行進:     { proto: { E: 0.85, M: 0.72, lift: 0.45, R: 0.08, edge: 0.6, near: 0.5, space: 0.6 }, beats: 4, sub: 4, bpm: [104, 124], hr: 1 },
  // スキップ（かわいい）: 小さく軽い身体が上向きに弾む。子どものスキップ = 6/8 の付点の弾み、中くらいのテンポ、軽い伴奏
  スキップ: { proto: { E: 0.5, M: 0.25, lift: 0.45, R: 0.05, edge: 0.4, near: 0.7, space: 0.4 }, beats: 2, sub: 3, bpm: [96, 116], hr: 1 },
  歩く:     { proto: { E: 0.4, M: 0.5, lift: 0, R: 0.2, edge: 0.4, near: 0.85, space: 0.25 }, beats: 4, sub: 2, bpm: [78, 96], hr: 1 },
  叩きつける: { proto: { E: 0.9, M: 0.7, lift: -0.1, R: 0.65, edge: 0.7, near: 0.7, space: 0.4 }, beats: 4, sub: 3, bpm: [132, 152], hr: 1 },
  跳ねる:   { proto: { E: 0.85, M: 0.25, lift: 0.6, R: 0.1, edge: 0.6, near: 0.7, space: 0.4 }, beats: 4, sub: 4, bpm: [150, 172], hr: 1 },
};

export function motionOf(z) {
  const g = z.ground, f = z.figure, avg = (k) => 0.5 * (g[k] + f[k]);
  return {
    E: Math.max(g.energy, f.energy), M: avg('size'), lift: avg('lift'), R: avg('rough'), edge: avg('edge'),
    near: 1 - z.distance, space: z.space, bright: avg('bright'), D: z.D,
    // 和声は地の性質なので、和声の明るさは地を重く見る（v0.5 と同じ 0.6 / 0.4）
    energy: Math.max(g.energy, f.energy), rough: 0.6 * g.rough + 0.4 * f.rough,
    hLift: 0.6 * g.lift + 0.4 * f.lift,
    // 泣き = 沈む × 覚醒（倚音・嘆息の確率）
    // 震え（恐怖）= 沈む × 覚醒 × 小ささ（支配の弱さ）
    tremble: Math.min(1, 4 * Math.max(0, -(0.5 * g.lift + 0.5 * f.lift)) * Math.max(g.energy, f.energy) * (1 - 0.5 * (g.size + f.size))),
    grief: Math.min(0.6, 2 * Math.max(0, -(0.5 * g.lift + 0.5 * f.lift)) * Math.max(g.energy, f.energy)), hBright: 0.6 * g.bright + 0.4 * f.bright,
  };
}

// 歩容の候補を理論への近さの順に（[名前, 距離]）。マナーの制約・好みを掛けて選ぶため
export function rankGaits(m) {
  return Object.entries(GAITS).map(([name, g]) => { let d = 0; for (const k of Object.keys(W)) d += W[k] * (m[k] - g.proto[k]) ** 2; return [name, d]; }).sort((a, b) => a[1] - b[1]);
}
export function gaitOf(m) {
  let best = null, bd = Infinity;
  for (const [name, g] of Object.entries(GAITS)) {
    let d = 0; for (const k of Object.keys(W)) d += W[k] * (m[k] - g.proto[k]) ** 2;
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}

// テンポ: 型の範囲の中で、活性が高いほど速く、重いほど遅い（フルード: 周期 ∝ √L）
export function tempoOf(gait, m) {
  const g = GAITS[gait], t = Math.min(1, Math.max(0, 0.5 + 1.5 * (m.E - g.proto.E) - 0.6 * (m.M - g.proto.M)));
  return g.bpm[0] + (g.bpm[1] - g.bpm[0]) * t;
}

// ---- 楽式: 区間と強度の弧（§4.4.1: 長期の進行 = 意味空間の中の軌道） ----
export const FORM = [
  { name: '導入', bars: 4, I: 0.45, melody: false },
  { name: 'A', bars: 16, I: 0.6, melody: true, motif: 'A', prog: 0, lift: 0 },
  { name: 'B', bars: 16, I: 0.85, melody: true, motif: 'B', prog: 1, lift: 2 },
  { name: "A'", bars: 16, I: 1.0, melody: true, motif: 'A', prog: 0, lift: 1, ornament: true },
  { name: '終結', bars: 4, I: 0.4, melody: false, prog: 0 },
];

// 楽節（8 小節）の和音列: 進行を繰り返し、終止を入れる（前楽節 = 半終止、後楽節 = 完全終止）
export function phraseChords(prog, kind, hr, deceptive = false) {
  const out = [];
  for (let b = 0; b < 8; b++) out.push(prog.ch[Math.floor(b / hr) % prog.ch.length]);
  if (prog.drive >= 0.3) {
    const minor = prog.scale !== 'major' && prog.scale !== 'lydian';
    const pre = [5, minor ? 'm' : 'M'], V = [7, 'dom7'], I = [0, minor ? 'm' : 'M'];
    if (kind === 'ante') { out[6] = pre; out[7] = V; } else { out[6] = V; out[7] = I; }
    // 偽終止: 泣きの和声では、最初の後楽節の終わりで V → VI と期待を裏切る
    if (deceptive && kind === 'cons' && minor) out[7] = [8, 'M'];
  } else if (kind === 'cons') out[7] = prog.ch[0];
  return out;
}
