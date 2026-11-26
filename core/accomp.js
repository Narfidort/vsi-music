// 伴奏型と打楽器の型（歩容ごと、1 小節ぶん）。docs/06_review.md §4.2
// 伴奏型は身体の運動の音による擬態が慣習化したもの: 揺れる = 揺りかご、叩きつける = 疾走する馬（魔王）、跳ねる = ダンス。
// 強度 I（楽式が決める）で層の数が増える（§4.4.1 軌道）。
// 戻り値: { notes: [{ step, dur, role, semi, vel }], drums: [{ step, type, vel, semi? }] }

import { degSemi } from './melody.js';

export function accompany(gait, c) {
  const { V, bass, S, sub, I, rng, newChord, hr, scale, barInPhrase } = c;
  const notes = [], drums = [];
  const n = (step, dur, role, semi, vel) => notes.push({ step, dur, role, semi, vel });
  const top = V[V.length - 1];
  switch (gait) {
    case '漂う': {
      if (newChord) { for (const v of V) n(0, S * hr, 'pad', v, 0.5); n(0, S * hr, 'bass', bass, 0.6); }
      // 疎な分散和音（C418 的なピアノの点）
      for (let k = 0; k < S / sub; k++) if (rng() < (0.12 + 0.45 * c.density) * I) n(k * sub + (rng() < 0.3 ? 1 : 0), 3 * sub, 'arp', V[Math.floor(rng() * V.length)] + 12, 0.45);
      break;
    }
    case '揺れる': {
      // 6/8: 低音 + 分散和音の揺れ（ブラームスの子守歌、舟歌）
      n(0, S, 'bass', bass, 0.7);
      const seq = [V[0], V[1], V[2] ?? V[1], V[1], V[0] + 12];
      for (let k = 1; k < 6; k++) if (I >= 0.5 || k % 2 === 0) n(k, 4, 'arp', seq[k - 1], 0.32 + 0.06 * (k === 3));
      if (I >= 0.8 && newChord) for (const v of V) n(0, S, 'pad', v, 0.25);
      break;
    }
    case '嘆く': {
      for (const v of V) n(0, S, 'pad', v, 0.4);
      n(0, S, 'bass', bass, 0.7);
      for (const st of [2, 4, 6]) if (rng() < 0.3 + 0.5 * I) n(st, 2 * sub, 'arp', V[Math.floor(rng() * V.length)] + 12, 0.3);
      break;
    }
    case '泣く': {
      // ピアノの 8 分の分散和音（上って下りる波）+ 強度が上がると弦の和音が膨らむ
      const wave = [bass, bass + 7, V[0] + 12, V[1] + 12, (V[2] ?? V[1]) + 12, V[1] + 12, V[0] + 12, bass + 7];
      wave.forEach((s, k) => n(k, 3, k === 0 ? 'bass' : 'arp', s, k === 0 ? 0.6 : 0.3));
      if (I >= 0.7 && newChord) for (const v of V) n(0, S, 'pad', v, 0.3 + 0.3 * (I - 0.7));
      if (I >= 0.9) n(0, S, 'bass', bass - 12, 0.4);
      break;
    }
    case '震える': {
      // 弦のトレモロの持続和音 + 低音の心臓の鼓動（ドクン = 0 と 3）+ 半音でぶつかる高音
      if (newChord) { for (const v of V) n(0, S * hr, 'trem', v, 0.45); n(0, S * hr, 'trem', bass, 0.5); }
      const beatVel = 0.4 + 0.5 * I;
      for (const st of [0, 3, 8, 11]) if (I >= 0.5 || st < 8) drums.push({ step: st, type: 'timp', vel: st % 8 === 0 ? beatVel : beatVel * 0.7, semi: bass });
      if (rng() < 0.3 + 0.5 * I) n(4 + Math.floor(rng() * 10), 2, 'arp', top + 13, 0.35);
      if (I >= 0.85) for (let st = 0; st < S; st += 2) n(st, 1, 'chord', bass + 12 + (st % 4 ? 1 : 0), 0.4); // 半音の往復のオスティナート
      break;
    }
    case '行進': {
      // ズン・チャ（低音 = 1・3 拍、和音 = 2・4 拍）+ ホルンの持続 + 小太鼓・ティンパニ
      for (const st of [0, 8]) n(st, 4, 'bass', st ? bass + 7 - 12 : bass, 0.85);
      for (const st of [4, 12]) for (const v of V) n(st, 3, 'chord', v, 0.45);
      if (I >= 0.6 && newChord) for (const v of V) n(0, S, 'pad', v, 0.3);
      if (I >= 0.5) drums.push({ step: 0, type: 'timp', vel: 0.8, semi: bass });
      if (I >= 0.7) for (const st of [4, 12, 14, 15]) drums.push({ step: st, type: 'snare', vel: st === 15 ? 0.25 : 0.45 });
      if (I >= 0.9) drums.push({ step: 8, type: 'timp', vel: 0.6, semi: bass + 7 });
      break;
    }
    case 'スキップ': {
      // 6/8 の弾み: 軽い低音（1 拍目）、短く切った和音（各拍の後ろ）、鉄琴のきらめき
      n(0, 2, 'bass', bass, 0.6); n(3, 2, 'bass', bass + 7 > bass + 12 - 5 ? bass + 7 - 12 : bass + 7, 0.45);
      for (const st of [2, 5]) for (const v of V) n(st, 1, 'chord', v, 0.3);
      if (I >= 0.6) for (const st of [1, 4]) n(st, 1, 'arp', V[(st + barInPhrase) % V.length] + 24, 0.25);
      if (I >= 0.85) for (const st of [0, 3]) drums.push({ step: st, type: 'hat', vel: 0.08 });
      break;
    }
    case '歩く': {
      // フィンガーピッキング: 親指が低音（拍）、他の指が和音（裏）
      const fifth = bass + 7 > bass + 12 - 5 ? bass + 7 - 12 : bass + 7;
      n(0, 4, 'bass', bass, 0.75); n(4, 4, 'bass', I >= 0.7 ? fifth : bass, 0.65);
      n(2, 2, 'arp', V[0], 0.35); n(6, 2, 'arp', V[0], 0.35);
      [[1, V[2] ?? V[1]], [3, V[1]], [5, V[2] ?? V[1]], [7, V[1]]].forEach(([st, s]) => { if (I >= 0.55 || st % 4 === 1) n(st, 2, 'arp', s, 0.3); });
      if (I >= 0.85) drums.push(...[0, 2, 4, 6].map((st) => ({ step: st, type: 'hat', vel: 0.12 })));
      break;
    }
    case '叩きつける': {
      // 右手: 和音（オクターブ）の 3 連符の連打（魔王）。1 拍目にアクセント
      const rh = I >= 0.7 ? [top, top - 12, V[1]] : [top, top - 12];
      for (let st = 0; st < S; st++) for (const s of rh) n(st, 1, 'chord', s, st === 0 ? 1 : st % sub === 0 ? 0.72 : 0.5);
      // 左手: 偶数小節 = 低音のオクターブ（スフォルツァンド）、奇数小節 = 駆け上がる音階（魔王の左手）
      if (barInPhrase % 2 === 0 || I < 0.7) { n(0, 6, 'bass', bass, 1); n(0, 6, 'bass', bass - 12, 0.9); }
      else {
        const s0 = Math.round(bass / 12 * 7);
        for (let k = 0; k < 6; k++) n(k, 1, 'bass', degSemi(s0 + k, scale) + (bass - degSemi(s0, scale)), 0.75 + 0.04 * k);
        n(6, 6, 'bass', bass + 7 - 12 < bass - 5 ? bass + 7 : bass + 7 - 12, 0.95);
      }
      if (I >= 0.6) drums.push({ step: 0, type: 'timp', vel: 0.9, semi: bass });
      if (I >= 0.9) drums.push({ step: 6, type: 'timp', vel: 0.6, semi: bass + 7 });
      break;
    }
    case '跳ねる': {
      // Yunomi の分析（docs/06_review.md §7）: ベースが全体の 3〜6 割、キックは 4 つ打ちより詰まる、裏拍、オクターブの跳躍と滑り
      [[0, 0, 0], [2, 12, 1], [3, 0, 0], [6, 12, 1], [8, 0, 0], [10, 12, 1], [11, 0, 0], [14, 12, 1]].forEach(([st, oct, glide], k) => {
        if (I >= 0.85 || k % 2 === 1 || st === 0) notes.push({ step: st, dur: 2, role: 'bass', semi: bass + oct, vel: 0.85, glide });
      });
      if (newChord) for (const v of V) n(0, S, 'pad', v, 0.3);
      if (I >= 0.6) for (const st of [0, 3, 6, 10, 12]) for (const v of [...V, V[0] + 12]) n(st, 2, 'stab', v, 0.4);
      if (I >= 0.8) for (let st = 0; st < S; st += 2) n(st, 2, 'arp', V[(st / 2) % V.length] + 24, 0.28);
      const kicks = I >= 0.85 ? [0, 3, 6, 8, 11, 14] : I >= 0.5 ? [0, 4, 8, 12] : [];
      for (const st of kicks) drums.push({ step: st, type: 'kick', vel: st % 4 === 0 ? 1 : 0.8 });
      if (I >= 0.6) for (const st of [4, 12]) drums.push({ step: st, type: 'clap', vel: 0.75 });
      if (I >= 0.6) for (const st of [2, 6, 10, 14]) drums.push({ step: st, type: 'ohat', vel: 0.22 });
      if (I >= 0.7) for (let st = 1; st < S; st += 2) drums.push({ step: st, type: 'hat', vel: 0.14 + 0.06 * (st % 4 === 3) });
      if ((barInPhrase === 3 || barInPhrase === 7) && I >= 0.6) for (const st of [12, 13, 14, 15]) drums.push({ step: st, type: 'snare', vel: 0.3 + 0.12 * (st - 12) });
      break;
    }
  }
  return { notes, drums };
}

// 和音の配置: 中心の周りの密集配置で、前の和音から最も動きの少ない転回形（声部進行）
export function voiceChord(pcs, center, prev) {
  let best = null, bd = Infinity;
  for (let r = 0; r < pcs.length; r++) {
    const rot = pcs.slice(r).concat(pcs.slice(0, r));
    const v = []; let x = center - 6;
    for (const pc of rot) { let s = x + ((((pc - x) % 12) + 12) % 12); v.push(s); x = s + 1; }
    const d = prev ? v.reduce((a, s, i) => a + Math.abs(s - (prev[i] ?? prev[prev.length - 1])), 0) : Math.abs(v[0] - (center - 4));
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
