// 言葉 → 命令（サーバーも LLM も使わない版）。docs/08_api.md の say
//   1) 埋め込み（multilingual-e5-small、ブラウザ内で実行）で、文と語彙（感情・情景・マナー）の近さを測る
//      → 近い感情の混合（blend）、十分に近い情景（scene）、はっきり名指しされたマナー
//   2) 「もっと明るく」「少し静かに」のような相対的な指示は、規則で軸の変化（delta）と激しさに直す
// 語彙のベクトルは事前に計算してある（tools/embed/build_vocab_embeddings.mjs → assets/web/vocab_embeddings.json）。
import { EMOTIONS, SCENES } from '../../core/lexicon.js';
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
let VOCAB = null, EMBED = null;

async function defaultEmbedder(model) {
  const T = await import(/* @vite-ignore */ TRANSFORMERS);
  const pipe = await T.pipeline('feature-extraction', model, { dtype: 'q8' });
  return async (text) => (await pipe(text, { pooling: 'mean', normalize: true })).data;
}

// 相対的な指示（強さの語 × 方向の語）
const DIRS = [
  [/明る|晴れ/, { bright: 0.15, lift: 0.1 }], [/暗/, { bright: -0.15, lift: -0.1 }],
  [/静か|穏やか|落ち着/, { energy: -0.15 }, -0.15], [/激し|熱く|盛り上/, { energy: 0.15 }, 0.2],
  [/速|テンポを上/, { energy: 0.1 }], [/遅|ゆっくり/, { energy: -0.1 }],
  [/広/, { space: 0.15 }], [/狭/, { space: -0.15 }], [/近/, { distance: -0.15 }], [/遠/, { distance: 0.15 }],
  [/重/, { size: 0.15 }], [/軽/, { size: -0.15 }], [/柔らか|丸く/, { edge: -0.15 }], [/鋭|硬く/, { edge: 0.15 }],
  [/ざらざら|荒々し/, { rough: 0.15 }], [/滑らか|なめらか/, { rough: -0.1 }],
];
const STRENGTH = [[/少し|ちょっと|やや/, 0.6], [/もっと|さらに|より|かなり|すごく/, 1.3]];

