// 시작 인트로 (약 19초, 라프산두 노래 rap_intro 에 맞춤. 클릭 · Space 로 건너뛰기)
//  0.0~5.5  밤거리에서 건물 정면을 넓게 → 천천히 다가감, 제목
//  3.5~9.8  라프산두가 길을 따라 걸어옴 (옆에서 따라가는 카메라)
//  9.8~12.6 정문 쪽으로 돌아 문 앞까지
// 12.8~13.8 유리 자동문이 열림
// 14.0~16.6 로비로 들어감 (뒤에서 따라감)
// 16.6~19.2 앞에서 얼굴 클로즈업, '대체 너 어디야!!!!!' (크게)
// 가사 말풍선 시간은 소리 크기(작게 끊기는 곳)로 짐작한 값이라, 어긋나면 LINES 의 숫자만 고치면 된다.
import * as THREE from "three";
import { pose } from "./pose.js?v=20261113155403";
import { play as playSound, stop as stopSound } from "./sound.js?v=20261113155403";
import { CS } from "./map.js?v=20261113155403";

export const LINES = [
  [1.3, 4.9, "풀럽오너보이 예아 룩 라잌 대염 벌베리언"],
  [6.3, 4.0, "유 비 크롸인 얼 웻 여러 워러퐐ㅋ 라잌 캐리븨언!"],
  [10.4, 3.1, "맨 아 쀨 라잌 암인더워럴 난 상어 넌 캐비어!"],
  [13.6, 5.8, "예아 브뤄 암마 고 할ㄷ 허! |대체 너 어디야!!!!!"],   // | 뒤는 빨간 굵은 글씨
];
export const INTRO_LEN = 19.2;

export function createIntro({ player, camera, world, ui }) {
  const fd = world.frontDoor;
  const doorX = fd ? fd.center.x : 7.5 * CS, doorZ = fd ? fd.center.z : 20 * CS;
  // 길 위 경로: A(왼쪽 길) → B(정문 앞 길) → C(문 바로 앞) → D(로비 안)
  const A = new THREE.Vector3(doorX - 6, 0, doorZ + 3.8);
  const B = new THREE.Vector3(doorX, 0, doorZ + 3.8);
  const C = new THREE.Vector3(doorX, 0, doorZ + 1.1);
  const D = new THREE.Vector3(doorX, 0, doorZ - 4.4);
  const EAST = -Math.PI / 2, NORTH = 0;   // player.yaw: 0 = -z(건물 안쪽), -π/2 = +x
  let t = 0, audio = null, nextLine = 0, done = false;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const lerp = (a, b, k) => a + (b - a) * Math.min(1, Math.max(0, k));
  const seg = (t0, t1) => Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  const ease = (k) => k * k * (3 - 2 * k);

  function actor() {
    // 위치 · 방향 · 동작
    let p, yaw, moving = 0;
    if (t < 3.5) { p = A.clone(); yaw = EAST; }
    else if (t < 9.8) { p = A.clone().lerp(B, seg(3.5, 9.8)); yaw = EAST; moving = A.distanceTo(B) / 6.3; }
    else if (t < 10.5) { p = B.clone(); yaw = lerp(EAST, NORTH, ease(seg(9.8, 10.5))); }
    else if (t < 12.6) { p = B.clone().lerp(C, seg(10.5, 12.6)); yaw = NORTH; moving = B.distanceTo(C) / 2.1; }
    else if (t < 14.0) { p = C.clone(); yaw = NORTH; }
    else if (t < 16.6) { p = C.clone().lerp(D, ease(seg(14.0, 16.6))); yaw = NORTH; moving = C.distanceTo(D) / 2.6; }
    else { p = D.clone(); yaw = NORTH; }
    return { p, yaw, moving };
  }

  function shot(p) {
    // 장면마다 카메라 목표 (위치, 보는 곳)
    const head = p.clone().add(new THREE.Vector3(0, 1.5, 0));
    if (t < 5.5) {
      const k = ease(seg(0, 5.5));
      return [new THREE.Vector3(lerp(doorX + 6, doorX + 3, k), lerp(9, 4.2, k), lerp(doorZ + 17, doorZ + 11, k)), new THREE.Vector3(doorX + 2, lerp(5.5, 2.5, k), doorZ - 2)];
    }
    if (t < 10.0) return [p.clone().add(new THREE.Vector3(1.2, 1.6, 4.6)), head];
    if (t < 14.0) return [p.clone().add(new THREE.Vector3(1.0, 1.9, 3.4)), new THREE.Vector3(doorX, 1.6, doorZ - 1)];
    if (t < 16.6) return [p.clone().add(new THREE.Vector3(0.7, 1.9, 2.9)), p.clone().add(new THREE.Vector3(0, 1.4, -3))];
    return [p.clone().add(new THREE.Vector3(-0.7, 1.75, -2.5)), p.clone().add(new THREE.Vector3(0, 1.6, 0))];
  }

  return {
    get done() { return done; },
    get time() { return t; },
    start() {
      t = 0; nextLine = 0; done = false; this._door = false;
      player.third = true;
      if (fd) fd.set(0);
      audio = playSound("rap_intro");
      const [cp, cl] = shot(A);
      camPos.copy(cp); camLook.copy(cl);
    },
    tick(dt) {
      if (done) return;
      t += dt;
      // 말풍선
      while (nextLine < LINES.length && t >= LINES[nextLine][0]) {
        const [, dur, text, big] = LINES[nextLine++];
        ui.bubble("player", text, dur, !!big);
      }
      if (fd) fd.set(ease(seg(12.8, 13.8)));
      if (!this._door && t >= 12.8) { this._door = true; playSound("door", { volume: 0.7 }); }
      const { p, yaw, moving } = actor();
      p.y = 0;
      player.spawn(p.x, p.y + 0.05, p.z);
      player.yaw = yaw; player.pitch = 0;
      const m = player.model;
      if (m) {
        const P = pose();
        if (moving > 0) m.play(P.walk.clip, moving / 1.05, 0.25);   // 걷는 속도에 맞춰 (걷기 동작 1배 = 1.05m/s)
        else m.play(P.idle.clip, 1, 0.35);
        m.setOverlay(moving > 0 ? P.walk : P.idle);
        m.reach(0);
        m.update(dt);
      }
      player.body.position.copy(p); player.body.rotation.set(0, yaw, 0); player.body.visible = true;
      if (player.armVM) player.armVM.obj.visible = false;
      player.hand.visible = false;
      // 카메라: 장면 목표로 부드럽게 (첫 장면은 바로)
      const [cp, cl] = shot(p);
      const k = t < 5.5 ? 1 : 1 - Math.exp(-3.5 * dt);
      camPos.lerp(cp, k); camLook.lerp(cl, k);
      camera.position.copy(camPos); camera.lookAt(camLook);
      if (t >= INTRO_LEN) this.finish();
    },
    skip() {
      if (done) return;
      stopSound(audio);
      t = INTRO_LEN;
      if (fd) fd.set(1);
      ui.bubble("player", "예아 브뤄 암마 고 할ㄷ 허! |대체 너 어디야!!!!!", 2.2);
      this.finish();
    },
    finish() {
      done = true;
      if (fd) fd.set(1);
      player.spawn(D.x, 0.05, D.z);
      player.yaw = NORTH; player.pitch = -0.05;
      player.home = { x: D.x, y: 0, z: D.z };
    },
  };
}
