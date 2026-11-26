#!/usr/bin/env python3
"""曲を音源分離（demucs）して、パートごとの構造を測る。効果音（SE）の分析が主目的。
    .venv/bin/python tools/stem_analyze.py <file> [--start 60 --dur 60]
- drums: 16 分音符の格子の上での打撃パターン（低域 = キック、中域 = スネア・クラップ、高域 = ハイハット）
- bass : 音の長さと格子位置
- other: 出来事を 1 つずつ切り出し、種類を推定する
    音程あり（平坦度が低い）/ ノイズ（高い）、音高の滑り（f0 の傾き）、長さ、格子に乗っているか
  → 効果音らしい出来事 = ノイズの噴出・大きな音高の滑り・短い高音のきらめき
"""
import sys, json, argparse, subprocess, tempfile
from pathlib import Path
import numpy as np, librosa

ap = argparse.ArgumentParser(); ap.add_argument("file"); ap.add_argument("--start", type=float, default=60); ap.add_argument("--dur", type=float, default=60)
a = ap.parse_args()
tmp = Path(tempfile.mkdtemp())
clip = tmp / "clip.wav"
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(a.start), "-t", str(a.dur), "-i", a.file, "-ar", "44100", str(clip)], check=True)
subprocess.run([sys.executable, "-m", "demucs", "-n", "htdemucs", "-o", str(tmp), str(clip)], check=True, capture_output=True)
st = tmp / "htdemucs" / "clip"
sr = 22050
S = {k: librosa.load(str(st / f"{k}.wav"), sr=sr, mono=True)[0] for k in ["drums", "bass", "other", "vocals"]}
mix = sum(S.values())
tempo, beats = librosa.beat.beat_track(y=S["drums"] + 0.3 * S["bass"], sr=sr, hop_length=256)
bt = librosa.frames_to_time(beats, sr=sr, hop_length=256)
tempo = float(np.atleast_1d(tempo)[0])
if tempo < 100: tempo *= 2; bt = np.sort(np.concatenate([bt, (bt[:-1] + bt[1:]) / 2]))
R = {"file": Path(a.file).name, "tempo": tempo, "energy_share": {k: float(np.sum(v ** 2) / np.sum(mix ** 2)) for k, v in S.items()}}

def grid_pos(t):
    i = np.searchsorted(bt, t) - 1
    if i < 0 or i + 1 >= len(bt): return None
    frac = (t - bt[i]) / (bt[i + 1] - bt[i])
    return (i % 4) * 4 + int(round(frac * 4)) % 4, abs(frac * 4 - round(frac * 4))

def onsets(y, fmin=None, fmax=None):
    Sx = np.abs(librosa.stft(y, n_fft=1024, hop_length=128)); f = librosa.fft_frequencies(sr=sr, n_fft=1024)
    m = np.ones_like(f, bool)
    if fmin: m &= f >= fmin
    if fmax: m &= f <= fmax
    env = librosa.onset.onset_strength(S=librosa.amplitude_to_db(Sx[m]), sr=sr, hop_length=128)
    on = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=128, units="time", backtrack=False)
    return on

# ドラム: 帯域ごとに 16 分の格子位置のヒストグラム（16 = 1 小節）
R["drums"] = {}
for name, lo, hi in [("kick", 20, 150), ("snare", 150, 2500), ("hat", 6000, None)]:
    h = np.zeros(16); off = []
    for t in onsets(S["drums"], lo, hi):
        g = grid_pos(t)
        if g: h[g[0]] += 1; off.append(g[1])
    R["drums"][name] = {"hist": (h / max(1, h.max())).round(2).tolist(), "per_bar": float(h.sum() / max(1, len(bt) / 4)), "offgrid": float(np.mean(off)) if off else None}

# その他: 出来事の分類
y = S["other"]; on = onsets(y)
ev = []
for t0, t1 in zip(on, list(on[1:]) + [a.dur]):
    seg = y[int(t0 * sr): int(min(t1, t0 + 0.6) * sr)]
    if len(seg) < 512: continue
    rms = float(np.sqrt(np.mean(seg ** 2)))
    flat = float(np.median(librosa.feature.spectral_flatness(y=seg, n_fft=512, hop_length=128)))
    cen = float(np.median(librosa.feature.spectral_centroid(y=seg, sr=sr, n_fft=512, hop_length=128)))
    f0 = librosa.yin(seg, fmin=80, fmax=3000, sr=sr, frame_length=1024, hop_length=128) if len(seg) >= 1024 else np.array([np.nan])
    st_ = 12 * np.log2(f0 / 440)
    slope = float((st_[-1] - st_[0]) / (len(seg) / sr)) if len(st_) > 3 else 0.0  # 半音/秒
    g = grid_pos(t0)
    ev.append({"t": float(t0), "rms": rms, "flat": flat, "centroid": cen, "glide": slope, "dur": float(t1 - t0), "grid": int(g[0]) if g else None, "off": float(g[1]) if g else None})
rmsmax = max(e["rms"] for e in ev) if ev else 1
for e in ev:
    e["kind"] = ("noise" if e["flat"] > 0.2 else
                 "glide" if abs(e["glide"]) > 24 and e["dur"] > 0.08 else
                 "sparkle" if e["centroid"] > 3500 and e["dur"] < 0.25 else "tonal")
kinds = {}
for e in ev:
    if e["rms"] < 0.1 * rmsmax: continue
    kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
R["other"] = {"events_per_s": len(ev) / a.dur, "kinds_per_min": {k: v * 60 / a.dur for k, v in kinds.items()},
              "grid_hist": np.bincount([e["grid"] for e in ev if e["grid"] is not None], minlength=16).tolist(),
              "offgrid": float(np.mean([e["off"] for e in ev if e["off"] is not None]))}
# ベース
bon = onsets(S["bass"], None, 400); h = np.zeros(16)
for t in bon:
    g = grid_pos(t)
    if g: h[g[0]] += 1
R["bass"] = {"per_bar": float(h.sum() / max(1, len(bt) / 4)), "hist": (h / max(1, h.max())).round(2).tolist()}
print(json.dumps(R, ensure_ascii=False, indent=1))
out = Path("corpus/stems"); out.mkdir(exist_ok=True)
(out / (Path(a.file).stem + ".json")).write_text(json.dumps({**R, "events": ev}, ensure_ascii=False, indent=0))
