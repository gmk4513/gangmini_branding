/* 비트 목록 — 턴테이블을 돌리면 이 순서대로 넘어간다.

   진짜 비트를 넣을 때 (파일은 이 폴더에):
     { id: "boombap-01", title: "이름", genre: "붐뱁", bpm: 90, file: "beats/boombap-01.mp3", offset: 0.12 }
       bpm      한 박 = 60/bpm 초. 트랩·드릴은 하프타임(실제 BPM 의 절반)으로 적는다 — 마디가 너무 빨리 넘어가지 않게.
                화면에는 shownBpm(실제 체감 BPM)을 보여 준다
       offset   파일에서 첫 박(1마디 1박)이 시작하는 초. 앞에 빈 소리가 있으면 그만큼
       loopBars 파일이 몇 마디짜리 루프인지. 비우면 파일 전체를 반복
       fallback 앞 파일을 못 푸는 브라우저용 같은 소리 파일(WAV — 어디서나 풀리고 루프가 안 어긋난다)
       gain     소리 크기 보정(기본 1)

   아래 synth 비트는 파일이 오기 전까지 쓰는 임시 비트다. 드럼 + 808 이 메인, 멜로디는 어둡고 짧게만.
   한 줄 = 한 마디, 글자 하나 = 16분음표.  x 침 / . 쉼 / o 열린 하이햇 / r 두 번 / t 세 번(셋잇단)
   줄마다 길이가 달라도 된다(킥 2마디, 808 음 4마디 …) — 각자 자기 길이로 돈다.

   그 밖의 옵션
     b808 / slide808  킥마다 808 을 깔고 다음 킥까지 끈다(roots 음) / 음이 바뀌면 미끄러져 들어간다
     dist808          808 찌그러뜨리는 정도(기본 3, 클수록 거칠게)
     swing / swing8   16분 / 8분 뒷박을 늦춰 흔들리게(swing8 = 1/6 이면 셋잇단 느낌)
     rim / shaker / janggu   림 "똑" / 셰이커 16분 / 장구(d 덩, k 쿵, t 덕)
     stab             샘플 잘라 친 듯한 짧은 화음(stabChords)
     crackle          LP 판 잡음
     parts            선율 [시작 박, 길이(박), 음, 앞 음에서 미끄러짐?]
                      inst: 808 · bell(트랩 종소리) · piano · synbass(G펑크 베이스) · lead(G펑크 리드) · pluck(가야금)
     mix              악기 묶음별 볼륨 { kick, snare, hat, bass, keys, melody, janggu, vinyl } */

