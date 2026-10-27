/* 감스트의 전동 스쿠터 라이딩 — 시작점.
   렌더러·빛·하늘 + 주행(부딪힘) + 따라가는 카메라 + 화면 UI 연결.
   사람·스쿠터 3D 모델(Tripo)은 assets/models/ 에 들어오면 임시 모형과 갈아 끼운다. */
import * as THREE from "../vendor/three.module.min.js";
import { buildWorld, collide, inWater, sx, sz, L, R, GOAL } from "./world.js";
import { createGame, unlockAudio, engineUpdate, skidUpdate, NPCS, boostSfx, driftSfx, voicesReady } from "./game.js";
import { loadRiderRig } from "./rider.js";
import * as T from "./textures.js";

const cv = document.getElementById("cv3");
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const FOG = new THREE.Color("#e6e3f5");
scene.fog = new THREE.Fog(FOG, 110, 340);
scene.background = FOG;
const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 900);

/* 하늘: 안쪽에서 보는 큰 공 + 뭉게구름 */
const skyBall = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16),
  new THREE.MeshBasicMaterial({ map: T.sky(), side: THREE.BackSide, fog: false, depthWrite: false }));
skyBall.renderOrder = -1;
scene.add(skyBall);
{
  const r = T.rng(9);
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.cloud(100 + i), fog: false, depthWrite: false, transparent: true, opacity: 0.95 }));
    const a = r() * Math.PI * 2, d = 380 + r() * 120;
    s.position.set(Math.cos(a) * d, 70 + r() * 90, Math.sin(a) * d);
    s.scale.set(140 + r() * 120, 60 + r() * 40, 1);
    skyBall.add(s);
  }
}

/* 빛: 하늘빛(푸른 위·연보라 아래) + 따뜻한 해. 그늘이 검지 않고 보랏빛이 돌게 */
scene.add(new THREE.HemisphereLight("#cdd6ff", "#a597d8", 1.35));
const sun = new THREE.DirectionalLight("#fff1dc", 3.1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const SH = 48;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 220 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(-0.62, 0.78, 0.42).normalize();   // 조금 낮게 — 담장·나무 그림자가 길 위로 길게

const W = buildWorld(scene);

/* ---------- 임시 스쿠터 + 사람 (Tripo 모델 오기 전까지) ---------- */
const player = new THREE.Group();
const body = new THREE.Group();     // 기울기·흔들림은 여기에
player.add(body);
{
  const m = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: T.toonRamp() });
  const add = (geo, c, x, y, z) => { const o = new THREE.Mesh(geo, m(c)); o.position.set(x, y, z); o.castShadow = true; body.add(o); return o; };
  add(new THREE.CylinderGeometry(0.27, 0.27, 0.12, 20).rotateZ(Math.PI / 2), "#222", 0, 0.27, -0.55);
  add(new THREE.CylinderGeometry(0.27, 0.27, 0.12, 20).rotateZ(Math.PI / 2), "#222", 0, 0.27, 0.55);
  add(new THREE.BoxGeometry(0.16, 0.16, 1.1), "#f4f4f4", 0, 0.42, 0);
  add(new THREE.BoxGeometry(0.12, 0.8, 0.14), "#f4f4f4", 0, 0.75, -0.6);
  add(new THREE.BoxGeometry(0.62, 0.05, 0.05), "#333", 0, 1.15, -0.62);
  add(new THREE.BoxGeometry(0.34, 0.1, 0.42), "#222", 0, 0.72, 0.32);
  add(new THREE.BoxGeometry(0.6, 0.65, 0.42), "#28a65a", 0, 1.15, 0.28);
  add(new THREE.BoxGeometry(0.5, 0.25, 0.6), "#33405e", 0, 0.82, 0.12);
  add(new THREE.SphereGeometry(0.2, 16, 12), "#e9c3a0", 0, 1.62, 0.25);
  add(new THREE.SphereGeometry(0.23, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), "#151515", 0, 1.66, 0.25);
}
scene.add(player);
// Tripo 모델이 오면 임시 모형을 치우고 갈아 끼운다 (없으면 임시 모형 그대로)
// 사람·스쿠터를 실제 크기보다 키운다 (사용자 요청 — 화면에서 주인공이 잘 보이게). 동네는 그대로
const BIG = 1.8;
body.scale.setScalar(BIG);
let rig = null, headH = 2.35 * BIG;
// 처음부터 감스트로 보이게: 모델이 다 들어오기 전엔 임시 모형을 숨겨 두고, 출발 버튼도 잠가 둔다
body.visible = false;
let modelDone = false;
const riderLoad = loadRiderRig().then(r => {
  rig = r;
  body.clear();
  body.add(r.holder);
  headH = r.headTop * BIG + 0.35;
}).catch(e => console.warn("3D 모델 없음 — 임시 모형으로", e.message))
  .finally(() => { modelDone = true; body.visible = true; });

