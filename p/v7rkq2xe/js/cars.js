/* 차·주인공 모델 (Tripo → tools/slim_glb.py). 파일이 없으면 코드 모델로 대신한다.

   좌표: 묶음(holder)의 앞이 -z (heading 0 = 북쪽 = -z).
   사람은 Mixamo 뼈대가 붙은 채 A 자로 서 있다 → 범퍼카·스쿠터처럼 코드에서 앉힌다.
   뒤에서 따라가는 카메라라 그냥 두면 뒤통수만 보인다 → 고개를 카메라 쪽으로 돌려 얼굴을 보여 준다
   ("경찰이 바로 내 뒤에" 하며 뒤돌아보는 모습). */
import * as THREE from "../vendor/three.module.min.js";
import { GLTFLoader } from "../vendor/addons/loaders/GLTFLoader.js";

const MODEL_LEN = 5.4;                   // 모델을 맞추는 길이 (앉히기·운전대 자리가 이 길이 기준)
/* 차·사람을 묶음(holder)째 1.5배 (2026-11-08 사용자 요청 — 2.35배는 나무·집과 비율이 안 맞았다). 폭 약 3.5m, 길이 약 8.1m */
export const CAR_SCALE = 1.5;
export const CAR_LEN = MODEL_LEN * CAR_SCALE;
const CAR_LEN_M = MODEL_LEN;
const RIDER_H = 2.45;                    // 서 있을 때 키 (차에 맞춰 함께 키움)
const HEAD_SCALE = 1.5;                  // 3면도 자체가 머리가 크지만, 먼 카메라에서도 얼굴이 보이게 더

/* 모델이 어느 쪽을 보는지 (Tripo 는 앞이 +z 로 나온다) */
const CFG = {
  ferrari: { url: "assets/models/ferrari.glb", rotY: Math.PI },
  police: { url: "assets/models/police.glb", rotY: Math.PI },
  vice: { url: "assets/models/vice.glb" },
};
/* 페라리 안 자리 (앞 -z 기준, 차 길이 5.4 일 때) — 왼쪽 운전석 */
const SEAT = { x: -0.42, y: 0.92, z: 0.42 };
const WHEEL = { x: -0.42, y: 1.22, z: -0.38 };

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const wp = (o) => o.getWorldPosition(new THREE.Vector3());
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

function polish(o, shiny) {
  o.traverse(m => {
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false;
    const old = m.material;
    if (old.map) old.map.colorSpace = THREE.SRGBColorSpace;
    m.material = shiny
      ? new THREE.MeshPhongMaterial({ map: old.map, color: old.map ? 0xffffff : old.color, specular: 0x666666, shininess: 70 })
      : new THREE.MeshLambertMaterial({ map: old.map, color: old.map ? 0xffffff : old.color });
    // 사람은 그늘에서도 얼굴이 어둡게 죽지 않게 (스쿠터에서 맞춘 값)
    if (m.isSkinnedMesh && old.map) {
      m.material.color = new THREE.Color("#4a4a4a");
      m.material.emissiveMap = old.map; m.material.emissive = new THREE.Color("#d8d8d8");
    }
  });
}

/* 모델을 길이에 맞추고 바닥 0, 앞 -z, 가운데 0 으로 */
function fit(scene, rotY, len) {
  const spin = new THREE.Group(); spin.add(scene);
  scene.rotation.y = rotY;
  spin.updateWorldMatrix(true, true);
  let box = new THREE.Box3().setFromObject(scene), size = box.getSize(new THREE.Vector3());
  if (size.x > size.z) { scene.rotation.y += Math.PI / 2; spin.updateWorldMatrix(true, true); box = new THREE.Box3().setFromObject(scene); size = box.getSize(new THREE.Vector3()); }
  const k = len / size.z;
  spin.scale.setScalar(k);
  spin.updateWorldMatrix(true, true);
  box = new THREE.Box3().setFromObject(spin);
  spin.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  return spin;
}

