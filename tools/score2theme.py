#!/usr/bin/env python3
"""楽譜データ（MusicXML / MIDI / ABC / Humdrum など music21 が読めるもの）→ テーマの入力形式。
    .venv/bin/python tools/score2theme.py <file> [--start 1] [--bars 8] [--part 0] [--key C] [--minor]
出力:
    旋律  1 2 3 5 | 6 5 3 - | ...   （音階の度数。' = 1 オクターブ上、, = 下、- = 伸ばす、0 = 休み、#/b = 臨時記号）
    和音  I V vi IV                  （1 小節に 1 つ。和音記号があればそれ、複数パートなら響き、なければ旋律から推定）
使い方の例: 自分で買った楽譜の MusicXML、自分で耳コピして作った MIDI を変換して、操作盤の「テーマ」に貼る。
著作権のある曲の変換結果は、私的に楽しむ範囲で使う（配布・公開には権利者の許諾が要る）。
"""
import argparse, math
from fractions import Fraction
from music21 import converter, key as m21key, roman, harmony, note, chord, meter, pitch as m21pitch

ap = argparse.ArgumentParser()
ap.add_argument('file'); ap.add_argument('--start', type=int, default=None, help='省略 = 旋律が最初に鳴る小節から'); ap.add_argument('--bars', type=int, default=8)
ap.add_argument('--part', type=int, default=None, help='省略 = 旋律らしいパートを自動で選ぶ'); ap.add_argument('--key', default=None); ap.add_argument('--minor', action='store_true')
ap.add_argument('--index', type=int, default=0, help='ABC などで 1 ファイルに複数曲があるときの番号')
ap.add_argument('--json', action='store_true', help='1 行の JSON で出す（tools/private_themes.js が使う）')
a = ap.parse_args()

obj = converter.parse(a.file)
if hasattr(obj, 'scores') and len(obj.scores): obj = obj.scores[a.index]
parts = list(obj.parts) if hasattr(obj, 'parts') and len(obj.parts) else [obj]
# 旋律のパートを選ぶ: 音高のあるパートのうち、音が高く・単音で・音数が十分なもの（MIDI 由来の楽譜は 1 つ目が伴奏やベースのことが多い）
def melody_score(pt):
    ns = [n for n in pt.recurse().notes]
    if len(ns) < 16: return -1e9
    pitched = [n for n in ns if isinstance(n, (note.Note, chord.Chord))]
    if len(pitched) < 0.8 * len(ns): return -1e9  # 打楽器
    top = [(n.notes[-1] if isinstance(n, chord.Chord) else n).pitch.midi for n in pitched]
    mono = sum(isinstance(n, note.Note) for n in pitched) / len(pitched)
    mean = sum(top) / len(top)
    if mean < 55: return -1e9  # 低音のパート
    return mean + 12 * mono + 2 * math.log(len(pitched))
if a.part is None:
    ranked = sorted(range(len(parts)), key=lambda i: -melody_score(parts[i]))
    part = parts[ranked[0]]; a.part = ranked[0]
else: part = parts[min(a.part, len(parts) - 1)]
k = m21key.Key(a.key, 'minor' if a.minor else 'major') if a.key else obj.analyze('key')
sc = k.getScale(k.mode if k.mode in ('major', 'minor') else 'major')
measures = list(part.getElementsByClass('Measure'))
if not measures: part = part.makeMeasures(); measures = list(part.getElementsByClass('Measure'))
# 弱起（不完全な最初の小節）は飛ばす
ts0 = part.recurse().getElementsByClass(meter.TimeSignature).first() or meter.TimeSignature('4/4')
if measures and measures[0].duration.quarterLength < ts0.barDuration.quarterLength - 1e-6: measures = measures[1:]
def top_line(m):  # 小節の最上声（同じ時刻の音は一番高いもの）
    best = {}
    for n in m.recurse().notes:
        if n.duration.isGrace or not isinstance(n, (note.Note, chord.Chord)): continue
        p = (n.notes[-1] if isinstance(n, chord.Chord) else n).pitch
        off = float(n.getOffsetInHierarchy(m))
        if off not in best or p.midi > best[off]: best[off] = p.midi
    return best
