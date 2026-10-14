/* ============================================================
   범퍼카 2026 — 3D
   ------------------------------------------------------------
   둥근 무대 위에서 범퍼카끼리 박아 밖으로 밀어낸다. 밖으로 나가면
   끝없이 떨어지고 탈락. 마지막까지 남은 한 대가 우승.

   그리기는 Three.js. 범퍼카는 코드로 만든 3D 모델이라 어느 방향이든
   매끄럽게 돈다. 탄 사람은 보내 준 그림을 그대로 붙인 판(스프라이트)이라
   얼굴이 원본 그대로다 — 늘 카메라를 보고, 차가 멀어질 때만 뒤통수로 바뀐다.

   물리는 위에서 내려다본 평면(x 오른쪽, y 카메라 쪽)에서 계산하고,
   3D 로는 (x, 높이, y) 로 옮긴다. 무대 중심이 원점.
   ============================================================ */
import * as THREE from "../vendor/three.module.min.js";
import { GLTFLoader } from "../vendor/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "../vendor/addons/utils/SkeletonUtils.js";

const VW = 1280, VH = 720;           // 말풍선·HUD 를 그리는 가상 화면
const R = 620;                       // 무대 반지름 (440 → 620: 꺾을 자리가 좁아서 넓혔다)
const RENDER_SCALE = 0.75;           // 3D 를 화면보다 거칠게 그려 도트 그림과 결을 맞춘다

const CAR_SCALE = 1.55;              // 범퍼카 모델 크기 (탄 사람도 함께 커진다). 얼굴이 잘 보이게 1.3 → 1.55
const CAR_R = 40 * CAR_SCALE;        // 차 충돌 반지름 (범퍼 없는 3D 차 길이에 맞춰 34 → 40)
const MAXV = 300, ACC = 480, BRAKE = 700, REVV = 150;
const BOOST_HIT = 2.0;               // 부스터로 들이받으면 이만큼 세게 (1.6 → 2.0)
const BOOSTV = 540, BOOST_KICK = 470, BOOST_T = 1.0;
const TURN = 2.6;                    // 초당 회전 (rad)
const GRIP = 10, GRIP_DRIFT = 2.0, GRIP_SLIDE = 1.5;
const DRIFT_MIN_V = 120;             // 이보다 느리면 드리프트가 안 걸린다
const DRIFT_READY = 0.08;            // 이만큼 미끄러져야 부스터 자격 (0.35 → 0.08: 살짝만 드리프트해도 된다)
const BOOST_WINDOW = 0.45;           // 드리프트 끝나고 ↑ 를 다시 누를 수 있는 시간
const KNOCK = 80;                    // 부딪히면 무조건 밀려나는 몫 (무대가 넓어져 55 → 80)
const RAM = 0.35;                    // 들이받은 빠르기 중 상대에게 더 얹히는 비율
const MAX_HIT_V = 560;               // 맞고 튕겨 나가는 속도 상한
const HEAT_FROM = 40, HEAT_RAMP = 40, HEAT_MAX = 1.8;   // 40초부터 40초에 걸쳐 박는 힘이 1.8배까지 오른다
const SLIDE_STOP = 3.2;              // 맞은 뒤 미끄러지다 서는 빠르기. 밀려나는 거리 ≈ 속도 / 이 값
const FALL_G = 1500;

/* ---------- 캐릭터 ---------- */
// 말풍선 문구는 순서대로 돈다
const TALK_EVERY = 2;                // 대사 치는 주기 (초)
const CHARS = {
  A: {
    name: "양홍원",
    lines: ["다 꼬라박아 범퍼카~ 장용준처럼~~", "다 때려박아 범퍼카~ 장용준처럼~~"],
  },
  B: {
    name: "노엘",
    lines: ["그래 나 처럼~", "택시 기사님 안녕하세요!!", "마음에 안들어도~뭐든지 세상을 밝게봐!",
            "대리 불러야돼요~ 여러분! 바른인생!", "바르지만 재밌게! you know?"],
  },
  C: {
    name: "한요한",
    // 대사 사이사이(다시 처음으로 돌아갈 때 포함)에 "장용준처럼~"
    lines: ["시속 300킬로로 달려~", "장용준처럼~", "최대한 람보르기니처럼 달려~", "장용준처럼~",
            "너의 속도는 400키로로~~", "장용준처럼~"],
  },
};
const D_LINES = ["..."];
const IDS = ["A", "B", "C"];
const AUTO = /[?&]auto=1/.test(location.search);   // 측정용: 내 차도 봇이 몬다
const SOLO = /[?&]solo=1/.test(location.search);   // 확인용: 나 혼자 달린다

/* 탄 사람 그림. 크기는 "머리 폭이 30" 이 되게 맞춘 값이다 (그림마다 머리 비율이 달라서)
   y 는 판 아래쪽이 차 바닥에서 얼마나 위인가, z 는 좌우 자리 */
const RIDERS = {
  A: { front: [{ tex: "A_front", h: 88, y: 16, z: 0 }], back: { tex: "A_back", h: 42, y: 50 } },
  B: { front: [{ tex: "driver_front", h: 45, y: 34, z: -15 }, { tex: "B_front", h: 92, y: 14, z: 13 }],
       back: { tex: "B_back", h: 41, y: 52 } },
  C: { front: [{ tex: "C_front", h: 96, y: 12, z: 0 }], back: { tex: "C_back", h: 41, y: 52 } },
};

/* ============================================================
   불러오기
   ============================================================ */
const TEX = {};
const loader = new THREE.TextureLoader();
function loadTex(key, url) {
  return loader.loadAsync(url).then(t => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter;
    TEX[key] = t;
  }, () => console.warn("그림 없음", url));
}
// 좌우로 뒤집은 판 — 왼쪽으로 달릴 때 쓴다
function flipped(t) {
  const c = document.createElement("canvas");
  c.width = t.image.width; c.height = t.image.height;
  const g = c.getContext("2d"); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(t.image, 0, 0);
  const f = new THREE.CanvasTexture(c);
  f.colorSpace = THREE.SRGBColorSpace; f.magFilter = THREE.NearestFilter;
  return f;
}

/* ---------- 3D 로 만든 탄 사람 (Tripo → tools/slim_glb.py) ----------
   assets/models/<id>.glb 가 있으면 그 사람을 앉혀 태우고, 없으면 위의 그림 판을 쓴다.
   모델은 A 자로 서 있는 채 받으므로, 팔다리를 "가리킬 방향" 으로 돌려 앉힌다.
   방향은 모델 기준(앞이 +z, 위가 +y, 왼쪽이 +x). 뼈마다 축이 제각각이라 각도 대신 방향으로 적는다 */
