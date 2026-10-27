/* 게임 진행: NPC 셋에게 길 묻기 → 포탈 도착. 코인, 말풍선(주인공), 대화창(NPC).

   대사 규칙 (사용자 요청)
   - 주인공 대사는 머리 위 말풍선 + 목소리. 대화창에는 안 나온다.
   - NPC 대사는 아래 대화창 글로만 (목소리 없음). 대화창이 떠 있어도 움직일 수 있다.
   - NPC 를 누르면(가까이서 클릭/Space) 주인공이 먼저 묻고 → 대화창이 열리고 → 창을 닫으면 주인공 대답.
   - 목소리 파일은 assets/audio/<id>.mp3 — 없으면 소리 없이 말풍선만. */
import * as THREE from "../vendor/three.module.min.js";
import { L, R, sx, sz, GOAL, BOUNDS, RAIL_Z, inWater, collide } from "./world.js";
import * as T from "./textures.js";

/* ---------------- 대사 ---------------- */
// 주인공 대사: [목소리 파일 id, 글]
// 사용자가 영상에서 나눠 둔 덩어리 그대로 한 파일씩 (중간에서 다시 자르지 않는다). 말풍선엔 여러 줄로
const V = {
  ask1: ["ask1", "어머니 상동호수공원 어디로 가요?"],
  after1: ["after1", "오케이 감사드리고~\n자 출발!\n달달달달달달달달달~"],
  ask2: ["ask2", "어머니 안녕하세요 비감입니다\n혹시 그 상동호수공원 어디로 가는지 아세요?"],
  after2: ["after2", "아 알겠습니다\n고맙습니다 비감이었습니다"],
  ask3: ["ask3", "저 안녕하세요 길좀 물을게요\n상동호수공원 어디로 가는지 아세요?"],
  pretty: ["pretty", "아 그래요?\n왤케 미인이세요?\n와 미쳤네"],
  wind: ["wind", "바람을 느끼고 가본다~\n어젯밤을 위해서~"],
  dal: ["dal", "달달달달달달달달달~"],
  fun: ["fun", "인디기 재미떠여!\n인디기 이거 너무 재미떠여!"],
};
// 뽀또를 먹을 때마다 차례대로 (세 번째 다음엔 다시 처음부터)
const PPOTTO_LINES = [
  ["ppotto1", "와 뽀또 개레전드 방송~"],
  ["ppotto2", "나 뽀또! 뽀또!"],
  ["ppotto3", "나 뽀또 한번만! 진짜 뽀또 한번만!"],
];

// NPC: 자리(x,z), 사진, 이름, 대사, 묻기 전후 주인공 대사, 다음에 할 일(화면 위 안내)
export const NPCS = [
  {
    id: "mom", name: "파마머리 어머님", h: 3.4,
    x: sx(1) + R / 2 - 0.9, z: sz(6) - 9,
    text: "여기서 2칸 직진해서 좌회전, 1칸 가서 우회전한 다음에, 기찻길 건너서 2칸 더 가요. 거기서 다음 사람한테 물어봐요~",
    before: [V.ask1], after: [V.after1],
    goal: "2칸 직진 → 좌회전 1칸 → 우회전 → 기찻길 건너 2칸 → 다음 사람에게 묻기",
  },
  {
    id: "yogurt", name: "요구르트 아주머니", h: 3.35,
    x: sx(0) + R / 2 - 0.9, z: sz(2) + 9,
    text: "앞에서 우회전해서 3칸 직진한 다음에, 다시 우회전해서 기찻길 건너 1칸, 좌회전해서 2칸 직진하고 또 여쭤봐야 돼요~ 지금 여기서 가르쳐 드려도 좀 멀어서~",
    before: [V.ask2], after: [V.after2, V.dal],
    goal: "우회전 3칸 → 우회전, 기찻길 건너 1칸 → 좌회전 2칸 → 또 여쭤보기",
  },
  {
    id: "woman", name: "젊은 여성분", h: 3.45,
    x: sx(5) - 9, z: sz(3) - R / 2 + 0.9,
    text: "아 일단 좌회전해서 기찻길 건너 2칸 직진하고, 우회전해서 1칸, 한 번 더 좌회전해서 쭉 가면 있어요~",
    before: [V.ask3], after: [V.pretty, 1.0, V.wind, V.dal],
    goal: "좌회전, 기찻길 건너 2칸 → 우회전 1칸 → 좌회전 → 쭉 가면 상동호수공원",
  },
];

