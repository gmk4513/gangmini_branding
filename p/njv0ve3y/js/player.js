// 라프산두 — 캡슐 충돌(three.js FPS 예제 방식) + 1인칭/3인칭 카메라 + 손 뻗기
import * as THREE from "three";
import { Capsule } from "three/addons/math/Capsule.js";
import { pose, previewMove, previewView } from "./pose.js?v=20261113154252";
import { step as stepSound, play as playSound } from "./sound.js?v=20261113154252";

// 캐릭터를 12% 키운 것(js/chars.js SIZE)에 맞춘 몸 크기. 반지름은 팔 · 옷자락까지 벽에 안 묻히게 넉넉히
const R = 0.42, HEIGHT = 1.96, EYE = 1.8;
// C 를 누르고 있으면 쭈그려 앉기 · 앉아서 걷기 (Mixamo crouch_idle · crouch_walk)
const CROUCH_H = 1.3, CROUCH_EYE = 1.15, CROUCH_SPEED = 1.6, CROUCH_ANIM = 1.42;   // 앉아 걷기 동작은 1배속에서 발이 1.13m/s 로 밀린다 → 1.6m/s 에 맞춰 1.42배
export const OUTRO_LEN = 5.2;   // 결과 연출 길이(초) — 이 동안 카메라가 한 바퀴
const RUN = 7.0, JUMP = 6.8, G = 22;
// 걷기 이동 속도 (처음엔 4.2 → 2.5 → 사용자 결정으로 3.5, 발 미끄러짐은 상관없음).
// 걷기 동작은 다 걸을 때 P 창 '빠르기' 배로 튼다 → 미리보기와 게임이 똑같이 보인다.
// (Tripo 걷기 동작 1배의 발 속도는 약 1.05m/s 라, 1.8배면 발이 약간 미끄러지지만 종종걸음은 아니다)
const WALK = 3.5;
const STEPS = 5;

