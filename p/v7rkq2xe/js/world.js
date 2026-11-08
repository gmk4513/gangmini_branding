/* 동네 전체 — 맵 구조 레퍼런스(1374×1145) 의 도로·블록 배치를 그대로 옮겼다.
   레퍼런스 픽셀 → 월드 미터: wx(px), wz(py). 건물·나무는 InstancedMesh 로 묶어 가볍게.
   부딪힘: 네모(AABB)·원을 칸 격자에 넣어 둔다. 경찰 길찾기용 격자도 여기서 만든다. */
import * as THREE from "../vendor/three.module.min.js";
import { mergeGeometries } from "../vendor/addons/utils/BufferGeometryUtils.js";
import * as T from "./textures.js";

const SC = 0.72;                       // 레퍼런스 1px = 0.72m → 맵 약 1km × 0.8km
export const wx = (p) => (p - 687) * SC;
export const wz = (p) => (p - 590) * SC;
export const ROAD_W = 13;              // 2차선 (한 차선 6.5m — 드리프트할 여유)
const SIDEWALK = 3.6;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

/* --- 레퍼런스의 도로 --- */
const VR = [[30, 95, 1080], [1345, 95, 1080], [255, 95, 1080], [490, 455, 1080], [685, 95, 455], [685, 765, 1125], [880, 95, 765], [1120, 455, 1080]];
const HR = [[95, 30, 1345], [1080, 30, 1345], [285, 30, 255], [285, 685, 880], [455, 30, 1345], [635, 30, 490], [635, 880, 1345], [765, 30, 1345], [925, 30, 685], [925, 1120, 1345]];
/* --- 블록: [왼 도로, 위 도로, 오른 도로, 아래 도로, 종류] --- */
const BLOCKS = [
  [30, 95, 255, 285, "house"], [30, 285, 255, 455, "house"], [30, 455, 255, 635, "mix"], [30, 635, 255, 765, "house"],
  [30, 765, 255, 925, "mix"], [30, 925, 255, 1080, "house"],
  [255, 95, 685, 455, "school"],
  [685, 95, 880, 285, "mix"], [685, 285, 880, 455, "mix"],
  [880, 95, 1345, 455, "lake"],
  [255, 455, 490, 635, "mix"], [255, 635, 490, 765, "shop"], [255, 765, 490, 925, "shop"], [255, 925, 490, 1080, "shop"],
  [490, 455, 880, 765, "plaza"],
  [880, 455, 1120, 635, "mix"], [880, 635, 1120, 765, "house"],
  [1120, 455, 1345, 635, "mix"], [1120, 635, 1345, 765, "house"],
  [490, 765, 685, 925, "shop"], [490, 925, 685, 1080, "shop"],
  [685, 765, 1120, 1080, "police"],
  [1120, 765, 1345, 925, "mix"], [1120, 925, 1345, 1080, "house"],
];

export const BOUNDS = { x0: wx(30) - 34, x1: wx(1345) + 34, z0: wz(95) - 34, z1: wz(1125) + 16 };

/* ---------- 부딪힘 ---------- */
const CELL = 24;
const hash = new Map();
const key = (cx, cz) => cx * 100000 + cz;
const boxes = [], circles = [];
function reg(o, x0, z0, x1, z1) {
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const k = key(cx, cz); let a = hash.get(k); if (!a) hash.set(k, a = []); a.push(o);
    }
}
function addBox(x0, z0, x1, z1) { const b = { b: 1, x0, z0, x1, z1 }; boxes.push(b); reg(b, x0, z0, x1, z1); return b; }
function addCircle(x, z, r, soft, low, h) { const c = { b: 0, x, z, r, soft, low, h }; circles.push(c); reg(c, x - r, z - r, x + r, z + r); return c; }

/* ---------- 점프대 (분수광장) ----------
   경사로 위 높이 = 시작점에서 올라간 거리 × 기울기. 차는 이 높이를 따라 올라가다
   끝에서 땅이 꺼지면 그때 올라가던 빠르기로 떠서 중력(9.8)대로 떨어진다 (main.js vertical) */
export const RAMPS = [];
export function groundAt(x, z) {
  let h = 0;
  for (const r of RAMPS) {
    if (r.ring) {   // 둥근 둔덕: 바깥→꼭대기 오르막, 꼭대기→안쪽 내리막
      const d = Math.hypot(x - r.x, z - r.z);
      if (d > r.rIn && d < r.rOut) h = Math.max(h, d >= r.rTop ? r.h * (r.rOut - d) / (r.rOut - r.rTop) : r.h * (d - r.rIn) / (r.rTop - r.rIn));
      continue;
    }
    const dx = x - r.x, dz = z - r.z, u = dx * r.dx + dz * r.dz, v = dx * -r.dz + dz * r.dx;
    if (u >= 0 && u <= r.len && Math.abs(v) <= r.w / 2) h = Math.max(h, r.h * u / r.len);
  }
  return h;
}

/* 바리케이드처럼 생겼다 사라지는 네모 — 부딪힘 칸과 경찰 길찾기 격자(NAV.block)에 넣었다 뺐다 한다 */
export function addDynBox(x0, z0, x1, z1) {
  const b = { b: 1, x0, z0, x1, z1, dyn: true, cells: [] };
  reg(b, x0, z0, x1, z1);
  const m = 3.0;
  const i0 = Math.max(0, Math.floor((x0 - m - NAV.x0) / NAV.cell)), i1 = Math.min(NAV.w - 1, Math.floor((x1 + m - NAV.x0) / NAV.cell));
  const j0 = Math.max(0, Math.floor((z0 - m - NAV.z0) / NAV.cell)), j1 = Math.min(NAV.h - 1, Math.floor((z1 + m - NAV.z0) / NAV.cell));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * NAV.w + i; NAV.block[k]++; b.cells.push(k); }
  return b;
}
export function removeDynBox(b) {
  for (let cx = Math.floor(b.x0 / CELL); cx <= Math.floor(b.x1 / CELL); cx++)
    for (let cz = Math.floor(b.z0 / CELL); cz <= Math.floor(b.z1 / CELL); cz++) {
      const a = hash.get(key(cx, cz)); if (!a) continue;
      const i = a.indexOf(b); if (i >= 0) a.splice(i, 1);
    }
  for (const k of b.cells) NAV.block[k]--;
  b.cells = [];
}

/* 원(r) 을 벽 밖으로 민다. 돌려줌: 부딪혔으면 법선 */
const seen = new Set();
export function pushOut(p, r, air) {
  let hit = false, nx = 0, nz = 0;
  seen.clear();
  const cx0 = Math.floor((p.x - r) / CELL), cx1 = Math.floor((p.x + r) / CELL);
  const cz0 = Math.floor((p.z - r) / CELL), cz1 = Math.floor((p.z + r) / CELL);
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
    const a = hash.get(key(cx, cz)); if (!a) continue;
    for (const o of a) {
      if (seen.has(o)) continue; seen.add(o);
      if (o.b) {
        const qx = Math.max(o.x0, Math.min(p.x, o.x1)), qz = Math.max(o.z0, Math.min(p.z, o.z1));
        let dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-5) { // 안쪽 — 가장 가까운 면으로
          const l = p.x - o.x0, rr = o.x1 - p.x, t = p.z - o.z0, bb = o.z1 - p.z, m = Math.min(l, rr, t, bb);
          if (m === l) { dx = -1; dz = 0; d = -l; } else if (m === rr) { dx = 1; dz = 0; d = -rr; } else if (m === t) { dx = 0; dz = -1; d = -t; } else { dx = 0; dz = 1; d = -bb; }
          p.x += dx * (r - d); p.z += dz * (r - d); nx += dx; nz += dz;
        } else { dx /= d; dz /= d; p.x += dx * (r - d); p.z += dz * (r - d); nx += dx; nz += dz; }
        hit = true;
      } else {
        if (air > 1.4 && (o.soft || o.low)) continue;    // 날아가는 중엔 나무·벤치 위로 넘어간다
        if (o.h != null && air > o.h) continue;           // 높이가 정해진 것(분수 탑)은 그보다 높이 날면 넘어간다
        const dx = p.x - o.x, dz = p.z - o.z, R = r + o.r, d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2) || 1e-3, ux = dx / d, uz = dz / d;
        p.x = o.x + ux * R; p.z = o.z + uz * R; nx += ux; nz += uz; hit = true;
      }
    }
  }
  if (p.x < BOUNDS.x0 + r) { p.x = BOUNDS.x0 + r; nx += 1; hit = true; }
  if (p.x > BOUNDS.x1 - r) { p.x = BOUNDS.x1 - r; nx -= 1; hit = true; }
  if (p.z < BOUNDS.z0 + r) { p.z = BOUNDS.z0 + r; nz += 1; hit = true; }
  if (p.z > BOUNDS.z1 - r) { p.z = BOUNDS.z1 - r; nz -= 1; hit = true; }
  if (!hit) return null;
  const l = Math.hypot(nx, nz) || 1;
  return { nx: nx / l, nz: nz / l };
}

