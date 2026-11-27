// 旋律 v1: 骨格 + 装飾、文（sentence）と楽段（period）。docs/06_review.md §4.4
// 音高は音階の度数（整数）で扱い、和音ごとの音階（和音の構成音で置き換えた音階）で半音に直す。

import { SCALES, QUAL, chordPcs, WORLD_SCALES } from './theory.js';

// 旋律のリズム動機（1 小節、[開始ステップ, 長さ]）。歩容の運動と整合させる（§4.4）
export const CELLS = {
  漂う: [[[0, 6], [6, 2]], [[0, 3], [3, 1], [4, 4]], [[0, 8]], [[2, 2], [4, 4]], [[0, 2], [2, 2], [4, 4]], [[0, 4], [4, 2], [6, 2]]],
  揺れる: [[[0, 3], [3, 2], [5, 1]], [[0, 2], [2, 1], [3, 3]], [[0, 6]], [[0, 1], [1, 1], [2, 1], [3, 3]], [[0, 3], [3, 3]]],
  嘆く: [[[0, 4], [4, 3], [7, 1]], [[0, 6], [6, 2]], [[0, 2], [2, 2], [4, 4]], [[0, 8]], [[0, 3], [3, 1], [4, 4]]],
  泣く: [[[0, 4], [4, 2], [6, 2]], [[0, 6], [6, 2]], [[0, 2], [2, 2], [4, 4]], [[0, 3], [3, 1], [4, 2], [6, 2]], [[0, 8]], [[0, 4], [4, 4]]],
  震える: [[[0, 8], [8, 8]], [[0, 12], [12, 2], [14, 2]], [[0, 4], [6, 2], [8, 8]], [[0, 16]], [[2, 2], [4, 12]]],
  駆ける: [[[0, 2], [2, 1], [3, 1], [4, 2], [6, 2]], [[0, 1], [1, 1], [2, 2], [4, 3], [7, 1]], [[0, 3], [3, 3], [6, 2]], [[0, 2], [2, 2], [4, 4]], [[1, 1], [2, 1], [3, 2], [5, 3]]],
  行進: [[[0, 3], [3, 1], [4, 4], [8, 3], [11, 1], [12, 4]], [[0, 4], [4, 4], [8, 8]], [[0, 3], [3, 1], [4, 3], [7, 1], [8, 8]], [[0, 8], [8, 4], [12, 4]], [[0, 2], [2, 2], [4, 4], [8, 4], [12, 4]]],
  スキップ: [[[0, 2], [2, 1], [3, 2], [5, 1]], [[0, 3], [3, 2], [5, 1]], [[0, 2], [2, 1], [3, 3]], [[0, 1], [1, 1], [2, 1], [3, 2], [5, 1]], [[0, 6]]],
  歩く: [[[0, 2], [2, 1], [3, 1], [4, 4]], [[0, 3], [3, 3], [6, 2]], [[1, 1], [2, 2], [4, 2], [6, 2]], [[0, 2], [2, 2], [4, 2], [6, 2]], [[0, 6], [6, 2]]],
  // 3 連符の格子（12 ステップ）。同音連打（運命の動機）を含む
  叩きつける: [[[0, 3], [3, 3], [6, 6]], [[0, 6], [6, 2], [8, 1], [9, 3]], [[0, 2], [2, 1], [3, 3], [6, 3], [9, 3]], [[0, 3], [3, 3], [6, 3], [9, 3]], [[0, 9], [9, 3]]],
  // 16 分の格子。シンコペーション
  跳ねる: [[[0, 2], [2, 2], [4, 1], [6, 2], [8, 3], [11, 2], [14, 2]], [[0, 3], [3, 3], [6, 2], [8, 4], [12, 2], [14, 2]], [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 6]], [[0, 2], [3, 2], [6, 2], [8, 8]], [[0, 3], [3, 3], [6, 4], [10, 6]]],
};

