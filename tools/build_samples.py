#!/usr/bin/env python3
"""VSCO-2 CE（CC0）の録音から、カーネル用のサンプル集と楽器カタログを作る。
    .venv/bin/python tools/build_samples.py
出力: assets/samples/<楽器>/<n>.wav（48 kHz モノラル 16 bit、頭の無音を除去、最長 8 秒）と assets/samples/catalog.json
音高はファイル名を信じず、pYIN で実測する（VSCO はオクターブの表記が楽器によってずれている）。
楽器ごとの物理的な記述子も実測する（楽器の選択を対応表ではなく測定で行うため。docs/06_review.md §7）:
  size   … 音域の中央（MIDI）
  bright … スペクトル重心 / f0（何倍音あたりにエネルギーがあるか）の中央値
  attack … 最大振幅に達するまでの時間 [s]（角の逆）
  decay  … 最大から −30 dB までの時間 [s]（撃って鳴らしっぱなし ↔ 持続）
"""
import json, re, glob, os, sys
from pathlib import Path
import numpy as np, librosa, soundfile as sf

V = "assets/vsco"
V2 = "assets/vcsl"  # Versilian Community Sample Library（CC0）。各国の楽器
OUT = Path("assets/samples")
SR = 48000
# 名前: (グロブ, 相互作用, 奏法)
INST = {
    "piano":      ("Keys/Upright Piano/Player_dyn*_rr1_*.wav", "struck", "ring"),
    "glock":      ("Percussion/Glock/*.wav", "struck", "ring"),
    "xylo":       ("Percussion/Xylo/*.wav", "struck", "ring"),
    "marimba":    ("Percussion/Marimba/*.wav", "struck", "ring"),
    "timpani":    ("Percussion/Timpani/Timpani*_Hit_*.wav", "struck", "ring"),
    "harp":       ("Strings/Harp/*.wav", "plucked", "ring"),
    "vln_pizz":   ("Strings/Violin Section/Pizz/*rr1.wav", "plucked", "short"),
    "vc_pizz":    ("Strings/Cello Section/pizzT/*RR1.wav", "plucked", "short"),
    "vln_sus":    ("Strings/Violin Section/susVib/*.wav", "bowed", "sus"),
    "vla_sus":    ("Strings/Viola Section/susvib/*.wav", "bowed", "sus"),
    "vc_sus":     ("Strings/Cello Section/susvib/*.wav", "bowed", "sus"),
    "cb_sus":     ("Strings/Solo Contrabass/SusVib/*rr1.wav", "bowed", "sus"),
    "solo_vln":   ("Strings/Solo Violin/Arco Vib/*.wav", "bowed", "sus"),
    "vln_spic":   ("Strings/Violin Section/Spic/*rr1.wav", "bowed", "short"),
    "vc_spic":    ("Strings/Cello Section/spic/*.wav", "bowed", "short"),
    "vln_trem":   ("Strings/Violin Section/Trem/*.wav", "bowed", "trem"),
    "vc_trem":    ("Strings/Cello Section/trem/*.wav", "bowed", "trem"),
    "flute":      ("Woodwinds/Flute/susvib/*.wav", "blown", "sus"),
    "clarinet":   ("Woodwinds/Clarinet/susLong/*.wav", "blown", "sus"),
    "oboe":       ("Woodwinds/Oboe/Vib/*.wav", "blown", "sus"),
    "bassoon":    ("Woodwinds/Bassoon/sus/*.wav", "blown", "sus"),
    "horn":       ("Brass/F Horn/sus/*.wav", "blown", "sus"),
    "flute_stac": ("Woodwinds/Flute/stac/*rr1.wav", "blown", "short"),
    "clar_stac":  ("Woodwinds/Clarinet/stac/*rr1*.wav", "blown", "short"),
    # ---- VCSL（各国の楽器）。パスが assets/vcsl から始まるものは V2 ----
    "dan_tranh":   ("@Chordophones/Zithers/Dan Tranh/Normal/*_mf_1.wav", "plucked", "ring"),
    "kalimba":     ("@Idiophones/Plucked Idiophones/Kalimba, Kenya/*rr2.wav", "plucked", "ring"),
    "mbira":       ("@Idiophones/Plucked Idiophones/Mbira dzaVadzimu Nyamaropa, Zimbabwe, Low B/*rr1.wav", "plucked", "ring"),
    "balafon":     ("@Idiophones/Struck Idiophones/Balafon/Traditional Mallet/*rr1*.wav", "struck", "ring"),
    "ocarina":     ("@Aerophones/Edge-blown Aerophones/Ocarina, Typical/Sustains/Sus/*.wav", "blown", "sus"),
    "recorder":    ("@Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Sustain/*.wav", "blown", "sus"),
    "harpsichord": ("@Chordophones/Zithers/Harpsichord, Flemish/Sustains/High/*.wav", "plucked", "ring"),
    "folk_harp":   ("@Chordophones/Composite Chordophones/Folk Harp/*_v2_RR1.wav", "plucked", "ring"),
    "strumstick":  ("@Chordophones/Composite Chordophones/Strumstick/Finger/*_vl2_rr1.wav", "plucked", "ring"),
    "vibraphone":  ("@Idiophones/Struck Idiophones/Vibraphone/Soft Mallets/*.wav", "struck", "ring"),
    "tubular_bells": ("@Idiophones/Struck Idiophones/Tubular Bells 1/*_f_rr1.wav", "struck", "ring"),
    "organ":       ("@Aerophones/Edge-blown Aerophones/Pipe Organ/Quiet/*.wav", "blown", "sus"),
    "glass":       ("@Idiophones/Friction Idiophones/Wine Glasses/Sustains/Slow/*.wav", "bowed", "sus"),
    "sax":         ("@Aerophones/Reed Aerophones/Tenor Saxophone/Vibrato/*.wav", "blown", "sus"),
}
# 音高のない打楽器（効果音・リズム）。ファイル名の正規表現 → 名前
PERC = {
    "triangle": r"Triangle3-Hit_v\d_rr1", "sleigh": r"Sleighbells_Hit", "claves": r"Claves1_Hit_v2", "cowbell": r"Cowbell1_Hit_v2",
    "tamb": r"Tamb1-Hit_v2", "belltree": r"BellTree_Stroke[12]", "vibraring": r"vibraring", "woodblock_hi": r"LogDrumHi_MedM_v2",
    "woodblock_lo": r"LogDrumLo_MedM_v2", "conga": r"Conga-HitN_v2", "bdrum": r"BDrumNewhit_v5", "snare": r"Snare2-HitSN_v5",
    "crash": r"cymbal-crash1_mf_rr1", "guiro": r"Guiro-Hit_v1", "ratchet": r"Ratchet1-Fast", "zap": r"zap\d",
}
PERC2 = {  # VCSL: (フォルダ, 正規表現)
    "frame_drum": ("Membranophones/Struck Membranophones/Frame Drum", r"HitMuted_v2"), "darbuka": ("Membranophones/Struck Membranophones/Darbuka", r"hit_vl2"),
    "handbell": ("Idiophones/Struck Idiophones/Hand Bells, Nepalese", r"HB_[1-4]"),
}

