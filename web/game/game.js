// Lantern Walk: ゲームの出来事が音楽の API（docs/08_api.md）に命令を送る例。
// ゲームは音楽の中身を知らない。系統ごとの「チャンネル」に「語: 比率」の辞書を送るだけ。カーネルが意味空間で線形結合する。
//   place   … いる場所。ゾーンからの距離で比率が連続的に変わる（境目では 2 つの場所の混合）。役割 both（世界 + その場所のふつうの気分）
//   threat  … 脅威。影の近さで重みが上がる（緊張・不安）。戦闘中は怒り・決意を重み 3 で（気分を支配する）。役割 mood（世界は場所のまま）
//   outcome … 勝利。重み 3 から時間とともに 0 へ
//   signal('danger') … 激しさだけ（区間の強度と遷移の偏り）
//   cue('boss') … 影に触れた瞬間（次の拍で熱へ）
// 返り値の取引 { tx, plan, eta } と、着地のイベント landed を画面に出す（いつ・どう変わるかが分かる）。
// 焚き火のパチパチはゲームのオブジェクトの効果音（BGM の担当外）。距離で大きさが変わる簡単な合成音。
import { MusicClient } from '../runtime/client.js';

const cv = document.getElementById('cv'), g = cv.getContext('2d');
let W, H; const fit = () => { const d = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; g.setTransform(d, 0, 0, d, 0, 0); }; addEventListener('resize', fit); fit();

// 世界（0..1 の座標）
const ZONES = [
  { name: '村', scene: '焚き火', x: 0.25, y: 0.62, r: 0.13, hue: 30 },
  { name: '湖', scene: '海中', x: 0.72, y: 0.66, r: 0.16, hue: 200, lake: true },
  { name: '森', scene: '森', x: 0.55, y: 0.25, r: 0.15, hue: 140 },
  { name: '遺跡', scene: '追悼', x: 0.15, y: 0.2, r: 0.1, hue: 280 },
];
const FIELD = { name: '草原', scene: '草原' };
const FIRE = { x: 0.25, y: 0.62 };
const player = { x: 0.4, y: 0.5, vx: 0, vy: 0 };
let shadows = [], battle = null, victoryAt = 0, zone = null, lastPlace = {}, lastDanger = -1, lastThreat = '', lastOutcomeW = 0, sendT = 0;
const keys = new Set();
// タッチ: 画面の左半分をドラッグ = 仮想スティック（押した所が中心）、灯ボタン = 灯りを放つ
const stick = { on: false, id: null, ox: 0, oy: 0, x: 0, y: 0, ax: 0, ay: 0 };
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.getElementById('help').textContent = '左側をドラッグして歩く　灯ボタンで影を祓う';
cv.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || stick.on) return;
  Object.assign(stick, { on: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, ax: 0, ay: 0 });
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', (e) => {
  if (!stick.on || e.pointerId !== stick.id) return;
  stick.x = e.clientX; stick.y = e.clientY;
  const dx = stick.x - stick.ox, dy = stick.y - stick.oy, r = Math.hypot(dx, dy), R = 56;
  stick.ax = r > 6 ? (dx / Math.max(r, R)) : 0; stick.ay = r > 6 ? (dy / Math.max(r, R)) : 0;
});
const stickEnd = (e) => { if (e.pointerId === stick.id) Object.assign(stick, { on: false, id: null, ax: 0, ay: 0 }); };
cv.addEventListener('pointerup', stickEnd); cv.addEventListener('pointercancel', stickEnd);
document.getElementById('burst').addEventListener('pointerdown', (e) => { e.preventDefault(); burst(); });
addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); if (e.key === ' ') { e.preventDefault(); burst(); } });
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

