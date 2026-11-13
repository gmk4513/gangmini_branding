// 캐릭터 3D 모델 + 동작.
// 다섯 명 모두 Tripo 에서 같은 Mixamo 뼈대로 리깅했다. 그래서 동작은 라프산두에게 입혀 받은
// anims_src.glb 한 파일의 동작(39개)을 모두가 같이 쓴다 (뼈 이름이 같으면 그대로 붙는다).
import * as THREE from "three";
import { clone as skClone } from "three/addons/utils/SkeletonUtils.js";
import { loadGLB, ASSET_V, A } from "./assets.js?v=20261113155403";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { retargetClip } from "./retarget.js?v=20261113155403";

// Mixamo 에서 받은 동작 (뼈대만 있는 FBX) → 라프산두 뼈대로 옮겨서 다른 동작과 똑같이 쓴다
const MIXAMO = {
  crouch_idle: "assets/chars/mixamo/crouch_idle.fbx",   // 쭈그려 앉기 (C)
  crouch_walk: "assets/chars/mixamo/crouch_walk.fbx",   // 앉아서 걷기 (C + 이동, 제자리 버전)
  smoke: "assets/chars/mixamo/smoking.fbx",             // 담배 피우기 (다 잡은 뒤 세레모니, 2026-11-13 사용자가 고름)
  // rapping.fbx(마이크 들고 랩)는 세레모니를 바꾸면서 안 불러온다. 다시 쓰려면 rap: "assets/chars/mixamo/rapping.fbx"
};

const FILES = {
  rapsandu: "assets/chars/anims_src.glb",   // 라프산두 모델 + 동작
  jeffrey: "assets/chars/jeffrey.glb",
  mason: "assets/chars/mason.glb",
  clone: "assets/chars/mason.glb",         // 풀업보이 = 메이슨홈과 똑같이 생겼다
  kid: "assets/chars/kidmilli.glb",
  matthew: "assets/chars/matthew.glb",
};
// 게임 속 키(m). 건물(칸 1.5m · 층 3.4m)에 비해 작아 보여서 실제보다 12% 크게
export const SIZE = 1.12;
const HEIGHT = { rapsandu: 1.75, jeffrey: 1.8, mason: 1.76, clone: 1.76, kid: 1.74, matthew: 1.73 };
for (const k in HEIGHT) HEIGHT[k] *= SIZE;
const ONCE = new Set(["fall", "wave_goodbye_01", "scared_01", "jump"]);   // 한 번만 하고 멈추는 동작

const gltfs = {};
let clips = null;
let capInfo = null;

export async function loadCharacters() {
  const files = [...new Set(Object.values(FILES))];
  // Mixamo 동작(FBX)도 모델과 동시에 받기 시작한다 (옮겨 붙이기는 모델이 온 뒤에)
  const fbx = new FBXLoader();
  const fbxs = Object.entries(MIXAMO).map(([name, url]) => [name, fbx.loadAsync(A(url) + ASSET_V).catch((e) => { console.warn("[chars] Mixamo 동작 못 읽음", name, e); return null; })]);
  await Promise.all(files.map(async (f) => { gltfs[f] = await loadGLB(f + ASSET_V); }));
  const src = gltfs[FILES.rapsandu];
  let hips = null;
  src.scene.traverse((o) => { if (!hips && /Hips$/.test(o.name)) hips = o; });
  clips = {};
  for (const c of src.animations) clips[c.name] = fixClip(c, hips ? hips.position : null);
  for (const [name, p] of fbxs) {
    const f = await p;
    if (!f) continue;
    try { clips[name] = fixClip(retargetClip(f, f.animations[0], src.scene, name), hips ? hips.position : null); }
    catch (e) { console.warn("[chars] Mixamo 동작 못 옮김", name, e); }
  }
  // 점프: Tripo 프리셋은 제자리에서 여러 번 깡충거린다 → 첫 번째 뜀(0~0.46초)만 쓴다
  if (clips.jump) clips.jump = THREE.AnimationUtils.subclip(clips.jump, "jump", 0, 11, 24);
  // 2026-11-12 세 번째 모델(챙이 캐릭터 왼쪽을 향한 4면도)은 모자가 그림대로라 손질하지 않는다.
  // (trimBrim: 챙이 둥글게 퍼진 모델용, fixCap: 첫 모델용 — 지금은 안 씀)
  return Object.keys(clips);
}

// Tripo '제자리' 동작인데도 엉덩이(Hips)가 앞뒤 · 옆으로 밀려 있는 동작이 있다(달리기는 약 44cm 앞).
// 그러면 몸이 실제 자리보다 앞에 그려져서 벽을 뚫는 것처럼 보이고, 방향을 틀 때 휙 순간이동처럼 보인다.
// 엉덩이의 앞뒤 · 옆 위치는 기본 자세 그대로 두고, 높이(위아래 흔들림)만 남긴다.
// 점프는 높이도 기본으로 (게임이 몸을 직접 띄우므로, 동작까지 뜨면 두 배로 뜬다)
function fixClip(clip, rest) {
  if (!rest) return clip;
  for (const t of clip.tracks) {
    if (!/Hips\.position$/.test(t.name)) continue;
    const v = t.values;
    for (let i = 0; i < v.length; i += 3) {
      v[i] = rest.x; v[i + 2] = rest.z;
      if (clip.name === "jump") v[i + 1] = rest.y;
    }
  }
  return clip;
}

