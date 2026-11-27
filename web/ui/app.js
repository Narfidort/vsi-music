// 操作盤（Resonance Field）。カーネルには docs/08_api.md の命令だけで話す。
//   平面 = 感情の平面（Russell の円環: 横 = 快 ↔ 不快、縦 = 覚醒 ↔ 静穏）。感情語が置いてある
//   平面 = 快・覚醒・支配の 3 次元を斜め上から見た投影（core/lexicon.js project）。支配は右上への奥行き
//   円盤 = 気持ちの重り。まわりの感情語をガウスの重みで混ぜ、円盤どうしは大きさ（比率）で混ぜる → mix('mood', …)
//     何もないところをダブルクリックで足す、円盤をダブルクリックで消す、ホイールで大きさ（比率）
//   右端の線 = 激しさ（区間の強度と、熱・静の遷移の偏り）→ situation({ intensity })
//   上の情景語 = 場所（世界だけ）→ mix('place', …, { role: 'world' })
//   ♡ / ✕ = フィードバック、· · ·（/ キー）= 言葉、≡ = 詳細（軸を直接）、? = 使い方
import { MusicClient } from '../runtime/client.js';
import { vocabulary, project, EMOTIONS, SCENES } from '../../core/lexicon.js';
import { THEMES } from '../../core/themes.js';
import { Medley } from '../../core/medley.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv'), g = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
const field = document.createElement('canvas'), fg = field.getContext('2d');

const vocab = vocabulary(); // サーバーなしで動くように、語彙はカーネルのモジュールから直接
const anchors = vocab.anchors;
const M = () => Math.max(44, Math.min(W, H) * 0.09);
const GAUGE_X = () => W - 26;
const toScreen = (a) => ({ x: M() + a.x * (W - 2 * M() - 30), y: H - M() - a.y * (H - 2 * M() - 30) });
const toPlane = (x, y) => ({ x: Math.min(1, Math.max(0, (x - M()) / (W - 2 * M() - 30))), y: Math.min(1, Math.max(0, (H - M() - y) / (H - 2 * M() - 30))) });

// 平面の色: 快 = 暖色、不快 = 寒色、覚醒 = 鮮やか、静穏 = 淡い（どこがどんな雰囲気か、うっすら分かるように）
const hueAt = (x) => 232 - 200 * x;
function paintField() {
  field.width = W * DPR; field.height = H * DPR; fg.setTransform(DPR, 0, 0, DPR, 0, 0);
  fg.clearRect(0, 0, W, H);
  const R = Math.min(W, H) * 0.26;
  for (const a of anchors) {
    const s = toScreen(a), grd = fg.createRadialGradient(s.x, s.y, 0, s.x, s.y, R);
    grd.addColorStop(0, `hsla(${hueAt(a.x)}, ${45 + 35 * a.y}%, ${78 - 8 * a.y}%, 0.10)`);
    grd.addColorStop(1, `hsla(${hueAt(a.x)}, 50%, 80%, 0)`);
    fg.fillStyle = grd; fg.fillRect(s.x - R, s.y - R, 2 * R, 2 * R);
  }
}
function resize() { DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; g.setTransform(DPR, 0, 0, DPR, 0, 0); paintField(); for (const p of pucks || []) placeFromPlane(p); }
let pucks = null;
const placeFromPlane = (p) => { const s = toScreen({ x: p.u, y: p.v }); p.x = s.x; p.y = s.y; };
addEventListener('resize', resize); resize();

// ---- 情景（世界） ----
const SCENE_WORDS = vocab.scenes; // 名前のある場所（目印）。名前のない場所は API の world(距離, 広がり, 水) で指せる
let sceneWord = null;
for (const s of SCENE_WORDS) {
  const b = document.createElement('button'); b.textContent = s;
  b.onclick = () => { tut.scene = true; sceneWord = sceneWord === s ? null : s; document.querySelectorAll('#scenes button').forEach((x) => x.classList.toggle('on', x.textContent === sceneWord)); sendPlace(); };
  $('scenes').append(b);
}

// ---- 状態 ----
let music = null, starting = false, loadP = 0;
// 円盤は平面の座標（u = 快、v = 覚醒）で持つ。ウィンドウの大きさが変わっても同じ気持ちの場所に留まる
pucks = [{ u: 0.62, v: 0.32, w: 1, dm: 0.5, drag: false, gx: 0, gy: 0 }]; placeFromPlane(pucks[0]);
const radius = (p) => 13 + 9 * Math.sqrt(p.w);
let moved = 0, gaugeDrag = false, intensity = 0.45, lastI = -1, dirty = true, lastSendT = 0;
const ripples = [], sweeps = [];
let beatPulse = 0, bpm = 70, section = '', gait = '';
function toast(s, ms = 2600) { const t = $('toast'); t.textContent = s; t.style.opacity = 1; clearTimeout(toast.h); toast.h = setTimeout(() => (t.style.opacity = 0), ms); }

