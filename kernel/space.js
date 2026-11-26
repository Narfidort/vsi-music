// 意味空間（docs/02_theory.md §2）の定義。v0.2
// z = { 世界層 + D, ground: 音源, figure: 音源 }
// ここに書かれた変数だけが「意味」であり、合成パラメータは physics.js がここから導く。

// 音源層 + 運動層（地と図のそれぞれが 1 組ずつ持つ）
export const BODY_AXES = {
  size:    { min: 0,  max: 1, def: 0.5, label: '大きさ', poles: ['小', '大'] },
  bright:  { min: 0,  max: 1, def: 0.5, label: '明るさ', poles: ['暗', '明'] },
  edge:    { min: 0,  max: 1, def: 0.4, label: '角',     poles: ['丸', '尖'] },
  rough:   { min: 0,  max: 1, def: 0.1, label: '粗さ',   poles: ['滑', '粗'] },
  energy:  { min: 0,  max: 1, def: 0.35, label: '活性',  poles: ['弱', '強'] },
  voice:   { min: 0,  max: 1, def: 0,   label: '声性',   poles: ['固体', '声'] },
  density: { min: 0,  max: 1, def: 0.5, label: '密度',   poles: ['無音', '密'] },
  lift:    { min: -1, max: 1, def: 0,   label: '浮沈',   poles: ['沈', '昇'] },
};

// 世界層 + 離散化層（共有）
export const WORLD_AXES = {
  distance: { min: 0, max: 1, def: 0.3, label: '距離',   poles: ['近', '遠'] },
  space:    { min: 0, max: 1, def: 0.4, label: '広がり', poles: ['狭', '広'] },
  medium:   { min: 0, max: 1, def: 0,   label: '媒質',   poles: ['空気', '水'] },
  D:        { min: 0, max: 1, def: 0.8, label: '離散化', poles: ['独り言', '音楽'] },
};

// 地（和声）・図（旋律）・粒（拍節に乗らない環境の出来事、v0.4）
export const LAYERS = ['ground', 'figure', 'texture'];

// 相形態（§2.2.1）。重みベクトル。固体音源では相互作用の種類として読む。
export const MORPHS = {
  rep:  { label: '重複', example: 'ころころ', aspect: '反復・継続／連打・転がり' },
  q:    { label: '促音', example: 'ころっ',   aspect: '瞬間・急停止／叩いて止める' },
  n:    { label: '撥音', example: 'ころん',   aspect: '共鳴して余韻／叩いて鳴らしっぱなし' },
  long: { label: '長音', example: 'ころー',   aspect: '持続／擦る・弓' },
  ri:   { label: '-り',  example: 'ころり',   aspect: 'ゆっくり完了／転がって止まる' },
};

const clamp = (v, a) => Math.min(a.max, Math.max(a.min, Number.isFinite(Number(v)) ? Number(v) : a.def));

function defaultBody(layer) {
  const b = {};
  for (const [k, a] of Object.entries(BODY_AXES)) b[k] = a.def;
  if (layer === 'ground') Object.assign(b, { size: 0.75, bright: 0.35, edge: 0.05, energy: 0.25, density: 0.75 });
  if (layer === 'figure') Object.assign(b, { size: 0.35, bright: 0.6, edge: 0.5, energy: 0.35, density: 0.4 });
  if (layer === 'texture') Object.assign(b, { size: 0.2, bright: 0.5, edge: 0.5, rough: 0.3, energy: 0.3, density: 0 });
  b.morph = layer === 'ground' ? { rep: 0, q: 0, n: 0.3, long: 0.7, ri: 0 } : { rep: 0.3, q: 0, n: 0.7, long: 0, ri: 0 };
  return b;
}

export function defaultLatent() {
  const z = {};
  for (const [k, a] of Object.entries(WORLD_AXES)) z[k] = a.def;
  for (const l of LAYERS) z[l] = defaultBody(l);
  return z;
}

function clampBody(b, layer) {
  const d = defaultBody(layer), out = {};
  for (const [k, a] of Object.entries(BODY_AXES)) out[k] = clamp(b?.[k] ?? d[k], a);
  // morph: 指定があればそれだけ（未指定は 0）、なければ既定
  const src = b?.morph ? { rep: 0, q: 0, n: 0, long: 0, ri: 0, ...b.morph } : d.morph;
  let s = 0; const m = {};
  for (const k of Object.keys(MORPHS)) { m[k] = Math.max(0, Number(src[k]) || 0); s += m[k]; }
  for (const k of Object.keys(MORPHS)) m[k] = s > 0 ? m[k] / s : 0.2;
  out.morph = m;
  return out;
}

export function clampLatent(z = {}) {
  const d = defaultLatent(), out = {};
  for (const [k, a] of Object.entries(WORLD_AXES)) out[k] = clamp(z[k] ?? d[k], a);
  for (const l of LAYERS) out[l] = clampBody(z[l], l);
  return out;
}