export const charactersReady = () => !!clips;

// 실제 키를 재서 맞춘다 (파일마다 단위가 달라서 가정하지 않는다)
function measure(g) {
  if (g.userData.height) return;
  g.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g.scene, true);
  g.userData.height = box.max.y - box.min.y;
  g.userData.footY = box.min.y;
}

// ---------------- 라프산두 챙 다듬기 ----------------
// 머리 뼈 둘레에서 정수리(반지름 약 6cm)보다 바깥으로 나온 검은 부분 = 챙.
// 그중 바로 뒤(모델 -z 쪽, ±BACK 각도)만 남기고 나머지(옆 · 앞 · 대각선)는 지운다.
function trimBrim(g, BACK = 32) {
  g.scene.updateMatrixWorld(true);
  let sm = null;
  g.scene.traverse((o) => { if (o.isSkinnedMesh && !sm) sm = o; });
  const head = sm && sm.skeleton.bones.find((b) => /Head$/.test(b.name));
  const tex = sm && sm.material.map && sm.material.map.image;
  if (!head || !tex) return null;
  const cv = document.createElement("canvas");
  cv.width = tex.width; cv.height = tex.height;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(tex, 0, 0);
  const px = cx.getImageData(0, 0, cv.width, cv.height).data;
  const geo = sm.geometry, pos = geo.attributes.position, uv = geo.attributes.uv;
  const P = [];
  let top = -1e9;
  for (let i = 0; i < pos.count; i++) { const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(sm.matrixWorld); P.push(p); top = Math.max(top, p.y); }
  const hp = head.getWorldPosition(new THREE.Vector3());
  // 정수리 반지름: 머리 높이 55~85% 의 검은 부분 중 가장 먼 곳
  const dark = (i) => {
    const x = Math.min(cv.width - 1, Math.floor(uv.getX(i) * cv.width)), y = Math.min(cv.height - 1, Math.floor(uv.getY(i) * cv.height));
    const k = (y * cv.width + x) * 4;
    return 0.3 * px[k] + 0.59 * px[k + 1] + 0.11 * px[k + 2] < 70;
  };
  const rel = (p) => (p.y - hp.y) / (top - hp.y);
  let crown = 0;
  for (let i = 0; i < pos.count; i++) { const h = rel(P[i]); if (h > 0.55 && h < 0.85 && dark(i)) crown = Math.max(crown, Math.hypot(P[i].x - hp.x, P[i].z - hp.z)); }
  const cut = new Uint8Array(pos.count);
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    const p = P[i], h = rel(p);
    if (h < 0.12 || h > 0.55 || !dark(i)) continue;
    const dx = p.x - hp.x, dz = p.z - hp.z;
    if (Math.hypot(dx, dz) < crown * 1.08) continue;
    const ang = Math.abs(Math.atan2(dx, dz)) * 180 / Math.PI;    // 0 = 앞(+z), 180 = 뒤
    if (ang > 180 - BACK) continue;                              // 바로 뒤 챙은 남김
    cut[i] = 1; n++;
  }
  const idx = geo.index.array, keep = [];
  for (let t = 0; t < idx.length; t += 3) if (cut[idx[t]] + cut[idx[t + 1]] + cut[idx[t + 2]] < 1) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  const removed = (idx.length - keep.length) / 3;
  geo.setIndex(keep);
  return { crown: +crown.toFixed(3), verts: n, tris: removed };
}