/* 두 점 사이가 건물에 막혔나 (경찰 시야) — 4m 씩 찍어 본다 */
export function lineClear(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 4);
  for (let i = 1; i < n; i++) {
    const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
    const a = hash.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!a) continue;
    for (const o of a) {
      if (o.b) { if (x > o.x0 - 2 && x < o.x1 + 2 && z > o.z0 - 2 && z < o.z1 + 2) return false; }
      else if (!o.soft && (x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + 2) ** 2) return false;
    }
  }
  return true;
}

/* 호수 (들어가면 느려진다): 레퍼런스 호수 윤곽을 타원 몇 개로 */
const lakeBlobs = [
  { x: wx(1115), z: wz(255), rx: 118, rz: 72 },
  { x: wx(1190), z: wz(215), rx: 64, rz: 52 },
  { x: wx(1060), z: wz(300), rx: 74, rz: 44 },
];
export function inWater(x, z) {
  for (const b of lakeBlobs) { const dx = (x - b.x) / b.rx, dz = (z - b.z) / b.rz; if (dx * dx + dz * dz < 1) return true; }
  return false;
}

/* ---------- 경찰 길찾기 격자 ---------- */
export const NAV = { cell: 5, w: 0, h: 0, x0: 0, z0: 0, cost: null };
const onRoad = (x, z) => {
  for (const [p, a, b] of VR) if (Math.abs(x - wx(p)) < ROAD_W / 2 && z > wz(a) - 7 && z < wz(b) + 7) return true;
  for (const [p, a, b] of HR) if (Math.abs(z - wz(p)) < ROAD_W / 2 && x > wx(a) - 7 && x < wx(b) + 7) return true;
  return false;
};
export const isRoad = onRoad;
function buildNav() {
  NAV.x0 = BOUNDS.x0; NAV.z0 = BOUNDS.z0;
  NAV.w = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / NAV.cell);
  NAV.h = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / NAV.cell);
  NAV.cost = new Uint8Array(NAV.w * NAV.h);
  NAV.block = new Uint8Array(NAV.w * NAV.h);     // 바리케이드처럼 잠깐 막힌 칸 (겹칠 수 있어 개수로 센다)
  const margin = 3.0;                  // 경찰차 반폭(약 1.7m) + 여유
  const p = { x: 0, z: 0 };
  for (let j = 0; j < NAV.h; j++) for (let i = 0; i < NAV.w; i++) {
    const x = NAV.x0 + (i + 0.5) * NAV.cell, z = NAV.z0 + (j + 0.5) * NAV.cell;
    let c;
    if (onRoad(x, z)) c = 10;
    else if (groundAt(x, z) > 0.5) c = 60;                // 점프대 — 경찰은 웬만하면 돌아간다
    else if (inWater(x, z)) c = 70;
    else c = 32;
    p.x = x; p.z = z;
    const a = hash.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    const near = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const k = hash.get(key(Math.floor(x / CELL) + dx, Math.floor(z / CELL) + dz)); if (k) near.push(...k); }
    for (const o of near) {
      if (o.b) { if (x > o.x0 - margin && x < o.x1 + margin && z > o.z0 - margin && z < o.z1 + margin) { c = 0; break; } }
      else { const R = o.r + margin; if ((x - o.x) ** 2 + (z - o.z) ** 2 < R * R) { if (o.soft) c = Math.max(c, 60); else { c = 0; break; } } }
    }
    if (x < BOUNDS.x0 + 3 || x > BOUNDS.x1 - 3 || z < BOUNDS.z0 + 3 || z > BOUNDS.z1 - 3) c = 0;
    NAV.cost[j * NAV.w + i] = c;
    void a;
  }
}

/* ---------- 재질 ---------- */
const mat = (o) => new THREE.MeshLambertMaterial(o);
const box = (w, h, d, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
function colored(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return geo;
}
const merged = (list) => mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g), false);

/* 땅에 까는 평면 (y 살짝 올림) — 월드 좌표에 맞춰 UV 반복 */
function flat(x0, z0, x1, z1, y, material, uvSize) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / uvSize, p.getZ(i) / uvSize);
  const m = new THREE.Mesh(g, material); m.receiveShadow = true;
  return m;
}
function roundRectShape(x0, z0, x1, z1, r) {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, z0); s.lineTo(x1 - r, z0); s.quadraticCurveTo(x1, z0, x1, z0 + r);
  s.lineTo(x1, z1 - r); s.quadraticCurveTo(x1, z1, x1 - r, z1);
  s.lineTo(x0 + r, z1); s.quadraticCurveTo(x0, z1, x0, z1 - r);
  s.lineTo(x0, z0 + r); s.quadraticCurveTo(x0, z0, x0 + r, z0);
  return s;
}
/* 모서리 둥근 판 (보도·잔디). Shape 는 XY → XZ 로 눕힌다 */
function roundPlate(x0, z0, x1, z1, r, y, material, uvSize) {
  const g = new THREE.ShapeGeometry(roundRectShape(x0, -z1, x1, -z0, r), 6);
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / uvSize, p.getZ(i) / uvSize);
  const m = new THREE.Mesh(g, material); m.receiveShadow = true;
  return m;
}

