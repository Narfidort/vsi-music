#!/usr/bin/env python3
"""伝統の旋律（music21 同梱の著作権の切れたコーパス）から、旋律の統計を学ぶ。
    .venv/bin/python tools/melody_stats.py   → core/data/melody_model.json
- 音程の遷移: 調の音階の度数で数えた音程（−7..+7）の 2 次のマルコフ連鎖 P(次 | 直前)。長調・短調別
- 1 小節のリズムの型: 拍子（4/4, 3/4, 6/8, 2/4）ごとに、16 分（6/8 は 8 分 × 2）の格子での発音位置の集合と頻度。
  特徴量: 密度（発音数 / 格子）、シンコペーション（拍の頭以外で始まり次の拍をまたぐ音の割合）
コーパス: Essen 民謡集、ライアンのフィドル曲集、オニール 1850、ノッティンガム、エアーズ、バッハのコラールのソプラノ
"""
import json, collections, random, sys
from pathlib import Path
from music21 import corpus, converter, note, meter, key as m21key

random.seed(1)
GROUPS = {'essenFolksong': 31, 'ryansMammoth': 500, 'oneills1850': 39, 'nottingham-dataset': 1, 'airdsAirs': 6, 'bach': 120}
paths = []
for p in corpus.getPaths():
    s = str(p)
    for gname, lim in GROUPS.items():
        if f'/corpus/{gname}/' in s: paths.append((gname, p))
by = collections.defaultdict(list)
for gname, p in paths: by[gname].append(p)
sel = []
for gname, lim in GROUPS.items():
    lst = by[gname]; random.shuffle(lst); sel += [(gname, p) for p in lst[:lim]]

iv2 = {'major': collections.Counter(), 'minor': collections.Counter()}
rhy = collections.defaultdict(collections.Counter)
n_mel = 0

def melodies(path):
    try:
        obj = converter.parse(path)
    except Exception:
        return []
    if hasattr(obj, 'scores'): scores = list(obj.scores)
    else: scores = [obj]
    out = []
    for sc in scores:
        try:
            part = sc.parts[0] if len(sc.parts) else sc
            out.append(part)
        except Exception:
            continue
    return out

def degree_steps(notes, k):
    # 音階の度数の絶対値 = diatonicNoteNum（調によらない幹音の番号）。v1 はオクターブの境目（ド）で数えていたので、
    # 主音がドでない調では 1 度の動きが ±8 度に化けていた（生成側は ±5 度までしか使わないので影響は数え漏れだけ）
    return [n.pitch.diatonicNoteNum for n in notes]

for gname, p in sel:
    for part in melodies(p):
        try:
            flat = part.flatten()
            ns = [x for x in flat.notes if isinstance(x, note.Note)]
            if len(ns) < 8: continue
            k = flat.analyze('key')
            mode = 'minor' if k.mode == 'minor' else 'major'
            degs = degree_steps(ns, k)
            ivs = [b - a for a, b in zip(degs, degs[1:]) if a is not None and b is not None]
            ivs = [max(-7, min(7, x)) for x in ivs]
            for a, b in zip(ivs, ivs[1:]): iv2[mode][(a, b)] += 1
            ts = flat.getElementsByClass(meter.TimeSignature)
            ts = ts[0].ratioString if len(ts) else '4/4'
            if ts not in ('4/4', '3/4', '6/8', '2/4'): continue
            q = 0.25 if ts != '6/8' else 0.5  # 4 分音符 = 1.0
            barlen = {'4/4': 4, '3/4': 3, '6/8': 3, '2/4': 2}[ts]
            grid = int(round(barlen / q))
            for m in part.getElementsByClass('Measure'):
                onsets, durs = [], []
                for x in m.notes:
                    pos = int(round(float(x.offset) / q)); dur = max(1, int(round(float(x.quarterLength) / q)))
                    if 0 <= pos < grid: onsets.append(pos); durs.append(min(dur, grid - pos))
                if not onsets or float(m.duration.quarterLength) < barlen - 1e-6: continue  # 弱起の不完全小節は除く
                rhy[ts][tuple(zip(onsets, durs))] += 1
            n_mel += 1
        except Exception as e:
            continue
    print(gname, Path(p).name, n_mel, file=sys.stderr)

def feats(cell, grid, beat):
    on = [o for o, _ in cell]
    dens = len(on) / grid
    sync = sum(1 for o, d in cell if o % beat != 0 and (o % beat) + d > beat) / max(1, len(cell))
    return dens, sync

model = {'source': 'music21 corpus (essenFolksong, ryansMammoth, oneills1850, nottingham, airdsAirs, bach chorales soprano)', 'melodies': n_mel, 'interval': {}, 'rhythm': {}}
for mode, c in iv2.items():
    tab = collections.defaultdict(dict)
    for (a, b), n in c.items(): tab[a][b] = n
    model['interval'][mode] = {str(a): {str(b): n for b, n in sorted(d.items())} for a, d in sorted(tab.items())}
for ts, c in rhy.items():
    grid = {'4/4': 16, '3/4': 12, '6/8': 6, '2/4': 8}[ts]; beat = {'4/4': 4, '3/4': 4, '6/8': 3, '2/4': 4}[ts]
    top = c.most_common(300)
    model['rhythm'][ts] = {'grid': grid, 'beat': beat, 'cells': [{'cell': [list(x) for x in cell], 'n': n, 'density': round(feats(cell, grid, beat)[0], 3), 'sync': round(feats(cell, grid, beat)[1], 3)} for cell, n in top]}
out = Path('core/data'); out.mkdir(parents=True, exist_ok=True)
(out / 'melody_model.json').write_text(json.dumps(model, ensure_ascii=False))
# ブラウザ（AudioWorklet）でもそのまま読めるように ES モジュールとしても書く
(out / 'melody_model.js').write_text('// 伝統の旋律の統計（tools/melody_stats.py が生成）\nexport default ' + json.dumps(model, ensure_ascii=False) + ';\n')
print('melodies', n_mel, {ts: len(v['cells']) for ts, v in model['rhythm'].items()}, {m: sum(sum(d.values()) for d in t.values()) for m, t in model['interval'].items()})