// 和音ごとの音階: 音階の各度を、半音差の和音構成音があればそれに置き換える（和声的短音階の導音、ナポリの ♭2 など）
const DEG = { M: [0, 2, 4], m: [0, 2, 4], dim: [0, 2, 4], dom7: [0, 2, 4, 6], dim7: [0, 2, 4, 6], M7: [0, 2, 4, 6], m7: [0, 2, 4, 6], add9: [0, 2, 4, 1], sus2: [0, 1, 4] };
export function chordScale(scale, chord) {
  if (WORLD_SCALES[scale]) return WORLD_SCALES[scale].slice(); // 各国の音階: 和音で音階を変えない（旋法的）
  const s = SCALES[scale].slice(), root = chord[0];
  // 根音の度: 最も近い音階の度（同距離なら上の度を下げる = ナポリの ♭2 は 2 度）
  let rd = 0, best = 99;
  for (let i = 0; i < 7; i++) { const dd = Math.abs(((s[i] - root + 18) % 12) - 6); const sc = dd * 2 + (s[i] > root ? 0 : 1); if (sc < best) { best = sc; rd = i; } }
  QUAL[chord[1]].forEach((iv, k) => {
    const i = (rd + DEG[chord[1]][k]) % 7, pc = (root + iv) % 12;
    let v = pc; while (v - s[i] > 6) v -= 12; while (s[i] - v > 6) v += 12;
    s[i] = v;
  });
  return s;
}
export function degSemi(d, s) { const n = s.length, o = Math.floor(d / n), i = ((d % n) + n) % n; return s[i] + 12 * o; }
function isChordTone(d, s, chord) { const pc = ((degSemi(d, s) % 12) + 12) % 12; return chordPcs(chord).includes(pc); }
function nearestChordTone(d, s, chord) {
  for (const k of [0, -1, 1, -2, 2, 3, -3]) if (isChordTone(d + k, s, chord)) return d + k;
  return d;
}

function pickW(rng, items) { let s = 0; for (const [, w] of items) s += w; let r = rng() * s; for (const [v, w] of items) { if ((r -= w) <= 0) return v; } return items[0][0]; }

