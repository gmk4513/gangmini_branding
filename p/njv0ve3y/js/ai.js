// 숨는 사람들 — 숨어 있다가 술래가 가까이 오면 도망간다. 사람마다 개인기가 하나씩.
import * as THREE from "three";
import { bfs, pickFlee, fleeCosts, pathTo, clearLine, roomOf } from "./nav.js";
import { rampAt, CS } from "./map.js";
import { makeModel } from "./chars.js";

export const CAST = {
  jeffrey: { name: "제프리화이트", color: 0x2f6fd6, tag: "제프리화이트" },
  mason: { name: "메이슨홈", color: 0x2e9a5b },
  clone: { name: "메이슨홈", color: 0x2e9a5b },   // 풀업보이 — 겉모습은 메이슨홈과 똑같다
  kid: { name: "키드밀리", color: 0xd6a12f, tag: "키드밀리" },
  matthew: { name: "매튜", color: 0x8a4fd6, tag: "매튜" },   // tag: 머리 위에 늘 작게 보이는 이름
};

// 술래 달리기는 7.0m/s. 도망도 똑같이 7.0(사용자 결정) — 지치거나(11초마다 2초) 막다른 곳 · 넘어질 때가 잡을 기회
const SPEED = { flee: 7.0, tired: 4.6, relocate: 2.4 };
const FEAR = 12;
const MATTHEW_CLIP = "idle";   // 매튜 몸 동작 (Tripo '대기'). 오른손만 부스 위로 덧씌움   // 술래 가까운 길을 얼마나 싫어하나 (클수록 술래를 멀리 돌아서 도망)
// 상태 → 동작 (동작 이름은 anims_src.glb). 속도에 맞춰 재생 빠르기도 바꾼다
const RUN_ANIM_SPEED = 5.2, WALK_ANIM_SPEED = 1.5;
const SEE = 11, HEAR = 4, LOSE = 18;
// 숨어 있을 때: 술래가 같은 방에 들어와 ROOM_SEE 안으로 보이게 다가오면 도망 (복도 · 방 밖에서는 TOUCH 만큼 바로 옆일 때만)
const ROOM_SEE = 8, TOUCH = 1.6;

function makeBody(color) {
  const g = new THREE.Group();
  const inner = new THREE.Group();   // 넘어지기 · 웅크리기는 이쪽만 돌린다
  const mat = new THREE.MeshLambertMaterial({ color });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.9, 4, 10), mat);
  torso.position.y = 0.8;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 12), new THREE.MeshLambertMaterial({ color: 0xe0b48f }));
  head.position.y = 1.55;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.1), head.material);
  nose.position.set(0, 1.55, -0.24);   // 앞(-z)이 어딘지 보이게
  inner.add(torso, head, nose);
  g.add(inner);
  g.userData.inner = inner;
  return g;
}

export class Runner {
  constructor(game, kind, nodeId) {
    this.game = game;
    this.kind = kind;
    this.info = CAST[kind];
    this.node = nodeId;
    const p = game.nav.nodes[nodeId].p;
    this.pos = new THREE.Vector3(p.x, p.y, p.z);
    this.mesh = makeBody(this.info.color);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = kind === "matthew" ? 0 : Math.random() * Math.PI * 2;   // 매튜는 부스 너머 문 쪽(-z)을 본다
    game.scene.add(this.mesh);
    this.state = kind === "matthew" ? "dj" : "hide";
    this.path = []; this.pi = 0;
    this.t = 0;              // 지금 상태가 된 뒤 흐른 시간
    this.sense = Math.random() * 0.2;
    this.los = false; this.dist = 99;
    this.lostFor = 0; this.fleeFor = 0; this.replan = 0;
    this.slipIn = 3.5 + Math.random();   // 제프리: 약 4초마다 넘어짐
    this.caught = false;
    this.catchable = kind !== "matthew";
    this.attachModel(makeModel(kind));   // 모델을 아직 못 불러왔으면 null → 캡슐 그대로, 나중에 다시 붙인다
  }

  // Tripo 캐릭터 모델 붙이기 (캡슐은 숨긴다)
  attachModel(m) {
    if (!m || this.model) return;
    this.model = m;
    this.mesh.userData.inner.visible = false;
    this.mesh.add(m.obj);
  }

