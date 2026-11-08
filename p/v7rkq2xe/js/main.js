/* 바이스벌사의 보이스발사 — 주행·경찰·wasted·화면 연결.
   heading 0 = 북쪽(-z). 차는 원 두 개(앞·뒤)로 부딪힌다. */
import * as THREE from "../vendor/three.module.min.js";
import { buildWorld, pushOut, inWater, lineClear, NAV, BOUNDS, wx, wz, ROAD_W, isRoad, addDynBox, removeDynBox, groundAt, RAMPS } from "./world.js";
import { loadCars, CAR_LEN, CAR_SCALE } from "./cars.js";
import * as Au from "./audio.js";
import { glow } from "./textures.js";

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const Q = new URLSearchParams(location.search);

/* ---------- 규칙 값 ---------- */
const MAX = 27, ACC = 15, BRAKE = 30, DRAG = 3.5, TURN = 1.85;
const GRIP = 9, GRIP_DRIFT = 1.0;
const DRIFT_MIN_V = 9, DRIFT_READY = 0.3, BOOST_WINDOW = 0.55;     // 드리프트 끝나고 0.55초 안에 ↑ 다시
const BOOSTV = 41, BOOST_KICK = 34, BOOST_T = 5.1;                 // 아~~ 소리 길이에 맞춘 5초
const CAR_W = 2.3 * CAR_SCALE;                                     // 차 폭 (약 3.5m)
const CAR_R = CAR_W / 2, CAR_OFF = CAR_LEN / 2 - CAR_R;            // 앞·가운데·뒤 원의 반지름·중심 거리
const COP_TIMES = [0, 12, 25, 40, 55, 70, 85];                      // 1대부터 시작해 최대 7대
/* 경찰차 (2026-11-08 사용자 요청): 기본 속도가 내 부스터(41)의 1.2배쯤, 코너링도 내 차보다 좋다.
   들이받으려고 달려들고, 저마다 다른 각도(뒤·앞·옆·대각선)에서 온다. 느려지면 8방향에서 가둔다.
   내 차의 실제 최고 속도는 약 29.5 */
const COP_SPEED = [47.5, 50.5], COP_FAR = 4, COP_TURN = 1.18, COP_BOOSTV = 57, COP_BOOST_T = 1.6;
const COP_ENGAGE = 90;                                             // 이 거리 안에서 보이면 각자 각도로 달려든다
const COP_RAM_REL = 16;                                            // 들이받을 때 나보다 이만큼 빠르게
const RAM_SPIN = 0.032, RAM_MIN = 9, RAM_KEEP = 0.6;              // 박힌 세기(상대 속도)에 비례해 차가 돌고, 최고 속도의 60% 로 떨어진다
const KNOCK_MAX = 6;                                               // 한 번 박힐 때 밀려나는 속도 상한 (m/s) — 너무 멀리 튕겨 나가지 않게
/* 달려드는 방향: 내 차 기준 각도 (0 = 뒤에서, π = 앞에서, ±π/2 = 옆에서) */
const COP_ANG = [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI * 0.75, -Math.PI * 0.75, Math.PI / 4, -Math.PI / 4];
const SL = CAR_LEN - 0.1, SW = CAR_W + 0.1;                        // 둘러쌀 때 앞뒤·옆 간격 (맞닿게 — 닿아야 wasted 게이지가 찬다)
const COP_SLOTS = [[-SL, 0], [SL, 0], [0, SW], [0, -SW], [SL * 0.95, SW * 1.05], [SL * 0.95, -SW * 1.05], [-SL * 0.95, SW * 1.05], [-SL * 0.95, -SW * 1.05]];   // COP_ANG 와 같은 쪽

/* wasted 판정 (자세한 설명은 CLAUDE.md)
   ① 지난 0.6초 동안 실제로 움직인 거리가 1.6m 미만  ② 경찰차와 닿아 있음 (떨어진 지 0.35초 안)
   둘 다면 게이지 +, 아니면 같은 빠르기로 − (2026-11-08 사용자 요청, 전엔 2배). 3초 차면 wasted.
   → 제자리 비비기로는 못 푼다 (속도가 아니라 실제 이동 거리). 후진·틈으로 빠져나오면 금방 풀린다.
   → 벽에 박혀 있기만 하면(경찰 안 닿음) 쌓이지 않는다. */
const STUCK_DRAIN = 1;                                             // 조건이 깨지면 줄어드는 빠르기 (차는 빠르기와 같게)
const STUCK_WINDOW = 0.6, STUCK_MOVE = 1.6, STUCK_FILL = 3.0, CONTACT_GRACE = 0.35, CONTACT_GAP = 0.7;

/* ---------- 장면 ---------- */
const canvas = $("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const lowEnd = /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
renderer.setPixelRatio(Math.min(devicePixelRatio, lowEnd ? 1.25 : 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#bfe3f5");
scene.fog = new THREE.Fog("#cdeaf6", 260, 900);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.8, 1800);
scene.add(new THREE.HemisphereLight("#fff6e8", "#9db98b", 1.5));
const sun = new THREE.DirectionalLight("#fff3df", 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
const sc = sun.shadow.camera; sc.left = -105; sc.right = 105; sc.top = 105; sc.bottom = -105; sc.near = 10; sc.far = 420;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
addEventListener("resize", () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const world = buildWorld(scene);
const glowTex = glow();

/* ---------- 입력 ---------- */
const keys = {}, touch = { up: 0, down: 0, left: 0, right: 0, drift: 0 };
let upPressed = false;
const GAMEKEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space"]);
addEventListener("keydown", (e) => {
  if (e.target && e.target.tagName === "INPUT") return;           // 닉네임 쓰는 중
  if (!e.repeat && (e.code === "Escape" || e.code === "KeyP") && (state === "play")) { setPause(!paused); return; }
  if (paused) return;
  if (GAMEKEYS.has(e.code)) e.preventDefault();
  if (!e.repeat && e.code === "ArrowUp") upPressed = true;
  keys[e.code] = true;
  if (!e.repeat && (e.code === "Enter" || e.code === "Space") && state === "result") restart();
  if (!e.repeat && e.code === "Enter" && state === "title" && !$("go").disabled) $("go").click();
  if (!e.repeat && e.code === "KeyC") setCamMode(camMode + 1);
  if (!e.repeat && e.code === "KeyB") setBubble(!bubbleOn);
});
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
// 다른 탭·창으로 가면 저절로 멈춘다
document.addEventListener("visibilitychange", () => { if (document.hidden && state === "play") setPause(true); });
if ("ontouchstart" in window || navigator.maxTouchPoints > 1) document.body.classList.add("touch");
document.querySelectorAll("#touch button").forEach(b => {
  const k = b.dataset.k;
  const on = (e) => { e.preventDefault(); if (k === "up" && !touch.up) upPressed = true; touch[k] = 1; b.classList.add("on"); };
  const off = (e) => { e.preventDefault(); touch[k] = 0; b.classList.remove("on"); };
  b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("pointerleave", off);
});

/* ---------- 상태 ---------- */
let state = "load", simT = 0, timeScale = 1, wastedT = 0, models = null, autopilot = Q.has("auto");
const P = { x: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, side: 0, steer: 0, grip: GRIP, drift: false, driftT: 0, boostWin: 0, boostT: 0, touching: false, wet: false };
let cops = [], contactAgo = 9, stuck = 0, history = [], moved = 99, nextCop = 0;
let copPool = [];
let best = 0;
try { best = parseFloat(localStorage.getItem("vice_best") || "0") || 0; } catch (e) { best = 0; }
const fmt = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return `${String(m).padStart(2, "0")}:${r < 10 ? "0" : ""}${r.toFixed(1)}`; };

/* ---------- 경찰 길찾기: 플레이어까지 거리장 (0.35초마다 다시) ---------- */
const distField = () => { if (!NAV._d) NAV._d = new Int32Array(NAV.w * NAV.h); return NAV._d; };
const buckets = Array.from({ length: 160 }, () => []);
function computeField(px, pz) {
  const D = distField(), w = NAV.w, h = NAV.h, cost = NAV.cost;
  D.fill(0x7fffffff);
  let si = clamp(Math.floor((px - NAV.x0) / NAV.cell), 1, w - 2), sj = clamp(Math.floor((pz - NAV.z0) / NAV.cell), 1, h - 2);
  if (!cost[sj * w + si]) { // 벽에 붙어 있으면 가까운 빈칸에서 시작
    let found = false;
    for (let r = 1; r < 5 && !found; r++) for (let dj = -r; dj <= r && !found; dj++) for (let di = -r; di <= r; di++) {
      const a = si + di, b = sj + dj; if (a < 0 || b < 0 || a >= w || b >= h) continue;
      if (cost[b * w + a]) { si = a; sj = b; found = true; break; }
    }
  }
  for (const b of buckets) b.length = 0;
  D[sj * w + si] = 0; buckets[0].push(sj * w + si);
  let cur = 0, left = 1, empty = 0;
  const N8 = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];
  while (left > 0 && empty < 160) {
    const bk = buckets[cur % 160];
    if (!bk.length) { cur++; empty++; continue; }
    empty = 0;
    const c = bk.pop(); left--;
    const dc = D[c];
    if (Math.floor(dc / 10) > cur) { continue; }
    const cj = Math.floor(c / w), ci = c - cj * w;
    for (const [di, dj, m] of N8) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const n = nj * w + ni, cn = cost[n];
      if (!cn || NAV.block[n]) continue;
      if (di && dj && (!cost[cj * w + ni] || !cost[nj * w + ci])) continue;  // 모서리 자르기 금지
      const nd = dc + (m * cn) / 10 | 0;
      if (nd < D[n]) { D[n] = nd; buckets[Math.floor(nd / 10) % 160].push(n); left++; }
    }
  }
}
/* (x,z) 에서 거리장을 steps 칸 내려간 지점 */
function fieldTarget(x, z, steps) {
  const D = distField(), w = NAV.w, h = NAV.h;
  let ci = clamp(Math.floor((x - NAV.x0) / NAV.cell), 0, w - 1), cj = clamp(Math.floor((z - NAV.z0) / NAV.cell), 0, h - 1);
  for (let s = 0; s < steps; s++) {
    let bi = ci, bj = cj, bd = D[cj * w + ci];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const d = D[nj * w + ni];
      if (d < bd) { bd = d; bi = ni; bj = nj; }
    }
    if (bi === ci && bj === cj) break;
    ci = bi; cj = bj;
  }
  return { x: NAV.x0 + (ci + 0.5) * NAV.cell, z: NAV.z0 + (cj + 0.5) * NAV.cell };
}

