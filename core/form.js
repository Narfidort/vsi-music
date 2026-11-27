// 楽式（v1.5）: J-POP の文法で、1 曲の中に緩急をつける。docs/08_api.md
// 評価: 「盛り上がりと静けさのつなぎが不自然。違う曲を切り替えて流しているように聞こえる」。
// v1.4 までの原因: 区間の型（静・溜め・熱・間）を確率で選び、区間ごとに進行・旋律の楽器まで入れ替えていた。
// v1.5: 実在の曲は「同じ曲であること（調・テンポ・楽器・動機・進行の系統）」を保ったまま、編曲の厚みで緩急をつけ、
//   A メロ → B メロ（溜め）→ サビ の順序と、つなぎの手法（フィル・直前のブレイク・盛り上げ）で切り替える。
//
// 区間の型（エンジンが見る大分類）と役割（曲の中での位置）:
//   静 = A メロ・落ちサビ、溜め = B メロ（強度が上がっていく）、熱 = サビ・大サビ、間 = イントロ・間奏・アウトロ（旋律なし）
// 1 曲が終わると、同じ情景のまま新しい曲（新しい動機・進行の組）に入る（無限に続く）。
//
// v1.5.1 強度の形（評価者の言葉: Orangestar「Surge」「Encounter」のように）:
//   静けさを基準に、勢いを溜めて溜めて突破し、フィーバーで燃え尽きて、シュンと基準へ戻って引いた感じで奏でる。
//   = 緩和振動（溜めては一気に放つ）。
//   基準（A メロ・落ちサビ・間奏）= 低い一定の強度（A の後半だけわずかに上向く）
//   溜め（B メロ）= 加速する曲線で上がる（最初はゆっくり、最後に急に）
//   フィーバー（サビ）= 突破して全部の層、サビの中でもさらに燃え上がる
//   燃え尽き = サビの後は徐々に下げず、すぐ基準へ。最初の 2 小節は残響を深くして余韻（引いた感じ）

export const SECTION_TYPES = {
  静: { I: (b, n) => 0.38 + 0.07 * Math.max(0, (b - n / 2) / (n / 2)), bars: [8, 16], melody: true }, // 基準。後半だけわずかに上向く
  溜め: { I: (b, n) => 0.45 + 0.5 * Math.pow(b / Math.max(1, n - 1), 1.6), bars: [8], melody: true }, // 加速して溜める
  熱: { I: (b, n) => 1.0 + 0.1 * (b / Math.max(1, n - 1)), bars: [16], melody: true },              // 突破して燃え上がる
  間: { I: () => 0.36, bars: [4, 8], melody: false },
};

// 役割: [型, 小節, 強度（null = 型の既定）, 動機, 進行の役割, 旋律の音域の上げ, その他]
const ROLES = {
  イントロ: ['間', 4, 0.42, null, 'S', 0, {}],
  A: ['静', 16, null, 'A', 'A', 0, {}],
  B: ['溜め', 8, null, 'B', 'B', 1, { fill: true }],            // 最後の小節でフィルとブレイク → サビ
  サビ: ['熱', 16, null, 'S', 'S', 2, { crash: true }],
  間奏: ['間', 8, 0.36, null, 'S', 0, {}],
  落ちサビ: ['静', 8, 0.36, 'S', 'S', 1, { sparse: true, fill: true }], // 伴奏を薄く。最後でフィル → 大サビ
  大サビ: ['熱', 16, null, 'S', 'S', 2, { crash: true, modulate: true, ornament: true }],
  アウトロ: ['間', 4, 0.35, null, 'S', 0, {}],
};
const SONG = ['イントロ', 'A', 'B', 'サビ', '間奏', 'A', 'B', 'サビ', '落ちサビ', '大サビ', 'アウトロ'];

export class FormPlanner {
  constructor(rng) { this.rng = rng; this.i = 0; this.n = 0; this.key = 0; this.hot = 0; this.forced = []; this.songNo = 0; this.prev = null; }
  // 区間を予約する（先頭から順に使う）。extra は計画にそのまま入る（bridge など）
  force(type, bars, extra = {}) { this.forced.push({ type, bars, extra }); }
  forceNow(type, bars, extra = {}) { this.forced = [{ type, bars, extra }]; }
  // 状況が大きく変わったら、新しい曲として A メロから（イントロは省く）
  restart(role = 'A') { this.i = Math.max(0, SONG.indexOf(role)); this.newSong = true; }
  peekRole() { return this.forced.length ? null : SONG[this.i % SONG.length]; }
  // 次が静かな区間か（リタルダンドの判断）
  peekCalm() {
    if (this.forced.length) return this.forced[0].type === '静' || this.forced[0].type === '間';
    const r = ROLES[this.peekRole()]; return r[0] === '静' || r[0] === '間';
  }
  next(userI = 0.5) {
    let plan;
    if (this.forced.length) {
      const { type, bars, extra } = this.forced.shift();
      // 強制の区間にも役割を持たせる（合図の熱 = サビ、静 = A、溜め = B、間 = 間奏）
      const role = extra.role || { 熱: 'サビ', 静: 'A', 溜め: 'B', 間: '間奏' }[type];
      plan = this.fromRole(role, { bars, ...extra, type });
      // 合図でサビに飛んだら、曲の続きはサビの後から
      if (role === 'サビ') this.i = SONG.indexOf('間奏');
    } else {
      if (this.i >= SONG.length) { this.i = 0; this.newSong = true; }
      plan = this.fromRole(SONG[this.i++], {});
    }
    if (this.newSong || this.n === 0) { plan.newSong = true; this.newSong = false; this.songNo++; this.key = 0; }
    plan.n = this.n++;
    // 激しさ: 高いと A メロを短く、低いと A メロ・間奏を長く
    if (plan.role === 'A' && !plan.forcedBars) plan.bars = userI > 0.65 ? 8 : 16;
    if (plan.role === '間奏' && !plan.forcedBars) plan.bars = userI < 0.35 ? 8 : 4;
    plan.key = plan.modulate ? this.key + (this.modAmount || 2) : this.key; // 大サビだけ転調
    plan.afterglow = this.prev === '熱' && plan.type !== '熱'; // フィーバーの直後 = 余韻
    this.prev = plan.type;
    return plan;
  }
  fromRole(role, over) {
    const [type0, bars, I, motif, progRole, lift, extra] = ROLES[role];
    const type = over.type || type0, base = SECTION_TYPES[type];
    return {
      ...base, ...extra, role, type, bars: over.bars ?? bars, forcedBars: over.bars !== undefined, motif, progRole, lift,
      I: I === null || over.type && over.type !== type0 ? base.I : () => I, ...over, type, melody: type !== '間' && !!motif,
    };
  }
}
