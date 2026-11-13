// 라프산두 자세 설정: 움직임(서 있기 · 걷기 · 달리기 · 점프)마다
//  - 어떤 Tripo 동작을 쓸지(clip) · 빠르기(speed)
//  - 그 위에 덧씌우는 자세: 상체 숙이기(hunch) · 오른손 바지춤(rightHand) · 왼팔 차분하게(leftArm), 0~1
// 게임 안 P 키 창에서 바꾸면 바로 보이고, 이 컴퓨터(localStorage)에 저장된다.
// '설정 복사'로 나온 글을 DEFAULT 에 붙이면 모두의 기본값이 된다.

// 2026-11-12 사용자가 P 창에서 고른 값으로 고정 (서 있기 = 서서 휴식, 걷기 · 달리기 = 살짝 숙임)
export const DEFAULT = {
  idle: { clip: "standing_relax", speed: 1, hunch: 0, rightHand: 0, leftArm: 0, stand: 0 },
  walk: { clip: "walk", speed: 1.8, hunch: 0.5, rightHand: 0, leftArm: 0, stand: 0 },   // 이동 2.5m/s 에 맞춘 동작 빠르기
  run: { clip: "run", speed: 1, hunch: 0.3, rightHand: 0, leftArm: 0, stand: 0 },
  jump: { clip: "jump", speed: 0.75, hunch: 0, rightHand: 0, leftArm: 0, stand: 0 },
};

export const MOVES = [["idle", "서 있기"], ["walk", "걷기"], ["run", "달리기"], ["jump", "점프(제자리)"]];
// Tripo 프리셋 이름 (영어 → 한국어). 목록 순서도 이 순서
export const CLIP_NAMES = {
  idle: "대기 (가만히)", wait: "대기 2", standing_relax: "서서 휴식", fold_arms: "팔짱 끼기", look_around: "둘러보기",
  make_a_call_01: "전화하기", play_mobile_game: "모바일 게임", scratch: "긁기", warm_up: "준비 운동",
  walk: "걷기", swagger: "으스대며 걷기", run: "달리기", flee_01: "도망 1", flee_02: "도망 2", run_upstairs: "계단 뛰어오르기",
  jump: "점프", jump_down: "뛰어내리기",
  scared_01: "무서워함 1", scared_02: "무서워함 2", frightened: "겁먹음", afraid: "두려움", fall: "넘어짐", sit: "앉기",
  cry: "울음", defeat_02: "패배", frustrated_01: "좌절", angry_01: "화남",
  sing_01: "노래 1", sing_02: "노래 2", sing_03: "노래 3", sing_04: "노래 4", dance_01: "댄스 1", dance_02: "댄스 2",
  laugh_01: "웃음", wave_goodbye_01: "손 흔들기", cheer: "응원", clap: "박수", heart_pose: "하트 포즈", greet_01: "인사",
  rest: "차렷 (동작 없이 숨만)",
};

const KEY = "pov-pose-v6";   // 기본값을 바꿀 때 올린다 (예전에 저장한 값 대신 새 기본값)
let cfg = load();

function load() {
  const base = JSON.parse(JSON.stringify(DEFAULT));
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved) for (const m in base) Object.assign(base[m], saved[m] || {});
  } catch (e) { }
  return base;
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { } };
export const pose = () => cfg;

// ---------------- 설정 창 ----------------
let panel = null, onClose = null;
export const panelOpen = () => !!(panel && !panel.hidden);
export let previewMove = "walk";
export let previewView = "front";

export function openPanel(clipList, close) {
  onClose = close;
  if (!panel) build(clipList);
  render();
  panel.hidden = false;
}
export function closePanel() {
  if (panel) panel.hidden = true;
  if (onClose) onClose();
}

