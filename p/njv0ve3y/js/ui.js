// 화면 위 글자들: 말풍선 · 시간 · 잡은 사람 · 층 · 연기 효과
import * as THREE from "three";

export class UI {
  constructor(game) {
    this.game = game;
    this.layer = document.getElementById("bubbles");
    this.bubbles = new Map();   // 주인 → { el, until }
    this.tags = new Map();      // 머리 위 이름표 (매튜)
    this.puffs = [];
    this.$time = document.getElementById("time");
    this.$floor = document.getElementById("floor");
    this.$targets = document.getElementById("targets");
    this.$hint = document.getElementById("hint");
  }

  bubble(owner, text, sec = 2, big = false) {
    let b = this.bubbles.get(owner);
    if (!b) {
      const el = document.createElement("div");
      el.className = "bubble";
      this.layer.appendChild(el);
      b = { el };
      this.bubbles.set(owner, b);
    }
    // '…|빨간 굵은 글씨' 처럼 | 뒤는 강조 (예: 예아 브뤄 암마 고 할ㄷ 허! |대체 너 어디야!!!!!)
    const [plain, hot] = String(text).split("|");
    b.el.textContent = plain;
    if (hot !== undefined) { const em = document.createElement("b"); em.className = "hot"; em.textContent = hot; b.el.appendChild(em); }
    b.el.classList.toggle("big", !!big);
    b.el.classList.toggle("me", owner === "player");
    b.until = performance.now() + sec * 1000;
  }

  clearBubbles() { for (const [, b] of this.bubbles) { b.until = 0; b.el.style.display = "none"; } }

  poof(pos, big) {
    const n = big ? 14 : 8;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.25 + Math.random() * 0.25, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.85 }));
      m.position.set(pos.x + (Math.random() - 0.5) * 0.8, pos.y + 0.3 + Math.random() * 1.4, pos.z + (Math.random() - 0.5) * 0.8);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5);
      m.userData.life = 0.9 + Math.random() * 0.4;
      this.game.scene.add(m);
      this.puffs.push(m);
    }
  }

  update(dt) {
    const g = this.game, cam = g.camera;
    const now = performance.now();
    const w = innerWidth, h = innerHeight;
    for (const [owner, b] of this.bubbles) {
      if (now > b.until) { b.el.style.display = "none"; continue; }
      const pl = g.player;
      if (owner === "player" && !(pl && pl.third)) {
        // 1인칭: 화면 아래쪽 가운데
        b.el.classList.remove("head");
        b.el.style.display = "block"; b.el.style.left = w / 2 + "px"; b.el.style.top = h * 0.8 + "px"; b.el.style.transform = "";
        continue;
      }
      // 3인칭 라프산두 · 숨는 사람들: 머리 위
      const at = owner === "player" ? pl.feet() : owner.pos;
      if (owner === "player") b.el.classList.add("head");
      const p = new THREE.Vector3(at.x, at.y + (owner.info && owner.info.tag ? 2.55 : 2.3), at.z);
      const d = p.distanceTo(cam.position);
      p.project(cam);
      const show = p.z < 1 && d < 30 && (owner === "player" || owner.los || d < 6) && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2;
      b.el.style.display = show ? "block" : "none";
      if (!show) continue;
      b.el.style.left = (p.x * 0.5 + 0.5) * w + "px";
      b.el.style.top = (-p.y * 0.5 + 0.5) * h + "px";
      // 멀어져도 너무 작아지지 않게 (도망가는 애들 말풍선이 잘 보이게)
      b.el.style.transform = `translate(-50%, -100%) scale(${Math.max(0.75, Math.min(1.1, 7 / d))})`;
    }
    // 이름표: 보이는 거리 안에서 머리 바로 위에 작게
    for (const r of g.runners || []) {
      if (!r.info.tag) continue;
      let el = this.tags.get(r);
      if (!el) { el = document.createElement("div"); el.className = "nametag"; el.textContent = r.info.tag; this.layer.appendChild(el); this.tags.set(r, el); }
      const p = new THREE.Vector3(r.pos.x, r.pos.y + 2.06, r.pos.z);
      const d = p.distanceTo(cam.position);
      p.project(cam);
      const show = !r.caught && p.z < 1 && d < 22 && r.los && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;   // 벽 너머로는 안 보이게(숨은 자리 들킴 방지)
      el.style.display = show ? "block" : "none";
      if (!show) continue;
      el.style.left = (p.x * 0.5 + 0.5) * w + "px";
      el.style.top = (-p.y * 0.5 + 0.5) * h + "px";
      el.style.transform = `translate(-50%, -100%) scale(${Math.max(0.7, Math.min(1, 6 / d))})`;
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const m = this.puffs[i];
      m.userData.life -= dt;
      m.position.addScaledVector(m.userData.v, dt);
      m.scale.multiplyScalar(1 + dt * 1.6);
      m.material.opacity = Math.max(0, m.userData.life);
      if (m.userData.life <= 0) { g.scene.remove(m); this.puffs.splice(i, 1); }
    }
  }

  setTime(sec) { this.$time.textContent = fmt(sec); }
  setFloor(label) { if (this._f !== label) { this._f = label; this.$floor.textContent = label; } }
  setTargets(list) {
    this.$targets.innerHTML = list.map((r) => `<span class="${r.caught ? "got" : ""}">${r.caught ? "✔ " : ""}${r.info.name}</span>`).join("");
  }
}

export function fmt(sec) {
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
}