let startP = null;
function start() { return (startP ||= start0()); }
async function start0() {
  starting = true;
  $('intro').textContent = '';
  music = await MusicClient.create({ scene: '穏やか', onProgress: (d, n) => (loadP = d / n) });
  loadP = 1;
  await music.start();
  music.noteEvents(true);
  await music.mix('main', null);
  window.__music = music; window.__pucks = pucks; // 試験用
  music.on('note', (e) => {
    const p = pickPuck(), pc = ((Math.round(e.semi) % 12) + 12) % 12, oct = Math.floor(e.semi / 12);
    const ang = ((pc * 7) % 12) / 12 * Math.PI * 2 - Math.PI / 2; // 五度圏で並べる
    const r = radius(p) + 8 + (oct + 2) * 12;
    ripples.push({ x: p.x + Math.cos(ang) * r, y: p.y + Math.sin(ang) * r, hue: ((pc * 7) % 12) * 30, t: 0, life: Math.min(3, 0.6 + e.dur), fig: e.layer === 'figure' });
    if (ripples.length > 220) ripples.shift();
  });
  music.on('bar', (e) => { beatPulse = 1; bpm = e.bpm; section = e.section; gait = e.gait; });
  music.on('section', (e) => sweeps.push({ t: 0, name: e.name }));
  music.on('transition', (e) => toast(`${e.from} → ${e.to}`));
  $('intro').style.opacity = 0;
  dirty = true; sendIntensity();
}
function pickPuck() { let r = Math.random() * pucks.reduce((a, p) => a + p.w, 0); for (const p of pucks) if ((r -= p.w) <= 0) return p; return pucks[0]; }

// ---- 混合 ----
// 平面の点 → 感情語の重み（すべての語にガウスの重み。上位だけに切らないので、平面の上で連続的に変わる）
function blendAt(pt) {
  const s2 = 2 * 0.1 ** 2, out = {}; let sum = 0;
  for (const a of anchors) { const w = Math.exp(-((a.x - pt.x) ** 2 + (a.y - pt.y) ** 2) / s2); out[a.name] = w; sum += w; }
  for (const k in out) out[k] /= sum || 1;
  return out;
}
// 複数の円盤: 大きさ（比率）で重み付けして足す
function moodMix() {
  const tot = pucks.reduce((a, p) => a + p.w, 0), acc = {};
  for (const p of pucks) for (const [n, w] of Object.entries(blendAt({ x: p.u, y: p.v }))) acc[n] = (acc[n] || 0) + (w * p.w) / tot;
  const items = Object.entries(acc).filter(([, w]) => w > 0.03), s = items.reduce((a, [, w]) => a + w, 0);
  return Object.fromEntries(items.map(([n, w]) => [n, +(w / s).toFixed(2)]));
}
function sendMood() { if (!music) return; dirty = false; lastSendT = performance.now(); music.mix('mood', moodMix(), { role: sceneWord ? 'mood' : 'both' }).catch(() => {}); }
function sendPlace() { if (!music) return; music.mix('place', sceneWord ? { [sceneWord]: 1 } : null, { role: 'world' }).catch(() => {}); dirty = true; }
function sendIntensity() { if (!music || Math.abs(intensity - lastI) < 0.02) return; lastI = intensity; music.situation({ intensity }).catch(() => {}); }

// ---- 操作 ----
const hitPuck = (x, y) => { for (let i = pucks.length - 1; i >= 0; i--) if (Math.hypot(x - pucks[i].x, y - pucks[i].y) < radius(pucks[i]) + 6) return pucks[i]; return null; };
const gaugeY = () => [96, H - 90];
const onGauge = (x, y) => Math.abs(x - GAUGE_X()) < 16 && y > gaugeY()[0] - 12 && y < gaugeY()[1] + 12;
function setGauge(y) { const [a, b] = gaugeY(); intensity = Math.min(1, Math.max(0, (b - y) / (b - a))); tut.gauge = true; sendIntensity(); }
// タッチ: ダブルタップ（dblclick が来ない端末のため）と、円盤の長押し（大きさ = 比率を 1 → 1.8 → 0.6 と切り替える。ホイールの代わり）
let lastTap = { t: 0, x: 0, y: 0 }, press = null, lastTouchDouble = -1e9;
cv.addEventListener('pointerdown', (e) => {
  start();
  if (e.pointerType !== 'mouse') {
    const now = performance.now();
    if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { lastTap.t = 0; lastTouchDouble = now; onDouble(e.clientX, e.clientY); return; }
    lastTap = { t: now, x: e.clientX, y: e.clientY };
  }
  if (onGauge(e.clientX, e.clientY)) { gaugeDrag = true; setGauge(e.clientY); cv.setPointerCapture(e.pointerId); return; }
  const p = hitPuck(e.clientX, e.clientY);
  if (!p) return;
  press = { p, x: e.clientX, y: e.clientY, timer: setTimeout(() => {
    if (!press) return;
    const steps = [1, 1.8, 0.6], i = steps.findIndex((s) => Math.abs(s - p.w) < 0.05);
    p.w = steps[(i + 1) % steps.length]; tut.added = true; dirty = true; toast(`大きさ ${p.w}`, 900); press = null;
  }, 550) };
  p.drag = true; p.gx = p.x - e.clientX; p.gy = p.y - e.clientY;
  pucks.splice(pucks.indexOf(p), 1); pucks.push(p); // つかんだものを手前に
  cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing';
});
cv.addEventListener('pointermove', (e) => {
  if (gaugeDrag) return setGauge(e.clientY);
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { clearTimeout(press.timer); press = null; }
  const p = pucks.find((q) => q.drag);
  if (!p) { cv.style.cursor = hitPuck(e.clientX, e.clientY) ? 'grab' : onGauge(e.clientX, e.clientY) ? 'ns-resize' : 'default'; return; }
  const nx = Math.min(W - 50, Math.max(10, e.clientX + p.gx)), ny = Math.min(H - 10, Math.max(40, e.clientY + p.gy));
  moved += Math.hypot(nx - p.x, ny - p.y); const q = toPlane(nx, ny); p.u = q.x; p.v = q.y; placeFromPlane(p); dirty = true;
});
const release = () => { if (press) { clearTimeout(press.timer); press = null; } gaugeDrag = false; for (const p of pucks) if (p.drag) { p.drag = false; dirty = true; sendMood(); } cv.style.cursor = 'default'; };
cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
// タッチのダブルタップの後に端末が送ってくる dblclick は無視する（足した直後に消してしまうため）
cv.addEventListener('dblclick', (e) => { if (performance.now() - lastTouchDouble < 600) return; onDouble(e.clientX, e.clientY); });
// ダブルクリック / ダブルタップ: 円盤の上なら消す、何もないところなら足す
function onDouble(x, y) {
  const e = { clientX: x, clientY: y };
  const p = hitPuck(e.clientX, e.clientY);
  if (p) { if (pucks.length > 1) { pucks.splice(pucks.indexOf(p), 1); dirty = true; sendMood(); } return; }
  if (onGauge(e.clientX, e.clientY) || pucks.length >= 5) return;
  const q = toPlane(e.clientX, e.clientY), np = { u: q.x, v: q.y, w: 1, dm: 0.5, drag: false, gx: 0, gy: 0 }; placeFromPlane(np); pucks.push(np); tut.added = true; dirty = true; sendMood();
}
cv.addEventListener('wheel', (e) => {
  const p = hitPuck(e.clientX, e.clientY); if (!p) return;
  e.preventDefault();
  p.w = Math.min(3, Math.max(0.3, p.w * Math.exp(-e.deltaY * 0.0015))); tut.added = true;
  dirty = true;
}, { passive: false });
addEventListener('keydown', (e) => {
  if (document.activeElement === $('word')) return;
  if (e.key === 'ArrowUp') { intensity = Math.min(1, intensity + 0.05); sendIntensity(); }
  if (e.key === 'ArrowDown') { intensity = Math.max(0, intensity - 0.05); sendIntensity(); }
});