export async function interpretLocal(text, { base = '', embedder = null } = {}) {
  VOCAB ||= await (await fetch(`${base}/assets/web/vocab_embeddings.json`)).json();
  EMBED ||= embedder || (await defaultEmbedder(VOCAB.model));
  const v = await EMBED(VOCAB.prefix + text);
  const sims = VOCAB.items.map((it) => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * it.v[i]; return { ...it, s }; });
  const top = (kind) => sims.filter((x) => x.kind === kind).sort((a, b) => b.s - a.s);
  const emo = top('emotion'), sce = top('scene'), man = top('manner');
  const out = { reason: '' };

  // 相対的な指示
  let k = 1; for (const [re, f] of STRENGTH) if (re.test(text)) k = f;
  const delta = {}; let dI = 0, relative = /もっと|さらに|より|少し|ちょっと|やや/.test(text);
  for (const [re, d, di] of DIRS) if (re.test(text)) { for (const [a, x] of Object.entries(d)) delta[a] = +((delta[a] || 0) + x * k).toFixed(2); if (di) dI += di * k; }
  if (Object.keys(delta).length) out.delta = delta;

  // 感情: 上位の近さを温度付きの重みに（似た語どうしの混合）
  const T = 0.012, e0 = emo[0].s, ws = emo.slice(0, 4).map((x) => [x.w, Math.exp((x.s - e0) / T)]).filter(([, w]) => w > 0.15);
  const sum = ws.reduce((a, [, w]) => a + w, 0);
  const blend = Object.fromEntries(ws.map(([n, w]) => [n, +(w / sum).toFixed(2)]));
  // 情景: 文中にある語（複数なら混合）、なければ感情と同じくらい近いもの
  const inText0 = sce.filter((x) => text.includes(x.w));
  const inText = inText0.filter((x) => !inText0.some((y) => y !== x && y.w.includes(x.w))); // 「夜明け」の中の「夜」は数えない
  const directionOnly = relative && Object.keys(delta).length > 0; // 「もっと明るく」: 場所も気分も変えず、軸だけ動かす
  let sc = null;
  if (inText.length === 1) sc = inText[0];
  else if (!inText.length && !directionOnly && sce[0].s >= e0 - 0.005) sc = sce[0];
  if (sc) out.scene = sc.w;
  // マナー: 文中にその語（または強く近い）
  const mn = man.find((x) => text.includes(x.w)) || (man[0].s > 0.9 ? man[0] : null);
  if (mn) out.manner = mn.w;
  if (!directionOnly) {
    // 相対的な指示（「もっと切なく」）は感情へ部分的に寄せる（合計 < 1 = 残りはいまの曲）
    out.blend = relative ? Object.fromEntries(Object.entries(blend).map(([n, w]) => [n, +(w * 0.4 * k).toFixed(2)])) : blend;
    if (inText.length > 1) for (const x of inText) out.blend[x.w] = +(1 / inText.length).toFixed(2); // 場所が複数: 場所も混ぜる
  }
  if (dI) out.intensityDelta = +dI.toFixed(2);
  // ---- 連続値の解釈（v1.6）: 一覧から選ぶのではなく、語と語の「間」にも着地する ----
  // 全感情語の近さで重みを付けて快・覚醒・支配を平均する（なめらかな補間）。語彙にない言い回しも、近い語の間の点になる
  {
    const TE = 0.006, ws2 = emo.map((x) => [x, Math.exp((x.s - e0) / TE)]); // 近い語に寄せた重み（平らすぎると中央に寄る）
    const sw = ws2.reduce((a, [, w]) => a + w, 0), acc = [0, 0, 0, 0];
    for (const [x, w] of ws2) { const e = EMOTIONS[x.w] || [0, 0.4, 0.5, 0]; for (let i = 0; i < 4; i++) acc[i] += (w / sw) * (e[i] ?? 0); }
    out.point = { V: +acc[0].toFixed(2), A: +acc[1].toFixed(2), D: +acc[2].toFixed(2), vast: +acc[3].toFixed(2) };
    out.mood = `vad(${out.point.V},${out.point.A},${out.point.D}${out.point.vast > 0.05 ? ',' + out.point.vast : ''})`;
    out.near = emo.slice(0, 3).map((x) => x.w);
    // 世界: 文中の情景語、または感情と同じくらい近い情景があるときだけ。情景の近さで重みを付けて距離・広がり・水を平均する
    if (inText.length || (!directionOnly && sce[0].s >= e0 - 0.005)) {
      const pool = inText.length ? inText : sce.slice(0, 4), s0 = pool[0].s, wz = pool.map((x) => [x, inText.length ? 1 : Math.exp((x.s - s0) / TE)]);
      const sz = wz.reduce((a, [, w]) => a + w, 0), wd = [0, 0, 0];
      for (const [x, w] of wz) { const S = SCENES[x.w]; wd[0] += (w / sz) * S.distance; wd[1] += (w / sz) * S.space; wd[2] += (w / sz) * S.medium; }
      out.worldPoint = { distance: +wd[0].toFixed(2), space: +wd[1].toFixed(2), medium: +wd[2].toFixed(2) };
      out.world = `world(${out.worldPoint.distance},${out.worldPoint.space},${out.worldPoint.medium})`;
      out.nearScenes = pool.slice(0, 2).map((x) => x.w);
    }
    if (directionOnly) { delete out.point; delete out.mood; }
  }
  out.reason = [(sc && `場所: ${sc.w}`) || (inText.length > 1 && `場所: ${inText.map((x) => x.w).join('+')}`), out.blend && `気分: ${Object.keys(out.blend).join('・')}`, mn && `マナー: ${mn.w}`, out.delta && `調整: ${Object.entries(out.delta).map(([a, x]) => `${a}${x > 0 ? '+' : ''}${x}`).join(' ')}`].filter(Boolean).join(' / ');
  return out;
}