/* ---------------- 소리 ---------------- */
/* 목소리 — <audio> 대신 WebAudio 로 튼다.
   아이폰 사파리는 <audio>.play() 를 사람이 누른 순간에만 허락해서, 게임 중에 저절로 나오는 대사가
   전부 막혔다(엔진 소리는 WebAudio 라 나왔다). WebAudio 는 출발 버튼에서 한 번 깨우면 그 뒤로 계속 된다.
   파일은 미리 받아 풀어 둔다(decodeAudioData) */
const audioCache = {};   // id → { buf: AudioBuffer|null, ok: true|false|null }
let actx = null;
function ctx() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }
export function unlockAudio() {
  try {
    const c = ctx();
    c.resume();
    // 아이폰: 누른 순간에 무음을 한 번 틀어야 확실히 깨어난다
    const b = c.createBuffer(1, 1, 22050), src = c.createBufferSource();
    src.buffer = b; src.connect(c.destination); src.start(0);
  } catch (e) { }
}
export function pauseAudio(on) { try { const c = ctx(); if (on) c.suspend(); else c.resume(); } catch (e) { } }
function voice(id) {
  if (!(id in audioCache)) {
    const v = audioCache[id] = { buf: null, ok: null, src: null };
    fetch(`assets/audio/${id}.mp3`).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(ab => new Promise((res, rej) => ctx().decodeAudioData(ab, res, rej)))
      .then(buf => { v.buf = buf; v.ok = true; })
      .catch(() => { v.ok = false; });
  }
  return audioCache[id];
}
export function voicesReady() {
  const all = Object.values(audioCache);
  return all.length ? all.filter(v => v.ok !== null).length / all.length : 1;
}
function playVoice(v) {
  stopVoice(v);
  const c = ctx(), src = c.createBufferSource();
  src.buffer = v.buf; src.connect(c.destination); src.start();
  v.src = src;
}
function stopVoice(v) { if (v && v.src) { try { v.src.stop(); } catch (e) { } v.src = null; } }
/* 스쿠터 엔진 소리 — 파일 없이 만든다. 부드럽게 (2026-10-26: 디스토션·잡음·각진 떨림은 귀가 아파서 뺐다).
   둥근 삼각파·사인파만 쓰고, 작은 스피커에서도 들리게 기본음 위에 2·3배음을 사인파로 얹는다.
   소리 크기는 사인파로 살살 흔들어 "웅웅웅", 빠를수록 음이 올라가 "부우웅" */
let engine = null;
export const ENGINE_VOL = 0.35;         // 전체 크기 (0~1)
export function engineUpdate(speed, running, duck) {
  let c;
  try { c = ctx(); } catch (e) { return; }
  if (c.state !== "running") return;
  if (!engine) {
    const out = c.createGain(); out.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600; lp.Q.value = 0.5;
    const am = c.createGain(); am.gain.value = 0.8;
    const mk = (type, gain) => { const o = c.createOscillator(); o.type = type; const g = c.createGain(); g.gain.value = gain; o.connect(g).connect(lp); return o; };
    const o1 = mk("triangle", 0.55), o2 = mk("sine", 0.35), o3 = mk("sine", 0.18);
    const lfo = c.createOscillator(); lfo.type = "sine";
    const lfoG = c.createGain(); lfoG.gain.value = 0.18;      // 얕게 흔든다 (깊으면 끊기는 소리가 난다)
    lfo.connect(lfoG).connect(am.gain);
    lp.connect(am).connect(out).connect(c.destination);
    for (const o of [o1, o2, o3, lfo]) o.start();
    engine = { out, lp, o1, o2, o3, lfo };
  }
  const k = Math.min(1, Math.abs(speed) / 9), t = c.currentTime;
  const f = 70 + k * 80;                                          // 공회전 70Hz → 최고 150Hz
  engine.o1.frequency.setTargetAtTime(f, t, 0.15);
  engine.o2.frequency.setTargetAtTime(f * 2, t, 0.15);
  engine.o3.frequency.setTargetAtTime(f * 3, t, 0.15);
  engine.lfo.frequency.setTargetAtTime(6 + k * 8, t, 0.15);
  engine.lp.frequency.setTargetAtTime(500 + k * 500, t, 0.2);
  const vol = running ? ENGINE_VOL * (0.55 + 0.45 * k) * (duck ? 0.4 : 1) : 0;
  engine.out.gain.setTargetAtTime(vol, t, 0.2);
}