/* ---------- 내 차 ---------- */
function drivePlayer(dt) {
  let up = keys.ArrowUp || touch.up, down = keys.ArrowDown || touch.down;            // 방향키만 (2026-11-08)
  let left = keys.ArrowLeft || touch.left, right = keys.ArrowRight || touch.right;
  let driftKey = keys.ShiftLeft || keys.ShiftRight || touch.drift, boostKey = upPressed;
  upPressed = false;
  if (state !== "play") { up = down = left = right = driftKey = boostKey = false; }
  if (autopilot && state === "play") { const a = botInput(); up = a.up; down = a.down; left = a.left; right = a.right; driftKey = a.drift; boostKey = a.boost; }

  const wet = inWater(P.x, P.z);
  const fx = -Math.sin(P.heading), fz = -Math.cos(P.heading), lx = -fz, lz = fx;
  let vf = P.vx * fx + P.vz * fz, vl = P.vx * lx + P.vz * lz;
  const want = (left ? 1 : 0) - (right ? 1 : 0);

  // 드리프트 시작 — 스껄! 부스터 중이면 아~~ 를 끊고 부스터도 끝난다
  if (!driftKey) P.driftBlock = false;      // 부스터를 켠 뒤 Shift 를 한 번 떼야 다음 드리프트가 된다
  P.sinceLand = (P.sinceLand ?? 9) + dt;
  if (driftKey && want !== 0 && vf > DRIFT_MIN_V && !P.drift && !wet && !P.driftBlock && P.sinceLand > 0.25) {
    P.drift = true; P.driftT = 0; P.boostWin = 0;
    if (P.boostT > 0) { P.boostT = 0; Au.stopBoost(); }
    Au.playDrift();
  }
  if (P.drift) {
    P.driftT += dt;
    if (!driftKey || want === 0 || vf < 6) {
      P.drift = false;
      if (P.driftT >= DRIFT_READY) P.boostWin = BOOST_WINDOW;
    }
  }
  // 부스터: 드리프트 막바지이거나 막 끝난 순간에 ↑ 를 "다시" 눌러야 한다
  const ready = P.boostWin > 0 || (P.drift && P.driftT >= DRIFT_READY);
  P.ready = ready;
  if (boostKey && ready) {
    P.drift = false; P.boostWin = 0; P.boostT = BOOST_T; P.driftBlock = !!driftKey;
    if (vf < BOOST_KICK) vf = BOOST_KICK;
    Au.playBoost(); toast("부스터!"); P.boosts = (P.boosts || 0) + 1;
  }
  P.boostWin = Math.max(0, P.boostWin - dt);
  if (P.boostT > 0) { P.boostT -= dt; if (P.boostT <= 0) { P.boostT = 0; Au.stopBoost(0.05); } }
  const boosting = P.boostT > 0;
  if (P.air) {
    P.drift = false; P.steer *= Math.exp(-4 * dt);
    moveCarV(P, dt);
    if (P.land > 5 && state === "play") { shake = Math.max(shake, Math.min(1.2, P.land / 14)); landed = P.land; }
    P.land = 0;
    const nfx = -Math.sin(P.heading), nfz = -Math.cos(P.heading);
    P.speed = P.vx * nfx + P.vz * nfz; P.side = P.vx * -nfz + P.vz * nfx;
    return;
  }

  const max = boosting ? BOOSTV : wet ? MAX * 0.32 : MAX;
  if (boosting) vf += 26 * dt;
  else if (up) vf += ACC * (1 - clamp(vf / (max * 1.15), 0, 0.72)) * dt;
  if (down) vf -= (vf > 0 ? BRAKE : ACC * 0.75) * dt;
  else if (!up && !boosting) vf -= Math.sign(vf) * Math.min(Math.abs(vf), DRAG * dt);
  if (vf > max) vf -= (vf - max) * Math.min(1, (boosting ? 6 : wet ? 2.5 : 1.7) * dt);
  vf = Math.max(-11, vf);

  // 붙잡는 힘은 서서히 돌아온다 — 미끄러지던 몸이 자연스럽게 다시 붙는다
  P.grip += ((P.drift ? GRIP_DRIFT : GRIP) - P.grip) * Math.min(1, dt * (P.drift ? 10 : 2.6));
  const vAll = Math.hypot(vf, vl);
  vl *= Math.exp(-P.grip * dt);
  if (vf > 0) vf = Math.sqrt(Math.max(0, vAll * vAll - vl * vl));

  P.steer += (want - P.steer) * Math.min(1, dt * 7);
  // 낮은 속도에선 잘 돌고(좁은 틈 빠져나오기), 아주 빠르면 조금 둔해진다
  const av = Math.abs(vf);
  const hi = 1 - 0.34 * clamp((av - 18) / 24, 0, 1);
  const turnK = Math.max(P.touching ? 0.55 : 0.22, Math.min(1, av / 7)) * hi * (vf < -0.4 ? -1 : 1);
  P.heading += P.steer * TURN * (P.drift ? 1.45 : 1) * turnK * dt;
  if (P.spin) { P.heading += P.spin * dt; P.spin *= Math.exp(-2.6 * dt); if (Math.abs(P.spin) < 0.02) P.spin = 0; }

  P.vx = fx * vf + lx * vl; P.vz = fz * vf + lz * vl;
  moveCarV(P, dt);
  if (P.land > 5 && state === "play") { shake = Math.max(shake, Math.min(1.2, P.land / 14)); landed = P.land; }
  P.land = 0;
  P.wet = wet;
  const nfx = -Math.sin(P.heading), nfz = -Math.cos(P.heading);
  P.speed = P.vx * nfx + P.vz * nfz;
  P.side = P.vx * -nfz + P.vz * nfx;
}

/* 점프대 위아래: 경사를 따라 오르다 끝에서 땅이 꺼지면 그때 오르던 빠르기로 떠서 중력대로 떨어진다.
   더 띄워 주지 않는다 (사용자 요청 — 속도와 중력에 맞게 자연스럽게). 옆·뒤에서 높은 곳으로는 못 올라간다 */
const GRAV = 9.8;
function vertical(c, dt, ox, oz) {
  if (!(dt > 0)) return;
  const y = c.y || 0, g = groundAt(c.x, c.z);
  if (!c.air) {
    if (g - y > 0.8) { c.x = ox; c.z = oz; c.vx *= -0.2; c.vz *= -0.2; return; }   // 옆·뒷면은 벽
    const hs = Math.hypot(c.vx, c.vz);
    c.climbMem = Math.max(0, (c.climbMem || 0) - 40 * dt);
    if (g >= y - 0.05 || (c.climbMem <= 0.5 && y - g < hs * dt * 0.8 + 0.05)) {
      c.climb = (g - y) / dt; c.y = g; c.climbMem = Math.max(c.climbMem, c.climb); return;
    }
    c.air = true; c.vy = Math.max(0, c.climbMem); c.climbMem = 0; c.airT = 0;      // 꼭대기·끝 — 오르던 빠르기로 뜬다
  }
  c.airT += dt; c.vy -= GRAV * dt; c.y = y + c.vy * dt;
  if (c.y <= g) { c.land = -c.vy; c.y = g; c.air = false; c.vy = 0; c.climb = 0; c.climbMem = 0; c.sinceLand = 0; }
}
function moveCarV(c, dt) { const ox = c.x, oz = c.z; moveCar(c, dt); vertical(c, dt, ox, oz); }

/* 벽 부딪힘: 앞뒤 원을 각각 밖으로 민다. 벽 쪽 빠르기만 없앤다 */
const _p = { x: 0, z: 0 };
function moveCar(c, dt) {
  c.x += c.vx * dt; c.z += c.vz * dt;
  c.touching = false;
  const fx = -Math.sin(c.heading), fz = -Math.cos(c.heading);
  for (const k of [1, -1, 0]) {
    _p.x = c.x + fx * CAR_OFF * k; _p.z = c.z + fz * CAR_OFF * k;
    const ox = _p.x, oz = _p.z;
    const r = pushOut(_p, CAR_R, c.air ? c.y : 0);
    if (r) {
      c.x += _p.x - ox; c.z += _p.z - oz;
      const into = c.vx * r.nx + c.vz * r.nz;
      if (into < 0) { c.vx -= r.nx * into; c.vz -= r.nz * into; }
      c.touching = true;
    }
  }
}

