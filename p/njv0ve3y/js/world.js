// 설계도(map.js)를 3D 상자로 조립한다. 같은 재질끼리 하나로 합쳐서 그리기 · 충돌 · 시야 검사를 가볍게.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FLOORS, CS, FH, SLAB, W, BUILD_H, ROOMS, RAMPS, DOORS, DOOR_H, RAILS, cell, findChar, roomAt } from "./map.js?v=20261113155403";

const FLOOR_COLORS = [0x8d8f96, 0x9c8c78, 0x7f9088];

export function buildWorld(scene) {
  const solid = new THREE.Group();     // 부딪히는 것 (Octree · 시야 검사용)
  const deco = new THREE.Group();      // 보이기만 하는 것
  const buckets = new Map();           // 재질 키 → 상자 목록
  const add = (mat, w, h, d, x, y, z, rotZ = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotZ) g.rotateZ(rotZ);
    g.translate(x, y, z);
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(g);
  };

  const std = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  const mats = {
    wall: std(0xe2ddd1),
    box: std(0x6e5a48),
    ramp: std(0xc9a227),
    roof: std(0x55585f),
    rail: new THREE.MeshStandardMaterial({ color: 0x30333a, roughness: 0.4, metalness: 0.6 }),
    fence: new THREE.MeshBasicMaterial({ visible: false }),   // 길 끝 안 보이는 울타리
  };
  FLOOR_COLORS.forEach((c, k) => (mats["floor" + k] = std(c, 0.7)));

  const wallH = FH - SLAB;
  FLOORS.forEach((rows, k) => {
    const base = k * FH;
    rows.forEach((row, y) => {
      // 같은 글자가 이어진 묶음을 상자 하나로
      const runs = (test, fn) => {
        let x = 0;
        while (x < row.length) {
          if (!test(row[x])) { x++; continue; }
          const x0 = x; while (x < row.length && test(row[x])) x++;
          fn(x0, x - 1);
        }
      };
      const z = (y + 0.5) * CS;
      runs((c) => c !== " " && c !== "~", (a, b) => add("floor" + k, (b - a + 1) * CS, SLAB, CS, (a + b + 1) / 2 * CS, base - SLAB / 2, z));
      runs((c) => c === "#", (a, b) => add("wall", (b - a + 1) * CS, wallH, CS, (a + b + 1) / 2 * CS, base + wallH / 2, z));
      runs((c) => c === "X", (a, b) => add("fence", (b - a + 1) * CS, 4, CS, (a + b + 1) / 2 * CS, base + 2, z));
      for (let x = 0; x < row.length; x++) {
        if (row[x] === "B") add("box", CS * 0.92, 1.1, CS * 0.92, (x + 0.5) * CS, base + 0.55, z);
      }
    });
  });
  // 문 위 벽 (문틀 윗부분)
  for (const d of DOORS) {
    const h = wallH - DOOR_H;
    add("wall", CS, h, CS, (d.x + 0.5) * CS, d.k * FH + DOOR_H + h / 2, (d.y + 0.5) * CS);
  }
  // 계단 구멍 둘레 난간
  for (const r of RAILS) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), along = r.x1 !== r.x0;
    add("rail", along ? len : 0.08, 1.0, along ? 0.08 : len, (r.x0 + r.x1) / 2, r.k * FH + 0.5, (r.z0 + r.z1) / 2);
  }
  // 1층 바닥 밑 두꺼운 땅: 무엇에 밀려도 맵 밖 아래로 빠지지 않게
  const rowsN = FLOORS[0].length;
  add("floor0", W * CS + 20, 4, rowsN * CS + 20, W * CS / 2, -SLAB - 2, rowsN * CS / 2);
  // 지붕
  add("roof", W * CS, SLAB, BUILD_H * CS, W * CS / 2, FLOORS.length * FH - SLAB / 2, BUILD_H * CS / 2);

  // 계단: 부딪히는 건 매끈한 경사판, 보이는 건 계단 모양
  for (const r of RAMPS) {
    const run = r.len * CS, ang = Math.atan2(FH, run), hyp = Math.hypot(run, FH);
    const cx = (r.x0 * CS + (r.x1 + 1) * CS) / 2, cz = (r.y + 0.5) * CS, base = r.k * FH;
    const t = 0.25;
    const steps = r.len * 3, sw = run / steps, sh = FH / steps;
    // 판 윗면이 계단 칸들의 앞 모서리를 잇도록: (x0 - 한 칸, base) → (x1+1 - 한 칸, base+FH).
    // (예전엔 칸 뒤 모서리를 이어서 발이 계단 칸 속으로 최대 한 칸 높이만큼 묻혔다)
    add("ramp", hyp, t, CS, cx - sw + Math.sin(ang) * t / 2, base + FH / 2 - Math.cos(ang) * t / 2, cz, ang);
    // 맨 윗칸: 경사판 끝과 윗층 바닥 사이
    add("ramp", sw + 0.06, t, CS, (r.x1 + 1) * CS - sw / 2, base + FH - t / 2, cz);
    // 계단 밑은 꽉 막는다 (보이는 계단도 바닥까지 꽉 찬 덩어리). 칸마다 보이는 계단 높이보다 살짝 낮게 → 경사판 위로 안 튀어나온다
    for (let i = 1; i < steps; i++) {
      const top = (i + 1) * sh - 0.04;
      add("ramp", sw, top, CS, r.x0 * CS + (i + 0.5) * sw, base + top / 2, cz);
    }
    for (let i = 0; i < steps; i++) {
        const g = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.06, CS * 0.98), mats.wall);
      g.position.set(r.x0 * CS + (i + 0.5) * sw, base + (i + 1) * sh + 0.01, cz);
      deco.add(g);
    }
  }

  for (const [key, list] of buckets) {
    const m = new THREE.Mesh(mergeGeometries(list), mats[key]);
    m.name = key;
    solid.add(m);
  }
  scene.add(solid, deco);

  // 방마다 따뜻한 천장 등 (복도는 세 개). 그림자 없는 가벼운 점광원 — 나중에 Blender 에서 조명을 구워 넣으면 줄인다
  const lamps = [];
  // 방마다 하나: 캐릭터 · Tripo 소품을 비추는 실시간 등. 건물 자체는 Blender 에서 조명을 구워 넣었다(방 크기별로 여러 개)
  for (const r of ROOMS) {
    const n = r.type === "hall" ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const cx = (r.x0 + (r.x1 - r.x0 + 1) * (i + 0.5) / n) * CS, cz = ((r.y0 + r.y1 + 1) / 2) * CS;
      const big = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) > 60;
      lamps.push({ x: cx, y: r.k * FH + FH - 0.35, z: cz, k: r.k, power: big ? 40 : 22, range: big ? 16 : 11 });
    }
  }
  // 실제 등은 4개만 만들어 두고, 매 프레임 카메라에서 가까운 방 등 자리로 옮긴다.
  // (등이 많을수록 캐릭터 · 소품을 그릴 때 느려진다. 개수는 그대로라 셰이더를 다시 만들지 않는다)
  const pool = [];
  for (let i = 0; i < 4; i++) {
    const l = new THREE.SpotLight(0xffd3a0, 0, 11, Math.PI / 2.4, 0.75, 1.4);
    scene.add(l, l.target); pool.push(l);
  }
  const updateLamps = (p) => {
    const kNow = Math.floor((p.y + 0.6) / FH);
    const near = lamps.map((L) => ({ L, d: (L.x - p.x) ** 2 + (L.z - p.z) ** 2 + (L.k === kNow ? 0 : 400) }))
      .sort((a, b) => a.d - b.d);
    pool.forEach((l, i) => {
      const L = near[i] && near[i].L;
      if (!L) { l.intensity = 0; return; }
      l.position.set(L.x, L.y, L.z); l.target.position.set(L.x, L.y - FH, L.z);
      l.intensity = L.power; l.distance = L.range;
    });
  };

  // 건물 앞 가로등
  const street = new THREE.PointLight(0xffc98a, 14, 18, 1.4);
  street.position.set(7.5 * CS, 4.2, 22 * CS);
  scene.add(street);

  // 매튜 디제잉 부스
  const dj = findChar("D")[0];
  let djLight = null;
  if (dj) {
    const booth = new THREE.Mesh(new THREE.BoxGeometry(CS * 1.6, 1.0, 0.6), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    booth.position.set((dj.x + 0.5) * CS, dj.k * FH + 0.5, (dj.y + 0.5) * CS - 0.75);   // 매튜 앞(문 쪽)
    deco.add(booth);
    djLight = new THREE.PointLight(0xff3df2, 12, 9, 1.4);
    djLight.position.set((dj.x + 0.5) * CS, dj.k * FH + 2.6, (dj.y + 0.5) * CS);
    scene.add(djLight);
  }

  // 비상구 표지판: 계단실로 들어가는 문 바깥쪽 위 (초록 빛은 Blender 에서 구워 넣었다)
  const signs = new THREE.Group();
  const signMat = new THREE.MeshBasicMaterial({ map: exitTexture(), toneMapped: false });
  const signGeo = new THREE.PlaneGeometry(0.56, 0.24);
  signGeo.translate(0, 0, 0);
  for (const d of DOORS) {
    const sides = d.axis === "x"
      ? [[d.x, d.y - 1, (d.x + 0.5) * CS, d.y * CS, Math.PI], [d.x, d.y + 1, (d.x + 0.5) * CS, (d.y + 1) * CS, 0]]
      : [[d.x - 1, d.y, d.x * CS, (d.y + 0.5) * CS, -Math.PI / 2], [d.x + 1, d.y, (d.x + 1) * CS, (d.y + 0.5) * CS, Math.PI / 2]];
    const types = sides.map(([x, y]) => (roomAt(d.k, x, y) || {}).type);
    sides.forEach(([, , px, pz, ry], i) => {
      if (types[1 - i] !== "stair" || types[i] === "stair") return;
      // 복도에서 멀리서도 보이게 벽에서 튀어나온 양면 표지판 (실제 건물처럼). 앞뒤 두 장
      const out = 0.34;
      for (const flip of [0, Math.PI]) {
        const m = new THREE.Mesh(signGeo, signMat);
        m.rotation.y = ry + Math.PI / 2 + flip;
        m.position.set(px + Math.sin(ry) * out, d.k * FH + DOOR_H + 0.5, pz + Math.cos(ry) * out);
        m.position.x += Math.sin(m.rotation.y) * 0.012; m.position.z += Math.cos(m.rotation.y) * 0.012;
        signs.add(m);
      }
      // 벽에 붙는 받침
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, out), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      arm.rotation.y = ry;
      arm.position.set(px + Math.sin(ry) * out / 2, d.k * FH + DOOR_H + 0.64, pz + Math.cos(ry) * out / 2);
      signs.add(arm);
    });
  }
  scene.add(signs);

  // 건물 정문 유리 자동문 (양쪽으로 미끄러져 벽 속으로 열린다). 시작 인트로에서 열리고 그 뒤로 계속 열려 있다
  const front = DOORS.find((d) => d.front);
  let frontDoor = null;
  if (front) {
    const X0 = front.x * CS, X1 = (front.x + 1) * CS, Z = (front.y + 1) * CS - 0.06, base = front.k * FH;
    const g = new THREE.Group();
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe0ee, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false });
    const alu = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.8 });
    const w = (X1 - X0 - 0.14) / 2, h = DOOR_H - 0.08;
    const panels = [-1, 1].map((side) => {
      const p = new THREE.Group();
      p.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), glass));
      for (const [bw, bh, bx, by] of [[w, 0.06, 0, h / 2 - 0.03], [w, 0.1, 0, -h / 2 + 0.05], [0.04, h, -w / 2 + 0.02, 0], [0.04, h, w / 2 - 0.02, 0]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.04), alu);
        b.position.set(bx, by, 0); p.add(b);
      }
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.06), alu);
      handle.position.set(-side * (w / 2 - 0.12), 0, 0.04); p.add(handle);
      p.userData.closedX = (X0 + X1) / 2 + side * (w / 2 + 0.005);
      p.userData.side = side;
      p.position.set(p.userData.closedX, base + 0.04 + h / 2, Z);
      g.add(p);
      return p;
    });
    scene.add(g);
    // 정문 위 벽에 'POV' 간판 (불 들어온 글자). 문 위 작은 등(약 2.6m) 위쪽에
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.66), new THREE.MeshBasicMaterial({ map: povSignTexture(), toneMapped: false }));
    sign.position.set((X0 + X1) / 2, base + 2.97, Z + 0.1);
    scene.add(sign);
    // open: 0 = 닫힘, 1 = 활짝 (벽 속으로 거의 다 들어감)
    frontDoor = { set(open) { for (const p of panels) p.position.x = p.userData.closedX + p.userData.side * (w - 0.08) * open; }, center: new THREE.Vector3((X0 + X1) / 2, base, Z) };
    frontDoor.set(0);
  }

  return { solid, deco, djLight, dj, updateLamps, signs, frontDoor };
}