/* ---------- 주행 ---------- */
const S = { x: sx(1), z: sz(6) + 1, heading: 0, speed: 0, steer: 0,   // heading 0 = 북쪽(-z)
  vx: 0, vz: 0, side: 0, drift: false, driftT: 0, boostWin: 0, boostT: 0 };
const MAX = 9, ACC = 7, BRAKE = 12, DRAG = 2.2, TURN = 1.9, RAD = 0.95;
/* 드리프트·부스터 — 범퍼카 2026 과 같은 규칙 (값은 스쿠터 크기에 맞게 줄였다).
   Shift + 방향키로 미끄러지며 크게 돌고, 드리프트가 끝날 때(또는 막바지에) ↑ 를 "다시" 누르면 부스터.
   부스터는 살짝만 — 최고 속도의 1.5배까지, 0.9초 */
const GRIP = 10, GRIP_DRIFT = 0.8;          // 드리프트 땐 옆으로 거의 안 붙잡아 가던 방향으로 밀려난다 (관성)
const DRIFT_MIN_V = 3.6, DRIFT_READY = 0.12, BOOST_WINDOW = 2.0;   // 드리프트 끝나고 2초 안에 ↑ 면 부스터
const BOOSTV = MAX * 1.5, BOOST_KICK = MAX * 1.3, BOOST_T = 0.9;
const keys = {};
const touch = { up: false, down: false, left: false, right: false, drift: false };
let upPressed = false;            // 이번 걸음에 ↑ 를 "새로" 눌렀나 (부스터)

// 테스트·스크린샷용: ?at=x,z,각도  ?cam=x,y,z,lx,ly,lz  ?play (시작 화면 건너뛰기)
const Q = new URLSearchParams(location.search);
if (Q.get("at")) { const [a, b, h] = Q.get("at").split(",").map(Number); S.x = a; S.z = b; S.heading = (h || 0) * Math.PI / 180; }
const fixedCam = Q.get("cam") ? Q.get("cam").split(",").map(Number) : null;

