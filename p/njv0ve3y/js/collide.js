// 부딪히는 모양을 눈에 보이는 건물에 맞춘다.
//  - 벽 · 바닥 · 천장 · 문 위 · 난간 · 계단 경사판 · 투명 울타리: 회색 상자(world.js).
//    Blender 벽도 같은 설계도 칸으로 만들어서 경계가 똑같다.
//  - 가구 · DJ 부스 · 소품: 보이는 Blender 모양을 25cm 격자에 찍어 실제 차지하는 자리를 구하고,
//    붙은 칸끼리 큰 상자로 합친다. (삼각형 6만 개를 그대로 쓰면 충돌 준비에 수십 초가 걸린다)
//  - Tripo 소품(소파 · 자판기 …): 겉을 감싸는 상자
import * as THREE from "three";
import { Octree } from "three/addons/math/Octree.js";
import { RAMPS, CS, FH, FLOORS } from "./map.js?v=20261113161434";

// three.js Octree 는 깊이 제한(maxLevel)을 무시하고 늘 16단계까지 쪼갠다. 큰 벽 · 바닥 삼각형이 많이 만나는
// 곳에서 칸이 끝없이 늘어나 준비에 몇 초씩 걸렸다(회색 상자만으로도 약 2.8초). 7단계에서 멈춘다.
const MAX_LEVEL = 7;
export class FastOctree extends Octree {
  split(level) {
    if (!this.box) return;
    const sub = [];
    const half = this.box.max.clone().sub(this.box.min).multiplyScalar(0.5);
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
      const box = new THREE.Box3();
      box.min.copy(this.box.min).add(new THREE.Vector3(x, y, z).multiply(half));
      box.max.copy(box.min).add(half);
      sub.push(new FastOctree(box));
    }
    let tri;
    while ((tri = this.triangles.pop())) for (const t of sub) if (t.box.intersectsTriangle(tri)) t.triangles.push(tri);
    for (const t of sub) {
      const len = t.triangles.length;
      if (len > 8 && level < MAX_LEVEL) t.split(level + 1);
      if (len !== 0) this.subTrees.push(t);
    }
    return this;
  }
}

const G = 0.25;            // 격자 한 칸 (m)
const LOW = 0.05, HIGH = 2.2;   // 이 높이 사이에 있는 것만 가구로 본다 (깔개 · 천장 등은 빼고)
const WALL_GAP = 0.16;     // 벽에서 이만큼 안쪽은 벽에 붙은 장식(블라인드 · 포스터 · 문틀)으로 보고 뺀다

const inRamp = (k, x, z) => RAMPS.some((r) => r.k === k &&
  x > r.x0 * CS - 0.6 && x < (r.x1 + 1) * CS + 0.1 && z > r.y * CS - 0.05 && z < (r.y + 1) * CS + 0.05);

const isWall = (k, x, z) => {
  const cx = Math.floor(x / CS), cy = Math.floor(z / CS);
  const row = FLOORS[k] && FLOORS[k][cy];
  return !row || cx < 0 || cx >= row.length || row[cx] === "#" || row[cx] === " " || row[cx] === "~";
};
const nearWall = (k, x, z) => isWall(k, x, z) || isWall(k, x + WALL_GAP, z) || isWall(k, x - WALL_GAP, z) ||
  isWall(k, x, z + WALL_GAP) || isWall(k, x, z - WALL_GAP);

function bakedRoot(o) {
  for (let p = o; p; p = p.parent) if (/^BAKE_F\d/.test(p.name || "")) return true;
  return false;
}

