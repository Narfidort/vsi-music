// 組み込みのスタイルマナー（例）。各国・様式の「らしさ」を、音階・楽器・歩容・旋律の軸の偏りとして書く。
// いずれも近似であり、地域・流派・時代で大きく異なる。ゲームや作品はこれを出発点に自分のマナーを書く（docs/08_api.md）。
export const MANNERS = {
  和: { scale: '都節', prefer: { instruments: { dan_tranh: 40, flute: 6, recorder: 4 }, gaits: { 漂う: 2, 揺れる: 1.5 } }, melody: { density: 0.3, leap: 0.35, syncopation: 0.05 } },
  民謡: { scale: '陽音階', prefer: { instruments: { dan_tranh: 30, flute: 6, strumstick: 6 } }, melody: { density: 0.45, leap: 0.3 } },
  琉球: { scale: '琉球', prefer: { instruments: { strumstick: 30, dan_tranh: 10, flute: 4 } }, melody: { density: 0.45, syncopation: 0.15 } },
  中華: { scale: '五声', prefer: { instruments: { dan_tranh: 40, flute: 8 } }, melody: { density: 0.4, leap: 0.3, contour: 0.1 } },
  アラブ: { scale: 'ヒジャーズ', prefer: { instruments: { dan_tranh: 10, sax: 6, flute: 4 } }, melody: { density: 0.5, leap: 0.15, repetition: 0.15 } },
  マカーム: { scale: 'ラースト', prefer: { instruments: { dan_tranh: 10, flute: 6 } }, melody: { density: 0.5, leap: 0.15 } },
  インド: { scale: 'バイラヴ', prefer: { instruments: { dan_tranh: 10, flute: 6, organ: 4 }, gaits: { 漂う: 2 } }, melody: { density: 0.45, leap: 0.2 } },
  ガムラン: { scale: 'ペロッグ', prefer: { instruments: { vibraphone: 20, balafon: 20, glock: 6, tubular_bells: 10 } }, melody: { density: 0.55, repetition: 0.3 } },
  アフリカ: { scale: '短五音', prefer: { instruments: { kalimba: 40, mbira: 30, balafon: 20 }, gaits: { 歩く: 2, スキップ: 1.5 } }, melody: { density: 0.6, syncopation: 0.35, repetition: 0.25 } },
  ケルト: { scale: 'ドリア', prefer: { instruments: { folk_harp: 30, recorder: 20, flute: 6 } }, melody: { density: 0.6, leap: 0.3 } },
  バロック: { prefer: { instruments: { harpsichord: 40, recorder: 10, organ: 6 }, progressions: { 'カノン': 3, '悲愴 i-iv-V7-i': 2 } }, melody: { density: 0.6 } },
  聖堂: { prefer: { instruments: { organ: 40, glass: 6 } }, tempo: { scale: 0.85 }, melody: { density: 0.25, leap: 0.15 } },
  ジャズ: { scale: 'ブルース', prefer: { instruments: { sax: 30, vibraphone: 20 } }, melody: { syncopation: 0.4, density: 0.5 } },
  夢: { scale: '全音音階', prefer: { instruments: { vibraphone: 20, glass: 10, ocarina: 8 }, gaits: { 漂う: 3 } }, melody: { density: 0.25 } },
};