// 動機 = 2 小節のリズム + 音程の輪郭（v0 の局所の力: 近接 = 順次進行が多い、跳躍の後は反対方向へ順次で埋める）
// ---- 伝統から学んだ統計（tools/melody_stats.py → core/data/melody_model.js）----
let MODEL = null;
export function setMelodyModel(m) { MODEL = m; RCACHE.clear(); }
const GAIT_GRID = { 駆ける: [4, 2], スキップ: [2, 3], 漂う: [4, 2], 揺れる: [2, 3], 嘆く: [4, 2], 泣く: [4, 2], 歩く: [4, 2], 叩きつける: [4, 3], 跳ねる: [4, 4], 震える: [4, 4], 行進: [4, 4] };
const RCACHE = new Map();
// 学んだ 1 小節の型を、歩容の格子（beats × sub）に写す。写せないもの（細かすぎる）は捨てる
function learnedCells(gait) {
  if (!MODEL) return null;
  if (RCACHE.has(gait)) return RCACHE.get(gait);
  const [beats, sub] = GAIT_GRID[gait] || [4, 2], S = beats * sub, out = [];
  const add = (cell, n, density, sync) => { if (cell.length) out.push({ cell, n, density, sync }); };
  if (beats === 2 && sub === 3) { // 6/8（揺れる）
    for (const c of MODEL.rhythm['6/8']?.cells || []) add(c.cell, c.n, c.density, c.sync);
  } else if (sub === 3) { // 3 連符の格子: 6/8 の型を 2 つ並べる（12/8）
    const six = MODEL.rhythm['6/8']?.cells || [];
    for (const a of six.slice(0, 40)) for (const b of six.slice(0, 12)) add([...a.cell, ...b.cell.map(([o, d]) => [o + 6, d])], Math.sqrt(a.n * b.n), (a.density + b.density) / 2, (a.sync + b.sync) / 2);
  } else {
    const k = 16 / S; // 4/4 の 16 分の格子 → S
    for (const c of MODEL.rhythm['4/4']?.cells || []) {
      if (c.cell.some(([o, d]) => o % k !== 0 || d % k !== 0)) continue;
      add(c.cell.map(([o, d]) => [o / k, d / k]), c.n, c.density * k, c.sync);
    }
  }
  RCACHE.set(gait, out.length >= 4 ? out : null);
  return RCACHE.get(gait);
}
// 旋律の軸に近い型を、コーパスでの頻度に応じて選ぶ（最近使った型は避ける）
function pickCell(rng, gait, axes, avoid = [], fewerThan = null) {
  const cells = learnedCells(gait);
  if (!cells) return null;
  const key = (c) => JSON.stringify(c);
  let cand = cells.filter((c) => !avoid.includes(key(c.cell)) && (!fewerThan || (c.cell.length <= fewerThan && c.cell[c.cell.length - 1][1] >= 2)));
  if (!cand.length) cand = cells;
  const w = cand.map((c) => Math.sqrt(c.n) * Math.exp(-(((c.density - axes.density) / 0.18) ** 2) - (((c.sync - axes.syncopation) / 0.25) ** 2)));
  let r = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cand.length; i++) if ((r -= w[i]) <= 0) return cand[i].cell;
  return cand[0].cell;
}
// 音程: 学んだ 2 次の遷移 P(次 | 直前) に、軸（跳躍・反復・輪郭）で偏りを掛けてサンプルする
function nextInterval(rng, prev, mode, axes) {
  const tab = MODEL?.interval?.[mode]?.[String(Math.max(-7, Math.min(7, prev)))];
  const items = [];
  if (tab) for (const [b, n] of Object.entries(tab)) {
    const x = +b; if (Math.abs(x) > 5) continue;
    let w = n;
    if (Math.abs(x) >= 3) w *= 0.4 + 2 * (axes.leap ?? 0.3);
    if (x === 0) w *= 0.4 + 3 * (axes.repetition ?? 0.1);
    if (x !== 0) w *= Math.exp(0.6 * (axes.contour ?? 0) * Math.sign(x));
    items.push([x, w]);
  }
  if (!items.length) return pickW(rng, [[0, 0.1], [1, 0.27], [-1, 0.3], [2, 0.12], [-2, 0.12], [3, 0.05], [-3, 0.04]]);
  return pickW(rng, items);
}
// 旋律の軸: 歩容と身体から理論の既定値を決め、マナーの melody で上書きする（自由すぎる生成にしない）
export function melodyAxes(gait, m, over = {}) {
  const base = { 駆ける: [0.5, 0.25, 0.3, 0.15], スキップ: [0.55, 0.1, 0.3, 0.15], 漂う: [0.25, 0.05, 0.25, 0.05], 揺れる: [0.45, 0.1, 0.25, 0.05], 嘆く: [0.3, 0.05, 0.2, 0.05], 泣く: [0.35, 0.1, 0.3, 0.05], 歩く: [0.45, 0.15, 0.3, 0.1],
    叩きつける: [0.55, 0.15, 0.45, 0.35], 跳ねる: [0.55, 0.45, 0.4, 0.2], 震える: [0.3, 0.2, 0.35, 0.15], 行進: [0.45, 0.1, 0.4, 0.15] }[gait] || [0.4, 0.1, 0.3, 0.1];
  const E = m?.E ?? 0.5, R = m?.R ?? 0.1, lift = m?.lift ?? 0;
  return { density: base[0] + 0.25 * (E - 0.5), syncopation: base[1] + 0.2 * ((m?.edge ?? 0.4) - 0.4), leap: base[2] + 0.3 * R, repetition: base[3], contour: Math.max(-1, Math.min(1, lift)), ...over };
}

// テーマの旋律をそのまま奏でる（サビ）。8 小節の楽節を主題の小節で埋める（主題が 4 小節なら 2 回）。
// リズムは歩容の格子に、音高は和音ごとの音階（長調・短調）に写す。center = 主音の度数（音域）
export function themePhrase(themeBars, { chords, scale, S, center, bars = 8 }) {
  const out = [], NS = (WORLD_SCALES[scale] || SCALES[scale]).length, tonic = NS * Math.round(center / NS);
  for (let b = 0; b < bars; b++) {
    const src = themeBars[b % themeBars.length] || [];
    const s = chordScale(scale, chords[b] || chords[0]);
    for (const n of src) {
      const step = Math.min(S - 1, Math.round(n.at * S)), dur = Math.max(1, Math.round(n.dur * S));
      const d = tonic + n.deg;
      out.push({ bar: b, step, dur: Math.min(dur, S * 2 - step), d, vel: step === 0 ? 0.92 : 0.82, semi: degSemi(d, s) });
    }
  }
  return out;
}