// 정문 간판: 어두운 판 + 빛나는 흰 'POV' 글자
function povSignTexture() {
  const c = document.createElement("canvas");
  c.width = 640; c.height = 200;
  const x = c.getContext("2d");
  x.fillStyle = "#0d0d10"; x.fillRect(0, 0, 640, 200);
  x.strokeStyle = "#3a3a42"; x.lineWidth = 8; x.strokeRect(4, 4, 632, 192);
  x.font = "900 150px 'Noto Sans KR', Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.shadowColor = "#fff6dd"; x.shadowBlur = 28; x.fillStyle = "#fffaf0";
  x.fillText("POV", 320, 108);
  x.shadowBlur = 0; x.fillText("POV", 320, 108);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// 초록 비상구 표지판 그림 (달리는 사람 + 문 + 글자)
function exitTexture() {
  const c = document.createElement("canvas");
  c.width = 384; c.height = 164;
  const x = c.getContext("2d");
  x.fillStyle = "#12a24a"; x.fillRect(0, 0, 384, 164);
  x.strokeStyle = "#e9fff0"; x.lineWidth = 6; x.strokeRect(6, 6, 372, 152);
  x.fillStyle = "#fff"; x.strokeStyle = "#fff"; x.lineCap = "round"; x.lineJoin = "round";
  // 문
  x.lineWidth = 7; x.strokeRect(150, 30, 44, 104);
  // 달리는 사람
  x.beginPath(); x.arc(98, 40, 13, 0, Math.PI * 2); x.fill();
  x.lineWidth = 14;
  x.beginPath(); x.moveTo(92, 60); x.lineTo(80, 98); x.stroke();                      // 몸
  x.beginPath(); x.moveTo(90, 66); x.lineTo(116, 78); x.lineTo(132, 66); x.stroke();   // 앞팔
  x.beginPath(); x.moveTo(88, 68); x.lineTo(66, 80); x.lineTo(52, 72); x.stroke();     // 뒷팔
  x.beginPath(); x.moveTo(80, 98); x.lineTo(104, 112); x.lineTo(112, 138); x.stroke(); // 앞다리
  x.beginPath(); x.moveTo(80, 98); x.lineTo(64, 122); x.lineTo(40, 124); x.stroke();   // 뒷다리
  // 글자
  x.font = "900 52px 'Noto Sans KR', sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText("비상구", 290, 70);
  x.font = "700 24px 'Noto Sans KR', sans-serif";
  x.fillText("EXIT  →", 290, 118);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
