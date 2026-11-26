# VSI Music

意味（情景・感情・動き）を重ね合わせて、音楽をその場で作り続ける実験的なエンジン。
A real-time music engine that composes from **superposed meanings** — scenes, emotions and motion — with an explicit theory instead of a black box.

**Demo**: GitHub Pages（`index.html`）— Resonance Field（操作盤）/ Lantern Walk（ゲームの例）/ API Test Bench

## 考え方 / Idea
音楽の意味 = 聴き手が推定する「仮想の身体・その動き方・それが置かれた世界」（Virtual Source Inference）。
語（情景・感情）や連続値を意味空間で線形に重ね合わせ、物理と伝統の型の語彙で音にする。詳しくは [docs/09_research.md](docs/09_research.md)。

## 使い方 / Usage
- ブラウザだけで動く（AudioWorklet）: `index.html` を任意の静的サーバーで開く（例 `python3 -m http.server`）。
- API: [docs/08_api.md](docs/08_api.md)
  ```js
  import { MusicClient } from './web/runtime/client.js';
  const music = await MusicClient.create({ scene: '草原' });
  await music.start();
  music.mix('place', { 海中: 0.7, 草原: 0.3 });
  music.mix('threat', { 怒り: 0.5, 決意: 0.5 }, { weight: 3, role: 'mood' });
  music.cue('boss');
  ```
- 開発用サーバー（任意。外部ゲーム用の WebSocket、LLM による言葉の解釈）: `node tools/server.js`。LLM を使う場合は `.env` に `OPENCODE_API_KEY`。公開版はブラウザ内の埋め込みモデルで言葉を解釈する。
- 試験: `node tools/test_runtime.js`、`node tools/browser_check.js`、`node tools/rt_bench.js`

## 構成 / Layout
| | |
|---|---|
| `core/` | 理論とエンジン（意味空間の合成、歩容・和声・形式、旋律、マナー、取引） |
| `kernel/` | 物理（音源・世界・残響） |
| `web/` | 実行環境（AudioWorklet、SDK）、操作盤、ゲームの例、試験台 |
| `assets/web/` | 録音（CC0、FLAC）と語彙の埋め込み |
| `docs/` | 理論・設計・研究ノート |
| `tools/` | 録音・統計の作成、分析、試験 |

素材のライセンスは [THIRD_PARTY.md](THIRD_PARTY.md)。コードは MIT。