// ---------------- 라프산두 모자 ----------------
// Tripo 모델의 모자는 수건 위에 떠 있고 챙이 납작한 네모판이다.
// 머리 위쪽의 검은 부분(모자)만 지우고, 수건 위에 꼭 맞는 둥근 모자(뒤로 쓴)를 머리 뼈에 붙인다.
function fixCap(g) {
  measure(g);
  g.scene.updateMatrixWorld(true);
  let sm = null;
  g.scene.traverse((o) => { if (o.isSkinnedMesh && !sm) sm = o; });
  const head = sm && sm.skeleton.bones.find((b) => /Head$/.test(b.name));
  const tex = sm && sm.material.map && sm.material.map.image;
  if (!head || !tex) return null;
  // 텍스처 픽셀 읽기
  const cv = document.createElement("canvas");
  cv.width = tex.width; cv.height = tex.height;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(tex, 0, 0);
  const px = cx.getImageData(0, 0, cv.width, cv.height).data;
  const geo = sm.geometry, pos = geo.attributes.position, uv = geo.attributes.uv;
  const M = sm.matrixWorld;
  const P = new Array(pos.count);
  let top = -1e9;
  for (let i = 0; i < pos.count; i++) {
    P[i] = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(M);
    if (P[i].y > top) top = P[i].y;
  }
  const hp = head.getWorldPosition(new THREE.Vector3());
  const H = g.userData.height;                 // 모델 단위의 키 (거리 기준을 여기에 맞춘다)
  // 머리 높이의 40% 위 검은 부분 = 모자 (얼굴 · 눈썹은 그 아래). 뒤로 튀어나온 옛 챙은 25%까지
  const rel = (y) => (y - hp.y) / (top - hp.y);
  const dark = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const h = rel(P[i].y);
    if (h < 0.25 || (h < 0.4 && P[i].z - hp.z > -0.03 * H)) continue;
    const u = uv.getX(i), v = uv.getY(i);
    const x = Math.min(cv.width - 1, Math.max(0, Math.floor(u * cv.width)));
    const y = Math.min(cv.height - 1, Math.max(0, Math.floor(v * cv.height)));
    const k = (y * cv.width + x) * 4;
    const l = 0.3 * px[k] + 0.59 * px[k + 1] + 0.11 * px[k + 2];
    if (l < 70) dark[i] = 1;
  }
  const idx = geo.index.array, keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const n = dark[idx[t]] + dark[idx[t + 1]] + dark[idx[t + 2]];
    if (n < 2) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  // 모자를 지운 뒤 남은 수건의 꼭대기 · 폭
  const used = new Uint8Array(pos.count);
  for (const i of keep) used[i] = 1;
  const R = 0.1 * H;
  let ttop = -1e9;
  for (let i = 0; i < pos.count; i++) if (used[i] && Math.hypot(P[i].x - hp.x, P[i].z - hp.z) < R && P[i].y > ttop) ttop = P[i].y;
  const band = ttop - 0.035 * H;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < pos.count; i++) {
    if (!used[i] || P[i].y < band || P[i].y > ttop || Math.hypot(P[i].x - hp.x, P[i].z - hp.z) > R) continue;
    minX = Math.min(minX, P[i].x); maxX = Math.max(maxX, P[i].x); minZ = Math.min(minZ, P[i].z); maxZ = Math.max(maxZ, P[i].z);
  }
  geo.setIndex(keep);
  const r = Math.max(maxX - minX, maxZ - minZ) / 2 * 0.98;
  const center = new THREE.Vector3((minX + maxX) / 2, ttop - r * 0.5, (minZ + maxZ) / 2);
  return { center, r, removed: (idx.length - keep.length) / 3 };
}

const capMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 });
const logoMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 });
function makeCapMesh(r) {
  const cap = new THREE.Group();
  // 정수리: 살짝 눌린 반구
  const crown = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
  crown.scale.set(1, 0.68, 1.06);
  // 챙: 둥근 반달 모양, 양옆이 아래로 살짝 휘게 (+z 쪽으로 뻗는다)
  const shape = new THREE.Shape();
  const N = 24, out = 1.5;
  for (let i = 0; i <= N; i++) {
    const a = Math.PI * i / N;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * out;
    if (i === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
  }
  for (let i = N; i >= 0; i--) {
    const a = Math.PI * i / N;
    shape.lineTo(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.62);
  }
  const bg = new THREE.ExtrudeGeometry(shape, { depth: r * 0.06, bevelEnabled: true, bevelThickness: r * 0.02, bevelSize: r * 0.02, bevelSegments: 2, curveSegments: 4 });
  bg.rotateX(Math.PI / 2);        // 모양의 y → +z (앞쪽으로 뻗음)
  const p = bg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setY(i, p.getY(i) - (x * x) / (r * r) * r * 0.32);   // 양옆이 아래로 둥글게
  }
  bg.computeVertexNormals();
  const brim = new THREE.Mesh(bg, capMat);
  brim.position.y = r * 0.06;
  brim.rotation.x = 0.08;         // 챙은 거의 수평, 끝이 살짝 아래로
  // 꼭지 단추
  const button = new THREE.Mesh(new THREE.SphereGeometry(r * 0.09, 10, 6), capMat);
  button.position.y = r * 0.68;
  // 챙 반대편(이마 쪽) 작은 로고
  const logo = new THREE.Mesh(new THREE.BoxGeometry(r * 0.35, r * 0.12, r * 0.02), logoMat);
  logo.position.set(0, r * 0.3, -r * 1.0);
  logo.rotation.x = 0.35;
  cap.add(crown, brim, button, logo);
  return cap;
}