const RIDER3D = {};
const STAND_H = 160;                   // 서 있을 때 키 (차 단위). 더 크면 무릎이 보닛을 뚫는다
const SEAT = { x: -12, y: 28 };        // 엉덩이 자리 (차 기준, 앞이 +x)
const SEAT_IN_CAR = 0.62;              // 3D 차에서 엉덩이 높이 (차 높이 대비)
const D_FACE_H = 64;                  // 철창 사이로 보일 D 얼굴 그림 높이 (무대 단위)
const POLICE_H = 268, POLICE_X = 170;  // 철창 앞 경찰 키·D 에서 떨어진 거리
const BAR_GAP = 84;                   // 창살 간격 — 얼굴(폭 59)과 양옆 손이 딱 들어갈 만큼
const D_FLOOR = -30;                  // 철창 안 바닥을 무대보다 낮춰 무릎 꿇은 D 얼굴이 화면 안에 들게
const D_H = 300;                       // 철창 뒤 D 의 키 (무대 단위)
// 멀리서 봐도 얼굴이 보이게 머리만 키운다 (차보다 얼굴이 크게)
const HEAD_SCALE = { rider: 1, D: 1 };        // D 는 3D 머리 앞에 도트 얼굴(D_face.png)을 덮어 붙인다        // 키워 봤다가(1.75) 어색해서 되돌림
// 카트 타듯 무릎을 세우고(차 바닥을 안 뚫게), 팔은 앞으로 뻗어 핸들을 쥔다
const SIT_POSE = [
  // [뼈, 그 뼈의 끝(자식), 가리킬 방향]
  ["LeftUpLeg", "LeftLeg", [0.2, 0.22, 1]],    ["RightUpLeg", "RightLeg", [-0.2, 0.22, 1]],
  ["LeftLeg", "LeftFoot", [0.02, -1, -0.12]],  ["RightLeg", "RightFoot", [-0.02, -1, -0.12]],
  ["LeftFoot", "LeftToeBase", [0, -0.2, 1]],   ["RightFoot", "RightToeBase", [0, -0.2, 1]],
  ["LeftArm", "LeftForeArm", [0.28, -0.6, 0.75]], ["RightArm", "RightForeArm", [-0.28, -0.6, 0.75]],
  ["LeftForeArm", "LeftHand", [-0.45, 0.05, 1]],  ["RightForeArm", "RightHand", [0.45, 0.05, 1]],
];
// 조수석(B)은 핸들을 안 잡는다 — 팔을 내려 손을 무릎 위에 둔다
const PASSENGER_POSE = [
  ...SIT_POSE.filter(([b]) => !/Arm/.test(b)),
  ["LeftArm", "LeftForeArm", [0.12, -1, 0.12]],   ["RightArm", "RightForeArm", [-0.12, -1, 0.12]],
  ["LeftForeArm", "LeftHand", [-0.1, -0.35, 1]],  ["RightForeArm", "RightHand", [0.1, -0.35, 1]],
];
// D 는 바닥에 무릎 꿇고, 몸을 앞으로 숙여 얼굴을 창살 사이로 내밀고, 얼굴 양옆 창살을 두 손으로 잡는다
const CAGE_POSE = [
  ["LeftUpLeg", "LeftLeg", [0.12, -1, 0.12]],    ["RightUpLeg", "RightLeg", [-0.12, -1, 0.12]],
  ["LeftLeg", "LeftFoot", [0.02, -0.12, -1]],    ["RightLeg", "RightFoot", [-0.02, -0.12, -1]],
  ["LeftFoot", "LeftToeBase", [0, -0.05, -1]],   ["RightFoot", "RightToeBase", [0, -0.05, -1]],
  ["Spine", "Spine1", [0, 1, 0.35]], ["Spine1", "Spine2", [0, 1, 0.45]], ["Spine2", "Neck", [0, 1, 0.6]],
  ["Neck", "Head", [0, 1, 0.85]],
  // 두 손은 얼굴 칸 양옆 창살(±반 칸)을 잡는다
  ["LeftArm", "LeftForeArm", [0.32, -0.45, 0.6]],  ["RightArm", "RightForeArm", [-0.32, -0.45, 0.6]],
  ["LeftForeArm", "LeftHand", [-0.05, 1, 0.2]],    ["RightForeArm", "RightHand", [0.05, 1, 0.2]],
];
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
function aimBone(bone, tip, dir) {
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(_a); tip.getWorldPosition(_b);
  const cur = _b.sub(_a).normalize();
  const want = _c.set(...dir).normalize();
  _q.setFromUnitVectors(cur, want);                         // 월드에서 이만큼 더 돌린다
  bone.getWorldQuaternion(_q2);
  const parentQ = new THREE.Quaternion(); bone.parent.getWorldQuaternion(parentQ);
  bone.quaternion.copy(parentQ.invert().multiply(_q.multiply(_q2)));
  bone.updateWorldMatrix(false, true);
}
function posed(gltfScene, pose) {
  const bones = {};
  // 끝 마디(HeadTop_End 등)는 살이 안 붙어 Bone 이 아닌 그냥 노드로 온다 — 이름으로 다 모은다
  gltfScene.traverse(o => { if (/^mixamorig/.test(o.name)) bones[o.name.replace(/^mixamorig:?/, "")] = o; });
  for (const [b, t, d] of pose) if (bones[b] && bones[t]) aimBone(bones[b], bones[t], d);
  // 차에 앉으면 다리는 어차피 안 보인다 — 허벅지 뼈를 접어 넣어 낮은 보닛(람보르기니)을 뚫지 않게 한다
  if (pose !== CAGE_POSE) for (const b of ["LeftUpLeg", "RightUpLeg"]) if (bones[b]) { bones[b].scale.setScalar(0.08); bones[b].updateWorldMatrix(false, true); }
  if (bones.Head) { bones.Head.scale.setScalar(pose !== CAGE_POSE ? HEAD_SCALE.rider : HEAD_SCALE.D); bones.Head.updateWorldMatrix(false, true); }
  return bones;
}
// 첫 화면 진행 막대 — 받는 시간 거의 전부가 3D 모델 8개(약 19MB)라 그 받은 바이트로 채운다
const LOAD = {};
function loadProgress(key) {
  return e => {
    LOAD[key] = [e.loaded, e.total || 2.4e6];
    let got = 0, all = 0;
    for (const [a, b] of Object.values(LOAD)) { got += a; all += b; }
    const p = Math.min(99, Math.round(got / Math.max(all, 19e6) * 100));
    const pct = document.getElementById("loadPct"), bar = document.getElementById("loadBar");
    if (pct) { pct.textContent = p + "%"; bar.style.width = p + "%"; }
  };
}
async function loadRider(id) {
  const pose = id === "D" ? CAGE_POSE : id === "B" ? PASSENGER_POSE : SIT_POSE;
  const height = id === "D" ? D_H : STAND_H;
  try {
    const g = await new GLTFLoader().loadAsync(`assets/models/${id}.glb`, loadProgress(id));
    const src = g.scene;
    src.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;                 // 뼈로 움직인 몸은 처음 상자 밖으로 나가기도 한다
      const m = o.material;
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      o.material = new THREE.MeshLambertMaterial({ map: m.map, side: THREE.FrontSide });
    });
    // 크기 — 서 있는 키(쉬는 자세 그대로의 높이)로 맞춘다
    let restH = 1;
    src.traverse(o => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; restH = b.max.y - b.min.y; } });
    const bones = posed(src, pose);
    src.scale.setScalar(height / restH);
    src.updateWorldMatrix(true, true);
    const at = name => { const v = new THREE.Vector3(); (bones[name] || src).getWorldPosition(v); return v; };
    const hip = at("Hips");
    // 두 손 가운데 — 핸들을 여기로 옮긴다 (엉덩이 기준, 모델 좌표)
    const hands = at("LeftHand").add(at("RightHand")).multiplyScalar(0.5).sub(hip);
    // 정수리 = 머리 관절 + 머리 높이(키의 16%) × 머리 배율. 말풍선 높이용 (엉덩이 기준)
    const hs = pose !== CAGE_POSE ? HEAD_SCALE.rider : HEAD_SCALE.D;
    const headTop = at("Head").y - hip.y + height * 0.16 * hs;
    // 자세를 잡은 몸의 실제 바닥·앞끝 (엉덩이 기준) — D 를 바닥에 앉히고 창살 앞에 붙일 때 쓴다
    // (스킨 메시의 정밀 상자는 값이 튀어서 관절 위치로 어림한다)
    const joints = ["Hips", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase", "LeftLeg", "RightLeg", "LeftHand", "RightHand"]
      .filter(n => bones[n]).map(n => at(n));
    const ground = Math.min(...joints.map(v => v.y)) - hip.y - height * 0.04;
    const front = Math.max(...joints.map(v => v.z)) - hip.z + height * 0.03;
    const rel = n => at(n).sub(hip);
    RIDER3D[id] = { src, hip, hands, headTop, ground, front,
      head: rel("Head"), lHand: rel("LeftHand"), rHand: rel("RightHand") };
  } catch (e) {
    console.warn("3D 모델 없음 — 그림 판으로", id, e.message);
  }
}
/* ---------- 3D 차와 택시 기사님 (뼈 없음) ----------
   assets/models/car<id>.glb 가 있으면 코드로 만든 차 대신 쓴다. 고무 범퍼 위에 얹고,
   길이를 범퍼에 맞춘 뒤 폭은 통통하게 늘려 범퍼카처럼 보이게 한다 */
const CAR3D = {};
let DRIVER3D = null;
const CAR_LEN = 125, CAR_Y = 0;             // 범퍼가 없어진 만큼 차를 키워 사람이 차에 쏙 들어가게
const CAR_WIDE = { A: 1, B: 1.5, C: 1 };
const CAR_SIZE = { A: 1.2, B: 1, C: 1.2 };  // 택시 말고 두 대는 통째로 조금 키워 택시와 덩치를 맞춤   // 택시는 B·기사님 둘이 나란히 앉아 폭을 넓혔다
async function loadStatic(file) {
  const g = await new GLTFLoader().loadAsync(file, loadProgress(file));
  const src = g.scene;
  src.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
    // Tripo 차는 면 방향이 섞여 있어 양면으로 그려야 구멍이 안 난다
    o.material = new THREE.MeshLambertMaterial({ map: m.map, color: m.map ? 0xffffff : m.color, side: THREE.DoubleSide });
  });
  const box = new THREE.Box3().setFromObject(src);
  return { src, box, size: box.getSize(new THREE.Vector3()), mid: box.getCenter(new THREE.Vector3()) };
}
async function loadCar(id) {
  try {
    const { src, box, size, mid } = await loadStatic(`assets/models/car${id}.glb`);
    src.position.set(-mid.x, -box.min.y, -mid.z);
    const holder = new THREE.Group(); holder.add(src);
    const k = CAR_LEN / Math.max(size.x, size.z);
    // 모델 앞(+z)을 차 앞(+x)으로. 폭(모델 x)만 더 키운다
    const ks = k * CAR_SIZE[id];
    holder.scale.set(ks * CAR_WIDE[id], ks, ks);
    holder.rotation.y = Math.PI / 2;
    CAR3D[id] = { holder, h: size.y * ks };
  } catch (e) {
    console.warn("3D 차 없음 — 코드 차로", id, e.message);
  }
}
async function loadDriver() {
  try {
    const { src, box, size, mid } = await loadStatic("assets/models/driver.glb");
    src.position.set(-mid.x, -box.min.y, -mid.z);
    const holder = new THREE.Group(); holder.add(src);
    holder.rotation.y = Math.PI / 2;
    DRIVER3D = { holder, h: size.y };
  } catch (e) {
    console.warn("3D 기사님 없음 — 그림 판으로", e.message);
  }
}

// 한 대에 한 벌씩 복제해 차에 앉힌다. 모델 앞(+z)을 차 앞(+x)으로 돌린다
function placeRider(id, body, x = SEAT.x, z = 0, y = SEAT.y) {
  const r = RIDER3D[id];
  const holder = new THREE.Group();
  const m = SkeletonUtils.clone(r.src);
  m.position.set(-r.hip.x, -r.hip.y, -r.hip.z);
  holder.add(m);
  holder.rotation.y = Math.PI / 2;
  holder.position.set(x, y, z);
  body.add(holder);
  return holder;
}
// D 는 철창 뒤에 서서 무대를 본다 (모델 앞 +z 가 무대 쪽). 손이 창살 줄에 닿게 뒤로 물린다
function placeCaged(cageZ) {
  const r = RIDER3D.D;
  const m = SkeletonUtils.clone(r.src);
  m.position.set(-r.hip.x, -r.hip.y, -r.hip.z);
  const holder = new THREE.Group();
  holder.add(m);
  // 손이 창살에 닿게, 무릎이 창살을 뚫지 않게 — 둘 중 더 앞에 나온 쪽을 창살 바로 뒤에 둔다
  holder.position.set(0, D_FLOOR - r.ground - 2, cageZ - r.hands.z);
  scene.add(holder);
  return holder;
}

/* ============================================================
   3D 기본
   ============================================================ */
const cv3 = document.getElementById("cv3");
const cv2 = document.getElementById("cv");
const ctx = cv2.getContext("2d");
const renderer = new THREE.WebGLRenderer({ canvas: cv3, antialias: false });
renderer.setClearColor(0x050202);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x070202, 1500, 3400);
const camera = new THREE.PerspectiveCamera(36, VW / VH, 10, 6000);
/* 카메라 — 보는 각도는 그대로 두고, 무대가 넓어진 만큼 가까이 붙어 내 차를 느슨하게 따라간다.
   (무대 가운데와 내 차 사이를 본다. 내가 떨어지면 무대 전체가 보이게 물러난다) */
const CAM_OFF = new THREE.Vector3(0, 600, 960);      // 바라보는 점에서 카메라까지
const CAM_AIM = new THREE.Vector3(0, 30, -120);      // 바라보는 점의 높이·앞뒤 보정
const CAM_FOLLOW = 0.6;                               // 0 이면 무대 가운데, 1 이면 내 차
const camFocus = new THREE.Vector3(0, 0, -80);
let camZoom = 1;
function placeCamera(dt, jitter = 0) {
  const who = mode === "result" && winnerCar ? winnerCar : player;
  const follow = who && who.onStage && mode !== "select";
  const tx = follow ? who.x * CAM_FOLLOW : 0, tz = follow ? who.y * CAM_FOLLOW : -80;
  const k = Math.min(1, dt * 3);
  camFocus.x += (tx - camFocus.x) * k; camFocus.z += (tz - camFocus.z) * k;
  camZoom += ((follow ? 1 : 1.45) - camZoom) * Math.min(1, dt * 1.5);
  camera.position.set(camFocus.x + CAM_OFF.x * camZoom + jitter * (Math.random() - 0.5),
    CAM_OFF.y * camZoom + jitter * (Math.random() - 0.5), camFocus.z + CAM_OFF.z * camZoom);
  camera.lookAt(camFocus.x + CAM_AIM.x, CAM_AIM.y, camFocus.z + CAM_AIM.z);
}

scene.add(new THREE.HemisphereLight(0xffe2c8, 0x401408, 1.6));
const sun = new THREE.DirectionalLight(0xffd6a0, 2.2);
sun.position.set(260, 700, 420); scene.add(sun);
const rimLight = new THREE.DirectionalLight(0xff6a20, 1.2);
rimLight.position.set(-300, 120, -500); scene.add(rimLight);