/* ---- 코드 모델 (Tripo 파일이 아직 없을 때) ---- */
function codeCar(color, top, police) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color, specular: 0x777777, shininess: 80 });
  const dark = new THREE.MeshLambertMaterial({ color: "#16181c" });
  const low = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.62, CAR_LEN_M), paint); low.position.y = 0.72; low.castShadow = true; g.add(low);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 1.5), paint); nose.position.set(0, 1.12, -1.6); nose.castShadow = true; g.add(nose);
  if (top) { const cab = new THREE.Mesh(new THREE.BoxGeometry(2, 0.72, 2.5), new THREE.MeshPhongMaterial({ color: "#26303a", shininess: 90 })); cab.position.set(0, 1.42, 0.25); cab.castShadow = true; g.add(cab); }
  for (const [x, z] of [[-1.1, -1.7], [1.1, -1.7], [-1.1, 1.7], [1.1, 1.7]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.36, 18), dark); w.rotation.z = Math.PI / 2; w.position.set(x, 0.46, z); w.castShadow = true; g.add(w);
  }
  if (police) { const d = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.2, 2.8), new THREE.MeshLambertMaterial({ color: "#1f3f93" })); d.position.set(0, 0.86, 0.1); g.add(d); }
  return g;
}
function codeRider() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: "#3f9b57" }), skin = new THREE.MeshLambertMaterial({ color: "#e6b899" }), hair = new THREE.MeshLambertMaterial({ color: "#191919" });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.55, 4, 10), shirt); body.position.y = 0.55; body.castShadow = true; g.add(body);
  const head = new THREE.Group(); head.position.y = 1.32;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), skin); skull.castShadow = true; head.add(skull);
  const braid = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.6, 3, 8), hair); braid.position.set(0, 0.1, 0.38); head.add(braid);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.05), hair); eye.position.set(0, 0.08, -0.4); head.add(eye);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: "#ffffff" })); mouth.position.set(0, -0.16, -0.4); head.add(mouth);
  g.add(head);
  return { root: g, head };
}

/* 빛막대 — 빨강·파랑 번갈아 깜빡인다 (앞이 -z, 지붕 높이) */
function addLightbar(holder, y, glowTex) {
  const mk = (color, x) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(x, y, 0.05); s.scale.setScalar(2.4); holder.add(s); return s;
  };
  const blue = mk("#3a6bff", -0.55), red = mk("#ff2a2a", 0.55);
  return (t, k = 1) => {
    const p = Math.floor(t * 7) % 4;
    blue.material.opacity = (p === 0 || p === 1 ? 1 : 0.1) * k;
    red.material.opacity = (p === 2 || p === 3 ? 1 : 0.1) * k;
    blue.scale.setScalar(p < 2 ? 2.2 : 0.8); red.scale.setScalar(p >= 2 ? 2.2 : 0.8);
  };
}

/* 차 밑 그림자 — 해 그림자가 건물 그늘에 묻혀도 차가 땅에 붙어 보이게 */
let blobTex = null;
function addBlob(holder) {
  if (!blobTex) {
    const c = document.createElement("canvas"); c.width = 64; c.height = 128;
    const g = c.getContext("2d"); g.filter = "blur(7px)"; g.fillStyle = "rgba(0,0,0,.62)"; g.beginPath(); g.roundRect(13, 14, 38, 100, 14); g.fill();
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 6.4), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.4; m.renderOrder = 1;
  holder.userData.blob = m;
  m.material.depthTest = true;
  holder.add(m);
}

async function tryLoad(url) {
  try { return await new GLTFLoader().loadAsync(url); } catch (e) { console.warn("모델 없음 → 코드 모델로:", url); return null; }
}

