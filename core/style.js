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

// ---- テーマ（主題の旋律とコード進行）: ポケモンの戦闘曲やゼルダのように、同じ主題を場面ごとに姿を変えて何度も使う ----
//   melody: '1 2 3 5 | 6 5 3 - | 4 3 2 1 | 2 - - -'
//           音階の度数（1〜7）。' で 1 オクターブ上、, で下、前に # / b で半音上げ下げ（例 #4 b7）。- は前の音を伸ばす、0 は休み。| は小節。1 小節の中は等分
//   chords: 'I V vi IV'（1 小節に 1 つ。V7・IVM7・ii7・vii°・bVII・#iv° なども可。小文字 = 短三和音）
// 場面に合わせて変形する: リズムは歩容の格子に、音階とコードは長調・短調に（同じ主題だと分かる変形）。
export function parseThemeMelody(text) {
  const bars = String(text).split('|').map((b) => b.trim()).filter(Boolean);
  return bars.map((bar) => {
    const toks = bar.split(/\s+/).filter(Boolean), n = toks.length, notes = [];
    toks.forEach((t, i) => {
      if (t === '-') { if (notes.length) notes[notes.length - 1].dur += 1 / n; return; }
      if (t === '0' || t === 'r') return;
      // 臨時記号: #/♯ で半音上げ、b/♭ で半音下げ（長調は長音階、短調は自然短音階が基準）
      const m = /^([#♯b♭]*)([1-7])(['’]*)(,*)$/.exec(t); if (!m) return;
      const acc = [...m[1]].reduce((a, c) => a + (c === '#' || c === '♯' ? 1 : -1), 0);
      notes.push({ at: i / n, dur: 1 / n, deg: +m[2] - 1 + 7 * m[3].length - 7 * m[4].length, acc });
    });
    return notes;
  });
}
const RN = { i: 0, ii: 2, iii: 4, iv: 5, v: 7, vi: 9, vii: 11 };
export function parseThemeChords(text) {
  const toks = String(text).split(/[\s|,]+/).filter(Boolean);
  // 短調の主題（i で始まる）では、III・VI・VII は自然短音階の上の和音（♭III・♭VI・♭VII）
  const minorKey = /^i(?![iv])/.test(toks[0] || '');
  return toks.map((t) => {
    const m = /^([b♭#♯]?)(i{1,3}|iv|vi{0,2}|v|I{1,3}|IV|VI{0,2}|V)(°|o|dim)?(M7|△7|maj7|7)?$/.exec(t);
    if (!m) return null;
    const acc = m[1] === 'b' || m[1] === '♭' ? -1 : m[1] ? 1 : 0, rn = m[2], minor = rn === rn.toLowerCase();
    const flat = minorKey && !m[1] && ['iii', 'vi', 'vii'].includes(rn.toLowerCase()) && rn !== rn.toLowerCase() ? -1 : 0;
    const root = (RN[rn.toLowerCase()] + acc + flat + 12) % 12;
    let q = m[3] ? (m[4] === '7' ? 'dim7' : 'dim') : minor ? 'm' : 'M';
    if (m[4] === '7' && !m[3]) q = minor ? 'm7' : 'dom7';
    if (m[4] && /M7|△7|maj7/.test(m[4])) q = 'M7';
    return [root, q];
  }).filter(Boolean);
}
// 同主調への写し替え（長調の主題を短調の場面で / その逆）
const TO_MINOR = { 0: [0, 'm'], 2: [2, 'dim'], 4: [3, 'M'], 5: [5, 'm'], 7: [7, 'M'], 9: [8, 'M'], 11: [11, 'dim'] };
const TO_MAJOR = { 0: [0, 'M'], 3: [4, 'm'], 5: [5, 'M'], 7: [7, 'M'], 8: [9, 'm'], 10: [7, 'M'], 2: [2, 'm'] };
export function themeProgression(theme, minor) {
  let ch = parseThemeChords(theme.chords || '');
  if (!ch.length) return null;
  const themeMinor = ch[0][1] === 'm' || ch[0][1] === 'm7';
  if (minor && !themeMinor) ch = ch.map(([r, q]) => (TO_MINOR[r] && !['dom7', 'dim7'].includes(q) ? TO_MINOR[r] : [r, q]));
  if (!minor && themeMinor) ch = ch.map(([r, q]) => (TO_MAJOR[r] && q !== 'dom7' ? TO_MAJOR[r] : [r, q]));
  const isMinor = minor || (themeMinor && minor !== false);
  return { name: `テーマ（${theme.chords}）${minor && !themeMinor ? '・短調' : !minor && themeMinor ? '・長調' : ''}`, scale: minor ? 'minor' : 'major', ch, drive: 0.5, chroma: 0, sink: 0, float: 0.2, energy: 0.6, theme: true, minor: isMinor, themeMinor };
}
// 主題の頭 2 小節 → 動機（A メロで展開する）
export function motifFromTheme(theme, S) {
  const bars = parseThemeMelody(theme.melody || '');
  if (!bars.length) return null;
  const toCells = (b) => (b || []).map((n) => [Math.min(S - 1, Math.round(n.at * S)), Math.max(1, Math.round(n.dur * S))]);
  const rA = toCells(bars[0]), rB = toCells(bars[1] || bars[0]);
  const degs = [...(bars[0] || []), ...(bars[1] || bars[0] || [])].map((n) => n.deg);
  const iv = []; for (let i = 1; i < degs.length; i++) iv.push(degs[i] - degs[i - 1]);
  return rA.length ? { rA, rB: rB.length ? rB : [[0, S]], iv: iv.length ? iv : [0], fixed: true } : null;
}