// 만화처럼 명암을 세 단계로만 나눈다
const TOON = (() => {
  const t = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
})();
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: TOON, ...extra });
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x120806, side: THREE.BackSide });

let PX = 1;
function resize() {
  const r = cv2.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  PX = (r.width * dpr) / VW;
  cv2.width = Math.round(VW * PX); cv2.height = Math.round(VH * PX);
  renderer.setPixelRatio(RENDER_SCALE);
  renderer.setSize(r.width, r.height, false);
}
window.addEventListener("resize", resize);

/* ---------- 캔버스로 그림 만들기 ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ============================================================
   범퍼카 모델
   ============================================================ */
// 옆모습 윤곽을 폭만큼 밀어 몸통을 만든다. 점은 (앞뒤 x, 높이 y)
function sideBody(points, width, color) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: 3, bevelSize: 3, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -width / 2);
  return outlined(g, toon(color));
}
function roundRect(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// 윤곽선: 같은 모양을 조금 키워 안쪽 면만 검게 그린다
function outlined(geo, mat, k = 1.035) {
  geo.computeBoundingBox();
  const c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
  geo.translate(-c.x, -c.y, -c.z);
  const grp = new THREE.Group();
  const m = new THREE.Mesh(geo, mat), o = new THREE.Mesh(geo, OUTLINE);
  o.scale.setScalar(k);
  grp.add(o, m); grp.position.copy(c);
  return grp;
}
function box(w, h, d, color, x, y, z, basic = false) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), basic ? new THREE.MeshBasicMaterial({ color }) : toon(color));
  m.position.set(x, y, z); return m;
}
function decal(tex, w, h, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshToonMaterial({ map: tex, transparent: true, gradientMap: TOON, alphaTest: 0.3 }));
  m.position.set(x, y, z); m.rotation.y = ry; return m;
}
function headlights(group, x, y, z, color = 0xfff2a0, r = 5) {
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z * s); m.scale.set(0.5, 1, 1); group.add(m);
  }
}

const FLAME_DECAL = () => canvasTex(256, 96, (g, w, h) => {
  for (let i = 0; i < 4; i++) {
    const x0 = w - 20 - i * 52;
    const gr = g.createLinearGradient(x0, 0, x0 - 130, 0);
    gr.addColorStop(0, "#ffe23a"); gr.addColorStop(0.6, "#ff8a1a"); gr.addColorStop(1, "rgba(255,80,10,0)");
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x0, h * 0.55);
    g.quadraticCurveTo(x0 - 40, h * (0.1 + 0.08 * i), x0 - 120, h * 0.3);
    g.quadraticCurveTo(x0 - 60, h * 0.5, x0 - 110, h * 0.8);
    g.quadraticCurveTo(x0 - 40, h * 0.85, x0, h * 0.55);
    g.fill();
  }
});
const TAXI_SIGN = () => canvasTex(256, 96, (g, w, h) => {
  g.fillStyle = "#f2c21a"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#1a1208"; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = "#1a1208"; g.font = '900 54px "Noto Sans KR", sans-serif';
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("모범택시", w / 2, h / 2 + 3);
});
const TAXI_SIDE = () => canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = "#d9a520"; g.fillRect(0, 22, w, 6);
  g.font = '900 30px "Noto Sans KR", sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("모범택시", w / 2, 46);
});

// 범퍼카 한 대. 앞이 +x, 위가 +y, 왼쪽이 -z
function makeCarModel(id) {
  const root = new THREE.Group();          // 위치·방향
  const body = new THREE.Group();          // 드리프트 때 기울기
  body.scale.setScalar(CAR_SCALE);
  root.add(body);
  // 그림자
  const sh = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.6; sh.scale.set(1.15 * CAR_SCALE, 0.9 * CAR_SCALE, 1); root.add(sh);
  // 고무 범퍼 — 범퍼카다움은 이게 다 한다
  const skirtGeo = new THREE.ExtrudeGeometry(roundRect(100, 78, 32), { depth: 12, bevelEnabled: true, bevelThickness: 3, bevelSize: 3, bevelSegments: 2 });
  skirtGeo.rotateX(-Math.PI / 2);
  if (!CAR3D[id]) {          // 3D 차는 범퍼 없이 그대로
    const skirt = outlined(skirtGeo, toon(0x2b2b30)); skirt.position.y += 4; body.add(skirt);
    const base = outlined(new THREE.CylinderGeometry(40, 42, 6, 24), toon(0x18181c)); base.position.y = 3; base.scale.set(1.2, 1, 0.92); body.add(base);
  }

  const car3d = CAR3D[id];
  if (car3d) {               // Tripo 로 만든 차
    const m = car3d.holder.clone(); m.position.y = CAR_Y; body.add(m);
  } else if (id === "A") {   // 빨간 머슬카 + 불꽃
    body.add(sideBody([[-40, 12], [-40, 34], [-30, 38], [-14, 38], [-12, 27], [10, 27], [14, 35], [34, 35], [42, 30], [44, 16], [40, 12]], 60, 0xd8261c));
    const fl = FLAME_DECAL();
    body.add(decal(fl, 64, 22, 4, 24, 33.6, 0), decal(fl, 64, 22, 4, 24, -33.6, Math.PI));
    body.add(box(3, 8, 26, 0x222226, 46, 21, 0));
    headlights(body, 45.5, 26, 19);
    body.add(box(2, 5, 9, 0xff3030, -43.5, 30, 19, true), box(2, 5, 9, 0xff3030, -43.5, 30, -19, true));
  } else if (id === "B") {   // 검은 모범택시
    body.add(sideBody([[-40, 12], [-40, 36], [-16, 38], [-14, 27], [10, 27], [12, 35], [40, 35], [45, 30], [45, 14], [40, 12]], 64, 0x1c1c22));
    const side = TAXI_SIDE();
    body.add(decal(side, 70, 18, 2, 26, 35.6, 0), decal(side, 70, 18, 2, 26, -35.6, Math.PI));
    body.add(box(3, 10, 30, 0xb8b8c0, 47.5, 22, 0));
    headlights(body, 47, 26, 21, 0xfff2a0, 6);
    body.add(box(2, 6, 10, 0xff3030, -43.5, 30, 21, true), box(2, 6, 10, 0xff3030, -43.5, 30, -21, true));
    // 표지판 — 기둥 위에. 머리를 가리지 않게 뒤쪽 높이
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 86, 6), toon(0x777780));
    pole.position.set(-34, 80, 0); body.add(pole);
    const sign = TAXI_SIGN();
    const sm = [toon(0xf2c21a), toon(0xf2c21a), toon(0xf2c21a), toon(0xf2c21a),
                new THREE.MeshToonMaterial({ map: sign, gradientMap: TOON }), new THREE.MeshToonMaterial({ map: sign, gradientMap: TOON })];
    const sg = new THREE.Mesh(new THREE.BoxGeometry(14, 14, 38), sm);
    sg.position.set(-34, 126, 0); sg.rotation.y = Math.PI / 2; body.add(sg);
  } else {                   // 노란 람보르기니
    body.add(sideBody([[-40, 12], [-40, 30], [-30, 33], [-14, 33], [-12, 24], [8, 24], [12, 26], [30, 22], [47, 15], [44, 12]], 60, 0xf2c21a));
    body.add(box(18, 6, 1, 0x161616, -8, 20, 33.6), box(18, 6, 1, 0x161616, -8, 20, -33.6));
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(10, 2.5, 10), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }));
      hl.position.set(44, 18.5, 18 * s); hl.rotation.y = 0.35 * s; body.add(hl);
    }
    for (const s of [-1, 1]) {
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 6, 10), toon(0x303036));
      ex.rotation.z = Math.PI / 2; ex.position.set(-44, 18, 6 * s); body.add(ex);
    }
    body.add(box(2, 4, 16, 0xff3030, -43.5, 27, 16, true), box(2, 4, 16, 0xff3030, -43.5, 27, -16, true));
  }
  // 의자 등받이와 핸들
  const seatW = id === "B" ? 58 : 44;
  if (!car3d) body.add(outlined(new THREE.BoxGeometry(8, 30, seatW), toon(0x2a2a2e)).translateX(-17).translateY(41));
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(7, 1.6, 6, 14), toon(0x202024));
  wheel.position.set(8, 38, id === "B" ? -15 : 0); wheel.rotation.y = Math.PI / 2; wheel.rotation.x = 0.5; body.add(wheel);

  // 탄 사람 — 3D 모델이 있으면 그걸 앉힌다
  if (RIDER3D[id]) {
    const z = id === "B" ? 16 : 0;
    // 3D 차는 차체가 낮아 엉덩이를 차 높이에 맞춘다
    const seatY = car3d ? CAR_Y + car3d.h * SEAT_IN_CAR : SEAT.y;
    const rider = placeRider(id, body, SEAT.x, z, seatY);
    rider.userData.baseY = rider.position.y;
    // 핸들을 손이 닿는 곳으로 (모델 +z 가 차 +x, 모델 +x 가 차 -z)
    const h = RIDER3D[id].hands;
    if (id !== "B") wheel.position.set(SEAT.x + h.z + 2, seatY + h.y, z - h.x);
    // B 는 조수석. 운전석(왼쪽)에는 기사님
    const fronts = [];
    if (id === "B" && DRIVER3D) {
      // 기사님 크기는 B 와 같게 — 모자 꼭대기가 B 정수리 높이에 오도록 키를 맞춘다
      const d = DRIVER3D.holder.clone(), base = CAR_Y + 2;
      d.scale.setScalar((seatY + RIDER3D.B.headTop + 6 - base) / DRIVER3D.h);
      d.position.set(SEAT.x + 4, base, -18); body.add(d);
      wheel.visible = false;               // 기사님 모델에 핸들이 붙어 있다
    } else if (id === "B") {
      const d = TEX.driver_front, s = new THREE.Sprite(new THREE.SpriteMaterial({ map: d, alphaTest: 0.5 }));
      s.center.set(0.5, 0); s.scale.set(45 * d.image.width / d.image.height, 45, 1); s.position.set(-4, 34, -18);
      s.userData = { normal: d, flip: flipped(d), baseY: 34 };
      body.add(s); fronts.push(s);
    }
    return { root, body, fronts, back: null, rider, shadow: sh, facing: 1, headY: seatY + RIDER3D[id].headTop };
  }
  const spec = RIDERS[id];
  const mkSprite = (key, h) => {
    const t = TEX[key];
    const mat = new THREE.SpriteMaterial({ map: t, alphaTest: 0.5 });
    const s = new THREE.Sprite(mat);
    s.center.set(0.5, 0);
    s.scale.set(h * t.image.width / t.image.height, h, 1);
    return s;
  };
  const fronts = spec.front.map(f => {
    const s = mkSprite(f.tex, f.h);
    s.position.set(-4, f.y, f.z);
    s.userData = { normal: TEX[f.tex], flip: flipped(TEX[f.tex]), baseY: f.y };
    body.add(s); return s;
  });
  const back = mkSprite(spec.back.tex, spec.back.h);
  back.position.set(-6, spec.back.y, 0); back.visible = false; back.userData.baseY = spec.back.y;
  body.add(back);
  return { root, body, fronts, back, shadow: sh, facing: 1, headY: 104 };
}

