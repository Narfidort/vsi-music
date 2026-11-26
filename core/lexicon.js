// 語彙: あらゆる感情 × あらゆる情景（docs/07_interface.md）。
// 感情語を 1 つずつ手で調整するのではなく、感情を 3 次元（快–不快 V、覚醒 A、支配 Dm。Russell 1980、
// Mehrabian 1996、Warriner et al. 2013 の規範値を参考にした近似）に置き、VSI の身体の軸へ理論で写す。
// 情景語は世界（距離・広がり・媒質）と環境音を決める。「焚き火・追悼」= 情景 × 感情。
// 評価で調整した名前付きの点（core/presets.js）は、そのまま優先する。

import { PRESETS } from './presets.js';
import { MANNERS } from './manners.js';

// [V −1..1, A 0..1, Dm 0..1, 広大さ 0..1（任意）]
// 広大さ: 畏敬・神秘・郷愁は「知覚された広大さ」を含む感情（Keltner & Haidt 2003）。情景がないときは世界の広がり・距離に写す
export const EMOTIONS = {
  喜び: [0.8, 0.7, 0.6], 楽しい: [0.8, 0.75, 0.6], わくわく: [0.7, 0.85, 0.6], 幸せ: [0.9, 0.5, 0.6], 希望: [0.6, 0.55, 0.6],
  穏やか: [0.6, 0.15, 0.5], 安らぎ: [0.7, 0.1, 0.5], 優しさ: [0.7, 0.2, 0.45], 労り: [0.5, 0.2, 0.4], 団らん: [0.7, 0.5, 0.5],
  懐かしさ: [0.3, 0.25, 0.4, 0.6], 祈り: [0.3, 0.2, 0.4, 0.8], 静寂: [0.1, 0.05, 0.5, 0.7], 神秘: [0.1, 0.3, 0.5, 0.95], 不思議: [0.2, 0.45, 0.4],
  切なさ: [-0.2, 0.4, 0.3], 寂しさ: [-0.5, 0.15, 0.3], 孤独: [-0.4, 0.1, 0.3, 0.7], 悲しみ: [-0.7, 0.5, 0.25], 追悼: [-0.5, 0.25, 0.45, 0.6],
  絶望: [-0.9, 0.3, 0.1], 不安: [-0.5, 0.65, 0.2], 恐怖: [-0.8, 0.9, 0.1], 緊張: [-0.3, 0.75, 0.4], 焦り: [-0.4, 0.85, 0.3],
  怒り: [-0.7, 0.9, 0.85], 苛立ち: [-0.5, 0.65, 0.6], 沸々: [-0.6, 0.7, 0.75], 決意: [0.2, 0.75, 0.85], 勇気: [0.5, 0.8, 0.85],
  勝利: [0.9, 0.9, 0.95], 荘厳: [0.4, 0.4, 0.95, 0.95], かわいい: [0.8, 0.5, 0.25], はしゃぐ: [0.85, 0.9, 0.35], 無邪気: [0.8, 0.7, 0.3], 眠い: [0.2, 0.05, 0.3],
};

