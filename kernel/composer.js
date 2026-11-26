// 作曲層 v0.3（02_theory §2.4, Q7）。
//
// 旋律 = 重力場の中で動く物体（Larson の音楽的力）。発話の韻律との対応:
//   重力 gravity   … 下へ向かう傾向          = 発話の下降（declination）
//   慣性 inertia   … 同じ向き・同じ歩幅を続ける = 調音器官の運動の連続性
//   近接 proximity … 小さな歩幅を好む         = 質量のある物体は跳びにくい（size・energy で決まる）
//   磁力 magnetism … 安定音（主音・和音構成音・音階音）に引かれる = 発話にはない。D がこの強さ
// したがって D（離散化）= 磁場の強さ + 拍節の格子の強さ + 反復の確率。D=0 で独り言、D=1 で音楽。
//
// 時間の階層: 拍 → 小節（4 拍）→ 動機（2 小節）→ 楽節（8 小節: A A' B A''）→ 区間の起伏（強度の弧）

// 旋法（v0.5）: 明るさの順に並べた全音階の旋法（上げられた音度の数の順）。
// 「和声の明るさ」= 明るさ − 粗さ から選ぶ（02_theory §2.4.3）。作業用 BGM の分析: 星空・優しさは 6/6 が長調、悲しみ・怒りは主に短調。
export const MODES = [
  { name: 'lydian',     steps: [0, 2, 4, 6, 7, 9, 11], major: true },
  { name: 'ionian',     steps: [0, 2, 4, 5, 7, 9, 11], major: true },
  { name: 'mixolydian', steps: [0, 2, 4, 5, 7, 9, 10], major: true },
  { name: 'dorian',     steps: [0, 2, 3, 5, 7, 9, 10], major: false },
  { name: 'aeolian',    steps: [0, 2, 3, 5, 7, 8, 10], major: false },
  { name: 'phrygian',   steps: [0, 1, 3, 5, 7, 8, 10], major: false },
];
for (const m of MODES) Object.freeze(m.steps); // 定義を誤って書き換えないように
export const MINOR = MODES[4].steps;

// 和声の明るさ hb ∈ [0,1] → 旋法。地 0.6 : 図 0.4 で加重した 3 つの既存の軸から決める:
//   浮沈（lift）: 短 3 度は「下げられた」3 度 = 沈んだ・悲しい発話の低い音高（Huron）
//   粗さ       : 短三和音は長三和音より感覚的不協和が大きい（Plomp & Levelt / Sethares）
//   明るさ     : 長調 = 明るい という越境感覚（ただし音色の明るさとは別物。作業用 BGM では「優しさ」は音色が暗く長調、「怒り」は明るく短調）
export function modeFor(lift, rough, bright) {
  const hb = Math.min(1, Math.max(0, 0.45 + 1.0 * lift - 1.2 * (rough - 0.2) + 0.3 * (bright - 0.5)));
  return MODES[Math.min(5, Math.max(0, Math.round((1 - hb) * 5)))];
}

// 音階度数 k（整数、7 で 1 オクターブ）→ 主音からの半音数
export const degSemi = (k, steps = MINOR) => 12 * Math.floor(k / 7) + steps[((k % 7) + 7) % 7];

// 和声: 度数（0..6）間の遷移の重み。短調系（i–VI–III–VII など）と長調系（I–IV–V–vi など）で分ける
const TRANS_MINOR = {
  0: { 5: 3, 3: 2, 6: 2, 2: 1.5, 4: 1.5 },
  1: { 4: 3, 6: 1 },
  2: { 6: 2, 5: 2, 3: 1.5, 0: 1 },
  3: { 4: 2, 0: 2, 6: 2, 5: 1, 1: 0.3 },
  4: { 0: 4, 5: 2 },
  5: { 6: 3, 2: 2, 3: 2, 0: 1 },
  6: { 0: 3, 2: 2.5, 5: 1 },
};
const TRANS_MAJOR = {
  0: { 3: 3, 4: 2.5, 5: 2.5, 1: 1 },
  1: { 4: 3, 3: 1 },
  2: { 5: 2, 3: 2 },
  3: { 4: 3, 0: 2, 1: 1.5, 5: 1 },
  4: { 0: 4, 5: 2, 3: 1 },
  5: { 3: 3, 1: 2, 4: 1.5, 2: 0.5 },
  6: { 0: 3 },
};

function pickWeighted(rng, obj) {
  let s = 0; for (const w of Object.values(obj)) s += w;
  let r = rng() * s;
  for (const [k, w] of Object.entries(obj)) { r -= w; if (r <= 0) return Number(k); }
  return Number(Object.keys(obj)[0]);
}