export const BEATS = [
  /* ---- 진짜 비트 파일 — AI 로 만든 비트(원곡 "Drum Main Sound")에서 가운데 8마디(31.87초~)를 잘라 루프로.
     템포는 8·16·24마디 간격을 재서 91.57 BPM, 끝 30ms 를 시작 바로 앞 소리와 섞어 이음새가 원곡처럼 이어지게 했다 ---- */
  {
    id: "drum-main",
    title: "마루 붐뱁",
    genre: "붐뱁",
    bpm: 91.57,
    shownBpm: 92,
    file: "beats/drum-main.flac",
    fallback: "beats/drum-main.wav",
    offset: 0,
    loopBars: 8,
    gain: 1.6,
  },
  /* ---- 릴스용 — 사용자가 준 프리스타일 영상 비트를 재서 맞춘 비트 (원곡을 베끼지 않고 템포·드럼 자리·808 높이·분위기만).
     100 BPM 스윙 없음, 킥+808 은 1박·2박 16분 뒤·4박 16분 뒤(0·7·13칸), 스네어 2·4박, 하이햇은 아주 작게.
     808 은 원곡처럼 F 와 F# 사이(약 44.6Hz = F1 +35센트)에 맞췄다. 위쪽은 앞 반 마디 G·G#·B / 뒤 반 마디 D#·E 의 어두운 반음 ---- */
  {
    id: "geurimja-boombap",
    title: "도깨비 붐뱁",
    genre: "붐뱁",
    bpm: 100,
    synth: {
      b808: true,
      kick:  ["x......x.....x.."],
      snare: ["....x.......x..."],
      hat:   ["x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.o."],
      roots: [29.35],
      parts: [
        { inst: "piano", bars: 2, gain: 0.9, notes: [
          [0, 0.5, 67], [0.5, 0.5, 68], [1, 1, 71], [2, 0.5, 63], [2.5, 1.5, 64],
          [4, 0.5, 67], [4.5, 0.5, 68], [5, 1, 66], [6, 0.5, 63], [6.5, 1.5, 64],
        ] },
        { inst: "bell", bars: 4, gain: 0.5, notes: [
          [0, 2, 79], [2, 2, 75], [8, 2, 80], [10, 2, 76],
        ] },
      ],
      mix: { kick: 1.3, snare: 1.45, hat: 0.5, bass: 1.05, melody: 0.55 },
    },
  },
  /* ---- 붐뱁 — 무겁게 찍는 킥 + 날카로운 스네어 + 킥 밑에 깔리는 808 ---- */
  {
    id: "hanok-boombap",
    title: "한옥 붐뱁",
    genre: "붐뱁",
    bpm: 92,
    synth: {
      swing: 0.08,
      b808: true,
      kick:  ["x.......x.x.....", "x.x.......x..x..", "x.......x.x.....", "x..x..x...x...x."],
      snare: ["....x.......x...", "....x.......x..x"],
      hat:   ["x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.o."],
      roots: [33, 33, 29, 28],
      stab:  ["x...............", "..........x.....", "x...............", "......x...x....."],
      stabChords: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [52, 56, 59]],
      mix: { kick: 1.3, snare: 1.45, hat: 0.95, bass: 1, keys: 0.5 },
    },
  },
  /* ---- 트랩 — 하프타임으로 적는다(72 = 실제 144). 808 미끄럼, 하이햇 롤 ---- */
  {
    id: "giwa-trap",
    title: "기와 트랩",
    genre: "트랩",
    bpm: 72,
    shownBpm: 144,
    synth: {
      b808: true,
      slide808: true,
      kick:  ["x......x..x.....", "x.....x....x..x.", "x......x..x.....", "x.....x...x..x.."],
      snare: ["....x.......x..."],
      clap:  ["....x.......x..."],
      hat:   ["rrrrrrrtrrrrrrxx", "rrxrrrrrrrtrrrtt"],
      roots: [33, 33, 36, 31],
      parts: [
        { inst: "bell", bars: 2, notes: [
          [0, 0.5, 81], [0.5, 0.5, 84], [1, 1, 83], [2, 0.5, 81], [2.5, 0.5, 76], [3, 1, 79],
          [4, 0.5, 81], [4.5, 0.5, 84], [5, 1, 88], [6, 0.5, 86], [6.5, 0.5, 84], [7, 1, 83],
        ] },
      ],
      mix: { kick: 1.15, snare: 1.5, hat: 1.05, bass: 1, melody: 0.75 },
    },
  },
  {
    id: "jangteo-boombap",
    title: "장터 붐뱁",
    genre: "붐뱁",
    bpm: 96,
    synth: {
      swing: 0.12,
      b808: true,
      kick:  ["x.......x.x.....", "x..x....x...x..."],
      snare: ["....x.......x...", "....x..x....x..."],
      hat:   ["x.xxx.x.x.xxx.x.", "x.x.x.x.x.x.x.o."],
      roots: [38, 38, 34, 33],
      parts: [
        { inst: "piano", bars: 4, gain: 0.8, notes: [
          [0, 0.5, 74], [0.5, 0.5, 77], [1, 0.5, 81], [2, 1, 80], [3, 0.5, 77],
          [4, 0.5, 74], [4.5, 0.5, 77], [5, 0.5, 81], [6, 1.5, 82],
          [8, 0.5, 74], [8.5, 0.5, 77], [9, 0.5, 81], [10, 1, 80], [11, 0.5, 77],
          [12, 0.5, 72], [12.5, 0.5, 74], [13, 1, 76], [14, 2, 74],
        ] },
      ],
      mix: { kick: 1.3, snare: 1.45, hat: 0.9, bass: 1, melody: 0.6 },
    },
  },
  {
    id: "taegeuk-trap",
    title: "태극 트랩",
    genre: "트랩",
    bpm: 75,
    shownBpm: 150,
    synth: {
      b808: true,
      slide808: true,
      kick:  ["x.....x...x.....", "x..x......x..x..", "x.....x...x.....", "x..x....x.x....."],
      snare: ["....x.......x...", "....x.......x.x."],
      clap:  ["....x.......x..."],
      hat:   ["rrxrrrxrrtrrxrtt", "rrrrxrrrrrrrtttt"],
      roots: [29, 29, 31, 28],
      parts: [
        { inst: "bell", bars: 2, notes: [
          [0, 1, 77], [1, 0.5, 80], [1.5, 0.5, 84], [2, 1, 85], [3, 1, 84],
          [4, 1, 77], [5, 0.5, 80], [5.5, 0.5, 79], [6, 2, 77],
        ] },
      ],
      mix: { kick: 1.15, snare: 1.5, hat: 1.05, bass: 1, melody: 0.7 },
    },
  },

  /* ---- 90년대 클래식 붐뱁 — 재즈 화음을 잘라 친 스탭 + LP 잡음 살짝 ---- */
  {
    id: "golmok-boombap",
    title: "돌담 붐뱁",
    genre: "붐뱁",
    bpm: 94,
    synth: {
      swing: 0.1,
      crackle: true,
      b808: true,
      kick:  ["x.x.....x.x.....", "x.......x.x...x.", "x.x.....x.x.....", "x.....x...x..x.."],
      snare: ["....x.......x...", "....x.......x..."],
      hat:   ["x.x.x.x.x.x.x.x.", "x.x.x.x.x.x.x.o."],
      roots: [38, 43, 36, 33],
      stab:  ["x.....x.........", "x.........x.....", "x.....x.........", "x.....x...x....."],
      stabChords: [[53, 57, 60, 64], [53, 59, 64], [52, 55, 59, 62], [55, 58, 61, 64]],
      mix: { kick: 1.35, snare: 1.45, hat: 0.8, bass: 1, keys: 0.6, vinyl: 0.4 },
    },
  },
  /* ---- 빠른 붐뱁 — 104 BPM, 킥이 쉴 새 없이 ---- */
  {
    id: "jilju-boombap",
    title: "팽이 붐뱁",
    genre: "붐뱁",
    bpm: 104,
    synth: {
      swing: 0.04,
      b808: true,
      kick:  ["x.x...x...x..x..", "x.....x.x.x.....", "x.x...x...x..x..", "x..x..x.x...x..."],
      snare: ["....x.......x...", "....x..x....x.x."],
      hat:   ["x.xxx.xxx.xxx.xo"],
      rim:   ["..x.......x.....", "..........x...x."],
      roots: [40, 40, 36, 38],
      stab:  ["x.......x.......", "x.....x.......x."],
      stabChords: [[64, 67, 71], [64, 67, 71], [60, 64, 67], [62, 66, 69]],
      mix: { kick: 1.3, snare: 1.45, hat: 0.85, bass: 1, keys: 0.5 },
    },
  },

  /* ---- 웨스트코스트 — 킥 1·1과 16분·3, 클랩, 신스 베이스 미끄럼 ---- */
  {
    id: "gwanganli-west",
    title: "광안리 웨스트",
    gain: 1.3,
    genre: "붐뱁",
    bpm: 94,
    synth: {
      swing: 0.05,
      kick:   ["x.x.....x.......", "x.x.....x..x...."],
      snare:  ["....x.......x..."],
      clap:   ["....x.......x..."],
      hat:    ["x.x.x.x.x.x.x.x."],
      shaker: ["xxxxxxxxxxxxxxxx"],
      roots:  [40, 45],
      parts: [
        { inst: "synbass", bars: 2, gain: 0.55, notes: [
          [0, 0.7, 40], [0.75, 0.25, 52], [1.5, 0.5, 40], [2.5, 0.5, 43], [3, 0.5, 45], [3.5, 0.5, 47, true],
          [4, 0.7, 45], [4.75, 0.25, 57], [5.5, 0.5, 45], [6.5, 0.5, 49], [7, 0.5, 50], [7.5, 0.5, 47, true],
        ] },
        { inst: "lead", bars: 4, gain: 0.8, notes: [
          [0, 1.4, 83, true], [1.5, 0.5, 81], [2, 1, 79], [3, 1, 76],
          [6, 0.5, 74], [6.5, 1.5, 76, true],
          [8, 1.4, 83, true], [9.5, 0.5, 86, true], [10, 1, 83, true], [11, 1, 81],
          [12, 2, 79], [14, 2, 76, true],
        ] },
      ],
      mix: { kick: 1.5, snare: 1.4, hat: 0.8, bass: 1.1, melody: 0.6 },
    },
  },
  /* ---- 빠른 웨스트코스트 — 102 BPM, 통통 튀는 킥 + 808 미끄럼 ---- */
  {
    id: "hangang-west",
    title: "한강 웨스트",
    genre: "붐뱁",
    bpm: 102,
    synth: {
      swing: 0.06,
      b808: true,
      slide808: true,
      kick:   ["x..x..x...x.x...", "x..x....x.x..x.."],
      snare:  ["....x.......x..."],
      clap:   ["....x.......x..."],
      hat:    ["x.x.x.x.x.x.x.o."],
      shaker: ["..x...x...x...x."],
      roots:  [36, 36, 41, 43],
      parts: [
        { inst: "lead", bars: 4, gain: 0.6, notes: [
          [2, 1.5, 79, true], [3.5, 0.5, 77], [10, 1, 75], [11, 1, 74, true], [12, 3, 72, true],
        ] },
      ],
      mix: { kick: 1.35, snare: 1.5, hat: 0.95, bass: 0.95, melody: 0.55 },
    },
  },

  /* ---- 빠른 트랩 — 하프타임 80 = 실제 160. 거칠게 찌그러진 808, 쉴 틈 없는 하이햇 ---- */
  {
    id: "bulkkot-trap",
    title: "횃불 트랩",
    genre: "트랩",
    bpm: 80,
    shownBpm: 160,
    synth: {
      b808: true,
      slide808: true,
      dist808: 6,
      kick:  ["x.....x.x.....x.", "x..x....x..x...."],
      snare: ["....x.......x..."],
      clap:  ["....x.......x..."],
      hat:   ["rrrrrrrrrrrrtttt", "rrrrtrrrrrrrrrrr"],
      roots: [35, 35, 38, 33],
      parts: [
        { inst: "bell", bars: 1, notes: [
          [0, 0.5, 83], [0.5, 0.5, 86], [1, 0.5, 90], [1.5, 0.5, 86], [2, 0.5, 83], [2.5, 0.5, 86], [3, 0.5, 91], [3.5, 0.5, 90],
        ] },
      ],
      mix: { kick: 1.15, snare: 1.5, hat: 1.05, bass: 1, melody: 0.55 },
    },
  },
  /* ---- 드릴 — 하프타임 72 = 실제 144. 미끄러지는 808 이 선율처럼, 엇박 스네어, 림 ---- */
  {
    id: "seoul-drill",
    title: "서울 드릴",
    genre: "드릴",
    bpm: 72,
    shownBpm: 144,
    synth: {
      dist808: 4,
      kick:  ["x.........x.....", "x......x........"],
      snare: ["....x.......x...", "....x......x...."],
      hat:   ["x..x..r.x..x..rx", "x..x..x.x.x..x.x"],
      rim:   ["......x.......x.", "...x......x....."],
      roots: [33],
      parts: [
        { inst: "808", bars: 2, notes: [
          [0, 1.4, 33], [1.5, 0.5, 45, true], [2, 1, 40, true], [3, 1, 36, true],
          [4, 1.5, 33], [5.75, 0.5, 44, true], [6.25, 0.75, 41, true], [7, 1, 38, true],
        ] },
        { inst: "piano", bars: 2, gain: 0.7, notes: [
          [0, 0.5, 69], [0.5, 0.5, 72], [1, 0.5, 76], [1.5, 0.5, 75],
          [4, 0.5, 69], [4.5, 0.5, 72], [5, 0.5, 77], [5.5, 0.5, 76],
        ] },
      ],
      mix: { kick: 1.15, snare: 1.55, hat: 1.15, bass: 1.05, melody: 0.55 },
    },
  },

  /* ---- 아리랑 리믹스 — 가야금 아리랑 + 장구 + 무거운 킥·808.
     원곡은 3박자(세마치)라, 3/4 한 마디를 힙합 두 박에 셋잇단으로 넣었다 (8분음표 = 1/3박).
     하이햇·장구도 셋잇단 느낌이 나게 뒷박 8분을 늦춘다(swing8). 음: 솔=D5 라=E5 도=G5 레=A5 미=B5 ---- */
  {
    id: "arirang-remix",
    title: "아리랑 리믹스",
    genre: "리믹스",
    bpm: 90,
    synth: {
      swing8: 1 / 6,
      b808: true,
      kick:   ["x.......x.x.....", "x.....x...x....."],
      snare:  ["....x.......x..."],
      clap:   ["....x.......x..."],
      hat:    ["x.x.x.x.x.x.x.x."],
      janggu: ["d.....t.k.....t.", "d.....t.k.t...t."],                       // d 덩 / k 쿵 / t 덕
      roots:  [31, 40, 36, 38],                                                  // G - Em - C - D
      parts: [
        { inst: "pluck", bars: 4, notes: arirang() },
      ],
      mix: { kick: 1.3, snare: 1.35, hat: 0.85, bass: 0.95, melody: 1.1, janggu: 1.1 },
    },
  },
];