// API の呼び出しを画面に出す
const apiLog = [];
let music = null;
function show() { document.getElementById('api').textContent = apiLog.slice(0, innerWidth < 700 ? 5 : 9).join('\n'); }
function api(op, ...args) {
  const line = { text: `${op}(${args.map((a) => JSON.stringify(a)).join(', ')})` };
  apiLog.unshift(line.text); apiLog.length = Math.min(apiLog.length, innerWidth < 700 ? 5 : 12); show();
  return music?.[op](...args).then((r) => {
    if (r?.tx) { const i = apiLog.indexOf(line.text); if (i >= 0) apiLog[i] = `${line.text}  → tx${r.tx} ${r.plan} 約${r.eta.toFixed(1)}秒`; show(); }
    return r;
  }).catch((e) => console.warn(e));
}

document.getElementById('start').onclick = async () => {
  document.getElementById('start').textContent = 'loading…';
  music = await MusicClient.create({ scene: FIELD.scene });
  await music.start();
  document.getElementById('start').remove();
  api('mix', 'main', null);
  api('bind', 'danger', { intensity: 0.6 });
  music.on('landed', (e) => { apiLog.unshift(`  ✓ tx${e.tx} 着地（${e.plan}、${e.after.toFixed(1)}秒）`); show(); });
  music.on('section', (e) => (hud.section = `${e.name} · ${e.gait} · ${Math.round(e.bpm)} BPM · ${e.prog}`));
  music.on('transition', (e) => (hud.trans = `${e.from} → ${e.to}`));
  setupFireSE();
  setInterval(async () => { const st = await music.state(); if (st.gait) hud.section = `${st.section} · ${st.gait} · ${Math.round(st.bpm)} BPM · ${st.progression}`; }, 1000);
  spawnTimer = 6;
};
const hud = { section: '', trans: '' };

// ---- ゲームの効果音（焚き火）: BGM とは別。ゲームのオブジェクトが鳴らす ----
let fireGain = null;
function setupFireSE() {
  const ctx = music.ctx, len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() < 0.0015 ? (Math.random() * 2 - 1) * (0.3 + Math.random()) : 0; // まばらなクリック
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
  fireGain = ctx.createGain(); fireGain.gain.value = 0;
  src.connect(hp).connect(fireGain).connect(ctx.destination); src.start();
}

// ---- 影（敵） ----
let spawnTimer = 999;
function spawn() { const a = Math.random() * Math.PI * 2; shadows.push({ x: player.x + Math.cos(a) * 0.45, y: player.y + Math.sin(a) * 0.45, hp: 3, t: 0 }); }
function burst() {
  if (!music) return;
  flashes.push({ x: player.x, y: player.y, t: 0 });
  for (const s of shadows) if (Math.hypot(s.x - player.x, s.y - player.y) < 0.12) { s.hp--; s.hit = 0.3; }
  const before = shadows.length; shadows = shadows.filter((s) => s.hp > 0);
  if (battle && before > 0 && shadows.length === 0) { // 祓い終えた
    battle = null; victoryAt = performance.now();
    api('signal', 'danger', 0); lastDanger = 0;
    api('mix', 'threat', null); lastThreat = '';
    api('mix', 'outcome', { 勝利: 1 }, { weight: 3, role: 'mood', transition: 'now' }); lastOutcomeW = 3;
  }
}
const flashes = [];