/* ============================================================
   무대
   ============================================================ */
const stage = {};
/* 쇼미더머니 2차 불구덩이 무대 (참고: 불꽃 링과 FAIL 아레나.png)
   둥근 쇠판 무대 + 가장자리 불길, 뒤는 기둥 사이 철창과 FAIL 전광판, 양옆은 2층 관중석.
   무대 밖으로 떨어지면 바닥 없이 아래 불빛 속으로 끝없이 떨어진다 */
function buildStage() {
  // 바닥 — 황동빛 쇠판. 가운데 검은 문양, 가장자리는 격자 철판 띠
  const floorTex = canvasTex(2048, 2048, (g, w) => {
    const c = w / 2;
    const gr = g.createRadialGradient(c, c, 10, c, c, c);
    gr.addColorStop(0, "#b98a5a"); gr.addColorStop(0.6, "#9a6a40"); gr.addColorStop(1, "#6e4626");
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
    // 긁힌 자국·얼룩
    for (let i = 0; i < 2600; i++) {
      const a = Math.random() * 7, r = Math.random() * c, x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? "40,20,8" : "255,220,170"},${0.04 + Math.random() * 0.06})`;
      g.lineWidth = 1 + Math.random() * 2; g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40); g.stroke();
    }
    // 판 이음새 — 동심원과 방사선
    g.strokeStyle = "rgba(40,18,6,.55)"; g.lineWidth = 5;
    for (const k of [0.33, 0.62, 0.86]) { g.beginPath(); g.arc(c, c, c * k, 0, 7); g.stroke(); }
    for (let a = 0; a < 24; a++) {
      const t = a / 24 * Math.PI * 2, r0 = a % 2 ? 0.62 : 0.33;
      g.beginPath(); g.moveTo(c + Math.cos(t) * c * r0, c + Math.sin(t) * c * r0); g.lineTo(c + Math.cos(t) * c * 0.86, c + Math.sin(t) * c * 0.86); g.stroke();
    }
    // 가운데 검은 문양
    g.fillStyle = "rgba(30,16,10,.82)"; g.beginPath(); g.arc(c, c, c * 0.3, 0, 7); g.fill();
    g.strokeStyle = "rgba(200,140,80,.5)"; g.lineWidth = 6; g.beginPath(); g.arc(c, c, c * 0.3, 0, 7); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(c, c, c * 0.24, 0, 7); g.stroke();
    for (let i = 0; i < 260; i++) {                     // 깨진 듯한 무늬
      const a = Math.random() * 7, r = Math.random() * c * 0.28;
      g.fillStyle = `rgba(${150 + Math.random() * 60},${90 + Math.random() * 40},50,${0.15 + Math.random() * 0.25})`;
      g.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 4 + Math.random() * 18, 2 + Math.random() * 6);
    }
    g.fillStyle = "rgba(255,200,130,.18)"; g.font = '400 210px "Black Han Sans", sans-serif';
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("2026", c, c + 8);
    // 가장자리 격자 띠
    g.save(); g.beginPath(); g.arc(c, c, c, 0, 7); g.arc(c, c, c * 0.88, 0, 7, true); g.clip();
    g.fillStyle = "#4a2c18"; g.fillRect(0, 0, w, w);
    g.strokeStyle = "rgba(210,150,90,.35)"; g.lineWidth = 3;
    for (let x = -w; x < w * 2; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w, w); g.stroke(); g.beginPath(); g.moveTo(x + w, 0); g.lineTo(x, w); g.stroke(); }
    g.restore();
    for (let a = 0; a < 48; a++) {                      // 띠 위 볼트 박스
      const t = a / 48 * Math.PI * 2;
      g.save(); g.translate(c + Math.cos(t) * c * 0.94, c + Math.sin(t) * c * 0.94); g.rotate(t);
      g.fillStyle = "#2a1609"; g.fillRect(-14, -30, 28, 60); g.restore();
    }
  });
  floorTex.anisotropy = 4;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 160), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  // 옆면 — 쇠판에 빨간 네온 줄
  const SIDE_H = 120;
  const sideTex = canvasTex(2048, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#7a5232"); gr.addColorStop(0.15, "#3c2414"); gr.addColorStop(1, "#120804");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 3;
    for (let x = 0; x < w; x += 128) { g.beginPath(); g.moveTo(x, 14); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = "rgba(160,110,70,.25)";
    for (let x = 20; x < w; x += 128) for (let y = 30; y < h - 10; y += 10) g.fillRect(x, y, 70, 4);
    for (let x = 96; x < w; x += 128) {                  // 네온 줄
      g.fillStyle = "rgba(255,40,30,.35)"; g.fillRect(x - 6, 22, 20, h - 34);
      g.fillStyle = "#ff3b2a"; g.fillRect(x, 26, 8, h - 42);
    }
  });
  sideTex.wrapS = THREE.RepeatWrapping; sideTex.repeat.set(3, 1);
  const side = new THREE.Mesh(new THREE.CylinderGeometry(R, R - 18, SIDE_H, 160, 1, true), new THREE.MeshBasicMaterial({ map: sideTex }));
  side.position.y = -SIDE_H / 2; scene.add(side);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 4, 6, 200), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 1; scene.add(rim);
  // 바퀴 자국은 바닥 위 투명한 판에 직접 그린다
  stage.skidCanvas = document.createElement("canvas"); stage.skidCanvas.width = stage.skidCanvas.height = 1024;
  stage.skidCtx = stage.skidCanvas.getContext("2d");
  stage.skidTex = new THREE.CanvasTexture(stage.skidCanvas);
  const skid = new THREE.Mesh(new THREE.CircleGeometry(R, 120), new THREE.MeshBasicMaterial({ map: stage.skidTex, transparent: true, depthWrite: false }));
  skid.rotation.x = -Math.PI / 2; skid.position.y = 0.4; scene.add(skid);

  // 아래 불구덩이의 빛
  const glowTex = canvasTex(256, 256, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, "rgba(255,120,30,.9)"); gr.addColorStop(0.5, "rgba(170,40,0,.4)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(R * 5, R * 5), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = -320; scene.add(glow);

  // 가장자리 불
  const flameTex = canvasTex(64, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h * 0.78, 2, w / 2, h * 0.6, h * 0.6);
    gr.addColorStop(0, "rgba(255,250,200,1)"); gr.addColorStop(0.25, "rgba(255,190,60,.95)");
    gr.addColorStop(0.6, "rgba(255,90,10,.6)"); gr.addColorStop(1, "rgba(200,20,0,0)");
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(w * 0.1, h); g.quadraticCurveTo(w * 0.05, h * 0.45, w / 2, 0); g.quadraticCurveTo(w * 0.95, h * 0.45, w * 0.9, h); g.closePath(); g.fill();
  });
  stage.flames = [];
  const n = 150;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const a = i / n * Math.PI * 2;
    s.center.set(0.5, 0.05);
    s.position.set(Math.cos(a) * (R + 8), 0, Math.sin(a) * (R + 8));
    s.userData.ph = Math.random() * 10;
    scene.add(s); stage.flames.push(s);
  }

  // ---- 뒤: 벽, 기둥 사이 철창, D, 전광판 ----
  const back = -(R + 150);                       // 철창 줄
  const wallTex = canvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#2a0e06"); gr.addColorStop(0.55, "#8a3412"); gr.addColorStop(1, "#2a0c04");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 3;
    for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(R * 7, 2400), new THREE.MeshBasicMaterial({ map: wallTex }));
  wall.position.set(0, 200, back - 320); scene.add(wall);
  const cageW = R * 1.5;
  const cageBg = new THREE.Mesh(new THREE.PlaneGeometry(cageW, 380), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffa060, transparent: true, opacity: 0.95 }));
  cageBg.position.set(0, 160, back - 300); scene.add(cageBg);
  // 철창 앞 단 (무대와 철창 사이 바닥)
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(cageW + 260, 20, 120), toon(0x4a2e1a));
  ledge.position.set(0, -10, back + 10); scene.add(ledge);
  // 철창 안 바닥 — D 가 무릎 꿇고 있을 자리
  const cellFloor = new THREE.Mesh(new THREE.PlaneGeometry(cageW + 200, 420), toon(0x5a3420));
  cellFloor.rotation.x = -Math.PI / 2; cellFloor.position.set(0, D_FLOOR, back - 210); scene.add(cellFloor);
  // D — 3D 모델이 있으면 창살을 잡은 자세로, 없으면 그림 판
  stage.dZ = back - 46;
  if (RIDER3D.D) {
    stage.D = placeCaged(back);
    // 3D 머리 자리에 도트 얼굴 — 조명 영향 없이 원본 색 그대로, 늘 카메라를 본다
    const hb = []; stage.D.traverse(o => { if (/Head$/.test(o.name)) hb.push(o); });
    const hp = new THREE.Vector3(); stage.D.updateMatrixWorld(true); hb[0].getWorldPosition(hp);
    const ft = TEX.D_face;
    // 숙인 3D 머리가 앞으로 튀어나와 있어 깊이 검사 없이 맨 위에 그린다 (철창 앞으로 얼굴을 내민 모양)
    const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, alphaTest: 0.5, depthTest: false }));
    face.renderOrder = 5;
    face.scale.set(D_FACE_H * ft.image.width / ft.image.height, D_FACE_H, 1);
    face.position.set(0, hp.y + D_FACE_H * 0.3, hp.z + 28);   // 3D 머리 자리에 — 3D 얼굴을 덮는다
    scene.add(face); stage.dFace = face;
  }
  // 경찰 두 명 — D 양옆 철창 앞을 지킨다. 서 있기만 해서 3D 대신 그림 판 (tools/cut_police.py)
  for (const [key, sx] of [["police_L", -1], ["police_R", 1]]) {
    const t = TEX[key]; if (!t) continue;
    t.magFilter = THREE.LinearFilter;          // 도트가 아닌 그림이라 부드럽게
    // 빌보드(Sprite)는 내려다보는 카메라 쪽으로 누워서 윗몸이 창살 뒤로 넘어간다 — 똑바로 선 판으로
    const w = POLICE_H * t.image.width / t.image.height;
    const geo = new THREE.PlaneGeometry(w, POLICE_H); geo.translate(0, POLICE_H / 2, 0);
    const pol = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, color: 0xeadcd2 }));
    pol.position.set(sx * POLICE_X, 0, back + 68);
    scene.add(pol);
  }
  if (RIDER3D.D) {
    stage.dHead = new THREE.Vector3(0, stage.dFace.position.y + D_FACE_H * 0.5 + 16, back);
  } else {
    const dT = TEX.D, dH = 330, dW = dH * dT.image.width / dT.image.height;
    const D = new THREE.Mesh(new THREE.PlaneGeometry(dW, dH), new THREE.MeshBasicMaterial({ map: dT, transparent: true, alphaTest: 0.5 }));
    D.position.set(0, dH / 2 - 30, stage.dZ); scene.add(D);
    stage.dHead = new THREE.Vector3(70, 270, stage.dZ);
  }
  // D 를 비추는 조명 — 앞에서 크게 한 번, 위에서 한 번. 검은 정장이 보이게
  const dLight = new THREE.PointLight(0xfff0e0, 9, 700, 0);
  dLight.position.set(0, 260, back + 260); scene.add(dLight);
  const dTop = new THREE.SpotLight(0xffe2c0, 14, 900, 0.5, 0.6, 0);
  dTop.position.set(0, 520, back - 40); dTop.target.position.set(0, 60, back - 60);
  scene.add(dTop, dTop.target);
  // 창살 — 세로만, 고른 간격. 가운데 칸에 D 얼굴이 들어가고, 그 양옆 창살을 D 가 잡는다
  const barMat = toon(0x8a8078);
  for (let x = BAR_GAP / 2; x <= cageW / 2; x += BAR_GAP) for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 380, 6), barMat);
    b.position.set(sx * x, 170, back); scene.add(b);
  }
  stage.cageZ = back;
  // 양옆 큰 기둥 + 위 스피커
  const pillarX = cageW / 2 + 90;
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(150, 760, 150), toon(0xd8964a));
    p.position.set(s * pillarX, 280, back - 20); scene.add(p);
    for (let y = -60; y < 640; y += 95) scene.add(box(154, 8, 154, 0x5a2a0c, s * pillarX, y, back - 20));
    for (let k = 0; k < 2; k++) {                      // 스피커 두 단
      const sp = box(130, 90, 110, 0x1a1412, s * pillarX, 700 + k * 96, back - 20); scene.add(sp);
      for (const dx of [-30, 30]) {
        const cone = new THREE.Mesh(new THREE.CircleGeometry(22, 16), new THREE.MeshBasicMaterial({ color: 0x3a302c }));
        cone.position.set(s * pillarX + dx, 700 + k * 96, back + 36); scene.add(cone);
      }
    }
  }
  // 전광판 — FAIL 이 뜨는 곳
  stage.led = document.createElement("canvas"); stage.led.width = 1024; stage.led.height = 192;
  stage.ledTex = new THREE.CanvasTexture(stage.led); stage.ledTex.colorSpace = THREE.SRGBColorSpace;
  const ledW = cageW * 0.86;
  const led = new THREE.Mesh(new THREE.PlaneGeometry(ledW, ledW * 0.19), new THREE.MeshBasicMaterial({ map: stage.ledTex }));
  led.position.set(0, 470, back - 10); scene.add(led);
  scene.add(box(ledW + 30, ledW * 0.19 + 30, 12, 0x140806, 0, 470, back - 18));
  drawLED("범퍼카 2026", false);

  // ---- 양옆: 2층 관중석 (빨간 네온 난간) ----
  stage.crowd = [];
  const crowdMat = [toon(0x1c2230), toon(0x262a38), toon(0x2e2420)];
  const headMat = toon(0x2a1c16);
  for (const s of [-1, 1]) {
    const bx = s * (R + 300);
    for (let lv = 0; lv < 2; lv++) {
      const y = 40 + lv * 210;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(260, 16, R * 2.2), toon(0x2a1a12));
      deck.position.set(bx, y, -R * 0.25); scene.add(deck);
      // 네온 난간
      const rail = new THREE.Mesh(new THREE.BoxGeometry(6, 6, R * 2.2), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
      rail.position.set(bx - s * 125, y + 70, -R * 0.25); scene.add(rail);
      const rail2 = rail.clone(); rail2.position.y = y + 30; scene.add(rail2);
      for (let z = -R * 1.3; z < R * 0.85; z += 90) scene.add(box(5, 70, 5, 0x5a4a40, bx - s * 125, y + 40, z));
      // 관중 — 몸통 + 머리, 두 줄
      for (let row = 0; row < 2; row++) for (let z = -R * 1.3; z < R * 0.85; z += 44 + Math.random() * 20) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(13, 34, 3, 8), crowdMat[(Math.random() * 3) | 0]);
        body.position.y = 34;
        const head = new THREE.Mesh(new THREE.SphereGeometry(12, 8, 6), headMat);
        head.position.y = 72;
        g.add(body, head);
        g.position.set(bx - s * (80 - row * 55), y + 8, z);
        g.userData = { ph: Math.random() * 10, y: g.position.y };
        scene.add(g); stage.crowd.push(g);
      }
    }
    // 관중석 뒤 기둥 트러스 + 붉은 조명
    for (let z = -R * 1.3; z < R * 0.9; z += R * 0.55) {
      scene.add(box(14, 520, 14, 0x3a1a10, bx + s * 120, 200, z));
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(30, 18, 18), new THREE.MeshBasicMaterial({ color: 0xffc070 }));
      lamp.position.set(bx - s * 40, 420, z); scene.add(lamp);
    }
  }
}
// 관중이 들썩인다 (syncScene 에서 부른다)
function bobCrowd() {
  for (const g of stage.crowd) g.position.y = g.userData.y + Math.max(0, Math.sin(T * 6 + g.userData.ph)) * 6;
}
let ledShown = "";
function drawLED(msg, hot) {
  const key = msg + hot; if (key === ledShown) return; ledShown = key;
  const g = stage.led.getContext("2d"), w = stage.led.width, h = stage.led.height, u = w / 512;
  g.fillStyle = hot ? "#d0140c" : "#5a0a06"; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(0,0,0,.25)"; for (let x = 0; x < w; x += 4 * u) g.fillRect(x, 0, u, h);
  g.font = `400 ${(msg.length > 6 ? 40 : 62) * u}px "Black Han Sans", "Noto Sans KR", sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = hot ? "#3a0402" : "#ffcf6a"; g.fillText(msg, w / 2, h / 2 + 4 * u);
  stage.ledTex.needsUpdate = true;
}

/* ============================================================
   입력
   ============================================================ */
const keys = {};
let upPressed = false;          // 이번 걸음에 ↑ 를 "새로" 눌렀나 (부스터)
window.addEventListener("keydown", e => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  if (e.code === "ArrowUp" && !e.repeat) upPressed = true;
  keys[e.code] = true;
  if ((e.code === "Escape" || e.code === "KeyP") && canPause()) { setPaused(!paused); return; }
  if (paused) return;
  if (mode === "select") selectKey(e);
  else if (mode === "result" && (e.code === "Enter" || e.code === "KeyR")) startGame(playerId);
  else if (mode === "play" && e.code === "Enter" && player && !player.onStage) finishNow();
  if (e.code === "KeyM") toggleSound();
});
window.addEventListener("keyup", e => { keys[e.code] = false; });
window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; if (canPause()) setPaused(true); });

