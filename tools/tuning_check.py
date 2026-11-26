#!/usr/bin/env python3
"""out/tuning/*.wav の基本周波数を pYIN で推定し、目標音高からのずれ [cent] を表にする。"""
import glob, re, numpy as np, librosa
rows = {}
for f in sorted(glob.glob("out/tuning/*.wav")):
    name, midi = re.match(r".*/(.+)_(\d+)\.wav", f).groups(); midi = int(midi)
    y, sr = librosa.load(f, sr=22050)
    y = y[int(0.1 * sr): int(1.0 * sr)]
    f0, vf, _ = librosa.pyin(y, fmin=50, fmax=2000, sr=sr, frame_length=2048)
    f0 = f0[vf & ~np.isnan(f0)]
    cents = float(np.median(1200 * np.log2(f0 / librosa.midi_to_hz(midi)))) if len(f0) else float("nan")
    rows.setdefault(name, {})[midi] = cents
print("instrument     " + "".join(f"{m:>9}" for m in [45, 57, 69, 81]))
for k, v in rows.items():
    print(f"{k:14s}" + "".join(f"{v.get(m, np.nan):9.1f}" for m in [45, 57, 69, 81]))