export function buildCollision(world, envRoots) {
  const t0 = performance.now();
  const group = new THREE.Group();
  const boxes = [];
  const addBox = (x0, x1, y0, y1, z0, z1) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    boxes.push(g);
  };
  // 층마다 격자: 칸마다 가구 꼭대기 높이(0 = 빈칸)
  const cols = Math.ceil(Math.max(...FLOORS.map((f) => Math.max(...f.map((r) => r.length)))) * CS / G);
  const rows = Math.ceil(Math.max(...FLOORS.map((f) => f.length)) * CS / G);
  const grids = FLOORS.map(() => new Float32Array(cols * rows));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let props = 0, used = 0;
  for (const root of envRoots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      // Tripo 소품: 겉 상자
      if (/^PROP_/.test(o.name || "") && !/^PROP_/.test((o.parent && o.parent.name) || "")) {
        const box = new THREE.Box3().setFromObject(o, true);
        if (!box.isEmpty()) {
          const s = box.getSize(new THREE.Vector3()), m = box.getCenter(new THREE.Vector3());
          addBox(m.x - s.x * 0.46, m.x + s.x * 0.46, box.min.y, box.max.y, m.z - s.z * 0.46, m.z + s.z * 0.46);
          props++;
        }
        return;
      }
      if (!o.isMesh || !bakedRoot(o)) return;
      const p = o.geometry.attributes.position, idx = o.geometry.index;
      const n = idx ? idx.count : p.count;
      for (let t = 0; t < n; t += 3) {
        a.fromBufferAttribute(p, idx ? idx.getX(t) : t).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(p, idx ? idx.getX(t + 1) : t + 1).applyMatrix4(o.matrixWorld);
        c.fromBufferAttribute(p, idx ? idx.getX(t + 2) : t + 2).applyMatrix4(o.matrixWorld);
        const ymin = Math.min(a.y, b.y, c.y), ymax = Math.max(a.y, b.y, c.y);
        const k = Math.floor((ymin + 0.1) / FH);
        if (k < 0 || k >= FLOORS.length) continue;
        const base = k * FH;
        if (ymax < base + LOW || ymin > base + HIGH) continue;
        const mx = (a.x + b.x + c.x) / 3, mz = (a.z + b.z + c.z) / 3;
        if (nearWall(k, mx, mz) || inRamp(k, mx, mz)) continue;
        used++;
        const top = Math.min(ymax, base + HIGH) - base;
        const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x) / G)), x1 = Math.min(cols - 1, Math.floor(Math.max(a.x, b.x, c.x) / G));
        const z0 = Math.max(0, Math.floor(Math.min(a.z, b.z, c.z) / G)), z1 = Math.min(rows - 1, Math.floor(Math.max(a.z, b.z, c.z) / G));
        const gr = grids[k];
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
          const i = z * cols + x;
          if (top > gr[i]) gr[i] = top;
        }
      }
    });
  }
  // 붙은 칸끼리 직사각형으로 합치기 (높이는 0.3m 단위로 묶어서)
  const q = (h) => (h > 0 ? Math.ceil(h / 0.3) : 0);
  grids.forEach((gr, k) => {
    const seen = new Uint8Array(cols * rows);
    for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
      const i = z * cols + x;
      const h = q(gr[i]);
      if (!h || seen[i]) continue;
      let x1 = x;
      while (x1 + 1 < cols && !seen[z * cols + x1 + 1] && q(gr[z * cols + x1 + 1]) === h) x1++;
      let z1 = z;
      for (;;) {
        const nz = z1 + 1;
        if (nz >= rows) break;
        let ok = true;
        for (let xx = x; xx <= x1; xx++) if (seen[nz * cols + xx] || q(gr[nz * cols + xx]) !== h) { ok = false; break; }
        if (!ok) break;
        z1 = nz;
      }
      for (let zz = z; zz <= z1; zz++) for (let xx = x; xx <= x1; xx++) seen[zz * cols + xx] = 1;
      addBox(x * G, (x1 + 1) * G, k * FH, k * FH + h * 0.3, z * G, (z1 + 1) * G);
    }
  });
  const furniture = boxes.length - props;
  // 회색 상자 구조(벽 · 바닥 · 문 위 · 난간 · 계단 · 울타리). 가구 표시 'B' 상자는 위 격자가 대신한다
  for (const m of world.solid.children) if (m.name !== "box") group.add(new THREE.Mesh(m.geometry));
  for (const g of boxes) group.add(new THREE.Mesh(g));
  group.updateMatrixWorld(true);
  const oct = new FastOctree();
  oct.fromGraphNode(group);
  return { oct, used, furniture, props, ms: Math.round(performance.now() - t0) };
}