/* 차끼리: 앞·뒤·가운데 원끼리 민다. 돌려줌: 가장 가까운 틈 */
function carPair(a, b, ma, mb) {
  if (Math.abs((a.y || 0) - (b.y || 0)) > 1.8) return Infinity;   // 한쪽이 떠 있으면 위로 지나간다
  const afx = -Math.sin(a.heading), afz = -Math.cos(a.heading), bfx = -Math.sin(b.heading), bfz = -Math.cos(b.heading);
  let gap = Infinity;
  for (const i of [1, 0, -1]) for (const j of [1, 0, -1]) {
    const ax = a.x + afx * CAR_OFF * i, az = a.z + afz * CAR_OFF * i, bx = b.x + bfx * CAR_OFF * j, bz = b.z + bfz * CAR_OFF * j;
    const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz) || 1e-3, g = d - CAR_R * 2;
    if (g < gap) gap = g;
    if (g >= 0) continue;
    const nx = dx / d, nz = dz / d, push = -g, sum = ma + mb;
    a.x -= nx * push * mb / sum; a.z -= nz * push * mb / sum;
    b.x += nx * push * ma / sum; b.z += nz * push * ma / sum;
    const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rel < 0) {
      const imp = -(1 + 0.15) * rel / sum;
      a.vx -= nx * imp * mb; a.vz -= nz * imp * mb;
      b.vx += nx * imp * ma; b.vz += nz * imp * ma;
    }
  }
  return gap;
}

/* ---------- 경찰차 ---------- */
function newCop(i, x, z, heading) {
  const m = copPool[i] || (copPool[i] = models.makePolice());
  scene.add(m.holder);
  m.holder.visible = true;
  return { i, x, z, heading, vx: 0, vz: 0, steer: 0, m, touching: false, stuckT: 0, revT: 0, lastX: x, lastZ: z, lastChk: 0, speed: 0, tgt: { x, z }, thinkT: 0, dist: 999, boostT: 0, boostCd: 2 + Math.random() * 4, boosts: 0, revN: 0 };
}
function copMax(c) {
  // 시간이 지날수록·멀수록 빨라진다. 바로 뒤까지 오면 내 속도보다 조금만 빠르게 — 들이받아 밀어 주지 않고 옆으로 파고든다
  const age = clamp(simT / 120, 0, 1);
  const base = lerp(COP_SPEED[0], COP_SPEED[1], age) + clamp((simT - 120) / 40, 0, 3);
  const far = clamp((c.dist - 70) / 170, 0, 1);
  // 가까우면 내 속도보다 COP_RAM_REL 만큼 빠르게 들이받는다 (너무 빠르면 지나쳐 버려서).
  // 한 번 박은 뒤 1초는 살짝 물러난다 — 계속 밀면 내 차가 오히려 빨라진다
  const pv = Math.hypot(P.vx, P.vz);
  if (c.hitCd > 0) return Math.max(0, pv * 0.8 - 2);
  if (c.dist < 30) return Math.min(base, pv + COP_RAM_REL);
  return base + far * COP_FAR;
}
function driveCop(c, dt) {
  c.dist = Math.hypot(P.x - c.x, P.z - c.z);
  if (c.air) { moveCarV(c, dt); return; }
  c.thinkT -= dt;
  const pfx = -Math.sin(P.heading), pfz = -Math.cos(P.heading), prx = -pfz, prz = pfx;
  const pv = Math.hypot(P.vx, P.vz);
  let slow = false, cap = copMax(c);
  if (c.thinkT <= 0) {
    c.thinkT = 0.07;
    if (c.dist < 160 && lineClear(c.x, c.z, P.x, P.z)) {
      let tx, tz;
      if (pv < 9 && c.dist < 50) {
        // 내가 느려지면 가둔다: 8방향 자리로 파고들어 맞닿는다
        const [sf, sr] = COP_SLOTS[c.i];
        tx = P.x + pfx * sf + prx * sr; tz = P.z + pfz * sf + prz * sr;
        c.slot = true;
      } else {
        // 달려들기: 내 차 기준 저마다 다른 각도에서 오다가, 가까워질수록 곧장 박는다
        const cv = Math.max(10, Math.hypot(c.vx, c.vz));
        const lead = clamp(c.dist / cv, 0, 1.3);
        const px2 = P.x + P.vx * lead, pz2 = P.z + P.vz * lead;
        const b = P.heading + Math.PI + COP_ANG[c.i];                     // 이 방향에서 들어온다
        const R = c.dist < COP_ENGAGE ? clamp((c.dist - 12) * 0.55, 0, 32) : 0;
        tx = px2 - Math.sin(b) * R; tz = pz2 - Math.cos(b) * R;
        c.slot = false;
        if (!lineClear(c.x, c.z, tx, tz)) { tx = px2; tz = pz2; }
        if (!lineClear(c.x, c.z, tx, tz)) { tx = P.x; tz = P.z; }
      }
      c.tgt.x = tx; c.tgt.z = tz;
    } else {
      c.slot = false;
      const steps = 5 + Math.floor(Math.hypot(c.vx, c.vz) / 7);
      const t = fieldTarget(c.x, c.z, steps);
      c.tgt.x = t.x; c.tgt.z = t.z;
    }
  }
  // 다른 경찰을 살짝 피한다
  let ax = c.tgt.x, az = c.tgt.z;
  for (const o of cops) {
    if (o === c) continue;
    const dx = c.x - o.x, dz = c.z - o.z, d = Math.hypot(dx, dz);
    const R = 6 + CAR_LEN;
    if (d < R && d > 0.01 && !c.slot && c.dist > 25) { ax += dx / d * (R - d) * 1.2; az += dz / d * (R - d) * 1.2; }
  }
  const dx = ax - c.x, dz = az - c.z, dt2 = Math.hypot(dx, dz);
  const want = Math.atan2(-dx, -dz);
  const diff = angDiff(want, c.heading);
  const fx = -Math.sin(c.heading), fz = -Math.cos(c.heading), lx = -fz, lz = fx;
  let vf = c.vx * fx + c.vz * fz, vl = c.vx * lx + c.vz * lz;

  if (c.slot) { cap = Math.min(cap, dt2 < 0.25 ? 0 : 1.5 + dt2 * 2.2); slow = true; }
  // 많이 돌아야 하면 속도를 크게 줄인다 — 코너에서 벌어지는 틈이 내 무기
  const turnSlow = 1 - clamp((Math.abs(diff) - 0.35) / 1.2, 0, 0.6);
  cap *= turnSlow;

  // 자동 부스터: 앞이 트인 직선에서 틈틈이. 내가 부스터를 쓰면 더 자주 쫓아온다
  c.boostCd -= dt;
  const pBoost = P.boostT > 0;
  if (c.boostT > 0) {
    c.boostT -= dt;
    if (Math.abs(diff) > 0.65 || c.touching || c.slot) c.boostT = 0;
  } else if (c.boostCd <= 0 && !c.slot && c.revT <= 0 && Math.abs(diff) < 0.22 && c.dist > 22 && c.dist < 220 && vf > 14
    && lineClear(c.x, c.z, c.x + fx * 45, c.z + fz * 45)) {
    c.boostT = COP_BOOST_T * (pBoost ? 1.4 : 1); c.boosts++;
    c.boostCd = (pBoost ? 3 : 5 + Math.random() * 4) * lerp(1, 0.7, clamp(simT / 120, 0, 1));
  }
  if (c.boostT > 0) cap = COP_BOOSTV;

  // 앞이 막혀 멈췄으면 잠깐 후진해 빠져나온다
  c.lastChk += dt;
  if (c.lastChk > 0.8) {
    const mv = Math.hypot(c.x - c.lastX, c.z - c.lastZ);
    if (mv < 1.1 && !c.slot && c.dist > 7) { c.revT = 0.95; c.revN++; c.boostT = 0; }
    c.lastX = c.x; c.lastZ = c.z; c.lastChk = 0;
  }
  c.wdT = (c.wdT || 0) + dt;
  if (c.wdT > 4) {
    const mv = Math.hypot(c.x - (c.wdX ?? c.x), c.z - (c.wdZ ?? c.z));
    c.wdN = mv < 12 && !c.slot && c.dist > 25 ? (c.wdN || 0) + 1 : 0;
    c.wdT = 0; c.wdX = c.x; c.wdZ = c.z;
    if (c.wdN >= 2 && c.dist > 60) {
      const s = spawnPoint();
      c.x = s.x; c.z = s.z; c.heading = s.h; c.vx = c.vz = 0; c.wdN = 0; c.revT = 0; c.boostT = 0; c.warps = (c.warps || 0) + 1;
      c.wdX = c.x; c.wdZ = c.z;
      return;
    }
  }
  let steerWant = clamp(diff * 2.4, -1, 1);
  if (c.revT > 0) {
    c.revT -= dt;
    vf -= 20 * dt; vf = Math.max(vf, -9);
    steerWant = -steerWant;
  } else if (vf < cap) vf += (c.boostT > 0 ? 50 : c.dist > 45 ? 44 : 34) * dt;
  else vf -= (vf - cap) * Math.min(1, (c.slot ? 9 : 7) * dt);
  if (c.revT <= 0 && vf < 0) vf += 24 * dt;
  c.steer += (steerWant - c.steer) * Math.min(1, dt * 7);
  const av = Math.abs(vf);
  const hi = 1 - 0.15 * clamp((av - 18) / 24, 0, 1);       // 빨라도 내 차보다 덜 둔해진다
  c.heading += c.steer * TURN * COP_TURN * hi * Math.max(0.25, Math.min(1, av / 7)) * (vf < -0.4 ? -1 : 1) * dt;
  vl *= Math.exp(-10 * dt);                               // 옆으로 덜 미끄러진다 (접지력 좋음)
  const wet = inWater(c.x, c.z);
  if (wet && vf > MAX * 0.32) vf -= (vf - MAX * 0.32) * Math.min(1, 2.5 * dt);
  c.vx = fx * vf + lx * vl; c.vz = fz * vf + lz * vl;
  moveCarV(c, dt);
  c.speed = vf;
  void slow;
}

