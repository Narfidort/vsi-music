import { pipeline } from '@huggingface/transformers';
import { readFileSync } from 'node:fs';
import { interpretLocal } from '../../web/runtime/say_local.js';
const vocab = JSON.parse(readFileSync(new URL('../../assets/web/vocab_embeddings.json', import.meta.url)));
globalThis.fetch = async () => ({ json: async () => vocab });
const pipe = await pipeline('feature-extraction', vocab.model, { dtype: 'q8' });
const embedder = async (t) => (await pipe(t, { pooling: 'mean', normalize: true })).data;
for (const t of ['もっと切なく', 'ボス戦で絶体絶命', '夜明けの希望に満ちた草原', 'ちょっとだけ静かに', '和風の森で神秘的に', '雨の日の図書館', '子どもたちが楽しく遊ぶ', 'もっと明るく', '亡くなった仲間を弔う'])
  console.log(t.padEnd(14, '　'), JSON.stringify(await interpretLocal(t, { embedder })));