export class Player {
  constructor(scene, camera, octree, solid) {
    this.camera = camera;
    this.octree = octree;
    this.solid = solid;
    // 3인칭 카메라가 피할 것: 벽 · 바닥 · 천장만. 가구 상자는 빼야 소품 위에 올라가도 카메라가 몸 속으로 안 들어온다
    this.camSolids = solid.children.filter((m) => m.name !== "box" && m.name !== "fence");
    this.holding = false;   // 좌클릭을 누르고 있는 동안 팔을 뻗은 채로
    this.reachW = 0;
    this.col = new Capsule(new THREE.Vector3(), new THREE.Vector3(), R);
    this.vel = new THREE.Vector3();
    this.onFloor = false;
    this.yaw = 0; this.pitch = 0;
    this.third = true;          // 3인칭만 (1인칭은 뺐다)
    this.freeYaw = 0; this.freePitch = 0; this.freeLook = false;   // Alt 누르고 둘러보기 (배그처럼)
    this.air = 0;
    this.grabT = 0;   // 손 뻗는 중 남은 시간
    // 마우스 감도 배율 ([ ] 키). 1 = 배틀그라운드 기본 감도쯤 (raw 입력 기준 1카운트에 0.0011rad)
    this.sens = 1;
    try { this.sens = +localStorage.getItem("pov-sens") || 1; } catch (e) { }
    this.bobT = 0;
    this.ray = new THREE.Raycaster();

    // 3인칭에서 보이는 몸 (나중에 Tripo 모델로 바꿀 자리)
    const body = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.95, 4, 10), mat);
    torso.position.y = 0.85;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), new THREE.MeshLambertMaterial({ color: 0xe0b48f }));
    head.position.y = 1.62;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.26, 0.14, 16), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    cap.position.set(0, 1.8, 0); cap.rotation.z = 0.25;   // 삐딱한 모자 각도
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.22), cap.material);
    brim.position.set(0.12, 1.75, -0.18); brim.rotation.y = -0.6;
    this.arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), mat);
    this.arm.position.set(0.3, 1.2, -0.25);
    body.add(torso, head, cap, brim, this.arm);
    this.body = body;
    scene.add(body);

    // 1인칭 손: 라프산두의 흰 긴소매 + 손 (평소엔 화면 아래로 내려가 있다가 잡을 때 뻗는다)
    this.hand = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.42, 12), new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.9 }));
    sleeve.rotation.x = Math.PI / 2; sleeve.position.z = 0.05;
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a888, roughness: 0.7 });
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.09), skin);
    palm.position.set(0, 0, -0.2);
    for (let i = 0; i < 4; i++) {
      const fng = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, 0.07), skin);
      fng.position.set(-0.027 + i * 0.018, 0, -0.27);
      this.hand.add(fng);
    }
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.05), skin);
    thumb.position.set(0.045, 0.004, -0.2); thumb.rotation.y = -0.6;
    this.hand.add(sleeve, palm, thumb);
    this.hand.position.set(0.24, -0.42, -0.35);
    camera.add(this.hand);
  }

  // Tripo 라프산두 모델 붙이기 (3인칭에서 보이는 몸). 캡슐 · 모자 상자는 숨긴다
  attachModel(m) {
    if (!m || this.model) return;
    this.model = m;
    for (const c of [...this.body.children]) if (c !== this.arm) c.visible = false;
    this.arm.visible = false;
    this.body.add(m.obj);
    if (m.setStyle) m.setStyle("swag");   // 오른손 바지춤 · 살짝 웅크린 자세
  }

  // 1인칭 팔: 라프산두 모델에서 오른팔만 잘라 낸 것 (js/chars.js makeArm)
  attachArm(a) {
    if (!a || this.armVM) return;
    this.armVM = a;
    this.camera.add(a.obj);
    this.hand.visible = false;
  }

  spawn(x, y, z) {
    this.col.start.set(x, y + R, z);
    this.col.end.set(x, y + (this.crouching ? CROUCH_H : HEIGHT) - R, z);
    this.vel.set(0, 0, 0);
  }

  feet() { return new THREE.Vector3(this.col.start.x, this.col.start.y - R, this.col.start.z); }
  eye() { return new THREE.Vector3(this.col.start.x, this.col.start.y - R + EYE - (EYE - CROUCH_EYE) * (this.crouchK || 0), this.col.start.z); }
  // 앉기: 캡슐 높이를 낮춘다. 일어설 때는 머리 위가 비어 있어야 한다 (탁자 밑 등에서는 계속 앉아 있음)
  setCrouch(want) {
    if (want === !!this.crouching) return;
    const h = want ? CROUCH_H : HEIGHT;
    const old = this.col.end.y;
    this.col.end.y = this.col.start.y + h - 2 * R;
    if (!want && this.octree) {
      const r = this.octree.capsuleIntersect(this.col);
      if (r && r.normal.y < -0.3) { this.col.end.y = old; return; }   // 천장 · 가구에 머리가 닿는다 → 못 일어섬
    }
    this.crouching = want;
  }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  look(dx, dy) {
    const k = 0.0011 * this.sens;
    if (this.freeLook) {
      // 몸은 그대로, 카메라만 캐릭터 둘레를 돈다 (한 바퀴 돌면 내 얼굴도 보인다)
      this.freeYaw -= dx * k;
      this.freePitch = Math.max(-1.2 - this.pitch, Math.min(1.2 - this.pitch, this.freePitch - dy * k));
      return;
    }
    this.yaw -= dx * k;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * k));
  }

  grab() { if (this.grabT <= 0) { this.grabT = 0.36; return true; } return false; }
  // 지금 손이 충분히 뻗어 있나 (잡기 판정용)
  get reaching() { return this.reachW > 0.6; }

  collide() {
    const r = this.octree.capsuleIntersect(this.col);
    this.onFloor = false;
    if (!r) return;
    this.onFloor = r.normal.y > 0.45;
    if (!this.onFloor) {
      this.vel.addScaledVector(r.normal, -r.normal.dot(this.vel));
      // 벽 · 문 옆 모서리에 '스치듯' 닿으면 벽을 따라 미끄러지며 속도를 유지한다 (문틀에 걸리는 느낌 없애기).
      // 정면으로 부딪힐 때(바라는 방향과 벽이 거의 마주볼 때)만 멈춘다
      const n = r.normal, w = this.wishDir;
      if (w && Math.abs(n.y) < 0.4 && this.wishSpeed > 0) {
        const headOn = -(w.x * n.x + w.z * n.z) / Math.max(1e-6, Math.hypot(n.x, n.z));
        // 미끄러지는 방향은 '지금 가던 방향'이 아니라 '누르고 있는 방향'을 벽면에 눕힌 쪽.
        // (가던 방향을 따르면, 벽에 붙은 채 반대로 돌아서려 해도 벽에 밀려 원래 쪽으로 계속 가 버린다)
        const nh = Math.hypot(n.x, n.z) || 1, nx = n.x / nh, nz = n.z / nh;
        const wn = w.x * nx + w.z * nz;
        let tx = w.x - nx * wn, tz = w.z - nz * wn;
        const tl = Math.hypot(tx, tz);
        // 건물 벽은 모두 격자를 따라 곧게 서 있어서, 비스듬한 법선 = 문 옆 벽 '모서리'에 스친 것 → 거의 정면이어도 미끄러져 지나간다
        const corner = Math.abs(n.x) > 0.12 && Math.abs(n.z) > 0.12;
        if ((corner || headOn < 0.8) && tl > 0.1) {
          tx /= tl; tz /= tl;
          const along = this.vel.x * tx + this.vel.z * tz;   // 누르는 쪽으로 이미 가고 있을 때만 속도를 채운다
          const want = corner ? this.wishSpeed : this.wishSpeed * (1 - Math.max(0, headOn) * 0.35);
          if (along > 0.05 && along < want) { this.vel.x = tx * want; this.vel.z = tz * want; }
        }
      }
    } else if (this.vel.y < 0) this.vel.y = 0;
    if (r.depth >= 1e-10) this.col.translate(r.normal.multiplyScalar(r.depth));
  }

  update(dt, keys) {
    const fwd = this.forward();
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3();
    if (keys.KeyW) wish.add(fwd);
    if (keys.KeyS) wish.sub(fwd);
    if (keys.KeyD) wish.add(side);
    if (keys.KeyA) wish.sub(side);
    if (wish.lengthSq()) wish.normalize();
    this.setCrouch(!!keys.KeyC && (this.air || 0) < 0.15);   // 땅에 있을 때만 (벽에 붙어 onFloor 가 깜빡여도 풀리지 않게)
    this.crouchK = (this.crouchK || 0) + ((this.crouching ? 1 : 0) - (this.crouchK || 0)) * (1 - Math.exp(-12 * dt));
    this.running = !this.crouching && !!(keys.ShiftLeft || keys.ShiftRight) && wish.lengthSq() > 0;
    const speed = this.crouching ? CROUCH_SPEED : this.running ? RUN : WALK;
    this.wishDir = wish.lengthSq() ? wish : null; this.wishSpeed = wish.lengthSq() ? speed : 0;

    const sdt = dt / STEPS;
    let jumped = false;
    for (let i = 0; i < STEPS; i++) {
      const wasOn = this.onFloor;
      // 땅에서는 원하는 속도로 빠르게 맞추고, 공중에서는 조금만 바꿀 수 있다
      const k = 1 - Math.exp(-(this.onFloor ? 14 : 2) * sdt);
      this.vel.x += (wish.x * speed - this.vel.x) * k;
      this.vel.z += (wish.z * speed - this.vel.z) * k;
      if (this.onFloor && keys.Space && !jumped && !this.crouching) { this.vel.y = JUMP; jumped = true; this.onFloor = false; this.jumpedAt = performance.now(); }
      if (!this.onFloor) this.vel.y -= G * sdt;
      this.col.translate(this.vel.clone().multiplyScalar(sdt));
      this.collide();
      // 경사로를 내려갈 때 붕 뜨지 않게 바닥에 붙이기
      if (wasOn && !this.onFloor && !jumped && this.vel.y <= 0) {
        this.col.translate(new THREE.Vector3(0, -0.3, 0));
        const r = this.octree.capsuleIntersect(this.col);
        // 위로만 되돌린다 (법선 방향으로 밀면 계단 모서리에서 옆으로 밀려 걸린다)
        if (r && r.normal.y > 0.45) { this.col.translate(new THREE.Vector3(0, Math.min(0.3, r.depth / r.normal.y), 0)); this.onFloor = true; this.vel.y = 0; }
        else this.col.translate(new THREE.Vector3(0, 0.3, 0));
      }
    }
    // 마지막으로 바닥을 딛고 있던 자리 (0.3초마다). 이상하게 빠지면 여기로 되돌린다
    this.safeT = (this.safeT || 0) - dt;
    const fy = this.col.start.y - R;
    if (this.onFloor && this.safeT <= 0 && fy > -0.05) { this.safe = this.feet(); this.safeT = 0.3; }
    const fallen = fy < -0.35 || this.air > 2.5;   // 1층 바닥보다 아래 = 어딘가에 밀려 빠진 것
    if (fallen) { const p = this.safe || this.home; if (p) this.spawn(p.x, p.y + 0.05, p.z); this.air = 0; }

    this.grabT = Math.max(0, this.grabT - dt);
    // 누르고 있으면 쭉 뻗은 채로, 떼면 거둔다
    this.reachW += ((this.holding ? 1 : 0) - this.reachW) * (1 - Math.exp(-(this.holding ? 16 : 10) * dt));
    const reach = this.reachW;
    this.hand.position.z = -0.35 - reach * 0.4;
    this.hand.position.y = -0.42 + reach * 0.24;   // 평소엔 거의 안 보이고, 잡을 때 앞으로 쑥
    this.hand.rotation.x = reach * 0.15;
    this.arm.position.z = -0.25 - reach * 0.5;

    // 몸 위치 · 방향
    const f = this.feet();
    this.body.position.copy(f);
    this.body.rotation.y = this.yaw;
    this.body.visible = this.third;
    this.hand.visible = !this.third && !this.armVM;
    if (this.armVM) this.poseArm(dt, reach);
    // 뛸 때 몸을 살짝 앞으로 (모델이 있으면 동작이 대신한다)
    this.body.rotation.x = !this.model && this.running && this.onFloor ? -0.12 : 0;
    // Alt 를 떼면 카메라가 몸 뒤로 부드럽게 돌아온다
    if (!this.freeLook) {
      const k = 1 - Math.exp(-10 * dt);
      this.freeYaw = Math.atan2(Math.sin(this.freeYaw), Math.cos(this.freeYaw)) * (1 - k);
      this.freePitch *= 1 - k;
    }
    // 착지 소리 (조금이라도 떠 있었으면)
    if (this.onFloor && this.air > 0.35) playSound("land", { volume: Math.min(0.8, 0.3 + this.air * 0.6) });
    this.air = this.onFloor ? 0 : this.air + dt;
    // 팔 뻗기 시작할 때 '휙'
    if (this.holding && !this._held) playSound("whoosh", { volume: 0.5 });
    this._held = this.holding;
    if (this.model) {
      const v = Math.hypot(this.vel.x, this.vel.z);
      // 움직임마다 쓸 동작 · 덧씌울 자세는 js/pose.js (P 키 창에서 고른다)
      // 점프: 서 있다가 뛰면 점프 동작, 달리다 뛰면 달리는 자세 그대로
      if (this.onFloor || jumped) this.jumpPose = v < 3;
      const P = pose();
      let mv = v < 0.3 ? "idle" : (this.running && v > 2) || v > 5 ? "run" : "walk";   // Shift 를 누르면 가속 중에도 바로 달리기 동작
      if (!this.onFloor && this.jumpPose && (jumped || this.air > 0.05 || this.model.name === P.jump.clip)) mv = "jump";
      let c = P[mv];
      // 앉기: 서 있으면 쭈그려 앉기, 움직이면 앉아서 걷기 (덧씌우는 자세 없음)
      if (this.crouching && this.model.clipDuration("crouch_idle") > 0.5) {
        mv = v < 0.3 ? "crouch" : "crouchWalk";
        c = mv === "crouch" ? { clip: "crouch_idle", speed: 1 } : { clip: "crouch_walk", speed: 1 };
      }
      // 걷기는 실제 이동 속도에 맞춰(최고 속도면 P 창 빠르기 그대로), 달리기는 예전처럼
      const animRate = mv === "crouchWalk" ? Math.max(0.5, v / CROUCH_SPEED) * CROUCH_ANIM : mv === "walk" ? (v / WALK) * c.speed : mv === "run" ? v / (5.2 * 1.12) * c.speed : c.speed;
      this.model.play(c.clip, animRate, mv === "jump" ? 0.08 : 0.2, mv === "jump" && jumped);
      // 발소리: 동작에서 발이 땅에 닿는 순간마다 한 번 (chars.js onStep)
      this.stepVol = this.onFloor && (mv === "walk" || mv === "run" || mv === "crouchWalk") ? (mv === "run" ? 0.55 : mv === "walk" ? 0.4 : 0.18) : 0;
      if (!this.model.onStep) this.model.onStep = () => { if (this.stepVol > 0) stepSound({ volume: this.stepVol }); };
      this.model.setOverlay(c);
      // 3인칭 잡기: 오른팔을 보고 있는 쪽으로 쭉 뻗는다
      const look = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch * 0.6 - 0.1, this.yaw, 0, "YXZ"));
      this.model.reach(reach, look);
      this.model.update(dt);
    }

    this.placeCamera();
  }

  // 자세 설정 창이 열려 있는 동안: 제자리에서 고른 움직임을 보여 주고, 카메라는 앞 · 옆 · 뒤에서 비춘다
  previewTick(dt) {
    if (!this.model) return;
    const c = pose()[previewMove];
    this.model.play(c.clip, c.speed, 0.2);
    this.model.setOverlay(c);
    this.model.reach(0);
    this.model.update(dt);
    const f = this.feet();
    this.body.position.copy(f); this.body.rotation.set(0, this.yaw, 0); this.body.visible = true;
    if (this.armVM) this.armVM.obj.visible = false;
    this.hand.visible = false;
    const a = this.yaw + { front: 0, side: Math.PI / 2, back: Math.PI }[previewView];
    const dist = 3.0;
    this.camera.position.set(f.x - Math.sin(a) * dist, f.y + 1.45, f.z - Math.cos(a) * dist);
    this.camera.lookAt(f.x, f.y + 1.0, f.z);
  }

  // 결과 연출: 라프산두가 응원 동작, 카메라는 앞에서 시작해 천천히 돌며 다가간다
  outroTick(dt, t) {
    if (this.model) { this.model.reach(0); this.model.setOverlay({}); this.model.update(dt); }
    const f = this.feet();
    this.body.position.copy(f); this.body.rotation.set(0, this.yaw, 0); this.body.visible = true;
    if (this.armVM) this.armVM.obj.visible = false;
    this.hand.visible = false;
    // 풀샷(머리부터 발끝까지)으로 라프산두 둘레를 한 바퀴(360도) 돈다. 정면에서 시작
    const a = this.yaw + (t / OUTRO_LEN) * Math.PI * 2;
    const dist = 3.2;
    let cam = new THREE.Vector3(f.x - Math.sin(a) * dist, f.y + 1.15, f.z - Math.cos(a) * dist);
    // 벽에 막히면 그만큼 당긴다
    const head = new THREE.Vector3(f.x, f.y + 1.5, f.z);
    const dir = cam.clone().sub(head); const len = dir.length(); dir.normalize();
    this.ray.set(head, dir); this.ray.far = len;
    const hit = this.ray.intersectObjects(this.camSolids, false)[0];
    if (hit) cam = head.clone().addScaledVector(dir, Math.max(0.8, hit.distance - 0.3));
    this.camera.position.copy(cam);
    this.camera.lookAt(f.x, f.y + 0.95, f.z);
  }

  // 평소엔 오른손 끝만 화면 아래에 살짝, 잡을 때 앞으로 쭉 뻗는다. 걸으면 조금 흔들린다
  poseArm(dt, reach) {
    const A = this.armVM;
    A.obj.visible = !this.third;
    if (this.third) return;
    const sp = this.onFloor ? Math.hypot(this.vel.x, this.vel.z) : 0;
    this.bobT += dt * (2 + sp * 1.7);
    const amp = Math.min(1, sp / 4);
    const bobY = Math.sin(this.bobT * 2) * 0.012 * amp, bobX = Math.cos(this.bobT) * 0.01 * amp;
    const rest = A.rest, far = A.reach;
    const dir = new THREE.Vector3().copy(rest.dir).lerp(far.dir, reach).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(A.dir, dir);
    const roll = new THREE.Quaternion().setFromAxisAngle(dir, rest.roll + (far.roll - rest.roll) * reach);
    A.obj.quaternion.copy(roll.multiply(q));
    A.obj.position.copy(rest.pos).lerp(far.pos, reach);
    A.obj.position.x += bobX; A.obj.position.y += bobY;
  }

  placeCamera() {
    const e = this.eye();
    const cy = this.yaw + this.freeYaw, cp = this.pitch + this.freePitch;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(cp, cy, 0, "YXZ"));
    this.camera.quaternion.copy(q);
    if (!this.third) { this.camera.position.copy(e); return; }
    // 3인칭: 오른쪽 어깨 너머 (배틀그라운드처럼). 벽에 막히면 앞으로 당긴다
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const right = new THREE.Vector3(Math.cos(cy), 0, -Math.sin(cy));
    const from = e.clone().add(new THREE.Vector3(0, 0.15, 0));
    // 어깨 쪽으로 먼저 옮기되, 옆 벽이 가까우면 덜 옮긴다
    this.ray.set(from, right); this.ray.far = 0.75;
    const side = this.ray.intersectObjects(this.camSolids, false)[0];
    const shoulder = from.clone().addScaledVector(right, side ? Math.max(0, side.distance - 0.2) : 0.6);
    const want = 2.9;
    // 앞뒤(벽)와 위아래(천장 · 바닥)를 따로 막는다. 소품 위에 올라가 천장이 가까워도
    // 카메라가 머리 속으로 빨려 들지 않고 천장 밑으로 미끄러진다
    const flat = new THREE.Vector3(back.x, 0, back.z);
    const hl = flat.length() * want;
    flat.normalize();
    this.ray.set(shoulder, flat); this.ray.far = hl + 0.25;
    const hit = this.ray.intersectObjects(this.camSolids, false)[0];
    const dh = hit ? Math.max(0.2, Math.min(hl, hit.distance - 0.25)) : hl;
    const cam = shoulder.clone().addScaledVector(flat, dh);
    let dy = back.y * want;
    const up = new THREE.Vector3(0, Math.sign(dy) || 1, 0);
    this.ray.set(cam, up); this.ray.far = Math.abs(dy) + 0.3;
    const vhit = this.ray.intersectObjects(this.camSolids, false)[0];
    if (vhit) dy = Math.sign(dy) * Math.max(0, vhit.distance - 0.25);
    cam.y += dy;
    this.camera.position.copy(cam);
    // 카메라가 몸에 너무 붙으면 몸을 숨겨서 시야를 가리지 않게
    if (dh < 0.4 && Math.abs(dy) < 0.4) this.body.visible = false;
  }
}
