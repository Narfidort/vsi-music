// 意味座標 → 日本語オノマトペ（02_theory §5）。
// 子音 = edge × rough × size（有声化）、母音 = bright × size、形態 = morph。

const KANA = {
  // 子音 → 母音順 a i u e o
  '':  ['あ', 'い', 'う', 'え', 'お'],
  k:   ['か', 'き', 'く', 'け', 'こ'], g: ['が', 'ぎ', 'ぐ', 'げ', 'ご'],
  s:   ['さ', 'し', 'す', 'せ', 'そ'], z: ['ざ', 'じ', 'ず', 'ぜ', 'ぞ'],
  t:   ['た', 'ち', 'つ', 'て', 'と'], d: ['だ', 'ぢ', 'づ', 'で', 'ど'],
  n:   ['な', 'に', 'ぬ', 'ね', 'の'], h: ['は', 'ひ', 'ふ', 'へ', 'ほ'],
  b:   ['ば', 'び', 'ぶ', 'べ', 'ぼ'], p: ['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ'],
  m:   ['ま', 'み', 'む', 'め', 'も'], r: ['ら', 'り', 'る', 'れ', 'ろ'],
  w:   ['わ', 'い', 'う', 'え', 'を'], f: ['ふぁ', 'ふぃ', 'ふ', 'ふぇ', 'ふぉ'],
};
const VOICE = { k: 'g', s: 'z', t: 'd', h: 'b', p: 'b', f: 'b' };
const V = ['a', 'i', 'u', 'e', 'o'];

// 子音の素性空間上のプロトタイプ（edge, rough）
const C1 = [
  { c: 'm', edge: 0.05, rough: 0.05 }, { c: 'h', edge: 0.2, rough: 0.15 },
  { c: 'n', edge: 0.3, rough: 0.1 }, { c: 'p', edge: 0.7, rough: 0.15 }, { c: 'k', edge: 0.85, rough: 0.3 },
  { c: 't', edge: 0.8, rough: 0.1 }, { c: 's', edge: 0.6, rough: 0.45 }, { c: 'g', edge: 0.65, rough: 0.85 },
  { c: 'z', edge: 0.45, rough: 0.85 }, { c: 'b', edge: 0.3, rough: 0.6 },
];

function pick(z) {
  let best = C1[0], bd = Infinity;
  for (const p of C1) { const d = (p.edge - z.edge) ** 2 + (p.rough - z.rough) ** 2; if (d < bd) { bd = d; best = p; } }
  let c = best.c;
  if (z.size > 0.65 && VOICE[c]) c = VOICE[c];           // 大きい → 濁音化
  return c;
}

function vowel(z) {
  // F1–F2 平面: bright ≈ F2、size ≈ 開口（F1）として近似
  if (z.bright > 0.65) return z.size > 0.6 ? 'e' : 'i';
  if (z.bright < 0.35) return z.size > 0.5 ? 'o' : 'u';
  return z.size > 0.45 ? 'a' : (z.bright > 0.5 ? 'e' : 'u');
}

function bodyOno(z, medium) {
  const c = pick(z), v = vowel(z);
  const mora = KANA[c][V.indexOf(v)];
  // 第2モーラ（日本語オノマトペの典型的な CVCV: きら・ころ・ふわ・もわ・ぱち）
  //   粗い → r（ころ・ごろ・ざら）／丸い → w（ふわ・もわ）／尖って滑らか → t（ぱち・かち）
  const c2 = z.rough > 0.45 ? 'r' : z.edge < 0.35 ? 'w' : 't';
  const v2 = c2 === 'w' ? 'a' : c2 === 't' ? 'i' : (v === 'i' ? 'a' : v);
  const mora2 = c2 === 't' && v2 === 'i' ? 'ち' : KANA[c2][V.indexOf(v2)];
  const m = z.morph || {};
  const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] || 'rep';
  const stem = mora + mora2;
  switch (top) {
    case 'rep':  return stem + stem;          // ころころ
    case 'q':    return stem + 'っ';          // ころっ
    case 'n':    return mora + (medium > 0.5 || z.size > 0.7 ? 'ーん' : mora2 + 'ん'); // ぼーん／ころん
    case 'long': return mora + 'ーー';        // ぼーー
    case 'ri':   return stem + 'り';          // ころり
    default:     return stem + stem;
  }
}

// 情景全体のオノマトペ: 地 … 図（例: 「もーん … ちりん」）。密度 0 のレイヤーは省く。
// 粒の層: 割れ（角が高い）→ ぱち／ばち、泡（角が低い）→ ぷく／ぼこ。疎なら一回、密なら重複
function textureOno(t) {
  const stem = t.edge > 0.5 ? (t.size > 0.5 ? 'ばち' : 'ぱち') : (t.size > 0.4 ? 'ぼこ' : 'ぷく');
  return t.density > 0.35 ? stem + stem : stem + 'ん';
}

export function onomatopoeia(z) {
  const parts = [];
  for (const l of ['ground', 'figure']) if (z[l] && z[l].density > 0.01) parts.push(bodyOno(z[l], z.medium));
  if (z.texture && z.texture.density > 0.01) parts.push(textureOno(z.texture));
  return parts.join(' … ') || 'しーん';
}
export function layerOnomatopoeia(z) {
  return { ground: z.ground.density > 0.01 ? bodyOno(z.ground, z.medium) : 'しーん', figure: z.figure.density > 0.01 ? bodyOno(z.figure, z.medium) : 'しーん' };
}
