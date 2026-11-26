#!/bin/zsh
# ブラウザ用の録音サンプル: assets/samples/*.wav → assets/web/*.flac（可逆圧縮。AAC/MP3 は先頭に無音の遅延が入り発音がずれるので使わない）
cd "$(dirname "$0")/.."
mkdir -p assets/web
find assets/samples -name '*.wav' | while read -r f; do
  o="assets/web/${f#assets/samples/}"; o="${o%.wav}.flac"
  [ -f "$o" ] && continue
  mkdir -p "$(dirname "$o")"
  ffmpeg -loglevel error -y -i "$f" -ac 1 -ar 48000 -sample_fmt s16 "$o"
done
python3 - <<'PY'
import json
c = json.load(open('assets/samples/catalog.json'))
def fix(p): return p.replace('assets/samples/', 'assets/web/').replace('.wav', '.flac')
for x in c['instruments'].values():
    for n in x['notes']: n['file'] = fix(n['file'])
for lst in c['perc'].values():
    for n in lst: n['file'] = fix(n['file'])
json.dump(c, open('assets/web/catalog.json', 'w'), ensure_ascii=False)
PY
du -sh assets/web
