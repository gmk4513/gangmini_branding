/* 주인공 + 스쿠터 3D 모델 (Tripo → tools/slim_glb.py).

   스쿠터는 뼈 없는 한 덩어리, 사람은 Mixamo 뼈대가 붙은 채 A 자로 서 있다.
   스쿠터 모양에서 안장 위·핸들 손잡이·발판 자리를 찾아, 사람을 앉히고
   팔·다리는 두 마디 IK 로 손은 손잡이에, 발은 발판에 정확히 놓는다 (범퍼카 2026 의 aimBone 방식 + IK).

   좌표: 묶음(holder)의 앞이 -z (게임에서 heading 0 = 북쪽 = -z). */
import * as THREE from "../vendor/three.module.min.js";
import { GLTFLoader } from "../vendor/addons/loaders/GLTFLoader.js";

const SCOOTER_LEN = 1.22;      // 스쿠터 앞뒤 길이 (m)
const RIDER_H = 1.74;          // 서 있을 때 키 (m)

const CURL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.2);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
/* bone 에서 tip 쪽을 가리키는 방향이 dir(월드)이 되게 돌린다 */
function aimBone(bone, tip, dir) {
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(_a); tip.getWorldPosition(_b);
  const cur = _b.sub(_a).normalize();
  const want = _c.copy(dir).normalize();
  _q.setFromUnitVectors(cur, want);
  bone.getWorldQuaternion(_q2);
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(_q.multiply(_q2)));
  bone.updateWorldMatrix(false, true);
}
const wp = (o) => o.getWorldPosition(new THREE.Vector3());
/* 두 마디 IK: root→mid→end 의 끝이 target(월드)에 닿게. pole 쪽으로 관절이 굽는다 */
function ik2(root, mid, end, target, pole) {
  root.updateWorldMatrix(true, true);
  const S = wp(root), M = wp(mid), E0 = wp(end);
  const a = S.distanceTo(M), b = M.distanceTo(E0);
  const toT = target.clone().sub(S);
  const d = Math.min(toT.length(), a + b - 1e-3);
  const dir = toT.normalize();
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
  const elbow = S.clone().add(dir.clone().multiplyScalar(a * cosA)).add(p.multiplyScalar(a * Math.sqrt(1 - cosA * cosA)));
  aimBone(root, mid, elbow.clone().sub(S));
  aimBone(mid, end, target.clone().sub(wp(mid)));
}

/* 옆구리 살 부풀리기 (사용자 요청 — 둥그런 체형). 몸통 뼈(골반~가슴)에 붙은 살 중
   옆쪽만, 배꼽~갈비뼈 높이를 가장 많이 바깥(x)으로 민다. 앉히기 전 쉬는 자세에서 한다 */
const FLANK = 0.2;          // 가장 많이 나오는 곳에서 몸 폭의 20% 더
function bulgeFlanks(mesh, amt) {
  const sk = mesh.skeleton, g = mesh.geometry;
  const at = n => { const i = sk.bones.findIndex(b => b.name.replace(/^mixamorig:?/, "") === n); return i < 0 ? null : new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i].clone().invert()); };
  const hip = at("Hips"), arm = at("LeftArm") || at("RightArm");
  if (!hip || !arm) return;
  const torso = new Set(["Hips", "Spine", "Spine1", "Spine2"].map(n => sk.bones.findIndex(b => b.name.replace(/^mixamorig:?/, "") === n)));
  const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const span = arm.y - hip.y, c = hip.y + span * 0.42, sig = span * 0.32, hw = Math.abs(arm.x - hip.x);
  for (let i = 0; i < pos.count; i++) {
    // 가장 무겁게 붙은 뼈가 몸통일 때만
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    if (!torso.has(best)) continue;
    const y = pos.getY(i), dx = pos.getX(i) - hip.x;
    const bell = Math.exp(-((y - c) ** 2) / (2 * sig * sig));
    const side = Math.min(1, Math.abs(dx) / hw) ** 2;
    pos.setX(i, hip.x + dx * (1 + amt * bell * side));
  }
  pos.needsUpdate = true;
  g.computeBoundingBox(); g.computeBoundingSphere();
}