/* 아리랑 첫 두 줄 — "아리랑 아리랑 아라리요 / 아리랑 고개로 넘어간다"
   [시작 박, 길이(박), 음]. 3/4 원곡의 8분음표 = 1/3박, 점4분 = 1박, 점2분 = 2박 */
function arirang() {
  const T = 1 / 3, sol = 74, la = 76, do_ = 79, re = 81, mi = 83;
  const bar = (start, notes) => {
    let at = start;
    return notes.map(([n, d]) => { const x = [at, d, n]; at += d; return x; });
  };
  return [
    ...bar(0,  [[sol, 1], [la, T], [sol, T], [la, T]]),                        // 아 — 리 랑
    ...bar(2,  [[do_, 1], [re, T], [do_, T], [re, T]]),                        // 아 — 리 랑
    ...bar(4,  [[mi, T], [re, T], [do_, T], [la, T], [do_, T], [re, T]]),       // 아 라 리 요
    ...bar(6,  [[do_, 2]]),
    ...bar(8,  [[mi, T], [re, T], [do_, T], [la, T], [do_, T], [re, T]]),       // 아 리 랑 고 개 로
    ...bar(10, [[do_, 1], [re, T], [do_, T], [la, T]]),
    ...bar(12, [[sol, 1], [la, T], [sol, T], [la, T]]),                        // 넘 어 간
    ...bar(14, [[do_, 2]]),                                                    // 다
  ];
}
