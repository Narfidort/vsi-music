// 実行環境の試験（ブラウザなし）
//   1) AudioWorklet の処理器を Node で模擬して動かす（命令・結果・イベント・録音の非同期の読み込み）
//   2) サーバーの WebSocket 中継: 外部ゲーム → サーバー → 再生側（ここでは Node の Music）→ 結果とイベントがゲームへ
// 先に node tools/server.js を起動しておく
import { readFileSync } from 'node:fs';
import { readWav } from './node_samples.js';
import { Music } from '../core/api.js';
const ROOT = new URL('../', import.meta.url).pathname;
const wavOf = (f) => ROOT + f.replace('assets/web/', 'assets/samples/').replace('.flac', '.wav');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0; const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fail++; };

// ---- 1) Worklet ----
globalThis.sampleRate = 48000;
globalThis.AudioWorkletProcessor = class { constructor() { const ch = new MessageChannel(); this.port = ch.port1; this.peer = ch.port2; } };
globalThis.registerProcessor = (name, C) => { globalThis.__Proc = C; };
await import('../web/runtime/music-worklet.js');
const catalog = JSON.parse(readFileSync(ROOT + 'assets/web/catalog.json', 'utf8'));
const proc = new globalThis.__Proc({ processorOptions: { catalog, scene: '深海', seed: 2 } });
const results = new Map(); const events = []; let needs = 0;
proc.peer.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'result') results.set(m.id, m);
  if (m.type === 'event') events.push(m.event);
  if (m.type === 'need') { needs++; proc.peer.postMessage({ type: 'buffer', file: m.file, data: readWav(wavOf(m.file)) }); }
};
const cmd = async (id, op, ...args) => { proc.peer.postMessage({ type: 'command', id, op, args }); for (let i = 0; i < 50 && !results.has(id); i++) await sleep(5); return results.get(id); };
const L = new Float32Array(128), R = new Float32Array(128);
let energy = 0;
const run = async (sec) => { for (let i = 0; i < (48000 * sec) / 128; i++) { proc.process([], [[L, R]]); for (const x of L) energy += x * x; if (i % 64 === 0) await sleep(0); } };
await run(6);
ok(needs > 0, `録音を非同期に要求した（${needs} ファイル）`);
ok(energy > 0, `音が出た（エネルギー ${energy.toFixed(2)}）`);
const st = await cmd(1, 'state'); ok(String(st?.value?.scene).includes('深海'), `state が返る（scene=${st?.value?.scene}, gait=${st?.value?.gait}）`);
const bad = await cmd(2, 'situation', { scene: '存在しない情景' }); ok(!!bad?.error, `不正な命令はエラーで返る（${bad?.error}）`);
const txr = await cmd(30, 'mix', 'place', { 海中: 1 }); ok(txr?.value?.tx && txr.value.plan, `mix が取引を返す（${JSON.stringify(txr?.value)}）`);
await run(6); ok(events.some((e) => e.type === 'landed'), `着地（landed）のイベントが届いた（${JSON.stringify(events.find((e) => e.type === 'landed'))}）`);
await cmd(31, 'mix', 'place', null);
await cmd(3, 'situation', { scene: 'かわいい', intensity: 0.7 });
await cmd(4, 'cue', 'boss');
await run(20);
ok(events.some((e) => e.type === 'transition' || e.type === 'cue'), `切り替え・合図のイベントが届いた（${events.filter((e) => e.type !== 'bar').map((e) => e.type).slice(0, 6).join(', ')}）`);
const st2 = await cmd(5, 'state'); ok(st2?.value?.gait === '跳ねる', `かわいいに移った（gait=${st2?.value?.gait}）`);

// ---- 2) WebSocket 中継 ----
const base = 'ws://127.0.0.1:8787/ws';
const music = new Music({ sampleRate: 8000, scene: '焚き火・団らん' });
const player = new WebSocket(base + '?role=player');
player.onmessage = (e) => {
  const m = JSON.parse(e.data); if (!m.op) return;
  try { const v = music.command({ op: m.op, args: m.args }); player.send(JSON.stringify({ type: 'result', id: m.id, to: m.from, value: m.op === 'state' ? v : null })); }
  catch (err) { player.send(JSON.stringify({ type: 'result', id: m.id, to: m.from, error: err.message })); }
};
music.on('section', (ev) => player.readyState === 1 && player.send(JSON.stringify({ type: 'event', event: ev })));
const game = new WebSocket(base + '?role=game');
const got = new Map(); const gameEvents = [];
game.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === 'result') got.set(m.id, m); if (m.type === 'event') gameEvents.push(m.event); };
await new Promise((r) => { let n = 0; const done = () => ++n === 2 && r(); player.onopen = done; game.onopen = done; });
game.send(JSON.stringify({ id: 'a', op: 'situation', args: [{ scene: '戦場・決意', intensity: 0.8 }] }));
game.send(JSON.stringify({ id: 'b', op: 'state', args: [] }));
const B = new Float32Array(800);
for (let i = 0; i < 300; i++) { music.render(B, B.slice(), 0, 800); await sleep(1); }
ok(got.get('a') && !got.get('a').error, 'ゲームの命令（situation）が再生側で実行され、結果が返った');
ok(String(got.get('b')?.value?.scene).includes('戦場・決意'), `ゲームから state を読めた（scene=${got.get('b')?.value?.scene}）`);
ok(gameEvents.length > 0, `再生側のイベントがゲームに届いた（${gameEvents.map((e) => e.name + '/' + e.gait).slice(0, 3).join(', ')}）`);
player.close(); game.close();
console.log(fail ? `\n${fail} 件失敗` : '\nすべて通過');
process.exit(fail ? 1 : 0);
