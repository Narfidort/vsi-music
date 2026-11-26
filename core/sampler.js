// 録音された実在の身体（v1.1, docs/06_review.md §7）。
// VSI: 仮想音源の推定にとって最も確かな手がかりは、実在の身体そのものの音。合成の物理モデル（v0〜v1）は
// 「全部シンセに聞こえる」と評価された。v1.1 では、身体の軸から相互作用（叩く・はじく・擦る・吹く）を決め、
// その中で実測した記述子（音域・明るさ・立ち上がり）が最も近い録音の楽器を選ぶ（対応表ではなく測定による選択）。
// 素材: VSCO-2 Community Edition（CC0）。tools/build_samples.py で assets/samples/ に整形・測定済み。

import { Biquad } from '../kernel/dsp.js';

// 環境に依存しない: カタログと録音の読み込みは外から差し込む（Node: tools/node_samples.js、ブラウザ: web の読み込み係）
let CATALOG = null, LOADER = null;
const CACHE = new Map();
export function setCatalog(cat) {
  CATALOG = cat;
  // 明るさ・立ち上がりは楽器全体の中の順位（0..1）に直す
  const ins = Object.values(CATALOG.instruments);
  const rank = (k) => { const v = ins.map((x) => x.desc[k]).sort((a, b) => a - b); for (const x of ins) x.desc[k + 'R'] = v.indexOf(x.desc[k]) / Math.max(1, v.length - 1); };
  rank('bright'); rank('attack');
}
// loader(file) → Float32Array（同期で読めるとき）または null（非同期で読み込み中。届いたら setBuffer）
export function setLoader(fn) { LOADER = fn; }
export function setBuffer(file, data) { CACHE.set(file, data); }
export function catalog() { return CATALOG; }
export function buffer(file) {
  if (CACHE.has(file)) return CACHE.get(file);
  const b = LOADER ? LOADER(file) : null;
  CACHE.set(file, b);
  return b;
}
export function forgetMissing() { for (const [k, v] of CACHE) if (!v) CACHE.delete(k); }