/* 새 경찰차가 나올 자리: 보이지 않을 만큼 멀고(130m~), 그중 가까운 길 */
function spawnPoint() {
  const pts = world.roadPoints.map(p => ({ ...p, d: Math.hypot(p.x - P.x, p.z - P.z) }))
    .filter(p => p.d > 130 && cops.every(c => Math.hypot(c.x - p.x, c.z - p.z) > 35)).sort((a, b) => a.d - b.d);
  const p = pts[0] || { x: wx(685), z: wz(95) };
  const h = Math.atan2(-(P.x - p.x), -(P.z - p.z));
  return { x: p.x, z: p.z, h };
}

/* ---------- 경찰 바리케이드 (2026-11-08 사용자 요청) ----------
   30초부터, 내가 달려가는 쪽 앞 교차로(80~220m)의 건너편 출구를 막는다.
   경찰차 한 대가 길을 가로로 막고(못 지나감), 양옆으로 보도 끝까지 라바콘.
   교차로에서 꺾으면 피한다. 라바콘은 뚫고 갈 수 있지만 칠 때마다 속도를 잃는다.
   바리케이드 경찰차에 막혀 3초 못 움직여도 wasted (경찰차와 같은 취급). */
const RB_START = 30, RB_GAP = [15, 9], RB_MAX = [2, 3], RB_LIFE = 28, RB_NEAR = 80, RB_FAR = 220;
const CONE_SLOW = 0.75, SIDEWALK_W = 3.6;
let roadblocks = [], nextRB = RB_START;
const rbCarPool = [];
const coneParts = {
  cone: new THREE.ConeGeometry(0.42, 1.1, 14).translate(0, 0.7, 0),
  band: new THREE.CylinderGeometry(0.27, 0.33, 0.2, 14).translate(0, 0.78, 0),
  base: new THREE.BoxGeometry(0.95, 0.12, 0.95).translate(0, 0.06, 0),
  orange: new THREE.MeshLambertMaterial({ color: "#ff6a1a" }),
  white: new THREE.MeshLambertMaterial({ color: "#ffffff" }),
  black: new THREE.MeshLambertMaterial({ color: "#26282c" }),
};
function coneMesh() {
  const g = new THREE.Group();
  for (const [geo, m] of [[coneParts.cone, coneParts.orange], [coneParts.band, coneParts.white], [coneParts.base, coneParts.black]]) {
    const me = new THREE.Mesh(geo, m); me.castShadow = true; g.add(me);
  }
  g.scale.setScalar(1.35);
  return g;
}
function placeRoadblock() {
  if (roadblocks.length >= (simT > 90 ? RB_MAX[1] : RB_MAX[0])) return true;
  const v = Math.hypot(P.vx, P.vz);
  const h = v > 5 ? Math.atan2(-P.vx, -P.vz) : P.heading;
  let fx = -Math.sin(h), fz = -Math.cos(h);
  if (Math.abs(fx) > Math.abs(fz)) { fx = Math.sign(fx); fz = 0; } else { fz = Math.sign(fz); fx = 0; }   // 길은 동서·남북뿐
  let best = null;
  for (const p of world.roadPoints) {
    const dx = p.x - P.x, dz = p.z - P.z, along = dx * fx + dz * fz, lat = Math.abs(dx * -fz + dz * fx);
    if (along < RB_NEAR || along > RB_FAR || lat > 9) continue;
    const ex = p.x + fx * (ROAD_W / 2 + 8), ez = p.z + fz * (ROAD_W / 2 + 8);
    if (!isRoad(ex, ez) || !isRoad(ex + fx * 12, ez + fz * 12)) continue;      // 건너편으로 길이 이어지는 교차로만
    if (roadblocks.some(r => Math.hypot(r.x - ex, r.z - ez) < 40)) continue;
    if (cops.some(c => Math.hypot(c.x - ex, c.z - ez) < 14)) continue;
    if (!best || along < best.along) best = { along, x: ex, z: ez };
  }
  if (!best) return false;
  const px = -fz, pz = fx;                                                   // 길을 가로지르는 방향
  const m = rbCarPool.pop() || models.makePolice();
  scene.add(m.holder); m.holder.visible = true;
  const hd = Math.atan2(-px, -pz);
  m.holder.position.set(best.x, 6, best.z); m.holder.rotation.y = hd;
  const hl = CAR_LEN / 2, hw = CAR_W / 2 - 0.1, acrossX = Math.abs(px) > 0.5;
  const bx = acrossX ? hl : hw, bz = acrossX ? hw : hl;
  const box = addDynBox(best.x - bx, best.z - bz, best.x + bx, best.z + bz);
  const cones = [];
  for (const sd of [-1, 1]) for (let s = hl + 0.9; s <= ROAD_W / 2 + SIDEWALK_W; s += 1.55) {
    const g = coneMesh(), cx = best.x + px * sd * s, cz = best.z + pz * sd * s;
    g.position.set(cx, 7, cz); scene.add(g);
    cones.push({ g, x: cx, z: cz, hit: false, vx: 0, vy: 0, vz: 0, spin: 0, y: 7, landed: false });
  }
  roadblocks.push({ x: best.x, z: best.z, m, box, cones, t: 0, acrossX });
  toast("앞에 경찰 바리케이드! 꺾어서 피하세요", 1.8);
  return true;
}
function removeRoadblock(i) {
  const r = roadblocks[i];
  removeDynBox(r.box);
  r.m.holder.visible = false; scene.remove(r.m.holder); rbCarPool.push(r.m);
  for (const c of r.cones) scene.remove(c.g);
  roadblocks.splice(i, 1);
}
/* 라바콘 치기 — 내 차면 속도 손해, 경찰차는 그냥 날려 버린다 */
function coneHits(car, isPlayer) {
  const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
  for (const r of roadblocks) {
    if (Math.hypot(car.x - r.x, car.z - r.z) > 25) continue;
    for (const c of r.cones) {
      if (c.hit) continue;
      for (const k of [1, 0, -1]) {
        if (Math.hypot(car.x + fx * CAR_OFF * k - c.x, car.z + fz * CAR_OFF * k - c.z) > CAR_R + 0.6) continue;
        c.hit = true; c.landed = false; c.y = Math.max(c.y, 0);
        c.vx = car.vx * 0.75 + rnd2(3); c.vz = car.vz * 0.75 + rnd2(3); c.vy = 5 + Math.random() * 4; c.spin = rnd2(14);
        if (isPlayer && state === "play") { car.vx *= CONE_SLOW; car.vz *= CONE_SLOW; shake = Math.max(shake, 0.45); }
        break;
      }
    }
  }
}
/* 바리케이드 경찰차와의 틈 (wasted 판정용) */
function boxGap(car, b) {
  const fx = -Math.sin(car.heading), fz = -Math.cos(car.heading);
  let g = Infinity;
  for (const k of [1, 0, -1]) {
    const x = car.x + fx * CAR_OFF * k, z = car.z + fz * CAR_OFF * k;
    const qx = clamp(x, b.x0, b.x1), qz = clamp(z, b.z0, b.z1);
    g = Math.min(g, Math.hypot(x - qx, z - qz) - CAR_R);
  }
  return g;
}
function updateRoadblocks(dt) {
  for (let i = roadblocks.length - 1; i >= 0; i--) {
    const r = roadblocks[i];
    // 위에서 쿵 내려앉는다
    const k = clamp(r.t / 0.45, 0, 1);
    r.m.holder.position.y = (1 - k * k) * 6;
    for (const [j, c] of r.cones.entries()) {
      if (!c.hit) {
        const kk = clamp((r.t - 0.2 - j * 0.03) / 0.4, 0, 1);
        c.y = (1 - kk * kk) * 7; c.g.position.set(c.x, c.y, c.z);
      } else if (!c.landed) {
        c.vy -= 20 * dt; c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt;
        c.g.rotation.x += c.spin * dt; c.g.rotation.z += c.spin * 0.6 * dt;
        if (c.y <= 0 && c.vy < 0) { c.y = 0; c.landed = true; c.g.rotation.set(Math.PI / 2, c.g.rotation.y, 0); }
        c.g.position.set(c.x, c.y + (c.landed ? 0.45 : 0), c.z);
      }
    }
  }
}
/* 바리케이드 수명 — 게임 시간으로 센다 (화면 없이 돌릴 때도 같게). 28초가 지나 120m 넘게 멀어지면 걷는다 */
function tickRoadblocks(dt) {
  for (let i = roadblocks.length - 1; i >= 0; i--) {
    const r = roadblocks[i];
    r.t += dt;
    const d = Math.hypot(P.x - r.x, P.z - r.z);
    if ((r.t > RB_LIFE && d > 120) || r.t > RB_LIFE + 25) removeRoadblock(i);
  }
}

