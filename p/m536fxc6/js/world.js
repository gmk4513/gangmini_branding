/* 동네 — 참고 그림 "중앙 소실점의 파스텔 주택가"를 3D 로 옮긴다.

   바둑판 골목: 길(폭 R)이 L 간격으로 가로세로 놓이고, 그 사이 블록마다 집 네 채.
   "몇 칸 직진" 의 한 칸 = 교차로 하나 사이 (L).
   x 가 동쪽, z 가 남쪽, y 가 위. 북쪽으로 간다 = -z 방향.

   그리기 비용을 줄이려고, 색만 있는 물체(집·지붕·기둥…)는 꼭짓점 색으로 칠해 한 덩어리로 합치고
   (그리기 호출 1번), 창문·나무처럼 같은 모양이 많은 건 인스턴스로 그린다. */
import * as THREE from "../vendor/three.module.min.js";
import { mergeGeometries } from "../vendor/addons/utils/BufferGeometryUtils.js";
import * as T from "./textures.js";

export const L = 34;          // 교차로 간격 (한 칸)
export const R = 8;           // 길 폭
export const N = 7;           // 다닐 수 있는 길: 가로 0~6, 세로 0~6
const VIS = 2;                // 길 안내에 안 쓰는 바깥 길도 두 칸씩 더 있다 (자유롭게 돌아다닐 수 있음)
export const RAIL_Z = 2.5 * L; // 기찻길 (2번 길과 3번 길 사이)
const PLAYGROUND = [4, 3];    // 놀이터 블록 (4~5번 세로길, 3~4번 가로길 사이)
// 맵 끝 사각형 — 여기만 못 나간다 (바깥 길 끝 + 길 폭 반)
export const BOUNDS = { x0: -VIS * L - R / 2, x1: (N - 1 + VIS) * L + R / 2, z0: -VIS * L - R / 2, z1: (N - 1 + VIS) * L + R / 2 };
// 호수공원: 0번 가로길 북쪽, 3번 세로길 동쪽 전부 (맵 끝까지)
const PARK = { x0: 3 * L + R / 2, x1: BOUNDS.x1, z0: BOUNDS.z0, z1: -R / 2 };
export const GOAL = { x: 6 * L, z: -20 };   // 광장 가운데의 포탈
export const LAKE = { x: 6 * L - 6, z: -52, rx: 40, rz: 15 };

/* ---------------- 부딪힘 ----------------
   담장·집·기둥·나무 줄기를 바닥에 그린 사각형·원으로 들고 있다가, 스쿠터(원)가 겹치면 밖으로 밀어낸다.
   벽에 비스듬히 부딪히면 밀려나는 방향만 막히고 벽을 따라 미끄러진다 (박혀서 안 빠지는 일이 없다).
   10m 칸으로 나눠 두고 근처 칸만 본다 */
const COL = { boxes: [], circles: [], grid: new Map() };
const CELL = 10;
const colBox = (cx, cz, w, d, ry = 0) => {
  if (Math.abs(Math.sin(ry)) > 0.5) [w, d] = [d, w];
  COL.boxes.push([cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2]);
};
const colCircle = (x, z, r) => COL.circles.push([x, z, r]);
function indexColliders() {
  const put = (x0, z0, x1, z1, item) => {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = i * 4096 + j;
        if (!COL.grid.has(k)) COL.grid.set(k, []);
        COL.grid.get(k).push(item);
      }
  };
  COL.boxes.forEach(b => put(b[0], b[1], b[2], b[3], b));
  COL.circles.forEach(c => put(c[0] - c[2], c[1] - c[2], c[0] + c[2], c[1] + c[2], c));
}
/* (x,z) 반지름 r 인 원을 밀어낸 위치와, 밀린 방향(벽의 바깥쪽)을 돌려준다 */
export function collide(x, z, r) {
  let nx = 0, nz = 0, hit = false;
  for (let pass = 0; pass < 2; pass++) {
    const seen = new Set();
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const list = COL.grid.get(i * 4096 + j);
        if (!list) continue;
        for (const o of list) {
          if (seen.has(o)) continue;
          seen.add(o);
          let dx, dz, d, push;
          if (o.length === 4) {
            const px = Math.max(o[0], Math.min(x, o[2])), pz = Math.max(o[1], Math.min(z, o[3]));
            dx = x - px; dz = z - pz; d = Math.hypot(dx, dz);
            if (d >= r) continue;
            if (d < 1e-6) {   // 가운데가 상자 안 — 가장 얕은 쪽으로 뺀다
              const pen = [[x - o[0], -1, 0], [o[2] - x, 1, 0], [z - o[1], 0, -1], [o[3] - z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
              x += pen[1] * (pen[0] + r); z += pen[2] * (pen[0] + r);
              nx += pen[1]; nz += pen[2]; hit = true;
              continue;
            }
            push = r - d;
          } else {
            dx = x - o[0]; dz = z - o[1]; d = Math.hypot(dx, dz);
            if (d >= r + o[2] || d < 1e-6) continue;
            push = r + o[2] - d;
          }
          x += dx / d * push; z += dz / d * push; nx += dx / d; nz += dz / d; hit = true;
        }
      }
  }
  x = Math.max(BOUNDS.x0 + r, Math.min(BOUNDS.x1 - r, x));
  z = Math.max(BOUNDS.z0 + r, Math.min(BOUNDS.z1 - r, z));
  const n = Math.hypot(nx, nz) || 1;
  return { x, z, hit, nx: nx / n, nz: nz / n };
}
export function inWater(x, z) {
  const a = (x - LAKE.x) / LAKE.rx, b = (z - LAKE.z) / LAKE.rz;
  return a * a + b * b < 1;
}

export const sx = c => c * L;   // 세로길 c 의 x
export const sz = r => r * L;   // 가로길 r 의 z

const ROOF = ["#e2463c", "#2f6cd8", "#2fae66", "#f3b43a", "#a66bd8", "#ea6c9c", "#46c0c8", "#e2463c", "#2f6cd8"];

/* ---------------- 쌓는 도구 ---------------- */
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
function mat(x, y, z, ry = 0, sxv = 1, syv = 1, szv = 1, rx = 0, rz = 0) {
  tmpE.set(rx, ry, rz);
  return tmpM.clone().compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE), tmpS.set(sxv, syv, szv));
}
const col = h => new THREE.Color(h);

/* 색 칠한 물체 모음 → 메시 하나 + 외곽선 하나 */
class Solid {
  constructor() { this.geos = []; this.edges = []; }
  add(geo, color, m, edges = true, shade = null) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute("uv");
    g.applyMatrix4(m);
    const n = g.attributes.position.count, c = new Float32Array(n * 3), cc = col(color);
    const pos = g.attributes.position;
    for (let i = 0; i < n; i++) {
      let k = 1;
      if (shade) k = shade(pos.getX(i), pos.getY(i), pos.getZ(i));
      c[i * 3] = cc.r * k; c[i * 3 + 1] = cc.g * k; c[i * 3 + 2] = cc.b * k;
    }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    this.geos.push(g);
    if (edges) this.edges.push(new THREE.EdgesGeometry(g, 25));
    return g;
  }
  box(w, h, d, x, y, z, color, ry = 0, edges = true) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, mat(x, y + h / 2, z, ry), edges);
  }
  build(material, edgeMat) {
    const out = new THREE.Group();
    if (!this.geos.length) return out;
    const mesh = new THREE.Mesh(mergeGeometries(this.geos), material);
    mesh.castShadow = mesh.receiveShadow = true;
    out.add(mesh);
    if (edgeMat && this.edges.length) out.add(new THREE.LineSegments(mergeGeometries(this.edges), edgeMat));
    return out;
  }
}