// ---- 進行 ----
let last = performance.now();
function step(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const ax = ((keys.has('d') || keys.has('arrowright')) - (keys.has('a') || keys.has('arrowleft'))) || stick.ax;
  const ay = ((keys.has('s') || keys.has('arrowdown')) - (keys.has('w') || keys.has('arrowup'))) || stick.ay;
  const inLake = Math.hypot(player.x - ZONES[1].x, player.y - ZONES[1].y) < ZONES[1].r;
  const sp = inLake ? 0.12 : 0.22;
  player.vx += (ax * sp - player.vx) * Math.min(1, dt * 8); player.vy += (ay * sp - player.vy) * Math.min(1, dt * 8);
  player.x = Math.min(0.98, Math.max(0.02, player.x + player.vx * dt)); player.y = Math.min(0.98, Math.max(0.02, player.y + player.vy * dt));

  if (music) {
    // 影
    spawnTimer -= dt; if (spawnTimer < 0 && !battle && performance.now() - victoryAt > 15000) { spawn(); spawnTimer = 18 + Math.random() * 14; }
    let near = Infinity;
    for (const s of shadows) {
      s.t += dt; const dx = player.x - s.x, dy = player.y - s.y, d = Math.hypot(dx, dy); near = Math.min(near, d);
      const v = battle ? 0.09 : 0.05; s.x += (dx / d) * v * dt + Math.sin(s.t * 2) * 0.01 * dt; s.y += (dy / d) * v * dt + Math.cos(s.t * 1.7) * 0.01 * dt;
      if (s.hit) s.hit = Math.max(0, s.hit - dt);
    }
    const danger = shadows.length ? Math.max(0, Math.min(1, 1 - (near - 0.06) / 0.35)) : 0;
    if (Math.abs(danger - lastDanger) > 0.08) { lastDanger = danger; api('signal', 'danger', +danger.toFixed(2)); }
    if (!battle && near < 0.06) { battle = true; api('mix', 'threat', { 怒り: 0.5, 決意: 0.5 }, { weight: 3, role: 'mood' }); lastThreat = 'battle'; api('cue', 'boss'); }
    const tnow = performance.now();
    if (tnow - sendT > 500) {
      sendT = tnow;
      // 脅威（戦闘前）: 近さに応じた重みの緊張
      if (!battle) {
        const w = +(danger * 1.5).toFixed(1), key = w > 0 ? `near${w}` : '';
        if (key !== lastThreat) { lastThreat = key; api('mix', 'threat', w > 0 ? { 緊張: 0.6, 不安: 0.4 } : null, { weight: w, role: 'mood' }); }
      }
      // 場所: ゾーンの中心からの距離で比率（境目は混合）。湖は中心ほど深海
      const place = {}; let tot = 0;
      for (const Z of ZONES) {
        const d = Math.hypot(player.x - Z.x, player.y - Z.y) / Z.r, w = Math.max(0, Math.min(1, (1.25 - d) / 0.5));
        if (w <= 0) continue;
        if (Z.lake) { const deep = Math.max(0, Math.min(1, (0.8 - d) / 0.6)); if (deep > 0) place.深海 = (place.深海 || 0) + w * deep; place.海中 = (place.海中 || 0) + w * (1 - deep); }
        else place[Z.scene] = (place[Z.scene] || 0) + w;
        tot += w;
      }
      if (tot < 1) place[FIELD.scene] = 1 - tot;
      const s1 = Object.values(place).reduce((a, b) => a + b, 0);
      for (const k in place) { place[k] = Math.round((place[k] / s1) * 10) / 10; if (!place[k]) delete place[k]; }
      const changed = Object.keys({ ...place, ...lastPlace }).some((k) => Math.abs((place[k] || 0) - (lastPlace[k] || 0)) >= 0.1);
      if (changed) { lastPlace = place; api('mix', 'place', place, { within: 3 }); }
      let z = null, best = 0; for (const Z of ZONES) { const d = Math.hypot(player.x - Z.x, player.y - Z.y); if (d < Z.r && (!z || d < best)) { z = Z; best = d; } }
      zone = z || FIELD;
      // 勝利の余韻: 重みを 3 → 0 へ（15 秒）
      if (lastOutcomeW > 0) { const w = +Math.max(0, 3 * (1 - (tnow - victoryAt) / 15000)).toFixed(1); if (w !== lastOutcomeW) { lastOutcomeW = w; w > 0 ? api('weight', 'outcome', w) : api('mix', 'outcome', null); } }
    }
    // 焚き火の効果音: 距離で大きさ
    if (fireGain) { const d = Math.hypot(player.x - FIRE.x, player.y - FIRE.y); fireGain.gain.setTargetAtTime(Math.max(0, 0.5 * (1 - d / 0.18)), music.ctx.currentTime, 0.1); }
  }
  draw(now); requestAnimationFrame(step);
}