/* ---------- 효과 ---------- */
const skidCap = 500;
const skidG = new THREE.PlaneGeometry(0.42 * CAR_SCALE, 1.2 * CAR_SCALE); skidG.rotateX(-Math.PI / 2);
const skids = new THREE.InstancedMesh(skidG, new THREE.MeshBasicMaterial({ color: "#1b1b1e", transparent: true, opacity: 0.55, depthWrite: false }), skidCap);
skids.count = 0; skids.frustumCulled = false; scene.add(skids);
let skidI = 0, skidCnt = 0;
const _m = new THREE.Matrix4(), _pos = new THREE.Vector3(), _qs = new THREE.Quaternion(), _sv = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);
function skidMark(x, z, h) {
  _pos.set(x, 0.035, z); _qs.setFromAxisAngle(_up, h); _m.compose(_pos, _qs, _sv);
  skids.setMatrixAt(skidI, _m); skidI = (skidI + 1) % skidCap; skidCnt = Math.min(skidCap, skidCnt + 1);
  skids.count = skidCnt; skids.instanceMatrix.needsUpdate = true;
}
const PUFF_N = 140, puffs = [];
for (let i = 0; i < PUFF_N; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, opacity: 0 }));
  s.visible = false; scene.add(s); puffs.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1 });
}
let puffI = 0;
function puff(x, y, z, color, size, life, vx, vy, vz) {
  const p = puffs[puffI]; puffI = (puffI + 1) % PUFF_N;
  p.s.visible = true; p.s.position.set(x, y, z); p.s.material.color.set(color); p.s.scale.setScalar(size);
  p.life = p.max = life; p.vx = vx; p.vy = vy; p.vz = vz; p.size = size;
}
let skidAcc = 0;
function updateFx(dt) {
  const fx = -Math.sin(P.heading), fz = -Math.cos(P.heading), rx = -fz, rz = fx;
  const rearX = P.x - fx * CAR_LEN * 0.42, rearZ = P.z - fz * CAR_LEN * 0.42;
  const sliding = P.drift || Math.abs(P.side) > 3.2;
  if (sliding && Math.abs(P.side) > 1.2) {
    puff(rearX + rx * rnd2(1.6), 0.7, rearZ + rz * rnd2(1.6), "#e8e8ec", 2.6, 0.75, rnd2(1.4), 1.5, rnd2(1.4));
    skidAcc += Math.hypot(P.vx, P.vz) * dt;
    if (skidAcc > 1.25) { skidAcc = 0; const mv = Math.atan2(-P.vx, -P.vz); for (const k of [-1, 1]) skidMark(rearX + rx * k * CAR_W * 0.42, rearZ + rz * k * CAR_W * 0.42, mv); }
  }
  if (P.boostT > 0) for (let i = 0; i < 2; i++) {
    const cols = ["#ffd24a", "#ff8a2a", "#fff1c2"];
    puff(rearX - fx * 0.45 + rnd2(0.75), 0.9 + Math.random() * 0.45, rearZ - fz * 0.45 + rnd2(0.75), cols[(Math.random() * 3) | 0], 2.1 + Math.random() * 1.1, 0.48, -fx * 13 + rnd2(2.3), 0.65, -fz * 13 + rnd2(2.3));
  }
  // 경찰차 부스터: 파란 불꽃
  for (const c of cops) {
    if (c.boostT <= 0 || c.dist > 130) continue;
    const cfx = -Math.sin(c.heading), cfz = -Math.cos(c.heading);
    puff(c.x - cfx * CAR_LEN * 0.5 + rnd2(0.6), 0.9 + Math.random() * 0.4, c.z - cfz * CAR_LEN * 0.5 + rnd2(0.6), Math.random() < 0.5 ? "#7fb4ff" : "#dbe9ff", 1.9 + Math.random() * 0.9, 0.38, -cfx * 11 + rnd2(2), 0.55, -cfz * 11 + rnd2(2));
  }
  if (landed > 0) {   // 쿵 — 착지 먼지
    for (let i = 0; i < 10; i++) puff(P.x + rnd2(3), 0.6, P.z + rnd2(3), "#e6ddd0", 3 + Math.random() * 2, 0.8, rnd2(6), 1.5, rnd2(6));
    landed = 0;
  }
  for (const p of puffs) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    const k = Math.max(0, p.life / p.max);
    p.s.material.opacity = k * 0.8; p.s.scale.setScalar(p.size * (1.7 - k * 0.7));
    if (p.life <= 0) p.s.visible = false;
  }
}
const rnd2 = (a) => (Math.random() - 0.5) * 2 * a;
let landed = 0;

/* ---------- 카메라 ---------- */
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
/* 시점: 기본(뒤) · 가까이(뒤, 바짝) · 위에서(90° 내려다보기, 넓게). 버튼이나 C 키로 바꾼다 */
const CAM_MODES = [["far", "기본"], ["top", "위에서"]];   // 가까이 시점은 뺐다 (2026-11-08 사용자 요청)
let camMode = 0;
try { camMode = clamp(parseInt(localStorage.getItem("vice_cam2") || "0", 10) || 0, 0, 1); } catch (e) { camMode = 0; }
const UP = new THREE.Vector3(0, 1, 0);
function setCamMode(i) {
  camMode = (i + CAM_MODES.length) % CAM_MODES.length;
  $("camBtn").textContent = `시점: ${CAM_MODES[camMode][1]}`;
  try { localStorage.setItem("vice_cam2", String(camMode)); } catch (e) { /* 저장 못 해도 된다 */ }
  // 위에서 볼 땐 화면이 넓어 그림자 범위도 넓힌다
  const r = CAM_MODES[camMode][0] === "top" ? 150 : 105;
  sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.updateProjectionMatrix();
  camInit = false;
}
let camYaw = 0, camInit = false, orbitA = 0, shake = 0;
function updateCamera(dt, realDt) {
  // "위에서" 시점이 카메라 위쪽을 달리는 방향으로 돌려 놓는다 → 다른 화면에선 늘 똑바로 세운다
  // (첫 화면으로 돌아왔을 때 90° 누워 보이던 문제, 2026-11-08)
  camera.up.copy(UP);
  if (window.__fixCam) {  // 테스트·스크린샷용 고정 카메라
    const f = window.__fixCam;
    camera.position.set(f[0], f[1], f[2]); camera.fov = f[6] || 55; camera.updateProjectionMatrix(); camera.lookAt(f[3], f[4], f[5]);
    return;
  }
  if (state === "title") {
    orbitA += realDt * 0.28;
    // 첫 화면: 차 앞쪽에서 얼굴이 보이게 살살 흔든다. 카드는 왼쪽, 차는 오른쪽 (넓은 화면)
    const a = Math.sin(orbitA * 0.8) * 0.5 - 0.35, r = 16, wide = innerWidth > 900;
    camPos.set(P.x + Math.sin(a) * r, 4.1, P.z - Math.cos(a) * r);
    camLook.set(P.x, 2.3, P.z);
    camera.position.copy(camPos); camera.fov = 42;
    if (wide) camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.2, 0, innerWidth, innerHeight); else camera.clearViewOffset();
    camera.lookAt(camLook); camera.updateProjectionMatrix();
    return;
  }
  camera.up.copy(UP);
  if (state === "wasted" || state === "result") {
    orbitA += realDt * 0.2;
    const r = 18 + wastedT * 0.55, a = camYaw + 2.3 + orbitA;
    const tx = P.x + Math.sin(a) * r, tz = P.z + Math.cos(a) * r;
    camPos.lerp(new THREE.Vector3(tx, 8.8, tz), 1 - Math.exp(-realDt * 2.2));
    camLook.lerp(new THREE.Vector3(P.x, 1.6, P.z), 1 - Math.exp(-realDt * 3));
    camera.position.copy(camPos); camera.lookAt(camLook);
    camera.fov += (50 - camera.fov) * Math.min(1, realDt * 1.5); camera.updateProjectionMatrix();
    return;
  }
  const vh = Math.hypot(P.vx, P.vz) > 4 ? Math.atan2(-P.vx, -P.vz) : P.heading;
  // 달리는 방향과 차 방향의 가운데를 본다 — 드리프트하면 차 옆모습이 살짝 보인다
  const wantYaw = P.heading + angDiff(vh, P.heading) * (P.speed > 2 ? 0.55 : 0);
  camYaw += angDiff(wantYaw, camYaw) * Math.min(1, dt * (P.drift ? 2.6 : 4.2));
  if (!camInit) { camYaw = P.heading; }
  const boost = P.boostT > 0, mode = CAM_MODES[camMode][0];
  if (mode === "top") {
    // 바로 위에서 내려다본다. 달리는 쪽이 화면 위가 되게 돌리고, 빠를수록 더 높이
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const h = 56 + clamp(Math.hypot(P.vx, P.vz) / 41, 0, 1) * 16;     // 조금 더 가까이 (2026-11-08)
    const k = camInit ? 1 - Math.exp(-dt * 6) : 1;
    camPos.x = lerp(camPos.x, P.x + fx * 12, k); camPos.z = lerp(camPos.z, P.z + fz * 12, k); camPos.y = lerp(camPos.y, h, k);
    camInit = true;
    camera.position.copy(camPos);
    camera.up.set(fx, 0, fz);
    camera.lookAt(camPos.x, 0, camPos.z);
    camera.fov += (52 - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
    return;
  }
  // 기본: 차 바로 뒤, 지붕(머리) 높이쯤에서 앞을 본다 — 차가 화면 아래 가운데에 크게, 지평선은 화면 가운데 조금 위
  const back = boost ? 13.2 : 11.6, up = boost ? 3.6 : 3.75;
  const cx = P.x + Math.sin(camYaw) * back, cz = P.z + Math.cos(camYaw) * back;
  const k = camInit ? 1 - Math.exp(-dt * 10) : 1;
  camPos.x = lerp(camPos.x, cx, k); camPos.z = lerp(camPos.z, cz, k); camPos.y = lerp(camPos.y, up + (P.y || 0) * 0.85, k);
  // 건물 안으로 카메라가 들어가지 않게 — 막히면 차 쪽으로 당긴다
  const pc = { x: camPos.x, z: camPos.z };
  const hit = pushOut(pc, 1.2);
  if (hit) { camPos.x = pc.x; camPos.z = pc.z; }
  const ahead = 12;
  const ax = P.x - Math.sin(camYaw) * ahead, az = P.z - Math.cos(camYaw) * ahead;
  camLook.set(ax, 2.2 + (P.y || 0) * 0.7, az);
  camInit = true;
  shake = Math.max(0, shake - dt * 3);
  camera.position.copy(camPos);
  if (shake > 0 || boost) { const s = shake * 0.35 + (boost ? 0.035 : 0); camera.position.x += rnd2(s); camera.position.y += rnd2(s); }
  camera.lookAt(camLook);
  const fov = boost ? 64 : 55 + clamp(Math.hypot(P.vx, P.vz) / MAX, 0, 1) * 4;
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
}