function drive(dt, canDrive) {
  const up = canDrive && (keys.ArrowUp || keys.KeyW || touch.up);
  const down = canDrive && (keys.ArrowDown || keys.KeyS || touch.down);
  const left = canDrive && (keys.ArrowLeft || keys.KeyA || touch.left);
  const right = canDrive && (keys.ArrowRight || keys.KeyD || touch.right);
  const driftKey = canDrive && (keys.ShiftLeft || keys.ShiftRight || touch.drift);
  const boostKey = canDrive && upPressed;
  upPressed = false;
  const wet = inWater(S.x, S.z);
  const fx = -Math.sin(S.heading), fz = -Math.cos(S.heading), lx = -fz, lz = fx;
  let vf = S.vx * fx + S.vz * fz, vl = S.vx * lx + S.vz * lz;
  const want = (left ? 1 : 0) - (right ? 1 : 0);

  // 드리프트 — 미끄러지는 동안은 옆으로 잘 안 붙잡고, 더 많이 돈다
  if (driftKey && want !== 0 && vf > DRIFT_MIN_V && !S.drift && !wet) { S.drift = true; S.driftT = 0; driftSfx(); }
  if (S.drift) {
    S.driftT += dt;
    if (!driftKey || want === 0 || vf < 2.5) {
      S.drift = false;
      if (S.driftT >= DRIFT_READY) { S.boostWin = BOOST_WINDOW; ui.toast("↑ 누르면 부스터!"); }
    }
  }
  // 부스터: 드리프트 막바지이거나 막 끝난 순간에 ↑ 를 다시 눌러야 한다
  if (boostKey && (S.boostWin > 0 || (S.drift && S.driftT >= DRIFT_READY))) {
    S.drift = false; S.boostWin = 0; S.boostT = BOOST_T;
    if (vf < BOOST_KICK) vf = BOOST_KICK;
    boostSfx(); ui.toast("부스터!"); boostFx = 1;
  }
  S.boostWin = Math.max(0, S.boostWin - dt);
  S.boostT = Math.max(0, S.boostT - dt);

  const max = S.boostT > 0 ? BOOSTV : wet ? MAX * 0.4 : MAX;
  if (up) vf += ACC * dt * (wet ? 0.5 : 1);
  else if (down) vf -= (vf > 0 ? BRAKE : ACC * 0.5) * dt;
  else vf -= Math.sign(vf) * Math.min(Math.abs(vf), DRAG * dt);
  if (vf > max) {
    if (S.boostT <= 0 && vf < max + 0.6) vf = max;                // 평소엔 최고 속도에서 멈춘다
    else vf -= (vf - max) * Math.min(1, 4 * dt);                  // 부스터가 끝나면 서서히 원래 속도로
  }
  vf = Math.max(-2.5, vf);
  // 붙잡는 힘은 드리프트가 끝나도 바로 돌아오지 않고 서서히 — 미끄러지던 몸이 자연스럽게 다시 붙는다
  S.grip = S.grip == null ? GRIP : S.grip + ((S.drift ? GRIP_DRIFT : GRIP) - S.grip) * Math.min(1, dt * (S.drift ? 10 : 3));
  // 옆으로 미끄러지던 빠르기를 없애지 않고 앞쪽으로 돌려준다 — 드리프트 중·끝날 때 멈칫하지 않는다
  const vAll = Math.hypot(vf, vl);
  vl *= Math.exp(-S.grip * dt);
  if (vf > 0) vf = Math.sqrt(Math.max(0, vAll * vAll - vl * vl));

  S.steer += (want - S.steer) * Math.min(1, dt * 8);
  // 빠를수록 잘 돌고, 멈춰 있어도 제자리에서 조금은 돈다 (벽 앞에서 빠져나오기)
  const turnK = Math.max(S.touching ? 0.9 : 0.5, Math.min(1, Math.abs(vf) / 3)) * (vf < -0.1 ? -1 : 1);
  S.heading += S.steer * TURN * (S.drift ? 1.55 : 1) * turnK * dt;

  S.vx = fx * vf + lx * vl; S.vz = fz * vf + lz * vl;
  // 미끄러지는 동안 전체 빠르기가 최고 속도를 넘지 않게
  const vtot = Math.hypot(S.vx, S.vz), vcap = S.boostT > 0 ? BOOSTV : MAX;
  if (S.drift && vtot > vcap) { S.vx *= vcap / vtot; S.vz *= vcap / vtot; }
  const r = collide(S.x + S.vx * dt, S.z + S.vz * dt, RAD);
  S.touching = r.hit;
  if (r.hit) {
    // 벽 쪽으로 가는 몫만 없앤다 — 비스듬하면 벽을 따라 미끄러지고, 핸들만 꺾으면 바로 빠져나온다
    const into = S.vx * r.nx + S.vz * r.nz;
    if (into < 0) { S.vx -= r.nx * into; S.vz -= r.nz * into; }
    if (S.boostT > 0 && into < -4) S.boostT = 0;                 // 정면으로 박으면 부스터 끝
  }
  S.x = r.x; S.z = r.z;
  const nfx = -Math.sin(S.heading), nfz = -Math.cos(S.heading);
  S.speed = S.vx * nfx + S.vz * nfz;
  S.side = S.vx * -nfz + S.vz * nfx;
  S.wet = wet;
}

