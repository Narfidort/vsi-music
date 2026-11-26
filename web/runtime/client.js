// ブラウザ側の SDK。カーネル（AudioWorklet）に命令を送り、イベントを受け取る。docs/08_api.md
//   const music = await MusicClient.create({ scene: '焚き火・団らん' });
//   await music.start();                       // 利用者の操作（クリック）の中で呼ぶ
//   music.situation({ scene: '戦場・決意', intensity: 0.7 });
//   music.cue('boss');  music.signal('danger', 0.8);  await music.say('もっと切なく');
//   music.on('section', (e) => ...);
// 外部のゲーム（別のプロセス）からは、サーバーの WebSocket（/ws?role=game）に同じ JSON の命令を送る。
//   この SDK を bridge: true で作ると、サーバーから届いた命令を実行し、イベントを送り返す。

const OPS = ['mix', 'weight', 'situation', 'signal', 'bind', 'cue', 'nudge', 'feedback', 'set', 'unset', 'lock', 'unlock', 'form', 'style', 'key', 'tempo', 'gait', 'progression', 'state', 'vocabulary'];
const PRELOAD = ['piano', 'vc_sus', 'vln_sus', 'cb_sus', 'harp', 'glock'];

export class MusicClient {
  static async create({ base = new URL('../../', import.meta.url).href.replace(/\/$/, ''), scene = '優しさ', style = {}, seed = 1, latencyHint = 'playback', bridge = false, preload = PRELOAD, onProgress = null } = {}) {
    const ctx = new AudioContext({ sampleRate: 48000, latencyHint });
    ctx.resume().catch(() => {}); // iOS Safari: 利用者の操作（タップ）の中で同期的に開始しないと鳴らない
    const catalog = await (await fetch(`${base}/assets/web/catalog.json`)).json();
    await ctx.audioWorklet.addModule(`${base}/web/runtime/music-worklet.js`);
    const c = new MusicClient(ctx, catalog, base);
    c.node = new AudioWorkletNode(ctx, 'vsi-music', { numberOfInputs: 0, outputChannelCount: [2], processorOptions: { catalog, scene, style, seed } });
    c.node.port.onmessage = (e) => c.onMessage(e.data);
    c.gain = ctx.createGain(); c.node.connect(c.gain).connect(ctx.destination);
    await c.preloadInstruments(preload, onProgress);
    if (bridge) c.connectBridge();
    return c;
  }

  constructor(ctx, catalog, base) {
    this.ctx = ctx; this.catalog = catalog; this.base = base;
    this.pending = new Map(); this.nextId = 1; this.listeners = {}; this.loaded = new Set(); this.loading = new Map();
    this.fileToInst = new Map();
    for (const [name, x] of Object.entries(catalog.instruments)) for (const n of x.notes) this.fileToInst.set(n.file, name);
    for (const [name, lst] of Object.entries(catalog.perc)) for (const n of lst) this.fileToInst.set(n.file, 'perc:' + name);
    for (const op of OPS) if (!this[op]) this[op] = (...args) => this.send(op, ...args);
  }

