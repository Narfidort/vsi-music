#!/usr/bin/env python3
"""musiclens: 楽曲を基本要素から分析し、Claude が「見て読める」レポート（PNG + JSON）を作る。

    .venv/bin/python tools/musiclens.py <音声ファイル or フォルダ> [--out corpus/reports]

測るもの（docs/05_corpus.md）
  基本     : 長さ、ラウドネス（EBU R128: 統合 LUFS・ラウドネスレンジ）、ステレオ幅
  リズム   : テンポ、拍の規則性、オンセット率、打楽器成分の比率（HPSS）
  和声     : 調・調性の明確さ、コード進行（変化率・種類数）、感覚的不協和
  旋律     : 主旋律の f0（Melodia）→ 有声率、音域、跳躍・順次進行の比率、音高の中心
  構造     : 自己相似行列 → 反復度、区間境界
  理論の手がかり（kernel/analyze.js と同じ定義）: 重心、Balance（1 kHz 境界）、Continuity（p10/p90）
"""
import argparse, json, sys, os
from pathlib import Path
import numpy as np
import librosa, librosa.display
import essentia.standard as es
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

plt.rcParams["font.family"] = ["Hiragino Sans", "Hiragino Kaku Gothic ProN", "sans-serif"]
SR = 22050
EXT = {".m4a", ".mp3", ".wav", ".flac", ".opus", ".webm", ".ogg"}


def pct(x, p):
    return float(np.percentile(x, p))


def sethares(freqs, amps):
    """Plomp & Levelt / Sethares (1993) の感覚的不協和。部分音の全ペアのラフネスの和を、振幅の二乗和で正規化する。"""
    if len(freqs) < 2:
        return 0.0
    f1, f2 = np.meshgrid(freqs, freqs); a1, a2 = np.meshgrid(amps, amps)
    fmin, df = np.minimum(f1, f2), np.abs(f1 - f2)
    s = 0.24 / (0.021 * fmin + 19)
    d = np.minimum(a1, a2) * (np.exp(-3.5 * s * df) - np.exp(-5.75 * s * df))
    return float(np.triu(d, 1).sum() / (np.sum(amps ** 2) + 1e-12))