/* ---------- 만들기 ---------- */
export function buildWorld(scene) {
  const G = new THREE.Group(); scene.add(G);
  const updaters = [];

  /* 넓은 잔디 */
  const grassM = mat({ map: T.grass() });
  G.add(flat(-1400, -1400, 1400, 1400, -0.06, grassM, 26));

  /* 도로 */
  const roadM = mat({ map: T.asphalt() });
  const lineGeos = [], whiteGeos = [];
  const addRoadRect = (x0, z0, x1, z1) => G.add(flat(x0, z0, x1, z1, 0.0, roadM, 14));
  // 보도 밑까지 1m 더 깐다 — 보도가 살짝 떠 있어 틈으로 잔디가 보이지 않게
  const RW = ROAD_W / 2 + 1;
  for (const [p, a, b] of VR) addRoadRect(wx(p) - RW, wz(a) - RW, wx(p) + RW, wz(b) + RW);
  for (const [p, a, b] of HR) addRoadRect(wx(a) - RW, wz(p) - RW, wx(b) + RW, wz(p) + RW);

  /* 교차로 찾기 */
  const crossings = [];
  for (const [vp, va, vb] of VR) for (const [hp, ha, hb] of HR)
    if (vp >= ha && vp <= hb && hp >= va && hp <= vb) crossings.push({ x: wx(vp), z: wz(hp), vp, hp });
  const isCross = (x, z, r) => crossings.some(c => Math.abs(c.x - x) < r && Math.abs(c.z - z) < r);
  const rCross = ROAD_W / 2 + 7.5;     // 교차로 + 횡단보도 자리

  /* 노란 중앙선(2줄) — 교차로 안은 비운다 */
  const addLine = (x0, z0, x1, z1) => {
    const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const L = horiz ? x1 - x0 : z1 - z0, step = 6, n = Math.floor(L / step);
    for (let i = 0; i < n; i++) {
      const s = i * step + step / 2, cx = horiz ? x0 + s : x0, cz = horiz ? z0 : z0 + s;
      if (isCross(cx, cz, rCross)) continue;
      for (const k of [-0.24, 0.24]) {
        const g = horiz ? new THREE.PlaneGeometry(step + 0.02, 0.24) : new THREE.PlaneGeometry(0.24, step + 0.02);
        g.rotateX(-Math.PI / 2);
        g.translate(cx + (horiz ? 0 : k), 0.03, cz + (horiz ? k : 0));
        lineGeos.push(g);
      }
    }
  };
  for (const [p, a, b] of VR) addLine(wx(p), wz(a), wx(p), wz(b));
  for (const [p, a, b] of HR) addLine(wx(a), wz(p), wx(b), wz(p));
  G.add(new THREE.Mesh(merged(lineGeos), new THREE.MeshBasicMaterial({ color: "#f4c531" })));

  /* 횡단보도: 교차로의 네 방향 (길이 있는 쪽만) */
  const hasRoad = (x, z) => onRoad(x, z);
  const crosswalks = [];
  for (const c of crossings) {
    const d = ROAD_W / 2 + 3.2;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx * d, z = c.z + dz * d;
      if (!hasRoad(x, z) || !hasRoad(c.x + dx * (d + 6), c.z + dz * (d + 6))) continue;
      crosswalks.push({ x, z, horiz: dx !== 0, c, dx, dz });
      for (let i = -3; i <= 3; i++) {
        const off = i * 1.7;
        const g = dx !== 0 ? new THREE.PlaneGeometry(3.4, 1.0) : new THREE.PlaneGeometry(1.0, 3.4);
        g.rotateX(-Math.PI / 2);
        g.translate(x + (dx !== 0 ? 0 : off), 0.03, z + (dx !== 0 ? off : 0));
        whiteGeos.push(g);
      }
      // 정지선
      const sg = dx !== 0 ? new THREE.PlaneGeometry(0.5, ROAD_W / 2) : new THREE.PlaneGeometry(ROAD_W / 2, 0.5);
      sg.rotateX(-Math.PI / 2);
      sg.translate(x + dx * 2.9 + (dx !== 0 ? 0 : -dz * ROAD_W / 4), 0.03, z + dz * 2.9 + (dx !== 0 ? dx * ROAD_W / 4 : 0));
      whiteGeos.push(sg);
    }
  }
  G.add(new THREE.Mesh(merged(whiteGeos), new THREE.MeshBasicMaterial({ color: "#f3f3f0" })));

  /* --- 건물·나무 모으기 (블록마다 넣고 마지막에 인스턴스) --- */
  const trees = [], blossoms = [], willows = [], lamps = [], bushes = [];
  const pavM = mat({ map: T.pavers() }), lawnM = grassM;
  const instW = new Map();
  const batches = { boxes: new Map(), roofs: new Map() };
  const put = (map, key, m4) => { let a = map.get(key); if (!a) map.set(key, a = []); a.push(m4); };
  const m4 = (x, y, z, sx, sy, sz, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));

  /* 벽 재질 묶음 */
  const houseWalls = ["#fbf3e3", "#f6e9d4", "#f2f0e8", "#f9e7d6", "#eef2f0"].map(c => {
    const t = T.windows(c, "#fff", "#7cc1e2", 3, 2); return mat({ map: t, color: "#ffffff" });
  });
  const aptWalls = ["#f4f5f4", "#e9edf0", "#f6efe4"].map(c => mat({ map: T.windows(c, "#d6dbe0", "#6fb4d8", 4, 6, { balcony: "#b9c2ca" }) }));
  const shopWallsTop = ["#d7cdbd", "#c8bdb0", "#b69d86", "#9f8c7c", "#c2a08b"].map(c => mat({ map: T.windows(c, "#eee", "#6fb4d8", 4, 2) }));
  const shopFronts = [
    ["#d34b3f", "#e65b4d", "국밥집"], ["#2f7d5b", "#3a9c70", "분식"], ["#7a4bb3", "#9460cc", "노래방"], ["#c98a18", "#e0a52a", "카페"],
    ["#2a6fb0", "#3a8bd2", "편의점"], ["#b23c78", "#cf5292", "치킨"],
  ].map(([a, b, n]) => mat({ map: T.shopFront(a, b, n) }));
  const roofCols = ["#d9402f", "#2f62c9", "#f2c12e", "#2e9c6b", "#39a7b5", "#e36a2b", "#cc4b54"];
  const roofMats = roofCols.map(c => mat({ color: c }));
  const flatRoofM = mat({ color: "#c9cbc8" });
  const baseBox = new THREE.BoxGeometry(1, 1, 1);
  const flatRoofGeo = new THREE.BoxGeometry(1.06, 0.5, 1.06);
  // 박공 지붕 (x 방향이 용마루)
  const gable = (() => {
    const s = new THREE.Shape(); s.moveTo(-0.56, 0); s.lineTo(0, 0.5); s.lineTo(0.56, 0); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 1.1, bevelEnabled: false }); g.translate(0, 0, -0.55); g.rotateY(Math.PI / 2);
    g.computeVertexNormals(); return g;
  })();

  function addHouse(x, z, w, d, ry90) {
    const h = rnd(7, 11), wm = pick(houseWalls), rm = pick(roofMats);
    put(batches.boxes, wm, m4(x, h / 2, z, w, h, d));
    // 맞배지붕: 긴 쪽이 용마루
    const along = w > d;
    put(batches.roofs, rm, m4(x, h, z, along ? w : d, rnd(0.55, 0.8) * Math.min(w, d), along ? d : w, along ? 0 : Math.PI / 2));
    addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
    void ry90;
  }
  function addApt(x, z, w, d) {
    const h = rnd(22, 38), wm = pick(aptWalls);
    put(batches.boxes, wm, m4(x, h / 2, z, w, h, d));
    put(batches.boxes, flatRoofM, m4(x, h + 0.25, z, w * 1.04, 0.5, d * 1.04));
    put(batches.boxes, flatRoofM, m4(x + w * 0.2, h + 1.3, z, 3, 2, 3));
    addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  }
  function addShop(x, z, w, d, faceSign, faceX) {
    const h = rnd(10, 19), top = pick(shopWallsTop), front = pick(shopFronts);
    put(batches.boxes, top, m4(x, h / 2 + 2.2, z, w, h - 4.4 + 0.02 + 4.4 - 4.4, d));
    put(batches.boxes, flatRoofM, m4(x, h + 0.2, z, w * 1.03, 0.4, d * 1.03));
    // 1층 가게면 (앞쪽)
    const gh = 4.6;
    put(batches.boxes, top, m4(x, gh / 2, z, w, gh, d));
    const fw = faceX ? d : w;
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(fw * 0.98, gh), front);
    if (faceX) { fg.position.set(x + faceSign * (w / 2 + 0.03), gh / 2, z); fg.rotation.y = faceSign * Math.PI / 2; }
    else { fg.position.set(x, gh / 2, z + faceSign * (d / 2 + 0.03)); fg.rotation.y = faceSign > 0 ? 0 : Math.PI; }
    G.add(fg);
    addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  }

  /* 블록 안을 칸으로 나눠 건물 배치.
     건물 사이 골목은 ALLEY(8~10m) 비운다 — 차(폭 약 3.5m)가 벽에 붙은 나무 사이로도 지나갈 수 있게.
     나무는 골목 가운데가 아니라 건물 벽에 붙여 심고, 가로수는 건물 앞에만 둬서 골목 입구를 막지 않는다 */
  const ALLEY = [8, 10];
  function fillBlock(x0, z0, x1, z1, kind) {
    const W = x1 - x0, D = z1 - z0;
    const nx = Math.max(2, Math.round(W / 36)), nz = Math.max(2, Math.round(D / 33));
    const cw = W / nx, cd = D / nz;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const colX = [], rowZ = [];
    for (let i = 0; i < nx; i++) colX.push(x0 + (i + 0.5) * cw);
    for (let j = 0; j < nz; j++) rowZ.push(z0 + (j + 0.5) * cd);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = colX[i], z = rowZ[j];
      const r = Math.random();
      const w = cw - rnd(ALLEY[0], ALLEY[1]), d = cd - rnd(ALLEY[0], ALLEY[1]);
      // 가끔 빈 터 — 가운데 나무 한 그루 (주변은 차가 돌아 나갈 만큼 넓다)
      if (nx >= 3 && i === Math.floor(nx / 2) && r < 0.3) { trees.push([x, z, rnd(0.9, 1.25)]); continue; }
      if (kind === "shop") {
        const outerX = Math.abs(x - cx) / (W / 2) > Math.abs(z - cz) / (D / 2);
        addShop(x, z, w, d, outerX ? Math.sign(x - cx) : Math.sign(z - cz), outerX);
      } else if (kind === "house" || r < 0.68) addHouse(x, z, w, d);
      else addApt(x, z, w, d);
      // 벽에 붙은 나무 한두 그루 (벽에서 1.1m) — 양쪽에 있어도 골목은 4m 넘게 남는다
      const n = kind === "shop" ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const side = (Math.random() * 4) | 0;
        const along = rnd(-0.35, 0.35);
        const tx = side < 2 ? x + (side ? 1 : -1) * (w / 2 + 1.1) : x + along * w;
        const tz = side < 2 ? z + along * d : z + (side === 3 ? 1 : -1) * (d / 2 + 1.1);
        (Math.random() < 0.14 ? blossoms : trees).push([tx, tz, rnd(0.75, 1.05)]);
      }
    }
    // 가로수: 건물 정면 앞에만 (골목 입구는 비운다)
    for (const x of colX) for (const z of [z0 - 1.5, z1 + 1.5]) trees.push([x + rnd(-3, 3), z, rnd(0.8, 1)]);
    for (const z of rowZ) for (const x of [x0 - 1.5, x1 + 1.5]) trees.push([x, z + rnd(-3, 3), rnd(0.8, 1)]);
  }

  for (const [l, t, r, b, kind] of BLOCKS) {
    const x0 = wx(l) + ROAD_W / 2, x1 = wx(r) - ROAD_W / 2, z0 = wz(t) + ROAD_W / 2, z1 = wz(b) - ROAD_W / 2;
    G.add(roundPlate(x0, z0, x1, z1, 6, 0.08, pavM, 6));
    const ix0 = x0 + SIDEWALK, ix1 = x1 - SIDEWALK, iz0 = z0 + SIDEWALK, iz1 = z1 - SIDEWALK;
    if (kind !== "plaza") G.add(roundPlate(ix0, iz0, ix1, iz1, 4, 0.15, lawnM, 26));
    const fx0 = ix0 + 3.5, fx1 = ix1 - 3.5, fz0 = iz0 + 3.5, fz1 = iz1 - 3.5;
    if (kind === "school") buildSchool(G, fx0, fz0, fx1, fz1, updaters, { trees, blossoms, addBox, addCircle });
    else if (kind === "lake") buildLake(G, fx0, fz0, fx1, fz1, updaters, { trees, willows, blossoms, addCircle, addBox });
    else if (kind === "plaza") buildPlaza(G, ix0, iz0, ix1, iz1, updaters, { trees, blossoms, addCircle, addBox });
    else if (kind === "police") buildPolice(G, fx0, fz0, fx1, fz1, { trees, blossoms, addBox, addCircle });
    else fillBlock(fx0, fz0, fx1, fz1, kind);
  }

  /* 건물 인스턴스 올리기 */
  for (const [m, list] of batches.boxes) {
    const im = new THREE.InstancedMesh(baseBox, m, list.length);
    list.forEach((x, i) => im.setMatrixAt(i, x)); im.castShadow = true; im.receiveShadow = true; G.add(im);
  }
  for (const [m, list] of batches.roofs) {
    const im = new THREE.InstancedMesh(gable, m, list.length);
    list.forEach((x, i) => im.setMatrixAt(i, x)); im.castShadow = true; G.add(im);
  }
  void flatRoofGeo; void instW;

  /* --- 맵 끝 테두리: 빨강·하양 줄무늬 낮은 담 (BOUNDS 와 같은 자리, 여기서 막힌다) --- */
  {
    const c = document.createElement("canvas"); c.width = 256; c.height = 32;
    const g = c.getContext("2d");
    for (let i = -2; i < 12; i++) { g.fillStyle = i % 2 ? "#ffffff" : "#e2382f"; g.beginPath(); g.moveTo(i * 32, 32); g.lineTo(i * 32 + 32, 32); g.lineTo(i * 32 + 48, 0); g.lineTo(i * 32 + 16, 0); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
    const H = 1.7, T = 1.4;
    const wallM = new THREE.MeshLambertMaterial({ color: "#d8d6d0" });
    const B = BOUNDS;
    const runs = [[B.x0, B.z0, B.x1, B.z0], [B.x0, B.z1, B.x1, B.z1], [B.x0, B.z0, B.x0, B.z1], [B.x1, B.z0, B.x1, B.z1]];
    for (const [ax, az, bx, bz] of runs) {
      const L = Math.hypot(bx - ax, bz - az) + T, horiz = az === bz;
      const base = new THREE.Mesh(new THREE.BoxGeometry(horiz ? L : T, H, horiz ? T : L), wallM);
      base.position.set((ax + bx) / 2, H / 2, (az + bz) / 2); base.castShadow = true; base.receiveShadow = true; G.add(base);
      const st = t.clone(); st.needsUpdate = true; st.repeat.set(L / 8, 1);
      const band = new THREE.Mesh(new THREE.BoxGeometry(horiz ? L : T + 0.08, 0.7, horiz ? T + 0.08 : L), new THREE.MeshBasicMaterial({ map: st }));
      band.position.set((ax + bx) / 2, H - 0.35, (az + bz) / 2); G.add(band);
    }
  }

  /* --- 맵 바깥 나무·언덕 --- */
  for (let x = wx(30) - 24; x < wx(1345) + 26; x += 24) {
    trees.push([x + rnd(-3, 3), wz(95) - 12 + rnd(-1.5, 1.5), rnd(1, 1.35)]);     // 위쪽: 길 바깥 12m — 담까지 약 22m 비움 (아래쪽과 같게)
    trees.push([x + rnd(-3, 3), wz(1080) + 25 + rnd(-3, 4), rnd(1, 1.3)]);
  }
  for (let z = wz(95) - 24; z < wz(1080) + 24; z += 24) {
    trees.push([wx(30) - 12 + rnd(-1.5, 1.5), z + rnd(-3, 3), rnd(1, 1.35)]);       // 왼쪽·오른쪽도 마찬가지
    trees.push([wx(1345) + 12 + rnd(-1.5, 1.5), z + rnd(-3, 3), rnd(1, 1.35)]);
  }
  const hillM = mat({ color: "#7fb84c" });
  const hillTopM = mat({ color: "#8fc65a" });
  const hillSpec = [[-360, 150, 54], [-120, 190, 70], [130, 170, 60], [370, 165, 64], [-540, 120, 40], [560, 130, 46]];
  for (const [x, r, h] of hillSpec) {
    const g = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const m = new THREE.Mesh(g, x % 2 ? hillM : hillTopM);
    m.scale.set(r, h, r * 0.62); m.position.set(x, -0.5, BOUNDS.z0 - r * 0.6 - 2); G.add(m);
  }
  // 동·서·남쪽 먼 산 — 땅끝이 안 보이게
  const farM = mat({ color: "#91c868" });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, R = 900 + rnd(-40, 80);
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), farM);
    m.scale.set(rnd(180, 300), rnd(70, 130), rnd(180, 300)); m.position.set(Math.cos(a) * R, -1, Math.sin(a) * R); G.add(m);
  }

  /* 나무 인스턴스 + 부딪힘 */
  const trunkM = mat({ color: "#7b5a3a" });
  const makeCrown = (hexes) => {
    const parts = [];
    // 나무가 많으니 면을 아낀다 — 큰 덩어리만 세분화 (휴대폰 대비)
    const add = (r, x, y, z, hex) => { const g = new THREE.IcosahedronGeometry(r, r > 2 ? 1 : 0); g.translate(x, y, z); parts.push(colored(g, hex)); };
    add(2.3, 0, 5.1, 0, hexes[0]); add(1.6, 1.3, 4.5, 0.5, hexes[1]); add(1.5, -1.2, 4.4, -0.5, hexes[1]); add(1.4, 0.2, 6.5, 0.2, hexes[2]);
    return merged(parts);
  };
  const crownG = makeCrown(["#5ea93c", "#6fbb48", "#83cc58"]);
  const blossomG = makeCrown(["#f3a9c6", "#f8bfd5", "#fcd5e4"]);
  const trunkG = new THREE.CylinderGeometry(0.26, 0.38, 3.4, 7); trunkG.translate(0, 1.7, 0);
  const crownM = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const addTrees = (list, crown, solid = true) => {
    if (!list.length) return;
    const a = new THREE.InstancedMesh(trunkG, trunkM, list.length), b = new THREE.InstancedMesh(crown, crownM, list.length);
    list.forEach(([x, z, s], i) => {
      const m = m4(x, 0.05, z, s, s, s, rnd(0, 6.28)); a.setMatrixAt(i, m); b.setMatrixAt(i, m);
      if (solid) addCircle(x, z, 0.55 * s, true);
    });
    a.castShadow = b.castShadow = true; G.add(a, b);
  };
  addTrees(trees, crownG); addTrees(blossoms, blossomG);
  /* 수양버들 (호수) */
  if (willows.length) {
    const parts = [];
    const add = (r, x, y, z, hex) => { const g = new THREE.IcosahedronGeometry(r, 1); g.scale(1, 1.3, 1); g.translate(x, y, z); parts.push(colored(g, hex)); };
    add(2.2, 0, 5.4, 0, "#a8cf4f"); add(1.5, 1.5, 3.8, 0, "#b7da5e"); add(1.5, -1.5, 3.8, 0, "#9ec548"); add(1.5, 0, 3.8, 1.5, "#b7da5e"); add(1.5, 0, 3.8, -1.5, "#9ec548");
    addTrees(willows, merged(parts));
  }

  /* --- 신호등 ---
     차 신호등은 언제나 빨간불, 보행자 신호등은 언제나 초록불 */
  buildSignals(G, crosswalks);

  /* 가로등 */
  const lampG = merged([box(0.16, 6, 0.16, 0, 3, 0), box(1.4, 0.12, 0.12, 0.7, 6, 0), box(0.5, 0.16, 0.28, 1.4, 5.92, 0)]);
  const lampList = [];
  for (const c of crossings) for (const [sx, sz] of [[1, 1], [-1, -1]]) lampList.push([c.x + sx * (ROAD_W / 2 + 22), c.z + sz * (ROAD_W / 2 + 1.5), sx > 0 ? Math.PI : 0]);
  const lampIM = new THREE.InstancedMesh(lampG, mat({ color: "#59606a" }), lampList.length);
  lampList.forEach(([x, z, ry], i) => lampIM.setMatrixAt(i, m4(x, 0, z, 1, 1, 1, ry)));
  lampIM.castShadow = true; G.add(lampIM);
  void bushes; void lamps;

  buildNav();

  return {
    update(dt, t) { for (const u of updaters) u(dt, t); },
    spawn: { x: wx(685), z: wz(620 - 165 - 80), heading: 0 },
    roadPoints: crossings.map(c => ({ x: c.x, z: c.z })),
  };
}