def vel_of(name):
    m = re.search(r"dyn(\d)", name) or re.search(r"_v(\d)", name)
    if m: return int(m.group(1))
    for i, k in enumerate(["ppp", "pp", "_p", "mp", "mf", "_f", "ff", "fff"]):
        pass
    for k, v in [("fff", 8), ("ff", 7), ("mf", 5), ("mp", 4), ("pp", 2), ("_f", 6), ("_p", 3), ("loud", 6), ("medium", 4)]:
        if k in name: return v
    return 4

def load(path, maxlen=8.0):
    y, sr = librosa.load(path, sr=SR, mono=True)
    if len(y) == 0: return None
    peak = np.max(np.abs(y)) + 1e-9
    i0 = int(np.argmax(np.abs(y) > peak * 0.02))
    i0 = max(0, i0 - int(0.002 * SR))
    y = y[i0: i0 + int(maxlen * SR)].copy()
    f = min(len(y), int(0.05 * SR)); y[-f:] *= np.linspace(1, 0, f)
    return y

def measure(y, pitched=True):
    d = {}
    if pitched:
        seg = y[int(0.05 * SR): int(0.9 * SR)]
        f0, vf, _ = librosa.pyin(librosa.resample(seg, orig_sr=SR, target_sr=22050), fmin=25, fmax=4200, sr=22050, frame_length=2048)
        f0 = f0[vf] if vf.any() else f0[~np.isnan(f0)]
        d["f0"] = float(np.median(f0)) if len(f0) else None
    env = librosa.feature.rms(y=y, frame_length=1024, hop_length=256)[0]
    k = int(np.argmax(env)); d["attack"] = k * 256 / SR
    below = np.where(env[k:] < env[k] * 0.0316)[0]
    d["decay"] = float((below[0] if len(below) else len(env) - k) * 256 / SR)
    S = np.abs(librosa.stft(y[: int(1.0 * SR)], n_fft=4096)); fr = librosa.fft_frequencies(sr=SR, n_fft=4096)
    d["centroid"] = float(np.median((fr[:, None] * S).sum(0) / (S.sum(0) + 1e-9)))
    d["peak"] = float(np.max(np.abs(y)))
    return d

