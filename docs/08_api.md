# 08. API リファレンス（カーネルとクライアントの約束）

> 2026-11-26 v1.1（チャンネルの線形結合、取引と着地）。この文書が、カーネル（`core/`）とクライアント（UI・ゲーム・試験台）の境界。
> どちらかを直すときは、ここに書いた命令・イベント・意味を変えない限り、もう片方は影響を受けない。
> 担当は **BGM だけ**。実体のある効果音（焚き火のはじけ、足音）はゲームのオブジェクトの仕事。BGM に馴染ませた音（深海の泡、かわいい曲の量子化された効果音）は含む。

## 構成

```
ゲーム / UI ──(関数 or WebSocket)──▶ client.js ──postMessage──▶ music-worklet.js（音声スレッド）──▶ core/api.js ──▶ core/engine.js
            ◀───────── イベント ─────────────────────────────────┘
言葉（say）: client.js ──HTTP──▶ server.js /api/say ──▶ LLM（鍵はサーバーの .env だけ）──▶ 命令に直して送る
```

| 入口 | 使う人 | ファイル |
|---|---|---|
| `Music`（同期の関数） | Node（書き出し・試験） | `core/api.js` |
| `MusicClient`（非同期、Promise） | 同じページのゲーム・UI | `web/runtime/client.js` |
| WebSocket の JSON | 外部のゲーム（Unity、Godot、別プロセス） | `ws://localhost:8787/ws?role=game` |

起動: `node tools/server.js`（http://localhost:8787/ → 試験台 `web/test/`）。

## 命令（すべて JSON で表せる: `{ op, args }`）

### 適応の口（状況を伝える）

**ゲームが送るのは「1 単語」ではなく、系統ごとのチャンネルに「語: 比率」の辞書**。カーネルがすべてのチャンネルを意味空間で線形結合する。
語は 2 つの成分に分かれる。世界（距離・広がり・水・離散化、粒の層）と、身体（気分）。情景語は「世界 + その場所のふつうの気分」、感情語は「身体」、プリセットは両方。世界は世界の成分を持つ語だけで、身体は身体の成分を持つ語だけで、それぞれ重み付き平均する。

```js
music.mix('place',  { 海中: 0.7, 草原: 0.3 })                       // 場所（境目では混合）
music.mix('threat', { 緊張: 0.6, 不安: 0.4 }, { weight: 0.8, role: 'mood' }) // 脅威（世界は場所のまま、気分だけ）
music.mix('threat', { 怒り: 0.5, 決意: 0.5 }, { weight: 3, role: 'mood' })   // 戦闘: 重み 3 で気分を支配 → 湖の世界のまま戦闘の曲
music.weight('outcome', 1.5)                                         // 重みだけ変える（勝利の余韻を消していく）
music.mix('threat', null)                                            // チャンネルを外す
```

**名前のない点も語として使える**（語彙に縛られない。辞書のキーにそのまま書く）:
- `vad(V, A, Dm[, 広大さ])` … 気分。快 −1..1、覚醒 0..1、支配 0..1（例 `vad(-0.7,0.9,0.1)` = 恐怖型、`vad(-0.7,0.9,0.9)` = 怒り型）
- `world(距離, 広がり, 水[, 離散化])` … 場所の世界（例 `world(0.3,0.95,0.2)`）
名前のある語（感情 35、情景 31、プリセット 8）は、この連続空間の上の目印。

| op | args | 意味 |
|---|---|---|
| `mix` | `channel, {語: 比率} \| 語 \| null, { weight?, role?, manner?, transition?, within?, intensity? }` | チャンネルの中身を置き換える（`null` で外す）。`weight` はチャンネル全体の相対的な重み（上限なし。既定 1）。`role` = `'both'`（既定）/ `'world'`（世界だけ）/ `'mood'`（気分だけ）。**取引 `{ tx, plan, eta }` を返す** |
| `weight` | `channel, w, opts?` | チャンネルの重みだけを変える |
| `situation` | `{ scene?, blend?, intensity?, contrast?, transition?, within? }` | `main` チャンネルの簡略形。`blend` の合計が 1 未満なら、残りは直前の `main`。`scene` と `blend` が両方あれば、その情景の中での感情の混合。`intensity` だけなら激しさだけを変える |
| `signal` | `name, value` | ゲームの連続量。`bind` の重みで軸と激しさに足される。1.5 秒の S 字 |
| `bind` | `name, { 軸: 重み, intensity?: 重み }` | 信号と軸の対応 |
| `cue` | `name, { section? }?` | 出来事。次の拍で区間を切り替える（取引 `plan: 'now'` を返す） |
| `manner` | `name, def` | マナーを名前で登録する（上の節） |
| `nudge` | `{ 軸: ±0.5 以内 }` | 相対的な変化（累積。次の `situation` で消える） |
| `feedback` | `score, note?` | 好み（イベント `record`、`feedback/log.jsonl`） |
| `say` | `text` | 言葉（client.js のみ。LLM が `situation` / `nudge` に直す） |