function P(x, y) { return [x * W, y * H]; }
function draw(now) {
  g.clearRect(0, 0, W, H);
  const hueT = (now / 90) % 360;
  for (const Z of ZONES) {
    const [x, y] = P(Z.x, Z.y), r = Z.r * Math.min(W, H) * 1.4;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(x, y, r * (1 - i * 0.18) * W / Math.min(W, H) / 1.4, r * (1 - i * 0.18) * H / Math.min(W, H) / 1.4, 0, 0, Math.PI * 2); g.strokeStyle = `hsla(${Z.hue}, 60%, 60%, ${0.25 - i * 0.05})`; g.lineWidth = 0.6; g.stroke(); }
    g.fillStyle = `hsla(${Z.hue}, 40%, 40%, 0.5)`; g.font = '300 11px system-ui'; g.textAlign = 'center'; g.fillText(Z.name, x, y - 8);
  }
  // 焚き火
  const [fx, fy] = P(FIRE.x, FIRE.y);
  for (let i = 0; i < 5; i++) { const a = now / 300 + i; g.beginPath(); g.moveTo(fx - 4 + i * 2, fy + 6); g.quadraticCurveTo(fx + Math.sin(a) * 6, fy - 4, fx + Math.sin(a * 1.3) * 3, fy - 10 - Math.sin(a) * 3); g.strokeStyle = `hsla(${20 + i * 8}, 90%, 55%, 0.7)`; g.lineWidth = 0.7; g.stroke(); }
  // 影
  for (const s of shadows) { const [x, y] = P(s.x, s.y); for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + Math.sin(now / 200 + i) * 2, y + Math.cos(now / 230 + i) * 2, 9 + i * 4, 0, Math.PI * 2); g.strokeStyle = `rgba(40,30,60,${(s.hit ? 0.8 : 0.35) - i * 0.08})`; g.lineWidth = 0.8; g.stroke(); } }
  // 灯り
  for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.t += 0.016; if (f.t > 0.6) { flashes.splice(i, 1); continue; } const [x, y] = P(f.x, f.y); g.beginPath(); g.arc(x, y, 10 + f.t * 160, 0, Math.PI * 2); g.strokeStyle = `hsla(${hueT}, 85%, 60%, ${0.8 * (1 - f.t / 0.6)})`; g.lineWidth = 0.8; g.stroke(); }
  // 仮想スティック
  if (stick.on) { g.beginPath(); g.arc(stick.ox, stick.oy, 56, 0, Math.PI * 2); g.strokeStyle = 'rgba(120,110,200,0.35)'; g.lineWidth = 0.8; g.stroke();
    const kx = stick.ox + stick.ax * 56, ky = stick.oy + stick.ay * 56; g.beginPath(); g.arc(kx, ky, 16, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill(); g.strokeStyle = `hsla(${hueT}, 70%, 60%, 0.8)`; g.stroke(); }
  // 自分
  const [px, py] = P(player.x, player.y);
  g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.strokeStyle = `hsl(${hueT}, 80%, 50%)`; g.lineWidth = 1; g.stroke();
  g.beginPath(); g.arc(px, py, 1.5, 0, Math.PI * 2); g.fillStyle = '#2a2a2a'; g.fill();
  document.getElementById('hud').textContent = music ? `いま: ${battle ? '戦い' : zone?.name ?? '草原'}${lastOutcomeW > 0 ? '（勝利の余韻）' : ''}\nBGM: ${hud.section}\n${hud.trans ? '切り替え ' + hud.trans : ''}` : '';
}
requestAnimationFrame(step);