/* ---------- 작은 지도 ---------- */
const mapC = $("map"), mg = mapC.getContext("2d");
const mapBase = document.createElement("canvas"); mapBase.width = mapC.width; mapBase.height = mapC.height;
const mpx = (x) => (x - BOUNDS.x0) / (BOUNDS.x1 - BOUNDS.x0) * mapC.width;
const mpz = (z) => (z - BOUNDS.z0) / (BOUNDS.z1 - BOUNDS.z0) * mapC.height;
(function drawBase() {
  const g = mapBase.getContext("2d");
  g.fillStyle = "#9bd163"; g.fillRect(0, 0, mapBase.width, mapBase.height);
  const im = g.createImageData(NAV.w, NAV.h);
  for (let j = 0; j < NAV.h; j++) for (let i = 0; i < NAV.w; i++) {
    const x = NAV.x0 + (i + 0.5) * NAV.cell, z = NAV.z0 + (j + 0.5) * NAV.cell, o = (j * NAV.w + i) * 4;
    let c = [155, 209, 99];
    if (isRoad(x, z)) c = [76, 80, 88];
    else if (inWater(x, z)) c = [61, 176, 232];
    else if (!NAV.cost[j * NAV.w + i]) c = [222, 208, 196];
    im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; im.data[o + 3] = 255;
  }
  const t = document.createElement("canvas"); t.width = NAV.w; t.height = NAV.h; t.getContext("2d").putImageData(im, 0, 0);
  g.imageSmoothingEnabled = false; g.drawImage(t, 0, 0, mapBase.width, mapBase.height);
  g.strokeStyle = "#e2382f"; g.lineWidth = 6; g.strokeRect(3, 3, mapBase.width - 6, mapBase.height - 6);   // 맵 끝
})();
function drawMap() {
  mg.drawImage(mapBase, 0, 0);
  const dot = (x, z, col, r) => { mg.fillStyle = col; mg.beginPath(); mg.arc(mpx(x), mpz(z), r, 0, 7); mg.fill(); mg.lineWidth = 2.5; mg.strokeStyle = "#fff"; mg.stroke(); };
  const flash = Math.floor(simT * 5) % 2;
  // 점프대: 노란 고리 / 노란 세모 (가는 방향)
  for (const r of RAMPS) {
    if (r.ring) { mg.strokeStyle = "#ffd21f"; mg.lineWidth = 3.5; mg.beginPath(); mg.arc(mpx(r.x), mpz(r.z), r.rOut / (BOUNDS.x1 - BOUNDS.x0) * mapC.width, 0, 7); mg.stroke(); continue; }
    const x = mpx(r.x + r.dx * r.len / 2), z = mpz(r.z);
    mg.fillStyle = "#ffd21f"; mg.strokeStyle = "#111"; mg.lineWidth = 1.5;
    mg.beginPath(); mg.moveTo(x + r.dx * 7, z); mg.lineTo(x - r.dx * 5, z - 5); mg.lineTo(x - r.dx * 5, z + 5); mg.closePath(); mg.fill(); mg.stroke();
  }
  // 바리케이드: 빨강·하양 막대
  for (const r of roadblocks) {
    const x = mpx(r.x), z = mpz(r.z), L = 16, W = 6;
    mg.fillStyle = flash ? "#ff2f2a" : "#ffffff"; mg.strokeStyle = "#111"; mg.lineWidth = 2;
    if (r.acrossX) { mg.fillRect(x - L / 2, z - W / 2, L, W); mg.strokeRect(x - L / 2, z - W / 2, L, W); }
    else { mg.fillRect(x - W / 2, z - L / 2, W, L); mg.strokeRect(x - W / 2, z - L / 2, W, L); }
  }
  for (const c of cops) dot(c.x, c.z, flash ? "#ff2f2a" : "#2f62ff", 8);
  mg.save(); mg.translate(mpx(P.x), mpz(P.z)); mg.rotate(-P.heading);
  mg.fillStyle = "#ffd21f"; mg.strokeStyle = "#111"; mg.lineWidth = 2.5;
  mg.beginPath(); mg.moveTo(0, -14); mg.lineTo(10, 11); mg.lineTo(0, 5); mg.lineTo(-10, 11); mg.closePath(); mg.fill(); mg.stroke();
  mg.restore();
}

/* ---------- 화면 조각 ---------- */
let toastT = 0;
function toast(t, sec = 1.5) { const e = $("toast"); e.textContent = t; e.style.opacity = 1; toastT = sec; }
const LINES = ["RED LIGHT ON A GTA!!!", "경찰이 바로 내 뒤에!!!", "아아아아아아아아아 스껄!!!"];
let bubbleOn = true;
try { bubbleOn = localStorage.getItem("vice_bubble") !== "0"; } catch (e) { bubbleOn = true; }
function setBubble(on) {
  bubbleOn = on;
  $("bubbleBtn").textContent = `말풍선: ${on ? "켬" : "끔"}`;
  try { localStorage.setItem("vice_bubble", on ? "1" : "0"); } catch (e) { /* 저장 못 해도 된다 */ }
}
let lineI = 0, lineT = 0;
const _v = new THREE.Vector3();
function updateBubble(dt) {
  const b = $("bubble");
  if (state !== "play" || !bubbleOn) { b.style.display = "none"; return; }
  lineT -= dt;
  if (lineT <= 0) { lineT = 2.5; b.textContent = LINES[lineI]; lineI = (lineI + 1) % LINES.length; }
  _v.set(P.x, models.headTopY + 0.3 + (P.y || 0), P.z).project(camera);   // 점프할 때도 머리 위를 따라간다
  if (_v.z > 1) { b.style.display = "none"; return; }
  b.style.display = "block";
  const x = (_v.x * 0.5 + 0.5) * innerWidth, y = (-_v.y * 0.5 + 0.5) * innerHeight;
  // 위에서 볼 땐 머리 위가 곧 차 위라 말풍선이 차를 가린다 → 화면 위쪽으로 띄운다
  const lift = CAM_MODES[camMode][0] === "top" ? 36 : 0;
  b.style.transform = `translate(${x}px,${y - lift}px) translate(-50%,-100%)`;
}
/* 수배 별 (GTA 처럼): 경찰이 늘 때마다 깜빡이며 채워진다. 7대 → 별 5개 (1·2·3·3·4·5·5) */
let starsShown = 0;
function updateCopDots() {
  const n = Math.min(5, Math.ceil(cops.length * 5 / 7));
  const el = $("stars");
  el.querySelectorAll("svg").forEach((s, i) => s.classList.toggle("on", i < n));
  if (cops.length > 0 && state === "play") { el.classList.remove("blink"); void el.offsetWidth; el.classList.add("blink"); }
  starsShown = n;
}

/* ---------- 흐름 ---------- */
function reset() {
  const sp = world.spawn;
  Object.assign(P, { y: 0, vy: 0, air: false, climb: 0, land: 0, spin: 0, hits: 0, x: sp.x, z: sp.z, heading: sp.heading, vx: 0, vz: 0, speed: 0, side: 0, steer: 0, grip: GRIP, drift: false, driftT: 0, boostWin: 0, boostT: 0, touching: false, ready: false, boosts: 0 });
  if (Q.get("at")) { const [a, b, h] = Q.get("at").split(",").map(Number); P.x = a; P.z = b; P.heading = (h || 0) * Math.PI / 180; }
  for (const c of cops) c.m.holder.visible = false;
  while (roadblocks.length) removeRoadblock(0);
  nextRB = RB_START;
  cops = []; simT = 0; stuck = 0; contactAgo = 9; history = []; moved = 99; nextCop = 0; timeScale = 1; wastedT = 0; camInit = false; orbitA = 0; lineT = 0; lineI = 0;
  skidCnt = 0; skids.count = 0;
  computeField(P.x, P.z); fieldClock = 0;
  canvas.style.filter = "";
  $("wasted").style.opacity = 0; $("wText").style.opacity = 0; $("wText").style.transform = "translateX(-50%) scale(1.5)";
  $("vig").style.opacity = 0; $("stuck").style.opacity = 0; $("result").style.display = "none";
}
function addCop() {
  const i = cops.length;
  if (i === 0) {
    // 첫 경찰차는 뒤쪽 길 위에서 바로 시작한다
    const fx = -Math.sin(P.heading), fz = -Math.cos(P.heading);
    cops.push(newCop(0, P.x - fx * 75, P.z - fz * 75, P.heading));
    if (cops[0].x < BOUNDS.x0 + 6) cops[0].x = BOUNDS.x0 + 6;
  } else {
    const s = spawnPoint();
    cops.push(newCop(i, s.x, s.z, s.h));
    toast(`경찰차 ${i + 1}대째 출동!`, 2);
  }
  updateCopDots();
}
function startGame() {
  camera.clearViewOffset();
  reset();
  state = "play";
  Au.unlock(); Au.startLoops();
  $("start").style.display = "none"; $("hud").style.display = "block";
  $("tBest").textContent = best > 0 ? `최고 ${fmt(best)}` : "";
  updateCopDots();
}
function restart() { startGame(); }
function goWasted() {
  state = "wasted"; wastedT = 0;
  Au.wastedAudio();
  P.boostT = 0;
  $("bubble").style.display = "none"; $("stuck").style.opacity = 0; $("hint").style.opacity = 0; $("boostBar").style.opacity = 0;
  const isBest = simT > best;
  if (isBest) { best = simT; try { localStorage.setItem("vice_best", String(best)); } catch (e) { /* 저장 못 해도 게임은 된다 */ } }
  $("rTime").textContent = fmt(simT);
  $("rBest").textContent = isBest ? "새 기록!" : `최고 기록 ${fmt(best)}`;
  runScore = Math.floor(simT * 10);      // 순위표에는 0.1초 단위 정수로 보낸다
  runSubmitted = false;
  $("nameForm").style.display = ""; $("btnSubmit").disabled = false; $("submitMsg").textContent = "";
  $("nameIn").value = loadName();
}