/* ---------- 신호등 ---------- */
function buildSignals(G, crosswalks) {
  const poleM = new THREE.MeshLambertMaterial({ color: "#3b4149" });
  const houseM = new THREE.MeshLambertMaterial({ color: "#23262b" });
  const redOn = new THREE.MeshBasicMaterial({ color: "#ff2b1f" });
  const off = new THREE.MeshLambertMaterial({ color: "#3c3f45" });
  const greenOn = new THREE.MeshBasicMaterial({ color: "#2fe06b" });

  const pole = new THREE.CylinderGeometry(0.13, 0.17, 6.4, 8); pole.translate(0, 3.2, 0);
  const arm = new THREE.BoxGeometry(5.6, 0.14, 0.14); arm.translate(2.8, 6.2, 0);
  const poleG = mergeGeometries([pole, arm]);
  const headG = new THREE.BoxGeometry(2.1, 0.8, 0.36); headG.translate(5.1, 6.0, 0);
  const lamp = new THREE.CircleGeometry(0.29, 14);
  const pedPole = new THREE.CylinderGeometry(0.08, 0.1, 3, 8); pedPole.translate(0, 1.5, 0);
  const pedBox = new THREE.BoxGeometry(0.55, 1.1, 0.3); pedBox.translate(0, 3.1, 0);

  const n = crosswalks.length;
  const imPole = new THREE.InstancedMesh(poleG, poleM, n), imHead = new THREE.InstancedMesh(headG, houseM, n);
  const imRed = new THREE.InstancedMesh(lamp, redOn, n), imOff = new THREE.InstancedMesh(lamp, off, n * 2);
  const imPedPole = new THREE.InstancedMesh(pedPole, poleM, n), imPedBox = new THREE.InstancedMesh(pedBox, houseM, n);
  // 보행자 초록불 — 걷는 사람 그림
  const manTex = (() => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 96; const g = c.getContext("2d");
    g.fillStyle = "#07170d"; g.fillRect(0, 0, 64, 96);
    g.fillStyle = "#3bf07a"; g.beginPath(); g.arc(32, 22, 9, 0, 7); g.fill();
    g.lineWidth = 9; g.strokeStyle = "#3bf07a"; g.lineCap = "round";
    g.beginPath(); g.moveTo(32, 34); g.lineTo(32, 58); g.lineTo(20, 82); g.moveTo(32, 58); g.lineTo(46, 80); g.moveTo(32, 40); g.lineTo(18, 54); g.moveTo(32, 40); g.lineTo(46, 52); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const imMan = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.46, 0.92), new THREE.MeshBasicMaterial({ map: manTex }), n);
  void greenOn;

  const q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), mm = new THREE.Matrix4();
  crosswalks.forEach((w, i) => {
    // 차가 오는 쪽을 본다: 차는 교차로로 들어오니 (dx,dz) 쪽에서 교차로를 향해 온다
    // 기둥은 오른쪽 보도에 세우고 팔을 길 위로 뻗는다
    const dx = w.dx, dz = w.dz;
    const side = ROAD_W / 2 + 1.4;
    const px = w.x + (dx !== 0 ? dx * 3 : -dz * side), pz = w.z + (dz !== 0 ? dz * 3 : dx * side);
    // 팔 방향(+x 로컬)이 길 가운데를 향하게
    const armDir = dx !== 0 ? (dx > 0 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 0, 1)) : (dz > 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-1, 0, 0));
    const ry = Math.atan2(-armDir.z, armDir.x);
    q.setFromAxisAngle(up, ry);
    v.set(px, 0, pz);
    mm.compose(v, q, s); imPole.setMatrixAt(i, mm); imHead.setMatrixAt(i, mm);
    // 불 세 개 — 맨 왼쪽만 빨강. 달려오는 운전자 쪽 면(dx,dz)에 붙인다
    const face = new THREE.Vector3(dx, 0, dz);
    const lq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), face);
    for (let k = 0; k < 3; k++) {
      const lx = px + armDir.x * (5.1 + (k - 1) * 0.68) + dx * 0.19, lz = pz + armDir.z * (5.1 + (k - 1) * 0.68) + dz * 0.19;
      v.set(lx, 6.0, lz); mm.compose(v, lq, s);
      if (k === 1) imRed.setMatrixAt(i, mm); else imOff.setMatrixAt(i * 2 + (k ? 1 : 0), mm);
    }
    // 보행자 신호등: 횡단보도 끝, 건너는 사람을 본다
    const ex = w.x + (dx !== 0 ? 0 : dz * (ROAD_W / 2 + 1)), ez = w.z + (dz !== 0 ? 0 : -dx * (ROAD_W / 2 + 1));
    v.set(ex, 0, ez); q.identity(); mm.compose(v, q, s); imPedPole.setMatrixAt(i, mm);
    const toRoad = new THREE.Vector3(w.x - ex, 0, w.z - ez).normalize();
    const pq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), toRoad);
    mm.compose(v, pq, s); imPedBox.setMatrixAt(i, mm);
    v.set(ex + toRoad.x * 0.17, 3.1, ez + toRoad.z * 0.17); mm.compose(v, pq, s); imMan.setMatrixAt(i, mm);
  });
  imRed.count = n;
  for (const im of [imPole, imHead, imPedPole, imPedBox]) { im.castShadow = true; }
  G.add(imPole, imHead, imRed, imOff, imPedPole, imPedBox, imMan);
}

