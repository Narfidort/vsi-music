// 音声スレッド（AudioWorklet）でカーネルを動かす。命令（JSON）を受け、イベントを返す。
// 録音サンプルは非同期: 足りないファイルは 'need' で頼み、届くまでその音は鳴らさない。
import { Music } from '../../core/api.js';
import { setCatalog, setLoader, setBuffer } from '../../core/sampler.js';

class VSIProcessor extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    const o = opts.processorOptions || {};
    this.requested = new Set(); this.wantNotes = false; this.playing = true;
    if (o.catalog) setCatalog(o.catalog);
    setLoader((file) => { if (!this.requested.has(file)) { this.requested.add(file); this.port.postMessage({ type: 'need', file }); } return null; });
    this.music = new Music({ sampleRate, seed: o.seed ?? 1, scene: o.scene || '優しさ', style: o.style || {} });
    this.music.on('*', (event) => {
      if (event.type === 'note' && !this.wantNotes) return;
      if (event.type === 'bar') event = { type: 'bar', time: event.time, section: event.section, bar: event.bar, gait: event.gait, bpm: event.bpm, I: event.I, key: event.key, chord: event.chord };
      this.port.postMessage({ type: 'event', event });
    });
    this.port.onmessage = (e) => this.onMessage(e.data);
    this.port.postMessage({ type: 'ready' });
  }
  onMessage(m) {
    if (m.type === 'buffer') setBuffer(m.file, m.data);
    else if (m.type === 'command') {
      try {
        const r = this.music.command({ op: m.op, args: m.args });
        const value = r && r.constructor === Object ? r : null; // state・vocabulary・取引 { tx, plan, eta }
        this.port.postMessage({ type: 'result', id: m.id, value });
      } catch (err) { this.port.postMessage({ type: 'result', id: m.id, error: String(err && err.message || err) }); }
    } else if (m.type === 'notes') this.wantNotes = !!m.on;
    else if (m.type === 'pause') this.playing = !m.on;
  }
  process(_in, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || out[0];
    if (!this.playing) return true;
    this.music.render(L, R, 0, L.length);
    return true;
  }
}
registerProcessor('vsi-music', VSIProcessor);
