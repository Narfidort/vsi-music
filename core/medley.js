// 無限メドレー: 主題 × 場面 × 様式を、自動で次々に組み替える。
// 急な切り替えを避ける（評価: 「きらきら星 × ポップ・はしゃぐは急すぎ」）:
//   ・一度に変えるのは 1 つだけ（主題か、場面の 1 語（場所か気持ち）か）
//   ・場面は、快・覚醒・支配と世界（距離・広がり・水）が近い候補から選ぶ
//   ・様式は、主題に似合う様式があればそれ、なければときどき（4 回に 1 回くらい）
//   ・最近使った組み合わせは避ける
import { THEMES } from './themes.js';
import { EMOTIONS, SCENES } from './lexicon.js';
import { MANNERS } from './manners.js';

const SAFE_MANNERS = ['ケルト', 'バロック', '和', 'ジャズ', '夢', '民謡'].filter((m) => MANNERS[m]);
const split = (s) => { const [a, b] = String(s).split('・'); return SCENES[a] ? [a, EMOTIONS[b] ? b : SCENES[a].mood] : [null, a]; };
function features(scene) {
  const [pl, em] = split(scene), e = EMOTIONS[em] || [0.3, 0.4, 0.5], w = SCENES[pl] || { distance: 0.3, space: 0.45, medium: 0 };
  return [e[0], e[1], e[2], w.distance, w.space, w.medium];
}
function dist(a, b) { const W = [2, 1.5, 0.5, 0.7, 0.7, 0.9]; return a.reduce((s, x, i) => s + W[i] * Math.abs(x - b[i]), 0); }

export class Medley {
  constructor(rng = Math.random, { themes = THEMES } = {}) {
    this.rng = rng; this.themes = themes; this.recent = []; this.k = 0;
    const names = Object.keys(themes);
    this.theme = names[Math.floor(rng() * names.length)];
    this.scene = themes[this.theme].scene || '草原・穏やか';
    this.manner = themes[this.theme].manner || null;
  }
  current() { return { theme: this.theme, themeDef: this.themes[this.theme], scene: this.scene, manner: this.manner, change: 'start' }; }
  next() {
    this.k++;
    const rng = this.rng, names = Object.keys(this.themes);
    let change;
    if (this.k % 3 === 0) {
      // 主題を替える（場面はそのまま）。主題に似合う様式があれば一緒に
      const cand = names.filter((n) => n !== this.theme && !this.recent.slice(-3).includes(n));
      this.theme = cand[Math.floor(rng() * cand.length)] || names[0];
      this.manner = this.themes[this.theme].manner || null; // 主題に似合う様式、なければ様式なし
      change = 'theme';
    } else {
      // 場面の 1 語を替える（場所か気持ち）。近い候補から
      const [pl, em] = split(this.scene), f0 = features(this.scene);
      const cands = [];
      if (rng() < 0.5 && pl) for (const s of Object.keys(SCENES)) { if (s !== pl) cands.push(`${s}・${em}`); }
      else for (const e of Object.keys(EMOTIONS)) { if (e !== em) cands.push(pl ? `${pl}・${e}` : e); }
      const scored = cands.filter((c) => !this.recent.includes(c)).map((c) => [c, dist(f0, features(c)) + 0.3 * rng()]).sort((a, b) => a[1] - b[1]);
      this.scene = (scored[Math.floor(rng() * Math.min(4, scored.length))] || [this.scene])[0];
      change = 'scene';
      if (this.k % 4 === 0 && !this.themes[this.theme].manner) { this.manner = rng() < 0.5 ? null : SAFE_MANNERS[Math.floor(rng() * SAFE_MANNERS.length)]; change = 'scene+manner'; }
    }
    this.recent.push(change === 'theme' ? this.theme : this.scene); if (this.recent.length > 8) this.recent.shift();
    return { theme: this.theme, themeDef: this.themes[this.theme], scene: this.scene, manner: this.manner, change };
  }
}
