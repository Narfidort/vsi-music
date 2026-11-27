// カーネル v1（docs/06_review.md §4）。
// 意味座標（領域の中心）→ 歩容・和声進行・楽式（理論）→ 1 小節ずつ予定 → 音源（物理）。
// 残したもの: 音源と世界の物理（kernel/physics.js, voice.js, pluck.js, dsp.js）。
// 作り直したもの: 意味から音楽構造への写像（theory.js, melody.js, accomp.js）、粒の層、電子音源・打楽器。

import { clampLatent, mergeLatent, WORLD_AXES, BODY_AXES, LAYERS } from '../kernel/space.js';
import { derive, TONIC } from '../kernel/physics.js';
import { mulberry32, Biquad, FDN } from '../kernel/dsp.js';
import { VoicePool } from '../kernel/voice.js';
import { Pluck } from '../kernel/pluck.js';
import { Synth } from './synth.js';
import { Drums } from './drums.js';
import { Texture } from './texture.js';
import { FormPlanner } from './form.js';
import { motifFromStyle, motifFromTheme, themeProgression, parseThemeMelody } from './style.js';
import { normalizeManner, choose } from './manner.js';
import { PROGRESSIONS, GAITS, WORLD_SCALES, scaleProgression, rankGaits, motionOf, gaitOf, tempoOf, harmonyTarget, rankProgressions, phraseChords, chordPcs } from './theory.js';
import { makeMotif, phrase, themePhrase, chordScale, degSemi, melodyAxes, setMelodyModel } from './melody.js';
import MELODY_MODEL from './data/melody_model.js';
setMelodyModel(MELODY_MODEL); // 伝統の旋律から学んだ統計（なければ v1 の固定の型）
import { accompany, voiceChord } from './accomp.js';
import { catalog, chooseInstrument, SampleVoice, PercSample } from './sampler.js';
import { SELayer } from './se.js';

// テンポの乗り換え: 拍の格子が揃う比（1/2, 2/3, 3/4, 1, 4/3, 3/2, 2）のうち目標に最も近いもの。12% 以内ならそれを使う
export function alignTempo(cur, target) { return tempoPlan(cur, target).bpm; }
// テンポの乗り換え方: aligned = 拍が揃う比で即座に切り替え可能、ramp = 差が小さいので寄せる、cut = 間・溜めの後で切り替える
export function tempoPlan(cur, target) {
  let best = target, bd = Infinity;
  for (const r of [0.5, 2 / 3, 0.75, 1, 4 / 3, 1.5, 2]) { const c = cur * r, d = Math.abs(Math.log(c / target)); if (d < bd) { bd = d; best = c; } }
  if (bd < Math.log(1.12)) return { bpm: best, how: Math.abs(Math.log(best / cur)) < 1e-6 ? 'same' : 'aligned' };
  if (Math.abs(Math.log(target / cur)) < Math.log(1.15)) return { bpm: target, how: 'ramp' };
  return { bpm: target, how: 'cut' };
}

const WK = Object.keys(WORLD_AXES), BK = Object.keys(BODY_AXES), MK = ['rep', 'q', 'n', 'long', 'ri'];
const VKEY = Object.fromEntries(LAYERS.map((l) => [l, Object.fromEntries([...BK.map((k) => [k, l + '.' + k]), ...MK.map((k) => ['m.' + k, l + '.m.' + k])])]));