  // 지금 상태에 맞는 동작
  animate(dt) {
    const m = this.model;
    if (!m) return;
    this.hookSteps();
    this.stepVol = 0;
    const s = this.state;
    if (this.caught) m.play("sit");
    else if (s === "dj") { m.play(MATTHEW_CLIP); if (m.setStyle) m.setStyle("dj"); }
    else if (s === "hide") m.play("sit");
    else if (s === "reveal") m.play(this.kind === "kid" ? "sing_01" : "scared_01");
    else if (s === "slip") m.play("fall", 1.3, 0.12);
    // 도망 중인데 못 움직이면(구석에 몰림) 제자리에서 달리지 말고 겁먹은 자세로 술래 쪽을 본다
    else if ((s === "flee" || s === "tired") && this.still > 0.15 && !(this.dist < 6 && this.los)) m.play("wait", 1, 0.3);   // 멀리 따돌렸으면 숨 고르기
    else if ((s === "flee" || s === "tired") && this.still > 0.15) {
      m.play("scared_01", 1, 0.2);
      const pe = this.game.player.feet();
      const want = Math.atan2(-(pe.x - this.pos.x), -(pe.z - this.pos.z));
      let a = Math.atan2(Math.sin(want - this.mesh.rotation.y), Math.cos(want - this.mesh.rotation.y));
      this.mesh.rotation.y += a * Math.min(1, dt * 6);
    }
    else if (s === "flee") { m.play("run", SPEED.flee / RUN_ANIM_SPEED); this.stepVol = 0.8; }
    else if (s === "tired") { m.play("run", SPEED.tired / RUN_ANIM_SPEED * 0.9); this.stepVol = 0.7; }
    else if (s === "relocate") { m.play("walk", SPEED.relocate / WALK_ANIM_SPEED); this.stepVol = 0.5; }
    else m.play("wait");
    m.update(dt);
  }

  // 키드밀리 목소리 (몸에서 나는 소리라 가까울수록 크게)
  //  들키기 전: 소리 없음 (힌트 소리는 사용자 결정으로 뺐다)
  //  들킨 뒤: '나는 키드밀리~ / 자꾸 차가 밀리~ / 그래서 자꾸 지각하지~ / 티~원~' 전체를 끝나고 2초 뒤마다 반복.
  //   쫓는 동안에는 층이 바뀌거나 벽에 가려도 끊기지 않게 거리로만 작아진다 (40m 에서 0)
  kidVoice(dt) {
    const g = this.game, S = g.sound;
    const len = (name, d) => (S.duration && S.duration(name)) || d;
    if (!this.singing) return;
    if (this.voice && this.voice.isPlaying) this.voice.setVolume(1);
    const LINES = [[0.4, 1.8, "나는 키드밀리~ 🎤"], [2.3, 2.5, "자꾸 차가 밀리~"], [4.9, 1.7, "그래서 자꾸 지각하지~"], [6.7, 1.6, "티~원~", true]];
    this.lineT += dt;
    if (this.lineT >= len("kid_lines", 8.2) + 2) {
      this.lineT = 0; this.lineI = 0;
      this.voice = S.play("kid_lines", { follow: this.mesh, ref: 4, far: 40, volume: 1 });
    }
    while (this.lineI < LINES.length && this.lineT >= LINES[this.lineI][0]) {
      const [, d, text, big] = LINES[this.lineI++];
      this.say(text, d, big);
    }
  }

  // 도망가는 애들 발소리: 발이 땅에 닿을 때마다, 몸에서 나는 소리(멀면 안 들림)
  hookSteps() {
    const g = this.game, m = this.model;
    if (!m || m.onStep) return;
    m.onStep = () => {
      if (!g.sound || !this.stepVol || this.caught || this.dist > 25 || (this.moved || 0) <= 0) return;
      const hear = this.hearFactor();
      if (hear > 0) g.sound.step({ follow: this.mesh, ref: 2, far: 22, volume: this.stepVol * hear });
    };
  }

