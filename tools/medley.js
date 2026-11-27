// テーマのメドレー: 主題（旋律 + 和音）を、場所・気持ち・マナーを変えながら次々に奏でる。
//   node tools/medley.js [--out listen/medley/medley.wav]
// 主題は著作権の切れた旋律と、オリジナルの主題だけを使う。
import { Music } from '../core/api.js';
import { loadSamplesNode } from './node_samples.js';
import { writeWav } from './lib.js';
import { THEMES as BUILTIN } from '../core/themes.js';
loadSamplesNode();

const THEMES = {
  ウェストミンスターの鐘: { melody: '3 2 1 5, | 1 3 2 5, | 1 2 3 1 | 3 1 2 5,', chords: 'I V I V' },        // 1793 年ごろ。学校のチャイム
  きらきら星: { melody: '1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 -', chords: 'I IV V I' },                          // フランス民謡
  歓喜の歌: { melody: '3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 3 - 2 2', chords: 'I V I V' },                            // ベートーヴェン 1824
  さくらさくら: { melody: '3 3 4 - | 3 3 4 - | 3 4 5 4 | 3 4 3 2 | 1 5, 1 2 | 1 1 5, 4, | 3 4 5 4 | 3 4 3 2', chords: 'i' }, // 日本古謡（都節の度数）
  冒険の序曲: { melody: "5, 1 - 1 | 2 3 4 5 | 6 - 5 - | 3 - - - | 4 4 3 2 | 3 1 5, - | 4 3 2 3 | 1 - - -", chords: 'I IV I V IV I V I' }, // オリジナル
};
// 区間: [主題, 情景・気持ち, マナー, 秒]
const PLAN = [
  ['ウェストミンスターの鐘', '街・楽しい', null, 26],
  ['ウェストミンスターの鐘', '深海', null, 30],
  ['きらきら星', '星空・優しさ', null, 30],
  ['きらきら星', 'ポップ・はしゃぐ', null, 24],
  ['歓喜の歌', '戦場・勇気', null, 26],
  ['歓喜の歌', '聖堂・荘厳', 'バロック', 30],
  ['さくらさくら', '夜・静寂', '和', 34],
  ['さくらさくら', '祭り・わくわく', '和', 26],
  ['冒険の序曲', '草原・勝利', 'ケルト', 26],
  ['冒険の序曲', '洞窟・恐怖', null, 26],
  ['冒険の序曲', '城・勝利', null, 30],
];
const a0 = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => { const [k, ...v] = s.trim().split(' '); return [k, v.join(' ')]; }));
const a = a0;
// --themes 名前,名前,... なら、組み込みの主題を、それぞれ似合う場面・様式で 20 秒ずつ
if (a.themes) {
  PLAN.length = 0;
  for (const nm of a.themes.split(',')) { const t = BUILTIN[nm]; if (!t) throw new Error('no theme ' + nm); THEMES[nm] = t; PLAN.push([nm, t.scene, t.manner || null, +(a.sec || 20)]); }
}
const sr = 48000, total = PLAN.reduce((s, p) => s + p[3], 0) + 4;
const music = new Music({ sampleRate: sr, seed: 11, scene: PLAN[0][1] });
const n = Math.round(total * sr), L = new Float32Array(n), R = new Float32Array(n);
const log = []; let t = 0, k = 0, next = 0;
music.on('section', (e) => log.push(`  ${e.time.toFixed(1)}s ${e.role} ${e.gait} ${Math.round(e.bpm)}BPM ${e.prog}`));
for (let i = 0; i < n; i += 4800) {
  t = i / sr;
  if (k < PLAN.length && t >= next) {
    const [theme, scene, manner, sec] = PLAN[k++];
    music.style({ theme: THEMES[theme] });
    music.situation({ scene, intensity: 0.7, transition: 'now' });
    music.mix('main', undefined, { manner: manner || null });
    music.cue('theme', { section: '熱' }); // すぐにサビ（主題）へ
    log.push(`${t.toFixed(1)}s ▶ ${theme} × ${scene}${manner ? ' × ' + manner : ''}`);
    next = t + sec;
  }
  music.render(L, R, i, Math.min(4800, n - i));
}
// 最後は 4 秒で消える
for (let i = Math.max(0, n - 4 * sr); i < n; i++) { const g = (n - i) / (4 * sr); L[i] *= g; R[i] *= g; }
writeWav(a.out || 'listen/medley/medley_raw.wav', L, R, sr);
console.log(log.join('\n'));
