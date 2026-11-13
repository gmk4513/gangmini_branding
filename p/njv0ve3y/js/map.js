// 건물 설계도 — 키아트(레퍼런스 01)에 맞춘 3층 건물 + 건물 앞 길.
// 방을 사각형으로 정하고, 그 사이는 벽, 문은 따로 뚫는다. 결과는 층마다 글자 지도(FLOORS).
//   #  벽            .  바닥            H  숨는 자리
//   B  가구(못 지나감, Blender 가 방 종류에 맞는 소품으로 바꾼다)
//   P  라프산두 시작 자리(건물 밖)       D  매튜 디제잉 자리
//   >  계단(경사로). 오른쪽(+x)으로 갈수록 올라가 다음 층에 닿는다
//   (빈칸) 바닥 없음 — 아래층 계단 위로 뚫린 자리
//   o  건물 밖 길(술래만 다닌다. 숨는 사람은 밖으로 안 나간다)
//   ~  건물 밖 허공(2 · 3층의 길 위)    X  안 보이는 울타리(길 끝)
// tools/check-map.mjs 가 계단 짝 · 모든 칸에 갈 수 있는지 확인한다.

export const CS = 1.5;     // 칸 한 변 (m)
export const FH = 3.4;     // 층 높이 (m)
export const SLAB = 0.2;   // 바닥 두께 (m)

export const W = 30;       // 가로 칸 수
export const BUILD_H = 20; // 건물 세로 칸 수 (0~19). 그 아래 20~25 는 길
export const Hgt = 26;

// ---- 방 (층, 이름, 종류, 사각형) ----
// 종류(type)는 Blender 가 바닥 재질 · 소품 · 조명을 고를 때 쓴다
export const ROOMS = [
  // 1층 — 로비 · 휴게실 · 라운지 · 화장실
  { k: 0, name: "계단실", type: "stair", x0: 1, y0: 1, x1: 9, y1: 6 },
  { k: 0, name: "휴게실", type: "kitchen", x0: 11, y0: 1, x1: 21, y1: 6 },
  { k: 0, name: "화장실", type: "restroom", x0: 23, y0: 1, x1: 28, y1: 6 },
  { k: 0, name: "복도", type: "hall", x0: 1, y0: 8, x1: 28, y1: 8 },
  { k: 0, name: "로비", type: "lobby", x0: 1, y0: 10, x1: 15, y1: 18 },
  { k: 0, name: "라운지", type: "lounge", x0: 17, y0: 10, x1: 28, y1: 18 },
  // 2층 — 사무실 · 회의실 · 안무 연습실
  { k: 1, name: "계단실", type: "stair", x0: 1, y0: 1, x1: 9, y1: 6 },
  { k: 1, name: "사무실", type: "office", x0: 11, y0: 1, x1: 21, y1: 6 },
  { k: 1, name: "화장실", type: "restroom", x0: 23, y0: 1, x1: 28, y1: 6 },
  { k: 1, name: "복도", type: "hall", x0: 1, y0: 8, x1: 28, y1: 8 },
  { k: 1, name: "회의실", type: "meeting", x0: 1, y0: 10, x1: 9, y1: 18 },
  { k: 1, name: "안무 연습실", type: "dance", x0: 11, y0: 10, x1: 28, y1: 18 },
  // 3층 — 녹음실 · 보컬 부스 · DJ룸 · 장비 창고
  { k: 2, name: "계단실", type: "stair", x0: 1, y0: 1, x1: 9, y1: 6 },
  { k: 2, name: "녹음실", type: "studio", x0: 11, y0: 1, x1: 17, y1: 6 },
  { k: 2, name: "보컬 부스", type: "booth", x0: 19, y0: 1, x1: 21, y1: 6 },
  { k: 2, name: "소품 창고", type: "storage", x0: 23, y0: 1, x1: 28, y1: 6 },
  { k: 2, name: "복도", type: "hall", x0: 1, y0: 8, x1: 28, y1: 8 },
  { k: 2, name: "DJ룸", type: "dj", x0: 1, y0: 10, x1: 12, y1: 18 },
  { k: 2, name: "장비 창고", type: "storage", x0: 14, y0: 10, x1: 28, y1: 18 },
];

// 문 (벽에 뚫는 한 칸). 계단실 문은 계단 · 구멍을 피해 x=9 에
const DOOR_CELLS = [
  [0, 9, 7], [0, 16, 7], [0, 25, 7], [0, 8, 9], [0, 22, 9], [0, 16, 14], [0, 7, 19],   // 1층 (7,19)= 정문
  [1, 9, 7], [1, 13, 7], [1, 19, 7], [1, 25, 7], [1, 5, 9], [1, 14, 9], [1, 24, 9],
  [2, 9, 7], [2, 14, 7], [2, 18, 3], [2, 25, 7], [2, 6, 9], [2, 20, 9],
];

