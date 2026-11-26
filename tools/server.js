// 開発用サーバー（依存なし）。 node tools/server.js [--port 8787]
//   静的配信: /web/ /core/ /kernel/ /assets/web/
//   POST /api/say       言葉 → 意味座標の命令（LLM。鍵は .env にだけ置き、ブラウザには出さない）
//   POST /api/feedback  記録を feedback/log.jsonl に追記
//   GET  /api/vocabulary
//   WS   /ws?role=player  音を鳴らすブラウザ（client.js の bridge）
//   WS   /ws?role=game    外部のゲーム。{ id, op, args } を送ると player が実行し、{ type:'result', id, value } が返る。
//                         player のイベント（section / transition / bar / cue / record）も届く
import http from 'node:http';
import crypto from 'node:crypto';
import { readFileSync, existsSync, statSync, createReadStream, appendFileSync, mkdirSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { resolveScene, vocabulary, EMOTIONS, SCENES } from '../core/lexicon.js';
import { PRESETS } from '../core/presets.js';

const ROOT = new URL('../', import.meta.url).pathname;
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || 8787;
const ENV = Object.fromEntries((existsSync(ROOT + '.env') ? readFileSync(ROOT + '.env', 'utf8') : '').split('\n').filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const LLM = { key: ENV.OPENCODE_API_KEY, base: ENV.OPENCODE_BASE || 'https://opencode.ai/inference/go', model: ENV.OPENCODE_MODEL || 'deepseek-v4.1-flash', session: 'vsi-' + crypto.randomUUID() };
const ALLOWED = ['web/', 'core/', 'kernel/', 'assets/web/'];
const MIME = { '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.flac': 'audio/flac', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };

// ---------- 言葉 → 命令（LLM） ----------
const AXES = 'energy(活性), lift(浮沈 -1..1), bright(明るさ), rough(粗さ), size(大きさ), edge(角), density(密度), space(広がり), distance(距離), D(離散化: 1 = 機械の演奏・電子音)。地 = ground.X、図（旋律）= figure.X、何も付けなければ地と図の両方';
function sayPrompt(text, state) {
  return [
    { role: 'system', content: `あなたはゲーム音楽エンジンの言葉の解釈係。利用者の言葉を、音楽の意味空間への命令に直す。JSON だけを返す。
形式: {"scene"?: string, "blend"?: {名前: 重み}, "delta"?: {軸: -0.5..0.5}, "intensity"?: 0..1, "reason": 短い説明}
- scene は「情景・感情」の組（例 "焚き火・追悼"）、感情だけ、情景だけ、またはプリセット名。新しい情景・気分を言われたときに使う。
- 「もっと〜」「少し〜」のような相対的な指示は delta（小さく、±0.05〜0.3）。必要なら intensity（激しさ）。
- 使える感情: ${Object.keys(EMOTIONS).join('、')}
- 使える情景: ${Object.keys(SCENES).join('、')}
- プリセット: ${Object.keys(PRESETS).join('、')}
- 軸: ${AXES}
語彙にない感情は、最も近い感情に置き換えるか、近い感情の blend にする。` },
    { role: 'user', content: `現在: ${JSON.stringify({ scene: state?.scene, gait: state?.gait, intensity: state?.intensity })}\n言葉: ${text}` },
  ];
}
function validate(r) {
  const out = { reason: String(r.reason || '').slice(0, 200) };
  if (r.scene && resolveScene(r.scene)) out.scene = r.scene;
  if (r.blend && typeof r.blend === 'object') {
    const b = {}; for (const [k, v] of Object.entries(r.blend)) if (resolveScene(k) && Number.isFinite(+v)) b[k] = Math.max(0, +v);
    if (Object.keys(b).length) out.blend = b;
  }
  if (r.delta && typeof r.delta === 'object') {
    const ok = /^((ground|figure)\.)?(energy|lift|bright|rough|size|edge|density)$|^(space|distance|D|medium)$/;
    const d = {}; for (const [k, v] of Object.entries(r.delta)) if (ok.test(k) && Number.isFinite(+v)) d[k] = Math.max(-0.5, Math.min(0.5, +v));
    if (Object.keys(d).length) out.delta = d;
  }
  if (Number.isFinite(+r.intensity)) out.intensity = Math.max(0, Math.min(1, +r.intensity));
  return out;
}
async function say(text, state) {
  if (!LLM.key) throw new Error('.env に OPENCODE_API_KEY がない');
  const res = await fetch(`${LLM.base}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${LLM.key}`, 'Content-Type': 'application/json', 'User-Agent': 'vsi-music/0.1', 'x-opencode-session': LLM.session },
    body: JSON.stringify({ model: LLM.model, messages: sayPrompt(String(text).slice(0, 500), state), max_tokens: 3000, temperature: 0.3 }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const j = await res.json();
  const content = j.choices?.[0]?.message?.content || '';
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('LLM が JSON を返さなかった');
  return validate(JSON.parse(m[0]));
}

// ---------- WebSocket（RFC 6455 の最小実装: テキストフレーム、ping/close） ----------
const clients = new Set();
function wsSend(sock, text) {
  const data = Buffer.from(text), n = data.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 127, 0, 0, 0, 0]), (() => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; })()]);
  try { sock.write(Buffer.concat([head, data])); } catch {}
}
function wsAccept(req, sock) {
  const url = new URL(req.url, 'http://x');
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const c = { sock, role: url.searchParams.get('role') === 'player' ? 'player' : 'game', id: crypto.randomUUID().slice(0, 8) };
  clients.add(c);
  let buf = Buffer.alloc(0);
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const op = buf[0] & 15, masked = buf[1] & 128; let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = buf.readUInt32BE(6); off = 10; }
      const mOff = off; if (masked) off += 4;
      if (buf.length < off + len) return;
      let payload = buf.subarray(off, off + len);
      if (masked) { const mask = buf.subarray(mOff, mOff + 4); payload = Buffer.from(payload.map((b, i) => b ^ mask[i & 3])); }
      buf = buf.subarray(off + len);
      if (op === 8) { sock.end(); return; }
      if (op === 9) { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
      if (op === 1) onWsMessage(c, payload.toString('utf8'));
    }
  });
  const bye = () => clients.delete(c);
  sock.on('close', bye); sock.on('error', bye);
}
function onWsMessage(c, text) {
  let m; try { m = JSON.parse(text); } catch { return; }
  if (c.role === 'game') {
    // ゲーム → すべての player へ（命令）
    const players = [...clients].filter((x) => x.role === 'player');
    if (!players.length) return wsSend(c.sock, JSON.stringify({ type: 'result', id: m.id, error: 'no player connected（音を鳴らすブラウザを開いてください）' }));
    for (const p of players) wsSend(p.sock, JSON.stringify({ ...m, from: c.id }));
  } else {
    // player → ゲーム（結果は依頼元へ、イベントは全員へ）
    for (const g of clients) if (g.role === 'game' && (m.type === 'event' || g.id === m.to)) wsSend(g.sock, text);
  }
}