function toonize(o, ramp) {
  o.traverse(m => {
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = false;
    m.frustumCulled = false;
    const old = m.material;
    if (old.map) old.map.colorSpace = THREE.SRGBColorSpace;
    // 사진 같은 질감이라 셀 셰이딩 대신 부드러운 램버트 — 동네의 보랏빛 그늘은 반구광이 그대로 입힌다
    m.material = new THREE.MeshLambertMaterial({ map: old.map, color: old.map ? 0xffffff : old.color, side: m.isSkinnedMesh ? THREE.FrontSide : THREE.DoubleSide });
    // 사람은 그늘에서도 얼굴이 어둡게 죽지 않게 텍스처를 살짝 스스로 빛나게 (Tripo 미리보기 밝기에 가깝게)
    // 사람은 조명에 덜 물들게: 빛 받는 몫은 줄이고 텍스처 원래 색을 스스로 내게 한다.
    // 동네의 보랏빛 그늘·강한 해에 얼굴색이 어둡고 붉게 변해 Tripo 모델과 달라 보였다 (2026-10-26)
    if (m.isSkinnedMesh && old.map) {
      m.material.color = new THREE.Color("#4a4a4a");
      m.material.emissiveMap = old.map; m.material.emissive = new THREE.Color("#d8d8d8");
    }
  });
}

/* 스쿠터 모양 읽기: 앞뒤 축·앞쪽 방향·안장·손잡이·발판 */
function measureScooter(src) {
  src.updateWorldMatrix(true, true);
  const pts = [];
  src.traverse(m => {
    if (!m.isMesh) return;
    const p = m.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); pts.push(v.clone()); }
  });
  const box = new THREE.Box3().setFromPoints(pts), size = box.getSize(new THREE.Vector3());
  return { pts, box, size };
}