/* ---------- 학교: 위쪽 벽돌 본관·시계탑, 아래 모래 운동장 ---------- */
function buildSchool(G, x0, z0, x1, z1, updaters, api) {
  const W = x1 - x0, D = z1 - z0;
  const bH = 15, bD = 20, bW = W * 0.8;
  const bx = x0 + W * 0.46, bz = z0 + bD / 2 + 8;
  const wall = new THREE.MeshLambertMaterial({ map: T.brick(14, 3) });
  const side = new THREE.MeshLambertMaterial({ map: T.brick(4, 3) });
  const top = new THREE.MeshLambertMaterial({ color: "#d6d3c8" });
  const body = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bD), [side, side, top, top, wall, wall]);
  body.position.set(bx, bH / 2, bz); body.castShadow = true; G.add(body);
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(bW + 1, 0.8, bD + 1), new THREE.MeshLambertMaterial({ color: "#efe7da" }));
  parapet.position.set(bx, bH + 0.3, bz); G.add(parapet);
  api.addBox(bx - bW / 2, bz - bD / 2, bx + bW / 2, bz + bD / 2);
  // 시계탑 + 현관
  const tower = new THREE.Mesh(new THREE.BoxGeometry(10, 25, 8), new THREE.MeshLambertMaterial({ color: "#d39a78" }));
  tower.position.set(bx, 12.5, bz + bD / 2 + 2); tower.castShadow = true; G.add(tower);
  const tcap = new THREE.Mesh(new THREE.BoxGeometry(11, 1, 9), new THREE.MeshLambertMaterial({ color: "#efe7da" }));
  tcap.position.set(bx, 25.4, bz + bD / 2 + 2); G.add(tcap);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), new THREE.MeshBasicMaterial({ map: T.clockFace(), transparent: true }));
  clock.position.set(bx, 21, bz + bD / 2 + 6.05); G.add(clock);
  const door = new THREE.Mesh(new THREE.BoxGeometry(7, 4.6, 0.3), new THREE.MeshLambertMaterial({ color: "#5e8fa8" }));
  door.position.set(bx, 2.3, bz + bD / 2 + 6.1); G.add(door);
  api.addBox(bx - 5, bz + bD / 2, bx + 5, bz + bD / 2 + 6);

  // 운동장
  const fz0 = bz + bD / 2 + 14, fz1 = z1 - 4, fx0 = x0 + 8, fx1 = x0 + W * 0.84;
  const sandM = new THREE.MeshLambertMaterial({ map: T.sand() });
  G.add(flat(fx0, fz0, fx1, fz1, 0.22, sandM, 18));
  const lines = new THREE.Mesh(new THREE.PlaneGeometry(fx1 - fx0 - 4, fz1 - fz0 - 4), new THREE.MeshBasicMaterial({ map: T.fieldLines(), transparent: true, depthWrite: false }));
  lines.rotation.x = -Math.PI / 2; lines.position.set((fx0 + fx1) / 2, 0.29, (fz0 + fz1) / 2); G.add(lines);
  // 축구 골대 (양 끝) — 차가 지나가면 그냥 통과하는 건 어색하니 기둥만 부딪힘
  const goalM = new THREE.MeshLambertMaterial({ color: "#f5f5f5" });
  const midZ = (fz0 + fz1) / 2;
  for (const gx of [fx0 + 3, fx1 - 3]) {
    const g = new THREE.Group();
    for (const dz of [-4, 4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), goalM); p.position.set(0, 1.3, dz); g.add(p); api.addCircle(gx, midZ + dz, 0.35); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 8.2), goalM); bar.position.y = 2.6; g.add(bar);
    g.position.set(gx, 0, midZ); G.add(g);
  }
  // 울타리 낮게 (보이기만) + 벚꽃·나무
  const fenceM = new THREE.MeshLambertMaterial({ color: "#6f8f6a", transparent: true, opacity: 0.55 });
  const fence = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, d), fenceM); m.position.set(x, 1.3, z); G.add(m); };
  fence((fx0 + fx1) / 2, fz1 + 0.8, fx1 - fx0, 0.08);
  fence(fx0 - 0.8, (fz0 + fz1) / 2 + (fz1 - fz0) * 0.2, 0.08, (fz1 - fz0) * 0.6);
  for (let x = fx0 + 6; x < fx1; x += 17) api.blossoms.push([x + rnd(-2, 2), fz1 + 3.2, rnd(0.9, 1.2)]);
  for (let z = fz0; z < fz1; z += 16) api.trees.push([fx1 + 4 + rnd(-1, 1), z, rnd(0.9, 1.2)]);
  // 오른쪽 위 작은 건물 (레퍼런스의 학교 옆 주택)
  for (const [hx, hz, c] of [[x1 - 14, z0 + 16, "#d9402f"], [x1 - 14, z0 + 44, "#2e9c6b"], [x1 - 13, z1 - 30, "#39a7b5"]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 14), new THREE.MeshLambertMaterial({ map: T.windows("#fbf3e3", "#fff", "#7cc1e2", 3, 2) }));
    b.position.set(hx, 4, hz); b.castShadow = true; G.add(b);
    const r = new THREE.Mesh(new THREE.ConeGeometry(11, 4.5, 4), new THREE.MeshLambertMaterial({ color: c })); r.rotation.y = Math.PI / 4; r.position.set(hx, 10.2, hz); r.castShadow = true; G.add(r);
    api.addBox(hx - 7, hz - 7, hx + 7, hz + 7);
  }
  void updaters;
}