/* 그림(텍스처) 입힌 물체 모음 — 텍스처가 실제 크기(tile m)마다 반복되게 UV 를 다시 잡는다 */
class Skinned {
  constructor(material, tile) { this.geos = []; this.material = material; this.tile = tile; }
  box(w, h, d, x, y, z, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv, t = this.tile;
    // 면 순서: +x, -x, +y, -y, +z, -z (각 4점)
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / t, uv.getY(i) * dims[f][1] / t);
    }
    g.applyMatrix4(mat(x, y + h / 2, z, ry));
    this.geos.push(g.toNonIndexed());
  }
  build(shadow = true) {
    const mesh = new THREE.Mesh(mergeGeometries(this.geos), this.material);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    return mesh;
  }
}

/* 모임지붕 — 참고 그림의 집들. w 쪽이 길면 용마루가 x 방향 */
function hipRoof(w, d, h) {
  const swap = d > w;
  if (swap) [w, d] = [d, w];
  const a = [-w / 2, 0, -d / 2], b = [w / 2, 0, -d / 2], c = [w / 2, 0, d / 2], dd = [-w / 2, 0, d / 2];
  const p = [-(w - d) / 2, h, 0], q = [(w - d) / 2, h, 0];
  const tris = [dd, c, q, dd, q, p, b, a, p, b, p, q, a, dd, p, c, b, q, a, b, c, a, c, dd];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  if (swap) g.rotateY(Math.PI / 2);
  return g;
}

/* 울퉁불퉁한 덤불 공 (나무 잎·생울타리) */
function lumpy(r, detail, seed, amp = 0.18) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position, rand = T.rng(seed), v = new THREE.Vector3();
  const bumps = Array.from({ length: 7 }, () => new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize());
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let k = 0;
    for (const bb of bumps) k += Math.max(0, v.dot(bb)) ** 3;
    v.multiplyScalar(r * (1 + amp * (k - 0.4)));
    if (v.y < -r * 0.35) v.y = -r * 0.35 + (v.y + r * 0.35) * 0.3; // 밑은 납작하게
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/* 나무 모양 하나를 꼭짓점 색 포함 한 덩어리로 */
function treeGeo(kind, seed) {
  const s = new Solid();
  const up = (lo, hi) => (x, y) => lo + (hi - lo) * Math.min(1, Math.max(0, y));
  if (kind === "cypress") {   // 측백나무: 짙은 녹색 원뿔을 겹쳐 쌓는다
    s.add(new THREE.CylinderGeometry(0.12, 0.16, 1, 6), "#7a5232", mat(0, 0.5, 0), false);
    const H = 5.2;
    [[1.15, 2.6, 1.4], [0.95, 2.4, 2.6], [0.7, 2.1, 3.7], [0.42, 1.5, 4.6]].forEach(([r, h, y], i) => {
      const g = new THREE.ConeGeometry(r, h, 9, 2);
      const p = g.attributes.position, rand = T.rng(seed + i);
      for (let k = 0; k < p.count; k++) {
        const j = 1 + (rand() - 0.5) * 0.16;
        p.setXYZ(k, p.getX(k) * j, p.getY(k), p.getZ(k) * j);
      }
      g.computeVertexNormals();
      s.add(g, "#25834a", mat(0, y, 0), false, (x, yy) => 0.72 + 0.42 * (yy / H));
    });
  } else {                    // 둥근 나무: 줄기 + 잎 덩어리 대여섯 개
    s.add(new THREE.CylinderGeometry(0.14, 0.24, 3.6, 7), "#86593a", mat(0, 1.8, 0), false);   // 줄기를 잎 속까지 올려 떠 보이지 않게
    const rand = T.rng(seed);
    const lumps = kind === "roundFar" ? 3 : 6;
    for (let i = 0; i < lumps; i++) {
      const a = (i / lumps) * Math.PI * 2 + rand(), rr = i === 0 ? 0 : 0.9;
      const r = i === 0 ? 1.5 : 1.0 + rand() * 0.35;
      s.add(lumpy(r, kind === "roundFar" ? 1 : 2, seed * 7 + i, 0.2), "#3e9f3c",
        mat(Math.cos(a) * rr, (i === 0 ? 3.6 : 3.0 + rand() * 0.8), Math.sin(a) * rr), false,
        (x, y) => 0.68 + 0.6 * Math.min(1, Math.max(0, (y - 2.2) / 3)));
    }
  }
  return mergeGeometries(s.geos);
}

