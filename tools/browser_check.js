// 実ブラウザ（ヘッドレス Chrome、一時プロファイル）で実行環境を確かめる。node tools/browser_check.js <scratch dir>
// サーバー（node tools/server.js）を先に起動しておく
import { spawn } from 'node:child_process';
const dir = process.argv[2] || '/tmp/vsi-chrome';
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${dir}/profile`, '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list; for (let i = 0; i < 50; i++) { try { list = await (await fetch('http://127.0.0.1:9333/json/list')).json(); if (list.length) break; } catch {} await sleep(200); }
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = new Map(); const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[console.${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
};
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
await cdp('Runtime.enable'); await cdp('Page.enable');
let fail = 0; const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fail++; };

// 1) 試験台のページで SDK を直接使う
await cdp('Page.navigate', { url: 'http://localhost:8787/web/test/' }); await sleep(1500);
const t0 = Date.now();
const r1 = await ev(`(async () => { const { MusicClient } = await import('/web/runtime/client.js'); window.m = await MusicClient.create({ scene: '深海' }); await m.start(); return m.ctx.state; })()`);
ok(r1 === 'running', `AudioContext が動いた（${r1}、読み込み ${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
await sleep(6000);
const s1 = await ev(`m.state().then(s => ({ scene: s.scene, gait: s.gait, bpm: s.bpm, time: s.time, section: s.section }))`);
ok(s1 && s1.time > 3, `カーネルが実時間で進んでいる（${JSON.stringify(s1)}）`);
await ev(`(async () => { window.ev = []; m.on('*', e => ev.push(e.type)); await m.situation({ scene: 'はしゃぐ', intensity: 0.7 }); await m.cue('boss'); })()`);
await sleep(8000);
const s2 = await ev(`m.state().then(s => ({ scene: s.scene, gait: s.gait, bpm: Math.round(s.bpm), section: s.section, inst: s.instruments }))`);
ok(s2?.gait === '跳ねる', `命令で切り替わった（${JSON.stringify(s2)}）`);
const evs = await ev(`[...new Set(ev)]`);
ok(Array.isArray(evs) && evs.includes('section'), `イベントが届く（${evs}）`);
const loaded = await ev(`m.loaded.size`); ok(loaded > 50, `録音を読み込んだ（${loaded} ファイル）`);
const said = await ev(`m.say('夜明けの希望').then(r => JSON.stringify(r)).catch(e => 'ERR ' + e.message)`);
ok(said && !String(said).startsWith('ERR'), `say（LLM 経由）: ${said}`);

// 2) 円盤の UI: 押して開始 → 円盤をつかんで置く → ダブルクリックで 2 つ目 → 右端の線で激しさ
await cdp('Page.navigate', { url: 'http://localhost:8787/web/ui/' }); await sleep(2000);
const mouse = (type, x, y, clickCount = 1) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount });
const [cw, ch] = await ev(`[innerWidth, innerHeight]`), mid = [cw / 2, ch / 2];
await mouse('mousePressed', 40, ch - 60); await mouse('mouseReleased', 40, ch - 60); await sleep(4000); // 開始
await mouse('mousePressed', mid[0], mid[1]);
for (let i = 1; i <= 20; i++) { await mouse('mouseMoved', mid[0] - i * 12, mid[1] + i * 4); await sleep(30); }
await mouse('mouseReleased', mid[0] - 240, mid[1] + 80);
await mouse('mousePressed', mid[0] + 200, mid[1] - 120, 1); await mouse('mouseReleased', mid[0] + 200, mid[1] - 120, 1);
await mouse('mousePressed', mid[0] + 200, mid[1] - 120, 2); await mouse('mouseReleased', mid[0] + 200, mid[1] - 120, 2);
await mouse('mousePressed', cw - 26, ch * 0.3); await mouse('mouseReleased', cw - 26, ch * 0.3);
await sleep(3000);
const uiState = await ev(`(async () => { const s = await window.__music?.state(); return s ? { scene: s.scene, gait: s.gait, I: +s.intensity.toFixed(2) } : null })()`);
ok(uiState && /mood:/.test(uiState.scene) && uiState.I > 0.6, `UI の状態: ${JSON.stringify(uiState)}`);
const shot = await cdp('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs'); writeFileSync(`${dir}/ui.png`, Buffer.from(shot.result.data, 'base64'));
ok(true, `UI のスクリーンショット: ${dir}/ui.png`);
// 3) ゲーム: 歩いて場所に入ると命令が出る
await cdp('Page.navigate', { url: 'http://localhost:8787/web/game/' }); await sleep(1500);
await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 300, y: 200, button: 'left', clickCount: 1 });
await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 300, y: 200, button: 'left', clickCount: 1 });
await sleep(2500);
const key = async (k, code, ms) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code }); await sleep(ms); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code }); };
await key('a', 'KeyA', 700); await key('s', 'KeyS', 500); await sleep(3000);   // 村へ
await key('d', 'KeyD', 2600); await sleep(3000);                                 // 湖へ
const apiText = await ev(`document.getElementById('api').textContent`);
ok(/mix\(/.test(apiText || ''), `ゲームが API を呼んだ:\n  ${String(apiText).split('\n').slice(0, 4).join('\n  ')}`);
const shot2 = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${dir}/game.png`, Buffer.from(shot2.result.data, 'base64'));
const errs = logs.filter((l) => /exception|error/i.test(l));
ok(errs.length === 0, `コンソールのエラーなし${errs.length ? '\n  ' + errs.slice(0, 5).join('\n  ') : ''}`);
ws.close(); chrome.kill();
console.log(fail ? `\n${fail} 件失敗` : '\nすべて通過');
process.exit(fail ? 1 : 0);