  eye() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.68, this.pos.z); }   // 키를 12% 키운 눈높이

  set(state) { this.state = state; this.t = 0; }

  // 메이슨홈 · 풀업보이: 서로 다른 쪽으로 도망가게 상대가 가는 곳을 피한다
  twin() {
    if (this.kind !== "mason" && this.kind !== "clone") return null;
    return this.game.runners.find((r) => r !== this && (r.kind === "mason" || r.kind === "clone") && !r.caught) || null;
  }
  twinTarget() { const t = this.twin(); return t && t.target >= 0 ? t.target : undefined; }

  say(text, sec, big) { this.game.ui.bubble(this, text, sec, big); }

  // 술래가 보이나 (벽에 가리는지)
  look() {
    const g = this.game;
    const e = this.eye(), pe = g.player.eye();
    this.dist = e.distanceTo(pe);
    if (this.dist > 30) { this.los = false; return; }
    const dir = pe.clone().sub(e).normalize();
    g.ray.set(e, dir); g.ray.far = this.dist;
    this.los = g.ray.intersectObjects(g.world.solid.children, false).length === 0;
  }

  // leave: 들킨 순간 — 지금 있는 방 밖으로 나가는 길을 먼저 찾는다
  planFlee(avoid, leave) {
    const g = this.game, N = g.nav.nodes;
    if (!g.dP) return;   // 술래 위치를 아직 모름
    const first = this.state !== "flee" && this.state !== "tired";
    const room = roomOf(N[this.node]);
    let r = null;
    const tw = this.twin();
    const avoidPath = tw && tw.path ? new Set(tw.path.slice(Math.max(0, tw.pi - 1))) : null;
    if (leave && room && room.type !== "hall") r = pickFlee(g.nav, this.node, g.dP, { avoid, avoidPath, fear: FEAR, jitter: 2, leaveRoom: room });
    if (!r) r = pickFlee(g.nav, this.node, g.dP, { avoid, avoidPath, fear: FEAR, jitter: first ? 4 : 0.5, here: this.node, keep: this.target });
    // 구석에 몰렸다(갈 곳이 바로 옆이거나 없음): 술래 옆을 스쳐서라도 방 밖으로 빠져나간다
    const cornered = !r || r.path.length <= 3;
    if (cornered) {
      const out = pickFlee(g.nav, this.node, g.dP, { avoid, fear: 1.2, jitter: 1, leaveRoom: room || undefined });
      if (out && out.path.length > 3) r = out;
    }
    if (r) { this.path = r.path; this.pi = 1; this.target = r.target; }
    this.stuck = !r || r.path.length <= 1;
  }

  planHide() {
    const g = this.game;
    const { dist, prev } = fleeCosts(g.nav, this.node, g.dP);
    let best = -1, bs = -1e9;
    for (const h of g.hideSpots) {
      if (g.runners.some((o) => o !== this && !o.caught && o.home === h)) continue;
      const s = g.dP[h] - 0.25 * dist[h] + Math.random() * 3;
      if (dist[h] < 1e8 && s > bs) { bs = s; best = h; }
    }
    if (best < 0) return false;
    this.home = best; this.path = pathTo(prev, best); this.pi = 1;
    return true;
  }

  spotted() {
    const g = this.game;
    if (this.kind === "kid") {
      this.set("reveal");
      this.singing = true;      // 이제부터는 대사 네 줄 전체를 반복 (update 의 키드밀리 부분)
      this.lineT = 1e9;         // 바로 첫 번째를 시작
      return;
    }
    if (this.kind === "mason" && !this.split) {
      this.split = true;
      const c = new Runner(g, "clone", this.node);
      c.pos.copy(this.pos); c.mesh.position.copy(this.pos);
      g.runners.push(c);
      this.say("내가 메이슨홈일까~ 풀업보이일까~", 2.6);
      c.say("내가 메이슨홈일까~ 풀업보이일까~", 2.6);
      this.twinT = 5; c.twinT = 7.5;
      g.ui.poof(this.pos);
      this.planFlee(undefined, true); this.set("flee");
      c.planFlee(this.target, true); c.set("flee");
      return;
    }
    this.planFlee(undefined, true); this.set("flee");
    if (this.kind === "jeffrey") this.say("헉!", 0.8);
  }

  moveAlong(dt, speed) {
    const g = this.game, N = g.nav.nodes;
    if (this.pi >= this.path.length) return true;
    // 격자 칸을 지그재그로 밟지 않게: 앞의 점까지 곧장 갈 수 있으면 사이 점들은 건너뛴다
    const cur = N[this.path[this.pi]];
    if (!rampAt(cur.k, cur.x, cur.y) && Math.abs(cur.p.y - this.pos.y) < 0.2) {
      let last = this.pi;
      for (let j = this.pi + 1; j < Math.min(this.path.length, this.pi + 7); j++) {
        const nj = N[this.path[j]];
        if (nj.k !== cur.k || rampAt(nj.k, nj.x, nj.y) || Math.abs(nj.p.y - cur.p.y) > 0.2) break;
        last = j;
      }
      for (let j = last; j > this.pi; j--) {
        const nj = N[this.path[j]];
        if (clearLine(g.nav, nj.k, this.pos.x, this.pos.z, nj.p.x, nj.p.z)) { this.pi = j; break; }
      }
      const here = g.nav.at(cur.k, Math.floor(this.pos.x / CS), Math.floor(this.pos.z / CS));
      if (here >= 0) this.node = here;
    }
    const p = N[this.path[this.pi]].p;
    const to = new THREE.Vector3(p.x, p.y, p.z).sub(this.pos);
    const d = to.length();
    const step = speed * dt;
    const before = this.pos.clone();
    if (d <= step) { this.pos.set(p.x, p.y, p.z); this.node = this.path[this.pi]; this.pi++; }
    else this.pos.addScaledVector(to, step / d);
    this.moved = this.pos.distanceTo(before);
    // 가는 쪽을 보게 (부드럽게 돌기)
    if (to.x * to.x + to.z * to.z > 1e-4) {
      const want = Math.atan2(-to.x, -to.z);
      let a = want - this.mesh.rotation.y;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      const maxTurn = 7 * dt;   // 초당 최대 7rad(약 400도) — 휙 돌지 않고 몸을 돌리며 방향을 바꾼다
      this.mesh.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, a * Math.min(1, dt * 8)));
    }
    return this.pi >= this.path.length;
  }

  update(dt) {
    const g = this.game;
    const inner = this.mesh.userData.inner;
    this.t += dt;
    if (this.caught) { this.mesh.position.copy(this.pos); this.animate(dt); return; }

    if (this.kind === "kid" && g.sound) this.kidVoice(dt);
    this.sense -= dt;
    if (this.sense <= 0) { this.sense = 0.2; this.look(); }

    switch (this.state) {
      case "dj":
        inner.rotation.z = Math.sin(this.t * 7) * 0.08;
        inner.position.y = Math.abs(Math.sin(this.t * 7)) * 0.06;
        if (this.dist < 9 && this.los && !this.saidHi) { this.saidHi = true; this.say("(디제잉 중)", 3); }
        if (this.dist > 14) this.saidHi = false;
        break;

      case "hide": {
        inner.scale.y = 0.62; inner.position.y = 0;
        const myRoom = roomOf(g.nav.nodes[this.node]);
        // 방에 숨었으면 술래가 그 방에 들어와야 알아챈다 (문 앞을 지나가기만 해서는 안 나온다)
        const inMyRoom = !myRoom || myRoom.type === "hall" || g.playerRoom === myRoom;
        if ((inMyRoom && this.dist < ROOM_SEE && this.los) || this.dist < TOUCH) { inner.scale.y = 1; this.spotted(); }
        break;
      }

      case "reveal":   // 키드밀리: 들킨 자리에서 한 소절 하고 도망
        inner.scale.y = 1;
        inner.rotation.z = Math.sin(this.t * 10) * 0.12;
        if (this.t > 0.6 || this.dist < 2.6) { inner.rotation.z = 0; this.planFlee(undefined, true); this.set("flee"); }
        break;

      case "flee":
      case "tired": {
        const tired = this.state === "tired";
        this.fleeFor += dt;
        this.replan -= dt;
        if (this.replan <= 0 || this.pi >= this.path.length) { this.replan = 0.9; this.planFlee(this.twinTarget()); }
        this.moved = 0;
        this.moveAlong(dt, tired ? SPEED.tired : SPEED.flee);
        this.still = this.moved < 0.3 * dt ? (this.still || 0) + dt : 0;
        if (this.still > 0.15) this.replan = Math.min(this.replan, 0.25);   // 막혔으면 빨리 다시 길 찾기
        inner.position.y = Math.abs(Math.sin(this.t * 14)) * 0.08;
        // 메이슨홈 · 풀업보이: 도망가면서 가끔 같은 말
        if (this.twinT !== undefined) {
          this.twinT -= dt;
          if (this.twinT <= 0) { this.twinT = 6 + Math.random() * 3; this.say("내가 메이슨홈일까~ 풀업보이일까~", 2.2); }
        }
        // 오래 뛰면 숨이 찬다
        if (!tired && this.fleeFor > 11) { this.set("tired"); this.say("헉헉…", 1.5); }
        if (tired && this.t > 2) { this.fleeFor = 0; this.set("flee"); }
        // 제프리: 도망가다 미끄러진다
        if (this.kind === "jeffrey") {
          this.slipIn -= dt;
          if (this.slipIn <= 0) {
            this.slipIn = 3.6 + Math.random() * 0.8;   // 넘어졌다 일어나는 시간(약 2.3초)은 빼고 약 4초마다
            this.set("slip"); this.say("으아악!", 1.2);
            if (g.sound) g.sound.play("slip", { follow: this.mesh, ref: 5 });
            break;
          }
        }
        // 술래를 따돌렸으면 새 숨을 곳으로
        if (this.dist > LOSE && !this.los) this.lostFor += dt; else this.lostFor = 0;
        if (this.lostFor > 4 && this.planHide()) { this.lostFor = 0; this.fleeFor = 0; this.set("relocate"); }
        break;
      }

      case "slip": {   // 미끄덩(뒤로 넘어짐) → 데굴데굴 → 일어나기
        const t = this.t;
        if (t < 0.5) inner.rotation.x = (t / 0.5) * 1.35;
        else if (t < 1.4) { inner.rotation.x = 1.35 + ((t - 0.5) / 0.9) * Math.PI * 2; this.moveAlong(dt, 2.2); }
        else if (t < 1.9) inner.rotation.x = 1.35 * (1 - (t - 1.4) / 0.5);
        else if (t >= (this.model ? 2.3 : 1.9)) { inner.rotation.x = 0; this.fleeFor = 0; this.set("flee"); }   // 넘어져 있던 동안 숨은 돌렸다
        inner.position.y = t < 1.9 ? 0.25 : 0;
        break;
      }

      case "relocate":
        inner.position.y = 0;
        if (this.moveAlong(dt, SPEED.relocate)) this.set("hide");
        if ((this.dist < SEE * 0.7 && this.los) || this.dist < HEAR) { this.planFlee(undefined, true); this.set("flee"); }
        break;
    }
    this.mesh.position.copy(this.pos);
    this.animate(dt);
  }

  catchMe() {
    const g = this.game;
    // 메이슨홈 · 풀업보이 중 먼저 잡힌 쪽은 무조건 풀업보이: 펑 하고 사라진다.
    // 진짜(mason)를 먼저 잡았으면 남은 쪽과 이름표를 바꿔서, 남은 쪽이 메이슨홈이 된다
    const twin = (this.kind === "mason" || this.kind === "clone")
      ? g.runners.find((r) => r !== this && (r.kind === "mason" || r.kind === "clone") && !r.caught) : null;
    if (twin) {
      if (this.kind === "mason") { this.kind = "clone"; this.info = CAST.clone; twin.kind = "mason"; twin.info = CAST.mason; }
      // 풀업보이가 사라졌으니 남은 쪽이 진짜 → 다른 애들처럼 머리 위에 '메이슨홈' 이름표
      twin.info = { ...CAST.mason, tag: "메이슨홈" };
      twin.split = true;   // 남은 메이슨홈은 다시 들켜도 분신술을 또 쓰지 않는다 (분신술은 한 번뿐)
      g.ui.poof(this.pos, true);
      if (g.sound) g.sound.play("poof", { volume: 0.9 });
      this.say("펑~ 풀업보이였지롱", 1.6);
      this.caught = true;
      g.scene.remove(this.mesh);
      twin.twinT = undefined;
      return false;
    }
    this.caught = true;
    if (this.voice && g.sound && g.sound.stop) { g.sound.stop(this.voice); this.voice = null; }
    this.singing = false;
    const inner = this.mesh.userData.inner;
    inner.rotation.set(0, 0, 0); inner.position.y = 0; inner.scale.y = 0.55;
    if (!this.model) this.mesh.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; } });
    this.say("잡혔다…", 2);
    return true;
  }
}