// 動機 = 2 小節のリズム + 音程の輪郭。学んだ統計があればそれを、なければ固定の型（v1）を使う
// history: 最近の動機の署名（似たものを避ける = 長く聴いても同じ旋律が戻ってきすぎない）
export function makeMotif(rng, gait, from = null, { axes = melodyAxes(gait), mode = 'major', history = [] } = {}) {
  const sig = (mo) => JSON.stringify([mo.rA, mo.iv.slice(0, 4)]);
  let best = null, bestScore = -Infinity;
  for (let tries = 0; tries < 6; tries++) {
    const mo = makeMotifOnce(rng, gait, from, axes, mode, history);
    const s = sig(mo), same = history.filter((h) => h === s).length, near = history.filter((h) => h.slice(0, 40) === s.slice(0, 40)).length;
    const score = -3 * same - near + rng() * 0.1;
    if (score > bestScore) { bestScore = score; best = mo; }
    if (same === 0 && near === 0) break;
  }
  history.push(sig(best)); if (history.length > 12) history.shift();
  return best;
}
function makeMotifOnce(rng, gait, from, axes, mode, history) {
  const cells = CELLS[gait];
  const recent = history.map((h) => { try { return JSON.stringify(JSON.parse(h)[0]); } catch { return ''; } });
  const rA = from ? from.rA : pickCell(rng, gait, axes, recent) || cells[Math.floor(rng() * cells.length)];
  // 2 小節目は音が少なく、長い音で終わる（呼吸）
  const fewer = cells.filter((c) => c.length <= rA.length && c[c.length - 1][1] >= c[0][1]);
  const rB = pickCell(rng, gait, { ...axes, density: axes.density * 0.75 }, [], rA.length) || (fewer.length ? fewer : cells)[Math.floor(rng() * (fewer.length || cells.length))];
  const n = rA.length + rB.length, iv = [];
  let prev = 0;
  for (let i = 0; i < n; i++) { const x = MODEL ? nextInterval(rng, prev, mode, axes) : (Math.abs(prev) >= 3 ? -Math.sign(prev) : pickW(rng, [[0, 0.08 + axes.repetition], [1, 0.27], [-1, 0.3], [2, 0.12], [-2, 0.12], [3, 0.05], [-3, 0.04], [4, 0.04], [-4, 0.02]])); iv.push(x); prev = x; }
  if (from) for (let i = 0; i < iv.length; i++) iv[i] = -(from.iv[i] ?? iv[i]); // B: A の反行形（動機の発展）
  return { rA, rB, iv };
}