/* ============================================================
   소리 — 효과음은 코드로 만든다. BGM 은 파일이 오면 끼운다
   ============================================================ */
let AC = null, soundOn = true;
const BGM = new Audio("assets/audio/bgm.mp3");
BGM.loop = true; BGM.volume = 0.5; BGM.preload = "none";
let bgmOk = true;
BGM.addEventListener("error", () => { bgmOk = false; });

function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === "suspended") AC.resume();
  return AC;
}
function tone(type, f0, f1, dur, vol) {
  const a = soundOn && audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = type; o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur);
}
let noiseBuf = null;
function crashSfx(power) {
  const a = soundOn && audio(); if (!a) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 0.4, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  }
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
  s.buffer = noiseBuf; f.type = "lowpass"; f.frequency.value = 900 + 1800 * power;
  g.gain.value = 0.25 + 0.5 * power;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
  tone("sine", 140, 45, 0.22, 0.35 * (0.4 + power));
}
const boostSfx = () => { tone("sawtooth", 180, 900, 0.45, 0.12); tone("square", 90, 300, 0.4, 0.05); };
const fallSfx = () => tone("sine", 900, 120, 1.3, 0.18);
const beep = (f, d = 0.12) => tone("square", f, f, d, 0.08);

function toggleSound() {
  soundOn = !soundOn;
  const b = document.getElementById("bSound");
  b.classList.toggle("off", !soundOn);
  b.setAttribute("aria-label", soundOn ? "소리 끄기" : "소리 켜기");
  if (!soundOn) BGM.pause(); else if (mode === "play" && bgmOk) BGM.play().catch(() => {});
}
document.getElementById("bSound").addEventListener("click", toggleSound);

/* ============================================================
   차
   ============================================================ */
class Car {
  constructor(id, isPlayer, x, y, h) {
    this.id = id; this.isPlayer = isPlayer;
    this.x = x; this.y = y; this.h = h; this.vx = 0; this.vy = 0;
    this.onStage = true; this.out = false; this.z = 0; this.vz = 0;
    this.drift = false; this.driftT = 0; this.boostWin = 0; this.boostT = 0; this.steer = 0;
    this.slideT = 0; this.taunt = 0; this.lastHit = -9; this.spin = 0;
    this.speedMul = isPlayer ? 1 : 0.94;
    this.ai = { target: null, retarget: 0, driftT: 0, think: 0, steer: 0 };
    const L = CHARS[id].lines;
    this.line = Math.floor(Math.random() * L.length);
    this.bubble = null;
    this.nextTalk = 0.3 + Math.random() * TALK_EVERY;   // 셋이 한꺼번에 말하지 않게 엇갈려 시작
    this.model = makeCarModel(id);
    scene.add(this.model.root);
  }
  get speed() { return Math.hypot(this.vx, this.vy); }
}

let cars = [], player = null, playerId = "A";
let mode = "select";                     // select | count | play | end | result
let T = 0, playT = 0, countT = 0, endT = 0;
let shake = 0, ledMsg = null, ledT = 0;
let elimOrder = [];
let parts = [], pops = [];
const dTalk = { bubble: null, next: 3 };

function startGame(id) {
  playerId = id;
  audio();
  for (const c of cars) scene.remove(c.model.root);
  // 플레이어는 앞쪽(카메라 쪽), 나머지는 뒤 양옆에서 무대 가운데를 보고 출발
  const spots = [Math.PI / 2, Math.PI * 1.17, Math.PI * 1.83];
  const order = [id, ...IDS.filter(k => k !== id)];
  cars = order.map((k, i) => {
    const a = spots[i], r = R * 0.58;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    return new Car(k, i === 0, x, y, Math.atan2(-y, -x));
  });
  if (SOLO) { for (const c of cars.slice(1)) scene.remove(c.model.root); cars = cars.slice(0, 1); }
  player = cars[0];
  T = 0; playT = 0; countT = 3.6; endT = 0; shake = 0;
  elimOrder = []; parts = []; pops = []; winnerCar = null;
  ledMsg = null; ledT = 0;
  stage.skidCtx.clearRect(0, 0, 1024, 1024); stage.skidTex.needsUpdate = true;
  mode = "count"; show("bPause", true);
  show("scSelect", false); show("scResult", false);
  if (soundOn && bgmOk) { BGM.currentTime = 0; BGM.play().catch(() => {}); }
}