function gauss(rng) {
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// 和音の構成音（主音からの半音、0..11 の音級）。粗さに応じて協和度の低い順に拡張音を足す（Plomp & Levelt）。
export function chordTones(root, dissonance, steps = MINOR) {
  const degs = [root, root + 2, root + 4];
  if (dissonance > 0.25) degs.push(root + 6);   // 7th
  if (dissonance > 0.5) degs.push(root + 8);    // 9th
  if (dissonance > 0.72) degs.push(root + 3);   // 11th / sus
  const pcs = degs.map((k) => ((degSemi(k, steps) % 12) + 12) % 12);
  if (dissonance > 0.88) pcs.push((degSemi(root, steps) + 1) % 12); // 半音の衝突
  return pcs;
}

// ---------------------------------------------------------------------------------
export class Conductor {
  constructor(rng) { this.rng = rng; this.bar = 0; this.chord = 0; }

  // 小節の頭で呼ぶ。和音・区間内の位置・強度を決める。
  nextBar(D, mode = MODES[4]) {
    const bar = this.bar++;
    const T = mode.major ? TRANS_MAJOR : TRANS_MINOR;
    const posInSection = bar % 8, section = Math.floor(bar / 8);
    if (bar > 0) {
      if (posInSection === 6) this.chord = mode.major ? (this.rng() < 0.7 ? 4 : 3) : (this.rng() < 0.6 ? 4 : 6); // 楽節末の手前: 属（V/v/VII）か下属（IV）
      else if (posInSection === 7 || posInSection === 0) this.chord = 0; // 終止 → i
      else if (this.rng() < 0.15 + 0.85 * D) this.chord = pickWeighted(this.rng, T[this.chord]); // D が低いと和声が止まる
    }
    // 起伏: 区間ごとの強度の弧（導入 → 高揚 → 頂点 → 解放）＋ 区間内の小さな上昇
    const arc = [0.5, 0.75, 1.0, 0.65][section % 4];
    const intensity = arc * (0.88 + 0.12 * (posInSection / 7));
    return { bar, posInSection, section, chord: this.chord, intensity, mode };
  }
}

// ---------------------------------------------------------------------------------
// 図（figure）: 旋律
export class MelodyGen {
  constructor(rng) { this.rng = rng; this.cur = null; this.prevStep = 0; this.motifA = null; this.motifB = null; }

  // 安定度: 主音 1、和音構成音 0.75、音階音 0.35、それ以外 0
  stability(semi, chordPcs, steps = MINOR) {
    const pc = ((Math.round(semi) % 12) + 12) % 12;
    if (pc === 0) return 1;
    if (chordPcs.includes(pc)) return 0.75;
    if (steps.includes(pc)) return 0.35;
    return 0;
  }

  // 力の場から次の音を 1 つ選ぶ（ボルツマン分布からの標本）。strong: 強拍か。
  step(P, F, chordPcs, strong, cadence, dtBeats = 1, steps = MINOR) {
    const rng = this.rng, cur = this.cur;
    // 近接: 質量が大きい・弱いほど跳ばない。音の間隔が長いほど遠くまで動ける（÷√間隔）
    const wP = 0.32 * (0.6 + 0.9 * P.massNorm) * (1.35 - P.energyN) / Math.sqrt(Math.min(2, Math.max(0.5, dtBeats))); // 2 拍で頭打ち（遅い旋律も順次進行する）
    const wG = 0.10 * (1 - 1.6 * P.liftN);                              // 重力（上行のコスト。浮くと逆転）
    const wM = 2.4 * F.D;                                                // 磁力 = 離散化
    let best = [], Z = 0;
    for (let d = -9; d <= 9; d++) {
      const c = cur + d;
      let E = wP * Math.pow(Math.abs(d), 1.3) + wG * d;
      // 慣性: 小さな歩幅を同じ向きに続ける／跳躍の後は反対へ戻る（gap fill）
      if (Math.abs(this.prevStep) >= 1 && Math.abs(this.prevStep) <= 2 && Math.sign(d) === Math.sign(this.prevStep) && Math.abs(d) <= 2) E -= 0.55;
      if (Math.abs(this.prevStep) >= 5 && Math.sign(d) === -Math.sign(this.prevStep)) E -= 0.8;
      // 磁力: 安定音へ（強拍・終止で強く）。音階外は離散化の分だけ罰する
      const s = this.stability(c, chordPcs, steps);
      E -= wM * s * (strong ? 1.4 : 0.8) * (cadence ? 2.2 : 1);
      if (s === 0) E += 3 * F.D;
      if (cadence && ((Math.round(c) % 12) + 12) % 12 === 0) E -= 2.5 * F.D;
      // 音域への回帰
      E += 3.5 * Math.pow((c - F.center) / F.range, 2);
      if (d === 0) E += 0.35 * F.D;
      const w = Math.exp(-E / 0.55);
      best.push([c, w]); Z += w;
    }
    let r = rng() * Z, next = cur;
    for (const [c, w] of best) { r -= w; if (r <= 0) { next = c; break; } }
    this.prevStep = next - cur;
    this.cur = next;
    return next;
  }

  // 新しい動機のリズム（2 小節 = 16 個の 8 分音符の枠）。拍節の重みで打点を選ぶ。
  newRhythm(P, intensity) {
    const rng = this.rng;
    const metric = [1, 0.3, 0.6, 0.3, 0.8, 0.3, 0.6, 0.35, 0.9, 0.3, 0.6, 0.3, 0.75, 0.3, 0.5, 0.2];
    const n = Math.max(1, Math.min(13, Math.round(1.5 + 9.5 * P.density * (0.45 + 0.55 * P.energyN) * (0.6 + 0.4 * intensity))));
    const slots = metric.map((w, i) => [i, w * (0.4 + rng())]).sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]).sort((a, b) => a - b);
    if (rng() < 0.75 && !slots.includes(0)) slots[0] = 0;
    const uniq = [...new Set(slots)].sort((a, b) => a - b);
    return uniq.map((s, i) => {
      const next = i + 1 < uniq.length ? uniq[i + 1] : 15;
      return { at: s / 2, dur: Math.max(0.5, Math.min(4, (next - s) / 2)) }; // 拍単位
    });
  }

  // 2 小節ぶんの旋律。role: 'A' | "A'" | 'B' | "A''"
  phrase(P, F, bars, role) {
    const rng = this.rng;
    if (this.cur === null) this.cur = F.center + 3;
    let motif;
    const repeat = role !== 'B' && this.motifA && rng() < F.repeatProb;
    if (repeat) motif = this.motifA;
    else if (role === 'B' && this.motifB && rng() < F.repeatProb * 0.5) motif = this.motifB;
    else motif = { rhythm: this.newRhythm(P, bars[0].intensity), steps: null };

    const notes = [], steps = [];
    motif.rhythm.forEach((r, i) => {
      const barIdx = r.at < 4 ? 0 : 1, b = bars[barIdx];
      const scale = b.mode.steps;
      const pcs = chordTones(b.chord, P.dissonance, scale);
      const strong = r.at % 2 === 0;
      const last = i === motif.rhythm.length - 1;
      const cadence = last && b.posInSection === 7;
      let semi;
      if (motif.steps && i > 0 && !cadence) {
        // 反復: 同じ歩幅の列をなぞり、和音に合わせて最寄りの安定音へ寄せる（反復 + 変形）
        const target = this.cur + motif.steps[i];
        this.cur = target; semi = this.step(P, { ...F, center: target, range: 1.2 }, pcs, strong, false, 1, scale);
      } else semi = this.step(P, F, pcs, strong, cadence, i > 0 ? r.at - motif.rhythm[i - 1].at : 2, scale);
      steps.push(i === 0 ? 0 : semi - (notes[i - 1]?.semi ?? semi));
      notes.push({ at: r.at + 4 * 0, dur: r.dur * (last ? 1.6 : 1), semi, vel: strong ? 1 : 0.78 });
    });
    if (role === 'A' || !this.motifA) this.motifA = { rhythm: motif.rhythm, steps };
    if (role === 'B') this.motifB = { rhythm: motif.rhythm, steps };
    return notes;
  }
}