def analyze(path: Path):
    # ---- 読み込み
    stereo, sr44 = librosa.load(path, sr=44100, mono=False)
    if stereo.ndim == 1:
        stereo = np.stack([stereo, stereo])
    y44 = stereo.mean(axis=0).astype(np.float32)
    y = librosa.resample(y44, orig_sr=44100, target_sr=SR)
    dur = len(y) / SR
    R = {"file": path.name, "duration": dur}

    # ---- ラウドネス・ステレオ
    try:
        _, _, lufs, lra = es.LoudnessEBUR128(sampleRate=44100)(stereo.T.astype(np.float32))
        R["lufs"], R["lra"] = float(lufs), float(lra)
    except Exception:
        R["lufs"] = R["lra"] = None
    L, Rch = stereo[0], stereo[1]
    R["stereo_width"] = float(np.std(L - Rch) / (np.std(L + Rch) + 1e-9))

    # ---- 包絡・スペクトル（理論の手がかり）
    hop = 512
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    rms_db = librosa.amplitude_to_db(rms, ref=np.max)
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    P = S ** 2
    cent = librosa.feature.spectral_centroid(S=S, sr=SR)[0]
    lo, hi = P[freqs < 1000].sum(), P[freqs >= 1000].sum()
    R["centroid_median"] = float(np.median(cent))
    R["balance_db"] = float(10 * np.log10(hi / (lo + 1e-12)))
    # Continuity: 30 ms 窓の RMS の p10/p90（kernel/analyze.js と同じ定義）
    rms30 = librosa.feature.rms(y=y, frame_length=int(0.03 * SR), hop_length=int(0.005 * SR))[0]
    R["continuity"] = pct(rms30, 10) / (pct(rms30, 90) + 1e-9)
    R["flatness"] = float(np.median(librosa.feature.spectral_flatness(S=S)))
    # 区間ごとの重心の変動（明暗のダイナミクス）
    R["centroid_iqr"] = pct(cent, 75) - pct(cent, 25)

    # ---- リズム
    H, Pc = librosa.decompose.hpss(S)
    R["percussive_ratio"] = float((Pc ** 2).sum() / ((H ** 2).sum() + (Pc ** 2).sum()))
    oenv = librosa.onset.onset_strength(y=y, sr=SR, hop_length=hop)
    tempo, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=SR, hop_length=hop)
    bt = librosa.frames_to_time(beats, sr=SR, hop_length=hop)
    ibi = np.diff(bt)
    R["tempo"] = float(np.atleast_1d(tempo)[0])
    R["beat_cv"] = float(np.std(ibi) / np.mean(ibi)) if len(ibi) > 2 else None
    onsets = librosa.onset.onset_detect(onset_envelope=oenv, sr=SR, hop_length=hop)
    R["onset_rate"] = len(onsets) / dur

    # ---- 和声（essentia: HPCP → 調・コード、スペクトルピーク → 感覚的不協和）
    key, scale, strength = es.KeyExtractor()(y44)
    R["key"], R["scale"], R["key_strength"] = key, scale, float(strength)
    w, spec, peaks, hpcp_f = es.Windowing(type="blackmanharris62"), es.Spectrum(), es.SpectralPeaks(orderBy="magnitude", magnitudeThreshold=1e-5, maxPeaks=60, maxFrequency=5000), es.HPCP()
    diss_f = es.Dissonance()
    hpcps, diss, fen = [], [], []
    for frame in es.FrameGenerator(y44, frameSize=4096, hopSize=2048):
        sp = spec(w(frame))
        fen.append(float(np.sqrt(np.mean(frame ** 2))))
        f, m = peaks(sp)
        hpcps.append(hpcp_f(f, m))
        keep = f > 20
        diss.append(sethares(np.asarray(f)[keep][:30], np.asarray(m)[keep][:30]))
    hpcps = np.array(hpcps, dtype=np.float32)
    diss = np.array(diss)
    fen = np.array(fen); gate = 20 * np.log10(fen / (fen.max() + 1e-12) + 1e-12) > -30
    R["dissonance_mean"] = float(np.mean(diss[gate])) if gate.any() else None
    chords, cstr = es.ChordsDetection(hopSize=2048, sampleRate=44100, windowSize=2)(hpcps)
    ch = [c for c, s in zip(chords, cstr) if s > 0.3]
    changes = sum(1 for a, b in zip(ch, ch[1:]) if a != b)
    R["chord_changes_per_min"] = changes / (dur / 60)
    uniq, counts = np.unique(ch, return_counts=True) if ch else ([], [])
    R["chord_vocab"] = int(len(uniq))
    R["top_chords"] = [str(u) for u in np.array(uniq)[np.argsort(-np.array(counts))][:6]] if ch else []
    # 主要な進行（連続する重複を除いた列の先頭 12 個）
    seq = [ch[0]] if ch else []
    for c in ch[1:]:
        if c != seq[-1]:
            seq.append(c)
    R["chord_sequence_head"] = seq[:16]

    # ---- 旋律（Melodia による主旋律）
    eq = es.EqualLoudness()(y44)
    f0, conf = es.PredominantPitchMelodia(frameSize=2048, hopSize=256)(eq)
    f0 = np.array(f0)
    voiced = f0 > 0
    R["melody_voiced_ratio"] = float(voiced.mean())
    if voiced.sum() > 50:
        midi = librosa.hz_to_midi(f0[voiced])
        R["melody_median_midi"] = float(np.median(midi))
        R["melody_range_semitones"] = pct(midi, 95) - pct(midi, 5)
        # 音符化: 量子化した音高が 60 ms 以上続いた区間を 1 音とみなす
        q = np.round(librosa.hz_to_midi(np.where(voiced, f0, np.nan)))
        notes, cur, run = [], None, 0
        for v in q:
            if np.isnan(v):
                if cur is not None and run >= 15: notes.append(cur)
                cur, run = None, 0
            elif v == cur:
                run += 1
            else:
                if cur is not None and run >= 15: notes.append(cur)
                cur, run = v, 1
        iv = np.abs(np.diff(notes)) if len(notes) > 2 else np.array([])
        iv = iv[iv > 0]
        R["melody_notes_per_min"] = len(notes) / (dur / 60)
        R["melody_step_ratio"] = float((iv <= 2).mean()) if len(iv) else None
        R["melody_leap_ratio"] = float((iv >= 5).mean()) if len(iv) else None
        R["melody_mean_interval"] = float(iv.mean()) if len(iv) else None
    # ---- 構造: 拍同期のクロマ + MFCC の自己相似 → 反復度
    chroma = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=hop)
    mfcc = librosa.feature.mfcc(y=y, sr=SR, n_mfcc=13, hop_length=hop)
    if len(beats) > 16:
        cs = librosa.util.sync(chroma, beats, aggregate=np.median)
        ms = librosa.util.sync(mfcc, beats)
        feat = np.vstack([librosa.util.normalize(cs, axis=0), librosa.util.normalize(ms, axis=0)])
        rec = librosa.segment.recurrence_matrix(feat, width=4, mode="affinity", sym=True)
        # 反復度: 各拍が「どこか別の場所（4 拍以上離れた）」と強く似ている割合
        R["repetition"] = float((rec.max(axis=0) > 0.5).mean())
        k = int(np.clip(dur // 25, 4, 12))
        bounds = librosa.segment.agglomerative(feat, k)
        R["sections"] = [round(float(t), 1) for t in librosa.frames_to_time(beats[np.clip(bounds, 0, len(beats) - 1)], sr=SR, hop_length=hop)]
    else:
        rec, R["repetition"], R["sections"] = None, None, []

    return R, dict(y=y, rms_db=rms_db, S=S, cent=cent, chroma=chroma, oenv=oenv, bt=bt, rec=rec, f0=f0, diss=diss, hop=hop)


def plot(R, D, out_png):
    y, hop = D["y"], D["hop"]
    fig = plt.figure(figsize=(16, 13))
    gs = fig.add_gridspec(5, 2, width_ratios=[3, 1.2], height_ratios=[1, 2.2, 1, 1, 1], hspace=0.45, wspace=0.15)
    t = librosa.frames_to_time(np.arange(len(D["rms_db"])), sr=SR, hop_length=hop)

    ax = fig.add_subplot(gs[0, 0])
    ax.plot(t, D["rms_db"], lw=0.6, color="k"); ax.set_ylabel("RMS dB"); ax.set_xlim(0, t[-1])
    for s in R.get("sections", []): ax.axvline(s, color="tab:red", lw=0.8, alpha=0.6)
    ax.set_title(f"{R['file']}  |  {R['duration']:.0f}s  LUFS {R['lufs']:.1f}  LRA {R['lra']:.1f}  tempo {R['tempo']:.0f}  key {R['key']} {R['scale']} ({R['key_strength']:.2f})", fontsize=10, loc="left")

    ax = fig.add_subplot(gs[1, 0])
    M = librosa.feature.melspectrogram(S=D["S"] ** 2, sr=SR, n_mels=128)
    librosa.display.specshow(librosa.power_to_db(M, ref=np.max), sr=SR, hop_length=hop, x_axis="time", y_axis="mel", ax=ax, cmap="magma")
    f0 = D["f0"]; tf = np.arange(len(f0)) * 256 / 44100
    ax.plot(tf, np.where(f0 > 0, f0, np.nan), color="cyan", lw=0.6, label="melody f0")
    ax.plot(t, D["cent"], color="white", lw=0.5, alpha=0.7, label="centroid")
    ax.legend(loc="upper right", fontsize=7); ax.set_title("mel spectrogram + 主旋律 f0（水色）+ 重心（白）", fontsize=9, loc="left")

    ax = fig.add_subplot(gs[2, 0])
    librosa.display.specshow(D["chroma"], sr=SR, hop_length=hop, x_axis="time", y_axis="chroma", ax=ax, cmap="Blues")
    ax.set_title("chroma（和声の色）", fontsize=9, loc="left")

    ax = fig.add_subplot(gs[3, 0])
    ax.plot(t, D["oenv"] / (D["oenv"].max() + 1e-9), lw=0.4, color="tab:blue")
    ax.vlines(D["bt"], 0, 1, color="tab:orange", lw=0.3, alpha=0.6); ax.set_xlim(0, t[-1])
    ax.set_title(f"onset 強度 + 拍（橙）  onset {R['onset_rate']:.1f}/s  beatCV {R['beat_cv'] or 0:.3f}  percussive {R['percussive_ratio']:.2f}", fontsize=9, loc="left")

    ax = fig.add_subplot(gs[4, 0])
    td = np.arange(len(D["diss"])) * 2048 / 44100
    ax.plot(td, D["diss"], lw=0.5, color="tab:purple"); ax.set_xlim(0, t[-1])
    ax.set_title(f"感覚的不協和（Sethares）  mean {R['dissonance_mean'] or 0:.3f}   chords/min {R['chord_changes_per_min']:.1f}  vocab {R['chord_vocab']}", fontsize=9, loc="left")
    ax.set_xlabel("time [s]")

    ax = fig.add_subplot(gs[0:2, 1])
    if D["rec"] is not None:
        ax.imshow(D["rec"], cmap="gray_r", origin="lower", aspect="auto")
        ax.set_title(f"自己相似（拍単位）  反復度 {R['repetition']:.2f}", fontsize=9, loc="left")
    ax.set_xticks([]); ax.set_yticks([])

    ax = fig.add_subplot(gs[2:, 1]); ax.axis("off")
    keys = ["centroid_median", "centroid_iqr", "balance_db", "continuity", "flatness", "stereo_width",
            "melody_voiced_ratio", "melody_median_midi", "melody_range_semitones", "melody_notes_per_min",
            "melody_step_ratio", "melody_leap_ratio", "melody_mean_interval", "chord_sequence_head"]
    lines = []
    for k in keys:
        v = R.get(k)
        if isinstance(v, float): v = f"{v:.3f}"
        if isinstance(v, list): v = " ".join(v[:10])
        lines.append(f"{k}: {v}")
    ax.text(0, 1, "\n".join(lines), va="top", fontsize=8.5, family="monospace", wrap=True)
    fig.savefig(out_png, dpi=80, bbox_inches="tight")
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("target")
    ap.add_argument("--out", default="corpus/reports")
    a = ap.parse_args()
    tgt = Path(a.target)
    files = sorted(p for p in (tgt.rglob("*") if tgt.is_dir() else [tgt]) if p.suffix.lower() in EXT)
    os.makedirs(a.out, exist_ok=True)
    for f in files:
        name = f"{f.parent.name}__{f.stem}"
        js = Path(a.out) / f"{name}.json"
        if js.exists():
            continue
        try:
            R, D = analyze(f)
        except Exception as e:
            print("FAIL", f, e, file=sys.stderr); continue
        R["playlist"] = f.parent.name
        plot(R, D, Path(a.out) / f"{name}.png")
        js.write_text(json.dumps(R, ensure_ascii=False, indent=1))
        print("ok", name, f"tempo={R['tempo']:.0f} key={R['key']}{R['scale'][0]} rep={R['repetition']} melody_range={R.get('melody_range_semitones')}")


if __name__ == "__main__":
    main()