/* ---------- 우승 세리머니 — 혼자 남은 봇이 무대를 돌며 드리프트·부스터 ---------- */
function victoryInput(c, dt) {
  const v = c.vic || (c.vic = { dir: Math.random() < 0.5 ? 1 : -1, driftT: 0, next: rnd(0.6, 1.2), boostAt: null, swap: rnd(5, 9) });
  // 반지름 R*0.5 원을 따라 돈다. 가끔 도는 방향을 바꿔 크게 드리프트한다
  v.swap -= dt;
  if (v.swap <= 0) { v.dir *= -1; v.swap = rnd(5, 9); v.driftT = rnd(0.5, 0.8); }
  const r = Math.hypot(c.x, c.y) || 1, a = Math.atan2(c.y, c.x) + v.dir * 0.7;
  const rr = r > R * 0.7 ? R * 0.35 : R * 0.5;            // 가장자리에 붙으면 안쪽으로
  const want = Math.atan2(Math.sin(a) * rr - c.y, Math.cos(a) * rr - c.x);
  const diff = angDiff(want, c.h);
  let steer = clamp(diff * 2.5, -1, 1), drift = false, boost = false;
  v.next -= dt;
  if (v.driftT <= 0 && v.next <= 0 && r < R * 0.7) { v.driftT = rnd(0.25, 0.6); v.next = rnd(0.9, 1.8); }
  if (v.driftT > 0) {
    v.driftT -= dt; drift = true;
    if (Math.abs(steer) < 0.5) steer = Math.sign(steer || v.dir) * 0.8;   // 드리프트는 확 꺾어서
    if (v.driftT <= 0) v.boostAt = rnd(0.02, 0.12);
  }
  if (v.boostAt != null) { v.boostAt -= dt; if (v.boostAt <= 0) { boost = true; v.boostAt = null; } }
  const outward = (c.vx * c.x + c.vy * c.y) / r;
  const thr = r > R * 0.85 && outward > 40 ? -1 : 1;
  return { thr, steer, drift, boost };
}

/* ---------- 조작 → 물리 ---------- */
function playerInput() {
  const thr = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
  const steer = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
  const drift = !!(keys.ShiftLeft || keys.ShiftRight);
  return { thr, steer, drift, boost: upPressed };
}

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);

function aiInput(c, dt) {
  const ai = c.ai;
  const others = cars.filter(o => o !== c && o.onStage);
  if (!others.length) return { thr: 0, steer: 0, drift: false, boost: false };
  ai.retarget -= dt;
  if (!ai.target || !ai.target.onStage || ai.retarget <= 0) {
    // 가깝고, 가장자리에 가까운 상대를 노린다
    let best = null, bs = 1e9;
    for (const o of others) {
      // 다른 봇이 이미 노리는 상대는 덜 고른다 — 둘이 한 명만 몰아붙이지 않게
      const taken = cars.some(q => q !== c && !q.isPlayer && q.onStage && q.ai.target === o) ? 160 : 0;
      const s = Math.hypot(o.x - c.x, o.y - c.y) - 1.1 * Math.hypot(o.x, o.y) + rnd(0, 120) + taken;
      if (s < bs) { bs = s; best = o; }
    }
    ai.target = best; ai.retarget = rnd(1.5, 3.2);
  }
  const t = ai.target;
  const tr = Math.hypot(t.x, t.y) || 1, ux = t.x / tr, uy = t.y / tr;
  // 상대보다 바깥에 있으면 안쪽으로 돌아 들어간 뒤, 바깥쪽으로 들이받는다
  const outside = (c.x - t.x) * ux + (c.y - t.y) * uy;
  let gx, gy;
  if (outside > -20) { gx = t.x - ux * 130 - uy * 50; gy = t.y - uy * 130 + ux * 50; }
  else { gx = t.x + ux * 40 + t.vx * 0.25; gy = t.y + uy * 40 + t.vy * 0.25; }
  // 내가 가장자리에 붙으면 가운데 쪽으로 끌어당긴다
  const r = Math.hypot(c.x, c.y);
  const safe = R * 0.78;
  if (r > safe) { const k = clamp((r - safe) / (R - safe), 0, 1); gx *= 1 - k; gy *= 1 - k; }
  const want = Math.atan2(gy - c.y, gx - c.x);
  const diff = angDiff(want, c.h);
  ai.think -= dt;
  if (ai.think <= 0) { ai.steer = clamp(diff * 2.2 + rnd(-0.15, 0.15), -1, 1); ai.think = rnd(0.05, 0.14); }
  let thr = Math.abs(diff) > 2.3 ? -0.5 : Math.abs(diff) > 1.3 ? 0.5 : 1;
  const outward = (c.vx * c.x + c.vy * c.y) / (r || 1);
  if (r > R * 0.9 && outward > 60) thr = Math.abs(diff) > 1.6 ? -1 : 0.6;
  let drift = false, boost = false;
  const vf = c.vx * Math.cos(c.h) + c.vy * Math.sin(c.h);
  // 드리프트 → 끝나자마자 ↑ 로 부스터. 크게 돌 때도 하고,
  // 상대를 정면으로 노릴 때는 살짝 꺾는 짧은 드리프트로 부스터를 붙여 들이받는다
  const dist = Math.hypot(t.x - c.x, t.y - c.y);
  if (ai.driftT > 0) {
    ai.driftT -= dt; drift = true;
    if (ai.driftT <= 0) ai.boostAt = rnd(0.02, 0.15);
  } else if (Math.abs(diff) > 0.6 && vf > 170 && r < R * 0.8 && Math.random() < dt * 4) {
    ai.driftT = rnd(0.2, 0.55); drift = true;
  } else if (Math.abs(diff) < 0.35 && vf > 180 && dist < 520 && dist > 160 && r < R * 0.7 && Math.random() < dt * 2.5) {
    ai.driftT = rnd(0.1, 0.18); drift = true;       // 박기 직전 부스터용 짧은 드리프트
  }
  if (ai.boostAt != null) {
    ai.boostAt -= dt;
    if (ai.boostAt <= 0) { boost = Math.random() < 0.9; ai.boostAt = null; }
  }
  return { thr, steer: ai.steer, drift, boost };
}

let skidDirty = false;
function skidMark(x, y) {
  const g = stage.skidCtx, k = 1024 / (2 * R);
  g.fillStyle = "rgba(12,6,4,.5)";
  g.beginPath(); g.ellipse((x + R) * k, (y + R) * k, 6, 6, 0, 0, 7); g.fill();
  skidDirty = true;
}

function stepCar(c, inp, dt) {
  const ctrl = c.slideT > 0 ? 0.5 : 1;
  const fx = Math.cos(c.h), fy = Math.sin(c.h), lx = -fy, ly = fx;
  let vf = c.vx * fx + c.vy * fy, vl = c.vx * lx + c.vy * ly;

  // 드리프트 — 미끄러지는 동안은 옆으로 잘 안 붙잡고, 더 많이 돈다
  const canDrift = inp.drift && inp.steer !== 0 && vf > DRIFT_MIN_V;
  if (canDrift && !c.drift) { c.drift = true; c.driftT = 0; }
  if (c.drift) {
    c.driftT += dt;
    if (!inp.drift || inp.steer === 0 || vf < 70) {
      c.drift = false;
      if (c.driftT >= DRIFT_READY) c.boostWin = BOOST_WINDOW;
    }
  }
  // 부스터: 드리프트 막바지이거나 막 끝난 순간에 ↑ 를 다시 눌러야 한다
  const ready = c.boostWin > 0 || (c.drift && c.driftT >= DRIFT_READY);
  if (inp.boost && ready) {
    c.drift = false; c.boostWin = 0; c.boostT = BOOST_T; c.boosts = (c.boosts || 0) + 1;
    if (vf < BOOST_KICK) vf = BOOST_KICK;
    if (c.isPlayer) { pops.push({ x: c.x, y: c.y, text: "부스터!", t: 0, color: "#ffb33b" }); boostSfx(); }
    c.taunt = 0.8;
  }
  c.boostWin = Math.max(0, c.boostWin - dt);
  c.boostT = Math.max(0, c.boostT - dt);

  const maxV = (c.boostT > 0 ? BOOSTV : MAXV * c.speedMul);
  if (inp.thr > 0) vf += ACC * inp.thr * ctrl * dt;
  else if (inp.thr < 0) vf = vf > 0 ? vf - BRAKE * dt : Math.max(vf - ACC * 0.7 * dt, -REVV);
  else vf *= Math.exp(-1.1 * dt);
  if (vf > maxV) vf -= (vf - maxV) * Math.min(1, 4 * dt);   // 부스터가 끝나면 서서히 원래 속도로

  const grip = c.slideT > 0 ? GRIP_SLIDE : c.drift ? GRIP_DRIFT : GRIP;
  vl *= Math.exp(-grip * dt);

  const sf = clamp(Math.abs(vf) / 140, 0.35, 1);
  c.h += inp.steer * TURN * (c.drift ? 1.55 : 1) * sf * (vf < -5 ? -1 : 1) * ctrl * dt;
  c.steer += (inp.steer - c.steer) * Math.min(1, 10 * dt);

  c.vx = fx * vf + lx * vl; c.vy = fy * vf + ly * vl;
  if (c.slideT > 0) { const k = Math.exp(-SLIDE_STOP * dt); c.vx *= k; c.vy *= k; }   // 범퍼카는 맞고 나면 금방 선다
  c.x += c.vx * dt; c.y += c.vy * dt;
  c.slideT = Math.max(0, c.slideT - dt);
  c.taunt = Math.max(0, c.taunt - dt);

  // 자국과 연기
  if ((c.drift || c.slideT > 0) && Math.abs(vl) > 60) {
    for (const s of [-1, 1]) skidMark(c.x + (lx * 22 * s - fx * 26) * CAR_SCALE, c.y + (ly * 22 * s - fy * 26) * CAR_SCALE);
    if (Math.random() < 0.3) parts.push({ x: c.x - fx * 30, y: c.y - fy * 30, z: 8, vx: rnd(-20, 20), vy: rnd(-20, 20), vz: rnd(20, 50), t: 0, life: 0.7, kind: "smoke" });
  }
  if (c.boostT > 0 && Math.random() < 0.9) {
    parts.push({ x: c.x - fx * 44, y: c.y - fy * 44, z: 22, vx: -fx * 120 + rnd(-30, 30), vy: -fy * 120 + rnd(-30, 30), vz: rnd(0, 30), t: 0, life: 0.35, kind: "fire" });
  }
}

