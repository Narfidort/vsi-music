// カーネルの口（docs/07_interface.md）。
//   適応の口: situation / signal / bind / cue / say / feedback
// 担当は BGM だけ。実体のある効果音（焚き火のはじけ、足音）はゲームのオブジェクトの仕事。BGM に馴染ませた音（深海の泡、かわいい曲の効果音）は含む
//   手動の口: set / lock / unlock / form / style / key / tempo / gait / progression
//   読み出し: state / on
// すべての命令は JSON で表せる（command({ op, args })）。関数呼び出し・AudioWorklet・WebSocket で同じ口を使う。
//
// 状態の合成: 意味座標 = 情景（situation）+ 束縛した信号の寄与（adaptive）、その上に手動の値（manual）。
// 固定（lock）した軸は、適応で動かさない。

import { Engine } from './engine.js';
import { clampLatent, BODY_AXES, WORLD_AXES } from '../kernel/space.js';
import { resolveScene, resolveParts, compose, vocabulary, SCENES, EMOTIONS } from './lexicon.js';
import { normalizeManner, mergeManners } from './manner.js';
import { MANNERS } from './manners.js';
import { gaitOf, motionOf } from './theory.js';
import { onomatopoeia } from '../kernel/readout.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const BODY = ['ground', 'figure', 'texture'];

function blendLatents(items) {
  const tot = items.reduce((a, [, w]) => a + w, 0) || 1;
  const out = { ground: { morph: {} }, figure: { morph: {} }, texture: { morph: {} } };
  for (const [z, w0] of items) {
    const w = w0 / tot, c = clampLatent(z);
    for (const k of Object.keys(WORLD_AXES)) out[k] = (out[k] || 0) + w * c[k];
    for (const l of BODY) {
      for (const k of Object.keys(BODY_AXES)) out[l][k] = (out[l][k] || 0) + w * c[l][k];
      for (const [k, v] of Object.entries(c[l].morph)) out[l].morph[k] = (out[l].morph[k] || 0) + w * v;
    }
  }
  return out;
}

// 'energy' → 地と図の両方、'ground.rough' → 地だけ、'space' → 世界
function addAt(z, path, v) {
  const parts = path.split('.');
  if (parts.length === 1 && WORLD_AXES[path]) { z[path] = (z[path] ?? 0) + v; return; }
  if (parts.length === 1 && BODY_AXES[path]) { for (const l of ['ground', 'figure']) z[l][path] = (z[l][path] ?? 0) + v; return; }
  const [l, k] = parts; if (z[l] && BODY_AXES[k]) z[l][k] = (z[l][k] ?? 0) + v;
}
function setAt(z, path, v) {
  const parts = path.split('.');
  if (parts.length === 1 && WORLD_AXES[path]) { z[path] = v; return; }
  if (parts.length === 1 && BODY_AXES[path]) { for (const l of ['ground', 'figure']) z[l][path] = v; return; }
  const [l, k] = parts; if (z[l]) { if (k === 'morph') z[l].morph = { ...v }; else z[l][k] = v; }
}
function getAt(z, path) {
  const parts = path.split('.');
  if (parts.length === 1) return WORLD_AXES[path] ? z[path] : z.figure[path];
  return z[parts[0]]?.[parts[1]];
}
function flattenPatch(patch, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && k !== 'morph') flattenPatch(v, prefix + k + '.', out);
    else out[prefix + k] = v;
  }
  return out;
}

export class Music {
  constructor({ sampleRate = 48000, seed = 1, scene = '優しさ', style = {}, onSay = null, onFeedback = null } = {}) {
    this.channels = new Map();   // チャンネル名 → { items: {語: 比率}, weight }
    this.offset = {};            // nudge の累積（相対的な変化）
    this.signals = {}; this.bindings = {}; this.manual = {}; this.locks = new Set();
    this.intensityBase = 0.5; this.handlers = { onSay, onFeedback }; this.txSeq = 0;
    this.manners = { ...MANNERS }; // 組み込みのマナー（core/manners.js）。manner(name, def) で足す・上書きする
    if (!resolveParts(scene)) scene = '優しさ';
    this.channels.set('main', { items: { [scene]: 1 }, weight: 1 });
    const z0 = this.composeBase();
    this.engine = new Engine({ sampleRate, seed, latent: z0, style });
    this.listeners = {};
    this.engine.onEvent((e) => { for (const f of this.listeners[e.type] || []) f(e); for (const f of this.listeners['*'] || []) f(e); });
    this.recompute();
  }