#### 取引（トランザクション）と着地
構造が変わりうる命令（`mix` / `weight` / `situation` / `cue`）は、取引を 1 つ開いて `{ tx, plan, eta }` を返す。新しい取引が来たら、古いものは `superseded`（最新が勝つ）。

| plan | いつ | 何が起きる |
|---|---|---|
| `morph` | 歩容も進行も変わらない | 区間はそのまま、意味座標だけ S 字で動く（1〜4 秒） |
| `pivot` | 進行・調が変わる | 次の 4 小節の区切りで、ピボット和音を経て |
| `bridge` | 歩容が変わる | 4 小節の区切り + 古い歩容の橋渡し（溜め / 間）2〜4 小節 |
| `quick` | 上の待ちが `within` 秒（既定 4）を超える | 次の小節で切り替える（クロスフェード）。静かになる向きは 1 小節の間を挟む |
| `now` | `cue`、`transition: 'now'` | 次の拍。予定済みの古い音を 1 小節（旋律は 2 拍）かけて弱めながら、新しい区間を弱めに入れて立ち上げる（クロスフェード） |

着地したら `{ type: 'landed', tx, plan, after: 実際にかかった秒, eta }` が届く。

### スタイルマナー（作品・国・状況ごとの「らしさ」）
理論は変えず、語彙に**制約・好み・ゆらぎ・旋律の軸**を掛ける（`core/manner.js`）。全体に掛ける（`style`）か、名前を付けて登録し（`manner`）、チャンネルに結び付ける（`mix` の `manner`）。有効なマナー = 全体 + チャンネルのマナー（重いチャンネルほど後に重ねるので勝つ）。

```js
music.manner('璃月', {
  allow:  { progressions: ['エオリア i-VII-VI-VII', '叙事 i-VI-III-VII'] },   // 許可リスト
  deny:   { gaits: ['跳ねる'] },                                              // 禁止リスト
  prefer: { instruments: { harp: 3, flute: 2 }, gaits: { 漂う: 2 } },        // 好み（倍率）
  temperature: 0.6, seed: 42,                                                // ゆらぎと再現
  tempo:  { scale: 0.9, max: 120 },
  melody: { density: 0.35, leap: 0.4, contour: 0.3, syncopation: 0.1 },      // 旋律の軸
});
music.mix('place', { 草原: 1 }, { manner: '璃月' });   // 場所と一緒にマナーが切り替わる
music.style({ temperature: 0.3 });                     // 全体
```

| キー | 意味 |
|---|---|
| `allow` / `deny` | `gaits` / `progressions` / `instruments` の許可・禁止。何も残らなければ理論の選択に戻る（無音にしない） |
| `prefer` | 同じく好みの倍率（事前分布） |
| `temperature` | 0 = いつも最も合うもの、1 = 合うほど選ばれやすい確率的な選択、2 = かなり自由（進行の選択に効く。歩容はいつも決定的） |
| `seed` | 同じ種なら同じ選択 |
| `tempo` | `scale`（倍率）、`min`、`max` |
| `melody` | 旋律の軸（理論の既定値を上書き）: `density` 音の密度、`syncopation`、`leap` 跳躍の多さ、`contour` −1 下行 ↔ +1 上行、`repetition` 同音反復 |
| `motif` / `logo` | ライトモチーフ / 音のロゴ |

### 手動の口（直接決める）

| op | args | 意味 |
|---|---|---|
| `set` | `{ 軸: 値 }`（入れ子も可） | 軸を直接決める（情景・信号より優先） |
| `unset` | `paths` | `set` を外す |
| `lock` / `unlock` | `paths` | 適応で動かさない。`'gait' / 'bpm' / 'key' / 'progression'` も固定できる |
| `form` | `{ section?, bars?, contrast? }` | 区間を指定する |
| `style` | `{ motif?, progressions?, instruments?, tempo?, logo? }` | 作品・ブランドの偏り（ライトモチーフ、進行・楽器の好み、テンポの倍率、音のロゴ） |
| `key` / `tempo` / `gait` / `progression` | 値 or `null` | 理論の決定を上書き（`null` で戻す） |

### 読み出し

| op | 返り値 |
|---|---|
| `state` | 下の表 |
| `vocabulary` | `{ presets, emotions, scenes, anchors }`（anchors = UI 用の感情の平面の座標） |