/* ---------- 호수: 물 + 정자 + 산책로 + 수양버들 + 연잎 ---------- */
function buildLake(G, x0, z0, x1, z1, updaters, api) {
  const tex = T.water();
  const waterM = new THREE.MeshLambertMaterial({ map: tex, color: "#ffffff" });
  const shoreM = new THREE.MeshLambertMaterial({ color: "#d7c8a7" });
  const pathM = new THREE.MeshLambertMaterial({ color: "#e9c9c4" });
  const layer = (grow, y, m) => {
    for (const b of lakeBlobs) {
      const g = new THREE.CircleGeometry(1, 48); g.rotateX(-Math.PI / 2);
      const me = new THREE.Mesh(g, m);
      me.scale.set(b.rx + grow, 1, b.rz + grow); me.position.set(b.x, y, b.z); me.receiveShadow = true; G.add(me);
    }
  };
  layer(8, 0.22, pathM);    // 산책로
  layer(3, 0.29, shoreM);   // 물가
  // 물은 평면 하나가 아니라 타원 묶음 — 겹치는 곳도 같은 높이라 무늬가 어긋나지 않게 월드 UV
  for (const b of lakeBlobs) {
    const g = new THREE.CircleGeometry(1, 48); g.scale(b.rx, b.rz, 1); g.rotateX(-Math.PI / 2); g.translate(b.x, 0.36, b.z);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 30, p.getZ(i) / 30);
    G.add(new THREE.Mesh(g, waterM));
  }
  updaters.push((dt) => { tex.offset.x += dt * 0.012; tex.offset.y += dt * 0.007; });

  // 정자 + 데크 (레퍼런스의 왼쪽 아래)
  const gx = wx(1035), gz = wz(325);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.5, 8), new THREE.MeshLambertMaterial({ color: "#a97c52" }));
  deck.position.set(gx, 0.42, gz); deck.castShadow = true; deck.receiveShadow = true; G.add(deck);
  const pier = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 4), new THREE.MeshLambertMaterial({ color: "#a97c52" }));
  pier.position.set(gx - 16, 0.34, gz + 8); G.add(pier);
  const pillarM = new THREE.MeshLambertMaterial({ color: "#6e4a30" });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 8), pillarM);
    p.position.set(gx + Math.cos(a) * 5, 2.5, gz + Math.sin(a) * 5); p.castShadow = true; G.add(p);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(8.2, 3.4, 6), new THREE.MeshLambertMaterial({ color: "#4a4f58", flatShading: true }));
  roof.position.set(gx, 6.2, gz); roof.castShadow = true; G.add(roof);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.3, 6), new THREE.MeshLambertMaterial({ color: "#5d636e", flatShading: true })); cap.position.set(gx, 8.3, gz); G.add(cap);
  api.addCircle(gx, gz, 8.6);

  // 연잎
  const padM = new THREE.MeshLambertMaterial({ color: "#6fbd55" });
  const padG = new THREE.CircleGeometry(1.1, 12, 0.3, 5.7); padG.rotateX(-Math.PI / 2);
  const pads = new THREE.InstancedMesh(padG, padM, 26);
  const mm = new THREE.Matrix4();
  for (let i = 0; i < 26; i++) {
    const x = wx(1215) + rnd(-26, 26), z = wz(335) + rnd(-12, 12);
    const s = rnd(0.7, 1.5);
    mm.compose(new THREE.Vector3(x, 0.42, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd(0, 6.28)), new THREE.Vector3(s, 1, s));
    pads.setMatrixAt(i, mm);
  }
  G.add(pads);

  // 둘레 수양버들·벚꽃 (물속 제외)
  for (let i = 0; i < 46; i++) {
    const b = lakeBlobs[i % 3], a = rnd(0, 6.28), k = 1 + 11 / Math.min(b.rx, b.rz);
    const x = b.x + Math.cos(a) * b.rx * k, z = b.z + Math.sin(a) * b.rz * k;
    if (inWater(x, z) || x < x0 || x > x1 || z < z0 || z > z1) continue;
    (Math.random() < 0.75 ? api.willows : api.blossoms).push([x, z, rnd(1, 1.45)]);
  }
  for (let i = 0; i < 26; i++) {
    const x = rnd(x0, x1), z = rnd(z0, z1);
    if (inWater(x, z)) continue;
    let near = false; for (const b of lakeBlobs) { const dx = (x - b.x) / (b.rx + 9), dz = (z - b.z) / (b.rz + 9); if (dx * dx + dz * dz < 1) near = true; }
    if (!near) api.trees.push([x, z, rnd(0.9, 1.3)]);
  }
}