def save(y, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), y / (np.max(np.abs(y)) + 1e-9) * 0.9, SR, subtype="PCM_16")

prev = OUT / 'catalog.json'
cat = json.load(open(prev)) if prev.exists() else {"instruments": {}, "perc": {}}  # 既存のカタログに足していく
only = sys.argv[1:]
for name, (g, inter, art) in INST.items():
    if only and name not in only: continue
    files = sorted(glob.glob(os.path.join(V2, g[1:]) if g.startswith('@') else os.path.join(V, g)))
    notes = []
    for i, f in enumerate(files):
        y = load(f)
        if y is None: continue
        m = measure(y)
        if not m["f0"]: continue
        midi = float(librosa.hz_to_midi(m["f0"]))
        out = OUT / name / f"{i:03d}.wav"; save(y, out)
        notes.append({"midi": round(midi, 2), "vel": vel_of(Path(f).stem), "file": str(out), "len": len(y) / SR, **{k: m[k] for k in ("attack", "decay", "centroid", "peak")}})
    if not notes: print("none", name); continue
    vels = sorted({n["vel"] for n in notes})
    for n in notes: n["vel"] = (vels.index(n["vel"]) + 1) / len(vels)
    mids = [n["midi"] for n in notes]
    loud = [n for n in notes if n["vel"] == 1.0] or notes
    desc = {
        "size": float(np.median(mids)), "lo": float(min(mids)), "hi": float(max(mids)),
        "bright": float(np.median([n["centroid"] / librosa.midi_to_hz(n["midi"]) for n in loud])),
        "attack": float(np.median([n["attack"] for n in loud])), "decay": float(np.median([n["decay"] for n in loud])),
    }
    cat["instruments"][name] = {"interaction": inter, "artic": art, "desc": desc, "notes": notes}
    print(f"{name:11s} n={len(notes):3d} midi {desc['lo']:.0f}-{desc['hi']:.0f} bright {desc['bright']:.1f} attack {desc['attack']*1000:.0f}ms decay {desc['decay']:.2f}s")

if not only or 'perc2' in only:
    for name, (d, rx) in PERC2.items():
        fs = [f for f in sorted(glob.glob(os.path.join(V2, d, '*.wav'))) if re.search(rx, Path(f).stem)][:4]
        lst = []
        for i, f in enumerate(fs):
            y = load(f, 4.0); m = measure(y, pitched=False); out = OUT / 'perc' / f'{name}_{i}.wav'; save(y, out)
            lst.append({'file': str(out), 'len': len(y) / SR, **m})
        if lst: cat['perc'][name] = lst; print('perc', name, len(lst))
if not only:
    for name, rx in PERC.items():
        fs = [f for f in sorted(glob.glob(os.path.join(V, "Percussion/*.wav"))) if re.search(rx, Path(f).stem)][:4]
        lst = []
        for i, f in enumerate(fs):
            y = load(f, 4.0); m = measure(y, pitched=False)
            out = OUT / "perc" / f"{name}_{i}.wav"; save(y, out)
            lst.append({"file": str(out), "len": len(y) / SR, **m})
        if lst: cat["perc"][name] = lst; print("perc", name, len(lst), f"centroid {lst[0]['centroid']:.0f}")
json.dump(cat, open(OUT / 'catalog.json', 'w'), ensure_ascii=False, indent=0)
