// 語彙（感情・情景・マナー）の埋め込みベクトルを事前に計算する（ブラウザの say_local.js と同じモデル）。
//   cd tools/embed && node build_vocab_embeddings.mjs   → assets/web/vocab_embeddings.json
import { pipeline } from '@huggingface/transformers';
import { writeFileSync } from 'node:fs';
import { EMOTIONS, SCENES } from '../../core/lexicon.js';
import { MANNERS } from '../../core/manners.js';
export const MODEL_ID = 'Xenova/multilingual-e5-small';
// 語の説明（言い換え）。埋め込みの照合を安定させる
const GLOSS = {
  喜び: '喜び うれしい 歓喜', 楽しい: '楽しい 愉快 わいわい', わくわく: 'わくわく 期待 冒険の始まり', 幸せ: '幸せ 満ち足りた 幸福', 希望: '希望 前向き 夜明け',
  穏やか: '穏やか のんびり 平和', 安らぎ: '安らぎ 癒し くつろぎ', 優しさ: '優しさ 温かい 包み込む', 労り: '労り ねぎらい いたわり', 団らん: '団らん 和気あいあい 仲間と',
  懐かしさ: '懐かしい 郷愁 思い出', 祈り: '祈り 敬虔 静かな願い', 静寂: '静寂 しんと静か', 神秘: '神秘 不思議な光 幻想', 不思議: '不思議 奇妙 謎',
  切なさ: '切ない 胸が締め付けられる', 寂しさ: '寂しい ひとりぼっち', 孤独: '孤独 一人きり', 悲しみ: '悲しい 涙 泣ける', 追悼: '追悼 弔い 鎮魂',
  絶望: '絶望 どん底 望みがない', 不安: '不安 心配 落ち着かない', 恐怖: '恐怖 怖い 戦慄 ホラー', 緊張: '緊張 張り詰めた 危険が迫る', 焦り: '焦り 急げ 時間がない',
  怒り: '怒り 激怒 憤り', 苛立ち: '苛立ち いらいら', 沸々: '沸々とした怒り 静かな怒り', 決意: '決意 覚悟 立ち向かう', 勇気: '勇気 勇ましい 英雄',
  勝利: '勝利 凱旋 歓声', 荘厳: '荘厳 壮大 神聖', かわいい: 'かわいい 愛らしい ほのぼの', はしゃぐ: 'はしゃぐ 元気いっぱい ポップ', 無邪気: '無邪気 子ども', 眠い: '眠い うとうと 子守歌',
  深海: '深海 海の底 暗い水中', 海中: '海の中 水中 潜る', 星空: '星空 夜空 星', 宇宙: '宇宙 星々 無重力', 焚き火: '焚き火 キャンプ 暖炉', 部屋: '部屋 室内 自室', 街: '街 町 都市',
  草原: '草原 野原 風', 森: '森 森林 木々', 聖堂: '聖堂 教会 大聖堂', 洞窟: '洞窟 洞穴 地底', 夜: '夜 夜更け', 戦場: '戦場 戦い 戦闘 ボス戦', 電脳: '電脳 サイバー デジタル', ポップ: 'ポップ 電子音楽 EDM',
  砂漠: '砂漠 砂丘', 雪原: '雪原 雪景色 冬', 山頂: '山頂 山 頂上', 海辺: '海辺 浜辺 波打ち際', 雨: '雨 雨の日 しとしと', 夕暮れ: '夕暮れ 夕焼け 黄昏', 夜明け: '夜明け 朝日 明け方',
  雲の上: '雲の上 空 天空', 廃墟: '廃墟 遺跡 崩れた', 城: '城 王宮 城下', 地下: '地下 地下道 ダンジョン', 市場: '市場 マーケット 賑わい', 祭り: '祭り 縁日 お祭り', 図書館: '図書館 本 静か', 花畑: '花畑 花 春', 港: '港 船 波止場', 寺: '寺 寺院 お寺',
  和: '和風 日本 箏 雅', 民謡: '日本の民謡', 琉球: '沖縄 琉球 三線', 中華: '中華 中国 古箏', アラブ: 'アラビア 中東 砂漠の国', マカーム: '中東 トルコ', インド: 'インド ラーガ シタール',
  ガムラン: 'ガムラン バリ ジャワ', アフリカ: 'アフリカ 太鼓 カリンバ', ケルト: 'ケルト アイルランド 妖精', バロック: 'バロック 宮廷 チェンバロ', 聖堂_m: '教会 オルガン', ジャズ: 'ジャズ バー サックス', 夢: '夢 夢の中 ふわふわ',
};
const items = [
  ...Object.keys(EMOTIONS).map((w) => ({ w, kind: 'emotion' })),
  ...Object.keys(SCENES).map((w) => ({ w, kind: 'scene' })),
  ...Object.keys(MANNERS).map((w) => ({ w, kind: 'manner' })),
];
const embed = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' });
const out = { model: MODEL_ID, prefix: 'query: ', items: [] };
for (const it of items) {
  const text = GLOSS[it.kind === 'manner' && it.w === '聖堂' ? '聖堂_m' : it.w] || it.w;
  const v = await embed('query: ' + text, { pooling: 'mean', normalize: true });
  out.items.push({ ...it, v: Array.from(v.data).map((x) => +x.toFixed(4)) });
}
writeFileSync(new URL('../../assets/web/vocab_embeddings.json', import.meta.url), JSON.stringify(out));
console.log('embedded', out.items.length, 'dim', out.items[0].v.length);