function build(clipList) {
  panel = document.createElement("aside");
  panel.id = "posePanel";
  panel.innerHTML = `
    <div class="pp-head"><b>라프산두 자세 설정</b><button class="pp-x" title="닫기">✕</button></div>
    <div class="pp-tabs">${MOVES.map(([k, n]) => `<button data-move="${k}">${n}</button>`).join("")}</div>
    <div class="pp-body"></div>
    <div class="pp-view">보는 쪽 ${[["front", "앞"], ["side", "옆"], ["back", "뒤"]].map(([k, n]) => `<button data-view="${k}">${n}</button>`).join("")}</div>
    <div class="pp-foot">
      <button class="pp-reset">이 움직임 기본값</button>
      <button class="pp-copy">설정 복사</button>
    </div>
    <p class="pp-note">바꾸면 바로 저장돼요. 마음에 들면 '설정 복사' 후 붙여 보내 주세요.</p>`;
  document.body.appendChild(panel);
  panel.querySelector(".pp-x").onclick = closePanel;
  panel.querySelectorAll("[data-move]").forEach((b) => (b.onclick = () => { previewMove = b.dataset.move; render(); }));
  panel.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { previewView = b.dataset.view; render(); }));
  panel.querySelector(".pp-reset").onclick = () => { cfg[previewMove] = { ...DEFAULT[previewMove] }; save(); render(); };
  panel.querySelector(".pp-copy").onclick = async () => {
    const text = "라프산두 자세 설정 " + JSON.stringify(cfg);
    try { await navigator.clipboard.writeText(text); flash("복사했어요. 대화창에 붙여 보내 주세요"); }
    catch (e) { prompt("아래 글을 복사해 주세요", text); }
  };
  panel.addEventListener("keydown", (e) => e.stopPropagation());   // 창 안에서 누른 키가 게임으로 가지 않게
  const order = Object.keys(CLIP_NAMES);
  panel.clips = ["rest", ...clipList].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
}

function flash(msg) {
  const n = panel.querySelector(".pp-note");
  n.textContent = msg;
  setTimeout(() => (n.textContent = "바꾸면 바로 저장돼요. 마음에 들면 '설정 복사' 후 붙여 보내 주세요."), 3000);
}

function render() {
  panel.querySelectorAll("[data-move]").forEach((b) => b.classList.toggle("on", b.dataset.move === previewMove));
  panel.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === previewView));
  const c = cfg[previewMove];
  const opts = panel.clips.map((n) => `<option value="${n}" ${n === c.clip ? "selected" : ""}>${CLIP_NAMES[n] || n}</option>`).join("");
  const slider = (key, label, min, max, step, fmt) => `
    <label class="pp-row"><span>${label}</span>
      <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${c[key]}">
      <output>${fmt(c[key])}</output></label>`;
  const pct = (v) => Math.round(v * 100) + "%";
  panel.querySelector(".pp-body").innerHTML = `
    <label class="pp-row"><span>동작</span><select data-key="clip">${opts}</select></label>
    ${slider("speed", "빠르기", 0.4, 1.6, 0.05, (v) => (+v).toFixed(2) + "배")}
    <h4>덧씌우는 자세</h4>
    ${slider("hunch", "상체 숙이기", 0, 1, 0.05, pct)}
    ${slider("rightHand", "오른손 바지춤", 0, 1, 0.05, pct)}
    ${slider("leftArm", "왼팔 차분하게", 0, 1, 0.05, pct)}
    ${slider("stand", "차렷 팔 + 숨쉬기", 0, 1, 0.05, pct)}
    <p class="pp-hint">0% = Tripo 동작 그대로 · 100% = 덧씌운 자세로 완전히</p>`;
  panel.querySelectorAll(".pp-body [data-key]").forEach((el) => {
    el.oninput = () => {
      const k = el.dataset.key;
      c[k] = k === "clip" ? el.value : +el.value;
      const out = el.parentElement.querySelector("output");
      if (out) out.textContent = k === "speed" ? (+el.value).toFixed(2) + "배" : Math.round(el.value * 100) + "%";
      save();
    };
  });
}