function collide(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d >= CAR_R * 2 || d === 0) return;
  const nx = dx / d, ny = dy / d, ov = CAR_R * 2 - d;
  a.x -= nx * ov / 2; a.y -= ny * ov / 2; b.x += nx * ov / 2; b.y += ny * ov / 2;
  const va = a.vx * nx + a.vy * ny, vb = b.vx * nx + b.vy * ny;
  const rel = va - vb;                        // 서로 다가오는 빠르기
  if (rel <= 0 || T - Math.max(a.lastHit, b.lastHit) < 0.08) return;
  // 운동량을 나눠 갖고(반발 0.75), 거기에 "들이받힌 쪽이 밀려나는" 몫을 더 준다
  const e = 0.75, mid = (va + vb) / 2;
  const na = mid - e * rel / 2, nb = mid + e * rel / 2;
  a.vx += nx * (na - va); a.vy += ny * (na - va);
  b.vx += nx * (nb - vb); b.vy += ny * (nb - vb);
  const pa = Math.max(0, va) * (a.boostT > 0 ? BOOST_HIT : 1);   // a 가 들이받은 세기
  const pb = Math.max(0, -vb) * (b.boostT > 0 ? BOOST_HIT : 1);
  // 판이 길어지면 점점 세게 튕긴다 (무대를 줄이는 대신)
  const heat = 1 + clamp((playT - HEAT_FROM) / HEAT_RAMP, 0, 1) * (HEAT_MAX - 1);
  const ka = (KNOCK + pa * RAM) * heat, kb = (KNOCK + pb * RAM) * heat;
  b.vx += nx * ka; b.vy += ny * ka;
  a.vx -= nx * kb; a.vy -= ny * kb;
  for (const c of [a, b]) {
    const v = Math.hypot(c.vx, c.vy), cap = MAX_HIT_V * heat;
    if (v > cap) { c.vx *= cap / v; c.vy *= cap / v; }
  }
  const sl = 0.3 + Math.min(0.25, rel / 1500);
  a.slideT = Math.max(a.slideT, sl); b.slideT = Math.max(b.slideT, sl);
  a.drift = b.drift = false;
  a.lastHit = b.lastHit = T;
  // 들이받힌 쪽은 휘청 — 몸통이 잠깐 흔들린다
  if (pa > pb) { a.taunt = 1; b.spin = 1; } else { b.taunt = 1; a.spin = 1; }

  const px = a.x + nx * CAR_R, py = a.y + ny * CAR_R;
  for (let i = 0; i < 10 + rel / 25; i++) {
    const an = rnd(0, Math.PI * 2), sp = rnd(80, 260);
    parts.push({ x: px, y: py, z: 30, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, vz: rnd(60, 240), t: 0, life: rnd(0.25, 0.5), kind: "spark" });
  }
  const power = clamp(rel / 450, 0, 1);
  if (rel > 140) pops.push({ x: px, y: py, text: rel > 330 ? "쾅!!" : "쿵!", t: 0, color: "#fff" });
  shake = Math.max(shake, 3 + power * 10);
  crashSfx(power);
}

function fallOff(c) {
  c.onStage = false; c.drift = false;
  c.fallCause = T - c.lastHit < 1.2 ? "hit" : "self";
  c.vz = 0; c.vx *= 0.6; c.vy *= 0.6;
  elimOrder.push(c.id);
  ledMsg = "FAIL"; ledT = 1.8;
  pops.push({ x: c.x, y: c.y, text: "탈락!", t: 0, color: "#ff5a4a" });
  fallSfx();
}

/* ============================================================
   한 걸음
   ============================================================ */
function update(dt) {
  T += dt;
  ledT = Math.max(0, ledT - dt);
  shake *= Math.exp(-8 * dt);

  if (mode === "count") {
    const before = Math.ceil(countT - 0.6);
    countT -= dt;
    const after = Math.ceil(countT - 0.6);
    if (after !== before && after >= 1) beep(520);
    if (countT <= 0.6 && countT + dt > 0.6) { beep(1040, 0.3); ledMsg = "GO!"; ledT = 0.9; }
    if (countT <= 0.6) mode = "play";
  }
  const live = mode === "play" || mode === "end" || mode === "result";
  if (mode === "play") playT += dt;

  for (const c of cars) {
    if (c.onStage) {
      const inp = !live ? { thr: 0, steer: 0, drift: false, boost: false }
                : c.isPlayer && !AUTO ? playerInput()
                : mode === "result" ? victoryInput(c, dt) : aiInput(c, dt);
      stepCar(c, inp, dt);
      if (Math.hypot(c.x, c.y) > R) fallOff(c);
    } else if (!c.out) {
      // 아래로 끝없이 — 안개 속으로 사라진다
      c.vz -= FALL_G * dt; c.z += c.vz * dt;
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.vx *= Math.exp(-0.8 * dt); c.vy *= Math.exp(-0.8 * dt);
      if (c.z < -2600) c.out = true;
    }
    c.spin = Math.max(0, c.spin - dt * 2.5);
    c.nextTalk -= dt;
    if (c.bubble) { c.bubble.t -= dt; if (c.bubble.t <= 0) c.bubble = null; }
    if (c.nextTalk <= 0 && c.onStage) {
      const L = CHARS[c.id].lines;
      c.bubble = { text: L[c.line % L.length], t: TALK_EVERY - 0.15 };
      c.line++;
      c.nextTalk = TALK_EVERY;
    }
  }
  upPressed = false;

  const on = cars.filter(c => c.onStage);
  for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) collide(on[i], on[j]);

  dTalk.next -= dt;
  if (dTalk.bubble) { dTalk.bubble.t -= dt; if (dTalk.bubble.t <= 0) dTalk.bubble = null; }
  if (dTalk.next <= 0) { dTalk.bubble = { text: D_LINES[Math.floor(Math.random() * D_LINES.length)], t: 2.2 }; dTalk.next = rnd(3.5, 6); }

  for (const p of parts) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.kind === "spark") p.vz -= 900 * dt;
    if (p.kind === "smoke") { p.vx *= 0.96; p.vy *= 0.96; }
  }
  parts = parts.filter(p => p.t < p.life);
  for (const p of pops) p.t += dt;
  pops = pops.filter(p => p.t < 1.1);

  if (mode === "play" && on.length <= (SOLO ? 0 : 1)) { mode = "end"; endT = 1.6; if (on[0]) { ledMsg = "WINNER"; ledT = 3; } }
  if (mode === "end") { endT -= dt; if (endT <= 0) showResult(); }
}

function finishNow() { mode = "end"; endT = 0.01; }

/* ============================================================
   그리기
   ============================================================ */
const _v = new THREE.Vector3();
function project(x, y3, z) {
  _v.set(x, y3, z).project(camera);
  return { x: (_v.x + 1) / 2 * VW, y: (1 - _v.y) / 2 * VH, behind: _v.z > 1 };
}

let skidFade = 0;
function syncScene(dt) {
  // 자국은 천천히 지워진다
  skidFade += dt;
  if (skidFade > 0.12) {
    const g = stage.skidCtx;
    g.globalCompositeOperation = "destination-out"; g.fillStyle = "rgba(0,0,0,.06)"; g.fillRect(0, 0, 1024, 1024);
    g.globalCompositeOperation = "source-over";
    skidFade = 0; skidDirty = true;
  }
  if (skidDirty) { stage.skidTex.needsUpdate = true; skidDirty = false; }

  for (const f of stage.flames) {
    const ph = f.userData.ph;
    const fl = 0.6 + 0.4 * Math.sin(T * 9 + ph * 1.7) * Math.sin(T * 5.3 + ph);
    f.scale.set(26 + 6 * fl, 46 + 46 * fl, 1);
  }

  const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
  for (const c of cars) {
    const m = c.model;
    m.root.visible = !c.out;
    m.root.position.set(c.x, c.z, c.y);
    m.root.rotation.y = -c.h;
    m.shadow.visible = c.onStage;
    // 기울기 — 드리프트 때 바깥으로 눕고, 맞으면 휘청, 부스터 때 앞이 들린다
    const lean = c.drift ? -c.steer * 0.16 : -c.steer * 0.05;
    m.body.rotation.x = lean + Math.sin(T * 40) * 0.08 * c.spin;
    m.body.rotation.z = (c.boostT > 0 ? 0.07 : 0) + (!c.onStage ? T * 3 : 0);
    // 앞모습/뒷모습 — 화면 안쪽(멀어지는 쪽)으로 갈 때만 뒤통수
    const fx = Math.cos(c.h), fz = Math.sin(c.h);
    const away = fz < -0.35;
    if (Math.abs(fx) > 0.2) m.facing = fx > 0 ? 1 : -1;
    if (m.rider) m.rider.position.y = m.rider.userData.baseY + (c.taunt > 0 ? Math.abs(Math.sin(T * 14)) * 6 : 0);
    for (const s of m.fronts) {
      s.visible = !away;
      const want = m.facing > 0 ? s.userData.normal : s.userData.flip;
      if (s.material.map !== want) { s.material.map = want; s.material.needsUpdate = true; }
      s.position.y = s.userData.baseY + (c.taunt > 0 ? Math.abs(Math.sin(T * 14)) * 6 : 0);
    }
    if (m.back) m.back.visible = away;
  }
  // 흔들기
  placeCamera(dt, shake * 1.6);
  bobCrowd();

  if (ledT > 0) drawLED(ledMsg, ledMsg === "FAIL"); else drawLED("범퍼카 2026", false);
}