/* 드리프트 연기·부스터 불꽃 (작은 빛 알갱이) */
let boostFx = 0;
const fxTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const puffs = [];
function puff(x, y, z, color, size, life, vx, vy, vz) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex, color, transparent: true, depthWrite: false }));
  sp.position.set(x, y, z); sp.scale.setScalar(size);
  sp.userData = { life, max: life, vx, vy, vz, size };
  scene.add(sp); puffs.push(sp);
}
function updateFx(dt) {
  const fx = -Math.sin(S.heading), fz = -Math.cos(S.heading);
  const rearX = S.x - fx * 1.0 * BIG, rearZ = S.z - fz * 1.0 * BIG;
  if (S.drift && Math.abs(S.side) > 0.8)
    for (let i = 0; i < 2; i++) puff(rearX + (Math.random() - 0.5) * 1.4, 0.45, rearZ + (Math.random() - 0.5) * 1.4, "#b7b0cf", 1.5, 0.8, (Math.random() - 0.5), 1.0, (Math.random() - 0.5));
  if (S.boostT > 0) for (let i = 0; i < 4; i++)
    // 부스터: 뒤로 하얀 연기를 뿜는다 (불꽃 대신 — 2026-10-26 사용자 요청)
    puff(rearX + (Math.random() - 0.5) * 0.5, 0.5 * BIG + Math.random() * 0.3, rearZ + (Math.random() - 0.5) * 0.5,
      Math.random() < 0.6 ? "#ffffff" : "#e9e7f2", 1.4 + Math.random() * 0.7, 0.8,
      -fx * 7 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 0.6, -fz * 7 + (Math.random() - 0.5) * 1.5);
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i], u = p.userData;
    u.life -= dt;
    p.position.x += u.vx * dt; p.position.y += u.vy * dt; p.position.z += u.vz * dt;
    const k = Math.max(0, u.life / u.max);
    p.material.opacity = k * 0.85; p.scale.setScalar(u.size * (1.6 - k * 0.6));
    if (u.life <= 0) { scene.remove(p); p.material.dispose(); puffs.splice(i, 1); }
  }
  boostFx = Math.max(0, boostFx - dt * 1.3);    // 부스터: 잠깐 화면을 넓혀 빨라진 느낌
}

