#!/bin/zsh
# カーネルの各プリセットを書き出し、musiclens で実在の曲と同じ物差しで測る。
#   tools/eval_kernel.sh v03   → corpus/KERNEL_v03/*.wav → corpus/reports → corpus/compare.md
cd "$(dirname "$0")/.."
tag=${1:-dev}; sec=${2:-90}
rm -rf "corpus/KERNEL_$tag" corpus/reports/KERNEL_${tag}__*
mkdir -p "corpus/KERNEL_$tag"
for p in 深海 星空 焚き火 怒り 悲しみ 優しさ; do node tools/render.js --preset $p --sec $sec --out "corpus/KERNEL_$tag/$p.wav" > /dev/null; done
.venv/bin/python tools/musiclens.py "corpus/KERNEL_$tag" 2>/dev/null | grep -E "^ok|FAIL"
.venv/bin/python tools/corpus_compare.py > /dev/null 2>&1
grep -E "^\| (特徴量|centroid_median|balance_db|percussive|chord_vocab|lra|stereo|melody_(median|step|leap|mean)|tempo|continuity|dissonance)" corpus/compare.md