function wrapText(g, text, maxW) {
  const out = []; let line = "";
  for (const ch of text) {
    const t = line + ch;
    if (g.measureText(t).width > maxW && line) { out.push(line); line = ch; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
function drawBubble(g, x, y, text) {
  g.font = '700 15px "Noto Sans KR", sans-serif';
  const lines = wrapText(g, text, 210);
  const w = Math.max(...lines.map(l => g.measureText(l).width)) + 22, h = lines.length * 20 + 14;
  const bx = clamp(x - w / 2, 6, VW - w - 6), by = y - h - 12;
  g.fillStyle = "rgba(255,255,255,.96)"; g.strokeStyle = "#1a1010"; g.lineWidth = 2.5;
  g.beginPath(); g.roundRect(bx, by, w, h, 10); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x - 7, by + h - 1); g.lineTo(x, by + h + 10); g.lineTo(x + 7, by + h - 1); g.closePath();
  g.fill(); g.stroke();
  g.fillRect(x - 6, by + h - 3, 12, 4);
  g.fillStyle = "#1a1010"; g.textAlign = "center"; g.textBaseline = "middle";
  lines.forEach((l, i) => g.fillText(l, bx + w / 2, by + 17 + i * 20));
}

function drawOverlay() {
  const g = ctx;
  g.setTransform(PX, 0, 0, PX, 0, 0);
  g.clearRect(0, 0, VW, VH);
  if (mode === "select") return;

  // 불티·연기·부스터 불
  for (const p of parts) {
    const k = 1 - p.t / p.life, s = project(p.x, p.z, p.y);
    if (p.kind === "spark") { g.fillStyle = `rgba(255,230,120,${k})`; g.fillRect(s.x - 2, s.y - 2, 4, 4); }
    else if (p.kind === "smoke") { g.fillStyle = `rgba(200,190,180,${0.35 * k})`; g.beginPath(); g.arc(s.x, s.y, 8 + 14 * (1 - k), 0, 7); g.fill(); }
    else { g.fillStyle = `rgba(255,${120 + 100 * k | 0},30,${k})`; g.beginPath(); g.arc(s.x, s.y, 4 + 8 * k, 0, 7); g.fill(); }
  }
  // 내 차 표시와 부스터 타이밍 고리
  if (player && player.onStage && mode !== "result") {
    const top = project(player.x, (player.model.headY + 14) * CAR_SCALE, player.y);
    g.fillStyle = "#ffd23f";
    g.beginPath(); g.moveTo(top.x, top.y); g.lineTo(top.x - 8, top.y - 12); g.lineTo(top.x + 8, top.y - 12); g.fill();
    if (player.boostWin > 0 || (player.drift && player.driftT >= DRIFT_READY)) {
      const c0 = project(player.x, 0, player.y), c1 = project(player.x + 58 * CAR_SCALE, 0, player.y), c2 = project(player.x, 0, player.y + 58 * CAR_SCALE);
      g.strokeStyle = `rgba(255,200,60,${0.6 + 0.4 * Math.sin(T * 30)})`; g.lineWidth = 4;
      g.beginPath(); g.ellipse(c0.x, c0.y, Math.abs(c1.x - c0.x), Math.abs(c2.y - c0.y), 0, 0, 7); g.stroke();
    }
  }
  // 터지는 글자
  g.textAlign = "center"; g.textBaseline = "middle";
  for (const p of pops) {
    const k = p.t / 1.1, s = project(p.x, 130 + 60 * k, p.y);
    g.font = `400 ${28 + 10 * Math.min(1, p.t * 6)}px "Black Han Sans", "Noto Sans KR", sans-serif`;
    g.lineWidth = 5; g.strokeStyle = `rgba(30,8,4,${1 - k})`; g.fillStyle = p.color; g.globalAlpha = 1 - k;
    g.strokeText(p.text, s.x, s.y); g.fillText(p.text, s.x, s.y);
    g.globalAlpha = 1;
  }
  // 말풍선 (멈춤 화면 위로 비치지 않게 멈추면 숨긴다)
  if (paused) { drawHUD(g); return; }
  if (dTalk.bubble) { const s = project(stage.dHead.x, stage.dHead.y, stage.dHead.z); drawBubble(g, s.x, s.y, dTalk.bubble.text); }
  for (const c of cars) {
    if (c.bubble && c.onStage) {
      const s = project(c.x, (c.model.headY + (c.isPlayer ? 40 : 22)) * CAR_SCALE, c.y);
      drawBubble(g, s.x, s.y, c.bubble.text);
    }
  }
  drawHUD(g);
}

const headIcons = {};
function drawHUD(g) {
  g.textBaseline = "middle"; g.textAlign = "left";
  cars.forEach((c, i) => {
    const y = 28 + i * 44, x = 14;
    g.fillStyle = c.isPlayer ? "rgba(255,210,63,.22)" : "rgba(0,0,0,.45)";
    g.beginPath(); g.roundRect(x, y - 18, 214, 36, 8); g.fill();
    const im = TEX[`${c.id}_front`] && TEX[`${c.id}_front`].image;
    if (im) {
      g.save(); g.beginPath(); g.roundRect(x + 4, y - 15, 30, 30, 6); g.clip();
      const sw = im.width * 0.62;
      g.drawImage(im, (im.width - sw) / 2, 0, sw, sw, x + 4, y - 15, 30, 30);
      g.restore();
    }
    g.font = '900 15px "Noto Sans KR", sans-serif';
    g.fillStyle = c.onStage ? "#fff" : "#8a6a60";
    g.fillText(`${CHARS[c.id].name}${c.isPlayer ? " (나)" : ""}`, x + 42, y - 1);
    g.font = '700 12px "Noto Sans KR", sans-serif';
    const rank = elimOrder.indexOf(c.id);
    g.fillStyle = c.onStage ? "#ffd23f" : "#ff5a4a";
    if (!c.onStage) g.fillText(`탈락 · ${cars.length - rank}위`, x + 140, y);
  });
  if (mode === "play" || mode === "end") {
    g.font = '700 14px "Noto Sans KR", sans-serif'; g.textAlign = "right"; g.fillStyle = "rgba(255,255,255,.75)";
    g.fillText(`${playT.toFixed(1)}초`, VW - 132, 32);
  }
  if (mode === "count") {
    const n = Math.ceil(countT - 0.6);
    const label = n >= 1 ? String(n) : "GO!";
    const k = Math.max(0, (countT - 0.6) % 1);
    g.font = `400 ${120 + 40 * k}px "Black Han Sans", sans-serif`;
    g.textAlign = "center"; g.lineWidth = 10; g.strokeStyle = "#2a0d05"; g.fillStyle = "#ffd23f";
    g.strokeText(label, VW / 2, 330); g.fillText(label, VW / 2, 330);
  }
  if (player && !player.onStage && mode === "play") {
    g.font = '900 22px "Noto Sans KR", sans-serif'; g.textAlign = "center";
    g.lineWidth = 6; g.strokeStyle = "#2a0d05"; g.fillStyle = "#ff8a6a";
    const msg = "탈락! 끝까지 보는 중 — Enter 를 누르면 바로 결과";
    g.strokeText(msg, VW / 2, VH - 40); g.fillText(msg, VW / 2, VH - 40);
  }
  if (mode === "play" && player && player.onStage && playT < 6) {
    g.font = '700 15px "Noto Sans KR", sans-serif'; g.textAlign = "center"; g.fillStyle = "rgba(255,255,255,.85)";
    g.fillText("↑ 가속 · ← → 방향 · Shift 드리프트 · 드리프트 끝에 ↑ 다시 = 부스터", VW / 2, VH - 24);
  }
}

/* ============================================================
   화면 (DOM)
   ============================================================ */
const $ = id => document.getElementById(id);
const show = (id, on) => $(id).classList.toggle("hidden", !on);
let selIdx = 0;

function buildSelect() {
  const box = $("cards"); box.innerHTML = "";
  IDS.forEach((id, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "card" + (i === selIdx ? " on" : "");
    b.innerHTML = `<span class="tag">${id}</span>
      <img class="body" src="assets/chars/${id}.png" alt="">
      <span class="name">${CHARS[id].name}</span>
      <span class="say"></span>`;
    b.addEventListener("mouseenter", () => { selIdx = i; markSel(); });
    b.addEventListener("click", () => startGame(id));
    box.appendChild(b);
  });
}
// 선택 화면 말풍선 — 게임 안과 같은 대사를 같은 주기로 돌린다
const selTalk = { line: { A: 0, B: 0, C: 0 }, timer: null };
function talkOnCards() {
  [...$("cards").children].forEach((card, i) => {
    const id = IDS[i], L = CHARS[id].lines, say = card.querySelector(".say");
    setTimeout(() => {               // 카드마다 조금씩 엇갈려 바뀌게
      if (mode !== "select") return;
      say.textContent = L[selTalk.line[id]++ % L.length];
      say.classList.remove("pop"); void say.offsetWidth; say.classList.add("pop");
    }, i * 450);
  });
}
function startCardTalk() {
  clearInterval(selTalk.timer);
  talkOnCards();
  selTalk.timer = setInterval(() => { if (mode === "select") talkOnCards(); }, TALK_EVERY * 1000);
}
function markSel() { [...$("cards").children].forEach((c, i) => c.classList.toggle("on", i === selIdx)); }
function selectKey(e) {
  if (e.code === "ArrowLeft") { selIdx = (selIdx + 2) % 3; markSel(); }
  if (e.code === "ArrowRight") { selIdx = (selIdx + 1) % 3; markSel(); }
  if (e.code === "Enter" || e.code === "Space") startGame(IDS[selIdx]);
}

let winnerCar = null;
function showResult() {
  mode = "result";
  const winner = cars.find(c => c.onStage) || cars.find(c => c.id === elimOrder[elimOrder.length - 1]);
  winnerCar = winner;
  const won = winner === player;
  $("rTag").textContent = won ? "WINNER" : "FAIL";
  $("rTag").classList.toggle("lose", !won);
  const wn = CHARS[winner.id].name;
  $("rName").textContent = won ? `${wn} 우승!` : `우승: ${wn}`;
  const myRank = player.onStage ? 1 : cars.length - elimOrder.indexOf(player.id);
  $("rSub").textContent = `내 순위 ${myRank}위 · ${playT.toFixed(1)}초` + (won ? " · 방향키로 세리머니!" : "");
  show("scResult", true); show("bPause", false);
}
$("bAgain").addEventListener("click", () => startGame(playerId));
function backToSelect() {
  setPaused(false); BGM.pause();
  mode = "select";
  for (const c of cars) scene.remove(c.model.root);
  cars = []; show("scResult", false); show("scSelect", true); show("bPause", false);
}
$("bPick").addEventListener("click", backToSelect);

/* ---------- 일시정지 — 물리만 멈추고 화면은 그대로 둔다 ---------- */
let paused = false;
const canPause = () => mode === "count" || mode === "play" || mode === "end";
function setPaused(on) {
  if (paused === on) return;
  paused = on;
  show("scPause", on);
  for (const k in keys) keys[k] = false;
  if (on) BGM.pause(); else if (soundOn && bgmOk && mode !== "result") BGM.play().catch(() => {});
}
$("bPause").addEventListener("click", () => setPaused(true));
$("bResume").addEventListener("click", () => setPaused(false));
$("bRestart").addEventListener("click", () => { setPaused(false); startGame(playerId); });
$("bQuit").addEventListener("click", backToSelect);

/* ============================================================
   루프 — 물리는 1/120초 고정 걸음
   ============================================================ */
let last = 0, acc = 0;
const STEP = 1 / 120;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
  if (mode !== "select" && !paused) {             // 결과 화면 뒤에서도 계속 돈다 (우승 세리머니)
    acc += dt;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
  }
  if (mode !== "select") {
    syncScene(dt);
    renderer.render(scene, camera);
  }
  drawOverlay();
  requestAnimationFrame(loop);
}

async function boot() {
  const jobs = [loadTex("D", "assets/chars/D.png"), loadTex("D_face", "assets/chars/D_face.png"),
    loadTex("police_L", "assets/chars/police_L.png"), loadTex("police_R", "assets/chars/police_R.png")];
  for (const f of ["A_front", "A_back", "B_front", "B_back", "C_front", "C_back", "driver_front"]) jobs.push(loadTex(f, `assets/riders/${f}.png`));
  for (const id of [...IDS, "D"]) jobs.push(loadRider(id));
  for (const id of IDS) jobs.push(loadCar(id));
  jobs.push(loadDriver());
  await Promise.all(jobs);
  document.getElementById("loading").classList.add("hidden");
  await document.fonts.ready;                // 표지판·전광판 글씨가 기본 글꼴로 구워지지 않게
  resize();
  buildStage();
  placeCamera(1);
  buildSelect();
  startCardTalk();
  requestAnimationFrame(t => { last = t; loop(t); });
}
boot();

// 테스트에서 상태를 들여다보려고 남겨 둔다
window.__game = {
  get cars() { return cars; }, get mode() { return mode; }, startGame,
  get playT() { return playT; }, get elim() { return elimOrder; },
  get causes() { return cars.filter(c => !c.onStage).map(c => c.fallCause); },
  // 측정용: 화면 없이 n 초를 빨리 돌린다
  sim(n) { for (let i = 0; i < n * 120 && mode !== "result"; i++) { update(STEP); if (mode === "end" && endT <= 0) break; } },
  // 측정용: 결과 화면(세리머니)까지 그냥 n 초 돌린다
  run(n) { for (let i = 0; i < n * 120; i++) update(STEP); },
  THREE, scene, camera, makeCarModel, RIDER3D,
};
