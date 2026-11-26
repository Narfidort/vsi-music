// カーネル本体。意味座標を受け取り、音を生成し続ける。v0.3
// 情景 = 地（ground: 和声）+ 図（figure: 旋律）。世界（媒質・距離・残響）は共有。
// 時間は 2 小節ごとに予定する: Conductor（和声・起伏）→ HarmonyGen（地）/ MelodyGen（図）。
// Node（オフラインレンダリング）と AudioWorklet（リアルタイム）の両方から使う。

import { clampLatent, mergeLatent, WORLD_AXES, BODY_AXES, LAYERS } from './space.js';
import { derive, TONIC } from './physics.js';
import { mulberry32, Biquad, FDN } from './dsp.js';
import { VoicePool } from './voice.js';
import { Perc } from './perc.js';
import { Pluck } from './pluck.js';
import { Texture } from './texture.js';

// 楽器 = 相互作用 × 共鳴体（Gaver の分類。v0.4）。新しいつまみは足さず、既存の軸から決める。
//   相互作用: 相形態の重み（撥音・促音・重複 = 叩く／はじく、長音・-り = 擦る／吹く）
//   共鳴体  : voice（声道）、角と明るさ（硬く明るい = 非調和な棒・鐘、それ以外 = 弦）、
//             持続音で明るく滑らか = 気柱（笛）
//   役割    : 持続和音（pad）は定義上「擦る」、分散和音とベースは相互作用に従う
export function instrumentFor(role, b) {
  if (b.voice > 0.5) return 'voice';
  const m = b.morph;
  const impulsive = m.n + m.q + m.rep, sustained = m.long + m.ri;
  // 持続和音: 相互作用に従う（撥音が優勢 = 打鍵された和音（ピアノ）、長音が優勢 = 弦楽合奏）。v0.4 は常に弓だった
  if (role === 'bass') return impulsive >= sustained ? 'pluck' : 'bow';
  // 叩いて鳴らしっぱなし（撥音）が優勢 = 打弦・打鍵（ピアノ・チェレスタ・鐘）、反復が優勢 = はじく（ハープ・ギター）
  const struck = m.n + m.q >= m.rep;
  if (role === 'pad') return sustained > impulsive ? 'bow' : 'modal';
  if (role === 'arp') return struck || (b.edge > 0.6 && b.bright > 0.6) ? 'modal' : 'pluck';
  if (sustained > impulsive) return b.bright > 0.6 && b.rough < 0.3 ? 'blow' : 'bow';
  return struck || b.bright > 0.7 || b.edge > 0.55 ? 'modal' : 'pluck';
}

// 声（加算合成: 声・固体・弓・息）とはじく弦を持つ音源の集合
class InstrumentPool {
  constructor(n, sr, rng) { this.voices = new VoicePool(n, sr, rng); this.plucks = Array.from({ length: n }, () => new Pluck(sr, rng)); this.k = 0; }
  trigger(note, P) {
    if (note.instr === 'pluck') {
      let p = this.plucks.find((x) => !x.active);
      if (!p) { p = this.plucks[this.k]; this.k = (this.k + 1) % this.plucks.length; }
      p.trigger(note, P);
    } else this.voices.trigger(note, P);
  }
  tick(P) { let s = this.voices.tick(P); for (const p of this.plucks) if (p.active) s += p.tick(P); return s; }
}
import { Conductor, MelodyGen, HarmonyGen, modeFor } from './composer.js';