// ---- 使い方（操作すると次へ。? でもう一度） ----
const tut = { step: 0, t: 0, scene: false, fb: false, added: false, gauge: false, dom: false };
const STEPS = [
  { text: '円盤をつかんで、気持ちの場所へ置く', done: () => moved > 120 },
  { text: '何もないところをダブルクリックで円盤を足す（円盤のダブルクリックで消す・ホイールで大きさ = 比率）', done: () => tut.added || tut.t > 16 },
  { text: '右端の線で激しさ（上 = 熱く、下 = 静かに）', done: () => tut.gauge || tut.t > 14 },
  { text: '上のことばで場所（世界）を選ぶ', done: () => tut.scene || tut.t > 14 },
  { text: '♡ と ✕ で好み、/ キーでことばでも', done: () => tut.fb || tut.t > 14 },
  { text: '≡ で中身をのぞく。? でもう一度', done: () => tut.t > 6 },
];
let tutOn = true;
try { tutOn = localStorage.getItem('vsi_tut_v4') !== '1'; } catch {}
function tutTick(dt) {
  if (!tutOn || !music) return;
  tut.t += dt;
  if (STEPS[tut.step].done()) { tut.step++; tut.t = 0; if (tut.step >= STEPS.length) { tutOn = false; try { localStorage.setItem('vsi_tut_v4', '1'); } catch {} } }
}
const help = document.createElement('button'); help.className = 'glyph'; help.textContent = '?'; help.title = '使い方'; help.style.cssText = 'top:6px;right:40px';
help.onclick = () => { Object.assign(tut, { step: 0, t: 0, scene: false, fb: false, added: false, gauge: false, dom: false }); moved = 0; tutOn = true; };
document.body.append(help);

// ---- フィードバック・言葉 ----
$('like').onclick = () => { if (!music) return; tut.fb = true; music.feedback(1); bloom(330); toast('♡'); };
$('dislike').onclick = () => { if (!music) return; tut.fb = true; music.feedback(-1); bloom(210); openWord('どこが違う？（Enter で送る）', 'dislike'); };
const EX = ['雨の日の図書館', '和風の森で神秘的に', 'もっと明るく', 'ボス戦', '夜明けの希望', 'ケルトっぽく楽しく', '少し静かに', '亡くなった仲間を弔う'];
$('wordBtn').onclick = () => openWord(`ことばで（例: ${EX[Math.floor(Math.random() * EX.length)]}）`, 'say');
addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement !== $('word')) { e.preventDefault(); openWord(`ことばで（例: ${EX[Math.floor(Math.random() * EX.length)]}）`, 'say'); } if (e.key === 'Escape') closeWord(); });
let wordMode = 'say';
function openWord(ph, mode) { wordMode = mode; const w = $('word'); w.placeholder = ph; w.value = ''; w.style.display = 'block'; w.focus(); }
function closeWord() { $('word').style.display = 'none'; }
$('word').addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const text = e.target.value.trim(); closeWord(); if (!text || !music) return;
  tut.fb = true;
  if (wordMode === 'dislike') { music.feedback(-1, text); toast('記録しました'); return; }
  toast('…'); bloom(260);
  try { showInterpretation(text, await music.interpret(text)); } catch (e) { console.warn(e); toast('うまく解釈できませんでした'); }
});
function bloom(hue) { const p = pucks[pucks.length - 1]; for (let i = 0; i < 12; i++) ripples.push({ x: p.x, y: p.y, hue: hue + i * 8, t: 0, life: 1.6 + i * 0.05, fig: true, big: true }); }