function gauss(rng) { const u = Math.max(1e-9, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// 楽器 = 相互作用 × 共鳴体（v0.4 の原則を継承）。D ≥ 0.95（人の揺らぎがない = 機械の演奏）では電子音源
export function instrOf(role, b, D) {
  if (D >= 0.95) return { bass: 'saw', pad: 'super', stab: 'super', chord: 'super', arp: 'modal', melody: 'square' }[role];
  if (b.voice > 0.5) return 'voice';
  const m = b.morph, impulsive = m.n + m.q + m.rep, sustained = m.long + m.ri, struck = m.n + m.q >= m.rep;
  if (role === 'bass') return sustained > impulsive ? 'bow' : struck ? 'modal' : 'pluck';
  if (role === 'pad') return sustained > impulsive ? 'bow' : 'modal';
  if (role === 'chord' || role === 'arp' || role === 'stab') return struck || (b.edge > 0.6 && b.bright > 0.6) ? 'modal' : 'pluck';
  if (sustained > impulsive) return b.bright > 0.6 && b.rough < 0.3 ? 'blow' : 'bow';
  return struck || b.bright > 0.7 || b.edge > 0.55 ? 'modal' : 'pluck';
}

// v1.1: 相互作用（叩く・はじく・擦る・吹く）と奏法を身体の軸から決め、録音の楽器は測定した記述子で選ぶ（sampler.js）
export function interactionOf(role, b, D) {
  if (D >= 0.95 && role !== 'arp' && role !== 'melody') return { synth: { bass: 'saw', pad: 'super', stab: 'super', chord: 'super' }[role] };
  const m = b.morph, imp = m.n + m.q + m.rep, sus = m.long + m.ri, struck = m.n + m.q >= m.rep;
  const trem = b.rough * b.energy > 0.45, short = m.q > 0.45;
  if (D >= 0.95) return { inter: 'struck', artic: 'ring' }; // 機械の演奏の旋律・分散和音 = 小さな打鍵・鍵盤打楽器
  if (role === 'trem') return { inter: 'bowed', artic: 'trem' };
  if (role === 'pad') return imp > 1.5 * sus ? { inter: 'struck', artic: 'ring' } : { inter: 'bowed', artic: trem ? 'trem' : 'sus' };
  if (role === 'bass') return sus > imp ? { inter: 'bowed', artic: 'sus' } : struck ? { inter: 'struck', artic: 'ring' } : { inter: 'plucked', artic: 'ring' };
  if (role !== 'melody') return struck ? { inter: 'struck', artic: 'ring' } : { inter: 'plucked', artic: short ? 'short' : 'ring' };
  if (sus > imp) return { inter: b.bright > 0.6 && b.rough < 0.3 ? 'blown' : 'bowed', artic: 'sus' };
  return struck ? { inter: 'struck', artic: 'ring' } : { inter: 'plucked', artic: short ? 'short' : 'ring' };
}

const SYNTH = {
  saw: (b) => ({ wave: 'saw', cutoff: 250 + 900 * b.bright, envAmt: 3, fdec: 0.08, attack: 0.003, decay: 0.15, sustain: 0.6, release: 0.05 }),
  super: (b, role) => role === 'pad'
    ? { wave: 'super', cutoff: 900 * Math.pow(2, b.bright), envAmt: 0.4, fdec: 0.6, attack: 0.08, decay: 0.6, sustain: 0.8, release: 0.3 }
    : { wave: 'super', cutoff: 1800 * Math.pow(2, b.bright), envAmt: 2, fdec: 0.1, attack: 0.002, decay: 0.15, sustain: 0.35, release: 0.12 },
  sine: () => ({ wave: 'sine', cutoff: 2000, envAmt: 0, fdec: 1, attack: 0.004, decay: 0.3, sustain: 0.8, release: 0.06 }),
  square: (b) => ({ wave: 'square', cutoff: 3000 * Math.pow(2, b.bright), envAmt: 1, fdec: 0.2, attack: 0.003, decay: 0.2, sustain: 0.7, release: 0.06 }),
};

class Pool {
  constructor(n, sr, rng) {
    this.voices = new VoicePool(n, sr, rng);
    this.plucks = Array.from({ length: n }, () => new Pluck(sr, rng));
    this.synths = Array.from({ length: n }, () => new Synth(sr, rng)); this.k = 0;
    this.samples = Array.from({ length: n }, () => new SampleVoice(sr));
  }
  grab(arr) { let x = arr.find((v) => !v.active); if (!x) { x = arr[this.k % arr.length]; this.k++; } return x; }
  trigger(note, P) {
    if (note.inst) this.grab(this.samples).trigger(note);
    else if (note.instr === 'pluck') this.grab(this.plucks).trigger(note, P);
    else if (SYNTH[note.instr]) this.grab(this.synths).trigger(note);
    else this.voices.trigger(note, P);
  }
  tick(P) {
    let s = this.voices.tick(P);
    for (const p of this.plucks) if (p.active) s += p.tick(P);
    for (const p of this.synths) if (p.active) s += p.tick();
    for (const p of this.samples) if (p.active) s += p.tick();
    return s;
  }
}

const ROLE_GAIN = { bass: 0.45, pad: 0.16, chord: 0.2, stab: 0.16, arp: 0.4, melody: 1.0, trem: 0.14 };

export class Engine {
  constructor({ sampleRate = 48000, seed = 1, latent = {}, style = {} } = {}) {
    this.sr = sampleRate; this.seed = seed;
    this.rng = mulberry32(seed);
    this.target = clampLatent(latent); this.z = clampLatent(latent); this.P = derive(this.z);
    this.ground = new Pool(48, this.sr, this.rng); this.figure = new Pool(12, this.sr, this.rng);
    this.drums = new Drums(this.sr, this.rng); this.texture = new Texture(this.sr, this.rng); this.se = new SELayer(this.sr, this.rng);
    this.lp1 = new Biquad(); this.lp2 = new Biquad(); this.hp = new Biquad(); this.hp.set('hp', 30, 0.7, this.sr);
    this.rev = new FDN(this.sr); this.revOut = [0, 0];
    // 時間は拍で数える（beatNow）。音符は拍で予定し、テンポの曲線で秒に写す（テンポを連続的に変えられる）
    this.beatNow = 0; this.barStartBeat = 0; this.nextBarBeat = 0.1; this.tempoPlan = null;
    this.time = 0; this.nextBarAt = 0.05; this.barStart = 0; this.beat = 0.5; this.queue = []; this.ctr = 0; this.listeners = [];
    this.secBar = 0; this.cycle = 0; this.prevV = null; this.master = 0.6; this.firstSection = true; this.compEnv = 0; this.gE = 0; this.fE = 0; this.figGain = 0.6;
    // 適応・手動の口（core/api.js）から操作される状態
    this.style = normalizeManner(style); // スタイルマナー（core/manner.js）
    this.planner = new FormPlanner(mulberry32(seed * 31 + 7));
    this.userI = 0.5; this.contrast = 0.6; this.key = 0;
    this.overrides = {};          // { gait, bpm, key, progression }（手動で固定した理論の決定）
    this.applyWorld();
  }
  set(patch) { this.target = mergeLatent(this.target, patch); }
  onEvent(fn) { this.listeners.push(fn); }
  emit(e) { for (const f of this.listeners) f(e); }
  applyWorld() {
    const W = this.P.world;
    this.lp1.set('lp', W.lowpass, 0.6, this.sr); this.lp2.set('lp', W.lowpass * 1.2, 0.6, this.sr);
    const gk = this.glow ? Math.max(0, 1 - (this.beatNow - this.glow.from) / this.glow.len) : 0;
    this.glowK = gk;
    this.rev.set(W.rt60 * (1 + 1.2 * gk), 1.7, 0.2 + 0.6 * Math.max(W.medium, W.distance * 0.7)); // 遅延線の長さは固定（kernel/dsp.js の FDN.set）
  }
  // 意味座標の補間: 臨界減衰のばね（2 次）。動き出しと到着で速度が 0 になる S 字の曲線で、途中で目標が変わっても
  // 速度が連続する（折れ目がない）。所要時間 morphTime は、構造の切り替え（着地）の時刻に合わせて決める（requestChange）。
  // v1.1 までは 1 次の指数平滑（時定数 0.4 秒）で、指示の瞬間に急に動き出し、構造の切り替えより 10〜20 秒早く着いていた。
  smoothLatent(dt) {
    const w = 6 / Math.max(0.3, this.morphTime || 1.5); // ωT = 6 で 98% に到達
    const V = (this.vel ||= { morph: {} });
    const step = (obj, tgt, key, vkey) => {
      const v = V[vkey] || 0;
      const acc = w * w * (tgt[key] - obj[key]) - 2 * w * v;
      const nv = v + acc * dt; V[vkey] = nv; obj[key] += nv * dt;
    };
    for (const k of WK) step(this.z, this.target, k, k);
    for (const l of LAYERS) {
      const z = this.z[l], t = this.target[l];
      for (const k of BK) step(z, t, k, VKEY[l][k]);
      for (const k of MK) { step(z.morph, t.morph, k, VKEY[l]['m.' + k]); if (z.morph[k] < 0) z.morph[k] = 0; }
    }
    // 物理の導出は新しいオブジェクトを作るので、8 ブロック（約 21 ms）ごとに（実時間でのごみ集めを減らす）
    if ((this._dctr = (this._dctr || 0) + 1) % 8 === 0 || !this.P) this.P = derive(this.z);
  }
  // 補間の所要時間を決める。進行中の切り替えより早く終わらせない（信号の小さな変化で情景の移行を急がせない）
  setMorph(sec) { const left = (this.morphUntil || 0) - this.time; this.morphTime = Math.max(sec, left); this.morphUntil = this.time + this.morphTime; }

  // 区間の頭: 形式の計画（無限のマルコフ連鎖）と、意味座標から歩容・テンポ・進行・動機を導く
  startSection() {
    const m = motionOf(this.z), O = this.overrides;
    const sec = this.plan = this.planner.next(this.userI);
    // 橋渡しの区間は古い歩容のまま（音色・密度は先に新しい情景へ動いている = 縦の重ね替え → 横の並べ替え）
    // 着地の区間は、切り替えを決めた時点の歩容を使う（補間の途中の座標で選び直すと、決めたものと違う歩容に落ちることがある）
    const gait = sec.bridge && this.bridge ? this.bridge.gait : O.gait && GAITS[O.gait] ? O.gait : this.nextGait || this.pickGait(m);
    if (!sec.bridge) this.nextGait = null;
    const G = GAITS[gait];
    const S = G.beats * G.sub;
    // 曲の同一性（v1.5）: 動機・進行の組・楽器・調は曲の頭でだけ決め、1 曲の間は保つ
    // 曲の頭の判断（長調・短調、進行、動機）は、補間の途中の値ではなく、移っていく先の状況で行う
    if (sec.newSong || gait !== this.gait || !this.motifs || !this.song) this.startSong(gait, motionOf(clampLatent(this.target)), S);
    let target;
    if (O.bpm) target = O.bpm;
    else if (sec.bridge && this.bridge) target = sec.ramp ? this.bridge.to : this.baseBpm; // 橋渡しは元のテンポ（差が小さいときだけ寄せる）
    else if (this.nextBpm) { target = this.nextBpm; this.nextBpm = null; }
    // 同じ歩容のままなら目標のテンポそのもの（なめらかに寄せる）。歩容が変わるときだけ拍の揃う比に吸着させる
    else target = this.baseBpm && !this.firstSection && gait !== this.prevGaitForTempo ? alignTempo(this.baseBpm, this.tempoAdj(tempoOf(gait, m))) : this.tempoAdj(tempoOf(gait, m));
    const machine = (sec.bridge ? this.Dsec : this.target.D) >= 0.95;
    this.setTempo(target, { sec, gait, machine, mass: m.M, gaitChanged: gait !== this.prevGaitForTempo });
    this.prevGaitForTempo = gait;
    if (!sec.bridge) this.bridge = null;
    // 進行は曲の中の役割で（A メロ = 2 番目に合う進行、B メロ = サビの進行を途中から、サビ = 最も合う進行）
    this.prog = (O.progression && PROGRESSIONS.find((p) => p.name === O.progression)) || this.song.prog[sec.progRole || 'S'];
    // マナーの音階（各国）: 旋法的なドローン。ただし主題に和音進行があれば主題を優先（modal: true の主題は様式の音階に乗せる）
    const themeHarm = this.style.theme?.chords && !this.style.theme.modal;
    if (this.style.scale && WORLD_SCALES[this.style.scale] && !themeHarm) this.prog = scaleProgression(this.style.scale);
    this.key = O.key ?? sec.key;
    this.S = S; this.step = this.beat / G.sub;
    // 機械の演奏（電子音）かどうかは区間ごとに決める。橋渡しの間は古い区間のまま（音色の種類が構造より先に替わらない）
    if (!sec.bridge) this.Dsec = this.target.D;
    this.grief = m.grief; this.master = gait === '跳ねる' ? 0.25 : 0.6;
    this.amp = 0.4 + 0.6 * m.E; // 盛り上がりの振れ幅: 穏やかな場面ほど小さく
    if (sec.afterglow) { this.glow = { from: this.beatNow, len: 2 * G.beats }; this.figGain *= 0.6; } // 燃え尽きた直後の 2 小節: 残響を深く（引いた感じ）。旋律の釣り合いも先に下げる
    this.penta = gait === '跳ねる' && (this.prog.scale === 'major' || this.prog.scale === 'lydian');
    this.emit({ type: 'section', time: this.time, name: sec.type, role: sec.role, bars: sec.bars, gait, bpm: this.bpm, prog: this.prog.name, key: this.key, newSong: !!sec.newSong });
  }

  // 1 曲の頭: 3 つの動機（A メロ・B メロ・サビ）と進行の組、楽器を決める
  startSong(gait, m, S) {
    this.gait = gait; const rng = mulberry32(this.seed * 7919 + this.cycle++);
    const opt = this.motifOpts(gait, m), ax = opt.axes;
    const th = this.style.theme && this.style.theme.melody ? this.style.theme : null;
    this.themeBars = th ? parseThemeMelody(th.melody) : null; // テーマ: サビでそのまま、A メロはその頭 2 小節を展開
    const A = th ? motifFromTheme(th, S) : this.style.motif ? motifFromStyle(this.style.motif, S) : makeMotif(rng, gait, null, opt);
    const B = makeMotif(rng, gait, null, { ...opt, axes: { ...ax, density: ax.density + 0.05, contour: (ax.contour || 0) + 0.35 } }); // 上へ向かう溜め
    const Sx = this.style.motif || th ? A : makeMotif(rng, gait, null, { ...opt, axes: { ...ax, density: ax.density + 0.08, leap: ax.leap + 0.1, contour: (ax.contour || 0) + 0.15 } }); // サビのフック
    this.motifs = { A, B, S: Sx };
    const ranked = this.allowedProgressions(m), T = this.style.temperature || 0;
    // 曲ごとに進行の組を変える（上位 3 つの中で回す。同じ情景が続いても、次の曲は別の曲に聞こえる）
    const k = (this.planner.songNo - 1) % Math.min(3, ranked.length);
    const pS = T > 0 ? ranked.find((p) => p.name === choose(ranked.map((p, i) => [p.name, i * 0.15]), 'progressions', this.style, mulberry32((this.style.seed ?? this.seed) * 977 + this.cycle))) : ranked[Math.max(0, k)];
    const pA = ranked[(Math.max(0, k) + 1) % ranked.length] || pS;
    const rot = (p, k) => ({ ...p, name: `${p.name}（途中から）`, ch: [...p.ch.slice(k), ...p.ch.slice(0, k)] }); // 同じ系統で主和音以外から始まる = 溜め
    // テーマのコード進行があれば、それをサビの進行に（場面が短調なら同主短調へ写す）。B メロはその途中から
    const tp = this.style.theme?.chords ? themeProgression(this.style.theme, harmonyTarget(m).minor) : null;
    const pS2 = tp || pS;
    this.song = { prog: { S: pS2, A: tp ? pS : pA, B: rot(pS2, Math.min(2, pS2.ch.length - 1)) } };
    this.instCache = {}; this.planner.key = 0; this.planner.modAmount = rng() < 0.5 ? 1 : 2; // 大サビの転調の幅（曲ごと）
  }
  hasKit() { return ['駆ける', '行進', '跳ねる'].includes(this.gait); }

  // 役割の楽器を決める（区間ごとに固定。音域外の音だけ選び直す）。録音がなければ v1 の合成音源
  resolve(role, layer, midi) {
    const b = layer === 'ground' ? this.z.ground : this.z.figure, D = this.Dsec ?? this.P.world.D;
    const it = interactionOf(role, b, D);
    if (it.synth) return it.synth;
    if (!catalog()) return instrOf(role, b, D);
    const c = this.instCache[role], C = catalog().instruments;
    if (c && midi >= C[c].desc.lo - 3 && midi <= C[c].desc.hi + 3) return 'smp:' + c;
    if (role === 'melody' && this.gait === '行進' && catalog()?.instruments.horn) { (this.used ||= new Set()).add('melody=horn'); return 'smp:horn'; } // ファンファーレ = 合図の角笛（吹く）
    const nth = role === 'melody' && this.plan && this.plan.type !== '熱' ? this.plan.rotate % 2 : 0; // 旋律の楽器の交代
    const name = chooseInstrument(it.inter, it.artic, midi, b, this.style.instruments, nth, this.style.allow.instruments, this.style.deny.instruments);
    if (!name) return instrOf(role, b, D);
    if (!c) this.instCache[role] = name;
    (this.used ||= new Set()).add(role + '=' + name);
    return 'smp:' + name;
  }

  // 状況が変わったら、次の 4 小節の区切りで区間を切り替える（先に予定した旋律は捨てる）
  // テンポの変え方（身体の運動の周期として）:
  //   急に変えてよい: 動きが止まった後（間の後、合図、リタルダンドで終止した後）、拍の格子が揃う比（刻みが変わるだけ）、
  //                   機械の演奏（格子が固定）
  //   なめらかに: 同じ身体が動き続けるとき。重いほど長くかける（慣性）。S 字の曲線（対数テンポの smootherstep）
  setTempo(target, { sec, gait, machine, mass = 0.5, gaitChanged = false }) {
    const from = this.bpm, prevType = this.prevSecType;
    this.prevSecType = sec.type; this.baseBpm = target;
    if (!from || this.firstSection) { this.bpm = target; this.tempoPlan = null; this.beat = 60 / target; return; }
    const r = target / from;
    if (Math.abs(Math.log(r)) < 1e-4) { if (!this.tempoPlan) return; }
    const aligned = [0.5, 2 / 3, 0.75, 4 / 3, 1.5, 2].some((x) => Math.abs(Math.log(r / x)) < 0.01);
    const afterStop = prevType === '間' || this.afterCue || this.afterRit || sec.landing;
    this.afterCue = false; this.afterRit = false;
    // 別の身体に替わった（歩容が変わった）、または差が 25% 以上: 区間の頭の強拍で切り替える
    if (machine || aligned || afterStop || gaitChanged || Math.abs(Math.log(r)) > Math.log(1.25)) { this.bpm = target; this.beat = 60 / target; this.tempoPlan = null; return; }
    const beats = GAITS[gait].beats * (1 + 2 * mass);
    this.tempoPlan = { from, to: target, b0: this.beatNow, b1: this.beatNow + beats, shape: 's' };
  }
  // 旋律の軸（理論の既定 + マナーの melody）、長調か短調か、最近の動機の記憶
  motifOpts(gait, m) { return { axes: melodyAxes(gait, m, this.style.melody), mode: harmonyTarget(m).minor ? 'minor' : 'major', history: (this.motifHistory ||= []) }; }
  // マナーを掛けた選択
  pickGait(m) { return choose(rankGaits(m), 'gaits', this.style, null); }
  allowedProgressions(m) {
    const r = rankProgressions(harmonyTarget(m), this.style.prefer.progressions), al = this.style.allow.progressions, dn = this.style.deny.progressions || [];
    const f = r.filter((p) => (!al || al.includes(p.name)) && !dn.includes(p.name));
    return f.length ? f : r;
  }
  tempoAdj(bpm) { const t = this.style.tempo || {}; return Math.min(t.max ?? 400, Math.max(t.min ?? 20, bpm * (t.scale ?? 1))); }
  // 信号・手動の変化への即時の追従: 同じ歩容のままで差が 25% 未満なら、いますぐなめらかに寄せ始める
  retargetTempo() {
    if (!this.gait || this.overrides.bpm || (this.Dsec ?? 1) >= 0.95) return;
    const m = motionOf(clampLatent(this.target));
    if (this.pickGait(m) !== this.gait) return; // 歩容が変わるなら区間の頭で
    const to = this.tempoAdj(tempoOf(this.gait, m)), r = to / (this.baseBpm || to);
    if (Math.abs(Math.log(r)) < 0.01 || Math.abs(Math.log(r)) > Math.log(1.25)) return;
    this.baseBpm = to;
    this.tempoPlan = { from: this.bpm, to, b0: this.beatNow, b1: this.beatNow + GAITS[this.gait].beats * (1 + 2 * m.M), shape: 's' };
  }
  // 終止のリタルダンド: 走っている人が止まるときの減速（Friberg & Sundberg 1999）。v(x) = [1 + (w^q − 1)x]^(1/q)、q = 3
  // 熱から静・間へ落ちる前、静かな向きの切り替えの前の 1 小節。重い身体ほど深く減速する。機械の演奏ではしない
  ritardando(mass = 0.5) {
    if ((this.Dsec ?? this.P.world.D) >= 0.95) return;
    const w = 0.9 - 0.08 * mass;
    this.tempoPlan = { from: this.bpm, to: this.bpm * w, b0: this.beatNow, b1: this.beatNow + GAITS[this.gait].beats, shape: 'fs' };
    this.afterRit = true;
  }
  tempoTick() {
    const p = this.tempoPlan; if (!p) return;
    const x = Math.min(1, Math.max(0, (this.beatNow - p.b0) / (p.b1 - p.b0)));
    if (p.shape === 'fs') { const w = p.to / p.from, q = 3; this.bpm = p.from * Math.pow(1 + (Math.pow(w, q) - 1) * x, 1 / q); }
    else { const s = x * x * x * (x * (6 * x - 15) + 10); this.bpm = p.from * Math.pow(p.to / p.from, s); }
    this.beat = 60 / this.bpm; this.step = this.beat / GAITS[this.gait].sub;
    if (x >= 1 && p.shape !== 'fs') this.tempoPlan = null;
  }
  // 予定: 秒（この小節のテンポで計算した時刻）→ 拍
  toB(at) { return this.barStartBeat + (at - this.barStart) / this.beat; }
  enq(item, at) {
    item.b = this.toB(at);
    // 切り替え直後の 1 小節は、新しい区間を弱めに入れて立ち上げる（古い音の減衰と重なってクロスフェードになる）
    if (this.fadeIn && item.b < this.fadeIn.end) { const k = 0.35 + 0.65 * Math.max(0, (item.b - this.fadeIn.start) / (this.fadeIn.end - this.fadeIn.start)); if (item.note) item.note.gain *= k; else if (item.gain) item.gain *= k; }
    this.insertQ(item);
  }
  // クロスフェード: いま以降に予定済みの音を、旋律は 2 拍、伴奏は 1 小節かけて弱めて消す。新しい区間は弱めに入れて立ち上げる。
  // 切り替えを音（シンバル）で隠すのではなく、新旧を重ねて受け渡す
  crossfade() {
    const bar = GAITS[this.gait]?.beats || 4;
    for (const q of this.queue) if (q.b >= this.beatNow - 1e-6) { q.fadeFrom = this.beatNow; q.fadeLen = q.layer === 'figure' ? Math.min(2, bar) : bar; }
    this.fadeIn = { start: this.beatNow, end: this.beatNow + bar };
  }
  // 実時間用: 毎ブロックの並べ替えをやめ、拍の順に二分探索で挿入する
  insertQ(item) { const q = this.queue; let lo = 0, hi = q.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (q[mid].b <= item.b) lo = mid + 1; else hi = mid; } q.splice(lo, 0, item); }

  // 取引（トランザクション）: 状況の変化 1 回 = 1 つの取引。新しい取引が来たら古いものは「置き換え」になる（最新が勝つ）。
  // 着地（新しい状況の区間が始まる、または意味座標の補間が終わる）で { type: 'landed', tx } を出す
  openTx(id, plan, eta) {
    if (this.tx && !this.tx.landed) this.emit({ type: 'superseded', tx: this.tx.id, by: id, time: this.time });
    this.tx = { id, plan, eta, started: this.time, landed: false };
  }
  landTx() {
    if (!this.tx || this.tx.landed) return;
    this.tx.landed = true;
    this.emit({ type: 'landed', tx: this.tx.id, plan: this.tx.plan, after: this.time - this.tx.started, eta: this.tx.eta, time: this.time });
  }

  // 状況が変わった。変化の大きさと、待てる時間（within 秒）から切り替え方を決める:
  //   morph  … 歩容も進行も変わらない: 区間はそのまま、意味座標だけ S 字で動かす（構造の切り替えなし）
  //   pivot  … 進行・調が変わる（同じ歩容）: 4 小節の区切りでピボット和音を経て
  //   bridge … 歩容が変わる: 4 小節の区切り + 古い歩容の橋渡し（溜め / 間）
  //   quick  … 上の待ちが within を超える: 次の小節で切り替える（激しくなる向きは直接着地してシンバル、静かになる向きは 1 小節の間）
  // mode: 'auto'（既定）/ 'bar'（待ちを気にせず 4 小節の区切り）/ 'phrase'（楽節の終わり）
  requestChange(mode = 'auto', within = 4, txId = null) {
    const barDur = (this.S || 8) * (this.step || 0.25);
    const toNext = Math.max(0, (this.nextBarBeat - this.beatNow) * this.beat);
    const m = motionOf(clampLatent(this.target)), O = this.overrides;
    const newGait = O.gait && GAITS[O.gait] ? O.gait : this.pickGait(m);
    const gaitChange = !!this.gait && newGait !== this.gait;
    const progChange = !!this.prog && !!this.pivotChord();
    this.pendingDown = tempoOf(newGait, m) < (this.bpm || 0) * 0.95 || GAITS[newGait].proto.E < (GAITS[this.gait]?.proto.E ?? 0);
    let plan, eta;
    if (!this.plan || (!gaitChange && !progChange)) {
      plan = 'morph'; eta = Math.min(4, Math.max(1, within * 0.6));
      this.morphTime = eta; this.morphUntil = this.time + eta; this.pendingChange = false;
    } else {
      const unit = mode === 'phrase' ? 8 : 4;
      const waitBars = (unit - ((this.secBar % unit) || unit)) % unit;
      const slow = toNext + waitBars * barDur + (gaitChange ? this.bridgeBars() * barDur : 0);
      const quick = mode === 'auto' && slow > within;
      this.pendingChange = true; this.pendingMode = quick ? 'next' : mode === 'phrase' ? 'phrase' : 'bar'; this.pendingQuick = quick;
      plan = quick ? 'quick' : gaitChange ? 'bridge' : 'pivot';
      eta = quick ? toNext + (gaitChange && this.pendingDown ? barDur : 0) : slow;
      this.morphTime = Math.min(30, Math.max(1, eta + 0.3 * barDur)); this.morphUntil = this.time + this.morphTime;
    }
    this.openTx(txId ?? (this.tx?.id ?? 0) + 1, plan, eta);
    return { plan, eta };
  }
  // 橋渡しの長さ: 遅い曲（1 小節 2.5 秒以上）は 2 小節、それ以外は 4 小節（およそ 5〜10 秒に収める）
  bridgeBars() { return (this.S || 8) * (this.step || 0.25) > 2.5 ? 2 : 4; }

  // 切り替えの種類を、変化の大きさで決める（docs/07_interface.md「シームレスな切り替え」）
  //   同じ歩容 → そのまま次の区間へ（テンポは拍が揃う比で寄せる）
  //   歩容が変わる → 橋渡しの区間（激しくなるなら溜め、静かになるなら間）を古い歩容で 4 小節挟み、その間にテンポを寄せる
  beginTransition() {
    const t = clampLatent(this.target), m = motionOf(t), O = this.overrides;
    const newGait = O.gait && GAITS[O.gait] ? O.gait : this.pickGait(m);
    const tp = O.bpm ? { bpm: O.bpm, how: 'cut' } : tempoPlan(this.bpm, this.tempoAdj(tempoOf(newGait, m)));
    const to = tp.bpm;
    if (newGait !== this.gait && this.pendingQuick) {
      // 急ぐ切り替え: 激しくなる向きは次の小節にそのまま着地（シンバル）、静かになる向きは 1 小節の間（息）を挟む
      const up = GAITS[newGait].proto.E > GAITS[this.gait].proto.E;
      if (up) this.planner.forceNow('熱', 8, { landing: true });
      else { this.planner.forceNow('間', 1, { bridge: true }); this.planner.force('静', 8, { landing: true }); }
      this.upcoming = null; this.bridge = up ? null : { gait: this.gait, to }; this.nextBpm = to;
    } else if (newGait !== this.gait) {
      const up = GAITS[newGait].proto.E > GAITS[this.gait].proto.E;
      // 橋渡しは古い歩容・古いテンポのまま。テンポを寄せるのは差が小さいとき（ramp）だけ。
      // 拍が揃う比（aligned）なら橋渡しの後でそのまま、揃わない（cut）なら間・溜めの切れ目で切り替える
      this.planner.forceNow(up ? '溜め' : '間', this.bridgeBars(), { bridge: true, ramp: tp.how === 'ramp' });
      this.upcoming = null;
      this.planner.force(up ? '熱' : '静', 8, { landing: true });
      this.bridge = { gait: this.gait, to };
      this.nextBpm = to;
    } else { this.nextBpm = to; this.planner.forceNow(this.planner._peek ?? '静', 8, { landing: true }); this.planner._peek = undefined; }
    this.nextGait = newGait; this.pendingQuick = false;
    this.emit({ type: 'transition', time: this.time, from: this.gait, to: newGait, bpm: to });
  }

  // 楽節の最後の小節を、次の調・進行へのピボット和音にする（両方に属する和音、または次の主和音の属和音）
  pivotChord() {
    const t = clampLatent(this.target), m = motionOf(t), O = this.overrides;
    const next = (O.progression && PROGRESSIONS.find((p) => p.name === O.progression)) || this.allowedProgressions(m)[0];
    const rel = ((O.key ?? this.planner.key) - this.key + 12) % 12;
    if (next.name === this.prog.name && rel === 0) return null;
    if (next.drive >= 0.3) return [(rel + 7) % 12, 'dom7'];
    const last = next.ch[next.ch.length - 1];
    return [(last[0] + rel) % 12, last[1]];
  }

  scheduleBar() {
    this.barStart = this.time; this.barStartBeat = this.beatNow;
    if (this.tempoPlan?.shape === 'fs') this.tempoPlan = null; // リタルダンドは小節の終わりで終わる（次の区間で a tempo）
    if (this.pendingChange && this.plan) {
      const phraseEnd = this.secBar === 0 || this.secBar % 8 === 0;
      const half = this.secBar % 4 === 0;
      if (phraseEnd || (this.pendingMode === 'bar' && half) || this.pendingMode === 'next') {
        if (!phraseEnd) this.crossfade(); // 途中で切るときは、予定済みの古い音を捨てずに弱めながら受け渡す（v1.3）
        this.pendingChange = false; this.beginTransition(); this.secBar = 0;
      }
    }
    if (this.secBar === 0) {
      this.startSection(); this.firstSection = false;
      // 橋渡しの後の着地が熱なら、継ぎ目をシンバルで（どの歩容でも）
      if (this.plan.landing) this.landTx();
    }
    const sec = this.plan;
    const G = GAITS[this.gait], rng = this.rng, Pg = this.P.ground, Pf = this.P.figure, D = this.Dsec ?? this.P.world.D;
    const bp = this.secBar % 8, ph = Math.floor(this.secBar / 8);
    const kind = ph % 2 === 0 ? 'ante' : 'cons';
    const melodic = sec.melody && sec.bars >= 8;
    if (bp === 0) this.chords = phraseChords(this.prog, melodic ? kind : 'cons', G.hr, this.grief > 0.2 && ph === 1);
    let chord = melodic ? this.chords[bp] : this.prog.ch[Math.floor(bp / G.hr) % this.prog.ch.length];
    if (sec.role === '落ちサビ' && this.secBar === sec.bars - 1 && this.planner.peekRole() === '大サビ') chord = [((this.planner.modAmount || 2) + 7) % 12, 'dom7']; // 転調の準備: 新しい調の属七
    // 切り替えを待っている楽節の最後の小節 = ピボット和音。旋律の最後の音もその和音の音に替える
    // 'bar' では 4 小節目（文の提示部の終わり）でも切り替えるので、そこもピボットにする
    const lastBarOfPhrase = bp === 7 || this.secBar === this.plan.bars - 1 || (this.pendingMode === 'bar' && bp === 3);
    if (this.pendingChange && lastBarOfPhrase) {
      const pv = this.pivotChord();
      if (pv) {
        chord = pv;
        const t0p = this.time, t1p = t0p + this.S * this.step, b1p = this.beatNow + G.beats;
        this.queue = this.queue.filter((q) => !(q.layer === 'figure' && q.b >= this.beatNow - 1e-6 && q.b < b1p));
        if (this.lastMel !== undefined) {
          const pcs = chordPcs(pv).map((p) => (p + this.key) % 12);
          let best = this.lastMel, bd = 99;
          for (let s = this.lastMel - 6; s <= this.lastMel + 6; s++) if (pcs.includes(((s % 12) + 12) % 12) && Math.abs(s - this.lastMel) < bd) { bd = Math.abs(s - this.lastMel); best = s; }
          this.push('figure', t0p, (t1p - t0p) * 0.9, best - this.key, 0.5 * this.P.figure.gain, this.P.figure, this.melInstr || 'modal', 'melody', 0.5);
        }
      }
    }
    const scale = chordScale(this.prog.scale, chord);
    // 強度: 区間の値 × 楽節内の弧（頂点は 6 小節目）。最後の区間は次第に弱く
    const arc = [0.9, 0.93, 0.97, 1, 1.04, 1.08, 1, 0.92][bp];
    // 激しさ（利用者・ゲーム）は区間の強度に足される
    // 熱の後が静かな区間なら、最後の 4 小節で徐々に下げる（参考曲: 静かになる境目の直前 4 小節で約 −2.4 dB）
    const toCalm = 1; // v1.5.1: フィーバーの後は徐々に下げず、シュンと基準へ戻る（評価者の指摘。燃え尽きて戻る形）
    const I = Math.max(0.1, Math.min(1.15, 0.55 + (sec.I(this.secBar, sec.bars) * arc * toCalm - 0.55) * (this.amp ?? 1) + 0.3 * (this.userI - 0.5)));
    this.I = I;
    const barDur = this.S * this.step, t0 = this.time;
    // 終止のリタルダンド: 区間の最後の小節で、次が静・間に落ちるとき（熱の後、静かな向きの切り替えの前）
    const lastBar = this.secBar === sec.bars - 1;
    const ritHere = this.pendingChange ? lastBarOfPhrase && this.pendingDown
      : lastBar && ((sec.type === '熱' && this.planner.peekCalm()) || (sec.bridge && sec.type === '間'));
    if (ritHere) this.ritardando(motionOf(this.z).M);
    const loose = Math.pow(1 - D, 1.5) * 0.03; // 人の演奏の時間の揺らぎ [s]

    // 地: 伴奏
    const gC = Math.round(12 * Math.log2(Pg.f0 / TONIC) / 2) + 12; // 和音の中心（A3 付近、大きい地ほど低い）
    const center = Math.max(5, Math.min(20, gC));
    const newChord = bp % G.hr === 0;
    const V = newChord || !this.prevV ? voiceChord(chordPcs(chord), center, this.prevV) : this.prevV;
    this.prevV = V;
    const bpc = chord[2] ?? chord[0];
    // 跳ねる・スキップは 1 オクターブ上（評価: 「かわいいの低音が場違いでうるさい」= A1〜E2 のピアノが重すぎた）
    const bass = (bpc % 12) - 12 + (['跳ねる', 'スキップ'].includes(this.gait) ? 12 : 0) - ((bpc % 12) > 7 ? 12 : 0);
    const { notes, drums } = accompany(this.gait, { V, bass, S: this.S, sub: G.sub, I, rng, newChord, hr: G.hr, scale, barInPhrase: bp, density: this.z.ground.density });
    // ---- 区間の役割による編曲（v1.5）----
    const isLast = this.secBar === sec.bars - 1, Sb = this.S, sub = G.sub;
    if (sec.sparse) { // 落ちサビ: 伴奏を薄く（持続音・低音・分散和音だけ、打楽器なし）
      for (let i = notes.length - 1; i >= 0; i--) { const r = notes[i].role; if (r === 'chord' || r === 'stab' || r === 'trem') notes.splice(i, 1); else notes[i].vel *= r === 'bass' ? 0.7 : 0.8; }
      drums.length = 0;
    }
    if (sec.fill && isLast) {
      // 次の区間（サビ・大サビ）へのつなぎ。参考曲 11 曲の分析（tools/form_stats.py）: 盛り上がる境目の直前に 1 拍の無音（ブレイク）は
      // ほぼなく、直前 4 小節で約 +3 dB 盛り上げてから入る。→ 和音は最後の 8 分だけ切り、フィルは小節の最後まで続ける
      const cut = Sb - Math.max(1, sub / 2);
      for (let i = notes.length - 1; i >= 0; i--) { if (notes[i].step >= cut && notes[i].role !== 'bass') notes.splice(i, 1); else if (notes[i].role !== 'bass') notes[i].dur = Math.min(notes[i].dur, cut - notes[i].step); }
      for (let i = drums.length - 1; i >= 0; i--) if (drums[i].step >= Sb / 2 && drums[i].type !== 'kick') drums.splice(i, 1);
      if (this.hasKit()) { // スネアのフィル（後半 2 拍）。強くなっていく
        for (let st = Sb / 2, k = 0; st < Sb; st++, k++) drums.push({ step: st, type: 'snare', vel: 0.3 + 0.08 * k });
        drums.push({ step: 0, type: 'swell', vel: 0.45 });
      } else { // 打楽器のない歩容: 和音の音を駆け上がる
        const run = [V[0], V[1], V[2] ?? V[1], V[0] + 12, V[1] + 12, (V[2] ?? V[1]) + 12];
        const span = cut - Sb / 2; run.slice(0, Math.max(3, span)).forEach((s, k) => notes.push({ step: Sb / 2 + Math.floor((k * span) / Math.max(3, span)), dur: 1, role: 'arp', semi: s + 12, vel: 0.3 + 0.05 * k }));
      }
    }
    // 溜めの最後の 2 小節: スネアの刻みが細かく・強くなっていく（勢いを溜める）
    if (sec.type === '溜め' && this.hasKit() && this.secBar === sec.bars - 2) for (let st = 0; st < Sb; st += sub === 4 ? 2 : 1) drums.push({ step: st, type: 'snare', vel: 0.22 + 0.025 * st });
    if (sec.crash && this.secBar === 0 && this.hasKit()) drums.push({ step: 0, type: 'cym', vel: 0.5 });
    if (this.z.ground.density > 0.01) for (const n of notes) {
      const instr = this.resolve(n.role, 'ground', 45 + n.semi);
      n.vI = I;
      // 跳ねる: 和音（その他のパート）は控えめ、ベースが重い（Yunomi: その他 5〜10%、ベース 27〜61%）
      const bal = this.gait === '跳ねる' ? { pad: 0.4, stab: 0.5, bass: 1.6 }[n.role] ?? 1 : this.gait === 'スキップ' ? { bass: 0.7 }[n.role] ?? 1 : 1; // スキップ: 低音は軽く
      const g = Pg.gain * n.vel * ROLE_GAIN[n.role] * bal * (0.5 + 0.55 * I); // 強度による音量差（基準とフィーバーで約 3 dB。残りは編曲の厚みで）
      const at = t0 + n.step * this.step + (n.step ? loose * gauss(rng) : 0);
      const dur = n.dur * this.step * (n.role === 'chord' ? 0.8 : 1);
      if (instr === 'bow' && n.role === 'pad') for (const [c, dt] of [[0, 0], [-7, 0.02], [6, 0.035]]) this.push('ground', at + dt, dur, n.semi + c / 100, g * 0.6, Pg, instr, n.role);
      else this.push('ground', at, dur, n.semi, g, Pg, instr, n.role, Math.min(1, n.vel * (0.5 + 0.5 * I) * 1.4), n.glide ? n.semi - 12 : null);
      // 電子音のベースには正弦波のサブベース（Yunomi はベースが全体のエネルギーの 3〜6 割）
      if (instr === 'saw' && n.role === 'bass' && !n.glide) this.push('ground', at, dur, n.semi, g * 1.6, Pg, 'sine', 'bass');
    }
    for (const d of drums) this.enq({ drum: d.type, gain: d.vel * (0.6 + 0.4 * I), freq: d.semi !== undefined ? TONIC * Math.pow(2, ((((d.semi + this.key) % 12) + 12) % 12 - 12) / 12) : 55 }, t0 + d.step * this.step);

    // 効果音 = 完全に離散化された粒の層（se.js）。格子と和音に量子化される
    const zt = this.z.texture;
    if (D >= 0.95 && zt.density > 0.01 && sec.type !== '間') {
      const m = zt.morph, W = [['ping', m.n], ['pop', m.q * 0.5], ['wood', m.q * 0.5], ['rattle', m.rep], ['pew', m.ri * 0.67], ['boing', m.ri * 0.33]];
      const ws = W.reduce((a, [, w]) => a + w, 0);
      const count = Math.round(barDur * (1 + 4 * zt.density) * I * (0.6 + 0.8 * rng()));
      for (let k = 0; k < count; k++) {
        let r = rng() * ws, kind = 'ping'; for (const [kk, w] of W) { if ((r -= w) <= 0) { kind = kk; break; } }
        const st = Math.floor(rng() * this.S / 2) * 2 + (rng() < 0.6 ? 1 : 0); // 裏の 16 分を好む
        const semi = V[Math.floor(rng() * V.length)] + 24 + (rng() < 0.3 ? 12 : 0);
        const at = t0 + st * this.step, gse = 0.25 * zt.energy * (0.6 + 0.4 * I);
        if (kind === 'ping' && rng() < 0.5 && catalog()) {
          // きらきら: 鉄琴の和音の駆け上がり（32 分）
          for (let j = 0; j < 4; j++) this.push('figure', at + j * this.step / 2, 0.3, V[j % V.length] + 36 + 12 * Math.floor(j / V.length), gse * 1.5, Pf, 'smp:glock', 'arp', 0.6);
        } else this.enq({ se: kind, gain: gse, freq: TONIC * Math.pow(2, (semi + this.key) / 12) }, at);
      }
      if (this.secBar === sec.bars - 1 && (sec.type === '溜め' || sec.type === '間')) this.enq({ se: 'sweep', gain: 0.15 * I, freq: 0 }, t0 + barDur / 2);
      if (this.secBar === 0 && sec.type === '熱') this.enq({ se: 'crash', gain: 0.5, freq: 0 }, t0);
    }

    // 音のロゴ（スタイル）: 合図の直後と熱の頭で、主題の頭 4 音を鉄琴で
    if (this.style.logo && this.motifs && ((this.logoAt !== undefined && this.logoAt !== null && t0 >= this.logoAt - 1e-6) || (this.secBar === 0 && sec.type === '熱'))) {
      this.logoAt = null;
      const A = this.motifs.A, sc = chordScale(this.prog.scale, chord), cells = A.rA.slice(0, 4);
      let d = 21;
      cells.forEach(([st, du], i) => { if (i > 0) d += A.iv[i - 1] ?? 0; this.push('figure', t0 + st * this.step, du * this.step, degSemi(d, sc), 0.35 * Pf.gain, Pf, catalog() ? 'smp:glock' : 'modal', 'melody', 0.8); });
    }

    // 図: 旋律（楽節の頭に 8 小節ぶん）
    if (melodic && bp === 0 && this.z.figure.density > 0.01) {
      const fc = 12 * Math.log2(Pf.f0 / TONIC) + Pf.registerSemis;
      const NSc = (WORLD_SCALES[this.prog.scale] || [0, 0, 0, 0, 0, 0, 0]).length || 7;
      const centerDeg = Math.round(Math.max(12, Math.min(28, fc)) / 12 * NSc) + (sec.lift || 0);
      const motif = this.motifs[sec.motif];
      const mel = sec.motif === 'S' && this.themeBars?.length ? themePhrase(this.themeBars, { chords: this.chords, scale: this.prog.scale, S: this.S, center: centerDeg, bars: Math.min(8, sec.bars), themeMinor: this.prog.themeMinor ?? null }) : phrase(rng, motif, { chords: this.chords, scale: this.prog.scale, S: this.S, sub: G.sub, kind, center: centerDeg, ornament: sec.ornament, sigh: this.grief, peakLift: this.grief > 0.2 ? 2 : 0, penta: this.penta });
      const mids = mel.map((n) => 45 + n.semi).sort((a, b) => a - b);
      const instr = this.resolve('melody', 'figure', mids[Math.floor(mids.length / 2)] ?? 69);
      const susI = instr === 'bow' || instr === 'blow' || /smp:(.*_sus|solo_vln|flute|clarinet|oboe|bassoon|horn)$/.test(instr);
      const legato = susI ? 1.05 : 1 - 0.35 * this.z.figure.edge;
      for (const n of mel) {
        const Ib = Math.max(0.1, 0.55 + (sec.I(ph * 8 + n.bar, sec.bars) * [0.9, 0.93, 0.97, 1, 1.04, 1.08, 1, 0.92][n.bar] - 0.55) * (this.amp ?? 1) + 0.3 * (this.userI - 0.5));
        const at = t0 + n.bar * barDur + n.step * this.step + loose * gauss(rng);
        const g = Pf.gain * n.vel * ROLE_GAIN.melody * (0.5 + 0.55 * Ib);
        const dur = n.dur * this.step * legato;
        // 電子音の旋律は跳躍で滑る（ポルタメント）
        const gl = instr === 'square' && this.prevMel !== undefined && Math.abs(n.semi - this.prevMel) >= 5 ? this.prevMel : null;
        this.prevMel = n.semi; this.lastMel = n.semi + this.key; this.melInstr = instr;
        this.push('figure', at, dur, n.semi, g * (instr === 'square' ? 0.55 : 1), Pf, instr, 'melody', Math.min(1, n.vel * (0.45 + 0.55 * Ib)), gl);
        // 頂点付近の重ね（ユニゾン）: 叩きつける = オクターブ下（管弦楽の斉奏）、跳ねる = オクターブ上の鉄琴
        if (Ib >= 0.85 && this.gait === '叩きつける') this.push('figure', at, dur, n.semi - 12, g * 0.6, Pf, instr, 'melody');
        if (Ib >= 0.6 && this.gait === '跳ねる') this.push('figure', at, n.dur * this.step, n.semi + 12, g * 0.5, Pf, catalog() ? 'smp:glock' : 'modal', 'melody', 0.7);
      }
    }
    this.emit({ type: 'bar', time: t0, section: sec.type, bar: this.secBar, gait: this.gait, bpm: this.bpm, chord, I, key: this.key });
    this.nextBarBeat = this.barStartBeat + G.beats; this.nextBarAt = t0 + barDur;
    if (++this.secBar >= sec.bars) this.secBar = 0;
  }

  push(layer, at, dur, semi, gain, P, instr, role, vel = 0.7, glideFrom = null) {
    if (!Number.isFinite(semi) || !Number.isFinite(at)) return;
    semi += this.key; // 転調
    const note = { freq: TONIC * Math.pow(2, semi / 12), dur, gain, instr };
    if (instr.startsWith('smp:')) {
      const b = layer === 'ground' ? this.z.ground : this.z.figure, name = instr.slice(4), x = catalog().instruments[name];
      // 余韻: 打鍵の分散和音はペダルで長く、連打は止める。明るさ = 身体の明るさ × 強さ（強く弾くほど明るい）
      const release = x.artic === 'sus' || x.artic === 'trem' ? 0.35 : role === 'chord' ? 0.08 : role === 'arp' || role === 'pad' ? 1.2 : 0.4;
      Object.assign(note, { inst: name, vel, release, cutoff: 1500 * Math.pow(2, 3.2 * b.bright) * (0.6 + 0.6 * vel), gain: gain * 0.9 });
    } else if (SYNTH[instr]) { Object.assign(note, SYNTH[instr](layer === 'ground' ? this.z.ground : this.z.figure, role)); if (glideFrom !== null) note.glideFrom = TONIC * Math.pow(2, (glideFrom + this.key) / 12); }
    else {
      let morph = { ...P.morph };
      if (instr === 'bow' || instr === 'blow') morph = { rep: 0, q: 0, n: 0.15, long: 0.85, ri: 0 };
      if (role === 'chord') morph = { rep: 0, q: 0.6, n: 0.4, long: 0, ri: 0 }; // 連打は前の音を止めて次を叩く
      Object.assign(note, {
        attack: Math.min(P.attack, dur * 0.5), ringTau: P.ringTau * (role === 'bass' ? 1.5 : 1), rel: 0.008 + P.floor * dur * 0.6, morph,
        burst: P.burst * 0.25, burstDecay: 0.004 + 0.02 * P.massNorm, glideTime: 0.002,
        vib: instr === 'bow' ? 0.0035 * (0.4 + P.energyN) : instr === 'blow' ? 0.002 : 0,
      });
      if (instr === 'pluck') note.gain *= 1.6;
    }
    this.enq({ layer, note, semi, durB: dur / this.beat }, at);
  }

  render(Lout, Rout, offset = 0, nFrames = Lout.length) {
    const dt = 1 / this.sr, out = this.revOut;
    for (let i = 0; i < nFrames; i++) {
      if (this.ctr-- <= 0) {
        this.ctr = 128; this.smoothLatent(128 * dt); this.applyWorld();
        this.tempoTick();
        if (this.tx && !this.tx.landed && this.tx.plan === 'morph' && this.time >= this.morphUntil) this.landTx();
        while (this.beatNow >= this.nextBarBeat) this.scheduleBar();
      }
      while (this.queue.length && this.queue[0].b <= this.beatNow) {
        const q = this.queue.shift();
        if (q.note && q.durB) q.note.dur = q.durB * this.beat; // 音の長さは鳴らす時点のテンポで
        if (q.fadeFrom !== undefined) { const f = 1 - (q.b - q.fadeFrom) / q.fadeLen; if (f <= 0.02) continue; if (q.note) q.note.gain *= f; else if (q.gain) q.gain *= f; }
        if (q.se) { this.se.trigger(q.se, q.gain, q.freq); continue; }
        // ドラムキットの録音（電子音の歩容「跳ねる」は合成のまま）
        if (q.drum && catalog()?.perc?.kit_snare && this.gait !== '跳ねる') {
          const kit = { kick: 'kit_kick', snare: q.gain < 0.4 ? 'kit_snare_soft' : 'kit_snare', hat: 'kit_hat', ohat: 'kit_ohat', swell: 'cym_swell', cym: 'cym_hit', shaker: 'shaker' }[q.drum];
          if (kit) { this.se.trigger(kit, q.gain * 0.42 * (this.drumLevel ?? 1), 0); continue; }
        }
        if (q.drum === 'swell' || q.drum === 'cym') { if (this.gait === '跳ねる') this.se.trigger(q.drum === 'cym' ? 'crash' : 'sweep', q.gain * 0.4, 0); continue; }
        if (q.drum === 'timp' && catalog()) { this.ground.trigger({ inst: 'timpani', freq: q.freq, dur: 0.6, gain: q.gain * 0.5, vel: Math.min(1, q.gain), release: 0.8, cutoff: 20000 }); continue; }
        if (q.drum) { this.drums.trigger(q.drum, q.gain, q.freq, this.time); continue; }
        this[q.layer].trigger(q.note, this.P[q.layer]);
        this.emit({ type: 'note', layer: q.layer, time: this.time, freq: q.note.freq, dur: q.note.dur, semi: q.semi });
      }
      const W = this.P.world;
      // サイドチェイン: キックで地がへこむ（ダンス音楽の呼吸）
      const sc = this.drums.lastKick >= 0 ? 1 - 0.6 * Math.exp(-(this.time - this.drums.lastKick) / 0.12) : 1;
      const dr = this.drums.tick() * (this.gait === '跳ねる' ? 3.5 : 0.5);
      // 図と地の釣り合い（ミキシング担当がフェーダーを動かすように）: 旋律を伴奏 + 5 dB に保つ。
      // 伴奏が厚くなる溜め・サビで旋律も一緒に大きくなり、緩急が音量にも出る（v1.5.1: 旋律が伴奏より 10 dB 大きく、全体の音量を決めていた）
      const gy = this.ground.tick(this.P.ground), fy = this.figure.tick(this.P.figure);
      this.gE += (gy * gy - this.gE) * 2e-5; this.fE += (fy * fy - this.fE) * 2e-5;
      // 旋律が鳴っている区間でだけ合わせる（間奏で旋律が休む間に上げすぎない）。上限 1.4、追従は約 1 秒
      if (this.plan?.melody && this.secBar >= 1 && this.fE > 1e-7 && this.gE > 1e-8) { const want = Math.min(1.4, Math.max(0.2, Math.sqrt((this.gE * 3.16) / this.fE) * this.figGain)); this.figGain += (want - this.figGain) * 4e-5; }
      // 粒（泡）の層は音楽の下に敷く: 音楽（図 + 地）より約 9 dB 下に保つ（聞こえるが前に出ない）（評価: 「深海のバブルがうるさい」= 音楽より 10 dB 大きかった）。
      // 上げるのは元の音量まで（1 倍）、追従は約 2 秒。静かな場面では泡も静かになる
      const tx = (this.Dsec ?? W.D) >= 0.95 ? 0 : this.texture.tick(this.P.texture, this.z.texture, W);
      this.tE = (this.tE ?? 0) + (tx * tx - (this.tE ?? 0)) * 1e-5;
      if (this.tE > 1e-10) { const mE = this.gE + this.fE * this.figGain * this.figGain, want = Math.min(1, Math.sqrt((mE * 0.12) / this.tE)); this.texGain = (this.texGain ?? 1) + (want - (this.texGain ?? 1)) * 1e-5; }
      let x = gy * sc + fy * this.figGain * (0.7 + 0.3 * sc) + dr + this.se.tick() + tx * (this.texGain ?? 1);
      x = this.hp.tick(x); x = this.lp2.tick(this.lp1.tick(x));
      this.rev.tick(x - 0.8 * dr, out);
      // 仕上げのコンプレッサー（ピークだけを軽く抑える。比 2:1。強くすると基準とフィーバーの差まで均してしまう）
      const rl = W.revLevel * (1 + 0.8 * (this.glowK || 0)), dl = W.direct * (1 - 0.25 * (this.glowK || 0)); // 余韻: 残響が前に、直接音が少し引く
      let l = (x * dl + out[0] * rl) * this.master, r = (x * dl + out[1] * rl) * this.master;
      const lev = Math.max(Math.abs(l), Math.abs(r));
      this.compEnv = lev > this.compEnv ? this.compEnv + (lev - this.compEnv) * 0.004 : this.compEnv + (lev - this.compEnv) * 0.00012;
      const thr = 0.4, cg = this.compEnv > thr ? Math.pow(this.compEnv / thr, 1 / 2 - 1) : 1;
      Lout[offset + i] = Math.tanh(l * cg);
      Rout[offset + i] = Math.tanh(r * cg);
      this.time += dt; this.beatNow += dt / this.beat;
    }
  }
}