  // ---- 内部 ----
  // すべてのチャンネルを線形結合する（世界の成分と身体の成分を別々に、core/lexicon.js compose）
  composeBase() {
    const items = [];
    for (const { items: it, weight, role } of this.channels.values()) for (const [n, w] of Object.entries(it)) {
      if (!(w * weight > 0)) continue;
      let p = resolveParts(n); if (!p) continue;
      if (role === 'world') p = { ...p, bodies: undefined };            // 場所: 世界だけ（気分は他のチャンネルに任せる）
      else if (role === 'mood') p = { ...p, world: undefined, texture: undefined, bias: undefined }; // 気分だけ
      items.push([p, w * weight]);
    }
    if (!items.length) items.push(['穏やか', 1]);
    return compose(items);
  }
  get sceneName() {
    return [...this.channels.entries()].filter(([, c]) => c.weight > 0).map(([ch, c]) => `${ch}:` + Object.entries(c.items).map(([n, w]) => (w === 1 ? n : `${n}${Math.round(w * 100)}`)).join('+') + (c.weight !== 1 ? `×${c.weight.toFixed(2)}` : '')).join(' | ');
  }
  // 目標の意味座標と激しさを作り直す
  recompute() {
    const z = clampLatent(this.composeBase());
    for (const [p, v] of Object.entries(this.offset)) addAt(z, p, v);
    let dI = 0;
    for (const [name, map] of Object.entries(this.bindings)) {
      const v = this.signals[name] ?? 0;
      for (const [path, k] of Object.entries(map)) {
        if (path === 'intensity') { dI += k * v; continue; }
        if (this.locks.has(path)) continue;
        addAt(z, path, k * v);
      }
    }
    for (const [path, v] of Object.entries(this.manual)) setAt(z, path, v);
    for (const path of this.locks) if (this.lockedValues?.[path] !== undefined) setAt(z, path, this.lockedValues[path]);
    this.engine.target = clampLatent(z);
    if (!this.inChange) { this.engine.setMorph(this.glide ?? 1.5); this.engine.retargetTempo(); }
    this.engine.userI = Math.max(0, Math.min(1, this.intensityBase + dI));
  }
  // 構造の変化を伴いうる変更の後: 取引（トランザクション）を発行し、計画と着地予定を返す
  change(transition, within) {
    const e = this.engine, tx = ++this.txSeq;
    e.planner.key = 0; e.planner.hot = 0; // 新しい状況では転調を戻す
    if (transition === 'now') { this.cue('situation', { section: '静', tx }); return { tx, plan: 'now', eta: (e.nextBarBeat - e.beatNow) * e.beat }; }
    return { tx, ...e.requestChange(transition, within, tx) };
  }