// ---------- HTTP ----------
function body(req) { return new Promise((res) => { let s = ''; req.on('data', (d) => { s += d; if (s.length > 1e6) req.destroy(); }); req.on('end', () => res(s)); }); }
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': MIME['.json'] }); res.end(JSON.stringify(obj)); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'POST' && url.pathname === '/api/say') {
      const { text, state } = JSON.parse(await body(req) || '{}');
      return json(res, 200, await say(text, state));
    }
    if (req.method === 'POST' && url.pathname === '/api/feedback') {
      const rec = JSON.parse(await body(req) || '{}');
      mkdirSync(ROOT + 'feedback', { recursive: true });
      appendFileSync(ROOT + 'feedback/log.jsonl', JSON.stringify({ ...rec, received: new Date().toISOString() }) + '\n');
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/vocabulary') return json(res, 200, vocabulary());
    if (url.pathname === '/') { res.writeHead(302, { Location: '/web/test/' }); return res.end(); }
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (rel.endsWith('/')) rel += 'index.html';
    const p = normalize(rel);
    if (p.includes('..') || !ALLOWED.some((a) => p.startsWith(a))) return json(res, 404, { error: 'not found' });
    const f = join(ROOT, p);
    if (!existsSync(f) || !statSync(f).isFile()) return json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': p.startsWith('assets/') ? 'max-age=86400' : 'no-cache' });
    createReadStream(f).pipe(res);
  } catch (err) { json(res, 500, { error: String(err.message || err) }); }
});
server.on('upgrade', (req, sock) => { if (new URL(req.url, 'http://x').pathname === '/ws') wsAccept(req, sock); else sock.destroy(); });
server.listen(PORT, '127.0.0.1', () => console.log(`http://localhost:${PORT}/  （LLM: ${LLM.key ? LLM.model : '未設定'}）`));