/* ---------- 분수 광장 ---------- */
function buildPlaza(G, x0, z0, x1, z1, updaters, api) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2 + 8;
  const plazaM = new THREE.MeshLambertMaterial({ map: T.plaza() });
  G.add(roundPlate(x0, z0, x1, z1, 4, 0.15, plazaM, 24));
  const R = Math.min(x1 - x0, z1 - z0) * 0.46;
  const ring = new THREE.Mesh(new THREE.CircleGeometry(R, 64), new THREE.MeshLambertMaterial({ map: T.plazaRings(), transparent: true }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(cx, 0.22, cz); ring.receiveShadow = true; G.add(ring);

  // 분수
  const stone = new THREE.MeshLambertMaterial({ color: "#efece6" });
  /* 분수 둘레 원형 점프대 (2026-11-08 사용자 요청 — 분수대를 날아서 넘어다니게).
     바깥 22.5m 에서 꼭대기 15m 까지 2.4m 오르고, 안쪽 10m 까지 다시 내려가는 둥근 둔덕.
     분수 쪽으로 달려 꼭대기를 넘으면 떠서 가운데 탑 위로 넘어간다. 느려서 못 넘으면 물웅덩이에 떨어지고,
     안쪽 경사를 타고 다시 나올 수 있다 (나오면서 또 뜬다) */
  const jr = { ring: true, x: cx, z: cz, rOut: 22.5, rTop: 15, rIn: 10, h: 2.4 };
  RAMPS.push(jr);
  const stripes = (() => {
    const c = document.createElement("canvas"); c.width = 128; c.height = 64; const g = c.getContext("2d");
    g.fillStyle = "#f4c21f"; g.fillRect(0, 0, 128, 64); g.fillStyle = "#1d1f24";
    for (let i = -1; i < 5; i++) { g.beginPath(); g.moveTo(i * 32, 64); g.lineTo(i * 32 + 16, 64); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 16, 0); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(36, 1); return t;
  })();
  const prof = [new THREE.Vector2(jr.rIn - 0.4, 0.2), new THREE.Vector2(jr.rTop, jr.h + 0.2), new THREE.Vector2(jr.rOut, 0.2)];
  const ringMesh = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), new THREE.MeshLambertMaterial({ map: stripes, side: THREE.DoubleSide }));
  ringMesh.position.set(cx, 0, cz); ringMesh.receiveShadow = true; ringMesh.castShadow = true; G.add(ringMesh);
  const wTex = T.water();
  const pool = new THREE.Mesh(new THREE.CircleGeometry(jr.rIn, 48), new THREE.MeshLambertMaterial({ map: wTex }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(cx, 0.26, cz); G.add(pool);
  // 가운데 탑은 낮고 가늘게 — 차 앞이 먼저 닿지 않게 (반지름 4.2, 높이 3.2)
  const tier = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 2.0, 28), stone); tier.position.set(cx, 1.0, cz); tier.castShadow = true; G.add(tier);
  const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 1.2, 18), stone); tier2.position.set(cx, 2.6, cz); tier2.castShadow = true; G.add(tier2);
  api.addCircle(cx, cz, 4.2, false, false, 3.2);        // 가운데 탑 — 3.2m 보다 높이 날면 넘어간다
  // 물줄기 — 작은 입자 300 개
  const N = 620;
  const dropG = new THREE.IcosahedronGeometry(0.24, 0);
  const drops = new THREE.InstancedMesh(dropG, new THREE.MeshBasicMaterial({ color: "#e8f7ff" }), N);
  const st = [];
  const jets = [[0, 0, 15, 0], [0, 0, 15, 0], [0, 0, 14, 0]];
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; jets.push([Math.cos(a) * 2.6, Math.sin(a) * 2.6, 8, 1]); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; jets.push([Math.cos(a) * 8.5, Math.sin(a) * 8.5, 4.6, 2]); }
  for (let i = 0; i < N; i++) st.push({ j: jets[i % jets.length], t: Math.random() * 2.2 });
  const m = new THREE.Matrix4(), sv = new THREE.Vector3(1, 1, 1), qu = new THREE.Quaternion(), pv = new THREE.Vector3();
  drops.frustumCulled = false;
  updaters.push((dt) => {
    wTex.offset.x += dt * 0.05;
    for (let i = 0; i < N; i++) {
      const s = st[i]; s.t += dt;
      const j = s.j, vy = j[2], life = vy * 2 / 9.8 + 0.2;
      if (s.t > life) { s.t = 0; s.ox = (Math.random() - 0.5) * 0.9; s.oz = (Math.random() - 0.5) * 0.9; }
      const t = s.t, y = (j[3] === 0 ? 3.2 : j[3] === 1 ? 2.0 : 0.3) + vy * t - 4.9 * t * t;
      pv.set(cx + j[0] + (s.ox || 0) * t + (j[3] === 1 ? j[0] * t * 0.3 : 0), Math.max(0.3, y), cz + j[1] + (s.oz || 0) * t + (j[3] === 1 ? j[1] * t * 0.3 : 0));
      m.compose(pv, qu, sv); drops.setMatrixAt(i, m);
    }
    drops.instanceMatrix.needsUpdate = true;
  });
  G.add(drops);

  // 벤치 — 원 둘레
  const benchG = merged([box(3.2, 0.14, 0.9, 0, 0.72, 0), box(3.2, 0.7, 0.14, 0, 1.08, -0.42), box(0.16, 0.7, 0.8, -1.3, 0.36, 0), box(0.16, 0.7, 0.8, 1.3, 0.36, 0)]);
  const benchIM = new THREE.InstancedMesh(benchG, new THREE.MeshLambertMaterial({ color: "#a06b3f" }), 10);
  const mm = new THREE.Matrix4();
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 + 0.3, r = 33;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    mm.compose(new THREE.Vector3(x, 0.1, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2 + Math.PI), new THREE.Vector3(1, 1, 1));
    benchIM.setMatrixAt(i, mm);
    api.addCircle(x, z, 1.5, true);
  }
  benchIM.castShadow = true; G.add(benchIM);

  // 파고라 (위쪽)
  const px = cx + 28, pz = z0 + 22;
  const wood = new THREE.MeshLambertMaterial({ color: "#7c5233" });
  const roofM = new THREE.MeshLambertMaterial({ color: "#8b9aa5", transparent: true, opacity: 0.85 });
  for (const dx of [-9, -3, 3, 9]) for (const dz of [-3, 3]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.4, 0.5), wood); p.position.set(px + dx, 2.2, pz + dz); p.castShadow = true; G.add(p);
    api.addCircle(px + dx, pz + dz, 0.45);
  }
  const prf = new THREE.Mesh(new THREE.BoxGeometry(20, 0.35, 8.4), roofM); prf.position.set(px, 4.6, pz); prf.rotation.z = -0.03; prf.castShadow = true; G.add(prf);

  // 나무 — 네 모서리 쪽으로 빙 둘러서
  const n = 46;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + rnd(-0.05, 0.05), rr = R * rnd(0.95, 1.25);
    let x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    x = Math.max(x0 + 3, Math.min(x1 - 3, x)); z = Math.max(z0 + 3, Math.min(z1 - 3, z));
    if (Math.abs(x - cx) < 12 && Math.abs(z - cz) > R * 0.7) continue; // 앞뒤 입구는 비운다
    if (Math.abs(z - cz) < 12 && Math.abs(x - cx) > R * 0.7) continue;
    (i % 3 === 0 ? api.blossoms : api.trees).push([x, z, rnd(1, 1.35)]);
  }
}