// ---- 言葉の解釈を、平面の上の円盤として見せる（v1.6）----
// 一覧から選ぶのではなく、解釈した点（快・覚醒・支配）に「言葉の円盤」を置く。ドラッグで直せる。
// 場所は世界のチャンネル（world(…)）、様式は気分のチャンネルのマナー、「もっと明るく」は軸の調整
function showInterpretation(text, r) {
  const lines = [];
  if (r.point) {
    const q = project([r.point.V, r.point.A, r.point.D]);
    let tp = pucks.find((p) => p.label === text) || pucks.find((p) => p.label);
    if (!tp) { tp = { u: q.x, v: q.y, w: 1.4, dm: 0.5, drag: false, gx: 0, gy: 0 }; pucks.push(tp); }
    Object.assign(tp, { u: q.x, v: q.y, label: text.slice(0, 14) }); placeFromPlane(tp); dirty = true; sendMood();
    lines.push(`気分  快 ${r.point.V >= 0 ? '+' : ''}${r.point.V.toFixed(2)}・覚醒 ${r.point.A.toFixed(2)}・支配 ${r.point.D.toFixed(2)}  （近い語: ${(r.near || []).join('・')}）`);
  }
  if (r.world) {
    sceneWord = null; document.querySelectorAll('#scenes button').forEach((x) => x.classList.remove('on'));
    music.mix('place', { [r.world]: 1 }, { role: 'world' }).catch(() => {});
    lines.push(`場所  距離 ${r.worldPoint.distance}・広がり ${r.worldPoint.space}・水 ${r.worldPoint.medium}  （近い場所: ${(r.nearScenes || []).join('・')}）`);
  }
  if (r.manner) { mannerOn = r.manner; document.querySelectorAll('#manners button').forEach((x) => x.classList.toggle('on', x.textContent === mannerOn)); music.mix('mood', undefined, { manner: r.manner }); lines.push(`様式  ${r.manner}`); }
  if (r.delta) { music.nudge(r.delta); lines.push(`調整  ${Object.entries(r.delta).map(([a, x]) => `${{ bright: '明るさ', lift: '浮沈', energy: '活性', space: '広がり', distance: '距離', size: '大きさ', edge: '角', rough: '粗さ' }[a] || a} ${x > 0 ? '+' : ''}${x}`).join('・')}`); }
  if (r.intensityDelta) { intensity = Math.max(0, Math.min(1, intensity + r.intensityDelta)); sendIntensity(); lines.push(`激しさ ${r.intensityDelta > 0 ? '+' : ''}${r.intensityDelta}`); }
  const card = $('card'); card.innerHTML = `<b>「${text.replace(/[<>&]/g, '')}」</b><br>` + lines.map((l) => l.replace(/[<>&]/g, '')).join('<br>') + '<br><small>円盤をドラッグして直せます</small>';
  card.style.opacity = 1; clearTimeout(card.h); card.h = setTimeout(() => (card.style.opacity = 0), 9000);
  music.log?.({ kind: 'say', text, result: r });
}