/* ---------------- 동네 짓기 ---------------- */
export function buildWorld(scene) {
  const ramp = T.toonRamp();
  const toon = (o) => new THREE.MeshToonMaterial(Object.assign({ gradientMap: ramp }, o));
  const M = {
    solid: toon({ vertexColors: true }),
    edge: new THREE.LineBasicMaterial({ color: "#4a4462", transparent: true, opacity: 0.5 }),
    asphalt: toon({ map: rep(T.asphalt(), 1) }),
    wall: toon({ map: T.blockWall("beige") }),
    gray: toon({ map: T.blockWall("gray") }),
    grass: toon({ map: rep(T.grass(), 1) }),
    yard: toon({ map: rep(T.yard(), 1) }),
    sand: toon({ map: rep(T.sand(), 1) }),
    gravel: toon({ map: rep(T.gravel(), 1) }),
    win: toon({ map: T.windowTex() }),
    shutter: toon({ map: T.shutterTex() }),
  };
  function rep(t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }

  const world = new THREE.Group();
  scene.add(world);
  const solid = new Solid();
  const walls = new Skinned(M.wall, 2.4), grays = new Skinned(M.gray, 2.4);
  const winList = [], shutterList = [];
  const canopies = [], fences = [], lamps = [];
  const signs = new THREE.Group(); world.add(signs);
  const trees = { cypress: [], round: [], farRound: [], farCypress: [] }, bushes = [];
  const rand = T.rng(2024);

  const lo = -VIS * L - R / 2, hi = (N - 1 + VIS) * L + R / 2;

  /* 땅: 전체 아스팔트 한 장 → 그 위에 블록 마당·공원 잔디를 덮는다 */
  const groundPlane = (w, d, x, z, m, tile, y = 0) => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    world.add(mesh);
    return mesh;
  };
  groundPlane(hi - lo + 400, hi - lo + 400, (lo + hi) / 2, (lo + hi) / 2, M.yard, 14, -0.02);
  groundPlane(hi - lo, hi - lo, (lo + hi) / 2, (lo + hi) / 2, M.asphalt, 9);

  /* 길 가장자리 배수로 띠·흰 선·맨홀 */
  const flat = new Solid();
  const roadDecor = (x0, z0, x1, z1) => {   // 블록 둘레 사각형 바깥쪽에 배수로
    const gw = 0.42;
    flat.add(new THREE.PlaneGeometry(x1 - x0 + gw * 2, gw).rotateX(-Math.PI / 2), "#a7a3cf", mat((x0 + x1) / 2, 0.012, z0 - gw / 2), false);
    flat.add(new THREE.PlaneGeometry(x1 - x0 + gw * 2, gw).rotateX(-Math.PI / 2), "#a7a3cf", mat((x0 + x1) / 2, 0.012, z1 + gw / 2), false);
    flat.add(new THREE.PlaneGeometry(gw, z1 - z0).rotateX(-Math.PI / 2), "#a7a3cf", mat(x0 - gw / 2, 0.012, (z0 + z1) / 2), false);
    flat.add(new THREE.PlaneGeometry(gw, z1 - z0).rotateX(-Math.PI / 2), "#a7a3cf", mat(x1 + gw / 2, 0.012, (z0 + z1) / 2), false);
    // 흰 차선 (가장자리에서 조금 안쪽)
    const lw = 0.12, off = 0.95;
    flat.add(new THREE.PlaneGeometry(x1 - x0 - 2, lw).rotateX(-Math.PI / 2), "#eeeefa", mat((x0 + x1) / 2, 0.014, z0 - off), false);
    flat.add(new THREE.PlaneGeometry(x1 - x0 - 2, lw).rotateX(-Math.PI / 2), "#eeeefa", mat((x0 + x1) / 2, 0.014, z1 + off), false);
    flat.add(new THREE.PlaneGeometry(lw, z1 - z0 - 2).rotateX(-Math.PI / 2), "#eeeefa", mat(x0 - off, 0.014, (z0 + z1) / 2), false);
    flat.add(new THREE.PlaneGeometry(lw, z1 - z0 - 2).rotateX(-Math.PI / 2), "#eeeefa", mat(x1 + off, 0.014, (z0 + z1) / 2), false);
  };
  const manhole = (x, z) => {
    flat.add(new THREE.CircleGeometry(0.42, 18).rotateX(-Math.PI / 2), "#6f6a96", mat(x, 0.016, z), false);
    flat.add(new THREE.RingGeometry(0.3, 0.36, 18).rotateX(-Math.PI / 2), "#8c88b6", mat(x, 0.018, z), false);
  };
  // 길 위 맨홀
  for (let c = -VIS; c < N + VIS; c++) for (let r = -VIS; r < N + VIS; r++) {
    if (rand() < 0.55) manhole(sx(c) + (rand() - 0.5) * 3, sz(r) + L * (0.25 + rand() * 0.5));
    if (rand() < 0.55) manhole(sx(c) + L * (0.25 + rand() * 0.5), sz(r) + (rand() - 0.5) * 3);
  }

  /* 횡단보도: 교차로 들머리에 흰 줄무늬 */
  const crosswalk = (x, z, alongX) => {
    for (let i = -3; i <= 3; i++) {
      const g = new THREE.PlaneGeometry(alongX ? 0.5 : 2.6, alongX ? 2.6 : 0.5).rotateX(-Math.PI / 2);
      flat.add(g, "#f4f4fb", mat(x + (alongX ? i * 1.0 : 0), 0.02, z + (alongX ? 0 : i * 1.0)), false);
    }
  };

  /* ---------------- 블록마다 ---------------- */
  for (let bc = -VIS; bc < N - 1 + VIS; bc++) {
    for (let br = -VIS; br < N - 1 + VIS; br++) {
      const x0 = sx(bc) + R / 2, x1 = sx(bc + 1) - R / 2;
      const z0 = sz(br) + R / 2, z1 = sz(br + 1) - R / 2;
      const inPark = x0 >= PARK.x0 - 1 && z1 <= PARK.z1 + 1;
      if (inPark) continue;
      roadDecor(x0, z0, x1, z1);
      if (br === 2) { railBlock(x0, z0, x1, z1); continue; }
      if (bc === PLAYGROUND[0] && br === PLAYGROUND[1]) { playground(x0, z0, x1, z1); continue; }
      houseBlock(x0, z0, x1, z1);
    }
  }

  function houseBlock(x0, z0, x1, z1) {
    groundPlane(x1 - x0, z1 - z0, (x0 + x1) / 2, (z0 + z1) / 2, M.yard, 10, 0.01);
    const hx = (x0 + x1) / 2, hz = (z0 + z1) / 2;
    // 네 필지: (0,0)=북서 … 각 필지는 두 면이 길에 닿는다
    for (const qx of [0, 1]) for (const qz of [0, 1]) {
      const lx0 = qx ? hx : x0, lx1 = qx ? x1 : hx, lz0 = qz ? hz : z0, lz1 = qz ? z1 : hz;
      lot(lx0, lz0, lx1, lz1, qx, qz);
    }
  }

  /* 필지 하나: 담장(대문 포함) + 집 + 나무 */
  function lot(x0, z0, x1, z1, qx, qz) {
    const gray = rand() < 0.22;
    const W = gray ? grays : walls;
    const wh = gray ? 1.55 : 1.3, th = 0.28;
    // 길에 닿는 두 면: 가로면(z), 세로면(x)
    const zEdge = qz ? z1 - th / 2 : z0 + th / 2;
    const xEdge = qx ? x1 - th / 2 : x0 + th / 2;
    const gateOnZ = rand() < 0.5;
    const gw = 2.3;
    const capC = gray ? "#b9bcb6" : "#d6bd86";
    // 가로 담장
    const gx = x0 + 2.2 + rand() * (x1 - x0 - 4.4 - gw);
    if (gateOnZ) {
      W.box(gx - x0, wh, th, (x0 + gx) / 2, 0, zEdge);
      W.box(x1 - gx - gw, wh, th, (gx + gw + x1) / 2, 0, zEdge);
      colBox((x0 + gx) / 2, zEdge, gx - x0, th); colBox((gx + gw + x1) / 2, zEdge, x1 - gx - gw, th);
      colBox(gx + gw / 2, zEdge, gw, th);   // 대문은 닫혀 있다
      gate(gx + gw / 2, zEdge, 0, gw, wh, capC);
      solid.box(gx - x0, 0.1, th + 0.08, (x0 + gx) / 2, wh, zEdge, capC, 0, false);
      solid.box(x1 - gx - gw, 0.1, th + 0.08, (gx + gw + x1) / 2, wh, zEdge, capC, 0, false);
    } else {
      W.box(x1 - x0, wh, th, (x0 + x1) / 2, 0, zEdge);
      colBox((x0 + x1) / 2, zEdge, x1 - x0, th);
      solid.box(x1 - x0, 0.1, th + 0.08, (x0 + x1) / 2, wh, zEdge, capC, 0, false);
    }
    // 세로 담장
    const gz = z0 + 2.2 + rand() * (z1 - z0 - 4.4 - gw);
    if (!gateOnZ) {
      W.box(th, wh, gz - z0, xEdge, 0, (z0 + gz) / 2);
      W.box(th, wh, z1 - gz - gw, xEdge, 0, (gz + gw + z1) / 2);
      colBox(xEdge, (z0 + gz) / 2, th, gz - z0); colBox(xEdge, (gz + gw + z1) / 2, th, z1 - gz - gw);
      colBox(xEdge, gz + gw / 2, th, gw);
      gate(xEdge, gz + gw / 2, Math.PI / 2, gw, wh, capC);
      solid.box(th + 0.08, 0.1, gz - z0, xEdge, wh, (z0 + gz) / 2, capC, 0, false);
      solid.box(th + 0.08, 0.1, z1 - gz - gw, xEdge, wh, (gz + gw + z1) / 2, capC, 0, false);
    } else {
      W.box(th, wh, z1 - z0, xEdge, 0, (z0 + z1) / 2);
      colBox(xEdge, (z0 + z1) / 2, th, z1 - z0);
      solid.box(th + 0.08, 0.1, z1 - z0, xEdge, wh, (z0 + z1) / 2, capC, 0, false);
    }
    // 모서리 기둥
    solid.box(0.5, wh + 0.25, 0.5, xEdge, 0, zEdge, capC);

    // 집 — 필지 안쪽(블록 가운데 쪽)으로 붙여 길 쪽에 마당을 남긴다
    const lw = x1 - x0, ld = z1 - z0;
    const hw = 7.2 + rand() * 1.6, hd = 6.6 + rand() * 1.4;
    const cx = qx ? x0 + 0.8 + hw / 2 + rand() * 0.6 : x1 - 0.8 - hw / 2 - rand() * 0.6;
    const cz = qz ? z0 + 0.8 + hd / 2 + rand() * 0.6 : z1 - 0.8 - hd / 2 - rand() * 0.6;
    house(cx, cz, hw, hd, rand() < 0.8 ? 2 : 1, ROOF[(rand() * ROOF.length) | 0], qx, qz);

    // 마당 나무: 길 쪽 모서리에 측백나무, 담장 따라 덤불
    // 잎이 담장 밖(길 쪽)으로 삐져나오지 않게, 담장에서 잎 반지름만큼 떨어뜨려 심는다
    // (잎 반지름: 측백 1.25×크기, 둥근 나무 2.5×크기, 덤불 1.15×크기)
    const wallX = qx ? x1 - th : x0 + th, wallZ = qz ? z1 - th : z0 + th, inX = qx ? -1 : 1, inZ = qz ? -1 : 1;
    if (rand() < 0.85) { const s = 0.85 + rand() * 0.5, o = 0.25 + 1.25 * s; trees.cypress.push([wallX + inX * o, wallZ + inZ * o, s]); }
    if (rand() < 0.6) {
      const s = 0.75 + rand() * 0.35, o = 0.25 + 2.5 * s;
      trees.round.push([wallX + inX * (o + rand() * 1.5), wallZ + inZ * o, s]);
    }
    if (rand() < 0.5) { const s = 0.7 + rand() * 0.4, o = 0.25 + 1.25 * s; trees.cypress.push([wallX + inX * (o + 2.5 + rand() * 3.5), wallZ + inZ * o, s]); }
    // 담장 안쪽 덤불 줄
    const along = (ax0, ax1, fixed, isZ) => {
      for (let t = ax0 + 0.8; t < ax1 - 0.8; t += 1.3 + rand() * 0.8) {
        if (rand() < 0.35) continue;
        const sc = 0.75 + rand() * 0.45, inset = th + 0.2 + 1.15 * sc;     // 담장을 뚫지 않게
        const p = isZ ? [t, fixed + (qz ? -inset : inset)] : [fixed + (qx ? -inset : inset), t];
        bushes.push([p[0], p[1], sc]);
      }
    };
    along(x0, x1, qz ? z1 : z0, true);
    along(z0, z1, qx ? x1 : x0, false);
  }

  function gate(x, z, ry, w, wh, capC) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const at = (d) => [x + c * d, z - s * d];
    // 기둥 둘
    for (const sgn of [-1, 1]) {
      const [px, pz] = at(sgn * (w / 2 + 0.22));
      solid.box(0.46, wh + 0.35, 0.46, px, 0, pz, rand() < 0.5 ? "#c9784a" : capC, ry);
      colBox(px, pz, 0.46, 0.46);
      solid.box(0.56, 0.12, 0.56, px, wh + 0.35, pz, "#8f8a80", ry, false);
    }
    // 나무 대문 (세로 널판)
    const gateC = rand() < 0.5 ? "#9b5f34" : "#b9773f";
    solid.box(w, wh - 0.05, 0.12, x, 0.04, z, gateC, ry);
    for (let i = -3; i <= 3; i++) {
      const [px, pz] = at(i * w / 7.5);
      solid.box(0.05, wh - 0.1, 0.14, px, 0.06, pz, "#6e4222", ry, false);
    }
  }

  /* 박공지붕: 긴 쪽으로 용마루, 양 끝은 벽색 삼각형 + 지붕 테두리 판 */
  function gableRoof(cx, cz, w, d, h, top, oh, roofC, dark, wallC) {
    const along = w >= d, Lr = (along ? w : d) + oh * 2, Dr = (along ? d : w) + oh * 2;
    const Dw = along ? d : w, Lw = along ? w : d;
    const ry = along ? 0 : Math.PI / 2, y0 = h + 0.12, fz = Dr / 2;
    const P = (a, b, c) => [a, b, c];
    const quad = (a, b, c, e) => [a, b, c, a, c, e];
    const tris = [
      ...quad(P(-Lr / 2, 0, fz), P(Lr / 2, 0, fz), P(Lr / 2, top, 0), P(-Lr / 2, top, 0)),
      ...quad(P(Lr / 2, 0, -fz), P(-Lr / 2, 0, -fz), P(-Lr / 2, top, 0), P(Lr / 2, top, 0)),
      ...quad(P(-Lr / 2, -0.001, fz), P(-Lr / 2, -0.001, -fz), P(Lr / 2, -0.001, -fz), P(Lr / 2, -0.001, fz)),
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(), 3));
    g.computeVertexNormals();
    solid.add(g, roofC, mat(cx, y0, cz, ry), true, (x, y) => 0.92 + 0.14 * (y - y0) / top);
    const base = mat(cx, y0, cz, ry);
    const slope = Math.atan2(top, Dr / 2), len = Math.hypot(top, Dr / 2);
    for (const sgn of [-1, 1]) {
      // 박공 삼각형: 지붕 끝면에 딱 맞춰 막는다 (벽 쪽에 두면 처마만큼 안이 비어 뚫려 보였다)
      const xw = sgn * (Lr / 2 - 0.03);
      const a = P(xw, -0.2, -Dr / 2), b = P(xw, -0.2, Dr / 2), c = P(xw, top - 0.02, 0);
      const tg = new THREE.BufferGeometry();
      tg.setAttribute("position", new THREE.Float32BufferAttribute([a, b, c, a, c, b].flat(), 3));
      tg.computeVertexNormals();
      solid.add(tg, wallC, base.clone(), false);
      // 지붕 테두리 판 (박공 끝선 두 줄)
      for (const zs of [-1, 1]) {
        const m = base.clone().multiply(mat(sgn * Lr / 2, top / 2, zs * Dr / 4, 0, 1, 1, 1, zs * slope, 0));
        solid.add(new THREE.BoxGeometry(0.16, 0.22, len), dark, m, false);
      }
    }
    solid.box(along ? Lr : Dr, 0.2, along ? Dr : Lr, cx, y0 - 0.18, cz, dark, 0, false);
  }

  /* 평지붕 옥상: 난간 + 계단실 + 물탱크 (한국 주택가 느낌) */
  function flatRoof(cx, cz, w, d, h, wallC) {
    solid.box(w + 0.3, 0.22, d + 0.3, cx, h, cz, "#d6d2ca");
    const ph = 0.7, t = 0.18;
    solid.box(w + 0.3, ph, t, cx, h + 0.22, cz - d / 2 - 0.06, wallC);
    solid.box(w + 0.3, ph, t, cx, h + 0.22, cz + d / 2 + 0.06, wallC);
    solid.box(t, ph, d + 0.3, cx - w / 2 - 0.06, h + 0.22, cz, wallC);
    solid.box(t, ph, d + 0.3, cx + w / 2 + 0.06, h + 0.22, cz, wallC);
    const sx0 = cx + (rand() - 0.5) * (w - 3), sz0 = cz + (rand() - 0.5) * (d - 3);
    solid.box(2.2, 2.2, 2.0, sx0, h + 0.22, sz0, wallC);
    solid.box(2.5, 0.16, 2.3, sx0, h + 2.42, sz0, "#9a968e");
    const tx = cx - Math.sign(sx0 - cx || 1) * (w / 4), tz = cz - Math.sign(sz0 - cz || 1) * (d / 4);
    for (const o of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) solid.box(0.08, 0.6, 0.08, tx + o[0], h + 0.22, tz + o[1], "#8f9aa5", 0, false);
    solid.add(new THREE.CylinderGeometry(0.62, 0.62, 1.3, 18), rand() < 0.6 ? "#5fb0e6" : "#f1c447", mat(tx, h + 1.47, tz), true);
  }

  /* 집: 흰 벽 + 지붕 + 창문·덧창·실외기 */
  function house(cx, cz, w, d, floors, roofC, qx, qz) {
    const fh = 2.85, h = floors * fh + 0.25;
    const wallC = rand() < 0.75 ? "#fbf8f1" : (rand() < 0.5 ? "#fbefd8" : "#f1f4f8");
    solid.box(w, h, d, cx, 0, cz, wallC);
    solid.box(w + 0.12, 0.35, d + 0.12, cx, 0, cz, "#c9c3b8", 0, false); // 걸레받이
    colBox(cx, cz, w, d);
    // 지붕: 모임지붕이 대부분, 가끔 박공지붕·옥상(물탱크) 평지붕
    const kind = rand(), oh = 0.55, rh = Math.min(w, d) * 0.32;
    const dark = "#" + col(roofC).multiplyScalar(0.62).getHexString();
    if (floors === 2 && kind < 0.14) flatRoof(cx, cz, w, d, h, wallC);
    else if (kind < 0.42) gableRoof(cx, cz, w, d, h, rh * 1.1, oh, roofC, dark, wallC);
    else {
      solid.add(hipRoof(w + oh * 2, d + oh * 2, rh), roofC, mat(cx, h + 0.12, cz), true,
        (x, y) => 0.92 + 0.14 * ((y - h) / rh));
      solid.box(w + oh * 2 + 0.02, 0.2, d + oh * 2 + 0.02, cx, h - 0.06, cz, dark);
    }
    // 2층집은 가끔 1층 일부를 앞으로 내고 작은 지붕을 단다 (참고 그림 왼쪽 빨간 집)
    if (floors === 2 && rand() < 0.35) {
      const ew = w * 0.55, ed = 2.6, ez = cz + (qz ? -1 : 1) * (d / 2 + ed / 2 - 0.1);
      const ex = cx + (rand() - 0.5) * (w - ew);
      solid.box(ew, fh + 0.1, ed, ex, 0, ez, wallC);
      colBox(ex, ez, ew, ed);
      solid.add(hipRoof(ew + 0.8, ed + 0.8, 1.0), roofC, mat(ex, fh + 0.2, ez));
      windowsOn(ex, ez, ew, ed, 1, qx, qz, true);
    }
    windowsOn(cx, cz, w, d, floors, qx, qz, false);
    // 현관문 — 길 반대쪽이 아니라 길 쪽 면에
    const fz = cz + (qz ? -1 : 1) * (d / 2 + 0.02);
    solid.box(1.0, 2.1, 0.1, cx + (rand() - 0.5) * (w - 2.5), 0, fz, "#8a5a33", 0);
    // 실외기
    if (rand() < 0.7) {
      const ax = cx + (qx ? -1 : 1) * (w / 2 + 0.35), az = cz + (rand() - 0.5) * (d - 2);
      solid.box(0.55, 0.62, 0.85, ax, 0.05, az, "#e9e6df");
      solid.add(new THREE.CircleGeometry(0.22, 12), "#9a978f", mat(ax + (qx ? -0.28 : 0.28), 0.38, az, (qx ? -1 : 1) * Math.PI / 2), false);
    }
    // 2층 베란다 난간
    if (floors === 2 && rand() < 0.4) {
      const bz = cz + (qz ? -1 : 1) * (d / 2 + 0.55), bx = cx + (rand() - 0.5) * (w - 3.2);
      solid.box(2.8, 0.14, 1.1, bx, fh, bz, "#e8e4dc");
      solid.box(2.8, 0.9, 0.06, bx, fh + 0.14, bz + (qz ? -0.52 : 0.52), "#f4f2ee");
    }
    // 마당 비닐 차양 (참고 그림의 파란 반투명 지붕)
    if (rand() < 0.18) {
      const px = cx + (qx ? -1 : 1) * (w / 2 + 1.6), pz = cz;
      for (const ox of [-1, 1]) for (const oz of [-1, 1]) solid.box(0.1, 2.3, 0.1, px + ox * 1.1, 0, pz + oz * 1.6, "#d5d8de", 0, false);
      canopies.push([px, 2.35, pz]);
    }
  }

  function windowsOn(cx, cz, w, d, floors, qx, qz, small) {
    const fh = 2.85;
    const faces = [
      [cx, cz + d / 2 + 0.02, 0, w], [cx, cz - d / 2 - 0.02, Math.PI, w],
      [cx + w / 2 + 0.02, cz, Math.PI / 2, d], [cx - w / 2 - 0.02, cz, -Math.PI / 2, d],
    ];
    for (const [fx, fz, ry, len] of faces) {
      const n = Math.max(1, Math.floor((len - 1) / 2.6));
      for (let f = 0; f < floors; f++) {
        for (let i = 0; i < n; i++) {
          if (rand() < 0.22) continue;
          const t = (i - (n - 1) / 2) * (len - 1.2) / Math.max(1, n);
          const ww = f === 0 && !small && rand() < 0.4 ? 1.7 : 1.15, wh = 1.15;
          const px = fx + Math.cos(ry) * t, pz = fz - Math.sin(ry) * t, py = f * fh + 1.55;
          winList.push(mat(px, py, pz, ry, ww, wh, 1));
          if (rand() < 0.45 && ww < 1.5) for (const sgn of [-1, 1]) {
            const o = sgn * (ww / 2 + 0.24);
            shutterList.push(mat(px + Math.cos(ry) * o, py, pz - Math.sin(ry) * o + 0.0, ry, 0.42, wh + 0.1, 1));
          }
        }
      }
    }
  }

  /* 기찻길 블록: 자갈 위 선로 두 줄, 양쪽 철망, 풀숲 */
  function railBlock(x0, z0, x1, z1) {
    groundPlane(x1 - x0, z1 - z0, (x0 + x1) / 2, (z0 + z1) / 2, M.grass, 8, 0.01);
    groundPlane(x1 - x0, 7, (x0 + x1) / 2, RAIL_Z, M.gravel, 3, 0.03);
    const mx = (x0 + x1) / 2, gap = 2.6;
    for (const fz of [z0 + 0.8, z1 - 0.8]) {
      fences.push([x0, fz, mx - gap, fz], [mx + gap, fz, x1, fz]);
      colBox((x0 + mx - gap) / 2, fz, mx - gap - x0, 0.12); colBox((mx + gap + x1) / 2, fz, x1 - mx - gap, 0.12);
    }
    for (let t = x0 + 1; t < x1 - 1; t += 1.6 + rand() * 1.5) {
      if (rand() < 0.5) bushes.push([t, z0 + 2 + rand() * 2, 0.7 + rand() * 0.4]);
      if (rand() < 0.5) bushes.push([t, z1 - 2 - rand() * 2, 0.7 + rand() * 0.4]);
    }
    if (rand() < 0.7) { const tx = x0 + 3 + rand() * (x1 - x0 - 6); trees.round.push([tx, z0 + 2.6, 0.9]); colCircle(tx, z0 + 2.6, 0.3); }
  }

  /* 선로는 동서로 맵 전체를 가로지른다 (건널목 위로도 지나감) */
  const sleeperList = [];
  for (const tz of [RAIL_Z - 1.6, RAIL_Z + 1.6]) {
    for (const off of [-0.72, 0.72]) {
      solid.box(hi - lo, 0.16, 0.12, (lo + hi) / 2, 0.02, tz + off, "#9aa0ab", 0, false);
      solid.box(hi - lo, 0.04, 0.16, (lo + hi) / 2, 0.18, tz + off, "#dfe3ea", 0, false);
    }
    for (let x = lo; x < hi; x += 0.65) sleeperList.push(mat(x, 0.05, tz));
  }

  /* 건널목: 세로길마다 차단기 기둥·경보등·X 표지 + 정지 표지 */
  const stripe = stripeTex("#1d1d1f", "#f5c518");
  const stripeMat = toon({ map: stripe });
  const crossings = new THREE.Group(); world.add(crossings);
  for (let c = -VIS; c < N + VIS; c++) {
    const x = sx(c);
    if (x > PARK.x0 && RAIL_Z < PARK.z1) continue;
    for (const side of [-1, 1]) {
      const z = RAIL_Z + side * 4.6, px = x + side * (R / 2 - 0.5);
      // 줄무늬 기둥
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 3.6, 10), stripeMat);
      pole.position.set(px, 1.8, z); pole.castShadow = true; crossings.add(pole);
      colCircle(px, z, 0.2); colCircle(px - side * 0.3, z + side * 0.1, 0.32);
      // X 표지 (흰 바탕 빨간 테)
      crossX(px, 3.35, z - side * 0.13, side);
      // 경보등 두 개
      solid.box(0.9, 0.08, 0.08, px, 2.55, z - side * 0.13, "#222222", 0, false);
      for (const ox of [-0.38, 0.38]) {
        solid.add(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 14).rotateX(Math.PI / 2), "#2a2a2a", mat(px + ox, 2.45, z - side * 0.16), false);
        lamps.push([px + ox, 2.45, z - side * 0.24]);
      }
      // 차단기 팔 (올라가 있음)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.2, 0.12), stripeMat);
      arm.position.set(px - side * 0.3, 3.1, z + side * 0.1); arm.rotation.z = side * 0.08; arm.castShadow = true; crossings.add(arm);
      solid.box(0.45, 0.6, 0.45, px - side * 0.3, 0, z + side * 0.1, "#3a3a3a", 0, true);
    }
    // 선로를 길 위에서도 보이게 (아스팔트에 박힌 철판)
    flat.add(new THREE.PlaneGeometry(R, 6.6).rotateX(-Math.PI / 2), "#9a97b8", mat(x, 0.021, RAIL_Z), false);
    // 정지선 + 횡단보도 (참고 그림)
    flat.add(new THREE.PlaneGeometry(R / 2 - 0.4, 0.4).rotateX(-Math.PI / 2), "#f4f4fb", mat(x + R / 4, 0.022, RAIL_Z + 6.6), false);
    flat.add(new THREE.PlaneGeometry(R / 2 - 0.4, 0.4).rotateX(-Math.PI / 2), "#f4f4fb", mat(x - R / 4, 0.022, RAIL_Z - 6.6), false);
    if (c >= 0 && c < N) { crosswalk(x, sz(3) - R / 2 - 1.8, true); crosswalk(x, sz(2) + R / 2 + 1.8, true); }
    // 정지 표지
    if (c >= 0 && c < N) stopSign(x + R / 2 - 0.4, RAIL_Z + 8.5);
  }
  function crossX(x, y, z, side) {
    for (const a of [0.62, -0.62]) {
      const g = new THREE.BoxGeometry(1.25, 0.2, 0.04);
      solid.add(g, "#f6f6f6", mat(x, y, z, 0, 1, 1, 1, 0, a), false);
      solid.add(new THREE.BoxGeometry(1.29, 0.24, 0.03), "#d0312d", mat(x, y, z + side * 0.015, 0, 1, 1, 1, 0, a), false);
    }
  }
  function stopSign(x, z) {
    solid.box(0.09, 2.3, 0.09, x, 0, z, "#c8ccd2", 0, false);
    colCircle(x, z, 0.12);
    const t = T.label("정지\nSTOP", { bg: "#d8302c", color: "#ffffff", size: 74, w: 256, h: 256 });
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.42, 8), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(x, 2.55, z + 0.06); m.rotation.z = Math.PI / 8;
    m.material.map.center.set(0.5, 0.5); m.material.map.rotation = -Math.PI / 8;
    signs.add(m);
  }

  /* 놀이터 — 참고 그림 오른쪽: 모래, 노란 돔, 그네, 파란 미끄럼틀, 벤치, 큰 나무, 초록 철망 */
  function playground(x0, z0, x1, z1) {
    groundPlane(x1 - x0, z1 - z0, (x0 + x1) / 2, (z0 + z1) / 2, M.sand, 6, 0.01);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // 둘레: 낮은 담 + 초록 철망 + 생울타리 (서쪽 가운데는 입구)
    const lowH = 0.55;
    walls.box(x1 - x0, lowH, 0.3, cx, 0, z0 + 0.15);
    walls.box(x1 - x0, lowH, 0.3, cx, 0, z1 - 0.15);
    walls.box(0.3, lowH, (z1 - z0) / 2 - 1.6, x1 - 0.15, 0, z0 + ((z1 - z0) / 2 - 1.6) / 2);
    walls.box(0.3, lowH, (z1 - z0) / 2 - 1.6, x1 - 0.15, 0, z1 - ((z1 - z0) / 2 - 1.6) / 2);
    colBox(cx, z0 + 0.15, x1 - x0, 0.3); colBox(cx, z1 - 0.15, x1 - x0, 0.3);
    for (const ex of [x0 + 0.15, x1 - 0.15]) {
      colBox(ex, z0 + ((z1 - z0) / 2 - 1.6) / 2, 0.3, (z1 - z0) / 2 - 1.6);
      colBox(ex, z1 - ((z1 - z0) / 2 - 1.6) / 2, 0.3, (z1 - z0) / 2 - 1.6);
    }
    walls.box(0.3, lowH, (z1 - z0) / 2 - 1.6, x0 + 0.15, 0, z0 + ((z1 - z0) / 2 - 1.6) / 2);
    walls.box(0.3, lowH, (z1 - z0) / 2 - 1.6, x0 + 0.15, 0, z1 - ((z1 - z0) / 2 - 1.6) / 2);
    fences.push([x0, z0 + 0.15, x1, z0 + 0.15, lowH], [x0, z1 - 0.15, x1, z1 - 0.15, lowH],
      [x0 + 0.15, z0, x0 + 0.15, cz - 1.6, lowH], [x0 + 0.15, cz + 1.6, x0 + 0.15, z1, lowH],
      [x1 - 0.15, z0, x1 - 0.15, cz - 1.6, lowH], [x1 - 0.15, cz + 1.6, x1 - 0.15, z1, lowH]);
    for (let t = z0 + 1; t < z1 - 1; t += 1.2) if (Math.abs(t - cz) > 2.4) { bushes.push([x0 + 1.35, t, 0.8]); colCircle(x0 + 1.35, t, 0.55); }
    for (let t = x0 + 1; t < x1 - 1; t += 1.2) { bushes.push([t, z1 - 1.35, 0.8]); colCircle(t, z1 - 1.35, 0.55); }
    trees.round.push([x0 + 4, z0 + 3.5, 1.35], [x1 - 3.5, z1 - 4, 1.2], [x1 - 3, z0 + 3, 1.1]);
    colCircle(x0 + 4, z0 + 3.5, 0.35); colCircle(x1 - 3.5, z1 - 4, 0.35); colCircle(x1 - 3, z0 + 3, 0.35);
    // 노란 돔 (굴)
    const dome = new THREE.SphereGeometry(2.4, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1.25, 0.82, 1);
    solid.add(dome, "#f2cc3a", mat(cx + 1.5, 0, cz + 1.0), false, (x, y) => 0.88 + 0.12 * (y / 2));
    colBox(cx + 1.5, cz + 1.0, 5.6, 4.4);
    solid.add(new THREE.CircleGeometry(1.0, 20, 0, Math.PI), "#3b3424", mat(cx + 1.5, 0.02, cz + 1.0 + 2.41, 0), false);
    solid.add(new THREE.CircleGeometry(1.0, 20, 0, Math.PI), "#3b3424", mat(cx + 1.5, 0.02, cz + 1.0 - 2.41, Math.PI), false);
    // 그네: 빨간 A 자 기둥 + 가로대 + 파란 의자 둘
    const swX = cx + 7.5, swZ = cz - 3;
    colBox(swX, swZ - 2.2, 1.2, 0.4); colBox(swX, swZ + 2.2, 1.2, 0.4);
    for (const oz of [-2.2, 2.2]) for (const ox of [-0.7, 0.7]) {
      solid.add(new THREE.CylinderGeometry(0.07, 0.07, 3.0, 8), "#d83a2e", mat(swX + ox * 0.55, 1.45, swZ + oz, 0, 1, 1, 1, 0, -ox * 0.32), false);
    }
    solid.add(new THREE.CylinderGeometry(0.07, 0.07, 4.6, 8).rotateX(Math.PI / 2), "#d83a2e", mat(swX, 2.9, swZ), false);
    for (const oz of [-0.9, 0.9]) {
      for (const ox of [-0.25, 0.25]) solid.add(new THREE.CylinderGeometry(0.015, 0.015, 2.2, 4), "#9aa3ad", mat(swX, 1.8, swZ + oz + ox * 0.6), false);
      solid.box(0.45, 0.06, 0.6, swX, 0.66, swZ + oz, "#2f6cd8", 0, false);
    }
    // 미끄럼틀: 파란 계단 + 발판 + 미끄럼판
    const slX = cx + 6.5, slZ = cz + 6;
    colBox(slX, slZ - 0.2, 1.3, 4.6);
    for (const ox of [-0.45, 0.45]) solid.add(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8), "#2f6cd8", mat(slX + ox, 1.2, slZ - 1.6), false);
    for (let i = 0; i < 6; i++) solid.box(0.9, 0.05, 0.08, slX, 0.3 + i * 0.36, slZ - 1.6, "#2f6cd8", 0, false);
    solid.box(1.1, 0.12, 1.1, slX, 2.1, slZ - 1.0, "#3d82ea");
    for (const ox of [-0.55, 0.55]) solid.box(0.06, 0.6, 1.1, slX + ox, 2.2, slZ - 1.0, "#2f6cd8", 0, false);
    const chute = new THREE.BoxGeometry(0.9, 0.08, 3.6);
    solid.add(chute, "#4a9af0", mat(slX, 1.15, slZ + 1.0, 0, 1, 1, 1, -0.62, 0));
    for (const ox of [-0.48, 0.48]) solid.add(new THREE.BoxGeometry(0.08, 0.22, 3.6), "#2f6cd8", mat(slX + ox, 1.25, slZ + 1.0, 0, 1, 1, 1, -0.62, 0), false);
    // 벤치
    benchAt(cx - 4.5, z0 + 1.8, 0);
    benchAt(x1 - 1.6, cz, -Math.PI / 2);
    // 분홍 블록 의자
    solid.box(0.7, 0.55, 0.7, cx + 9.5, 0, z0 + 2.4, "#f0a7b4");
    colBox(cx + 9.9, z0 + 2.4, 1.5, 0.7);
    solid.box(0.7, 0.85, 0.7, cx + 10.3, 0, z0 + 2.4, "#f0a7b4");
  }
  function benchAt(x, z, ry) {
    const c = Math.cos(ry), s = Math.sin(ry);
    solid.box(2.0, 0.08, 0.5, x, 0.45, z, "#b07a44", ry);
    solid.add(new THREE.BoxGeometry(2.0, 0.42, 0.06), "#b07a44", mat(x - s * 0.24, 0.78, z - c * 0.24, ry, 1, 1, 1, -0.15, 0));
    for (const o of [-0.85, 0.85]) solid.box(0.08, 0.45, 0.45, x + c * o, 0, z - s * o, "#5c5c5c", ry, false);
    colBox(x, z, 2.0, 0.6, ry);
  }

  /* 호수공원 — 잔디 + 호수 + 산책로 + 입구 간판 */
  const park = new THREE.Group(); world.add(park);
  {
    const pw = PARK.x1 - PARK.x0, pd = PARK.z1 - PARK.z0;
    groundPlane(pw, pd, (PARK.x0 + PARK.x1) / 2, (PARK.z0 + PARK.z1) / 2, M.grass, 8, 0.01);
    // 공원 담 (입구만 비움)
    // 둘레 생울타리 — 길이 닿는 곳마다 틈을 내서 어디로든 들어갈 수 있다
    for (let x = PARK.x0; x < PARK.x1; x += 2.5) {
      const bx = x + 1.25;
      if (Array.from({ length: N + VIS * 2 }, (_, i) => sx(i - VIS)).some(c => Math.abs(bx - c) < R / 2 + 1)) continue;
      bushes.push([bx, PARK.z1 - 1.0, 0.95]); colCircle(bx, PARK.z1 - 1.0, 0.7);
    }
    for (let z = PARK.z0; z < PARK.z1; z += 2.5) {
      const bz = z + 1.25;
      if (Array.from({ length: N + VIS * 2 }, (_, i) => sz(i - VIS)).some(c => Math.abs(bz - c) < R / 2 + 1)) continue;
      bushes.push([PARK.x0 + 1.0, bz, 0.95]); colCircle(PARK.x0 + 1.0, bz, 0.7);
    }
    // 광장 (입구에서 호수까지 포장)
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(13, 48).rotateX(-Math.PI / 2), toon({ color: "#eadcc2" }));
    plaza.position.set(GOAL.x, 0.025, GOAL.z); plaza.receiveShadow = true; park.add(plaza);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(R, 12).rotateX(-Math.PI / 2), toon({ color: "#eadcc2" }));
    path.position.set(sx(6), 0.024, -R / 2 - 4); path.receiveShadow = true; park.add(path);
    // 호수
    const wt = T.water(); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(6, 4);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), toon({ map: wt }));
    lake.scale.set(LAKE.rx, 1, LAKE.rz); lake.position.set(LAKE.x, 0.03, LAKE.z); lake.receiveShadow = true;
    park.add(lake); world.userData.lake = wt;
    const rim = new THREE.Mesh(new THREE.RingGeometry(1, 1.05, 64).rotateX(-Math.PI / 2), toon({ color: "#cdbf9e" }));
    rim.scale.copy(lake.scale); rim.position.copy(lake.position); rim.position.y = 0.032; park.add(rim);
    // 공원 나무
    const pr = T.rng(77);
    for (let i = 0; i < 70; i++) {
      const x = PARK.x0 + 3 + pr() * (pw - 6), z = PARK.z0 + 3 + pr() * (pd - 6);
      const dx = (x - LAKE.x) / (LAKE.rx + 5), dz = (z - LAKE.z) / (LAKE.rz + 5);
      if (dx * dx + dz * dz < 1) continue;
      if (Math.hypot(x - GOAL.x, z - GOAL.z) < 16 || (Math.abs(x - sx(6)) < 6 && z > -20)) continue;
      (pr() < 0.6 ? trees.round : trees.cypress).push([x, z, 0.9 + pr() * 0.6]);
      colCircle(x, z, 0.35);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      if (Math.abs(Math.sin(a) - 1) < 0.3) continue;   // 입구 쪽(남쪽)은 비운다
      benchAt(GOAL.x + Math.cos(a) * 11.5, GOAL.z + Math.sin(a) * 11.5, -a + Math.PI / 2);
    }
    // 입구 간판: 기둥 둘 + 가로 판
    const gx = sx(6), gz = -R / 2 - 1.2;
    for (const o of [-R / 2 - 0.3, R / 2 + 0.3]) {
      solid.box(0.7, 3.8, 0.7, gx + o, 0, gz, "#8b6a4a");
      colBox(gx + o, gz, 0.7, 0.7);
      solid.box(0.9, 0.18, 0.9, gx + o, 3.8, gz, "#6d5038", 0, false);
    }
    solid.box(R + 1.6, 1.1, 0.25, gx, 3.1, gz, "#7a5a3c");
    const board = new THREE.Mesh(new THREE.PlaneGeometry(R + 1.2, 0.9),
      new THREE.MeshBasicMaterial({ map: T.label("상동호수공원", { bg: "#fdf6e4", color: "#3d6b3a", size: 82, w: 1024, h: 128 }) }));
    board.position.set(gx, 3.65, gz + 0.14); park.add(board);
  }

  /* 맵 끝: 초록 철망을 두르고 바깥은 나무숲으로 가린다 */
  {
    const B = BOUNDS;
    fences.push([B.x0, B.z0, B.x1, B.z0], [B.x0, B.z1, B.x1, B.z1], [B.x0, B.z0, B.x0, B.z1], [B.x1, B.z0, B.x1, B.z1]);
    const fr = T.rng(88);
    const ring = (x, z) => { (fr() < 0.5 ? trees.farRound : trees.farCypress).push([x, z, 1.0 + fr() * 0.5]); };
    for (let t = B.x0 - 6; t < B.x1 + 6; t += 3.2) { ring(t, B.z0 - 2.5 - fr() * 3); ring(t, B.z1 + 2.5 + fr() * 3); ring(t + 1.6, B.z0 - 6 - fr() * 3); ring(t + 1.6, B.z1 + 6 + fr() * 3); }
    for (let t = B.z0 - 6; t < B.z1 + 6; t += 3.2) { ring(B.x0 - 2.5 - fr() * 3, t); ring(B.x1 + 2.5 + fr() * 3, t); ring(B.x0 - 6 - fr() * 3, t + 1.6); ring(B.x1 + 6 + fr() * 3, t + 1.6); }
  }

  /* 신호등 (교차로 두 곳) */
  const signal = (x, z, ry) => {
    solid.box(0.18, 4.6, 0.18, x, 0, z, "#9aa1aa", ry, false);
    colCircle(x, z, 0.2);
    const c = Math.cos(ry), s = Math.sin(ry);
    solid.add(new THREE.BoxGeometry(2.6, 0.1, 0.1), "#9aa1aa", mat(x - c * 1.2, 4.5, z + s * 1.2, ry), false);
    const hx = x - c * 2.2, hz = z + s * 2.2;
    solid.box(1.5, 0.48, 0.32, hx, 4.15, hz, "#2c2f33", ry);
    [["#3a3a3a", -0.48], ["#ffb31a", 0], ["#36e07a", 0.48]].forEach(([cc, o], i) => {
      solid.add(new THREE.CircleGeometry(0.16, 14), i === 2 ? cc : "#4a4a4a", mat(hx + c * o + s * 0.17, 4.39, hz - s * o + c * 0.17, ry), false);
    });
  };
  signal(sx(1) + R / 2 + 0.4, sz(4) + R / 2 + 0.4, Math.PI / 2);
  signal(sx(4) + R / 2 + 0.4, sz(4) + R / 2 + 0.4, 0);
  crosswalk(sx(1), sz(4) + R / 2 + 2, true);
  crosswalk(sx(4), sz(4) + R / 2 + 2, true);
  crosswalk(sx(4) - R / 2 - 2, sz(4), false);

  /* 철망 (기찻길·놀이터) — 투명 무늬 판 */
  {
    const fmat = new THREE.MeshToonMaterial({ map: fenceTex(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, gradientMap: ramp });
    const geos = [];
    for (const [ax, az, bx, bz, base = 0] of fences) {
      const len = Math.hypot(bx - ax, bz - az), h = 1.5;
      const g = new THREE.PlaneGeometry(len, h);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 1.5);
      g.applyMatrix4(mat((ax + bx) / 2, base + h / 2, (az + bz) / 2, -Math.atan2(bz - az, bx - ax)));
      geos.push(g);
      for (let t = 0; t <= len; t += 2.5) {
        const k = t / len;
        solid.box(0.07, h + 0.05, 0.07, ax + (bx - ax) * k, base, az + (bz - az) * k, "#2f8a55", 0, false);
      }
    }
    const fm = new THREE.Mesh(mergeGeometries(geos), fmat);
    world.add(fm);
  }

  /* 인스턴스: 창문·덧창·침목·나무·덤불·차양 */
  const inst = (geo, material, list, shadow) => {
    const m = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((mm, i) => m.setMatrixAt(i, mm));
    m.castShadow = shadow; m.receiveShadow = true;
    world.add(m);
    return m;
  };
  inst(new THREE.PlaneGeometry(1, 1), M.win, winList, false);
  inst(new THREE.PlaneGeometry(1, 1), M.shutter, shutterList, false);
  inst(new THREE.BoxGeometry(0.3, 0.12, 2.5), toon({ color: "#8a7766" }), sleeperList, false);
  const treeMat = toon({ vertexColors: true });
  inst(treeGeo("cypress", 3), treeMat, trees.cypress.map(([x, z, s]) => mat(x, 0, z, rand() * 6, s, s * (0.9 + rand() * 0.3), s)), true);
  inst(treeGeo("round", 5), treeMat, trees.round.map(([x, z, s]) => mat(x, 0, z, rand() * 6, s, s, s)), true);
  inst(treeGeo("roundFar", 6), treeMat, trees.farRound.map(([x, z, s]) => mat(x, 0, z, rand() * 6, s * 1.2, s * 1.2, s * 1.2)), false);
  inst(treeGeo("cypress", 4), treeMat, trees.farCypress.map(([x, z, s]) => mat(x, 0, z, rand() * 6, s * 1.2, s * 1.3, s * 1.2)), false);
  console.log("trees", trees.round.length, trees.cypress.length, trees.farRound.length, trees.farCypress.length, "bushes", bushes.length, "windows", winList.length);
  {
    const bg = lumpy(1, 1, 9, 0.22);
    const n = bg.attributes.position.count, c = new Float32Array(n * 3), base = col("#45a23f");
    for (let i = 0; i < n; i++) { const k = 0.7 + 0.5 * Math.max(0, bg.attributes.position.getY(i)); c[i * 3] = base.r * k; c[i * 3 + 1] = base.g * k; c[i * 3 + 2] = base.b * k; }
    bg.setAttribute("color", new THREE.BufferAttribute(c, 3));
    inst(bg, treeMat, bushes.map(([x, z, s]) => mat(x, 0.55 * s + 0.35, z, rand() * 6, s, s * 0.85, s)), true);
  }
  if (canopies.length) {
    const cm = new THREE.MeshToonMaterial({ color: "#7fb8e8", transparent: true, opacity: 0.7, gradientMap: ramp });
    inst(new THREE.BoxGeometry(2.8, 0.06, 3.8), cm, canopies.map(([x, y, z]) => mat(x, y, z, 0, 1, 1, 1, 0.08, 0)), false);
  }

  world.add(solid.build(M.solid, M.edge));
  world.add(walls.build(), grays.build());
  const flatMesh = flat.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
  flatMesh.children.forEach(m => { m.castShadow = false; });
  world.add(flatMesh);

  // 건널목 경보등 (빨간 불, 나중에 깜빡이게)
  const lampMat = new THREE.MeshBasicMaterial({ color: "#5a1414" });
  const lampMesh = inst(new THREE.CircleGeometry(0.12, 14), lampMat, lamps.map(([x, y, z]) => mat(x, y, z, z < RAIL_Z ? Math.PI : 0)), false);

  indexColliders();
  return { world, lampMat, lake: world.userData.lake };
}

function stripeTex(a, b) {
  const c = document.createElement("canvas"); c.width = 64; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = b; g.fillRect(0, 0, 64, 64);
  g.fillStyle = a;
  for (let i = -64; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i - 48, 64); g.lineTo(i - 64, 64); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 4);
  return t;
}

function fenceTex() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 128;
  const g = c.getContext("2d");
  g.strokeStyle = "#2f8a55"; g.lineWidth = 3;
  for (let i = -128; i < 256; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke();
  }
  g.lineWidth = 8; g.beginPath(); g.moveTo(0, 4); g.lineTo(128, 4); g.stroke();
  g.beginPath(); g.moveTo(0, 124); g.lineTo(128, 124); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
