#!/usr/bin/env python3
"""曲の形式と緩急（盛り上がりと静けさのつなぎ方）を測る。
    .venv/bin/python tools/form_stats.py corpus/HOT
- 拍を追い、4 拍 = 1 小節として小節ごとの音量（dB）と打楽器の比率を出す
- 自己相似（クロマ + MFCC）から区間の境目を推定し、小節に揃える
- 境目ごとに: 音量の段差（後 4 小節 − 前 4 小節）、直前 4 小節の傾き（ビルドアップ）、
  直前の 1 拍の落ち込み（ブレイク）、直後の 1 小節の立ち上がり方
"""
import sys, json
from pathlib import Path
import numpy as np, librosa

def analyze(path):
    y, sr = librosa.load(path, sr=22050, mono=True)
    hop = 512
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop)
    if len(beats) < 32: return None
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    db = 20 * np.log10(rms + 1e-6)
    H, P = librosa.decompose.hpss(np.abs(librosa.stft(y, hop_length=hop)))
    perc = P.sum(0) / (H.sum(0) + P.sum(0) + 1e-9)
    bars = beats[::4]
    bar_db = np.array([np.mean(db[a:b]) for a, b in zip(bars[:-1], bars[1:])])
    bar_perc = np.array([np.mean(perc[a:b]) for a, b in zip(bars[:-1], bars[1:])])
    beat_db = np.array([np.mean(db[a:b]) for a, b in zip(beats[:-1], beats[1:])])
    # 区間の境目（拍同期の特徴の凝集クラスタリング → 小節に丸める）
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop)
    feat = librosa.util.sync(np.vstack([librosa.util.normalize(chroma), librosa.util.normalize(mfcc)]), bars, aggregate=np.median)
    k = max(4, min(14, len(bar_db) // 8))
    bnd = librosa.segment.agglomerative(feat, k)
    bnd = sorted(set(int(b) for b in bnd if 4 <= b <= len(bar_db) - 4))
    out = []
    for b in bnd:
        before, after = bar_db[b - 4:b], bar_db[b:b + 4]
        jump = float(np.mean(after) - np.mean(before))
        ramp = float(np.polyfit(np.arange(4), before, 1)[0] * 3)  # 直前 4 小節で何 dB 上がったか
        last_beat = beat_db[4 * b - 1] if 4 * b - 1 < len(beat_db) else beat_db[-1]
        dip = float(last_beat - np.mean(beat_db[4 * b - 5:4 * b - 1]))  # 直前の 1 拍の落ち込み（負 = ブレイク）
        first = float(bar_db[b] - np.mean(bar_db[b + 1:b + 4]))  # 直後の 1 小節が後に比べて弱い（負 = 徐々に立ち上がる）
        out.append({'bar': b, 'jump': round(jump, 1), 'ramp': round(ramp, 1), 'dip': round(dip, 1), 'first': round(first, 1),
                    'perc_jump': round(float(np.mean(bar_perc[b:b + 4]) - np.mean(bar_perc[b - 4:b])), 3)})
    seg_lens = np.diff([0] + bnd + [len(bar_db)])
    return {'file': Path(path).stem, 'tempo': float(np.atleast_1d(tempo)[0]), 'bars': len(bar_db),
            'range_db': round(float(np.percentile(bar_db, 90) - np.percentile(bar_db, 10)), 1),
            'seg_len_median': float(np.median(seg_lens)), 'boundaries': out}

res = []
for d in sys.argv[1:]:
    for f in sorted(list(Path(d).glob('*.m4a')) + list(Path(d).glob('*.wav'))):
        r = analyze(str(f))
        if r: res.append(r); print(f"{r['file'][:28]:28s} {r['tempo']:5.0f}BPM 小節{r['bars']:4d} 幅{r['range_db']:5.1f}dB 区間長{r['seg_len_median']:4.0f}", file=sys.stderr)
ups = [b for r in res for b in r['boundaries'] if b['jump'] >= 3]
downs = [b for r in res for b in r['boundaries'] if b['jump'] <= -3]
flat = [b for r in res for b in r['boundaries'] if -3 < b['jump'] < 3]
def s(lst, k): return f"中央値 {np.median([b[k] for b in lst]):+.1f}" if lst else '-'
summary = {
    'songs': len(res), 'boundaries': sum(len(r['boundaries']) for r in res),
    'up': {'n': len(ups), 'jump': s(ups, 'jump'), 'ramp_before': s(ups, 'ramp'), 'dip_last_beat': s(ups, 'dip'),
           'break_rate(dip<=-3dB)': round(np.mean([b['dip'] <= -3 for b in ups]), 2) if ups else None, 'first_bar': s(ups, 'first'), 'perc_jump': s(ups, 'perc_jump')},
    'down': {'n': len(downs), 'jump': s(downs, 'jump'), 'ramp_before': s(downs, 'ramp'), 'dip_last_beat': s(downs, 'dip'), 'first_bar': s(downs, 'first')},
    'flat': {'n': len(flat)},
    'range_db_median': float(np.median([r['range_db'] for r in res])), 'seg_len_median_bars': float(np.median([r['seg_len_median'] for r in res])),
}
print(json.dumps(summary, ensure_ascii=False, indent=1))
Path('corpus/form_stats.json').write_text(json.dumps({'summary': summary, 'songs': res}, ensure_ascii=False))