/* ---------- 경찰서 ---------- */
function buildPolice(G, x0, z0, x1, z1, api) {
  const W = x1 - x0, D = z1 - z0;
  // 왼쪽 작은 상가
  const shopM = new THREE.MeshLambertMaterial({ map: T.windows("#d7cdbd", "#eee", "#6fb4d8", 4, 3) });
  for (const [sx, sz, w, d, h] of [[x0 + 18, z0 + 16, 24, 20, 13], [x0 + 16, z0 + 52, 20, 18, 9]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shopM); b.position.set(sx, h / 2, sz); b.castShadow = true; G.add(b);
    api.addBox(sx - w / 2, sz - d / 2, sx + w / 2, sz + d / 2);
  }
  // 본관
  const bx = x0 + W * 0.58, bz = z0 + D * 0.3, bw = W * 0.56, bd = D * 0.3, bh = 14;
  const wall = new THREE.MeshLambertMaterial({ map: T.windows("#ecebe6", "#c9ced4", "#5ea9cf", 12, 3) });
  const side = new THREE.MeshLambertMaterial({ map: T.windows("#ecebe6", "#c9ced4", "#5ea9cf", 4, 3) });
  const top = new THREE.MeshLambertMaterial({ color: "#c9cbc8" });
  const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), [side, side, top, top, wall, wall]);
  body.position.set(bx, bh / 2, bz); body.castShadow = true; G.add(body);
  api.addBox(bx - bw / 2, bz - bd / 2, bx + bw / 2, bz + bd / 2);
  // 가운데 튀어나온 현관 + 파란 간판
  const fz = bz + bd / 2;
  const portal = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.44, bh + 3, 7), new THREE.MeshLambertMaterial({ color: "#f3f2ee" }));
  portal.position.set(bx, (bh + 3) / 2, fz + 3.5); portal.castShadow = true; G.add(portal);
  api.addBox(bx - bw * 0.22, fz, bx + bw * 0.22, fz + 7);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.42, 5.4), new THREE.MeshBasicMaterial({ map: T.policeSign() }));
  sign.position.set(bx, bh - 1.6, fz + 7.05); G.add(sign);
  const entry = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.34, 4.6, 0.25), new THREE.MeshLambertMaterial({ color: "#3f6c8b" }));
  entry.position.set(bx, 2.3, fz + 7.1); G.add(entry);
  const awn = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.4, 0.4, 3.5), new THREE.MeshLambertMaterial({ color: "#1f3f93" }));
  awn.position.set(bx, 5.1, fz + 8.6); awn.castShadow = true; G.add(awn);
  // 깃대 두 개
  const flagTex = (draw) => { const c = document.createElement("canvas"); c.width = 128; c.height = 84; draw(c.getContext("2d")); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const blueFlag = flagTex(g => { g.fillStyle = "#1f3f93"; g.fillRect(0, 0, 128, 84); g.fillStyle = "#f6c52e"; g.font = "900 58px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("★", 64, 44); });
  const krFlag = flagTex(g => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, 128, 84);
    g.fillStyle = "#cd2e3a"; g.beginPath(); g.arc(64, 42, 20, Math.PI * 1.15, Math.PI * 0.15); g.fill();
    g.fillStyle = "#0047a0"; g.beginPath(); g.arc(64, 42, 20, Math.PI * 0.15, Math.PI * 1.15); g.fill();
    g.fillStyle = "#222";
    for (const [x, y, r] of [[22, 18, -0.6], [106, 66, -0.6], [106, 18, 0.6], [22, 66, 0.6]]) { g.save(); g.translate(x, y); g.rotate(r); for (let i = -1; i <= 1; i++) g.fillRect(-11, i * 6 - 2, 22, 4); g.restore(); }
  });
  [[bx - 16, krFlag], [bx - 8, blueFlag]].forEach(([fx, tex]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 10, 8), new THREE.MeshLambertMaterial({ color: "#d0d3d8" }));
    pole.position.set(fx, bh + 5, bz - bd / 2 + 2); pole.castShadow = true; G.add(pole);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.8), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    f.position.set(fx + 2.2, bh + 8.4, bz - bd / 2 + 2); G.add(f);
  });
  // 주차장
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.9, D * 0.28), new THREE.MeshLambertMaterial({ color: "#8c9097" }));
  lot.rotation.x = -Math.PI / 2; lot.position.set(bx + 4, 0.22, fz + 14 + D * 0.14); lot.receiveShadow = true; G.add(lot);
  const linesG = [];
  for (let i = -4; i <= 4; i++) { const g = new THREE.PlaneGeometry(0.22, D * 0.1); g.rotateX(-Math.PI / 2); g.translate(bx + 4 + i * 8, 0.28, fz + 14 + D * 0.08); linesG.push(g); }
  G.add(new THREE.Mesh(merged(linesG), new THREE.MeshBasicMaterial({ color: "#f5f5f5" })));
  // 울타리 (앞쪽): 낮은 담 — 입구 비움
  const fenceM = new THREE.MeshLambertMaterial({ color: "#6d7d70" });
  const fy = z1 - 3;
  for (const [a, b] of [[x0 + W * 0.3, bx - 11], [bx + 15, x1 - 4]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b - a, 1.4, 0.4), fenceM); m.position.set((a + b) / 2, 0.8, fy); m.castShadow = true; G.add(m);
    api.addBox(a, fy - 0.4, b, fy + 0.4);
  }
  for (let x = x0 + W * 0.3; x < x1 - 4; x += 17) { if (Math.abs(x - bx - 2) > 16) api.trees.push([x, fy + 3, rnd(0.9, 1.15)]); }
  api.blossoms.push([x0 + W * 0.25, z0 + D * 0.5, 1.3], [x0 + 22, z1 - 30, 1.2], [x0 + 40, z1 - 12, 1.1]);
  for (let i = 0; i < 12; i++) api.trees.push([x0 + rnd(4, W * 0.26), z0 + rnd(72, D - 4), rnd(0.9, 1.25)]);
}