#### state の各キー
| キー | 意味 |
|---|---|
| `scene` | チャンネルの要約（例 `place:海中70+草原30 \| threat:緊張×0.80`） |
| `channels` | チャンネルごとの `{ items, weight, role }` |
| `latent` | いまの目標の意味座標。世界 4 軸（`distance` 距離、`space` 広がり、`medium` 水、`D` 離散化 = 1 で機械の演奏）と、`ground`（地 = 和声・伴奏）・`figure`（図 = 旋律）・`texture`（粒 = 泡などの馴染んだ音）の身体の軸（`size` 大きさ、`bright` 明るさ、`edge` 角、`rough` 粗さ、`energy` 活性、`voice` 声性、`density` 密度、`lift` 浮沈 −1..1、`morph` 相形態 = 叩いて鳴らす `n` / 叩いて止める `q` / 連打 `rep` / 持続 `long` / 転がって止まる `ri` の比） |
| `intensity` | 激しさ（利用者・信号の合計、0..1） |
| `I` | いまの小節の強度（区間の型 × 楽節の弧 + 激しさ） |
| `gait` | 歩容（動き方の型: 漂う・揺れる・嘆く・泣く・歩く・叩きつける・跳ねる・震える・行進） |
| `bpm` / `key` | テンポ / 調（主音 A からの半音。転調で +2、+4） |
| `progression` | いまの和声進行の名前 |
| `section` / `bars` / `bar` | 区間の型（静・溜め・熱・間）/ その長さ / いま何小節目か |
| `instruments` | 役割 → 楽器（bass、pad、chord、arp、melody …） |
| `tx` | いまの取引 `{ id, plan, eta, started, landed }` |
| `signals` / `locks` / `overrides` | 信号の値 / 固定した軸 / 手動で固定した理論の決定 |
| `onomatopoeia` | いまの音のオノマトペでの読み（地 … 図） |
| `time` | カーネルの時刻（秒） |

## イベント（`on(type, fn)`、WebSocket では `{ type: 'event', event }`）

| type | 中身 | いつ |
|---|---|---|
| `section` | `name`（静 / 溜め / 熱 / 間）, `bars`, `gait`, `bpm`, `prog`, `key` | 区間の頭 |
| `transition` | `from`, `to`（歩容）, `bpm` | 状況の変化で切り替えを始めるとき |
| `cue` | `name`, `section` | 合図を受けたとき |
| `landed` | `tx`, `plan`, `after`, `eta` | 取引が着地したとき（新しい状況の区間が始まった、または補間が終わった） |
| `superseded` | `tx`, `by` | 着地する前に新しい取引に置き換えられたとき |
| `bar` | `section`, `bar`, `gait`, `bpm`, `I`, `key`, `chord` | 毎小節 |
| `note` | `layer`, `freq`, `dur`, `semi` | 発音（既定では送らない。`noteEvents(true)`） |
| `record` | `kind`, `score`, `note`, `state` | フィードバック（サーバーの `feedback/log.jsonl` にも保存） |

## WebSocket の約束（外部のゲーム）

```jsonc
// ゲーム → サーバー
{ "id": "1", "op": "mix", "args": ["place", { "海中": 0.7, "草原": 0.3 }, { "within": 3 }] }
{ "id": "4", "op": "mix", "args": ["threat", { "緊張": 1 }, { "weight": 0.8, "role": "mood" }] }
{ "id": "2", "op": "cue", "args": ["boss"] }
{ "id": "3", "op": "say", "args": ["もっと絶望的に"] }
// サーバー → ゲーム
{ "type": "result", "id": "1", "value": { "tx": 7, "plan": "quick", "eta": 2.4 } }  // 失敗なら "error"
{ "type": "event", "event": { "type": "landed", "tx": 7, "plan": "quick", "after": 2.4 } }
{ "type": "event", "event": { "type": "section", "name": "熱", "gait": "叩きつける", "bpm": 135 } }
```

音を鳴らすのはブラウザ（`MusicClient.create({ bridge: true })`）。player がいないとき、ゲームには `error: "no player connected"` が返る。
試験: `node tools/test_runtime.js`（Worklet の模擬、WebSocket の中継）。

## 時間の約束（どれくらいで変わるか）

| 変化 | 反映 |
|---|---|
| `signal` / `set` / `nudge` | 意味座標は 1.5 秒の S 字。テンポは、同じ歩容のままならすぐなめらかに寄る |
| `situation`（情景が変わる） | 次の 4 小節の区切りでピボット和音を経て切り替える。歩容が変わるなら 2〜4 小節の橋渡し。意味座標の補間は着地の時刻に合わせる（典型的には 5〜16 秒） |
| `cue` / `transition: 'now'` | 次の拍（1 秒未満）。シンバルで隠す |
| `intensity` | 次の小節から |

## 実時間の性能（Node、48 kHz、128 サンプルのブロック、予算 2.67 ms）
- 平均 0.13〜0.35 ms
- まれに 10〜13 ms の突出がある（ごみ集め。1 分に数回）
- ブラウザでは `latencyHint: 'playback'`（既定）の大きめのバッファで吸収する

## 鍵の扱い
LLM の鍵（`OPENCODE_API_KEY`）は `.env`（権限 600）にだけ置く。`server.js` だけが読み、ブラウザ・文書・記録には出さない。モデルは `OPENCODE_MODEL`（既定 `deepseek-v4.1-flash`）。