if a.start is None:
    # 旋律らしい 8 小節を探す（4 小節単位、最初の 96 小節まで）: 最上声の音の種類が多く、音数がほどよく、高めの区間。
    # 前奏の持続音や休み、伴奏だけの区間を避ける
    tl = [top_line(m) for m in measures]
    def window_score(i):
        w = tl[i:i + a.bars]; ps = [p for b in w for p in b.values()]
        if len(ps) < a.bars: return -1e9
        empty = sum(1 for b in w if not b)
        return len(set(ps)) + 0.25 * min(len(ps), 6 * a.bars) - 4 * empty + 0.1 * (sum(ps) / len(ps) - 60)
    cands = list(range(0, max(1, min(len(measures) - a.bars + 1, 96)), 4)) or [0]
    a.start = max(cands, key=window_score) + 1
sel = measures[a.start - 1: a.start - 1 + a.bars]
# 調の確かめ: 曲全体の推定（近い調と取り違えやすい）の候補から、選んだ区間の旋律で臨時記号が最も少なく、
# 終わりの音が主音・属音に近いものを選ぶ（--key を与えたときはそのまま）
if not a.key:
    mel = [p for m in sel for _, p in sorted(top_line(m).items())] if 'top_line' in globals() else []
    if mel:
        cands = [k] + list(getattr(k, 'alternateInterpretations', []))
        def key_score(kk):
            t = kk.tonic.pitchClass
            ok = {0, 2, 4, 5, 7, 9, 11} if kk.mode == 'major' else {0, 2, 3, 5, 7, 8, 10, 9, 11}  # 短調は導音・旋律的短音階の 6 も可
            acc = sum(((p - t) % 12) not in ok for p in mel)
            end = (mel[-1] - t) % 12
            tonic_share = sum(((p - t) % 12) == 0 for p in mel) / len(mel)
            first_ = (mel[0] - t) % 12
            return -acc / len(mel) * 10 + 4 * tonic_share + (0.6 if end == 0 else 0.2 if end == 7 else 0) + (0.3 if first_ in (0, 7) else 0) + 1.5 * (getattr(kk, 'correlationCoefficient', 0) or 0)
        k = max(cands, key=key_score)
        sc = k.getScale(k.mode if k.mode in ('major', 'minor') else 'major')

