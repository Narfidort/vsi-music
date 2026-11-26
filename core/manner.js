// スタイルマナー（docs/08_api.md）= 理論の語彙に対する制約・好み・ゆらぎ。理論そのものは変えない。
// 作品・国・状況ごとの「らしさ」をクライアントが定義し、全体（style）またはチャンネル（mix の manner）に結び付ける。
//
//   {
//     allow:  { gaits?: [..], progressions?: [..], instruments?: [..] },   // 許可リスト（書いたものだけ使う）
//     deny:   { gaits?: [..], progressions?: [..], instruments?: [..] },   // 禁止リスト
//     prefer: { gaits?: {名: 倍率}, progressions?: {..}, instruments?: {..} }, // 好み（事前分布の倍率）
//     temperature: 0..2,   // ゆらぎ: 0 = いつも最も合うもの、1 = 合うほど選ばれやすい確率的な選択、2 = かなり自由
//     seed: 数,            // 同じ種なら同じ選択（再現）
//     tempo: { scale?, min?, max? },
//     melody: { density?, syncopation?, leap?, contour?: -1..1（下行 ↔ 上行）, repetition?, range? },  // 旋律の軸（理論の既定値を上書き）
//     motif?, logo?        // ライトモチーフ、音のロゴ
//   }
// 旧 style の { progressions, instruments, tempo, motif, logo } もそのまま受け付ける（prefer に読み替える）。

export const DEFAULT_MANNER = { allow: {}, deny: {}, prefer: {}, temperature: 0, seed: null, tempo: {}, melody: {}, motif: null, logo: false };

export function normalizeManner(s = {}) {
  const m = {
    ...DEFAULT_MANNER, ...s,
    allow: { ...(s.allow || {}) }, deny: { ...(s.deny || {}) },
    prefer: { gaits: { ...(s.prefer?.gaits || {}) }, progressions: { ...(s.prefer?.progressions || {}), ...(s.progressions || {}) }, instruments: { ...(s.prefer?.instruments || {}), ...(s.instruments || {}) } },
    tempo: typeof s.tempo === 'number' ? { scale: s.tempo } : { ...(s.tempo || {}) },
    melody: { ...(s.melody || {}) },
  };
  // 旧 style との互換: 読み出し側が使う別名
  m.progressions = m.prefer.progressions; m.instruments = m.prefer.instruments;
  return m;
}

// 重ねる: 後のものが勝つ（許可・禁止・旋律の軸はキーごとに上書き、好みは掛け合わせ、温度は後のもの）
export function mergeManners(list) {
  const out = normalizeManner({});
  for (const raw of list) {
    if (!raw) continue;
    const m = normalizeManner(raw);
    Object.assign(out.allow, m.allow); Object.assign(out.deny, m.deny);
    for (const k of ['gaits', 'progressions', 'instruments']) for (const [n, w] of Object.entries(m.prefer[k] || {})) out.prefer[k][n] = (out.prefer[k][n] ?? 1) * w;
    if (raw.temperature !== undefined) out.temperature = m.temperature;
    if (raw.seed !== undefined) out.seed = m.seed;
    Object.assign(out.tempo, m.tempo); Object.assign(out.melody, m.melody);
    if (m.motif) out.motif = m.motif; if (raw.logo !== undefined) out.logo = m.logo;
    if (raw.scale !== undefined) out.scale = raw.scale; // 各国の音階
  }
  out.progressions = out.prefer.progressions; out.instruments = out.prefer.instruments;
  return out;
}

// 候補（[名前, 距離]、小さいほど理論に合う）から、マナーに従って 1 つ選ぶ
export function choose(cands, kind, manner, rng) {
  const allow = manner.allow?.[kind], deny = manner.deny?.[kind] || [], pref = manner.prefer?.[kind] || {};
  let c = cands.filter(([n]) => (!allow || allow.includes(n)) && !deny.includes(n));
  if (!c.length) c = cands; // 制約で何も残らなければ理論の選択に戻る（無音にしない）
  const scored = c.map(([n, d]) => [n, d - 0.3 * Math.log(pref[n] ?? 1)]).sort((a, b) => a[1] - b[1]);
  const T = manner.temperature || 0;
  if (T <= 0 || !rng) return scored[0][0];
  const top = scored.slice(0, 6), best = top[0][1];
  const w = top.map(([, d]) => Math.exp(-(d - best) / (0.15 * T)));
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < top.length; i++) if ((r -= w[i]) <= 0) return top[i][0];
  return top[0][0];
}