// 世界と環境音。bias は情景が身体に与える偏り（深い水の中では地が大きく暗い、など）
export const SCENES = {
  // 深海の泡は BGM に馴染ませた音（粒の層）。実体のある効果音（焚き火のはじけ等）はゲームのオブジェクトの仕事なので入れない
  深海: { mood: '深海',  distance: 0.5, space: 0.95, medium: 0.85, texture: { size: 0.6, bright: 0.3, edge: 0.05, rough: 0.25, energy: 0.4, density: 0.55 }, bias: { ground: { size: 0.25, bright: -0.2 } } },
  海中: { mood: '神秘',  distance: 0.4, space: 0.8, medium: 0.6, texture: { size: 0.5, bright: 0.35, edge: 0.05, rough: 0.25, energy: 0.35, density: 0.4 } },
  星空: { mood: '星空',  distance: 0.8, space: 1, medium: 0 },
  宇宙: { mood: '静寂',  distance: 0.9, space: 1, medium: 0, bias: { ground: { size: 0.2 } } },
  焚き火: { mood: '焚き火',  distance: 0.15, space: 0.25, medium: 0 }, // 焚き火の暖かい雰囲気だけ。はじける音はゲームの焚き火が鳴らす
  部屋: { mood: '穏やか',  distance: 0.15, space: 0.15, medium: 0 },
  街: { mood: '楽しい',  distance: 0.4, space: 0.5, medium: 0 },
  草原: { mood: '穏やか',  distance: 0.5, space: 0.8, medium: 0 },
  森: { mood: '神秘',  distance: 0.4, space: 0.6, medium: 0 },
  聖堂: { mood: '祈り',  distance: 0.5, space: 0.95, medium: 0, bias: { ground: { size: 0.15 } } },
  洞窟: { mood: '不思議',  distance: 0.4, space: 0.85, medium: 0.15 },
  夜: { mood: '静寂',  distance: 0.6, space: 0.7, medium: 0, bias: { ground: { bright: -0.1 }, figure: { bright: -0.05 } } },
  戦場: { mood: '緊張',  distance: 0.25, space: 0.6, medium: 0, bias: { ground: { size: 0.15 } } },
  砂漠: { mood: '孤独', distance: 0.7, space: 0.95, medium: 0, bias: { ground: { bright: 0.1 } } },
  雪原: { mood: '静寂', distance: 0.6, space: 0.9, medium: 0, bias: { figure: { bright: 0.15 } } },
  山頂: { mood: '荘厳', distance: 0.7, space: 1, medium: 0 },
  海辺: { mood: '懐かしさ', distance: 0.5, space: 0.85, medium: 0.1 },
  雨: { mood: '切なさ', distance: 0.3, space: 0.5, medium: 0.25, bias: { ground: { bright: -0.1 } } },
  夕暮れ: { mood: '懐かしさ', distance: 0.5, space: 0.75, medium: 0, bias: { ground: { bright: -0.05 } } },
  夜明け: { mood: '希望', distance: 0.5, space: 0.85, medium: 0, bias: { figure: { bright: 0.1 } } },
  雲の上: { mood: '安らぎ', distance: 0.8, space: 1, medium: 0, bias: { figure: { bright: 0.15 } } },
  廃墟: { mood: '孤独', distance: 0.5, space: 0.75, medium: 0, bias: { ground: { bright: -0.1 } } },
  城: { mood: '荘厳', distance: 0.4, space: 0.85, medium: 0, bias: { ground: { size: 0.1 } } },
  地下: { mood: '不安', distance: 0.3, space: 0.6, medium: 0.1, bias: { ground: { bright: -0.15 } } },
  市場: { mood: '楽しい', distance: 0.2, space: 0.4, medium: 0 },
  祭り: { mood: 'わくわく', distance: 0.25, space: 0.55, medium: 0 },
  図書館: { mood: '静寂', distance: 0.2, space: 0.45, medium: 0 },
  花畑: { mood: '幸せ', distance: 0.4, space: 0.75, medium: 0, bias: { figure: { bright: 0.1 } } },
  港: { mood: '懐かしさ', distance: 0.4, space: 0.8, medium: 0.15 },
  寺: { mood: '祈り', distance: 0.4, space: 0.7, medium: 0 },
  ポップ: { mood: 'はしゃぐ', distance: 0.25, space: 0.4, medium: 0, D: 1 }, // 電子音の様式（機械の演奏 → 電子音と効果音）
  電脳: { mood: 'はしゃぐ',  distance: 0.25, space: 0.4, medium: 0, D: 1 }, // 機械の演奏 → 電子音と効果音
};

const clamp01 = (x) => Math.min(1, Math.max(0, x));