/* ---------- 카메라: 스쿠터 뒤 위에서 따라간다 ---------- */
const CAM = { back: 9, up: 5.2, ahead: 9, lookY: 1.5 };
let camYaw = S.heading, endT = 0, talkNpc = -1;
// 도착 뒤: 잠깐(1.6초) 멈춰 세워 브이 장면을 보여 주고, 그 뒤엔 다시 자유롭게 달린다.
// 다시 출발하면 카메라는 보통 시점으로, 멈추면 다시 브이 하고 손을 흔든다
let arriveT = -1, roaming = false, waving = false, roamTip = false;
// 사용자가 돌려 놓은 카메라 (기본 추적 위치에서 얼마나 더 돌렸나)
const orbit = { yaw: 0, pitch: 0, dist: 1, last: -1e9 };
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function updateCamera(dt, snap, ending) {
  if (fixedCam) {
    camera.position.set(fixedCam[0], fixedCam[1], fixedCam[2]);
    camera.lookAt(fixedCam[3], fixedCam[4], fixedCam[5]);
    return;
  }
  let target, look;
  // NPC 와 이야기할 땐 앞쪽 옆에서 두 사람을 같이 잡는다 (말을 걸면 바뀌고, 다시 출발하면 돌아온다)
  if (talkNpc >= 0 && !ending) {
    const n = NPCS[talkNpc];
    const mx = (S.x + n.x) / 2, mz = (S.z + n.z) / 2;
    let dx = n.x - S.x, dz = n.z - S.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    // 두 사람 둘레 24곳을 후보로 놓고 고른다: 사이가 막히지 않고, 두 사람 모두에게서 충분히 떨어지고,
    // 스쿠터 앞쪽(얼굴이 보이는 쪽)일수록, 두 사람을 옆에서 나란히 볼수록 점수가 높다.
    // 서 있는 자리가 애매해도(벽에 붙음 등) 너무 가까이 붙어 찍지 않는다
    const fx = -Math.sin(S.heading), fz = -Math.cos(S.heading);
    const d = Math.max(6.5, dl * 0.9 + 3.8);   // 얼굴이 잘 보이게 가깝게 (2026-10-26)
    const blocked = (cx, cz) => [0.15, 0.35, 0.55, 0.75, 0.9, 1].some(k => collide(mx + (cx - mx) * k, mz + (cz - mz) * k, 0.5).hit);
    // 한 번 고른 자리는 스쿠터가 3m 넘게 움직이기 전까지 그대로 (이리저리 튀지 않게)
    const tc = updateCamera.tc;
    let best = tc && tc.npc === talkNpc && Math.hypot(tc.sx - S.x, tc.sz - S.z) < 3 ? tc.best : null;
    if (!best) for (const dist of [d, d * 0.8, d * 0.62]) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a);
        const cx = mx + ux * dist, cz = mz + uz * dist;
        if (Math.hypot(cx - S.x, cz - S.z) < 3.8 || Math.hypot(cx - n.x, cz - n.z) < 3.8 || blocked(cx, cz)) continue;
        const front = ux * fx + uz * fz;                 // 스쿠터 앞쪽에서 볼수록 +
        const side = 1 - Math.abs(ux * dx + uz * dz);    // 두 사람을 잇는 선과 수직일수록 +
        // 주인공 얼굴(스쿠터 앞)과 NPC 얼굴(주인공 쪽)이 둘 다 보이는 자리 — 두 사람이 서로 보는 선의 앞쪽 옆
        const score = front * 2.2 + side * 1.0 - dist * 0.03;
        if (!best || score > best.score) best = { cx, cz, score };
      }
      if (best) break;
    }
    if (best && best !== (tc && tc.best)) updateCamera.tc = { npc: talkNpc, sx: S.x, sz: S.z, best };
    const cx = best ? best.cx : mx + fx * d, cz = best ? best.cz : mz + fz * d;
    target = new THREE.Vector3(cx, 3.0, cz);
    look = new THREE.Vector3(mx, 2.6, mz);   // 두 사람 얼굴 높이
    camPos.lerp(target, Math.min(1, dt * 2.5));
    camLook.lerp(look, Math.min(1, dt * 3));
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camYaw = S.heading;
    return;
  }
  // 한동안 안 만지고 달리면 원래 뒤 시점으로 천천히 돌아온다
  if (performance.now() - orbit.last > 2500 && Math.abs(S.speed) > 1.5 && !ending) {
    const k = Math.min(1, dt * 1.5);
    orbit.yaw = Math.atan2(Math.sin(orbit.yaw), Math.cos(orbit.yaw)) * (1 - k);
    orbit.pitch *= 1 - k; orbit.dist += (1 - orbit.dist) * k;
  }
  const orbiting = Math.min(1, Math.abs(orbit.yaw) / 0.5 + Math.abs(orbit.pitch) / 0.3 + Math.abs(orbit.dist - 1) / 0.4);
  if (ending) {
    // 도착: 앞으로 돌아가 얼굴을 비춘다
    endT += dt;
    const k = Math.min(1, endT / 1.6), yaw = S.heading + Math.PI * k * 0.92 + orbit.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), dd = (cv.clientHeight > cv.clientWidth ? 5.6 : 5.0) * orbit.dist;
    // 세레모니: 바닥 가까이 낮게 앉아 올려다본다 (2026-10-26 사용자 요청)
    target = new THREE.Vector3(S.x - fx * dd, Math.max(0.25, 0.35 + orbit.pitch * 4 * orbit.dist), S.z - fz * dd);
    // 세로 화면(폰)은 결과 카드가 위에 걸치니 캐릭터를 조금 아래에 둔다
    look = new THREE.Vector3(S.x, cv.clientHeight > cv.clientWidth ? 2.55 : 1.85, S.z);
  } else {
    let d = S.heading - camYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    camYaw += d * Math.min(1, dt * 3.2);
    const yaw = camYaw + orbit.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    // 기본 위치의 거리·높이 각도에 사용자가 돌린 만큼을 더한다
    const base = Math.hypot(CAM.back, CAM.up - CAM.lookY), elev = Math.atan2(CAM.up - CAM.lookY, CAM.back);
    const e2 = Math.max(0.02, Math.min(1.35, elev + orbit.pitch)), od = base * orbit.dist;
    // 돌려 볼 땐 앞쪽 길 대신 캐릭터(가슴~얼굴 높이)를 가운데에 둔다
    const lookY = CAM.lookY + (headH * 0.72 - CAM.lookY) * orbiting;
    const ahead = CAM.ahead * (1 - orbiting);
    target = new THREE.Vector3(S.x - fx * od * Math.cos(e2), lookY + od * Math.sin(e2), S.z - fz * od * Math.cos(e2));
    look = new THREE.Vector3(S.x + -Math.sin(camYaw) * ahead, lookY, S.z + -Math.cos(camYaw) * ahead);
  }
  if (snap) { camPos.copy(target); camLook.copy(look); }
  camPos.lerp(target, Math.min(1, dt * (ending ? 3 : 6)));
  camLook.lerp(look, Math.min(1, dt * 8));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