// ---- 詳細（手動の口） ----
const AX = { world: [['distance', '距離'], ['space', '広がり'], ['medium', '水'], ['D', '離散化']], body: [['size', '大きさ'], ['bright', '明るさ'], ['edge', '角'], ['rough', '粗さ'], ['energy', '活性'], ['density', '密度'], ['lift', '浮沈']] };
const sliders = [];
function slider(parent, path, label, min = 0, max = 1) {
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="0.01"><span>—</span>`;
  const inp = row.children[1], val = row.children[2];
  inp.oninput = () => { val.textContent = (+inp.value).toFixed(2); const patch = {}; const [a, b] = path.split('.'); if (b) patch[a] = { [b]: +inp.value }; else patch[a] = +inp.value; music?.set(patch); };
  parent.append(row); sliders.push({ path, inp, val });
}
for (const [k, l] of AX.world) slider($('world'), k, l);
for (const layer of ['ground', 'figure']) for (const [k, l] of AX.body) slider($(layer), `${layer}.${k}`, l, k === 'lift' ? -1 : 0, 1);
// 様式（マナー）: 気分のチャンネルに結び付ける。もう一度押すと外す（言葉でも「和風で」「ケルトっぽく」のように選べる）
let mannerOn = null;
for (const mn of vocab.manners || []) {
  const b = document.createElement('button'); b.textContent = mn;
  b.onclick = () => { mannerOn = mannerOn === mn ? null : mn; document.querySelectorAll('#manners button').forEach((x) => x.classList.toggle('on', x.textContent === mannerOn)); music?.mix('mood', undefined, { manner: mannerOn }); toast(mannerOn ? `様式: ${mannerOn}` : '様式を外しました'); };
  $('manners').append(b);
}
// テーマ: 主題の旋律（音階の度数）と和音（ローマ数字）。サビでそのまま奏で、場面に合わせて姿を変える
// 主題のプリセット（著作権の切れた旋律とオリジナル）: 選ぶと入力欄に入り、すぐサビで聞こえる
for (const [name, t] of Object.entries(THEMES)) { const o = document.createElement('option'); o.value = name; o.textContent = `${name}（${t.source.split('。')[0]}）`; $('themePick').append(o); }
$('themePick').onchange = () => {
  const t = THEMES[$('themePick').value]; if (!t || !music) return;
  $('themeMel').value = t.melody; $('themeChd').value = t.chords;
  themeNow = { melody: t.melody, chords: t.chords, modal: !!t.modal, name: $('themePick').value };
  music.style({ theme: themeNow }); music.form({ section: '熱' }); toast(`テーマ: ${$('themePick').value}`, 2500);
};
// 無限メドレー（core/medley.js）: 主題 × 場面 × 様式を組み替え続ける。一度に変えるのは 1 つだけ、場面は近いところへ
let medley = null, medleyTimer = null;
function moodPointOf(scene) { const [a, b] = scene.split('・'); const e = EMOTIONS[b] || EMOTIONS[SCENES[a]?.mood] || [0.3, 0.4, 0.5]; return project(e); }
function applyMedley(st) {
  const pl = st.scene.split('・')[0];
  if (st.change === 'theme' || st.change === 'start') { themeNow = { melody: st.themeDef.melody, chords: st.themeDef.chords, modal: !!st.themeDef.modal, name: st.theme }; music.style({ theme: themeNow }); }
  // 場所は世界のチャンネル、気持ちは円盤（1 つ目の円盤を場面の気持ちの点へ動かす）
  sceneWord = SCENES[pl] ? pl : null; document.querySelectorAll('#scenes button').forEach((x) => x.classList.toggle('on', x.textContent === sceneWord));
  music.mix('place', sceneWord ? { [sceneWord]: 1 } : null, { role: 'world' });
  // 新しい主題はすぐサビで。円盤が動き終えて気持ちを送ってから予約する（動いている間の気持ちの変化が、曲の頭からの予約を上書きしないように）
  const fresh = st.change === 'theme' || st.change === 'start';
  const q = moodPointOf(st.scene), p = pucks[0];
  glide = { p, from: { u: p.u, v: p.v }, to: { u: q.x, v: q.y }, t0: performance.now(), dur: 2500, done: fresh ? () => { sendMood(); music.form({ section: '熱' }); } : null };
  mannerOn = st.manner; document.querySelectorAll('#manners button').forEach((x) => x.classList.toggle('on', x.textContent === mannerOn));
  music.mix('mood', undefined, { manner: st.manner || null });
  $('medleyNow').textContent = `♪ ${st.theme} × ${st.scene}${st.manner ? ' × ' + st.manner : ''}`;
  toast(`♪ ${st.theme} × ${st.scene}${st.manner ? ' × ' + st.manner : ''}`, 3000);
}
let glide = null;
function stopMedley() {
  if (!medley) return; clearInterval(medleyTimer); medley = null;
  $('medleyBtn').textContent = '∞ 無限メドレー'; $('medleyNow').textContent = ''; $('medleyGlyph').classList.remove('on'); $('medleyGlyph').title = '無限メドレー';
}
async function toggleMedley() {
  hideFloat();
  if (medley) { stopMedley(); toast('メドレーを止めました'); return; }
  await start();
  pucks.splice(1); // メドレーの間は円盤 1 つで
  medley = new Medley(); applyMedley(medley.current());
  medleyTimer = setInterval(() => applyMedley(medley.next()), 30000);
  $('medleyBtn').textContent = '■ メドレーを止める'; $('medleyGlyph').classList.add('on'); $('medleyGlyph').title = 'メドレーを止める';
}
$('medleyBtn').onclick = toggleMedley;
$('medleyGlyph').onclick = toggleMedley;
// 開いてしばらくだけ、無限メドレーの案内を浮かべる（× で消せる。消したら次からは出さない）
function hideFloat(forever = false) { const f = $('medleyFloat'); f.classList.remove('show'); if (forever) try { localStorage.setItem('vsi_float_off', '1'); } catch {} }
{
  let off = false; try { off = localStorage.getItem('vsi_float_off') === '1'; } catch {}
  if (!off) { setTimeout(() => $('medleyFloat').classList.add('show'), 1200); setTimeout(() => hideFloat(), 26000); }
  $('medleyFloatGo').onclick = toggleMedley;
  $('medleyFloatX').onclick = (e) => { e.stopPropagation(); hideFloat(true); };
}
$('themeSet').onclick = () => { const melody = $('themeMel').value.trim(), chords = $('themeChd').value.trim(); if (!music || !melody) return toast('旋律を入れてください'); themeNow = { melody, chords }; music.style({ theme: themeNow }); toast('テーマを使います（次の曲から。サビで聞こえます）', 3500); };
$('themeOff').onclick = () => { themeNow = null; music?.style({ theme: null }); toast('テーマを外しました'); };

// ---- プリセット（組み込み + ブラウザに保存）----
// 1 つのプリセット = 円盤（気持ちの点と大きさ）・場所・激しさ・様式・テーマ。保存先は このブラウザの localStorage だけ
const BUILTIN_PRESETS = [
  { name: '星空ときらきら星', moods: [['優しさ', 1]], place: '星空', intensity: 0.35, theme: 'きらきら星' },
  { name: '深海の祈り', moods: [['祈り', 1], ['神秘', 0.6]], place: '深海', intensity: 0.3 },
  { name: '夜の街', moods: [['懐かしさ', 1], ['切なさ', 0.6]], place: '街', intensity: 0.4 },
  { name: 'かわいいお部屋', moods: [['かわいい', 1]], place: '部屋', intensity: 0.5 },
  { name: '森のケルト', moods: [['安らぎ', 1], ['切なさ', 0.6]], place: '森', intensity: 0.4, manner: 'ケルト', theme: 'グリーンスリーブス' },
  { name: '祭りの夜', moods: [['はしゃぐ', 1]], place: '祭り', intensity: 0.75, manner: '和' },
  { name: '雪原の冒険', moods: [['勇気', 1], ['決意', 0.6]], place: '雪原', intensity: 0.6, theme: '冒険の序曲' },
  { name: 'ボス戦', moods: [['決意', 1], ['怒り', 0.7]], place: '城', intensity: 0.9 },
  { name: '聖堂のカノン', moods: [['安らぎ', 1]], place: '聖堂', intensity: 0.35, manner: 'バロック', theme: 'カノン' },
];
const LS_PRESETS = 'vsi_presets_v1', LS_LAST = 'vsi_last_v1';
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
let themeNow = null;
function snapshot(name) {
  return { name, pucks: pucks.map((p) => ({ u: +p.u.toFixed(3), v: +p.v.toFixed(3), w: p.w, label: p.label })), place: sceneWord, intensity: +intensity.toFixed(2), manner: mannerOn, theme: themeNow, saved: Date.now() };
}
// 組み込みの書き方（気持ちの語）→ 円盤の座標
function resolvePreset(pr) {
  if (pr.pucks) return pr;
  const ps = pr.moods.map(([e, w]) => { const q = project(EMOTIONS[e]); return { u: q.x, v: q.y, w }; });
  const t = pr.theme && THEMES[pr.theme];
  return { ...pr, pucks: ps, theme: t ? { melody: t.melody, chords: t.chords, modal: !!t.modal, name: pr.theme } : null };
}
async function applyPreset(pr0) {
  const pr = resolvePreset(pr0);
  stopMedley(); await start();
  pucks.splice(0, pucks.length, ...pr.pucks.slice(0, 5).map((p) => ({ u: p.u, v: p.v, w: p.w ?? 1, dm: 0.5, drag: false, gx: 0, gy: 0, ...(p.label ? { label: p.label } : {}) })));
  pucks.forEach(placeFromPlane);
  sceneWord = pr.place && SCENES[pr.place] ? pr.place : null;
  document.querySelectorAll('#scenes button').forEach((x) => x.classList.toggle('on', x.textContent === sceneWord));
  sendPlace();
  mannerOn = pr.manner || null; document.querySelectorAll('#manners button').forEach((x) => x.classList.toggle('on', x.textContent === mannerOn));
  music.mix('mood', undefined, { manner: mannerOn });
  intensity = pr.intensity ?? 0.45; lastI = -1; sendIntensity();
  themeNow = pr.theme || null; music.style({ theme: themeNow });
  $('themeMel').value = themeNow?.melody || ''; $('themeChd').value = themeNow?.chords || ''; $('themePick').value = themeNow?.name && THEMES[themeNow.name] ? themeNow.name : '';
  dirty = true; sendMood();
  if (themeNow) music.form({ section: '熱' });
  toast(`プリセット: ${pr.name}`, 2500);
}
function renderPresets() {
  const box = $('presets'); box.textContent = '';
  const chip = (pr, del) => {
    const b = document.createElement('button'); b.textContent = pr.name; b.onclick = () => applyPreset(pr);
    if (del) { const x = document.createElement('span'); x.className = 'del'; x.textContent = '×'; x.title = '削除'; x.onclick = (e) => { e.stopPropagation(); del(); }; b.append(x); }
    box.append(b);
  };
  const last = lsGet(LS_LAST, null);
  if (last?.pucks) chip({ ...last, name: '前回の続き' });
  for (const pr of BUILTIN_PRESETS) chip(pr);
  const mine = lsGet(LS_PRESETS, []);
  mine.forEach((pr, i) => chip(pr, () => { const m = lsGet(LS_PRESETS, []); m.splice(i, 1); lsSet(LS_PRESETS, m); renderPresets(); toast(`削除: ${pr.name}`); }));
}
$('presetSave').onclick = () => {
  const name = $('presetName').value.trim() || `わたしの ${new Date().toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  const mine = lsGet(LS_PRESETS, []).filter((p) => p.name !== name); // 同じ名前は上書き
  mine.push(snapshot(name));
  if (!lsSet(LS_PRESETS, mine.slice(-30))) return toast('このブラウザには保存できませんでした');
  $('presetName').value = ''; renderPresets(); toast(`保存しました: ${name}（このブラウザだけ）`, 3000);
};
renderPresets();
window.__applyPreset = applyPreset; // 試験用
// 前回の状態を、ときどきと閉じるときに保存する（「前回の続き」）
const saveLast = () => { if (music) lsSet(LS_LAST, snapshot('前回の続き')); };
setInterval(saveLast, 10000); addEventListener('pagehide', saveLast);
$('detailBtn').onclick = () => $('panel').classList.toggle('open');
addEventListener('keydown', (e) => { if (e.key === 'Escape') $('panel').classList.remove('open'); });
$('release').onclick = () => { music?.unset(sliders.map((s) => s.path)); toast('手動を解除'); };
$('export').onclick = () => music?.exportLog();
setInterval(async () => {
  if (!music || !$('panel').classList.contains('open')) return;
  const s = await music.state();
  $('readout').textContent = `${s.scene}\n${s.section}・${s.gait}・${Math.round(s.bpm)} BPM・調 ${s.key >= 0 ? '+' : ''}${s.key}\n${s.progression}\n${Object.entries(s.instruments).map(([r, i]) => `${r} ${i}`).join('  ')}\n${s.onomatopoeia ?? ''}`;
  for (const sl of sliders) { if (document.activeElement === sl.inp) continue; const [a, b] = sl.path.split('.'); const v = b ? s.latent[a][b] : s.latent[a]; sl.inp.value = v; sl.val.textContent = (+v).toFixed(2); }
}, 500);

// ---- 描画 ----
// 1 行に収まらない説明を、画面幅で折り返す（日本語は 1 文字ずつ）
function wrap(text, maxW) { const out = []; let line = ''; for (const ch of text) { if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ''; } line += ch; } if (line) out.push(line); return out; }
const isTouch = matchMedia('(pointer: coarse)').matches;
const touchText = (t) => (isTouch ? t.replace('何もないところをダブルクリックで円盤を足す（円盤のダブルクリックで消す・ホイールで大きさ = 比率）', '何もないところをダブルタップで円盤を足す（円盤をダブルタップで消す・長押しで大きさ = 比率）').replace('/ キーでことばでも', '· · · でことばでも') : t);
function drawPuck(p, now, hueT) {
  const r = radius(p) * (p.drag ? 1.08 : 1), h = 3; // 厚み
  // 円盤の下: いま混ぜている語の上位 2 つ（言葉の円盤は、入れた言葉も）
  { const top = Object.entries(blendAt({ x: p.u, y: p.v })).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([n]) => n).join('・');
    g.save(); g.font = '300 10px "Hiragino Sans", system-ui'; g.textAlign = 'center';
    let yy = p.y + r + 15;
    if (p.label) { g.fillStyle = 'rgba(90,80,160,0.75)'; g.fillText(`「${p.label}」`, p.x, yy); yy += 13; }
    g.fillStyle = 'rgba(50,50,50,0.6)'; g.fillText(top, p.x, yy); g.restore(); }
  // マット（艶消し）: 光沢のハイライトをなくし、明暗の差の小さい拡散した陰影にする。全体の不透明度は低め
  g.save();
  g.globalAlpha = 0.55;
  // 側面（厚み）
  for (let k = h; k > 0; k -= 1) { g.beginPath(); g.arc(p.x, p.y + k, r, 0, Math.PI * 2); g.fillStyle = 'rgba(196,196,206,0.22)'; g.fill(); }
  // 影（柔らかく、薄く）
  g.shadowColor = 'rgba(60,60,80,0.12)'; g.shadowBlur = p.drag ? 24 : 14; g.shadowOffsetY = (p.drag ? 8 : 3) + h;
  const body = g.createRadialGradient(p.x - r * 0.25, p.y - r * 0.3, r * 0.2, p.x, p.y, r);
  body.addColorStop(0, 'rgba(246,246,244,0.85)'); body.addColorStop(1, 'rgba(232,232,236,0.85)');
  g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fillStyle = body; g.fill();
  g.restore();
  g.save();
  g.globalAlpha = 0.5;
  // 縁: 下側にごく薄い帯（厚み）、虹の縁は彩度を落として細く
  g.beginPath(); g.arc(p.x, p.y + 1.2, r - 1, 0.15 * Math.PI, 0.85 * Math.PI); g.strokeStyle = 'rgba(120,120,140,0.14)'; g.lineWidth = 2.5; g.stroke();
  const rim = g.createConicGradient ? g.createConicGradient(now / 1400, p.x, p.y) : null;
  if (rim) { for (let i = 0; i <= 6; i++) rim.addColorStop(i / 6, `hsla(${(i * 60 + hueT) % 360}, 55%, 66%, 0.75)`); g.strokeStyle = rim; }
  else g.strokeStyle = `hsla(${hueT}, 55%, 66%, 0.75)`;
  g.beginPath(); g.arc(p.x, p.y, r - 0.8, 0, Math.PI * 2); g.lineWidth = 1.3; g.stroke();
  g.restore();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (glide) { const k = Math.min(1, (now - glide.t0) / glide.dur), e = k * k * (3 - 2 * k); glide.p.u = glide.from.u + (glide.to.u - glide.from.u) * e; glide.p.v = glide.from.v + (glide.to.v - glide.from.v) * e; placeFromPlane(glide.p); dirty = true; if (k >= 1) { const done = glide.done; glide = null; done?.(); } }
  if (dirty && now - lastSendT > 600) sendMood();
  tutTick(dt);
  const hueT = (now / 80) % 360;
  g.clearRect(0, 0, W, H);
  g.drawImage(field, 0, 0, W, H);
  // 軸の手がかり（ごく薄く）
  g.font = '300 10px "Hiragino Sans", system-ui'; g.fillStyle = 'rgba(120,120,120,0.35)';
  g.textAlign = 'left'; g.fillText('不快', 14, H / 2); g.textAlign = 'right'; g.fillText('快', W - 50, H / 2);
  g.textAlign = 'center'; g.fillText('高ぶり', W / 2 - 15, 56); g.fillText('静けさ', W / 2 - 15, H - 34);
  if (W >= 600) { g.textAlign = 'right'; g.fillText('奥 = 支配 ↗', W - 50, 56); }
  // 拍で呼吸する輪（円盤ごと）
  beatPulse *= Math.exp(-dt * 2.2);
  const breath = 0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 2 * (bpm / 60) / 4);
  for (const p of pucks) for (let i = 0; i < 4; i++) {
    const r = radius(p) + 10 + i * 18 + breath * 3 + beatPulse * 8 * (4 - i);
    g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.strokeStyle = `hsla(${(hueT + i * 40) % 360}, 80%, 62%, ${(0.07 + 0.2 * beatPulse * (1 - i / 4)) * Math.min(1, p.w)})`; g.lineWidth = 0.5; g.stroke();
  }
  // 感情語（円盤の近くだけ浮かぶ）
  // 近い順に描き、すでに描いたラベルと重なるものは描かない（狭い画面で文字が被らないように）
  g.font = `300 ${W < 600 ? 10 : 11}px "Hiragino Sans", system-ui`; g.textAlign = 'center';
  const labels = [];
  for (const a of anchors) {
    const s = toScreen(a);
    let d = Infinity; for (const p of pucks) d = Math.min(d, Math.hypot(s.x - p.x, s.y - p.y) / Math.hypot(W, H));
    g.fillStyle = 'rgba(60,60,60,0.16)'; g.beginPath(); g.arc(s.x, s.y, 1.1, 0, Math.PI * 2); g.fill();
    const al = Math.max(0, 1 - d / (W < 600 ? 0.22 : 0.17));
    if (al > 0.01) labels.push({ a, s, al });
  }
  labels.sort((x, y) => y.al - x.al);
  // 円盤に隠れる語は消さずに、円盤のすぐ外側（その語のある方向）へ押し出して表示する（いまいる場所の語が見えるように）
  const pk = pucks.map((p) => ({ p, r: radius(p) + 4 }));
  // 円盤の下は「いま混ぜている語」の表示のために空けておく
  const boxes = pucks.map((p) => { const r = radius(p); return [p.x - 60, p.y + r + 2, p.x + 60, p.y + r + (p.label ? 34 : 20)]; });
  for (const { a, s, al } of labels) {
    let x = s.x, y = s.y - 7;
    for (const { p, r } of pk) {
      const dx = x - p.x, dy = y - 5 - p.y, d = Math.hypot(dx, dy);
      if (d < r + 8) {
        let ux = d > 1 ? dx / d : 0, uy = d > 1 ? dy / d : -1;
        if (uy > 0.2) { ux = ux >= 0 ? 1 : -1; uy = 0; } // 下側の語は左右へ（下は語の表示に空けてある）
        const w2 = g.measureText(a.name).width / 2;
        x = p.x + ux * (r + 8 + w2 * Math.abs(ux)); y = p.y + uy * (r + 10) + 4;
      }
    }
    const w = g.measureText(a.name).width + 4, b = [x - w / 2, y - 12, x + w / 2, y + 3];
    if (boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
    boxes.push(b); g.fillStyle = `rgba(40,40,40,${0.75 * Math.max(al, 0.5)})`; g.fillText(a.name, x, y);
  }
  // 音（五度圏の色の波紋）
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i]; r.t += dt; const k = r.t / r.life;
    if (k >= 1) { ripples.splice(i, 1); continue; }
    g.beginPath(); g.arc(r.x, r.y, (r.big ? 40 : r.fig ? 6 : 3) + k * (r.big ? 160 : r.fig ? 46 : 24), 0, Math.PI * 2);
    g.strokeStyle = `hsla(${r.hue}, 80%, ${r.fig ? 55 : 65}%, ${(1 - k) * (r.fig ? 0.6 : 0.3)})`; g.lineWidth = r.fig ? 0.7 : 0.45; g.stroke();
  }
  // 区間の変わり目
  for (let i = sweeps.length - 1; i >= 0; i--) {
    const s = sweeps[i]; s.t += dt; const k = s.t / 2.4; if (k >= 1) { sweeps.splice(i, 1); continue; }
    const y = H * (0.15 + 0.7 * k), grd = g.createLinearGradient(0, 0, W, 0);
    for (let j = 0; j <= 6; j++) grd.addColorStop(j / 6, `hsla(${(hueT + j * 60) % 360}, 85%, 62%, ${0.3 * (1 - k)})`);
    g.strokeStyle = grd; g.lineWidth = 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }
  // 円盤（重なりは配列の順）
  for (const p of pucks) drawPuck(p, now, hueT);
  // 激しさの線（右端）
  const [ga, gb] = gaugeY(), gx = GAUGE_X(), gy = gb - intensity * (gb - ga);
  const lg = g.createLinearGradient(0, gb, 0, ga); lg.addColorStop(0, 'hsla(210, 60%, 70%, 0.5)'); lg.addColorStop(1, 'hsla(10, 85%, 62%, 0.7)');
  g.strokeStyle = lg; g.lineWidth = 0.8; g.beginPath(); g.moveTo(gx, ga); g.lineTo(gx, gb); g.stroke();
  g.save(); g.shadowColor = 'rgba(60,60,80,0.2)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
  g.beginPath(); g.arc(gx, gy, 6, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill(); g.restore();
  g.beginPath(); g.arc(gx, gy, 6, 0, Math.PI * 2); g.strokeStyle = `hsla(${210 - 200 * intensity}, 75%, 60%, 0.9)`; g.lineWidth = 1; g.stroke();
  g.fillStyle = 'rgba(120,120,120,0.4)'; g.font = '300 10px system-ui'; g.textAlign = 'center'; g.fillText('熱', gx, ga - 10); g.fillText('静', gx, gb + 18);
  // 読み込み・開始
  if (starting && loadP < 1) { g.beginPath(); g.arc(W / 2, H / 2, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * loadP); g.strokeStyle = `hsla(${hueT}, 80%, 60%, 0.8)`; g.lineWidth = 0.6; g.stroke(); }
  // 使い方
  if (tutOn && music && STEPS[tut.step]) {
    const a = Math.min(1, tut.t * 1.5);
    g.textAlign = 'center'; g.font = `300 ${W < 600 ? 12 : 13}px "Hiragino Sans", system-ui`; g.fillStyle = `rgba(40,40,40,${0.8 * a})`;
    const lines = wrap(touchText(STEPS[tut.step].text), Math.min(W - 70, 560));
    lines.forEach((l, i) => g.fillText(l, W / 2, 80 + i * 18));
    g.font = '300 10px system-ui'; g.fillStyle = `rgba(120,120,120,${0.6 * a})`; g.fillText(`${tut.step + 1} / ${STEPS.length}`, W / 2, 80 + lines.length * 18);
    const k = (now / 900) % 1;
    if (tut.step === 0) { const p = pucks[0]; g.beginPath(); g.arc(p.x, p.y, radius(p) + 8 + 12 * k, 0, Math.PI * 2); g.strokeStyle = `hsla(${hueT}, 80%, 60%, ${0.6 * (1 - k)})`; g.lineWidth = 0.8; g.stroke(); }
    if (tut.step === 2) { g.beginPath(); g.arc(gx, gy, 8 + 12 * k, 0, Math.PI * 2); g.strokeStyle = `hsla(${hueT}, 80%, 60%, ${0.6 * (1 - k)})`; g.lineWidth = 0.8; g.stroke(); }
  }
  if (music) { g.textAlign = 'left'; g.fillStyle = 'rgba(80,80,80,0.45)'; g.font = '300 11px system-ui'; g.fillText(`${section} · ${gait} · ${Math.round(bpm)}`, 16, H - 16); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