  // ================= 適応の口 =================
  // mix: ゲームの系統（場所・脅威・物語…）ごとのチャンネルに「語: 比率」の辞書を送る。すべてのチャンネルが線形結合される。
  //   music.mix('place', { 海中: 0.7, 草原: 0.3 });  music.mix('threat', { 緊張: 1 }, { weight: 0.6 });  music.mix('threat', null)
  //   weight: チャンネル全体の重み（0..1、戦闘の気配を徐々に強めるなど）
  //   transition: 'auto'（既定: within 秒以内に着地できる最も音楽的な切り替え）/ 'bar' / 'phrase' / 'now'
  // 戻り値: { tx, plan: 'morph' | 'pivot' | 'bridge' | 'quick' | 'now', eta: 秒 }。着地するとイベント { type: 'landed', tx }
  //   weight は相対的（上限なし）: 気分はすべてのチャンネルの重み付き平均なので、戦闘を支配的にしたければ weight: 3 など
  //   role: 'both'（既定）/ 'world'（世界だけ: 残響・水・広がり）/ 'mood'（気分だけ: 身体）
  mix(channel, contents, { weight, role, manner, transition = 'auto', within = 4, intensity } = {}) {
    if (contents === null) this.channels.delete(channel);
    else if (contents !== undefined) {
      const items = typeof contents === 'string' ? { [contents]: 1 } : { ...contents };
      for (const n of Object.keys(items)) if (!resolveParts(n)) throw new Error(`unknown word: ${n}（vocabulary() を参照）`);
      const prev = this.channels.get(channel);
      this.channels.set(channel, { items, weight: weight ?? prev?.weight ?? 1, role: role ?? prev?.role ?? 'both', manner: manner !== undefined ? manner : prev?.manner });
    }
    if (contents === undefined && this.channels.has(channel)) { const c = this.channels.get(channel); if (weight !== undefined) c.weight = weight; if (role) c.role = role; if (manner !== undefined) c.manner = manner; }
    this.applyManner();
    if (intensity !== undefined) this.intensityBase = intensity;
    this.inChange = true; this.recompute(); this.inChange = false;
    return this.change(transition, within);
  }
  // チャンネルの重みだけを変える（戦闘の気配を徐々に強める、勝利の余韻を消していく）
  weight(channel, w, opts = {}) { if (!this.channels.has(channel)) return { tx: null, plan: 'none', eta: 0 }; return this.mix(channel, undefined, { ...opts, weight: w }); }
  // situation: 'main' チャンネルを置き換える（mix の簡略形）。blend の合計が 1 未満なら、残りは直前の main（部分的に寄せる）
  situation({ scene, blend, intensity, contrast, transition = 'auto', within = 4 } = {}) {
    if (contrast !== undefined) this.engine.contrast = contrast;
    if (!scene && !blend) { if (intensity !== undefined) { this.intensityBase = intensity; this.recompute(); } return { tx: null, plan: 'none', eta: 0 }; }
    let items;
    if (blend) {
      const sceneWord = scene ? String(scene).split(/[・,、\s]+/).find((p) => SCENES[p]) : null;
      items = {};
      for (const [n, w] of Object.entries(blend)) items[sceneWord && EMOTIONS[n] ? `${sceneWord}・${n}` : n] = w;
      const sum = Object.values(items).reduce((a, b) => a + b, 0);
      if (sum < 1 && sum > 0) for (const [n, w] of Object.entries(this.channels.get('main')?.items || {})) items[n] = (items[n] || 0) + w * (1 - sum);
    } else items = { [scene]: 1 };
    this.offset = {}; // 新しい状況では相対的な変化を捨てる
    return this.mix('main', items, { transition, within, intensity });
  }
  signal(name, value) { this.signals[name] = value; this.recompute(); return this; }
  bind(name, mapping) { this.bindings[name] = { ...mapping }; this.recompute(); return this; }
  // 出来事: 次の拍で区間を切り替える（静 → 熱 の鋭い落差）
  cue(name, { section, tx } = {}) {
    const map = { surge: '熱', boss: '熱', battle: '熱', calm: '静', rest: '静', silence: '間', breath: '間', build: '溜め' };
    const type = section || map[name] || '熱';
    const e = this.engine;
    e.planner.forceNow(type, type === '間' ? 4 : 8, { landing: true }); e.planner._peek = undefined; e.pendingChange = false; e.bridge = null;
    e.nextGait = e.overrides.gait || e.pickGait(motionOf(clampLatent(e.target)));
    e.morphTime = 2 * e.beat; e.morphUntil = e.time + e.morphTime;
    const nextB = e.barStartBeat + Math.ceil(e.beatNow - e.barStartBeat - 1e-6); // 次の拍
    e.crossfade(); // 予定済みの古い音は弱めながら受け渡す（シンバルで隠さない）
    e.secBar = 0; e.nextBarBeat = Math.max(e.beatNow, nextB); e.afterCue = true; e.tempoPlan = null;
    e.openTx(tx ?? ++this.txSeq, 'now', (e.nextBarBeat - e.beatNow) * e.beat);
    if (e.style.logo) e.logoAt = e.time + (e.nextBarBeat - e.beatNow) * e.beat;
    this.emitLocal({ type: 'cue', name, section: type, time: e.time });
    return { tx: e.tx.id, plan: 'now', eta: e.tx.eta };
  }
  // 言葉 → 意味座標の変化（Node 用。ブラウザでは client.js がサーバーの LLM を呼ぶ）
  async say(text) {
    if (!this.handlers.onSay) throw new Error('onSay が設定されていない');
    const before = this.state();
    const r = await this.handlers.onSay(text, before);
    if (r.scene || r.blend) this.situation({ scene: r.scene, blend: r.blend, intensity: r.intensity });
    else if (r.intensity !== undefined) this.situation({ intensity: r.intensity });
    if (r.delta) this.nudge(r.delta);
    if (r.patch) this.set(r.patch);
    this.record({ kind: 'say', text, result: r, before: before.latent });
    return r;
  }
  // 相対的な変化（「もう少し明るく」）: 累積して合成の後に足す。新しい situation で消える
  nudge(delta) {
    for (const [p, v] of Object.entries(flattenPatch(delta))) if (Number.isFinite(v)) this.offset[p] = Math.max(-0.6, Math.min(0.6, (this.offset[p] || 0) + Math.max(-0.5, Math.min(0.5, v))));
    this.recompute(); return this;
  }
  // 好み: その時点の全状態と一緒に記録し、スタイル（事前分布の偏り）を少しずつ動かす
  feedback(score, note = '') {
    const st = this.state(), s = this.engine.style, f = score > 0 ? 1.15 : 0.87;
    for (const inst of Object.values(st.instruments || {})) s.instruments[inst] = (s.instruments[inst] ?? 1) * f;
    if (st.progression) s.progressions[st.progression] = (s.progressions[st.progression] ?? 1) * f;
    this.record({ kind: 'feedback', score, note, state: st });
    return this;
  }
  record(r) { const rec = { t: Date.now(), ...r }; this.handlers.onFeedback?.(rec); this.emitLocal({ type: 'record', ...rec }); }