/* ---------- 멈추기 ---------- */
let paused = false;
function setPause(on) {
  if (state !== "play") on = false;
  paused = on;
  for (const k in keys) keys[k] = false;
  for (const k in touch) touch[k] = 0;
  $("pause").style.display = on ? "flex" : "none";
  if (on) Au.suspend(); else Au.unlock();
}
function goHome() {
  paused = false; $("pause").style.display = "none";
  Au.unlock(); Au.silence();
  state = "title"; reset();
  $("hud").style.display = "none"; $("result").style.display = "none"; $("start").style.display = "flex";
}

/* ---------- 순위표 (bamti-bomb 서버의 일반 순위표, 칸 이름 viceversa) ----------
   점수 = 버틴 시간 × 10 (0.1초 단위). 50위까지만 보여 준다.
   서버가 판을 다시 돌려 검증하지 않으니 조작한 점수는 못 막는다 (비프리 게임과 같은 방식) */
const API = Q.get("api") || "https://bamti-bomb.fly.dev";
const BOARD = "viceversa", RANK_N = 50;
let runScore = 0, runSubmitted = false, rankBack = "start";
const loadName = () => { try { return localStorage.getItem("vice_name") || ""; } catch (e) { return ""; } };
const saveName = (n) => { try { localStorage.setItem("vice_name", n); } catch (e) { /* 저장 못 해도 된다 */ } };
async function fetchT(url, opt, ms) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ac.signal }); } finally { clearTimeout(t); }
}
function renderRank(rows, me) {
  const ol = $("rankList"); ol.innerHTML = "";
  rows = rows.slice(0, RANK_N);
  if (!rows.length) { ol.innerHTML = '<li class="empty">아직 기록이 없어요</li>'; return; }
  let marked = false;
  rows.forEach((row, i) => {
    const li = document.createElement("li");
    if (i < 3) li.className = "top";
    if (me && !marked && row.n === me.n && row.s === me.s) { li.className += " me"; marked = true; }
    const r = document.createElement("span"); r.className = "r"; r.textContent = i + 1;
    const n = document.createElement("span"); n.className = "n"; n.textContent = row.n;
    const t = document.createElement("span"); t.className = "s"; t.textContent = fmt(row.s / 10);
    li.append(r, n, t); ol.append(li);
  });
  const meEl = ol.querySelector(".me");
  if (meEl) meEl.scrollIntoView({ block: "center" });
}
async function openRank(from) {
  rankBack = from;
  $(from).style.display = "none"; $("rank").style.display = "flex";
  $("rankList").innerHTML = '<li class="empty">불러오는 중…</li>';
  try {
    const r = await (await fetchT(API + "/api/scores/" + BOARD + "?limit=" + RANK_N, {}, 6000)).json();
    renderRank(r.rows || []);
  } catch (e) { $("rankList").innerHTML = '<li class="empty">순위표를 불러오지 못했어요</li>'; }
}
async function submitScore(e) {
  e.preventDefault();
  if (runSubmitted) return;
  const name = $("nameIn").value.trim();
  if (!name) { $("submitMsg").textContent = "닉네임을 적어 주세요"; return; }
  saveName(name);
  $("btnSubmit").disabled = true; $("submitMsg").textContent = "등록하는 중…";
  try {
    const res = await fetchT(API + "/api/scores/" + BOARD, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, score: runScore }) }, 8000);
    const r = await res.json();
    if (!res.ok || !r.rows) throw new Error((r && r.error) || "fail");
    runSubmitted = true;
    $("nameForm").style.display = "none";
    const me = { n: name.slice(0, 10), s: runScore };
    const at = r.rows.findIndex(x => x.n === me.n && x.s === me.s);
    $("submitMsg").textContent = at >= 0 && at < RANK_N ? `${at + 1}등으로 올라갔어요!` : `등록했어요 (${RANK_N}등 밖)`;
    rankBack = "result";
    $("result").style.display = "none"; $("rank").style.display = "flex";
    renderRank(r.rows, me);
  } catch (err) {
    $("btnSubmit").disabled = false;
    const m = { too_many: "잠깐 뒤에 다시 눌러 주세요", bad_name: "닉네임을 다시 적어 주세요", bad_score: "기록이 이상해서 올리지 못했어요" }[err.message];
    $("submitMsg").textContent = m || "등록하지 못했어요. 인터넷 연결을 확인해 주세요";
  }
}

/* ---------- 봇 (테스트) ---------- */
function botInput() {
  const pts = world.roadPoints;
  if (!P.botT || Math.hypot(P.botT.x - P.x, P.botT.z - P.z) < 16) {
    const near = pts.filter(p => { const d = Math.hypot(p.x - P.x, p.z - P.z); return d > 25 && d < 190 && lineClear(P.x, P.z, p.x, p.z); });
    const safe = (p) => Math.min(...cops.map(c => Math.hypot(c.x - p.x, c.z - p.z)), 999);
    near.sort((a, b) => safe(b) - safe(a));
    P.botT = near.length ? near[0] : pts[(Math.random() * pts.length) | 0];
  }
  const want = Math.atan2(-(P.botT.x - P.x), -(P.botT.z - P.z)), d = angDiff(want, P.heading);
  const v = Math.hypot(P.vx, P.vz), big = Math.abs(d) > 0.6;
  return { up: !big || v < 13, down: big && v > 16, left: d > 0.08, right: d < -0.08, drift: false, boost: false };
}

/* ---------- 한 걸음 ---------- */
let fieldClock = 0;
function stepSim(dt) {
  if (state === "play") {
    simT += dt;
    while (nextCop < COP_TIMES.length && simT >= COP_TIMES[nextCop]) { addCop(); nextCop++; }
    if (simT >= nextRB) {
      const ok = placeRoadblock();
      nextRB = simT + (ok ? lerp(RB_GAP[0], RB_GAP[1], clamp((simT - RB_START) / 90, 0, 1)) : 2);
    }
    tickRoadblocks(dt);
    fieldClock -= dt;
    if (fieldClock <= 0) { computeField(P.x, P.z); fieldClock = 0.25; }
  }
  drivePlayer(dt);
  let gapMin = Infinity;
  for (const c of cops) {
    if (state === "play" || state === "wasted") driveCop(c, dt);
  }
  // 차끼리
  const near = [];
  for (const c of cops) {
    const relV = Math.hypot(c.vx - P.vx, c.vz - P.vz);
    const pvx = P.vx, pvz = P.vz;
    const g = carPair(P, c, 1, c.slot ? 5 : 1);
    // 밀려나는 몫을 KNOCK_MAX 까지만
    { const dvx = P.vx - pvx, dvz = P.vz - pvz, dv = Math.hypot(dvx, dvz);
      if (dv > KNOCK_MAX) { const k = KNOCK_MAX / dv; P.vx = pvx + dvx * k; P.vz = pvz + dvz * k; } }
    if (g < gapMin) gapMin = g;
    // 세게 박히면 차가 휙 돈다 (박힌 쪽 반대로). 미끄러지게 접지력도 잠깐 잃는다
    c.hitCd = Math.max(0, (c.hitCd || 0) - dt);
    if (g < 0 && relV > RAM_MIN && c.hitCd <= 0 && state === "play") {
      c.hitCd = 1;
      const pfx = -Math.sin(P.heading), pfz = -Math.cos(P.heading);
      const latS = (c.x - P.x) * -pfz + (c.z - P.z) * pfx, along = (c.x - P.x) * pfx + (c.z - P.z) * pfz;
      const dir = (latS >= 0 ? 1 : -1) * (along >= 0 ? -1 : 1);
      P.spin = (P.spin || 0) + dir * Math.min(1.6, relV * RAM_SPIN);
      P.grip = Math.min(P.grip, 1.2);
      // 박히면 속도를 잃는다 (부스터 중엔 덜). 밀려서 빨라지는 일이 없게
      const keep = P.boostT > 0 ? 0.85 : RAM_KEEP;
      const sp = Math.hypot(P.vx, P.vz), cap = (P.boostT > 0 ? BOOSTV : MAX) * keep;
      if (sp > cap) { P.vx *= cap / sp; P.vz *= cap / sp; }
      shake = Math.max(shake, Math.min(1, relV / 28));
      P.hits = (P.hits || 0) + 1;
    }
    // 옆·앞에서 긁히면 속도를 잃는다 (바로 뒤에서 닿는 건 그대로 달릴 수 있게)
    if (g < 0.2 && P.boostT <= 0) {
      const front = (c.x - P.x) * -Math.sin(P.heading) + (c.z - P.z) * -Math.cos(P.heading);
      if (front > -3) { const k = Math.exp(-0.8 * dt); P.vx *= k; P.vz *= k; }
    }
    near.push(g);
    if (g < -0.1 && Math.hypot(P.vx - c.vx, P.vz - c.vz) > 9) shake = Math.max(shake, 0.8);
  }
  for (let i = 0; i < cops.length; i++) for (let j = i + 1; j < cops.length; j++) carPair(cops[i], cops[j], 1, 1);
  if (roadblocks.length) {
    coneHits(P, true);
    for (const c of cops) coneHits(c, false);
    for (const r of roadblocks) gapMin = Math.min(gapMin, boxGap(P, r.box));
  }
  // 경찰이 밀어 넣어 벽에 끼면 빠져나오도록 한 번 더
  for (const c of cops) { const vx = c.vx, vz = c.vz; c.vx = 0; c.vz = 0; moveCar(c, 0); c.vx = vx; c.vz = vz; }
  { const vx = P.vx, vz = P.vz; moveCar(P, 0); if (Math.hypot(P.vx - vx, P.vz - vz) === 0) { P.vx = vx; P.vz = vz; } }

  if (state === "play") {
    contactAgo = gapMin < CONTACT_GAP ? 0 : contactAgo + dt;
    history.push({ t: simT, x: P.x, z: P.z });
    while (history.length > 2 && history[1].t < simT - STUCK_WINDOW) history.shift();
    const h0 = history[0];
    const full = simT - h0.t >= STUCK_WINDOW * 0.95;
    moved = full ? Math.hypot(P.x - h0.x, P.z - h0.z) : 99;
    const blocked = moved < STUCK_MOVE && contactAgo < CONTACT_GRACE;
    stuck = blocked ? stuck + dt : Math.max(0, stuck - dt * STUCK_DRAIN);
    if (stuck >= STUCK_FILL && !Q.has("nowaste")) goWasted();
  }
}