  // ---- 再生 ----
  async start() { await this.ctx.resume(); }
  async stop() { await this.ctx.suspend(); }
  volume(v) { this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  noteEvents(on = true) { this.node.port.postMessage({ type: 'notes', on }); }

  // ---- 命令 ----
  send(op, ...args) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.node.port.postMessage({ type: 'command', id, op, args });
    });
  }
  // 言葉 → 命令。サーバー（/api/say、LLM）があればそれを、なければブラウザ内の埋め込みで解釈する（web/runtime/say_local.js）
  async say(text, { mode = this.sayMode || 'auto' } = {}) {
    const state = await this.state();
    let r = null;
    if (mode !== 'local') {
      try {
        const res = await fetch(`${this.base}/api/say`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, state: { scene: state.scene, gait: state.gait, intensity: state.intensity, latent: state.latent } }) });
        if (res.ok) { r = await res.json(); if (r.error) throw new Error(r.error); }
      } catch (e) { if (mode === 'server') throw e; r = null; }
    }
    if (!r) { const { interpretLocal } = await import('./say_local.js'); r = await interpretLocal(text, { base: this.base }); r.local = true; }
    const intensity = r.intensity ?? (r.intensityDelta !== undefined ? Math.max(0, Math.min(1, (state.intensity ?? 0.5) + r.intensityDelta)) : undefined);
    if (r.scene || r.blend) await this.situation({ scene: r.scene, blend: r.blend, intensity });
    else if (intensity !== undefined) await this.situation({ intensity });
    if (r.manner) await this.mix('main', undefined, { manner: r.manner });
    if (r.delta) await this.nudge(r.delta);
    this.log({ kind: 'say', text, result: r, scene: state.scene });
    return r;
  }
  // 記録: サーバーがあれば feedback/log.jsonl へ、なければブラウザ内（localStorage）に貯める（exportLog で書き出せる）
  log(rec) {
    const r = { t: Date.now(), ...rec };
    fetch(`${this.base}/api/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) })
      .then((x) => { if (!x.ok) throw new Error(); }).catch(() => { try { const a = JSON.parse(localStorage.getItem('vsi_log') || '[]'); a.push(r); localStorage.setItem('vsi_log', JSON.stringify(a.slice(-2000))); } catch {} });
  }
  exportLog() { let a = []; try { a = JSON.parse(localStorage.getItem('vsi_log') || '[]'); } catch {} const blob = new Blob([a.map((x) => JSON.stringify(x)).join('\n')], { type: 'application/x-ndjson' }); const u = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = u; l.download = 'vsi_feedback.jsonl'; l.click(); URL.revokeObjectURL(u); }

  // ---- イベント ----
  on(type, fn) { (this.listeners[type] ||= []).push(fn); return this; }
  emit(e) { for (const f of this.listeners[e.type] || []) f(e); for (const f of this.listeners['*'] || []) f(e); }

  onMessage(m) {
    if (m.type === 'result') {
      const p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id);
      m.error ? p.reject(new Error(m.error)) : p.resolve(m.value);
    } else if (m.type === 'event') {
      this.emit(m.event);
      if (m.event.type === 'record') this.log(m.event); // 好みの記録はサーバーへ
      if (this.ws?.readyState === 1 && m.event.type !== 'note') this.ws.send(JSON.stringify({ type: 'event', event: m.event }));
    } else if (m.type === 'need') this.requestFile(m.file, true);
  }

  // ---- 録音サンプルの読み込み（足りないものは頼まれたときに。楽器ごとまとめて） ----
  async loadFile(file) {
    if (this.loaded.has(file)) return;
    if (this.loading.has(file)) return this.loading.get(file);
    const p = (async () => {
      const buf = await (await fetch(`${this.base}/${file}`)).arrayBuffer();
      const audio = await this.ctx.decodeAudioData(buf);
      const data = audio.getChannelData(0).slice();
      this.node.port.postMessage({ type: 'buffer', file, data }, [data.buffer]);
      this.loaded.add(file);
    })();
    this.loading.set(file, p);
    try { await p; } finally { this.loading.delete(file); }
  }
  filesOf(inst) {
    if (inst.startsWith('perc:')) return this.catalog.perc[inst.slice(5)].map((n) => n.file);
    return this.catalog.instruments[inst].notes.map((n) => n.file);
  }
  async loadMany(files, onProgress) {
    let done = 0; const queue = files.filter((f) => !this.loaded.has(f));
    const worker = async () => { while (queue.length) { await this.loadFile(queue.shift()).catch(() => {}); done++; onProgress?.(done, files.length); } };
    await Promise.all(Array.from({ length: 6 }, worker));
  }
  requestFile(file, wholeInstrument) {
    this.loadFile(file).catch(() => {});
    const inst = this.fileToInst.get(file);
    if (wholeInstrument && inst && !this.instRequested?.has(inst)) { (this.instRequested ||= new Set()).add(inst); this.loadMany(this.filesOf(inst)); }
  }
  async preloadInstruments(names, onProgress) {
    const files = names.flatMap((n) => (this.catalog.instruments[n] ? this.filesOf(n) : []));
    for (const n of names) (this.instRequested ||= new Set()).add(n);
    await this.loadMany(files, onProgress);
  }

  // ---- 外部のゲームとの橋（WebSocket） ----
  connectBridge() {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?role=player`;
    this.ws = new WebSocket(url);
    this.ws.onmessage = async (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (!m.op) return;
      try {
        const value = m.op === 'say' ? await this.say(...(m.args || [])) : await this.send(m.op, ...(Array.isArray(m.args) ? m.args : [m.args]));
        this.ws.send(JSON.stringify({ type: 'result', id: m.id, to: m.from, value }));
      } catch (err) { this.ws.send(JSON.stringify({ type: 'result', id: m.id, to: m.from, error: String(err.message || err) })); }
    };
    this.ws.onclose = () => setTimeout(() => this.connectBridge(), 2000);
  }
}
