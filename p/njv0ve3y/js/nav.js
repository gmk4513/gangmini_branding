// 길 찾기 — 건물 안 걸을 수 있는 칸마다 점 하나, 이웃 칸끼리 선으로 잇는다. (건물 밖 길은 빼고)
// AI 는 이 점들을 따라 움직인다 (물리 계산 없이). three.js 를 쓰지 않아서 node 로도 검사할 수 있다.
import { FLOORS, CS, FH, navigable as walkable, rampAt, cellHeight, cell, roomAt } from "./map.js?v=20261113154252";

export function buildNav() {
  const nodes = [];
  const index = new Map();
  const key = (k, x, y) => k * 10000 + y * 100 + x;
  FLOORS.forEach((f, k) => f.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!walkable(k, x, y)) continue;
      const id = nodes.length;
      nodes.push({
        id, k, x, y, ch: row[x], nb: [], cost: [],
        p: { x: (x + 0.5) * CS, y: cellHeight(k, x, y), z: (y + 0.5) * CS },
      });
      index.set(key(k, x, y), id);
    }
  }));
  const at = (k, x, y) => { const v = index.get(key(k, x, y)); return v === undefined ? -1 : v; };
  const link = (a, b, c) => {
    if (nodes[a].nb.includes(b)) return;
    nodes[a].nb.push(b); nodes[a].cost.push(c);
    nodes[b].nb.push(a); nodes[b].cost.push(c);
  };

  for (const n of nodes) {
    const ra = rampAt(n.k, n.x, n.y);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const b = at(n.k, n.x + dx, n.y + dy);
      if (b < 0 || b < n.id) continue;
      const rb = rampAt(n.k, n.x + dx, n.y + dy);
      if (dx && dy) {
        // 대각선: 양옆이 다 열려 있고 계단과 상관없을 때만
        if (ra || rb) continue;
        if (!walkable(n.k, n.x + dx, n.y) || !walkable(n.k, n.x, n.y + dy)) continue;
        if (rampAt(n.k, n.x + dx, n.y) || rampAt(n.k, n.x, n.y + dy)) continue;
        link(n.id, b, Math.SQRT2);
        continue;
      }
      if (ra || rb) {
        if (ra && rb) {
          // 계단 안: 같은 줄에서 앞뒤로, 또는 나란한 두 줄 사이 옆으로(높이가 같을 때)
          if (dy === 0 && ra === rb) link(n.id, b, 1);
          else if (dx === 0 && ra.x0 === rb.x0 && ra.x1 === rb.x1) link(n.id, b, 1);
          continue;
        }
        // 계단 아래 입구: 계단 첫 칸 바로 왼쪽에서만 오르내린다
        if (!ra && rb && dy === 0 && dx === 1 && n.x + 1 === rb.x0) link(n.id, b, 1);
        if (ra && !rb && dy === 0 && dx === -1 && n.x === ra.x0) link(n.id, b, 1);
        continue;
      }
      link(n.id, b, 1);
    }
    // 계단 꼭대기 → 윗층 착지 칸
    if (ra && n.x === ra.x1) {
      const t = at(n.k + 1, n.x + 1, n.y);
      if (t >= 0) link(n.id, t, 1.2);
    }
  }
  markDeadEnds(nodes);
  return { nodes, at };
}

// 막다른 방 표시: 방끼리 이어진 모양(문 · 계단)을 보고, 나가는 길이 하나뿐인 방은 trap.
// 도망칠 때 이런 방 안쪽으로 뛰어들면 술래가 문만 막아도 잡히니 덜 고르게 한다.
function markDeadEnds(nodes) {
  const room = nodes.map((n) => roomAt(n.k, n.x, n.y));
  const links = new Map();
  const link = (a, b) => {
    if (!a || !b || a === b) return;
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a).add(b); links.get(b).add(a);
  };
  nodes.forEach((n, i) => {
    const ra = room[i];
    // 방에 속하지 않은 칸(문 칸 등)은 둘레 방들을 서로 잇는다
    const around = new Set();
    for (const j of n.nb) {
      if (ra && room[j]) link(ra, room[j]);
      else if (!ra && room[j]) around.add(room[j]);
    }
    const arr = [...around];
    for (let x = 0; x < arr.length; x++) for (let y = x + 1; y < arr.length; y++) link(arr[x], arr[y]);
  });
  nodes.forEach((n, i) => {
    const r = room[i];
    n.trap = !!(r && r.type !== "hall" && (!links.has(r) || links.get(r).size <= 1));
  });
}

