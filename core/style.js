// スタイル = 理論の語彙に対する事前分布の偏り（docs/07_interface.md）。理論そのものは変えない。
//   motif       … 旋律の基本動機（ライトモチーフ）。{ degrees: [音階の度数], rhythm: [[開始, 長さ], ...]（4/4 の 16 分、2 小節 = 32） }
//                 情景に応じて、リズムは歩容の格子に、音階は旋法に合わせて変形される（同じ旋律だと分かる変形）
//   progressions … 和声進行の重み（名前 → 倍率）
//   instruments  … 楽器の事前確率の倍率（名前 → 倍率）
//   tempo        … テンポの倍率
//   logo         … true なら、熱の頭と合図（cue）で動機の頭を鳴らす（音のロゴ）

export const DEFAULT_STYLE = { motif: null, progressions: {}, instruments: {}, tempo: 1, logo: false };

export function normalizeStyle(s = {}) { return { ...DEFAULT_STYLE, ...s, progressions: { ...(s.progressions || {}) }, instruments: { ...(s.instruments || {}) } }; }

// スタイルの動機を、歩容の格子（1 小節 S ステップ）に写す
export function motifFromStyle(m, S) {
  const k = S / 16, rA = [], rB = [];
  m.rhythm.forEach(([st, du], i) => {
    if (i >= m.degrees.length) return;
    const bar = st >= 16 ? 1 : 0, s0 = Math.min(S - 1, Math.round((st % 16) * k)), d = Math.max(1, Math.round(du * k));
    (bar ? rB : rA).push([s0, Math.min(d, S - s0)]);
  });
  if (!rB.length) rB.push([0, S]);
  const iv = [];
  for (let i = 1; i < m.degrees.length; i++) iv.push(m.degrees[i] - m.degrees[i - 1]);
  if (!iv.length) iv.push(0);
  return { rA, rB, iv, fixed: true };
}