// 部分的な更新をマージする（morph は置き換え）
export function mergeLatent(base, patch) {
  const out = { ...base };
  for (const k of Object.keys(WORLD_AXES)) if (patch[k] !== undefined) out[k] = patch[k];
  for (const l of LAYERS) if (patch[l]) out[l] = { ...base[l], ...patch[l], morph: patch[l].morph || base[l].morph };
  return clampLatent(out);
}

// 情景語・情動語は新しい変数ではなく、意味空間上の点（§4, §2.5）。
export const PRESETS = {
  '深海': { distance: 0.5, space: 0.95, medium: 0.85, D: 0.7,
    ground: { size: 0.95, bright: 0.1, edge: 0.03, rough: 0.08, energy: 0.25, density: 0.75, lift: -0.4, morph: { long: 0.7, n: 0.3 } },
    figure: { size: 0.1, bright: 0.85, edge: 0.45, rough: 0, energy: 0.2, density: 0.12, lift: 0.2, morph: { n: 1 } },
    texture: { size: 0.6, bright: 0.3, edge: 0.05, rough: 0.25, energy: 0.45, density: 0.72 } }, // 泡（実録音: 約 6 回/秒、規則的、300〜1300 Hz）
  '星空': { distance: 0.8, space: 1, medium: 0, D: 0.85,
    // v0.5: 作業用 BGM の「星空」は暗めの（重心 495 Hz）長調のピアノ。夜空は暗く、星は小さく疎ら
    ground: { size: 0.6, bright: 0.35, edge: 0.15, rough: 0, energy: 0.15, density: 0.5, lift: 0.2, morph: { n: 0.6, long: 0.4 } },
    figure: { size: 0.12, bright: 0.6, edge: 0.4, rough: 0, energy: 0.2, density: 0.35, lift: 0.3, morph: { n: 0.7, rep: 0.3 } } },
  // v0.4: はじける音は拍節の格子ではなく粒の層（群れて起きるランダムな撃力）。音楽側は温かい撥弦
  '焚き火': { distance: 0.15, space: 0.25, medium: 0, D: 0.75,
    ground: { size: 0.6, bright: 0.3, edge: 0.25, rough: 0.15, energy: 0.3, density: 0.75, morph: { n: 0.6, long: 0.4 } },
    figure: { size: 0.4, bright: 0.45, edge: 0.35, rough: 0.1, energy: 0.35, density: 0.45, morph: { n: 0.6, rep: 0.4 } },
    texture: { size: 0.15, bright: 0.6, edge: 0.9, rough: 0.85, energy: 0.5, density: 0.55 } },
  '怒り': { distance: 0.1, space: 0.2, medium: 0, D: 0.9,
    ground: { size: 0.8, bright: 0.35, edge: 0.5, rough: 0.7, energy: 0.9, density: 0.85, morph: { rep: 0.5, long: 0.5 } },
    figure: { size: 0.55, bright: 0.6, edge: 0.8, rough: 0.5, energy: 0.9, density: 0.8, morph: { q: 0.6, long: 0.4 } } },
  '悲しみ': { distance: 0.4, space: 0.5, medium: 0, D: 0.75,
    // v0.5: 作業用 BGM の「悲しみ」は間のある独奏ピアノ（出来事 1.6 回/秒、Continuity 0.12）
    ground: { size: 0.6, bright: 0.2, edge: 0.1, rough: 0.05, energy: 0.18, density: 0.5, morph: { n: 0.6, long: 0.4 } },
    figure: { size: 0.45, bright: 0.3, edge: 0.25, rough: 0.05, energy: 0.18, density: 0.32, lift: -0.4, morph: { n: 0.6, ri: 0.4 } } },
  '優しさ': { distance: 0.2, space: 0.4, medium: 0, D: 0.8,
    // v0.5: 作業用 BGM の「優しさ」は音色が暗め（413 Hz）で長調のピアノ
    ground: { size: 0.55, bright: 0.25, edge: 0.1, rough: 0, energy: 0.2, density: 0.65, lift: 0.1, morph: { n: 0.7, long: 0.3 } },
    figure: { size: 0.35, bright: 0.35, edge: 0.2, rough: 0, energy: 0.22, density: 0.4, lift: 0.1, morph: { n: 0.6, rep: 0.4 } } },
  '独り言': { distance: 0.15, space: 0.2, medium: 0, D: 0,
    ground: { density: 0 },
    figure: { size: 0.5, bright: 0.45, edge: 0.45, rough: 0.15, energy: 0.35, voice: 1, density: 0.8, morph: { rep: 0.3, long: 0.3, q: 0.2, n: 0.2 } } },
};