// 楽器の選択（ベイズ的な推定）: 事後 ∝ 尤度（身体の軸と楽器の物理的な性質の近さ）× 事前（その楽器の聞き慣れ）。
//   性質: hard = 撃つもの・擦るものの硬さ（角）、metal = 共鳴体の材質の明るさ（木 0 ↔ 金属 1）、size = 共鳴体の大きさ
//   事前: 作業用 BGM・映画音楽のコーパスでの出現の多さ（ピアノと弦楽合奏が圧倒的。docs/05_corpus.md）
//   音域: 録音の実測範囲（catalog.json）。外なら選ばない。中心から離れるほど少し不利
const ATTR = {
  piano:   { hard: 0.5, metal: 0.4, size: 0.6, prior: 0.5 },
  glock:   { hard: 0.8, metal: 1.0, size: 0.15, prior: 0.08 },
  xylo:    { hard: 0.9, metal: 0.0, size: 0.3, prior: 0.05 },
  marimba: { hard: 0.2, metal: 0.0, size: 0.5, prior: 0.08 },
  harp:    { hard: 0.3, metal: 0.4, size: 0.6, prior: 0.3 },
  vln_pizz: { hard: 0.6, metal: 0.4, size: 0.3, prior: 0.1 }, vc_pizz: { hard: 0.5, metal: 0.3, size: 0.65, prior: 0.1 },
  vln_sus: { hard: 0.3, metal: 0.6, size: 0.3, prior: 0.4 }, vla_sus: { hard: 0.3, metal: 0.5, size: 0.45, prior: 0.25 },
  vc_sus:  { hard: 0.3, metal: 0.4, size: 0.65, prior: 0.4 }, cb_sus: { hard: 0.3, metal: 0.3, size: 0.85, prior: 0.2 },
  solo_vln: { hard: 0.4, metal: 0.7, size: 0.25, prior: 0.15 },
  vln_spic: { hard: 0.7, metal: 0.6, size: 0.3, prior: 0.15 }, vc_spic: { hard: 0.7, metal: 0.4, size: 0.65, prior: 0.15 },
  vln_trem: { hard: 0.6, metal: 0.6, size: 0.3, prior: 0.15 }, vc_trem: { hard: 0.6, metal: 0.4, size: 0.65, prior: 0.15 },
  flute:   { hard: 0.1, metal: 0.9, size: 0.3, prior: 0.2 }, clarinet: { hard: 0.2, metal: 0.3, size: 0.45, prior: 0.15 },
  oboe:    { hard: 0.4, metal: 0.7, size: 0.35, prior: 0.1 }, bassoon: { hard: 0.3, metal: 0.3, size: 0.75, prior: 0.05 },
  horn:    { hard: 0.3, metal: 0.5, size: 0.8, prior: 0.15 },
  flute_stac: { hard: 0.5, metal: 0.9, size: 0.3, prior: 0.1 }, clar_stac: { hard: 0.5, metal: 0.3, size: 0.45, prior: 0.1 },
  // VCSL（各国の楽器）: 事前確率は低め。各国のマナー（core/manners.js）が好みを掛けたときに選ばれる
  dan_tranh: { hard: 0.5, metal: 0.6, size: 0.5, prior: 0.03 }, kalimba: { hard: 0.6, metal: 0.9, size: 0.2, prior: 0.03 },
  mbira: { hard: 0.6, metal: 0.85, size: 0.35, prior: 0.02 }, balafon: { hard: 0.6, metal: 0.0, size: 0.45, prior: 0.03 },
  ocarina: { hard: 0.1, metal: 0.4, size: 0.25, prior: 0.04 }, recorder: { hard: 0.2, metal: 0.5, size: 0.3, prior: 0.04 },
  harpsichord: { hard: 0.8, metal: 0.7, size: 0.55, prior: 0.05 }, folk_harp: { hard: 0.3, metal: 0.4, size: 0.5, prior: 0.05 },
  strumstick: { hard: 0.5, metal: 0.5, size: 0.4, prior: 0.03 }, vibraphone: { hard: 0.4, metal: 1.0, size: 0.4, prior: 0.06 },
  tubular_bells: { hard: 0.8, metal: 1.0, size: 0.7, prior: 0.02 }, organ: { hard: 0.2, metal: 0.5, size: 0.8, prior: 0.04 },
  glass: { hard: 0.1, metal: 1.0, size: 0.2, prior: 0.02 }, sax: { hard: 0.4, metal: 0.6, size: 0.55, prior: 0.04 },
};
// 相互作用の違い: 叩く ↔ はじく（どちらも撃つ）、擦る ↔ 吹く（どちらも持続）は小さく、撃つ ↔ 持続は大きい
function interactionCost(a, b) {
  if (a === b) return 0;
  const imp = (x) => x === 'struck' || x === 'plucked';
  return imp(a) === imp(b) ? 0.35 : 1.6;
}
export function chooseInstrument(interaction, artic, midi, body, priorMul = {}, nth = 0, allow = null, deny = []) {
  let ranked = rankInstruments(interaction, artic, midi, body, priorMul);
  const f = ranked.filter((n) => (!allow || allow.includes(n)) && !(deny || []).includes(n));
  if (f.length) ranked = f; // マナーの許可・禁止（何も残らなければ理論の選択）
  return ranked[Math.min(nth, ranked.length - 1)] ?? null;
}
export function rankInstruments(interaction, artic, midi, body, priorMul = {}) {
  const C = catalog(); if (!C) return [];
  const out = [];
  for (const [name, x] of Object.entries(C.instruments)) {
    const a = ATTR[name];
    if (!a) continue;
    const ic = interactionCost(x.interaction, interaction);
    if (ic > 1 && !(priorMul[name] > 1)) continue; // 撃つ ↔ 持続の取り違えは、マナーが望んだときだけ
    const d = x.desc;
    if (midi < d.lo - 1 || midi > d.hi + 1) continue;
    const like = 3 * ((a.hard - body.edge) ** 2 + (a.metal - body.bright) ** 2 + (a.size - body.size) ** 2)
      + ((midi - (d.lo + d.hi) / 2) / 24) ** 2 + (x.artic === artic ? 0 : 1.5) + ic;
    // 事前 = コーパスでの聞き慣れ（弱く）× マナーの好み（強く: 作品・文化の明確な意図）
    const s = like - 0.35 * Math.log(a.prior / 0.1) - 0.8 * Math.log(priorMul[name] ?? 1);
    out.push([s, name]);
  }
  return out.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

export class SampleVoice {
  constructor(sr) { this.sr = sr; this.active = false; this.lp = new Biquad(); }
  // note: { inst, freq, dur, gain, vel, release, cutoff }
  trigger(n) {
    const C = catalog(), ins = C.instruments[n.inst];
    const midi = 69 + 12 * Math.log2(n.freq / 440);
    // 強さの層が近く、音高が近い録音（移調は小さいほど自然）
    let best = null, bs = Infinity;
    for (const s of ins.notes) { const sc = Math.abs(s.midi - midi) + 6 * Math.abs(s.vel - n.vel); if (sc < bs) { bs = sc; best = s; } }
    this.buf = buffer(best.file);
    if (!this.buf) { this.active = false; return; } // まだ届いていない録音は鳴らさない
    this.pos = 0; this.rate = Math.pow(2, (midi - best.midi) / 12) * 48000 / this.sr;
    this.n = n; this.t = 0; this.active = true; this.sus = ins.artic === 'sus' || ins.artic === 'trem';
    this.loopA = Math.floor(this.buf.length * 0.35); this.loopB = Math.floor(this.buf.length * 0.85); this.xf = Math.floor(0.25 * 48000);
    this.lp.set('lp', Math.min(this.sr * 0.45, n.cutoff || 20000), 0.7, this.sr);
  }
  tick() {
    if (!this.active) return 0;
    const b = this.buf, n = this.n;
    let p = this.pos;
    // 持続音が録音より長いときは、後半を交差フェードでループする
    if (this.sus && n.dur * 48000 > b.length * 0.8 && p >= this.loopB) p = this.pos = this.loopA + (p - this.loopB);
    const i = p | 0;
    if (i + 1 >= b.length) { this.active = false; return 0; }
    let y = b[i] + (b[i + 1] - b[i]) * (p - i);
    if (this.sus && n.dur * 48000 > b.length * 0.8 && p > this.loopB - this.xf) {
      const q = this.loopA + (p - (this.loopB - this.xf)), j = q | 0, w = (p - (this.loopB - this.xf)) / this.xf;
      y = y * (1 - w) + (b[j] + (b[j + 1] - b[j]) * (q - j)) * w;
    }
    this.pos += this.rate;
    let env = 1;
    if (this.t > n.dur) { env = Math.exp(-(this.t - n.dur) / n.release); if (env < 1e-3) { this.active = false; return 0; } }
    this.t += 1 / this.sr;
    return this.lp.tick(y) * env * n.gain;
  }
}

// 音高のない打楽器・効果音の録音
export class PercSample {
  constructor(sr) { this.sr = sr; this.active = false; }
  trigger(name, gain, rate = 1, rng = Math.random) {
    const C = catalog(), lst = C?.perc[name]; if (!lst) return;
    this.buf = buffer(lst[Math.floor(rng() * lst.length)].file); if (!this.buf) return; this.pos = 0; this.rate = rate * 48000 / this.sr; this.gain = gain; this.active = true;
  }
  tick() {
    if (!this.active) return 0;
    const i = this.pos | 0; if (i + 1 >= this.buf.length) { this.active = false; return 0; }
    const y = this.buf[i] + (this.buf[i + 1] - this.buf[i]) * (this.pos - i); this.pos += this.rate; return y * this.gain;
  }
}