export async function loadRiderRig() {
  const loader = new GLTFLoader();
  const [sg, rg] = await Promise.all([loader.loadAsync("assets/models/scooter.glb"), loader.loadAsync("assets/models/rider.glb")]);
  const holder = new THREE.Group();

  /* --- 스쿠터: 길이 맞추고, 바닥 0, 앞을 -z 로 --- */
  const scooter = sg.scene;
  toonize(scooter);
  let m = measureScooter(scooter);
  const longX = m.size.x > m.size.z;
  const spin = new THREE.Group(); spin.add(scooter);
  if (longX) spin.rotation.y = Math.PI / 2;
  m = measureScooter(spin);
  const k = SCOOTER_LEN / m.size.z;
  spin.scale.setScalar(k);
  m = measureScooter(spin);
  // 핸들(가장 높은 곳)이 있는 쪽이 앞 — 앞이 +z 면 뒤집는다
  const topY = m.box.max.y;
  const high = m.pts.filter(p => p.y > topY - m.size.y * 0.12);
  const frontZ = high.reduce((s, p) => s + p.z, 0) / high.length;
  const cz = (m.box.min.z + m.box.max.z) / 2;
  if (frontZ > cz) spin.rotation.y += Math.PI;
  m = measureScooter(spin);
  spin.position.set(-(m.box.min.x + m.box.max.x) / 2, -m.box.min.y, -(m.box.min.z + m.box.max.z) / 2);
  m = measureScooter(spin);
  holder.add(spin);
  const pts = m.pts, H = m.size.y, Lz = m.size.z;
  // 안장: 뒤쪽 절반에서 가장 높은 면
  const rear = pts.filter(p => p.z > 0.05);
  const seatTop = Math.max(...rear.map(p => p.y));
  const seatPts = rear.filter(p => p.y > seatTop - 0.025);
  const seat = new THREE.Vector3(0, seatTop, seatPts.reduce((s, p) => s + p.z, 0) / seatPts.length);
  // 손잡이: 맨 위 띠의 좌우 끝
  const bar = pts.filter(p => p.y > topY - 0.07 && p.z < 0);
  const gx = Math.max(...bar.map(p => Math.abs(p.x)));
  const gripPts = bar.filter(p => Math.abs(p.x) > gx - 0.07);
  const grip = new THREE.Vector3(gx - 0.05, gripPts.reduce((s, p) => s + p.y, 0) / gripPts.length, gripPts.reduce((s, p) => s + p.z, 0) / gripPts.length);
  // 발판: 바퀴 축 높이쯤, 안장 앞쪽 아래 (사진처럼 무릎을 높이 세운 자세)
  const foot = new THREE.Vector3(0.2, 0.22, seat.z - 0.18);

  /* --- 사람: 키 맞추고 안장에 앉힌다 --- */
  const rider = rg.scene;
  toonize(rider);
  const bones = {};
  rider.traverse(o => { if (/^mixamorig/.test(o.name)) bones[o.name.replace(/^mixamorig:?/, "")] = o; });
  rider.traverse(o => { if (o.isSkinnedMesh) bulgeFlanks(o, FLANK); });
  let restH = 1;
  rider.traverse(o => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; restH = b.max.y - b.min.y; } });
  const body = new THREE.Group();        // 사람만 따로 기울이고 흔들 수 있게
  body.add(rider);
  holder.add(body);
  rider.scale.setScalar(RIDER_H / restH);
  rider.rotation.y = Math.PI;            // 모델 앞(+z) → 묶음 앞(-z)
  rider.updateWorldMatrix(true, true);
  // 엉덩이 관절이 안장 위 9cm 에 오게
  const hip0 = wp(bones.Hips);
  rider.position.set(-hip0.x, seat.y + 0.09 - hip0.y, seat.z + 0.02 - hip0.z);
  holder.updateWorldMatrix(true, true);

  const L = (x, y, z) => new THREE.Vector3(x, y, z);
  // 상체를 살짝 앞으로, 고개는 앞을 본다
  aimBone(bones.Spine, bones.Spine1, L(0, 1, -0.12));
  // 목·머리는 건드리지 않는다 — 꺾으면 턱이 목 쪽으로 늘어나 얼굴이 Tripo 모델과 달라진다 (2026-10-24)
  // 다리: 무릎은 앞·밖으로, 발은 발판에
  // 모델이 뒤로 돌아 있어 왼쪽(Left) 뼈가 묶음의 +x 쪽이다
  const side = (n) => (wp(bones[n]).x > 0 ? 1 : -1);
  for (const s of ["Left", "Right"]) {
    const sx = side(s + "UpLeg");
    ik2(bones[s + "UpLeg"], bones[s + "Leg"], bones[s + "Foot"], L(sx * foot.x, foot.y + 0.08, foot.z), L(sx * 0.35, 0.3, -1));
    if (bones[s + "ToeBase"]) aimBone(bones[s + "Foot"], bones[s + "ToeBase"], L(sx * 0.15, -0.35, -1));
  }
  // 팔: 팔꿈치는 아래·밖으로, 손은 손잡이에
  for (const s of ["Left", "Right"]) {
    const sx = side(s + "Arm");
    // 팔꿈치는 옆이 아니라 아래·뒤로 붙인다 — 옆으로 벌리면 소매가 들려 어깨가 떡 벌어져 보인다
    ik2(bones[s + "Arm"], bones[s + "ForeArm"], bones[s + "Hand"], L(sx * grip.x, grip.y + 0.03, grip.z + 0.03), L(sx * 0.12, -1, 0.55));
    if (bones[s + "HandMiddle1"]) aimBone(bones[s + "Hand"], bones[s + "HandMiddle1"], L(sx * 0.25, -0.3, -1));
  }
  // 앉은 자세를 저장 — 브이 하고 나서도 되돌릴 수 있게
  const rest = {};
  for (const [n, b] of Object.entries(bones)) rest[n] = b.quaternion.clone();

  const headTop = wp(bones.Head).y + 0.3;

  /* 도착 브이: 두 팔을 들고 검지·중지만 편다 */
  function victory(t) {
    holder.updateWorldMatrix(true, true);
    const q = holder.getWorldQuaternion(new THREE.Quaternion());
    const W = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(q);
    for (const s of ["Left", "Right"]) {
      const sx = (() => { const v = wp(bones[s + "Arm"]).sub(wp(bones.Spine2)); v.applyQuaternion(q.clone().invert()); return v.x > 0 ? 1 : -1; })();
      // 위팔은 옆·앞으로 살짝 들고, 팔꿈치를 굽혀 손을 얼굴 옆으로 (팔을 번쩍 들면 티셔츠가 늘어난다)
      aimBone(bones[s + "Arm"], bones[s + "ForeArm"], W(sx * 0.42, -0.78, -0.42));
      // 두 손을 서로 반대로 (바깥↔안쪽) 빠르게 흔든다
      aimBone(bones[s + "ForeArm"], bones[s + "Hand"], W(sx * (0.05 + Math.sin(t * 22) * 0.5), 1, -0.45));
      aimBone(bones[s + "Hand"], bones[s + "HandMiddle1"] || bones[s + "Hand"].children[0], W(sx * 0.05, 1, -0.2));
      // 약지·새끼·엄지는 접는다
      for (const f of ["Ring", "Pinky", "Thumb"]) for (let i = 1; i <= 3; i++) {
        const n = `${s}Hand${f}${i}`, b = bones[n];
        if (b && rest[n]) b.quaternion.copy(rest[n]).multiply(CURL);
      }
    }
    placeVHands();
  }
  /* 브이 손 — Tripo 손은 손가락이 붙은 한 덩어리라 손가락 뼈를 굽혀도 V 가 안 된다.
     브이 할 때만 원래 손을 접어 숨기고(손 뼈 크기 0), 코드로 만든 살색 손(검지·중지만 편)을 손목에 붙인다 */
  const skinMat = new THREE.MeshLambertMaterial({ color: "#e9b895" });
  function makeVHand(mirror) {
    const g = new THREE.Group();
    const cap = (r, len, x, y, z, rz = 0, rx = 0) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), skinMat);
      m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; g.add(m); return m;
    };
    // 손바닥 (손목에서 위로 0.09)
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.09, 0.035), skinMat);
    palm.position.set(0, 0.05, 0); palm.castShadow = true; g.add(palm);
    for (const m of [palm]) { m.geometry = new THREE.CapsuleGeometry(0.035, 0.03, 4, 10); m.scale.set(1.25, 1.15, 0.55); }
    const k = mirror ? -1 : 1;
    // 검지·중지: 위로 펴서 V 로 벌린다
    cap(0.011, 0.075, k * -0.018, 0.14, 0, k * 0.2);
    cap(0.0115, 0.08, k * 0.012, 0.145, 0, k * -0.2);
    // 약지·새끼: 손바닥 앞으로 접힌 마디
    cap(0.011, 0.02, k * 0.03, 0.095, -0.022, 0, Math.PI / 2);
    cap(0.010, 0.016, k * 0.045, 0.085, -0.02, 0, Math.PI / 2);
    // 엄지: 접힌 손가락 위로 가로질러
    cap(0.012, 0.035, k * 0.012, 0.07, -0.03, k * 1.2);
    g.visible = false;
    holder.add(g);
    return g;
  }
  const vHands = { Left: makeVHand(false), Right: makeVHand(true) };
  const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
  function placeVHands() {
    holder.updateWorldMatrix(true, true);
    for (const s of ["Left", "Right"]) {
      const hand = bones[s + "Hand"], fore = bones[s + "ForeArm"];
      hand.scale.setScalar(0.001); hand.updateWorldMatrix(false, true);
      const w = holder.worldToLocal(wp(hand)), f = holder.worldToLocal(wp(fore));
      _y.copy(w).sub(f).normalize();                                 // 손가락 = 팔 뻗은 쪽
      _z.set(0, 0, 1).sub(_y.clone().multiplyScalar(_y.z)).normalize(); // 손바닥은 앞(카메라 쪽)을 본다
      _x.crossVectors(_y, _z);
      _m.makeBasis(_x, _y, _z);
      const g = vHands[s];
      g.position.copy(w); g.quaternion.setFromRotationMatrix(_m); g.scale.setScalar(1.3);   // 원래 손보다 조금 크게 — 브이가 잘 보이게
      g.visible = true;
    }
  }
  function seated() {
    for (const [n, b] of Object.entries(bones)) b.quaternion.copy(rest[n]);
    for (const s of ["Left", "Right"]) { bones[s + "Hand"].scale.setScalar(1); vHands[s].visible = false; }
  }

  return { holder, body, bones, seat, grip, headTop, victory, seated, scooter: spin, rider };
}
