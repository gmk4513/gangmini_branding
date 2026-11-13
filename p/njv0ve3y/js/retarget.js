// Mixamo 동작(FBX, 뼈대만) → Tripo 캐릭터 뼈대로 옮겨 붙이기.
// 뼈 이름은 같지만(mixamorig*) 두 뼈대의 기본 자세(T자 / A자)와 뼈의 축 방향이 달라서
// 회전값을 그대로 붙이면 몸이 꼬인다. 그래서 뼈마다 '월드에서 가리키는 방향'이 같아지도록 옮긴다.
//   K = (S · 원본 기본 회전)⁻¹ · 대상 기본 회전   (S = 원본 뼈 방향 → 대상 뼈 방향으로 돌리는 회전)
//   대상 월드 회전(t) = 원본 월드 회전(t) · K
// 엉덩이 위치는 두 캐릭터 엉덩이 높이 비율로 줄여서 옮긴다 (앉으면 내려가도록).
import * as THREE from "three";

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();

// root 기준 월드 회전 · 위치
function rootSpace(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  return (o) => {
    _m.multiplyMatrices(inv, o.matrixWorld);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    _m.decompose(p, q, s);
    return { p, q };
  };
}

function bonesOf(root) {
  const map = {};
  root.traverse((o) => { if (o.isBone && !map[o.name]) map[o.name] = o; });
  return map;
}

// 뼈의 방향 = 뼈 → 첫 자식 뼈 (손은 가운뎃손가락 쪽)
function childOf(b) {
  const kids = b.children.filter((c) => c.isBone);
  if (!kids.length) return null;
  return kids.find((c) => /Middle1$|Spine$|Neck$|Head$/.test(c.name)) || kids[0];
}

export function retargetClip(srcRoot, srcClip, dstRoot, name, fps = 30) {
  const S = bonesOf(srcRoot), D = bonesOf(dstRoot);
  const names = Object.keys(D).filter((n) => S[n]);
  // 위에서 아래 순서 (부모 먼저)
  const order = [];
  dstRoot.traverse((o) => { if (o.isBone && names.includes(o.name)) order.push(o.name); });

  // 기본 자세 (애니메이션 적용 전)
  const srcRS = rootSpace(srcRoot), dstRS = rootSpace(dstRoot);
  const srcRest = {}, dstRest = {};
  for (const n of order) { srcRest[n] = srcRS(S[n]); dstRest[n] = dstRS(D[n]); }
  const K = {};
  for (const n of order) {
    const sc = childOf(S[n]), dc = childOf(D[n]);
    const swing = new THREE.Quaternion();
    if (sc && dc && S[sc.name] === sc && D[dc.name] === dc) {
      const ds = srcRS(sc).p.sub(srcRest[n].p).normalize();
      const dd = dstRS(dc).p.sub(dstRest[n].p).normalize();
      if (ds.lengthSq() > 0.5 && dd.lengthSq() > 0.5) swing.setFromUnitVectors(ds, dd);
    }
    K[n] = swing.multiply(srcRest[n].q).invert().multiply(dstRest[n].q);
  }
  // 대상 엉덩이의 부모(뼈대 밖) 회전 · 위치는 고정
  const hipsName = order[0];
  const dstHips = D[hipsName];
  const parentRS = dstHips.parent && dstHips.parent !== dstRoot ? dstRS(dstHips.parent) : { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  const parentMat = new THREE.Matrix4();
  if (dstHips.parent && dstHips.parent !== dstRoot) { dstRoot.updateMatrixWorld(true); parentMat.copy(dstRoot.matrixWorld).invert().multiply(dstHips.parent.matrixWorld); }
  const parentInv = parentMat.clone().invert();
  const ratio = dstRest[hipsName].p.y / Math.max(1e-6, srcRest[hipsName].p.y);

  // 원본을 시간마다 재생하며 샘플링
  const mixer = new THREE.AnimationMixer(srcRoot);
  const act = mixer.clipAction(srcClip); act.play();
  const frames = Math.max(2, Math.round(srcClip.duration * fps) + 1);
  const times = new Float32Array(frames);
  const qv = {}; for (const n of order) qv[n] = new Float32Array(frames * 4);
  const pv = new Float32Array(frames * 3);
  const W = {};
  for (let f = 0; f < frames; f++) {
    const t = Math.min(srcClip.duration, f / fps);
    times[f] = t;
    mixer.setTime(t);
    srcRoot.updateMatrixWorld(true);
    for (const n of order) {
      const sw = srcRS(S[n]).q;
      const w = sw.multiply(K[n]);
      W[n] = w;
      const par = D[n].parent;
      const pq = par && W[par.name] && par.isBone && names.includes(par.name) ? W[par.name] : parentRS.q;
      _q.copy(pq).invert().multiply(w);
      // 앞 프레임과 같은 쪽 반구로 (보간이 뒤집히지 않게)
      const a = qv[n];
      if (f > 0 && _q.x * a[f * 4 - 4] + _q.y * a[f * 4 - 3] + _q.z * a[f * 4 - 2] + _q.w * a[f * 4 - 1] < 0) { _q.x *= -1; _q.y *= -1; _q.z *= -1; _q.w *= -1; }
      a.set([_q.x, _q.y, _q.z, _q.w], f * 4);
    }
    // 엉덩이 위치
    const sp = srcRS(S[hipsName]).p;
    _v.copy(sp).sub(srcRest[hipsName].p).multiplyScalar(ratio).add(dstRest[hipsName].p).applyMatrix4(parentInv);
    pv.set([_v.x, _v.y, _v.z], f * 3);
  }
  mixer.stopAllAction(); mixer.uncacheRoot(srcRoot);
  const tracks = order.map((n) => new THREE.QuaternionKeyframeTrack(D[n].name + ".quaternion", times, qv[n]));
  tracks.push(new THREE.VectorKeyframeTrack(dstHips.name + ".position", times, pv));
  return new THREE.AnimationClip(name, srcClip.duration, tracks);
}
