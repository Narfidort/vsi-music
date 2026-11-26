// AudioWorklet 上でカーネルをリアルタイムに動かす。オフラインレンダリングと同じ Engine を使う。
import { Engine } from '../kernel/engine.js';

class KernelProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new Engine({ sampleRate, seed: (Math.random() * 1e9) | 0 });
    this.engine.onEvent((e) => {
      if (e.type === 'note') this.port.postMessage({ type: 'note', layer: e.layer, freq: e.freq, dur: e.dur, semi: e.semi });
    });
    this.port.onmessage = (m) => { if (m.data.type === 'set') this.engine.set(m.data.latent); };
    this.frame = 0;
  }
  process(_, outputs) {
    const out = outputs[0];
    const L = out[0], R = out[1] || out[0];
    this.engine.render(L, R, 0, L.length);
    if ((this.frame++ & 15) === 0) {
      let s = 0; for (let i = 0; i < L.length; i++) s += L[i] * L[i];
      this.port.postMessage({ type: 'level', rms: Math.sqrt(s / L.length), z: this.engine.z });
    }
    return true;
  }
}
registerProcessor('kernel', KernelProcessor);