// ---------------------------------------------------------------------------------
// 地（ground）: 和声（バス + 声部進行する持続和音、密度が高いと分散和音）
export class HarmonyGen {
  constructor(rng) { this.rng = rng; this.voicing = null; this.arpIdx = 0; }

  bar(P, center, b) {
    const pcs = chordTones(b.chord, P.dissonance, b.mode.steps);
    const rootPc = pcs[0];
    // 声部進行: 前の和音から動きが最小になるよう各音のオクターブを選ぶ
    const targets = pcs.slice(0, 4);
    const prev = this.voicing || targets.map((pc) => center + pc);
    const voicing = targets.map((pc, i) => {
      const ref = prev[Math.min(i, prev.length - 1)];
      let best = pc, bd = Infinity;
      for (let o = -3; o <= 3; o++) { const c = pc + 12 * o + 12 * Math.round(center / 12); const d = Math.abs(c - ref); if (d < bd) { bd = d; best = c; } }
      return best;
    }).sort((a, b) => a - b);
    this.voicing = voicing;
    const bass = 12 * Math.floor((center - 12) / 12) + rootPc;
    const notes = [{ at: 0, dur: 4, semi: bass < center - 18 ? bass + 12 : bass, vel: 1, role: 'bass' }];
    if (P.density > 0.55) {
      // 分散和音: 8 分音符（密度が高いほど 16 分音符へ）
      const sub = P.density > 0.85 ? 4 : 2, n = 4 * sub;
      const order = [...voicing, ...voicing.slice(1, -1).reverse()];
      for (let i = 0; i < n; i++) notes.push({ at: i / sub, dur: 1.5 / sub * 2, semi: order[this.arpIdx++ % order.length] + 12, vel: i % sub === 0 ? 0.9 : 0.65, role: 'arp' });
    } else {
      for (const v of voicing) notes.push({ at: 0, dur: 4, semi: v, vel: 0.7, role: 'pad' });
    }
    return notes;
  }
}