// 感情（V, A, Dm）→ 身体（VSI の軸）。根拠:
//   覚醒 → 活性・密度（Juslin & Laukka の共通符号: 速さ・大きさ）、角（激しい運動は撃力的）
//   快   → 浮沈（Huron: 長短 = 声の高さ、Bowling 2010）、明るさ
//   不快 × 覚醒 → 粗さ（叫び・唸りの非周期性）。支配が強いほど粗さは力強く、弱いほど震え（トレモロ的な反復）
//   支配 → 大きさ（Ohala の frequency code: 大きい = 低い = 支配的、小さい = 高い = 服従・かわいい）
//   相形態: 静かな快 = 鳴らしっぱなし（撥音）、沈む × 覚醒 = 持続（長音: 泣く声）、強い覚醒 × 支配 = 叩いて止める（促音）
export function emotionToBodies([V, A, Dm]) { // 4 つ目（広大さ）は世界に写すので、ここでは使わない
  const neg = Math.max(0, -V);
  const rough = clamp01(0.03 + 1.2 * neg * A * (0.3 + 0.7 * Dm));
  const tremble = clamp01(neg * A * (1 - Dm));
  const body = (role) => {
    const f = role === 'figure';
    const long = clamp01(0.2 + 0.6 * neg * (0.4 + A) + (f ? 0.1 : 0.15) * (1 - A));
    const q = clamp01(0.5 * A * Dm), rep = clamp01(0.5 * tremble), n = clamp01(1 - long - q - rep) + 0.1;
    return {
      size: clamp01((f ? 0.2 : 0.45) + 0.4 * Dm), bright: clamp01((f ? 0.35 : 0.2) + (f ? 0.25 : 0.15) * V + 0.15 * A),
      edge: clamp01(0.08 + 0.65 * A * (0.4 + 0.6 * Dm)), rough: f ? rough * 0.8 : rough, energy: clamp01((f ? 0.1 : 0.08) + (f ? 0.85 : 0.8) * A),
      density: clamp01((f ? 0.3 : 0.5) + (f ? 0.45 : 0.4) * A), lift: Math.max(-1, Math.min(1, (f ? 0.6 : 0.5) * V)), voice: 0,
      morph: { n, long, q, rep, ri: 0 },
    };
  };
  return { ground: body('ground'), figure: body('figure') };
}

const DEFAULT_SCENE = { distance: 0.3, space: 0.45, medium: 0 };
// mood: 情景だけが指定されたときの、その情景の「ふつうの気分」（身体の成分）。プリセット名か感情語

// 名前（"焚き火・追悼"、"悲しみ"、"深海"）→ 意味座標（と環境音）
export function resolveScene(name) {
  if (PRESETS[name]) return { latent: JSON.parse(JSON.stringify(PRESETS[name])), known: 'preset' };
  const parts = String(name).split(/[・,、\s]+/).filter(Boolean);
  let scene = null, emo = null;
  for (const p of parts) { if (SCENES[p]) scene = SCENES[p]; else if (EMOTIONS[p]) emo = EMOTIONS[p]; else if (PRESETS[p] && !emo) emo = p; }
  if (!scene && !emo) return null;
  let bodies;
  if (typeof emo === 'string') { const P = PRESETS[emo]; bodies = { ground: P.ground, figure: P.figure }; }
  else bodies = emotionToBodies(emo || [0.2, 0.35, 0.5]);
  let s = scene || DEFAULT_SCENE;
  const vast = Array.isArray(emo) ? emo[3] ?? 0 : 0;
  if (!scene && vast) s = { ...s, space: s.space + (1 - s.space) * vast, distance: s.distance + 0.4 * vast };
  const latent = { distance: s.distance, space: s.space, medium: s.medium, D: s.D ?? 0.82, ground: { ...bodies.ground }, figure: { ...bodies.figure }, texture: s.texture ? { ...s.texture } : { density: 0 } };
  for (const l of ['ground', 'figure']) for (const [k, v] of Object.entries(s.bias?.[l] || {})) latent[l][k] = clamp01((latent[l][k] ?? 0.5) + v);
  return { latent, known: 'composed' };
}