// ---------------- 1인칭 팔 ----------------
// 라프산두 모델에서 오른팔 뼈에 붙은 삼각형만 남긴다 (소매 · 손 텍스처 그대로).
// 반환: { obj(어깨가 원점), dir(어깨→손 방향), rest/reach(카메라 기준 자세) }
export function makeArm(minW = 0.85) {
  const g = gltfs[FILES.rapsandu];
  if (!g) return null;
  measure(g);
  const obj = skClone(g.scene);
  const fit = new THREE.Group();
  fit.add(obj);
  fit.scale.setScalar(1.75 / g.userData.height);   // 화면 기준 크기라 키 키우기와 상관없이
  let sm = null;
  obj.traverse((o) => { if (o.isSkinnedMesh && !sm) sm = o; else if (o.isMesh) o.visible = false; });
  if (!sm) return null;
  const arm = new Set();
  sm.skeleton.bones.forEach((b, i) => { if (/Right(Arm|ForeArm|Hand)/.test(b.name)) arm.add(i); });
  const geo = sm.geometry.clone();
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const w = new Float32Array(si.count);
  const gi = [si.getX.bind(si), si.getY.bind(si), si.getZ.bind(si), si.getW.bind(si)];
  const gw = [sw.getX.bind(sw), sw.getY.bind(sw), sw.getZ.bind(sw), sw.getW.bind(sw)];
  for (let v = 0; v < si.count; v++) {
    let t = 0;
    for (let c = 0; c < 4; c++) if (arm.has(gi[c](v))) t += gw[c](v);
    w[v] = t;
  }
  const src = geo.index ? geo.index.array : null;
  const nTri = (src ? src.length : si.count) / 3;
  const keep = [];
  for (let t = 0; t < nTri; t++) {
    const a = src ? src[3 * t] : 3 * t, b = src ? src[3 * t + 1] : 3 * t + 1, c = src ? src[3 * t + 2] : 3 * t + 2;
    if (w[a] > minW && w[b] > minW && w[c] > minW) keep.push(a, b, c);   // 몸통에 걸친 옷자락은 뺀다
  }
  geo.setIndex(keep);
  sm.geometry = geo;
  sm.frustumCulled = false;
  sm.material = sm.material.clone();
  sm.material.depthTest = false;     // 벽에 붙어도 팔이 벽 속으로 묻히지 않게 항상 맨 앞에
  sm.renderOrder = 999;
  fit.updateMatrixWorld(true);
  const bone = (re) => sm.skeleton.bones.find((b) => re.test(b.name));
  const sh = bone(/RightArm$/).getWorldPosition(new THREE.Vector3());
  const hd = bone(/RightHand$/).getWorldPosition(new THREE.Vector3());
  fit.position.copy(sh).negate();
  const pivot = new THREE.Group();
  pivot.add(fit);
  pivot.visible = false;
  return {
    obj: pivot,
    dir: hd.clone().sub(sh).normalize(),
    len: hd.distanceTo(sh),
    rest: { pos: new THREE.Vector3(0.3, -0.42, 0.12), dir: new THREE.Vector3(-0.12, -0.12, -1).normalize(), roll: Math.PI },
    reach: { pos: new THREE.Vector3(0.26, -0.34, -0.05), dir: new THREE.Vector3(-0.2, 0.12, -1).normalize(), roll: Math.PI },
  };
}

// ---------------- 캐릭터 ----------------
// 매튜 귀 쪽 손가락 굽힘 (콘솔에서 바꿔 보며 맞춤)
export const CURL = { ear: 0.45, sign: 1 };
export const EAR = { side: 0.07, up: 0.012, fw: 0.025 };   // 귀 쪽 손 위치 (머리 뼈 기준, 키에 대한 비율)
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
// 뼈(bone)가 자식 뼈(child) 쪽을 가리키는 방향을 월드 방향 dir 로 w 만큼 돌린다 (동작 위에 덧씌우기)
function aimBone(bone, child, dir, w) {
  bone.getWorldPosition(_v1); child.getWorldPosition(_v2);
  const cur = _v2.sub(_v1).normalize();
  const delta = _q1.setFromUnitVectors(cur, dir);
  const world = bone.getWorldQuaternion(_q2);
  const want = delta.multiply(world);                  // 새 월드 회전
  const parent = bone.parent.getWorldQuaternion(_q3).invert();
  const local = parent.multiply(want);
  bone.quaternion.slerp(local, w);
  bone.updateMatrixWorld(true);
}
// 뼈를 월드 축(axis) 둘레로 angle 만큼 더 돌리기 (허리 숙이기 등)
function bendBone(bone, axis, angle) {
  const world = bone.getWorldQuaternion(_q2);
  const want = _q1.setFromAxisAngle(axis, angle).multiply(world);
  const parent = bone.parent.getWorldQuaternion(_q3).invert();
  bone.quaternion.copy(parent.multiply(want));
  bone.updateMatrixWorld(true);
}
const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _p3 = new THREE.Vector3(), _fw = new THREE.Vector3(), _rt = new THREE.Vector3(), _lt = new THREE.Vector3(), _ax = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _hq = new THREE.Quaternion();

export const MIC = { curl: 1.0, sign: 1, along: 0.7, mouthUp: 0.015, mouthFw: 0.06, gap: 0.05 };
// 두 마디 팔 IK (모듈 공용): 손목을 hand 에 놓고, 팔꿈치는 pole 쪽으로 굽힌다
function ikArm(A, F, Hd, pole, hand, w) {
  const S = A.getWorldPosition(new THREE.Vector3());
  const E0 = F.getWorldPosition(new THREE.Vector3()), W0 = Hd.getWorldPosition(new THREE.Vector3());
  const a = S.distanceTo(E0), b = E0.distanceTo(W0);
  const toT = hand.clone().sub(S);
  const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, toT.length()));
  toT.normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const side = pole.clone().addScaledVector(toT, -pole.dot(toT)).normalize();
  const elbow = S.clone().addScaledVector(toT, a * cosA).addScaledVector(side, a * sinA);
  aimBone(A, F, elbow.sub(S).normalize(), w);
  const e = F.getWorldPosition(new THREE.Vector3());
  aimBone(F, Hd, hand.clone().sub(e).normalize(), w);
}
// 담배 (작게). 원점 = 손가락 사이에 끼운 곳, +y = 불붙은 쪽
export const CIG = { flip: false, at: 0.35, scale: 1.6 };   // 1.6배 (원래 크기는 잘 안 보였다)
function makeCig() {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.06, 8), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.8 }));
  paper.position.y = 0.012;
  const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.0044, 0.0044, 0.022, 8), new THREE.MeshStandardMaterial({ color: 0xd08a3c, roughness: 0.7 }));
  filter.position.y = -0.029;
  const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.0043, 0.0043, 0.005, 8), new THREE.MeshBasicMaterial({ color: 0xff5a1a }));
  ember.position.y = 0.0445;
  g.add(paper, filter, ember);
  g.scale.setScalar(CIG.scale);
  g.visible = false;
  return g;
}