// 계단: 1→2층은 3 · 4줄(y=2,3), 2→3층은 6 · 7줄(y=5,6). 둘 다 계단실 안 x=2~7
const STAIRS = [{ k: 0, ys: [2, 3], x0: 2, x1: 7 }, { k: 1, ys: [5, 6], x0: 2, x1: 7 }];

// 가구(B) · 숨는 자리(H) · 시작(P) · 매튜(D)
// 가구 자리: [층, x, y, 종류]. 종류는 Blender 가 어떤 소품을 놓을지 정한다 (tools/blender/place_props.py)
export const FURNITURE = [
  // 1층 휴게실: 주방 카운터 · 오락기 · 자판기 · 식탁
  [0, 12, 1, "counter"], [0, 13, 1, "counter"], [0, 14, 1, "counter"], [0, 19, 1, "arcade"], [0, 20, 1, "vending"], [0, 16, 4, "dining"], [0, 17, 4, "dining"],
  // 1층 화장실 칸막이
  [0, 27, 1, "stall"], [0, 27, 3, "stall"],
  // 1층 로비: 안내 데스크 · 사물함 · 소파 · 화분
  [0, 12, 11, "reception"], [0, 13, 11, "reception"], [0, 14, 11, "reception"], [0, 1, 12, "locker"], [0, 1, 13, "locker"],
  [0, 4, 15, "sofa"], [0, 5, 15, "sofa"], [0, 6, 15, "sofa"], [0, 14, 17, "plant"],
  // 1층 라운지: 큰 소파 · 오락기
  [0, 19, 15, "sofa"], [0, 20, 15, "sofa"], [0, 21, 15, "sofa"], [0, 21, 14, "plant"], [0, 28, 10, "arcade"],
  // 2층 사무실: 책상 · 서류장
  [1, 12, 2, "desk"], [1, 13, 2, "desk"], [1, 15, 2, "desk"], [1, 16, 2, "desk"], [1, 21, 1, "cabinet"], [1, 21, 2, "cabinet"],
  [1, 27, 1, "stall"], [1, 27, 3, "stall"],
  // 2층 회의실: 큰 테이블
  [1, 4, 13, "meeting"], [1, 5, 13, "meeting"], [1, 6, 13, "meeting"], [1, 4, 14, "meeting"], [1, 5, 14, "meeting"], [1, 6, 14, "meeting"],
  // 2층 안무실: 스피커 · 가방
  [1, 11, 10, "speaker"], [1, 28, 10, "speaker"], [1, 28, 11, "bags"],
  // 3층 녹음실: 믹싱 콘솔 / 보컬 부스: 마이크
  [2, 13, 2, "console"], [2, 14, 2, "console"], [2, 15, 2, "console"], [2, 20, 4, "mic"],
  // 3층 소품 창고: 하드케이스
  [2, 23, 1, "case"], [2, 24, 1, "case"], [2, 28, 4, "case"], [2, 28, 5, "case"],
  // 3층 DJ룸: 스피커 · LP 선반 · 소파
  [2, 3, 11, "speaker"], [2, 9, 11, "speaker"], [2, 12, 13, "shelf"], [2, 12, 14, "shelf"], [2, 12, 15, "shelf"], [2, 2, 16, "sofa"], [2, 3, 16, "sofa"], [2, 4, 16, "sofa"],
  // 3층 장비 창고: 하드케이스 더미 · 옷걸이
  [2, 16, 12, "case"], [2, 17, 12, "case"], [2, 16, 13, "case"], [2, 21, 15, "case"], [2, 22, 15, "case"], [2, 21, 16, "case"],
  [2, 25, 11, "case"], [2, 26, 11, "case"], [2, 27, 17, "case"], [2, 27, 10, "rack"], [2, 28, 10, "rack"],
];

const MARKS = {
  B: FURNITURE.map(([k, x, y]) => [k, x, y]),
  H: [
    [0, 12, 5], [0, 21, 5], [0, 28, 2], [0, 24, 5], [0, 2, 11], [0, 14, 12], [0, 3, 17], [0, 10, 17], [0, 18, 11], [0, 27, 17], [0, 24, 12],
    [1, 14, 5], [1, 20, 5], [1, 28, 5], [1, 1, 11], [1, 8, 17], [1, 27, 17], [1, 12, 11], [1, 9, 1],
    [2, 16, 5], [2, 11, 1], [2, 20, 1], [2, 26, 2], [2, 23, 6], [2, 1, 18], [2, 11, 17], [2, 17, 14], [2, 22, 14], [2, 26, 12], [2, 15, 18], [2, 28, 18],
  ],
  D: [[2, 6, 12]],
  P: [[0, 7, 23]],
};