// ---- 合成（線形結合）: 語を「世界の成分」と「身体（気分）の成分」に分け、それぞれ重み付きで平均する ----
// 情景語 = 世界 + ふつうの気分、感情語 = 身体（+ 弱い広大さ）、プリセット = 両方、「情景・感情」= 情景の世界 + 感情の身体。
// 例: { 湖（海中）: 1, 緊張: 0.6 } → 世界は海中、身体は「海中のふつうの気分」と緊張の 1 : 0.6 の混合
const BODY_KEYS = ['size', 'bright', 'edge', 'rough', 'energy', 'voice', 'density', 'lift'];
const MORPH_KEYS = ['rep', 'q', 'n', 'long', 'ri'];
// 連続値の語（名前のない点）: 語彙に縛られずに意味空間のどこでも指せる
//   vad(V, A, Dm[, 広大さ]) … 気分（快 −1..1、覚醒 0..1、支配 0..1）
//   world(距離, 広がり, 水[, 離散化]) … 場所の世界
const NUM = '\\s*(-?[\\d.]+)\\s*';
const VAD_RE = new RegExp(`^vad\\(${NUM},${NUM},${NUM}(?:,${NUM})?\\)$`), WORLD_RE = new RegExp(`^world\\(${NUM},${NUM},${NUM}(?:,${NUM})?\\)$`);
export function resolveParts(name) {
  const mv = VAD_RE.exec(name);
  if (mv) {
    const [V, A, Dm, vast] = mv.slice(1).map((x) => (x === undefined ? undefined : +x));
    const out = { bodies: emotionToBodies([Math.max(-1, Math.min(1, V)), clamp01(A), clamp01(Dm)]) };
    if (vast) { out.world = { distance: DEFAULT_SCENE.distance + 0.4 * vast, space: DEFAULT_SCENE.space + (1 - DEFAULT_SCENE.space) * vast, medium: 0, D: 0.82 }; out.worldW = 0.3; }
    return out;
  }
  const mw = WORLD_RE.exec(name);
  if (mw) { const [d, sp, md, D] = mw.slice(1).map((x) => (x === undefined ? undefined : clamp01(+x))); return { world: { distance: d, space: sp, medium: md, D: D ?? 0.82 }, texture: md > 0.5 ? { size: 0.55, bright: 0.3, edge: 0.05, rough: 0.25, energy: 0.35, density: 0.6 * (md - 0.4) } : null, worldW: 1 }; }
  const P = PRESETS[name];
  // 感情の名前のプリセット（怒り・悲しみ…）の世界は弱く（情景と重ねたら情景が世界を決める）。情景の名前のプリセット（深海・星空・焚き火）は強く
  if (P) return { world: { distance: P.distance ?? 0.3, space: P.space ?? 0.45, medium: P.medium ?? 0, D: P.D ?? 0.82 }, bodies: { ground: P.ground, figure: P.figure }, texture: P.texture || null, worldW: EMOTIONS[name] && !SCENES[name] ? 0.3 : 1 };
  const parts = String(name).split(/[・,、\s]+/).filter(Boolean);
  let scene = null, emo = null;
  for (const p of parts) { if (SCENES[p]) scene = SCENES[p]; else if (EMOTIONS[p] || PRESETS[p]) emo = p; }
  if (!scene && !emo) return null;
  const out = {};
  if (scene) {
    out.world = { distance: scene.distance, space: scene.space, medium: scene.medium, D: scene.D ?? 0.82 };
    out.texture = scene.texture || null; out.bias = scene.bias || null; out.worldW = 1;
  }
  const bodyName = emo || scene?.mood;
  if (bodyName) {
    if (PRESETS[bodyName]) out.bodies = { ground: PRESETS[bodyName].ground, figure: PRESETS[bodyName].figure };
    else out.bodies = emotionToBodies(EMOTIONS[bodyName]);
    // 感情だけのとき: 広大さ（畏敬）を弱い世界の成分として
    const vast = EMOTIONS[bodyName]?.[3];
    if (!scene && vast) { out.world = { distance: DEFAULT_SCENE.distance + 0.4 * vast, space: DEFAULT_SCENE.space + (1 - DEFAULT_SCENE.space) * vast, medium: 0, D: 0.82 }; out.worldW = 0.3; }
  }
  return out;
}
// items: [[名前 or 部分, 重み]] → 意味座標。どの語にも世界の成分がなければ既定の世界、身体の成分がなければ穏やか
export function compose(items) {
  const parts = items.map(([n, w]) => [typeof n === 'string' ? resolveParts(n) : n, w]).filter(([p, w]) => p && w > 0);
  const world = { distance: 0, space: 0, medium: 0, D: 0 }, bodies = { ground: { morph: {} }, figure: { morph: {} } };
  let ww = 0, bw = 0; const tex = {}, bias = { ground: {}, figure: {} };
  for (const [p, w] of parts) if (p.world) {
    const k = w * (p.worldW ?? 1); ww += k;
    for (const a of Object.keys(world)) world[a] += k * p.world[a];
    for (const [a, v] of Object.entries(p.texture || { density: 0 })) tex[a] = (tex[a] || 0) + k * v;
    for (const l of ['ground', 'figure']) for (const [a, v] of Object.entries(p.bias?.[l] || {})) bias[l][a] = (bias[l][a] || 0) + k * v;
  }
  for (const [p, w] of parts) if (p.bodies) {
    bw += w;
    for (const l of ['ground', 'figure']) {
      const b = p.bodies[l] || {};
      for (const a of BODY_KEYS) bodies[l][a] = (bodies[l][a] || 0) + w * (b[a] ?? (a === 'lift' || a === 'voice' ? 0 : 0.5));
      const m = b.morph || {}, ms = MORPH_KEYS.reduce((x, k) => x + (m[k] || 0), 0) || 1;
      for (const a of MORPH_KEYS) bodies[l].morph[a] = (bodies[l].morph[a] || 0) + w * (m[a] || 0) / ms;
    }
  }
  const z = {};
  if (ww > 0) { for (const a of Object.keys(world)) z[a] = world[a] / ww; z.texture = Object.fromEntries(Object.entries(tex).map(([a, v]) => [a, v / ww])); }
  else Object.assign(z, DEFAULT_SCENE, { D: 0.82, texture: { density: 0 } });
  if (bw > 0) for (const l of ['ground', 'figure']) { z[l] = { morph: {} }; for (const a of BODY_KEYS) z[l][a] = bodies[l][a] / bw; for (const a of MORPH_KEYS) z[l].morph[a] = bodies[l].morph[a] / bw; }
  else Object.assign(z, emotionToBodies(EMOTIONS.穏やか));
  if (ww > 0) for (const l of ['ground', 'figure']) for (const [a, v] of Object.entries(bias[l])) z[l][a] = clamp01((z[l][a] ?? 0.5) + v / ww);
  return z;
}