function gauss(rng) { const u = Math.max(1e-9, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

const BLOCK = 128;

export class Engine {
  // overrides: 実験用。derive() の結果の一部を差し替える。
  //   { figure: {...}, ground: {...}, world: {...} } または (P, z) => 同じ形
  constructor({ sampleRate = 48000, seed = 1, latent = {}, overrides = null } = {}) {
    this.overrides = overrides;
    this.sr = sampleRate;
    this.rng = mulberry32(seed);
    this.target = clampLatent(latent);
    this.z = clampLatent(latent);
    this.P = this.derive(this.z);
    this.layers = {};
    this.layers = { ground: { pool: new InstrumentPool(20, this.sr, this.rng) }, figure: { pool: new InstrumentPool(8, this.sr, this.rng) } };
    this.texture = new Texture(this.sr, this.rng);
    this.perc = new Perc(this.sr, this.rng);
    this.conductor = new Conductor(this.rng);
    this.melody = new MelodyGen(this.rng);
    this.harmony = new HarmonyGen(this.rng);
    this.nextUnitAt = 0.05;
    this.lp1 = new Biquad(); this.lp2 = new Biquad();
    this.hp = new Biquad(); this.hp.set('hp', 30, 0.7, this.sr);
    this.rev = new FDN(this.sr);
    this.time = 0;
    this.queue = [];
    this.ctr = 0;
    this.revOut = [0, 0];
    this.listeners = [];
    this.smoothTau = 0.4;
    this.applyWorld();
  }

  set(patch) { this.target = mergeLatent(this.target, patch); }
  onEvent(fn) { this.listeners.push(fn); }
  emit(e) { for (const f of this.listeners) f(e); }

  derive(z) {
    const P = derive(z);
    if (!this.overrides) return P;
    const o = typeof this.overrides === 'function' ? this.overrides(P, z) : this.overrides;
    for (const k of ['world', 'ground', 'figure']) if (o[k]) Object.assign(P[k], o[k]);
    return P;
  }

  applyWorld() {
    const W = this.P.world;
    this.lp1.set('lp', W.lowpass, 0.6, this.sr);
    this.lp2.set('lp', W.lowpass * 1.2, 0.6, this.sr);
    this.rev.set(W.rt60, 0.6 + 2.2 * W.space, 0.2 + 0.6 * Math.max(W.medium, W.distance * 0.7));
  }

  smoothLatent(dt) {
    const a = 1 - Math.exp(-dt / this.smoothTau);
    for (const k of Object.keys(WORLD_AXES)) this.z[k] += (this.target[k] - this.z[k]) * a;
    for (const l of LAYERS) {
      const z = this.z[l], t = this.target[l];
      for (const k of Object.keys(BODY_AXES)) z[k] += (t[k] - z[k]) * a;
      for (const k of Object.keys(z.morph)) z.morph[k] += (t.morph[k] - z.morph[k]) * a;
    }
    this.P = this.derive(this.z);
  }

  // 2 小節ぶんを予定する
  scheduleUnit() {
    const Pg = this.P.ground, Pf = this.P.figure, W = this.P.world, rng = this.rng;
    const D = W.D;
    // 拍の長さ: 地と図の出来事の周期の幾何平均 × 2（大きく遅い地が拍を支え、図が細分する）。50〜150 BPM に収める
    const beat = Math.min(1.25, Math.max(0.4, 2 * Math.sqrt(Pf.period * Pg.period)));
    // 旋法は楽節の頭でだけ切り替える（和声の明るさ = 地と図の明るさ − 粗さ の平均）
    if (!this.mode || this.conductor.bar % 8 === 0) {
      const zg = this.z.ground, zf = this.z.figure;
      const w = (k) => 0.6 * zg[k] + 0.4 * zf[k];
      this.mode = modeFor(w('lift'), w('rough'), w('bright'));
    }
    const bars = [this.conductor.nextBar(D, this.mode), this.conductor.nextBar(D, this.mode)];
    const t0 = this.time;
    const center = (P) => Math.round(12 * Math.log2(P.f0 / TONIC) + P.registerSemis);
    const loose = 1 - D; // 離散化されていない度合い: タイミングと音高の揺らぎ

    // 地: 和声
    if (Pg.density > 0.01) {
      bars.forEach((b, bi) => {
        for (const n of this.harmony.bar(Pg, center(Pg), b)) {
          const role = n.role;
          const morph = role === 'bass' ? { long: 0.6, n: 0.4, rep: 0, q: 0, ri: 0 } : role === 'arp' ? { n: 0.7, rep: 0.3, long: 0, q: 0, ri: 0 } : { ...Pg.morph };
          const instr = instrumentFor(role, this.z.ground);
          const g = Pg.gain * n.vel * (0.55 + 0.55 * b.intensity) * (role === 'bass' ? 0.8 : role === 'arp' ? 0.3 : 0.22);
          const at = t0 + (bi * 4 + n.at) * beat;
          if (instr === 'bow' && role === 'pad') {
            // 合奏: 複数の奏者 = わずかにずれた音高と時刻（弦楽合奏の厚み）
            for (const [c, dt] of [[0, 0], [-7, 0.02], [6, 0.035]]) this.push('ground', at + dt, n.dur * beat, n.semi + c / 100, g * 0.6, morph, Pg, rng, instr);
          } else this.push('ground', at, n.dur * beat, n.semi, g, morph, Pg, rng, instr);
        }
      });
    }
    // 図: 旋律（区間の頭の導入 4 小節は休む）
    const intro = Pg.density > 0.01 && bars[0].section % 4 === 0 && bars[0].posInSection < 4; // 地がなければ導入もない
    if (Pf.density > 0.01 && !intro) {
      const role = ['A', "A'", 'B', "A''"][Math.floor(bars[0].posInSection / 2)];
      // 重力で旋律は中心より下に溜まるので、その分（約 3 半音）中心を上げておく
      const F = { D, center: center(Pf) + 3 + (bars[0].intensity > 0.9 ? 2 : 0), range: 9 + 5 * Pf.energyN, repeatProb: Pf.repeatProb };
      for (const n of this.melody.phrase(Pf, F, bars, role)) {
        // 離散化されていない分の揺らぎ。音楽では音高は「合っているか、いないか」なので (1−D)² で急に消える
        const at = n.at + Math.pow(loose, 1.5) * 0.3 * gauss(rng);
        const dur = n.dur * Math.exp(Math.pow(loose, 1.5) * 0.3 * gauss(rng));
        const semi = n.semi + loose * loose * 0.6 * gauss(rng);
        const g = 1.8 * Pf.gain * n.vel * (0.6 + 0.5 * bars[0].intensity); // 図 = 前景
        this.push('figure', t0 + Math.max(0, at) * beat, dur * beat, semi, g, { ...Pf.morph }, Pf, rng, instrumentFor('melody', this.z.figure));
      }
    }
    // パルス: 活性 × 角 × 離散化。拍節（D）がなければパルスもない
    const zg = this.z.ground, zf = this.z.figure;
    const edge = 0.5 * (zg.edge + zf.edge), energy = Math.max(zg.energy, zf.energy);
    const pg = 1.1 * Math.pow(D, 1.5) * (0.15 + 0.85 * energy) * (0.25 + 0.75 * edge);
    if (pg > 0.01) {
      const pp = Perc.params(Pg, zg);
      bars.forEach((b, bi) => {
        if (b.section % 4 === 0 && b.posInSection < 2) return; // 導入の頭は無拍
        // tick（小さな衝突の列）は駆動的な音楽（活性が高く拍節が強い）でだけ鳴らす。環境のはじけは粒の層の仕事
        const ticks = energy > 0.6 && D > 0.7;
        for (const h of Perc.bar(rng, Math.max(zg.density, zf.density), energy, b.intensity)) {
          if (h.type === 'tick' && !ticks) continue;
          this.queue.push({ at: t0 + (bi * 4 + h.at) * beat, layer: 'perc', perc: h.type, gain: pg * h.vel * (0.5 + 0.6 * b.intensity) * (h.type === 'low' ? 1.0 : 0.3 + 1.6 * edge * edge), pp }); // tick = 小さく鋭い衝突なので角²に比例
        }
      });
    }
    this.emit({ type: 'unit', time: t0, beat, bars });
    this.nextUnitAt = t0 + 8 * beat;
  }

  push(layer, at, dur, semi, gain, morph, P, rng, instr = 'modal') {
    const rel = 0.008 + P.floor * dur * 0.6;
    const vib = instr === 'bow' ? 0.0035 * (0.4 + P.energyN) : instr === 'blow' ? 0.002 : 0;
    // 弓・息は持続的な励振なので、相形態のうち持続側（長音）でエンベロープを作る
    if (instr === 'bow' || instr === 'blow') morph = { rep: 0, q: 0, n: 0.15, long: 0.85, ri: 0 };
    if (instr === 'pluck') gain *= 1.6;
    this.queue.push({
      at, layer,
      note: {
        freq: TONIC * Math.pow(2, semi / 12), dur, attack: Math.min(P.attack, dur * 0.5), ringTau: P.ringTau, rel,
        morph, gain, burst: P.burst * 0.25, burstDecay: 0.004 + 0.02 * P.massNorm, glideTime: P.glide * dur,
        instr, vib,
      },
      info: { semi },
    });
  }

  render(Lout, Rout, offset = 0, nFrames = Lout.length) {
    const dt = 1 / this.sr;
    const out = this.revOut;
    const g = this.layers.ground, f = this.layers.figure;
    for (let i = 0; i < nFrames; i++) {
      if (this.ctr-- <= 0) {
        this.ctr = BLOCK;
        this.smoothLatent(BLOCK * dt);
        this.applyWorld();
        if (this.time >= this.nextUnitAt) this.scheduleUnit();
      }
      if (this.queue.length) {
        for (let j = this.queue.length - 1; j >= 0; j--) {
          const q = this.queue[j];
          if (q.at <= this.time) {
            if (q.layer === 'perc') { this.perc.trigger(q.perc, q.gain, q.pp); this.queue.splice(j, 1); continue; }
            this.layers[q.layer].pool.trigger(q.note, this.P[q.layer]);
            this.emit({ type: 'note', layer: q.layer, time: this.time, freq: q.note.freq, dur: q.note.dur, ...q.info });
            this.queue.splice(j, 1);
          }
        }
      }
      const W = this.P.world;
      // パルスは近接した衝突音なので残響への送りを小さくする（実在の曲の打楽器はほぼ乾いている）
      const pc = this.perc.tick();
      let x = g.pool.tick(this.P.ground) + f.pool.tick(this.P.figure) + pc + this.texture.tick(this.P.texture, this.z.texture, W);
      x = this.hp.tick(x);
      x = this.lp2.tick(this.lp1.tick(x));
      this.rev.tick(x - 0.75 * pc, out);
      Lout[offset + i] = Math.tanh((x * W.direct + out[0] * W.revLevel) * 0.6);
      Rout[offset + i] = Math.tanh((x * W.direct + out[1] * W.revLevel) * 0.6);
      this.time += dt;
    }
  }
}