function placeSun() {
  // 그림자 상자를 스쿠터 앞쪽에 맞춘다. 텍셀 단위로 맞춰야 움직일 때 그림자가 떨리지 않는다
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const cx = S.x + fx * 18, cz = S.z + fz * 18;
  const step = (SH * 2) / 2048;
  const qx = Math.round(cx / step) * step, qz = Math.round(cz / step) * step;
  sun.target.position.set(qx, 0, qz);
  sun.position.set(qx + SUN_DIR.x * 100, SUN_DIR.y * 100, qz + SUN_DIR.z * 100);
}

/* ---------- 화면 UI ---------- */
const $ = id => document.getElementById(id);
const ui = {
  bubble(text) {
    const b = $("bubble");
    if (!text) { b.classList.remove("on"); return; }
    b.textContent = text; b.classList.add("on");
  },
  dialog(n, onClose) {
    const d = $("dlg");
    if (!n) { d.classList.remove("on"); clearInterval(ui._typer); return; }
    $("dlgFace").src = `assets/npc/${n.id}_face.png`;
    $("dlgName").textContent = n.name;
    const el = $("dlgText");
    el.textContent = "";
    let i = 0;
    clearInterval(ui._typer);
    ui._typer = setInterval(() => { i++; el.textContent = n.text.slice(0, i); if (i >= n.text.length) clearInterval(ui._typer); }, 38);
    d.classList.add("on");
    d.onclick = (e) => { e.stopPropagation(); onClose(); };
  },
  prompt(p, label) {
    const el = $("prompt");
    if (!p || p.z > 1) { el.classList.remove("on"); return; }
    el.textContent = `💬 ${label}  ·  Space / 터치`;
    el.style.left = ((p.x + 1) / 2 * cv.clientWidth) + "px";
    el.style.top = ((1 - p.y) / 2 * cv.clientHeight) + "px";
    el.classList.add("on");
  },
  flash() { const f = $("flash"); f.classList.remove("on"); void f.offsetWidth; f.classList.add("on"); },
  coins(n, total) { $("coinN").textContent = n; $("coinT").textContent = total; },
  ppotto(n, total) {
    $("ppN").textContent = n; $("ppT").textContent = total;
    const el = $("ppPill"); el.classList.remove("pop"); void el.offsetWidth; if (n) el.classList.add("pop");
  },
  goal(text) { const g = $("goal"); g.textContent = text; g.classList.remove("pop"); void g.offsetWidth; g.classList.add("pop"); },
  toast(text) { const t = $("toast"); t.textContent = text; t.classList.add("on"); clearTimeout(ui._tt); ui._tt = setTimeout(() => t.classList.remove("on"), 1800); },
  result(st) {
    setTimeout(() => {
      $("rTime").textContent = fmtTime(st.time);
      $("rCoin").textContent = `${st.coins} / ${st.total}`;
      $("rPp").textContent = `${st.ppotto} / ${st.ppottoTotal}`;
      $("scResult").classList.remove("hidden");
      $("goal").textContent = "";
    }, 2600);
  },
};
function fmtTime(s) { const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, "0")}`; }

const game = createGame({ scene, camera, S, player, ui });

/* 멈추기 — Esc / P / 화면 오른쪽 위 ❚❚ 버튼. 멈춘 동안은 시간·움직임·소리가 다 선다 */
let paused = false;
function setPaused(on) {
  if (!game.state.running || paused === on) return;
  paused = on;
  $("scPause").classList.toggle("hidden", !on);
  game.setPaused(on);
  for (const k in keys) keys[k] = false;
  for (const k in touch) touch[k] = false;
}
$("btnPause").onclick = () => setPaused(true);
$("btnResume").onclick = () => setPaused(false);
$("btnRestart").onclick = () => location.reload();

addEventListener("keydown", e => {
  if ((e.code === "Escape" || e.code === "KeyP") && !e.repeat) { setPaused(!paused); return; }
  if (paused) { if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault(); return; }
  if ((e.code === "ArrowUp" || e.code === "KeyW") && !e.repeat) upPressed = true;
  keys[e.code] = true;
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
  if (e.code === "Space" && !e.repeat) game.interact();
});
// 다른 탭으로 가면 저절로 멈춘다
document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); });
addEventListener("keyup", e => { keys[e.code] = false; });
/* 화면 끌기 = 카메라를 캐릭터 둘레로 돌리기 (얼굴도 볼 수 있게), 휠·두 손가락 = 가까이/멀리.
   살짝 누르고 떼면(움직임 6px 미만) 클릭 — NPC 말 걸기·대화창 닫기 */
const ptrs = new Map();
let pinch0 = 0, dist0 = 1, downAt = null;
cv.addEventListener("pointerdown", e => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) downAt = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = orbit.dist; }
});
cv.addEventListener("pointermove", e => {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (downAt) downAt.moved += Math.abs(dx) + Math.abs(dy);
  if (ptrs.size === 1 && downAt && downAt.moved > 6) {
    orbit.yaw -= dx * 0.008;
    orbit.pitch = Math.max(-0.55, Math.min(0.75, orbit.pitch + dy * 0.005));
    orbit.last = performance.now();
  } else if (ptrs.size === 2 && pinch0 > 0) {
    const [a, b] = [...ptrs.values()];
    orbit.dist = Math.max(0.35, Math.min(1.7, dist0 * pinch0 / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))));
    orbit.last = performance.now();
    if (downAt) downAt.moved = 99;
  }
});
const endPtr = e => {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch0 = 0;
  if (e.type === "pointerup" && downAt && ptrs.size === 0 && downAt.moved <= 6 && performance.now() - downAt.t < 500 && game.state.running) {
    if (!game.clickAt(e.clientX, e.clientY, cv.getBoundingClientRect()) && game.state.talking >= 0) game.interact();   // 빈 곳을 눌러도 대화창은 닫힌다
  }
  if (ptrs.size === 0) downAt = null;
};
cv.addEventListener("pointerup", endPtr);
cv.addEventListener("pointercancel", endPtr);
cv.addEventListener("wheel", e => {
  e.preventDefault();
  orbit.dist = Math.max(0.35, Math.min(1.7, orbit.dist * Math.exp(e.deltaY * 0.0012)));
  orbit.last = performance.now();
}, { passive: false });
cv.addEventListener("dblclick", () => { orbit.yaw = 0; orbit.pitch = 0; orbit.dist = 1; });
$("prompt").addEventListener("pointerdown", e => { e.stopPropagation(); game.interact(); });

// 터치 버튼 (폰)
document.querySelectorAll("[data-pad]").forEach(b => {
  const k = b.dataset.pad;
  const on = e => { e.preventDefault(); if (k === "up" && !touch.up) upPressed = true; touch[k] = true; b.classList.add("down"); };
  const off = e => { e.preventDefault(); touch[k] = false; b.classList.remove("down"); };
  b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off);
  b.addEventListener("pointercancel", off); b.addEventListener("pointerleave", off);
});

function begin() {
  unlockAudio();
  $("scStart").classList.add("hidden");
  $("hud").classList.remove("hidden");
  game.start();
}
$("btnStart").onclick = begin;
// 받는 중 표시 — 모델(약 5MB)과 목소리를 다 받으면 출발 버튼이 켜진다
{
  const btn = $("btnStart"), label = btn.textContent;
  btn.disabled = true;
  const tick = () => {
    const v = voicesReady(), all = (modelDone ? 0.7 : 0) + 0.3 * v;
    if (modelDone && v >= 1) { btn.disabled = false; btn.textContent = label; return; }
    btn.textContent = `불러오는 중… ${Math.round(all * 100)}%`;
    setTimeout(tick, 150);
  };
  tick();
}
$("btnAgain").onclick = () => location.reload();
if (Q.has("play")) riderLoad.then(begin);

function resize() {
  const w = cv.clientWidth, h = cv.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 62 : 50;       // 세로 폰 화면은 조금 넓게
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

/* ---------- 매 프레임 ---------- */
let last = performance.now(), first = true, t = 0;
const headV = new THREE.Vector3();
function frame(now) {
  const dt = paused ? 0 : Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  const st = game.state;
  if (st.done && arriveT < 0) arriveT = 0;
  if (arriveT >= 0) arriveT += dt;
  const hold = st.done && arriveT < 1.6;
  drive(dt, st.running && !hold);
  if (hold) { const k = Math.max(0, 1 - dt * 4); S.vx *= k; S.vz *= k; S.speed *= k; }
  if (st.done && !hold && Math.abs(S.speed) > 1.5) roaming = true;     // 도착 자리를 떠났다
  // 세레모니를 한동안 보여 준 뒤 "계속 움직일 수 있어요" 안내. 움직이기 시작하면 내린다
  if (st.done && arriveT > 4.5 && !roamTip && !roaming) { roamTip = true; ui.goal("↑ 계속 움직일 수 있어요! 남은 코인·뽀또를 모아 보세요"); }
  if (roamTip && roaming && $("goal").textContent) $("goal").textContent = "";
  const ending = st.done && (!roaming || Math.abs(S.speed) < 0.4);    // 멈춰 있으면 다시 앞에서 비춘다
  if (!ending) endT = 0;
  player.position.set(S.x, S.wet ? -0.45 : 0, S.z);
  player.rotation.y = S.heading;
  // 회전할 때 몸을 기울이고, 달리면 살짝 통통 튄다
  body.rotation.z = -S.steer * Math.min(1, Math.abs(S.speed) / MAX) * (S.drift ? 0.32 : 0.2);
  // 드리프트 중엔 차체가 미끄러지는 쪽 반대로 살짝 틀어진다
  body.rotation.y += ((S.drift ? -S.side * 0.06 : 0) - body.rotation.y) * Math.min(1, dt * 8);
  // 달달달 — 위아래로 잘게 떨린다. 공회전에도 조금, 빠를수록 더 (주파수 두 개를 섞어 기계처럼 불규칙하게)
  const shake = st.running ? 0.009 + 0.017 * Math.min(1, Math.abs(S.speed) / MAX) : 0;   // 살짝 줄임 (2026-10-26)
  body.position.y = (Math.sin(t * 57) * 0.6 + Math.sin(t * 33 + 1.3) * 0.4) * shake * BIG;
  body.rotation.x = Math.sin(t * 41 + 0.7) * shake * 0.35;
  if (rig) {
    const wave = st.done && Math.abs(S.speed) < 0.6;
    if (wave) rig.victory(t);
    else if (waving) rig.seated();      // 다시 달리면 손을 핸들로
    waving = wave;
  }
  // 대화 카메라: 말을 걸면 켜지고, 다시 달리기 시작하면 꺼진다
  if (st.talking >= 0) talkNpc = st.talking;
  else if (talkNpc >= 0 && Math.abs(S.speed) > 2.2) talkNpc = -1;
  updateCamera(dt, first, ending); first = false;
  engineUpdate(paused ? 0 : S.speed, st.running && !paused, game.isSpeaking());
  skidUpdate(st.running && !paused && S.drift ? Math.min(1, Math.abs(S.side) / 5) : 0);
  updateFx(dt);
  const fovWant = (cv.clientWidth < cv.clientHeight ? 62 : 50) + boostFx * 9 + (S.boostT > 0 ? 3 : 0);
  if (Math.abs(camera.fov - fovWant) > 0.05) { camera.fov += (fovWant - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix(); }
  placeSun();
  game.update(dt, t);
  if (W.lake) W.lake.offset.x = t * 0.01;
  skyBall.position.copy(camera.position);
  // 말풍선을 머리 위에
  headV.set(S.x, headH, S.z).project(camera);
  const b = $("bubble");
  b.style.left = ((headV.x + 1) / 2 * cv.clientWidth) + "px";
  b.style.top = ((1 - headV.y) / 2 * cv.clientHeight) + "px";
  if (st.running) $("time").textContent = fmtTime(st.time);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__game = { S, scene, camera, renderer, keys, game, L, R, GOAL };