// UI 用の座標: 3 次元（快 V、覚醒 A、支配 Dm）を、斜め上から見た平面に投影する（斜投影）。
//   x = 快、y = 覚醒 を保ったまま、支配を「奥行き」として右上へずらす。軸の意味は保たれ、支配だけが違う語
//   （怒り = 強い / 恐怖 = 弱い）も画面上で離れる。PROJ を変えれば見る角度（カメラ）が変わる
export const PROJ = { dx: 0.17, dy: 0.15 };
export function project([V, A, Dm]) { return { x: Math.min(1, Math.max(0, (V + 1) / 2 + PROJ.dx * (Dm - 0.5))), y: Math.min(1, Math.max(0, A + PROJ.dy * (Dm - 0.5))) }; }
export function anchors() {
  const out = Object.entries(EMOTIONS).map(([name, e]) => ({ name, ...project(e), kind: 'emotion', vad: e.slice(0, 3) }));
  for (const [name, z] of Object.entries(PRESETS)) {
    if (EMOTIONS[name]) continue;
    const lift = 0.5 * ((z.ground?.lift ?? 0) + (z.figure?.lift ?? 0)), E = Math.max(z.ground?.energy ?? 0.3, z.figure?.energy ?? 0.3);
    const Dm = Math.min(1, Math.max(0, (0.5 * ((z.ground?.size ?? 0.5) + (z.figure?.size ?? 0.5)) - 0.2) / 0.4)); // 大きさ ≈ 支配の逆写像
    out.push({ name, ...project([Math.max(-1, Math.min(1, 2 * lift)), E, Dm]), kind: 'preset' });
  }
  return out;
}
export function vocabulary() { return { presets: Object.keys(PRESETS), emotions: Object.keys(EMOTIONS), scenes: Object.keys(SCENES), manners: Object.keys(MANNERS), anchors: anchors() }; }
