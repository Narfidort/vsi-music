#!/usr/bin/env python3
"""corpus/reports/*.json をラベル（フォルダ）ごとに集計し、比較表と散布図を出す。
    .venv/bin/python tools/corpus_compare.py   → corpus/compare.md, corpus/compare.png
"""
import json, glob
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
plt.rcParams["font.family"] = ["Hiragino Sans", "sans-serif"]

KEYS = ["duration", "lufs", "lra", "tempo", "beat_cv", "onset_rate", "percussive_ratio",
        "centroid_median", "centroid_iqr", "balance_db", "continuity", "flatness", "stereo_width",
        "key_strength", "dissonance_mean", "chord_changes_per_min", "chord_vocab",
        "melody_voiced_ratio", "melody_median_midi", "melody_range_semitones", "melody_notes_per_min",
        "melody_step_ratio", "melody_leap_ratio", "melody_mean_interval", "repetition"]

rows = [json.load(open(f)) for f in sorted(glob.glob("corpus/reports/*.json"))]
groups = sorted({r["playlist"] for r in rows})
med = {g: {k: np.nanmedian([r.get(k) if r.get(k) is not None else np.nan for r in rows if r["playlist"] == g]) for k in KEYS} for g in groups}

lines = ["| 特徴量 | " + " | ".join(f"{g} (n={sum(r['playlist']==g for r in rows)})" for g in groups) + " |", "|---|" + "---|" * len(groups)]
for k in KEYS:
    lines.append(f"| {k} | " + " | ".join(f"{med[g][k]:.3g}" for g in groups) + " |")
lines.append("\n## 曲ごと\n")
lines.append("| playlist | file | tempo | key | centroid | balance | continuity | percussive | diss | chords/min | melody range | step | leap | rep |")
lines.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
f = lambda v, d=2: "—" if v is None else f"{v:.{d}f}"
for r in rows:
    lines.append(f"| {r['playlist']} | {r['file'][:28]} | {r['tempo']:.0f} | {r['key']}{r['scale'][0]} | {r['centroid_median']:.0f} | {r['balance_db']:.1f} | {r['continuity']:.2f} | {r['percussive_ratio']:.2f} | {f(r['dissonance_mean'],3)} | {r['chord_changes_per_min']:.0f} | {f(r.get('melody_range_semitones'),0)} | {f(r.get('melody_step_ratio'))} | {f(r.get('melody_leap_ratio'))} | {f(r.get('repetition'))} |")
open("corpus/compare.md", "w").write("\n".join(lines) + "\n")
print("\n".join(lines[: len(KEYS) + 2]))

pairs = [("balance_db", "continuity"), ("centroid_median", "percussive_ratio"), ("melody_step_ratio", "melody_mean_interval"), ("tempo", "onset_rate"), ("dissonance_mean", "chord_changes_per_min"), ("lufs", "repetition")]
fig, axes = plt.subplots(2, 3, figsize=(15, 9))
colors = dict(zip(groups, plt.cm.tab10.colors))
for ax, (a, b) in zip(axes.flat, pairs):
    for r in rows:
        if r.get(a) is None or r.get(b) is None: continue
        ax.scatter(r[a], r[b], color=colors[r["playlist"]], s=40)
        ax.annotate(r["file"].split(" - ")[-1][:12], (r[a], r[b]), fontsize=6, alpha=0.7)
    ax.set_xlabel(a); ax.set_ylabel(b)
for g in groups: axes[0, 0].scatter([], [], color=colors[g], label=g)
axes[0, 0].legend(fontsize=8)
fig.tight_layout(); fig.savefig("corpus/compare.png", dpi=80)