// 핸드마이크 (손잡이 검정 + 철망 머리). 원점 = 쥐는 곳, +y = 머리 쪽
function makeMic() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.45, metalness: 0.3 });
  const mesh = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.35, metalness: 0.9 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.013, 0.17, 12), black);
  handle.position.y = -0.02;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.025, 14), mesh);
  ring.position.y = 0.075;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), mesh);
  head.position.y = 0.11;
  g.add(handle, ring, head);
  g.visible = false;
  return g;
}

// 캐릭터 하나 만들기: { obj, play(name, speed, fade, restart), update(dt), reach(w, dir) }
export function makeModel(kind) {
  const g = gltfs[FILES[kind]];
  if (!g || !clips) return null;
  const obj = skClone(g.scene);
  // 화면 밖이면 안 그린다. 뼈가 움직여도 넉넉하게 들어가도록 경계 구를 키워 둔다
  obj.updateMatrixWorld(true);
  let sm = null;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = false;
    if (o.isSkinnedMesh) { sm = sm || o; o.computeBoundingSphere(); o.boundingSphere.radius *= 1.6; }
  });
  const bones = {};
  // 손가락: {Left: [[1,2,3마디], ...검지 · 중지 · 약지 · 새끼], Right: ...}
  const fingers = { Left: [], Right: [] };
  if (sm) for (const side of ["Left", "Right"]) for (const f of ["Index", "Middle", "Ring", "Pinky"]) {
    const js = [1, 2, 3].map((n) => sm.skeleton.bones.find((b) => b.name.endsWith(side + "Hand" + f + n)));
    if (js.every(Boolean)) fingers[side].push(js);
  }
  // 손가락 굽히기 (0 = 편 손, 1 = 주먹). 손바닥 쪽으로 굽는 축 = 검지→새끼 방향
  const curl = (side, amount, sign) => {
    const F = fingers[side];
    if (F.length < 2 || amount <= 0) return;
    const a = F[0][0].getWorldPosition(new THREE.Vector3()), b = F[F.length - 1][0].getWorldPosition(new THREE.Vector3());
    const axis = b.sub(a).normalize().multiplyScalar(sign);
    for (const js of F) js.forEach((j, i) => bendBone(j, axis, amount * (i === 0 ? 0.8 : 1.1)));
  };
  if (sm) for (const b of sm.skeleton.bones) { const m = /(Hips|Spine1|Neck|Head|RightShoulder|LeftShoulder|RightArm|RightForeArm|RightHand|LeftArm|LeftForeArm|LeftHand|LeftFoot|RightFoot)$/.exec(b.name); if (m) bones[m[1]] = b; }
  // 라프산두: 새 모자를 머리 뼈에 붙인다 (기본 자세의 월드 위치 → 머리 뼈 기준 위치)
  if (kind === "rapsandu" && capInfo && bones.Head) {
    const cap = makeCapMesh(capInfo.r);
    const want = new THREE.Matrix4().compose(capInfo.center,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.06, Math.PI, 0)),   // 챙이 뒤로(모델의 -z), 이마 쪽이 아주 살짝 들리게
      new THREE.Vector3(1, 1, 1));
    const local = bones.Head.matrixWorld.clone().invert().multiply(want);
    local.decompose(cap.position, cap.quaternion, cap.scale);
    bones.Head.add(cap);
  }
  const fit = new THREE.Group();
  fit.add(obj);
  measure(g);
  const s = HEIGHT[kind] / g.userData.height;
  fit.scale.setScalar(s);
  fit.position.y = -g.userData.footY * s;
  fit.rotation.y = Math.PI;                   // Tripo 모델은 +z 를 보고, 게임 캐릭터의 앞은 -z
  const holder = new THREE.Group();
  holder.add(fit);
  const mic = makeMic();
  holder.add(mic);
  const cig = makeCig();
  holder.add(cig);
  const fb = (n) => sm && sm.skeleton.bones.find((b) => b.name.endsWith(n));
  const cigBones = { i1: fb("RightHandIndex1"), i2: fb("RightHandIndex2"), m2: fb("RightHandMiddle2"), p1: fb("RightHandPinky1"), hand: fb("RightHand") };
  const micBones = sm ? { hand: sm.skeleton.bones.find((b) => /LeftHand$/.test(b.name)), mid: sm.skeleton.bones.find((b) => /LeftHandMiddle1$/.test(b.name)) } : {};
  const mixer = new THREE.AnimationMixer(obj);
  // 뼈의 기본 자세. 매 프레임 여기서 시작해야 덧씌우는 자세가 쌓이지 않는다 (동작 없이 '차렷'일 때 특히)
  const restPose = sm ? sm.skeleton.bones.map((b) => [b, b.position.clone(), b.quaternion.clone()]) : [];
  // 매 프레임 '덧씌우기 전의 동작 자세'로 되돌린다 (기본 자세가 아니라).
  // three.js 는 값이 지난 프레임과 같으면 뼈에 다시 쓰지 않는다. 그래서 기본 자세로 되돌려 놓으면
  // 거의 안 움직이는 뼈(앉은 자세의 엉덩이 높이 등)가 가끔 한 프레임씩 기본 자세로 남아
  // 몸이 위아래로 지지직 순간이동하듯 보였다 (2026-11-13)
  const animPose = restPose.map(([b, p, q]) => [b, p.clone(), q.clone()]);
  const actions = {};
  let current = null, currentName = "";
  let reachW = 0, style = null, styleT = 0;
  // 발이 땅에 닿는 순간 감지 (발 높이가 최근 최저점 근처로 내려올 때) → onStep(왼/오른)
  const footState = { LeftFoot: { lo: 1e9, hi: -1e9, down: true }, RightFoot: { lo: 1e9, hi: -1e9, down: true } };
  const _fp = new THREE.Vector3(), _hp = new THREE.Vector3();
  const ov = { hunch: 0, rightHand: 0, leftArm: 0, stand: 0 };
  const reachDir = new THREE.Vector3(0, 0, -1);
  const action = (name) => {
    if (!actions[name]) {
      const a = mixer.clipAction(clips[name]);
      if (ONCE.has(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      actions[name] = a;
    }
    return actions[name];
  };
  return {
    obj: holder,
    height: HEIGHT[kind],
    play(name, speed = 1, fade = 0.25, restart = false) {
      // 'rest' = 동작 없이 기본 자세로 (켜져 있던 동작을 서서히 끈다 → 뼈가 기본 자세로 돌아온다)
      if (name === "rest") {
        if (currentName !== "rest") { if (current) current.fadeOut(fade); current = null; currentName = "rest"; }
        return;
      }
      if (!clips[name]) return;
      const a = action(name);
      a.timeScale = speed;
      if (currentName === name && !restart) return;
      a.reset().setEffectiveWeight(1).fadeIn(fade).play();
      if (current && current !== a) current.fadeOut(fade);
      current = a; currentName = name;
    },
    get name() { return currentName; },
    onStep: null,
    clipDuration(n) { return clips[n] ? clips[n].duration : 1; },
    // 랩 세레모니: 왼손에 핸드마이크 (Mixamo 'Rapping' 은 왼손을 입 앞에 든다)
    // 세레모니(담배 피우기): 오른손 검지 · 중지 사이에 담배
    setCig(on) { cig.visible = !!on && Object.values(cigBones).every(Boolean); },
    setMic(on) { mic.visible = !!on && !!(micBones.hand && micBones.mid && fingers.Left.length > 1 && bones.Hips); },
    // 오른팔을 dir(월드 방향) 쪽으로 w(0~1)만큼 뻗기 — 3인칭 잡기
    reach(w, dir) { reachW = w; if (dir) reachDir.copy(dir); },
    // 'swag': 라프산두 걸음 — 오른손 바지춤, 상체 웅크림, 왼팔은 거의 1자 (걷기 · 달리기 · 서 있기 위에 덧씌움)
    // 'dj': 매튜 — 한 손 턴테이블, 한 손 귀, 박자 타기
    setStyle(s) { style = s; },
    setOverlay(o) { ov.hunch = o.hunch || 0; ov.rightHand = o.rightHand || 0; ov.leftArm = o.leftArm || 0; ov.stand = o.stand || 0; },
    update(dt) {
      for (const [b, p, q] of animPose) { b.position.copy(p); b.quaternion.copy(q); }
      mixer.update(dt);
      for (const e of animPose) { e[1].copy(e[0].position); e[2].copy(e[0].quaternion); }
      const B = bones;
      if (style && B.Hips && B.Spine1 && B.RightArm && B.RightForeArm && B.RightHand) {
        styleT += dt;
        holder.updateMatrixWorld(true);
        holder.getWorldQuaternion(_hq);
        _fw.set(0, 0, -1).applyQuaternion(_hq);
        _rt.set(1, 0, 0).applyQuaternion(_hq);
        // 오른팔이 실제로 있는 쪽을 '오른쪽'으로
        B.RightArm.getWorldPosition(_p1); B.Hips.getWorldPosition(_p2);
        if (_p3.subVectors(_p1, _p2).dot(_rt) < 0) _rt.negate();
        _lt.copy(_rt).negate();
        const bendAxis = _ax.crossVectors(_up, _fw).normalize();       // 앞으로 숙이는 축
        const H = HEIGHT[kind];
        // 두 마디 팔 IK: 손을 hand 에 정확히 놓고, 팔꿈치는 pole 쪽으로 굽힌다 (실제 팔 길이로 계산)
        const arm = (A, F, Hd, pole, hand, w) => {
          const S = A.getWorldPosition(new THREE.Vector3());
          const E0 = F.getWorldPosition(new THREE.Vector3()), W0 = Hd.getWorldPosition(new THREE.Vector3());
          const a = S.distanceTo(E0), b = E0.distanceTo(W0);
          const toT = hand.clone().sub(S);
          const d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, toT.length()));
          toT.normalize();
          const cosA = (a * a + d * d - b * b) / (2 * a * d);
          const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
          const side = pole.clone().addScaledVector(toT, -pole.dot(toT)).normalize();
          const elbow = S.clone().addScaledVector(toT, a * cosA).addScaledVector(side, a * sinA);
          aimBone(A, F, _p3.subVectors(elbow, S).normalize(), w);
          F.getWorldPosition(_p1);
          aimBone(F, Hd, _p3.subVectors(hand, _p1).normalize(), w);
        };
        const dirOf = (...parts) => { const v = new THREE.Vector3(); for (let i = 0; i < parts.length; i += 2) v.addScaledVector(parts[i], parts[i + 1]); return v.normalize(); };
        if (style === "swag" && reachW < 0.98) {
          // 덧씌우는 양은 js/pose.js 설정(P 키 창)에서: 0 = Tripo 동작 그대로, 1 = 이 자세로 완전히
          const w = 1 - reachW;
          if (ov.stand > 0) {
            // 차렷 + 숨쉬기: 가슴이 천천히 들썩(약 4초에 한 번), 두 팔은 몸 옆에 곧게, 손은 허벅지 옆
            const br = Math.sin(styleT * Math.PI * 2 * 0.25);
            bendBone(B.Spine1, bendAxis, -0.045 * br * ov.stand);          // 들이쉴 때 가슴을 편다
            if (B.Neck) bendBone(B.Neck, bendAxis, 0.035 * br * ov.stand);
            // 어깨(쇄골)를 들썩: 팔 시작점을 위로 끌어올린다
            const lift = 0.012 * H * (0.5 + 0.5 * br);
            for (const [Sh, Ar] of [[B.RightShoulder, B.RightArm], [B.LeftShoulder, B.LeftArm]]) {
              if (!Sh || !Ar) continue;
              Sh.getWorldPosition(_p1); Ar.getWorldPosition(_p2);
              aimBone(Sh, Ar, _p3.subVectors(_p2.addScaledVector(_up, lift), _p1).normalize(), ov.stand);
            }
            const side = (A, F, Hd, out) => {
              A.getWorldPosition(_p1);
              const hand = _p1.clone().addScaledVector(_up, -0.3 * H).addScaledVector(out, 0.022 * H).addScaledVector(_fw, 0.012 * H);
              arm(A, F, Hd, dirOf(_fw, -1, out, 0.2), hand, ov.stand * w);
            };
            side(B.RightArm, B.RightForeArm, B.RightHand, _rt);
            if (B.LeftArm && B.LeftForeArm && B.LeftHand) side(B.LeftArm, B.LeftForeArm, B.LeftHand, _lt);
          }
          if (ov.hunch > 0) {
            bendBone(B.Spine1, bendAxis, 0.35 * ov.hunch * w);           // 상체 앞으로 웅크리기
            if (B.Neck) bendBone(B.Neck, bendAxis, -0.2 * ov.hunch * w); // 고개는 앞을 보게 되돌림
          }
          if (ov.rightHand > 0) {
            // 오른손: 바지춤 (엉덩이 앞 오른편) · 팔꿈치는 옆 · 뒤로
            B.Hips.getWorldPosition(_p2);
            const hand = _p2.clone().addScaledVector(_fw, 0.1 * H).addScaledVector(_rt, 0.03 * H).addScaledVector(_up, -0.08 * H);
            arm(B.RightArm, B.RightForeArm, B.RightHand, dirOf(_rt, 1, _fw, -0.6), hand, ov.rightHand * w);
          }
          if (ov.leftArm > 0 && B.LeftArm && B.LeftForeArm && B.LeftHand) {
            // 왼팔: 힘 뺀 채 몸 옆에 늘어뜨리기 (팔꿈치 살짝 굽힘, 손은 허벅지 조금 앞)
            B.LeftArm.getWorldPosition(_p1);
            const lh = _p1.clone().addScaledVector(_up, -0.26 * H).addScaledVector(_fw, 0.06 * H).addScaledVector(_lt, 0.035 * H);
            arm(B.LeftArm, B.LeftForeArm, B.LeftHand, dirOf(_fw, -1, _lt, 0.4), lh, ov.leftArm);
          }
        }
        if (style === "dj") {
          // 매튜: 몸은 Tripo 동작 그대로(가만히 선 '대기'), 오른손만 몸 앞 부스 위(윗면 약 1m, 0.5m 앞)에 올려 둔다
          holder.getWorldPosition(_p2);
          const deck = _p2.clone().addScaledVector(_fw, 0.5).addScaledVector(_rt, 0.2).addScaledVector(_up, 1.04);
          arm(B.RightArm, B.RightForeArm, B.RightHand, dirOf(_up, -1, _rt, 0.6, _fw, -0.3), deck, 1);
        }
      }
      if (reachW > 0.01 && bones.RightArm && bones.RightForeArm && bones.RightHand) {
        holder.updateMatrixWorld(true);
        aimBone(bones.RightArm, bones.RightForeArm, reachDir, reachW);
        aimBone(bones.RightForeArm, bones.RightHand, reachDir, reachW);
      }
      if (mic.visible && bones.Head && bones.LeftArm && bones.LeftForeArm) {
        // 랩: Mixamo 동작은 왼손을 귀 옆에 대서, 손을 입 앞(조금 떨어진 곳)으로 옮긴다 (팔 IK).
        // 머리 뼈를 따라 움직이니 고개를 까딱이면 마이크도 같이 따라간다
        holder.updateMatrixWorld(true);
        const H = HEIGHT[kind];
        holder.getWorldQuaternion(_hq);
        _fw.set(0, 0, -1).applyQuaternion(_hq);
        _rt.set(1, 0, 0).applyQuaternion(_hq);
        bones.LeftArm.getWorldPosition(_p1); bones.Hips.getWorldPosition(_p2);
        if (_p3.subVectors(_p1, _p2).dot(_rt) > 0) _rt.negate();          // _rt 를 몸의 오른쪽으로 (왼팔 반대쪽)
        const mouth = bones.Head.getWorldPosition(new THREE.Vector3()).addScaledVector(_up, MIC.mouthUp * H).addScaledVector(_fw, MIC.mouthFw * H);
        const grille = mouth.clone().addScaledVector(_fw, MIC.gap * H);    // 마이크 머리: 입에서 조금 띄운 곳
        const axis = new THREE.Vector3().addScaledVector(_up, 0.8).addScaledVector(_fw, -0.55).addScaledVector(_rt, -0.2).normalize();   // 손잡이는 아래 · 앞으로
        const grip = grille.clone().addScaledVector(axis, -0.11);
        const wrist = grip.clone().addScaledVector(_up, -0.03 * H).addScaledVector(_rt, -0.02 * H);
        ikArm(bones.LeftArm, bones.LeftForeArm, micBones.hand, new THREE.Vector3().addScaledVector(_up, -1).addScaledVector(_rt, -0.7).normalize(), wrist, 1);
        holder.updateMatrixWorld(true);
        curl("Left", MIC.curl, MIC.sign);
        holder.updateMatrixWorld(true);
        // 실제 손(주먹) 자리에 마이크, 머리는 입 쪽으로
        micBones.hand.getWorldPosition(_p1); micBones.mid.getWorldPosition(_p2);
        const at = _p1.clone().lerp(_p2, MIC.along);
        _ax.subVectors(grille, at).normalize();
        mic.position.copy(holder.worldToLocal(at.clone()));
        mic.quaternion.setFromUnitVectors(_up, _ax).premultiply(_hq.clone().invert());
      }
      if (cig.visible) {
        // 검지 · 중지 둘째 마디 사이에 끼우고, 손바닥을 뚫고 지나가는 방향(손바닥 법선)으로 눕힌다
        holder.updateMatrixWorld(true);
        const C = cigBones;
        C.i2.getWorldPosition(_p1); C.m2.getWorldPosition(_p2);
        const at = _p1.clone().lerp(_p2, 0.5);
        C.hand.getWorldPosition(_p3);
        const along = C.i1.getWorldPosition(new THREE.Vector3()).sub(_p3);            // 손가락 방향
        const across = C.p1.getWorldPosition(new THREE.Vector3()).sub(C.i1.getWorldPosition(new THREE.Vector3()));   // 검지 → 새끼
        _ax.crossVectors(along, across).normalize();                                   // 손바닥 법선
        if (CIG.flip) _ax.negate();
        at.addScaledVector(along.normalize(), -CIG.at * 0.02);
        cig.position.copy(holder.worldToLocal(at));
        holder.getWorldQuaternion(_hq);
        cig.quaternion.setFromUnitVectors(_up, _ax).premultiply(_hq.invert());
      }
      if (this.onStep && dt > 0) {
        holder.updateMatrixWorld(true);
        holder.getWorldPosition(_hp);
        for (const f of ["LeftFoot", "RightFoot"]) {
          const b = bones[f], st = footState[f];
          if (!b) continue;
          const y = b.getWorldPosition(_fp).y - _hp.y;
          // 최근 최저 · 최고 높이 (천천히 현재 쪽으로 풀린다 → 동작이 바뀌어도 따라감)
          st.lo = Math.min(y, st.lo + (y - st.lo) * Math.min(1, dt * 0.8));
          st.hi = Math.max(y, st.hi - (st.hi - y) * Math.min(1, dt * 0.8));
          const range = st.hi - st.lo;
          if (range < 0.06) { st.down = true; continue; }        // 거의 안 움직이면(서 있음) 소리 없음
          if (!st.down && y < st.lo + range * 0.25) { st.down = true; this.onStep(f); }
          else if (st.down && y > st.lo + range * 0.45) st.down = false;
        }
      }
    },
  };
}