// 발 위치(m) → 가장 가까운 길 점
export function nodeAt(nav, px, py, pz) {
  const x = Math.floor(px / CS), y = Math.floor(pz / CS);
  let k = Math.max(0, Math.min(FLOORS.length - 1, Math.floor((py + 0.6) / FH)));
  for (const kk of [k, k - 1, k + 1]) {
    if (kk < 0 || kk >= FLOORS.length) continue;
    const id = nav.at(kk, x, y);
    if (id >= 0 && Math.abs(nav.nodes[id].p.y - py) < 2.2) return id;
  }
  // 벽에 붙어 있으면 옆 칸
  let best = -1, bd = 1e9;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const id = nav.at(k, x + dx, y + dy);
    if (id < 0) continue;
    const p = nav.nodes[id].p;
    const d = (p.x - px) ** 2 + (p.z - pz) ** 2 + (p.y - py) ** 2;
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

// 한 점에서 모든 점까지 걸음 수
export function bfs(nav, from) {
  const n = nav.nodes.length;
  const d = new Float32Array(n).fill(1e9);
  if (from < 0) return d;
  const q = new Int32Array(n);
  let h = 0, t = 0;
  d[from] = 0; q[t++] = from;
  while (h < t) {
    const a = q[h++];
    const na = nav.nodes[a];
    for (let i = 0; i < na.nb.length; i++) {
      const b = na.nb[i];
      if (d[b] > d[a] + 1) { d[b] = d[a] + 1; q[t++] = b; }
    }
  }
  return d;
}

// 작은 힙
function Heap() { this.a = []; }
Heap.prototype.push = function (id, v) {
  const a = this.a; a.push([id, v]); let i = a.length - 1;
  while (i > 0) { const p = (i - 1) >> 1; if (a[p][1] <= a[i][1]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
};
Heap.prototype.pop = function () {
  const a = this.a; const top = a[0]; const last = a.pop();
  if (a.length) {
    a[0] = last; let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1; let m = i;
      if (l < a.length && a[l][1] < a[m][1]) m = l;
      if (r < a.length && a[r][1] < a[m][1]) m = r;
      if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
    }
  }
  return top;
};

// 술래(dP)를 피해 가는 길 비용으로 모든 점까지 거리를 잰다.
// 술래 가까운 칸일수록 비싸서, 술래 옆을 스쳐 지나가는 길은 잘 안 고른다.
export function fleeCosts(nav, from, dP, fear = 7) {
  const n = nav.nodes.length;
  // Float64 여야 한다: Float32 로 저장하면 √2 같은 값이 반올림돼 아래 'v > dist[a]' 비교가 틀어져
  // 탐색이 일찍 끊긴다(도망칠 곳을 주변 몇십 칸 안에서만 찾던 버그, 2026-11-12 고침)
  const dist = new Float64Array(n).fill(1e9);
  const prev = new Int32Array(n).fill(-1);
  const h = new Heap();
  dist[from] = 0; h.push(from, 0);
  while (h.a.length) {
    const [a, v] = h.pop();
    if (v > dist[a]) continue;
    const na = nav.nodes[a];
    for (let i = 0; i < na.nb.length; i++) {
      const b = na.nb[i];
      const c = na.cost[i] * (1 + fear / (dP[b] + 0.5));
      if (v + c < dist[b]) { dist[b] = v + c; prev[b] = a; h.push(b, v + c); }
    }
  }
  return { dist, prev };
}

const roomOf = (n) => roomAt(n.k, n.x, n.y);
export { roomOf };

export function pathTo(prev, to) {
  const out = [];
  for (let c = to; c >= 0; c = prev[c]) out.push(c);
  return out.reverse();
}

// 도망칠 곳 고르기: 술래에게서 멀고(dP 큼), 가는 길이 너무 길지 않은 곳.
// avoid 가 있으면 그 점 근처(분신이 같은 쪽으로 안 가게)는 뺀다.
export function pickFlee(nav, from, dP, opt = {}) {
  const { dist, prev } = fleeCosts(nav, from, dP, opt.fear);
  let best = -1, bs = -1e9;
  const nodes = nav.nodes;
  for (let i = 0; i < nodes.length; i++) {
    if (dist[i] >= 1e8 || dP[i] < 5) continue;
    if (opt.only && !opt.only(i)) continue;
    if (opt.avoid >= 0 && opt.avoid !== undefined) {
      const a = nodes[opt.avoid].p, p = nodes[i].p;
      if ((a.x - p.x) ** 2 + (a.z - p.z) ** 2 + ((a.y - p.y) * 3) ** 2 < 324) continue;   // 상대 목적지에서 18m 안은 빼기
    }
    let s = dP[i] - 0.3 * dist[i] + (opt.jitter ? Math.random() * opt.jitter : 0);
    if (nodes[i].trap) s -= 9;               // 막다른 방은 웬만하면 피한다
    if (opt.keep === i) s += 4;
    // 쌍둥이: 상대가 가는 길과 겹치는 칸이 많을수록 감점 → 방을 나가자마자 서로 다른 쪽으로
    if (opt.avoidPath && opt.avoidPath.size) {
      let shared = 0;
      for (let c = i, n = 0; c >= 0 && n < 80; c = prev[c], n++) if (opt.avoidPath.has(c)) shared++;
      s -= shared * 1.5;
    }              // 가던 곳이 아직 괜찮으면 그대로 (0.9초마다 방향을 홱홱 바꾸지 않게)
    if (opt.leaveRoom && opt.leaveRoom === roomOf(nodes[i])) continue;
    if (opt.here && nodes[i].trap && nodes[opt.here].trap) s += 9;   // 이미 막다른 방 안이면 어쩔 수 없다
    if (s > bs) { bs = s; best = i; }
  }
  if (best < 0) return null;
  return { target: best, path: pathTo(prev, best) };
}

export { cell };

// 두 점(m) 사이를 곧장 갈 수 있나: 같은 층, 계단 칸 없이, 몸 폭(half)만큼 양옆도 걸을 수 있는 칸이어야 한다
export function clearLine(nav, k, ax, az, bx, bz, half = 0.4) {
  const dx = bx - ax, dz = bz - az;
  const L = Math.hypot(dx, dz);
  if (L < 1e-3) return true;
  const nx = -dz / L, nz = dx / L;
  const steps = Math.ceil(L / 0.3);
  for (let i = 0; i <= steps; i++) {
    const x = ax + dx * i / steps, z = az + dz * i / steps;
    for (const o of [-half, 0, half]) {
      const cx = Math.floor((x + nx * o) / CS), cy = Math.floor((z + nz * o) / CS);
      if (nav.at(k, cx, cy) < 0 || rampAt(k, cx, cy)) return false;
    }
  }
  return true;
}
