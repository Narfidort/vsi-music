// 情景語・情動語 = 意味空間の領域の中心（v1）。軸は v0 と同じ（kernel/space.js）。新しいつまみはない。
// 歩容・和声進行・楽式はここから理論（core/theory.js）が導く。
export const PRESETS = {
  '深海': { distance: 0.5, space: 0.95, medium: 0.85, D: 0.7,
    ground: { size: 0.95, bright: 0.1, edge: 0.03, rough: 0.08, energy: 0.25, density: 0.75, lift: -0.4, morph: { long: 0.7, n: 0.3 } },
    figure: { size: 0.1, bright: 0.7, edge: 0.3, rough: 0, energy: 0.2, density: 0.25, lift: 0.2, morph: { n: 1 } }, // 「高いピアノのアクセント」（最初の試聴のコメント）
    texture: { size: 0.6, bright: 0.3, edge: 0.05, rough: 0.25, energy: 0.45, density: 0.72 } },
  '星空': { distance: 0.8, space: 1, medium: 0, D: 0.85,
    ground: { size: 0.6, bright: 0.35, edge: 0.15, rough: 0, energy: 0.15, density: 0.5, lift: 0.2, morph: { n: 0.6, long: 0.4 } },
    figure: { size: 0.12, bright: 0.6, edge: 0.4, rough: 0, energy: 0.2, density: 0.35, lift: 0.3, morph: { n: 0.7, rep: 0.3 } } },
  // 焚き火: 近く狭い場所で、温かい撥弦が歩く。はじけは粒の層（空気中なので泡は出ない）
  '焚き火': { distance: 0.15, space: 0.25, medium: 0, D: 0.8,
    ground: { size: 0.6, bright: 0.3, edge: 0.3, rough: 0.15, energy: 0.35, density: 0.75, lift: 0.1, morph: { rep: 0.7, n: 0.3 } },
    figure: { size: 0.45, bright: 0.4, edge: 0.3, rough: 0.1, energy: 0.35, density: 0.5, lift: 0.1, morph: { rep: 0.6, n: 0.4 } },
  }, // v1.2: はじける音を外した（実体のある効果音は BGM の担当外）
  // 怒り: 重い身体が強く速く、粗く動く → 叩きつける歩容、和声的短音階（導音の強い引力）
  '怒り': { distance: 0.2, space: 0.45, medium: 0, D: 0.88,
    ground: { size: 0.8, bright: 0.4, edge: 0.6, rough: 0.7, energy: 0.95, density: 0.9, lift: -0.1, morph: { n: 0.5, q: 0.5 } },
    figure: { size: 0.55, bright: 0.55, edge: 0.7, rough: 0.5, energy: 0.9, density: 0.8, lift: -0.1, morph: { long: 0.6, q: 0.4 } } },
  // 寂しさ（v1 の「悲しみ」）: 評価では悲しみより寂しさに聞こえた。Huron の melancholy = 低い覚醒で沈む
  '寂しさ': { distance: 0.4, space: 0.5, medium: 0, D: 0.8,
    ground: { size: 0.6, bright: 0.2, edge: 0.1, rough: 0.05, energy: 0.18, density: 0.5, lift: -0.3, morph: { n: 0.6, long: 0.4 } },
    figure: { size: 0.45, bright: 0.3, edge: 0.25, rough: 0.05, energy: 0.18, density: 0.4, lift: -0.5, morph: { long: 0.6, ri: 0.4 } } },
  // 悲しみ（v1.1）: 涙を誘う悲しみ = 沈むのに覚醒が高い（Huron の grief）。ピアノの分散和音の上で弦が歌い、倚音で泣く
  '悲しみ': { distance: 0.3, space: 0.6, medium: 0, D: 0.8,
    ground: { size: 0.55, bright: 0.3, edge: 0.1, rough: 0.05, energy: 0.4, density: 0.7, lift: -0.3, morph: { n: 0.6, long: 0.4 } },
    figure: { size: 0.3, bright: 0.5, edge: 0.15, rough: 0.1, energy: 0.55, density: 0.55, lift: -0.4, morph: { long: 0.8, ri: 0.2 } } },
  // 優しさ: 近くで抱かれて揺れる（揺りかご）
  '優しさ': { distance: 0.2, space: 0.3, medium: 0, D: 0.82,
    ground: { size: 0.5, bright: 0.25, edge: 0.1, rough: 0, energy: 0.2, density: 0.65, lift: 0.15, morph: { n: 0.7, long: 0.3 } },
    figure: { size: 0.3, bright: 0.4, edge: 0.15, rough: 0, energy: 0.22, density: 0.45, lift: 0.15, morph: { n: 0.7, rep: 0.3 } } },
  // かわいい（v1.4）: 小さく軽い身体が、弾むけれど穏やかに歩く。電子音（機械の演奏 = D 1）は感情ではなく場所・様式の性質なので外した
  //（評価: 元気すぎて調和の取れたかわいさではなかった）。元気な電子音楽は はしゃぐ・ポップ へ
  'かわいい': { distance: 0.25, space: 0.4, medium: 0, D: 0.85,
    ground: { size: 0.35, bright: 0.6, edge: 0.35, rough: 0.03, energy: 0.45, density: 0.65, lift: 0.4, morph: { n: 0.7, q: 0.3 } },
    figure: { size: 0.15, bright: 0.8, edge: 0.45, rough: 0.03, energy: 0.5, density: 0.55, lift: 0.5, morph: { n: 0.6, q: 0.4 } } },
  // はしゃぐ: v1.3 までの「かわいい」（Yunomi を分析した元気な電子音楽）。D 1 = 機械の演奏、効果音は量子化された粒
  'はしゃぐ': { distance: 0.25, space: 0.4, medium: 0, D: 1,
    ground: { size: 0.3, bright: 0.75, edge: 0.6, rough: 0.05, energy: 0.85, density: 0.85, lift: 0.5, morph: { q: 0.5, n: 0.5 } },
    figure: { size: 0.15, bright: 0.85, edge: 0.6, rough: 0.05, energy: 0.9, density: 0.7, lift: 0.7, morph: { q: 0.6, n: 0.4 } },
    texture: { size: 0.1, bright: 0.85, edge: 0.5, rough: 0.1, energy: 0.8, density: 0.45, morph: { n: 0.3, q: 0.3, ri: 0.3, rep: 0.1 } } },
};