function syncModels(dt, realDt) {
  const H = models.holder;
  H.position.set(P.x, P.y || 0, P.z); H.rotation.y = P.heading;
  if (H.userData.blob) H.userData.blob.position.y = (groundAt(P.x, P.z) - (P.y || 0)) / CAR_SCALE + 0.05;
  // 기울기: 드리프트 때 바깥으로, 부스터 때 앞이 살짝 들린다
  const leanT = (P.drift ? -P.steer * 0.1 : -P.steer * 0.035);
  models.body.rotation.z += (leanT - models.body.rotation.z) * Math.min(1, realDt * 9);
  const hv = Math.max(4, Math.hypot(P.vx, P.vz));
  const pitchT = (P.boostT > 0 ? 0.035 : 0) + clamp(Math.atan2(P.air ? P.vy : (P.y > 0.05 ? P.climb || 0 : 0), hv), -0.45, 0.45);
  models.body.rotation.x += (pitchT - models.body.rotation.x) * Math.min(1, realDt * 6);
  // 고개는 카메라 쪽으로 — 뒤에서 봐도 얼굴이 보이게 (뒤돌아보기)
  const tocam = Math.atan2(-(camera.position.x - P.x), -(camera.position.z - P.z));
  let rel = angDiff(tocam, P.heading);
  // 바로 뒤에 있는 카메라면 왼쪽 어깨 너머로 돌아본다 — 좌우로 왔다 갔다 하지 않게 지금 돌아본 쪽을 유지
  if (Math.abs(rel) > 2.5) rel = (lookNow < -0.3 && rel < 0 ? -1 : 1) * Math.abs(rel);
  headT -= realDt;
  if (headT <= 0) { headBack = !headBack; headT = headBack ? 3 + Math.random() * 1.5 : 1 + Math.random() * 0.8; }
  const lookFwd = (CAM_MODES[camMode][0] === "top" || !headBack) && state === "play";
  const wantHead = lookFwd ? 0 : clamp(rel, -HEAD_LIM, HEAD_LIM);
  lookNow += (wantHead - lookNow) * Math.min(1, realDt * 5);
  models.lookAt(lookNow);
  const t = performance.now() / 1000 * (state === "wasted" || state === "result" ? 0.25 : 1);
  for (const c of cops) {
    const g = c.m.holder; g.position.set(c.x, c.y || 0, c.z); g.rotation.y = c.heading;
    const cp = clamp(Math.atan2(c.air ? c.vy : (c.y > 0.05 ? c.climb || 0 : 0), Math.max(4, Math.hypot(c.vx, c.vz))), -0.45, 0.45);
    c.m.body.rotation.x += (cp - c.m.body.rotation.x) * Math.min(1, realDt * 8);
    if (g.userData.blob) g.userData.blob.position.y = (groundAt(c.x, c.z) - (c.y || 0)) / CAR_SCALE + 0.05;
    const lean = -c.steer * 0.04;
    c.m.body.rotation.z += (lean - c.m.body.rotation.z) * Math.min(1, realDt * 8);
    c.m.flash(t + c.i * 0.37);
  }
  for (const r of roadblocks) r.m.flash(t + 0.21);
  sun.position.set(P.x + 90, 170, P.z + 60); sun.target.position.set(P.x, 0, P.z);
  void dt;
}
let lookNow = 0, headBack = true, headT = 3.5;   // 뒤돌아보기 ↔ 앞 보기 (2026-11-08: 앞을 한 번도 안 봐서)
const HEAD_LIM = 2.55;   // 146° — 뒤에서도 얼굴이 보일 만큼

function updateUI(realDt) {
  $("tVal").textContent = fmt(simT);
  if (toastT > 0) { toastT -= realDt; if (toastT <= 0) $("toast").style.opacity = 0; }
  const boosting = P.boostT > 0;
  $("boostBar").style.opacity = boosting ? 1 : 0;
  if (boosting) $("boostBar").firstElementChild.style.transform = `scaleX(${P.boostT / BOOST_T})`;
  const hint = $("hint");
  if (state === "play" && P.ready && !boosting) { hint.textContent = "지금 ↑ !"; hint.style.opacity = 1; }
  else hint.style.opacity = 0;
  const k = stuck / STUCK_FILL;
  $("stuck").style.opacity = state === "play" && k > 0.12 ? 1 : 0;
  $("stuck").querySelector("i").style.width = `${clamp(k, 0, 1) * 100}%`;
  $("vig").style.opacity = state === "play" ? clamp(k * 1.1, 0, 1) : 0;
  if (state === "play") {
    let n = 1e9; for (const c of cops) n = Math.min(n, c.dist || 1e9);
    Au.updateSiren(n, cops.length);
    Au.updateEngine(Math.hypot(P.vx, P.vz), boosting);
    drawMap();
  }
}

function updateWasted(realDt) {
  wastedT += realDt;
  // 슬로우모션으로 서서히 → 흑백 → 글자
  timeScale = lerp(1, 0.09, clamp(wastedT / 0.7, 0, 1));
  const g = clamp(wastedT / 0.9, 0, 1);
  canvas.style.filter = `grayscale(${g}) contrast(${1 + g * 0.22}) brightness(${1 - g * 0.2})`;
  $("wasted").style.opacity = clamp((wastedT - 0.25) / 0.7, 0, 1);
  const tx = clamp((wastedT - 0.75) / 0.4, 0, 1), e = 1 - (1 - tx) ** 3;
  $("wText").style.opacity = tx; $("wText").style.transform = `translateX(-50%) scale(${lerp(1.55, 1, e)})`;
  if (wastedT > 2.7 && state === "wasted") { state = "result"; $("result").style.display = "flex"; }
}

/* ---------- 고리 ---------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!models) return;
  if (paused) { renderer.render(scene, camera); return; }
  if (state === "wasted" || state === "result") updateWasted(realDt);
  const dt = realDt * timeScale;
  // 고정 간격으로 여러 번 — 빠른 차가 벽을 뚫지 않게
  const sub = Math.max(1, Math.ceil(dt / 0.0125));
  for (let i = 0; i < sub; i++) stepSim(dt / sub);
  updateFx(dt);
  updateRoadblocks(dt);
  world.update(realDt, now / 1000);
  updateCamera(dt, realDt);
  syncModels(dt, realDt);
  updateBubble(realDt);
  updateUI(realDt);
  renderer.render(scene, camera);
}

/* ---------- 시작 ---------- */
(async function boot() {
  const auP = Au.loadAudio().catch(e => console.warn("소리 못 불러옴", e));
  models = await loadCars(glowTex);
  scene.add(models.holder);
  await auP;
  state = "title";
  reset();
  const go = $("go"); go.disabled = false; go.textContent = "출발!";
  go.addEventListener("click", startGame);
  $("again").addEventListener("click", restart);
  $("pauseBtn").addEventListener("click", (e) => { e.currentTarget.blur(); setPause(true); });
  $("resumeBtn").addEventListener("click", () => setPause(false));
  $("homeBtn").addEventListener("click", goHome);
  $("homeBtn2").addEventListener("click", goHome);
  $("rankBtn1").addEventListener("click", () => openRank("start"));
  $("rankBtn2").addEventListener("click", () => openRank("result"));
  $("rankClose").addEventListener("click", () => { $("rank").style.display = "none"; $(rankBack).style.display = "flex"; });
  $("nameForm").addEventListener("submit", submitScore);
  $("camBtn").addEventListener("click", (e) => { e.currentTarget.blur(); setCamMode(camMode + 1); });
  setCamMode(camMode);
  $("bubbleBtn").addEventListener("click", (e) => { e.currentTarget.blur(); setBubble(!bubbleOn); });
  setBubble(bubbleOn);
  if (Q.has("play")) startGame();
  // 테스트용
  window.__game = {
    P, ramps: RAMPS, get cops() { return cops; }, get roadblocks() { return roadblocks; }, placeRoadblock, get state() { return state; }, get simT() { return simT; }, get stuck() { return stuck; }, get moved() { return moved; }, keys,
    tap() { upPressed = true; }, models, camera, renderer, scene,
    /* 화면 없이 빠르게 돌린다 */
    sim(sec, step = 1 / 60) { let n = Math.round(sec / step); while (n-- > 0 && state === "play") { stepSim(step); } return { t: simT, state, stuck, moved, dist: cops.map(c => Math.round(c.dist)) }; },
    setAuto(v) { autopilot = v; }, goWasted, setCamMode, setPause, get paused() { return paused; },
    teleport(x, z, h = 0) { P.x = x; P.z = z; P.heading = h; P.vx = P.vz = 0; P.y = 0; P.vy = 0; P.air = false; P.climb = 0; camInit = false; },
    snap() { updateCamera(0, 0); syncModels(0, 0); renderer.render(scene, camera); },
  };
  requestAnimationFrame(frame);
})();
void ROAD_W;
