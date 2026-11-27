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
ap.add_argument('file'); ap.add_argument('--start', type=int, default=1); ap.add_argument('--bars', type=int, default=8)
ap.add_argument('--part', type=int, default=0); ap.add_argument('--key', default=None); ap.add_argument('--minor', action='store_true')
ap.add_argument('--index', type=int, default=0, help='ABC などで 1 ファイルに複数曲があるときの番号')
a = ap.parse_args()

obj = converter.parse(a.file)
if hasattr(obj, 'scores') and len(obj.scores): obj = obj.scores[a.index]
parts = list(obj.parts) if hasattr(obj, 'parts') and len(obj.parts) else [obj]
part = parts[min(a.part, len(parts) - 1)]
k = m21key.Key(a.key, 'minor' if a.minor else 'major') if a.key else obj.analyze('key')
sc = k.getScale(k.mode if k.mode in ('major', 'minor') else 'major')
measures = list(part.getElementsByClass('Measure'))
if not measures: part = part.makeMeasures(); measures = list(part.getElementsByClass('Measure'))
# 弱起（不完全な最初の小節）は飛ばす
ts0 = part.recurse().getElementsByClass(meter.TimeSignature).first() or meter.TimeSignature('4/4')
if measures and measures[0].duration.quarterLength < ts0.barDuration.quarterLength - 1e-6: measures = measures[1:]
sel = measures[a.start - 1: a.start - 1 + a.bars]

# 音高 → 度数の記号（主音の基準オクターブは最初の音から決める）
first = next((n for m in sel for n in m.recurse().notes if isinstance(n, note.Note)), None)
def deg_info(p):
    d = sc.getScaleDegreeFromPitch(p, comparisonAttribute='step') or 1
    ref = sc.pitchFromDegree(d); ref.octave = p.octave
    acc = round(p.ps - ref.ps)
    while acc > 6: acc -= 12
    while acc < -6: acc += 12
    return d, acc
tonic_ref = m21pitch.Pitch(k.tonic.name); tonic_ref.octave = first.pitch.octave if first else 4
if first and first.pitch.diatonicNoteNum < tonic_ref.diatonicNoteNum: tonic_ref.octave -= 1
def token(p):
    d, acc = deg_info(p)
    rel = p.diatonicNoteNum - tonic_ref.diatonicNoteNum
    octv = math.floor(rel / 7)
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
    slots = int(L / grid); toks = ['0'] * slots
    for off, du, n in evs:
        i = int(off / grid)
        if i >= slots: continue
        if isinstance(n, note.Note):
            toks[i] = token(n.pitch)
            for j in range(i + 1, min(slots, int((off + du) / grid))): toks[j] = '-'
    bars.append(' '.join(toks))
    # 和音: 和音記号 → 他のパートの響き → 旋律から推定
    cs = list(m.recurse().getElementsByClass(harmony.ChordSymbol))
    fig = None
    try:
        if cs: fig = roman.romanNumeralFromChord(cs[0], k).romanNumeral
        elif len(parts) > 1:
            beat1 = obj.measure(m.number).chordify().recurse().getElementsByClass(chord.Chord)
            if beat1: fig = roman.romanNumeralFromChord(max(beat1, key=lambda c: c.quarterLength), k).romanNumeral
    except Exception: fig = None
    if not fig:
        weight = {}
        for off, du, n in evs:
            if isinstance(n, note.Note): d, _ = deg_info(n.pitch); weight[d] = weight.get(d, 0) + float(du)
        cands = {'I': (1, 3, 5), 'IV': (4, 6, 1), 'V': (5, 7, 2), 'vi': (6, 1, 3), 'ii': (2, 4, 6)} if k.mode != 'minor' else {'i': (1, 3, 5), 'iv': (4, 6, 1), 'V': (5, 7, 2), 'VI': (6, 1, 3), 'VII': (7, 2, 4)}
        fig = max(cands, key=lambda c: sum(weight.get(d, 0) for d in cands[c]) + (0.01 if c in ('I', 'i') else 0))
    chords.append(fig)

print(f'調    {k.tonic.name} {"短調" if k.mode == "minor" else "長調"}（{a.file.split("/")[-1]}、{a.start} 小節目から {len(sel)} 小節）')
print('旋律  ' + ' | '.join(bars))
print('和音  ' + ' '.join(chords))