// ---- 글자 지도 만들기 ----
function build() {
  const g = [0, 1, 2].map((k) => Array.from({ length: Hgt }, (_, y) => Array.from({ length: W }, (_, x) => {
    if (y < BUILD_H) return "#";
    if (k > 0) return "~";
    return (x === 0 || x === W - 1 || y === Hgt - 1) ? "X" : "o";
  })));
  for (const r of ROOMS) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) g[r.k][y][x] = ".";
  for (const [k, x, y] of DOOR_CELLS) g[k][y][x] = ".";
  for (const s of STAIRS) for (const y of s.ys) for (let x = s.x0; x <= s.x1; x++) { g[s.k][y][x] = ">"; g[s.k + 1][y][x] = " "; }
  for (const ch of Object.keys(MARKS)) for (const [k, x, y] of MARKS[ch]) g[k][y][x] = ch;
  return g.map((f) => f.map((row) => row.join("")));
}
export const FLOORS = build();

export function cell(k, x, y) {
  const f = FLOORS[k];
  if (!f || y < 0 || y >= f.length || x < 0 || x >= f[y].length) return "#";
  return f[y][x];
}

const WALK = new Set([".", "H", "P", "D", ">", "o"]);
export const walkable = (k, x, y) => WALK.has(cell(k, x, y));
// 숨는 사람(AI)이 다니는 칸: 건물 안만
export const navigable = (k, x, y) => walkable(k, x, y) && y < BUILD_H;

// 이 칸이 어느 방인가 (없으면 null)
export function roomAt(k, x, y) {
  for (const r of ROOMS) if (r.k === k && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r;
  return null;
}

// 계단 줄 찾기: 같은 줄에서 이어진 '>' 묶음 하나가 계단 하나
export const RAMPS = [];
const rampIndex = new Map();
FLOORS.forEach((f, k) => f.forEach((row, y) => {
  let x = 0;
  while (x < row.length) {
    if (row[x] !== ">") { x++; continue; }
    const x0 = x;
    while (row[x] === ">") x++;
    const r = { k, y, x0, x1: x - 1, len: x - x0 };
    RAMPS.push(r);
    for (let i = x0; i <= r.x1; i++) rampIndex.set(k + ":" + i + ":" + y, r);
  }
}));
export const rampAt = (k, x, y) => rampIndex.get(k + ":" + x + ":" + y) || null;

// 칸 가운데의 발 높이
export function cellHeight(k, x, y) {
  const r = rampAt(k, x, y);
  if (!r) return k * FH;
  // 계단 칸 앞 모서리를 잇는 높이 (보이는 계단 칸 = 한 층 칸 수 × 3개, 한 칸만큼 위)
  return k * FH + FH * ((x - r.x0 + 0.5) / r.len) + FH / (r.len * 3);
}

export function findChar(ch) {
  const out = [];
  FLOORS.forEach((f, k) => f.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === ch) out.push({ k, x, y });
  }));
  return out;
}

// ---- 문 · 난간 (게임 충돌과 Blender 건물이 같은 자료를 쓴다) ----
// 문: 벽 줄에 한 칸 뚫린 자리. 앞뒤가 걸을 수 있어야 문으로 본다.
// 문 위(DOOR_H 위)는 벽으로 막아서 '뚫린 틈'이 아니라 '문'처럼 보이게 한다.
export const DOOR_H = 2.3;
export const DOORS = DOOR_CELLS.map(([k, x, y]) => {
  const wallLR = cell(k, x - 1, y) === "#" && cell(k, x + 1, y) === "#";
  return { k, x, y, axis: wallLR ? "x" : "z", front: y === BUILD_H - 1 };
});

// 난간: 아래층 계단 위로 뚫린 칸의 가장자리. 계단 꼭대기와 이어지는 쪽(착지 칸)만 비운다.
export const RAILS = [];
FLOORS.forEach((f, k) => f.forEach((row, y) => {
  for (let x = 0; x < row.length; x++) {
    if (row[x] !== " ") continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!walkable(k, x + dx, y + dy)) continue;
      const r = rampAt(k - 1, x, y);
      if (r && x === r.x1 && dx === 1) continue;
      const ex = dx === 1 ? x + 1 : x, ez = dy === 1 ? y + 1 : y;
      RAILS.push(dx ? { k, x0: ex * CS, z0: y * CS, x1: ex * CS, z1: (y + 1) * CS }
                    : { k, x0: x * CS, z0: ez * CS, x1: (x + 1) * CS, z1: ez * CS });
    }
  }
}));