export async function loadCars(glowTex) {
  const [fg, pg, vg] = await Promise.all([tryLoad(CFG.ferrari.url), tryLoad(CFG.police.url), tryLoad(CFG.vice.url)]);

  /* --- 경찰차 원본 --- */
  let policeSrc, policeH = 1.9;
  if (pg) {
    polish(pg.scene, true);
    policeSrc = fit(pg.scene, CFG.police.rotY, CAR_LEN_M * 0.98);
    const b = new THREE.Box3().setFromObject(policeSrc); policeH = b.max.y;
  } else policeSrc = codeCar("#f2f3f5", true, true);
  const makePolice = () => {
    const holder = new THREE.Group(), body = new THREE.Group();
    body.add(policeSrc.clone(true)); holder.add(body); addBlob(holder);
    holder.scale.setScalar(CAR_SCALE);
    const flash = addLightbar(body, policeH - 0.08, glowTex);
    return { holder, body, flash };
  };

  /* --- 내 차 + 주인공 --- */
  const holder = new THREE.Group(), body = new THREE.Group(); holder.add(body); addBlob(holder);
  let ferrari;
  if (fg) { polish(fg.scene, true); ferrari = fit(fg.scene, CFG.ferrari.rotY, CAR_LEN_M); }
  else ferrari = codeCar("#c8171c", false, false);
  body.add(ferrari);

  let lookAt, headTopY = 2.6, rigInfo = null;
  if (vg) {
    const rider = vg.scene;
    polish(rider, false);
    const bones = {};
    rider.traverse(o => { if (/^mixamorig/.test(o.name)) bones[o.name.replace(/^mixamorig:?/, "")] = o; });
    let restH = 1;
    rider.traverse(o => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; restH = b.max.y - b.min.y; } });
    const riderBody = new THREE.Group(); riderBody.add(rider); body.add(riderBody);
    rider.scale.setScalar(RIDER_H / restH);
    rider.rotation.y = Math.PI;          // 모델 앞(+z) → 묶음 앞(-z)
    rider.updateWorldMatrix(true, true);
    const hip0 = wp(bones.Hips);
    rider.position.set(SEAT.x - hip0.x, SEAT.y - hip0.y, SEAT.z - hip0.z);
    holder.updateWorldMatrix(true, true);
    const L = (x, y, z) => new THREE.Vector3(x, y, z);
    aimBone(bones.Spine, bones.Spine1, L(0, 1, 0.1));
    // 다리는 접어 차 안에 숨긴다 (범퍼카와 같은 방법)
    for (const s of ["Left", "Right"]) bones[s + "UpLeg"].scale.setScalar(0.08);
    // 손은 운전대에
    const side = (n) => (wp(bones[n]).x - SEAT.x > 0 ? 1 : -1);
    for (const s of ["Left", "Right"]) {
      const sx = side(s + "Arm");
      ik2(bones[s + "Arm"], bones[s + "ForeArm"], bones[s + "Hand"], L(WHEEL.x + sx * 0.2, WHEEL.y, WHEEL.z), L(sx * 0.2, -1, 0.5));
      if (bones[s + "HandMiddle1"]) aimBone(bones[s + "Hand"], bones[s + "HandMiddle1"], L(0, 0.2, -1));
    }
    bones.Head.scale.setScalar(HEAD_SCALE);
    bones.Head.updateWorldMatrix(true, true);
    headTopY = wp(bones.Head).y + 0.75;
    // 뒤돌아보기: 허리 → 목 → 머리에 나눠 돌린다 (한 뼈로 다 돌리면 목이 꼬인다)
    const twist = [[bones.Spine2 || bones.Spine1, 0.14], [bones.Neck, 0.36], [bones.Head, 0.5]].filter(x => x[0]);
    const rest = twist.map(([b]) => b.quaternion.clone());
    const UP = new THREE.Vector3(0, 1, 0), wq = new THREE.Quaternion(), pq = new THREE.Quaternion(), rq = new THREE.Quaternion();
    lookAt = (ang) => {
      // 부모 쪽부터 — 묶음 기준 위쪽 축으로 ang 만큼 나눠 돌린다
      twist.forEach(([b, w], i) => {
        b.quaternion.copy(rest[i]);
        b.parent.updateWorldMatrix(true, false);
        b.parent.getWorldQuaternion(pq);
        holder.getWorldQuaternion(wq);
        // 묶음의 위쪽 축 = 월드 위쪽 (차는 거의 안 기운다). 뼈의 부모 공간으로 옮겨 곱한다
        const axis = UP.clone().applyQuaternion(pq.clone().invert());
        rq.setFromAxisAngle(axis, ang * w);
        b.quaternion.premultiply(rq);
      });
    };
    rigInfo = { bones, rider };
  } else {
    const r = codeRider();
    r.root.position.set(SEAT.x, SEAT.y, SEAT.z); body.add(r.root);
    lookAt = (ang) => { r.head.rotation.y = ang; };
  }

  holder.scale.setScalar(CAR_SCALE);
  headTopY *= CAR_SCALE;
  return { holder, body, ferrari, makePolice, lookAt, headTopY, rigInfo, real: { ferrari: !!fg, police: !!pg, vice: !!vg } };
}