  // ================= 手動の口 =================
  set(patch) { Object.assign(this.manual, flattenPatch(patch)); this.recompute(); return this; }
  unset(paths) { for (const p of [].concat(paths)) delete this.manual[p]; this.recompute(); return this; }
  lock(paths) {
    this.lockedValues ||= {};
    for (const p of [].concat(paths)) {
      if (['gait', 'bpm', 'key', 'progression'].includes(p)) { const e = this.engine; this[p === 'bpm' ? 'tempo' : p](p === 'bpm' ? e.bpm : p === 'gait' ? e.gait : p === 'key' ? e.key : e.prog?.name); continue; }
      this.locks.add(p); this.lockedValues[p] = getAt(this.engine.target, p);
    }
    this.recompute(); return this;
  }
  unlock(paths) {
    for (const p of [].concat(paths)) {
      if (['gait', 'bpm', 'key', 'progression'].includes(p)) { delete this.engine.overrides[p]; continue; }
      this.locks.delete(p); delete this.lockedValues?.[p];
    }
    this.recompute(); return this;
  }
  form({ section, bars, contrast, auto } = {}) {
    if (contrast !== undefined) this.engine.contrast = contrast;
    if (section) this.cue('manual', { section });
    if (bars && section) this.engine.planner.forceNow(section, bars);
    return this;
  }
  // スタイルマナー（core/manner.js）: 全体のマナーを重ねる。名前を付けて登録し、チャンネルに結び付けることもできる
  style(s) { this.globalManner = mergeManners([this.globalManner, s]); this.applyManner(); this.engine.motifs = null; return this; }
  manner(name, def) { (this.manners ||= {})[name] = def; this.applyManner(); return this; }
  // 有効なマナー = 全体 + チャンネルのマナー（重みの小さい順に重ねるので、いちばん重いチャンネルが勝つ）
  applyManner() {
    const chs = [...this.channels.values()].filter((c) => c.manner && c.weight > 0).sort((a, b) => a.weight - b.weight);
    const list = [this.globalManner, ...chs.map((c) => (typeof c.manner === 'string' ? this.manners?.[c.manner] : c.manner))];
    this.engine.style = mergeManners(list);
    this.activeManners = chs.map((c) => (typeof c.manner === 'string' ? c.manner : '(無名)'));
  }
  key(n) { if (n === null) delete this.engine.overrides.key; else this.engine.overrides.key = n; return this; }
  tempo(bpm) { if (bpm === null) delete this.engine.overrides.bpm; else this.engine.overrides.bpm = bpm; return this; }
  gait(g) { if (g === null) delete this.engine.overrides.gait; else this.engine.overrides.gait = g; return this; }
  progression(p) { if (p === null) delete this.engine.overrides.progression; else this.engine.overrides.progression = p; return this; }

  // ================= 読み出し =================
  state() {
    const e = this.engine;
    let ono = null; try { ono = onomatopoeia(e.z); } catch { ono = null; }
    return {
      scene: this.sceneName, channels: Object.fromEntries([...this.channels].map(([k, c]) => [k, { items: { ...c.items }, weight: c.weight, role: c.role }])), latent: clone(e.target), tx: e.tx ? { ...e.tx } : null, intensity: e.userI, I: e.I ?? null,
      gait: e.gait ?? null, bpm: e.bpm ?? null, key: e.key, progression: e.prog?.name ?? null,
      section: e.plan?.type ?? null, bars: e.plan?.bars ?? null, bar: e.secBar,
      instruments: { ...(e.instCache || {}) }, signals: { ...this.signals },
      manners: this.activeManners || [], manual: { ...this.manual }, locks: [...this.locks], overrides: { ...e.overrides }, onomatopoeia: ono, time: e.time,
    };
  }
  on(type, fn) { (this.listeners[type] ||= []).push(fn); return this; }
  emitLocal(e) { for (const f of this.listeners[e.type] || []) f(e); for (const f of this.listeners['*'] || []) f(e); }
  vocabulary() { return vocabulary(); }

  // JSON の命令: { op: 'situation', args: {...} } / { op: 'signal', args: ['danger', 0.8] }
  command({ op, args }) {
    const allowed = ['mix', 'weight', 'situation', 'signal', 'bind', 'cue', 'nudge', 'manner', 'feedback', 'set', 'unset', 'lock', 'unlock', 'form', 'style', 'key', 'tempo', 'gait', 'progression', 'state', 'vocabulary'];
    if (!allowed.includes(op)) throw new Error(`unknown op: ${op}`);
    return Array.isArray(args) ? this[op](...args) : this[op](args);
  }

  render(L, R, offset = 0, n = L.length) { this.engine.render(L, R, offset, n); }
}