# 音高 → 度数の記号。綴り（E♭ と D#）ではなく、主音から何半音かで決める（楽譜と調の綴りが食い違っても二重の臨時記号にならない）
# 長調の基準は長音階、短調は自然短音階（themes の書き方と同じ）。音階にない音は慣用の書き方（長調: b2 b3 #4 b6 b7、短調: b2 #3 #4 #6 #7）
BASE = [0, 2, 4, 5, 7, 9, 11] if k.mode != 'minor' else [0, 2, 3, 5, 7, 8, 10]
OUT = {1: (2, -1), 3: (3, -1), 6: (4, 1), 8: (6, -1), 10: (7, -1)} if k.mode != 'minor' else {1: (2, -1), 4: (3, 1), 6: (4, 1), 9: (6, 1), 11: (7, 1)}
tonic_pc = k.tonic.pitchClass
first = next((n for m in sel for n in m.recurse().notes if isinstance(n, note.Note)), None)
# 主音の基準 = 旋律（最上声）の中央の高さ以下で最も近い主音
_mel = sorted(p for m in sel for p in top_line(m).values())
_med = _mel[len(_mel) // 2] if _mel else (first.pitch.midi if first else 60)
tonic_midi = _med - ((_med - tonic_pc) % 12)
def deg_info(p):
    r = (p.midi - tonic_pc) % 12
    return (BASE.index(r) + 1, 0) if r in BASE else OUT[r]
def token(p):
    d, acc = deg_info(p)
    mi = p.midi
    # 外れすぎた音（MIDI 由来の楽譜で最上声が伴奏に飛んだ音など）はオクターブ単位で寄せる: 主音の 10 半音下〜19 半音上
    while mi < tonic_midi - 10: mi += 12
    while mi > tonic_midi + 19: mi -= 12
    octv = math.floor((mi - tonic_midi - (BASE[d - 1] + acc)) / 12 + 1e-9)
    return ('#' * acc if acc > 0 else 'b' * -acc) + str(d) + ("'" * octv if octv > 0 else ',' * -octv)

def gcd_frac(xs):
    g = Fraction(0)
    for x in xs: g = Fraction(math.gcd(g.numerator * x.denominator, x.numerator * g.denominator), g.denominator * x.denominator) if g else x
    return g

bars, chords = [], []
for m in sel:
    ts = m.getContextByClass(meter.TimeSignature) or ts0
    L = Fraction(ts.barDuration.quarterLength).limit_denominator(64)
    evs = []
    for n in m.recurse().notesAndRests:
        if n.duration.isGrace: continue
        off = Fraction(n.getOffsetInHierarchy(m)).limit_denominator(64); du = Fraction(n.quarterLength).limit_denominator(64)
        if isinstance(n, chord.Chord): n = n.notes[-1]  # 旋律 = いちばん上の音
        evs.append((off, du, n))
    grid = gcd_frac([L] + [x for e in evs for x in (e[0], e[1]) if x > 0])
    grid = max(grid, Fraction(1, 4))  # 16 分より細かくはしない
    slots = int(L / grid); toks = ['0'] * slots; top = {}
    for off, du, n in evs:
        i = int(off / grid)
        if i >= slots: continue
        if isinstance(n, note.Note):
            if i in top and top[i] >= n.pitch.midi: continue  # 同じ時刻に高い音があれば、そちらが旋律（最上声）
            top[i] = n.pitch.midi
            toks[i] = token(n.pitch)
            for j in range(i + 1, min(slots, int((off + du) / grid))):
                if toks[j] in ('0', '-'): toks[j] = '-'
    bars.append(' '.join(toks))
    # 和音: 和音記号があればそれ。なければ、すべてのパートのこの小節の音（長さで重み付け、低音は 2 倍）を、
    # 調の基本の和音（長調 I ii iii IV V vi、短調 i III iv V VI VII）の型と照らし合わせて選ぶ
    cs = list(m.recurse().getElementsByClass(harmony.ChordSymbol))
    fig = None
    if cs:
        try: fig = roman.romanNumeralFromChord(cs[0], k).romanNumeral
        except Exception: fig = None
    if not fig:
        tonic = k.tonic.pitchClass; w = [0.0] * 12; lo = None
        for pt in parts:
            pm = pt.measure(m.number) if hasattr(pt, 'measure') else None
            if pm is None: continue
            for n in pm.recurse().notes:
                for p in (n.pitches if hasattr(n, 'pitches') else []):
                    pc = (p.pitchClass - tonic) % 12; w[pc] += float(n.quarterLength)
                    if lo is None or p.midi < lo[0]: lo = (p.midi, pc)
        if lo: w[lo[1]] += 0.5 * sum(w) / 3
        cands = {'I': (0, 4, 7), 'ii': (2, 5, 9), 'iii': (4, 7, 11), 'IV': (5, 9, 0), 'V': (7, 11, 2), 'vi': (9, 0, 4)} if k.mode != 'minor' else \
                {'i': (0, 3, 7), 'III': (3, 7, 10), 'iv': (5, 8, 0), 'V': (7, 11, 2), 'VI': (8, 0, 3), 'VII': (10, 2, 5)}
        tot = sum(w) or 1
        def chord_score(c):
            ct = cands[c]; inside = sum(w[x] for x in ct)
            return inside - 0.6 * (tot - inside) + 0.3 * w[ct[0]] + (0.01 if c in ('I', 'i') else 0)
        fig = max(cands, key=chord_score)
    chords.append(fig)

if a.json:
    import json
    print(json.dumps({'key': k.tonic.name, 'minor': k.mode == 'minor', 'part': a.part, 'start': a.start, 'bars': len(sel), 'melody': ' | '.join(bars), 'chords': ' '.join(chords)}, ensure_ascii=False))
    raise SystemExit
print(f'調    {k.tonic.name} {"短調" if k.mode == "minor" else "長調"}（{a.file.split("/")[-1]}、パート {a.part}、{a.start} 小節目から {len(sel)} 小節）')
print('旋律  ' + ' | '.join(bars))
print('和音  ' + ' '.join(chords))
