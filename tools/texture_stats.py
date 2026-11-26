#!/usr/bin/env python3
"""環境音（粒の層）の出来事の統計: 生起率・群れやすさ・出来事ごとの明るさと長さ。
    .venv/bin/python tools/texture_stats.py <file or folder> ...
群れやすさ = 出来事の間隔の変動係数（CV）。ポアソン過程なら 1、群れるほど大きい、規則的なら小さい。
"""
import sys, glob
from pathlib import Path
import numpy as np, librosa

def stats(path):
    y, sr = librosa.load(path, sr=22050, mono=True)
    S = np.abs(librosa.stft(y, n_fft=1024, hop_length=128))
    f = librosa.fft_frequencies(sr=sr, n_fft=1024)
    # 出来事の検出: 300 Hz 以上の帯域の正のスペクトル変化（持続音や地鳴りは除く）
    band = f > 300
    logS = np.log1p(100 * S[band])
    flux = np.maximum(0, np.diff(logS, axis=1)).sum(axis=0)
    flux = (flux - np.median(flux)) / (np.std(flux) + 1e-9)
    on = librosa.util.peak_pick(flux, pre_max=3, post_max=3, pre_avg=20, post_avg=20, delta=1.5, wait=4)
    t = on * 128 / sr
    dur = len(y) / sr
    ioi = np.diff(t)
    cents, decays = [], []
    for o in on[:400]:
        seg = S[:, o: o + 40]
        if seg.shape[1] < 5: continue
        frame = seg[:, 1]
        cents.append(float((f * frame).sum() / (frame.sum() + 1e-9)))
        e = (seg ** 2).sum(axis=0); e = e / (e.max() + 1e-12)
        below = np.where(e < 0.1)[0]
        decays.append(float((below[0] if len(below) else 40) * 128 / sr * 1000))
    return {
        "file": Path(path).name, "rate": len(t) / dur,
        "ioi_cv": float(np.std(ioi) / np.mean(ioi)) if len(ioi) > 3 else None,
        "event_centroid": float(np.median(cents)) if cents else None,
        "event_decay_ms": float(np.median(decays)) if decays else None,
    }

files = []
for a in sys.argv[1:]:
    p = Path(a)
    files += sorted(x for x in p.rglob("*") if x.suffix in {".m4a", ".wav", ".mp3"}) if p.is_dir() else [p]
for f in files:
    r = stats(f)
    print(f"{str(f.parent.name)[:12]:12s} {r['file'][:22]:22s} rate {r['rate']:5.1f}/s  ioiCV {r['ioi_cv'] or 0:4.2f}  centroid {r['event_centroid'] or 0:6.0f} Hz  decay {r['event_decay_ms'] or 0:5.1f} ms")