// 1 楽節（8 小節）の旋律。chords: 小節ごとの和音、S: 1 小節のステップ数、sub: 1 拍のステップ数
// 戻り値: [{ bar, step, dur, semi, vel }]
export function phrase(rng, motif, { chords, scale, S, sub, kind, center, ornament, sigh = 0, peakLift = 0, penta = false }) {
  const notes = [];
  const scaleOf = (b) => chordScale(scale, chords[b]);
  const NS = (WORLD_SCALES[scale] || SCALES[scale]).length; // 音階の音の数（五音音階なら 5）
  const strong = (step) => step % sub === 0 && (step === 0 || step === S / 2 || sub >= 3 && step % (2 * sub) === 0);
  const push = (bar, step, dur, d, vel, snap = true) => {
    const s = scaleOf(bar);
    if (snap && strong(step)) d = nearestChordTone(d, s, chords[bar]);
    notes.push({ bar, step, dur, d, vel });
    return d;
  };
  // 動機をある度数から置く
  const place = (bar, cells, ivs, start, velBase = 0.85) => {
    let d = start, k = 0;
    cells.forEach((cell, ci) => cell.forEach(([st, du]) => {
      if (k > 0) d += ivs[(k - 1) % ivs.length] ?? 0;
      d = push(bar + ci, st, du, d, velBase * (st === 0 ? 1 : 0.85));
      k++;
    }));
    return d;
  };
  const a0 = nearestChordTone(center, scaleOf(0), chords[0]);
  // 1–2: 基本動機
  let d = place(0, [motif.rA, motif.rB], motif.iv, a0);
  // 3–4: 反復（和音が替われば、根音の差だけ移高 = 反復進行）
  const shift = chords[2][0] === chords[0][0] ? 0 : Math.max(-2, Math.min(2, Math.round((chords[2][0] - chords[0][0]) / 2)));
  d = place(2, [motif.rA, rng() < 0.5 ? motif.rB : motif.rA], motif.iv, nearestChordTone(a0 + shift, scaleOf(2), chords[2]));
  // 5–6: 断片化（動機の前半を畳みかけ、1 度ずつ上げて頂点へ）
  const half = motif.rA.filter(([st]) => st < S / 2);
  const frag = half.length ? half : [motif.rA[0]];
  let base = d + 1;
  for (let b = 4; b < 6; b++) for (let h = 0; h < 2; h++) {
    let x = base, k = 0;
    for (const [st, du] of frag) {
      if (k > 0) x += motif.iv[(k - 1) % motif.iv.length] ?? 0;
      push(b, Math.min(S - 1, st + h * (S / 2)), Math.min(du, S / 2), x, 0.85 + 0.1 * (b - 4));
      k++;
    }
    base += 1;
  }
  const peak = base + (rng() < 0.5 ? 1 : 0) + peakLift; // 頂点（約 2/3 の位置に 1 回だけ）
  // 7–8: 終止（骨格線で目標へ順次に降りる）
  const goal = kind === 'cons'
    ? NS * Math.round(center / NS) // 主音
    : nearestChordTone(NS * Math.round(center / NS) + 1, scaleOf(7), chords[7]); // 半終止: V の構成音（2 度・5 度）
  const cad = motif.rA;
  let x = peak;
  cad.forEach(([st, du], i) => {
    const t = (i + 1) / (cad.length + 1);
    const want = Math.round(peak + (goal - peak) * t);
    x = push(6, st, du, want, 0.9 - 0.1 * t, i === 0);
  });
  push(7, 0, Math.round(S * 0.75), goal, 0.8, false);

  // 装飾（A'）: 3 度以上離れた隣り合う音の間に経過音を入れる
  if (ornament) {
    const extra = [];
    for (let i = 0; i + 1 < notes.length; i++) {
      const a = notes[i], b = notes[i + 1];
      if (a.bar === b.bar && a.dur >= 2 && Math.abs(b.d - a.d) >= 2 && rng() < 0.6) {
        const half = Math.floor(a.dur / 2); a.dur -= half;
        extra.push({ bar: a.bar, step: a.step + a.dur, dur: half, d: a.d + Math.sign(b.d - a.d), vel: a.vel * 0.75 });
      }
    }
    notes.push(...extra);
  }
  // 四七抜き（ヨナ抜き）: 4 度と 7 度を避ける。音の種類が少なく跳躍の多い、素朴で子どもらしい旋律（小さく軽い身体 = かわいい）
  if (penta) for (const a of notes) { const r = ((a.d % 7) + 7) % 7; if (r === 3) a.d -= 1; else if (r === 6) a.d += 1; }
  // 倚音（嘆息、ピアント）: 強拍の長い音を、上の隣接音から 2 度下行で解決させる。泣き声の下行するすすり泣きの慣習化
  if (sigh > 0) {
    const extra = [];
    for (const a of notes) if (a.step % sub === 0 && a.dur >= 2 * sub && rng() < sigh) {
      const h = Math.max(1, Math.floor(a.dur / 2));
      extra.push({ bar: a.bar, step: a.step + h, dur: a.dur - h, d: a.d, vel: a.vel * 0.7 });
      a.dur = h; a.d = a.d + 1; a.vel *= 1.1;
    }
    notes.push(...extra);
  }
  return notes.map((n) => ({ ...n, semi: degSemi(n.d, scaleOf(n.bar)) }));
}
