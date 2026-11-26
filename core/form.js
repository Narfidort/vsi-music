// 無限に続く形式（docs/07_interface.md）。
// 評価: 1〜1.5 分で一周した感じがして飽きる。よい曲は熱さと静けさを鋭く切り替える。
// 区間の種類（強度の型）:
//   静   … 落ち着き。旋律は控えめ
//   溜め … 強度が小節ごとに上がる。最後に盛り上げ（フィル・上昇音）
//   熱   … 頂点。主題（動機 A）を最も強く
//   間   … ほぼ無音。伴奏のごく一部と環境音だけ（熱の直後の落差、熱の直前の吸気）
// 遷移はマルコフ連鎖。激しさ（利用者・ゲームの intensity）と鋭さ（contrast）で偏る。
// 長く聴いても変わり続けるもの: 動機の発展、進行の交代、転調、旋律の楽器の交代。

export const SECTION_TYPES = {
  静: { I: (b, n) => 0.45, bars: [8, 16], melody: true },
  溜め: { I: (b, n) => 0.55 + 0.4 * (b / Math.max(1, n - 1)), bars: [8], melody: true },
  熱: { I: (b, n) => 1.0, bars: [8, 16], melody: true },
  間: { I: (b, n) => 0.22, bars: [4], melody: false },
};

const BASE = {
  start: { 間: 0.5, 静: 0.5 },
  静: { 静: 0.2, 溜め: 0.5, 熱: 0.1, 間: 0.2 },
  溜め: { 熱: 0.85, 静: 0.1, 間: 0.05 },
  熱: { 熱: 0.25, 間: 0.35, 静: 0.4 },
  間: { 熱: 0.45, 静: 0.4, 溜め: 0.15 },
};

export class FormPlanner {
  constructor(rng) { this.rng = rng; this.prev = 'start'; this.hot = 0; this.n = 0; this.key = 0; this.forced = []; }
  // 区間を予約する（先頭から順に使う）。extra は計画にそのまま入る（bridge など）
  force(type, bars, extra = {}) { this.forced.push({ type, bars, extra }); }
  forceNow(type, bars, extra = {}) { this.forced = [{ type, bars, extra }]; }
  // userI: 0..1（0.5 が中立）、contrast: 0..1（大きいほど熱の後に間へ落としやすい）
  // 次の区間を先に決めておく（リタルダンドを掛けるか判断するため）。強制の予約があればそれが次
  peekCalm() { const t = this.forced.length ? this.forced[0].type : this.prev === '熱' ? this._peek ??= this.draw(0.5, 0.6) : null; return t === '静' || t === '間'; }
  draw(userI, contrast) {
    const w = { ...BASE[this.prev] };
    for (const k of Object.keys(w)) w[k] *= k === '熱' || k === '溜め' ? 0.3 + 1.4 * userI : 1.7 - 1.4 * userI;
    if (this.prev === '熱') { w.間 *= 0.4 + 1.6 * contrast; w.静 *= 1.4 - contrast; }
    let r = this.rng() * Object.values(w).reduce((a, b) => a + b, 0);
    return Object.keys(w).find((k) => (r -= w[k]) <= 0) || '静';
  }
  next(userI = 0.5, contrast = 0.6) {
    let type, bars, extra = {};
    if (this.forced.length) ({ type, bars, extra } = this.forced.shift());
    else {
      type = this._peek ?? this.draw(userI, contrast); this._peek = undefined;
      const B = SECTION_TYPES[type].bars; bars = B[Math.floor(this.rng() * B.length)];
    }
    // 変化の計画
    const plan = { ...SECTION_TYPES[type], type, bars, n: this.n++, ...extra };
    if (type === '熱') {
      this.hot++;
      plan.motif = 'A'; plan.ornament = this.hot > 1; plan.prog = 0; plan.lift = 1;
      // 3 回目以降の熱では全音上げる（ラスサビ転調）。上げすぎたら戻す
      if (this.hot % 3 === 0) this.key = this.key >= 4 ? 0 : this.key + 2;
    } else if (type === '溜め') { plan.motif = 'B'; plan.prog = this.rng() < 0.5 ? 0 : 1; plan.lift = 0; }
    else if (type === '静') {
      plan.motif = this.rng() < 0.5 ? 'A' : 'B'; plan.prog = 1; plan.lift = -1;
      plan.develop = this.prev === '熱' && this.rng() < 0.5; // 熱の後の静で動機を発展させる
    } else { plan.prog = 0; }
    plan.key = this.key;
    plan.rotate = this.n % 3; // 旋律の楽器の交代（候補の何番目を使うか）
    this.prev = type;
    return plan;
  }
}