/* 부스터·드리프트 소리 — 부드럽게 (삼각파·사인파만) */
/* 드리프트 "끼익" — 잡음을 좁은 띠로 걸러 높은 음처럼 만들고, 띠를 살짝 흔들어 긁히는 느낌을 낸다.
   날카롭지 않게 저역 필터로 위쪽을 깎고 크기는 작게 */
let skid = null;
export function skidUpdate(amount) {
  let c;
  try { c = ctx(); } catch (e) { return; }
  if (c.state !== "running") return;
  if (!skid) {
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = nb; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1500; bp.Q.value = 9;
    const lfo = c.createOscillator(); lfo.frequency.value = 9;
    const lfoG = c.createGain(); lfoG.gain.value = 160;
    lfo.connect(lfoG).connect(bp.frequency);
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200;
    const out = c.createGain(); out.gain.value = 0;
    src.connect(bp).connect(lp).connect(out).connect(c.destination);
    src.start(); lfo.start();
    skid = { out };
  }
  skid.out.gain.setTargetAtTime(amount * 0.55, c.currentTime, amount > 0 ? 0.05 : 0.12);
}

export function boostSfx() {
  // "푸슈슈" — 잡음을 띠 필터로 걸러 높은 곳에서 낮은 곳으로 쓸어내린다. 저역 필터로 날카로운 끝은 깎는다
  try {
    const c = ctx(), t = c.currentTime, len = 0.9;
    const nb = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = nb;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(700, t + len);
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.03);
    g.gain.setValueAtTime(0.32, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(bp).connect(lp).connect(g).connect(c.destination);
    src.start(t); src.stop(t + len);
  } catch (e) { }
}
export function driftSfx() {
  try {
    const c = ctx(), t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.32);
  } catch (e) { }
}

/* 뽀또 먹는 소리 — 코인보다 통통 튀는 세 음 (부드러운 삼각파) */
function ppottoSound() {
  try {
    const c = ctx(), t = c.currentTime;
    [[784, 0], [1047, 0.06], [1568, 0.12]].forEach(([f, d]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.16, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
      o.connect(g).connect(c.destination); o.start(t + d); o.stop(t + d + 0.25);
    });
  } catch (e) { }
}
function coinSound() {
  try {
    const c = ctx(), t = c.currentTime;
    for (const [f, d] of [[988, 0], [1319, 0.07]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "square"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.08, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
      o.connect(g).connect(c.destination); o.start(t + d); o.stop(t + d + 0.18);
    }
  } catch (e) { }
}
function portalSound() {
  try {
    const c = ctx(), t = c.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.09); g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.6);
      o.connect(g).connect(c.destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.65);
    });
  } catch (e) { }
}

/* ---------------- 게임 ---------------- */
export function createGame({ scene, camera, S, player, ui }) {
  // 목소리를 미리 받아 둔다 — 처음 말할 때 소리가 안 나오는 일이 없게
  for (const [id] of [...Object.values(V), ...PPOTTO_LINES]) voice(id);
  const state = {
    stage: 0,            // 0~2: 그 번호 NPC 차례, 3: 공원으로
    coins: 0, total: 0,
    ppotto: 0, ppottoTotal: 0,
    time: 0, running: false, done: false,
    talking: -1,         // 대화창이 열린 NPC
    asked: [false, false, false],
  };

  /* NPC: 사진 판 (항상 카메라 쪽으로 돈다) + 발밑 그림자 */
  const loader = new THREE.TextureLoader();
  const shadowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, "rgba(60,50,110,0.45)"); grd.addColorStop(1, "rgba(60,50,110,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const npcObjs = NPCS.map((n, i) => {
    const grp = new THREE.Group();
    grp.position.set(n.x, 0, n.z);
    const tex = loader.load(`assets/npc/${n.id}.png`, t => {
      const ar = t.image.width / t.image.height;
      board.scale.set(n.h * ar, n.h, 1);
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35 }));
    board.scale.set(n.h * 0.5, n.h, 1);
    board.userData.npc = i;
    grp.add(board);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.5).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    sh.position.y = 0.02; grp.add(sh);
    // 말 걸 수 있을 때 머리 위에 뜨는 느낌표
    const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.label("!", { bg: "#ffd23a", color: "#3a2a00", size: 96, w: 128, h: 128 }), depthTest: false }));
    mark.scale.set(0.45, 0.45, 1); mark.position.y = n.h + 0.45; mark.renderOrder = 5;
    grp.add(mark);
    grp.visible = i === 0;
    scene.add(grp);
    return { grp, board, mark };
  });

  /* 코인: 길마다 몇 줄씩 + 기찻길·놀이터·공원에도 */
  const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 24).rotateX(Math.PI / 2);
  const face = T.coinFace();
  const coinMat = [
    new THREE.MeshBasicMaterial({ color: "#e4a919" }),
    new THREE.MeshBasicMaterial({ map: face }), new THREE.MeshBasicMaterial({ map: face }),
  ];
  const coinPos = [];
  {
    const rand = T.rng(555);
    const lanes = [-1.9, 0, 1.9];
    const line = (x0, z0, x1, z1, n) => {
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        coinPos.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
      }
    };
    const cs = [], rs = [];
    for (let c = -2; c <= 8; c++) cs.push(sx(c));
    for (let r = -2; r <= 8; r++) rs.push(sz(r));
    // 세로길 구간
    for (const x of cs) for (let i = 0; i < rs.length - 1; i++) {
      if (rand() > 0.42) continue;
      if (x > 3 * L && rs[i] < 0) continue;     // 공원 안쪽 길 자리
      const lane = lanes[(rand() * 3) | 0], a = rs[i] + R / 2 + 6, b = rs[i + 1] - R / 2 - 6;
      const m = (a + b) / 2;
      line(x + lane, m - 6, x + lane, m + 6, 5);
    }
    for (const z of rs) for (let i = 0; i < cs.length - 1; i++) {
      if (rand() > 0.42) continue;
      if (z < 0 && cs[i] > 3 * L) continue;
      const lane = lanes[(rand() * 3) | 0], a = cs[i] + R / 2 + 6, b = cs[i + 1] - R / 2 - 6;
      const m = (a + b) / 2;
      line(m - 6, z + lane, m + 6, z + lane, 5);
    }
    // 기찻길 위 한 줄, 놀이터 모래밭 동그라미, 공원 호숫가
    line(sx(1) + 8, RAIL_Z - 1.6, sx(2) - 8, RAIL_Z - 1.6, 7);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; coinPos.push([sx(4) + L / 2 + Math.cos(a) * 5, sz(3) + L / 2 - 4 + Math.sin(a) * 5]); }
    for (let k = 0; k < 10; k++) { const a = Math.PI * 0.15 + k / 10 * Math.PI * 0.7; coinPos.push([GOAL.x - 6 + Math.cos(a) * 44, -52 - Math.sin(a) * 18]); }
  }
  // 경로 확인용으로 바깥으로 나간 건 버린다
  const coins = coinPos.filter(([x, z]) => x > BOUNDS.x0 + 1 && x < BOUNDS.x1 - 1 && z > BOUNDS.z0 + 1 && z < BOUNDS.z1 - 1 && !inWater(x, z))
    .map(([x, z], i) => ({ x, z, on: true, ph: i * 0.37 }));
  state.total = coins.length;
  const coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, coins.length);
  coinMesh.frustumCulled = false;
  scene.add(coinMesh);
  const cm = new THREE.Matrix4(), cq = new THREE.Quaternion(), cv = new THREE.Vector3(), cs1 = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  // 반짝이 (먹으면 위로 튀는 작은 별)
  const sparks = [];

  /* 뽀또 150개. 효과 없이 모으기만 한다. 봉지 사진 판이 빙글빙글 돌며 떠 있다.
     골목·기찻길·놀이터·공원 잔디 어디든 다닐 수 있는 곳에 고른 간격으로 (2026-10-26 사용자 요청:
     몰려 있으면 앞 대사가 끝나기 전에 다음 걸 먹어 소리가 잘린다) */
  const ppTex = new THREE.TextureLoader().load("assets/ui/ppotto.png");
  ppTex.colorSpace = THREE.SRGBColorSpace;
  const ppMat = new THREE.MeshBasicMaterial({ map: ppTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const ppGeo = new THREE.PlaneGeometry(1.75, 1.3);
  const ppottos = [];
  {
    const rand = T.rng(8282);
    const onRoad = (x, z) => Math.abs(x - Math.round(x / L) * L) < R / 2 - 0.8 || Math.abs(z - Math.round(z / L) * L) < R / 2 - 0.8;
    const inRail = (x, z) => z > sz(2) + R / 2 + 1 && z < sz(3) - R / 2 - 1;
    const inPlay = (x, z) => x > sx(4) + R / 2 + 1 && x < sx(5) - R / 2 - 1 && z > sz(3) + R / 2 + 1 && z < sz(4) - R / 2 - 1;
    const inPark = (x, z) => x > 3 * L + R / 2 + 2 && z < -R / 2 - 2;
    const ok = (x, z) => x > BOUNDS.x0 + 2 && x < BOUNDS.x1 - 2 && z > BOUNDS.z0 + 2 && z < BOUNDS.z1 - 2 && !inWater(x, z)
      && (onRoad(x, z) || inRail(x, z) || inPlay(x, z) || inPark(x, z))
      && Math.hypot(x - GOAL.x, z - GOAL.z) > 6
      && NPCS.every(n => Math.hypot(x - n.x, z - n.z) > 18)   // NPC 대답을 듣는 동안 지나는 길엔 두지 않는다 (대사가 뽀또 소리에 밀린다)
      && Math.hypot(x - sx(1), z - (sz(6) + 1)) > 14     // 출발 자리에서 바로 먹히지 않게
      && !collide(x, z, 1.0).hit;                         // 담장·나무·놀이기구 속에 묻히지 않게
    // 넓은 간격부터 채우다 150개가 안 되면 간격을 조금씩 줄인다 → 맵 전체에 고르게
    const pts = [];
    for (let gap = 22; gap >= 12 && pts.length < 150; gap -= 1)
      for (let i = 0; i < 30000 && pts.length < 150; i++) {
        const x = BOUNDS.x0 + rand() * (BOUNDS.x1 - BOUNDS.x0), z = BOUNDS.z0 + rand() * (BOUNDS.z1 - BOUNDS.z0);
        if (!ok(x, z) || pts.some(q => Math.hypot(q[0] - x, q[1] - z) < gap)) continue;
        pts.push([x, z]);
      }
    for (const [x, z] of pts) {
      const m = new THREE.Mesh(ppGeo, ppMat);
      m.position.set(x, 1.7, z);
      m.renderOrder = 2;
      scene.add(m);
      ppottos.push({ x, z, m, on: true, ph: ppottos.length * 0.9 });
    }
    state.ppottoTotal = ppottos.length;
  }
  let ppIdx = 0;
  const ppWait = [];   // 대사 중에 먹은 뽀또 — 말이 끝나면 차례로
  const sparkMat = new THREE.SpriteMaterial({ map: starTex(), transparent: true, depthWrite: false });

  /* 포탈: 광장 가운데 선 작은 고리. 안쪽은 소용돌이, 바닥엔 빛 원, 주위로 떠오르는 빛 알갱이 */
  const portal = new THREE.Group();
  portal.position.set(GOAL.x, 0, GOAL.z);
  portal.scale.setScalar(1.7);   // 커진 주인공이 지나갈 만큼
  {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 16, 48),
      new THREE.MeshBasicMaterial({ color: "#9b7bff" }));
    ring.position.y = 1.45; portal.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.035, 8, 48), new THREE.MeshBasicMaterial({ color: "#e6dcff" }));
    ring2.position.y = 1.45; portal.add(ring2);
    const swirlMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { t: { value: 0 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
      fragmentShader: `varying vec2 vUv; uniform float t;
        void main(){
          vec2 p = vUv*2.-1.; float r = length(p); if (r>1.) discard;
          float a = atan(p.y,p.x);
          float s = sin(a*3. + r*10. - t*4.)*.5+.5;
          vec3 c = mix(vec3(.42,.3,1.), vec3(.55,.95,1.), s);
          c = mix(c, vec3(1.), smoothstep(.35,0.,r)*.8);
          gl_FragColor = vec4(c, (.55+.4*s)*smoothstep(1.,.85,r));
        }`,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), swirlMat);
    disc.position.y = 1.45; portal.add(disc);
    portal.userData.swirl = swirlMat;
    const glowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { t: { value: 0 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
      fragmentShader: `varying vec2 vUv; uniform float t;
        void main(){ float r = length(vUv*2.-1.); float a = smoothstep(1.,.2,r)*(.55+.15*sin(t*3.));
          gl_FragColor = vec4(.65,.55,1., a); }`,
    });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40).rotateX(-Math.PI / 2), glowMat);
    glow.position.y = 0.04; portal.add(glow);
    portal.userData.glow = glowMat;
    // 표지판
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.label("도착!", { bg: "#6f4cff", color: "#ffffff", size: 70, w: 256, h: 112 }), depthTest: true }));
    sign.scale.set(1.3, 0.57, 1); sign.position.y = 3.25; portal.add(sign);
    portal.userData.sign = sign;
    portal.userData.motes = [];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex(), color: "#cbb8ff", transparent: true, depthWrite: false }));
      m.userData = { a: Math.random() * Math.PI * 2, r: 0.6 + Math.random() * 1.6, y: Math.random() * 3, s: 0.6 + Math.random() };
      m.scale.setScalar(0.18);
      portal.add(m); portal.userData.motes.push(m);
    }
  }
  scene.add(portal);

  /* ---------------- 말풍선(주인공) ---------------- */
  const queue = [];
  let bubbleT = 0, bubbleDur = 0, speaking = null, nextFun = 5, nextDal = 7;
  function say(lines, then) {
    for (const l of lines) queue.push(l);
    if (then) queue.push(then);
  }
  function showLine(line) {
    const [id, text] = line;
    const v = voice(id);
    let dur = 0.9 + text.length * 0.085;
    if (v.ok && v.buf) {
      try { playVoice(v); } catch (e) { }
      dur = v.buf.duration + 0.2;
    }
    ui.bubble(text);
    bubbleT = 0; bubbleDur = dur; speaking = line;
  }
  // 지금 하던 말을 끊고 바로 말한다 (뽀또). 길 안내 대화 중이었다면 그 말은 뒤에 다시 한다
  function sayNow(line) {
    if (speaking && speaking[0]) {
      stopVoice(audioCache[speaking[0]]);
      if (!/^(ppotto|fun)/.test(speaking[0])) queue.unshift(speaking);
    }
    showLine(line);
  }
  function updateBubble(dt) {
    if (speaking) {
      bubbleT += dt;
      if (bubbleT < bubbleDur) return;
      speaking = null; ui.bubble(null);
      if (ppWait.length) { sayNow(ppWait.shift()); return; }
    }
    if (!queue.length) return;
    const n = queue.shift();
    if (typeof n === "number") { speaking = ["", ""]; bubbleT = 0; bubbleDur = n; return; }   // 잠깐 쉬기
    if (typeof n === "function") { n(); return; }
    showLine(n);
  }

  /* ---------------- 대화 ---------------- */
  function talk(i) {
    if (state.talking === i || state.done) return;
    const n = NPCS[i];
    state.talking = i;
    queue.length = 0;
    // 주인공이 먼저 묻고, 말이 끝나면 대화창
    say(n.before, () => { if (state.talking === i) ui.dialog(n, () => endTalk(i)); });   // 그 사이 대화를 끝냈으면 창을 열지 않는다
  }
  function endTalk(i) {
    if (state.talking !== i) return;
    state.talking = -1;
    ui.dialog(null);
    const n = NPCS[i];
    const first = !state.asked[i];
    state.asked[i] = true;
    say(n.after);
    if (first && state.stage === i) {
      state.stage = i + 1;
      ui.goal(n.goal);
      if (NPCS[i + 1]) npcObjs[i + 1].grp.visible = true;
    }
  }
  function nearNpc() {
    let best = -1, bd = 8.5;
    NPCS.forEach((n, i) => {
      if (!npcObjs[i].grp.visible) return;
      const d = Math.hypot(n.x - S.x, n.z - S.z);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function interact() {
    if (!state.running) return;
    if (state.talking >= 0) { endTalk(state.talking); return; }
    const i = nearNpc();
    if (i >= 0) talk(i);
  }
  // 화면을 눌렀을 때 NPC 사진을 맞혔는지
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function clickAt(clientX, clientY, rect) {
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(npcObjs.filter(o => o.grp.visible).map(o => o.board));
    if (!hits.length) return false;
    const i = hits[0].object.userData.npc;
    if (Math.hypot(NPCS[i].x - S.x, NPCS[i].z - S.z) > 9) { ui.toast("조금 더 가까이 가서 말을 걸어 보세요"); return true; }
    talk(i);
    return true;
  }

  /* ---------------- 매 프레임 ---------------- */
  const tmpV = new THREE.Vector3();
  function update(dt, t) {
    if (state.running && !state.done) state.time += dt;
    updateBubble(dt);

    // NPC 판은 카메라 쪽으로 (세로축만)
    npcObjs.forEach((o, i) => {
      if (!o.grp.visible) return;
      o.board.rotation.y = Math.atan2(camera.position.x - NPCS[i].x, camera.position.z - NPCS[i].z);
      o.board.scale.y = NPCS[i].h * (1 + Math.sin(t * 2.1 + i) * 0.006);   // 숨 쉬듯 아주 살짝
      const can = !state.asked[i] || state.talking === i;
      o.mark.visible = can && state.talking !== i;
      o.mark.position.y = NPCS[i].h + 0.45 + Math.sin(t * 4) * 0.06;
    });
    // 가까운 NPC 안내
    const ni = state.talking < 0 ? nearNpc() : -1;
    if (ni >= 0 && state.running && !(speaking && speaking[0])) {   // 말하는 동안엔 말풍선과 겹치지 않게 숨긴다
      tmpV.set(NPCS[ni].x, NPCS[ni].h + 0.95, NPCS[ni].z).project(camera);
      ui.prompt(tmpV, state.asked[ni] ? "다시 묻기" : "말 걸기");
    } else ui.prompt(null);
    // 대화 중 너무 멀어지면 창을 닫는다
    if (state.talking >= 0 && Math.hypot(NPCS[state.talking].x - S.x, NPCS[state.talking].z - S.z) > 16) endTalk(state.talking);

    // 코인
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.on && state.running && Math.hypot(c.x - S.x, c.z - S.z) < 1.8) {
        c.on = false; state.coins++; coinSound(); ui.coins(state.coins, state.total);
        for (let k = 0; k < 5; k++) {
          const sp = new THREE.Sprite(sparkMat); sp.scale.setScalar(0.35);
          sp.position.set(c.x, 1.0, c.z);
          sp.userData = { vx: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, life: 0.6 };
          scene.add(sp); sparks.push(sp);
        }
      }
      cq.setFromAxisAngle(up, t * 2.4 + c.ph);
      cv.set(c.x, 0.85 + Math.sin(t * 3 + c.ph) * 0.12, c.z);
      cm.compose(cv, cq, c.on ? cs1 : tmpV.set(0, 0, 0));
      coinMesh.setMatrixAt(i, cm);
    }
    coinMesh.instanceMatrix.needsUpdate = true;
    // 뽀또
    for (const p of ppottos) {
      if (!p.on) continue;
      p.m.rotation.y = t * 1.6 + p.ph;
      p.m.position.y = 1.7 + Math.sin(t * 2.4 + p.ph) * 0.18;
      if (state.running && Math.hypot(p.x - S.x, p.z - S.z) < 2.1) {
        p.on = false; scene.remove(p.m);
        state.ppotto++; ui.ppotto(state.ppotto, state.ppottoTotal); ppottoSound();
        const pl = PPOTTO_LINES[ppIdx % PPOTTO_LINES.length]; ppIdx++;
        // 무슨 대사든 하고 있으면 끊지 않고, 그 말이 끝난 뒤에 뽀또 대사 (2026-10-26 사용자 요청)
        if (speaking && speaking[0]) ppWait.push(pl);
        else sayNow(pl);
        for (let k = 0; k < 9; k++) {
          const sp = new THREE.Sprite(sparkMat); sp.scale.setScalar(0.5);
          sp.position.set(p.x, 1.7, p.z);
          sp.userData = { vx: (Math.random() - 0.5) * 5, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 5, life: 0.7 };
          scene.add(sp); sparks.push(sp);
        }
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i], u = sp.userData;
      u.life -= dt; u.vy -= 9 * dt;
      sp.position.x += u.vx * dt; sp.position.y += u.vy * dt; sp.position.z += u.vz * dt;
      sp.material.opacity = Math.max(0, u.life / 0.6);
      if (u.life <= 0) { scene.remove(sp); sparks.splice(i, 1); }
    }

    // 포탈
    portal.userData.swirl.uniforms.t.value = t;
    portal.userData.glow.uniforms.t.value = t;
    portal.children[0].rotation.z = t * 0.6;
    portal.userData.sign.position.y = 3.25 + Math.sin(t * 2.5) * 0.08;
    for (const m of portal.userData.motes) {
      const u = m.userData;
      u.y += dt * (0.5 + u.s * 0.4); if (u.y > 3.4) u.y = 0;
      u.a += dt * 0.8;
      m.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r * 0.4);
      m.material.opacity = Math.sin((u.y / 3.4) * Math.PI);
    }
    if (vanish >= 0 && portal.visible) {
      vanish += dt;
      const k = Math.max(0, 1 - vanish / 0.5);
      portal.scale.setScalar(1.7 * k);
      if (k === 0) portal.visible = false;
    }
    if (state.running && !state.done && Math.hypot(S.x - GOAL.x, S.z - GOAL.z) < 2.2) arrive();

    // 달리는 동안 "인디기 재미떠여" 5초마다, "달달달~" 7초마다 (2026-10-26 사용자 요청).
    // 시간은 달리는 동안 계속 흐르고, 때가 됐는데 다른 말을 하는 중이면 끝날 때까지 기다렸다가 한다
    // 도착한 뒤에도 계속 달리면 똑같이 나온다 (2026-10-26 사용자 요청)
    if (state.running && state.talking < 0 && Math.abs(S.speed) > 3) {
      nextFun -= dt; nextDal -= dt;
      const free = !speaking && !queue.length && !ppWait.length;
      if (free && nextFun <= 0 && nextFun <= nextDal) { say([V.fun]); nextFun = 5; }
      else if (free && nextDal <= 0) { say([V.dal]); nextDal = 7; }
    }
  }

  let vanish = -1;
  function arrive() {
    state.done = true;
    vanish = 0;                 // 포탈이 빨려 들어가듯 작아지며 사라진다
    ui.flash();
    portalSound();
    queue.length = 0;
    ui.dialog(null); ui.prompt(null);
    say([V.fun]);
    ui.result(state);
  }

  function start() {
    state.running = true;
    ui.coins(0, state.total);
    ui.ppotto(0, state.ppottoTotal);
    ui.goal("파마머리 어머님께 길을 물어보세요 (가까이 가서 Space / 터치)");
    say([V.dal]);
  }

  // 멈추면 소리 전체(WebAudio)를 얼린다 — 대사·엔진이 그 자리에서 멈췄다가 이어진다
  function setPaused(on) { pauseAudio(on); }
  return { state, update, interact, clickAt, start, setPaused, isSpeaking: () => !!(speaking && speaking[0]) };
}

function starTex() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.3, "rgba(255,240,170,0.9)"); grd.addColorStop(1, "rgba(255,220,90,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
