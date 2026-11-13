// POV 숨바꼭질 — 1단계(회색 상자 버전): 건물 · 조작 · 숨고 도망가는 AI · 잡기 · 시간 기록
import * as THREE from "three";
import { Octree } from "three/addons/math/Octree.js";
import { FH, CS, DOORS, BUILD_H, roomAt, findChar, ROOMS } from "./map.js";
import { buildNav, nodeAt, bfs } from "./nav.js";
import { buildWorld } from "./world.js";
import { Player, OUTRO_LEN } from "./player.js";
import { Runner } from "./ai.js";
import { UI, fmt } from "./ui.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { loadManifest, attachEnvironment } from "./assets.js";
import { loadCharacters, makeModel, makeArm, charactersReady } from "./chars.js";
import { Capsule } from "three/addons/math/Capsule.js";
import * as rank from "./ranking.js";
import { buildCollision, FastOctree } from "./collide.js";
import { openPanel, closePanel, panelOpen } from "./pose.js";
import { initSound, unlock as unlockSound, play as playSound, step as stepSound, toggleMute, duration as soundDuration, stop as stopSound } from "./sound.js";
import { createIntro } from "./intro.js";

const $ = (id) => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById("app").appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1d22);
scene.fog = new THREE.Fog(0x1b1d22, 18, 55);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 200);
initSound(camera);
scene.add(camera);
const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3a44, 0.7);
scene.add(hemi);
// 결과 연출용 조명: 방 전체를 밝히는 천장 쪽 큰 빛 (평소에는 꺼 둠). 값은 __pov.OUTRO_LIGHT 로 바꿔 볼 수 있다
const OUTRO_LIGHT = { hemi: 1.0, room: 0, exposure: 1.05, gamma: 1.5, bloom: 0.12 };   // bloom: 흰 옷이 뿌옇게 번지지 않게
const outroLight = new THREE.PointLight(0xfff1de, 0, 16, 1.1);
scene.add(outroLight);
// 은은한 주변 반사 (PBR 재질이 밋밋하지 않게). 따로 받는 파일 없이 three.js 기본 '방' 환경을 쓴다
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

// 화면 효과: 구석 그늘(GTAO) · 빛 번짐(Bloom) · 색 보정(Output). Q 로 화질 높음/낮음
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.blendIntensity = 0.85;
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.4, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// 결과 연출 때만: 어두운 곳을 끌어올린다 (감마). 1 은 1 그대로라 이미 밝은 흰 옷은 더 날아가지 않는다.
// 건물 밝기는 텍스처에 구워져 있어서 조명을 더해도 거의 안 밝아진다 → 화면 자체를 보정
const brighten = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, gamma: { value: 1 } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: "uniform sampler2D tDiffuse; uniform float gamma; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); gl_FragColor = vec4(pow(max(c.rgb, 0.0), vec3(1.0 / gamma)), c.a); }",
});
brighten.enabled = false;
composer.addPass(brighten);
// 기본은 '보통'(구석 그늘은 Blender 에서 구워 넣었으니 화면 효과는 끈다). Q 로 '높음'을 켜면 GTAO + 선명한 해상도
let quality = "normal";
try { quality = localStorage.getItem("pov-quality2") || "normal"; } catch (e) { }
const applyQuality = () => { gtao.enabled = quality === "high"; bloom.enabled = true; renderer.setPixelRatio(quality === "high" ? Math.min(devicePixelRatio, 2) : 1); composer.setPixelRatio(renderer.getPixelRatio()); };
applyQuality();

const world = buildWorld(scene);
const octree = new FastOctree();
octree.fromGraphNode(world.solid);
const nav = buildNav();

const game = {
  scene, camera, world, nav,
  ray: new THREE.Raycaster(),
  dP: null, playerNode: -1,
  hideSpots: nav.nodes.filter((n) => n.ch === "H").map((n) => n.id),
  runners: [],
};
game.ui = new UI(game);
const player = new Player(scene, camera, octree, world.solid);
game.player = player;
game.sound = { play: playSound, step: stepSound, duration: soundDuration, stop: stopSound };

// 시작 자리: 건물 밖 길. 정문을 바라본다(-z). 나중에 '문 열고 들어가기' 장면이 여기서 시작
const P = findChar("P")[0];
const start = { x: (P.x + 0.5) * CS, y: 0, z: (P.y + 0.5) * CS };
player.home = start;
player.spawn(start.x, start.y + 0.05, start.z);
player.yaw = 0;

// 숨는 사람 배치: 층마다 한 명씩 (순서는 무작위), 정문에서 충분히 먼 숨는 자리
const front = DOORS.find((d) => d.front);
const fromStart = bfs(nav, nav.at(front.k, front.x, front.y));
const kinds = ["jeffrey", "mason", "kid"].sort(() => Math.random() - 0.5);
kinds.forEach((kind, k) => {
  const spots = game.hideSpots.filter((h) => nav.nodes[h].k === k && fromStart[h] > 10);
  const id = spots[Math.floor(Math.random() * spots.length)];
  const r = new Runner(game, kind, id);
  r.home = id;
  game.runners.push(r);
  if (kind === "mason") game.mason = r;
});
const dj = findChar("D")[0];
if (dj) game.runners.push(new Runner(game, "matthew", nav.at(dj.k, dj.x, dj.y)));
// ---- 불러오는 중 화면 ----
// 건물 · 캐릭터 · 소리 파일을 받는 동안 진행 막대를 보여 주고, 건물(+충돌)과 캐릭터가 준비되면 걷어 낸다.
// 시작 화면 애니메이션은 그때부터 재생된다(body.ready).
const loadState = { chars: false, env: false, shown: 0 };
THREE.DefaultLoadingManager.onProgress = (url, done, total) => { loadState.files = [done, total]; updateLoading(); };
function updateLoading() {
  const [d, t] = loadState.files || [0, 1];
  const pct = Math.round(((d / Math.max(1, t)) * 0.8 + (loadState.chars ? 0.1 : 0) + (loadState.env ? 0.1 : 0)) * 100);
  loadState.shown = Math.max(loadState.shown, Math.min(pct, 99));
  $("loadBar").style.width = loadState.shown + "%";
  $("loadPct").textContent = loadState.shown + "%";
  if (loadState.chars && loadState.env && !document.body.classList.contains("ready")) {
    $("loadBar").style.width = "100%"; $("loadPct").textContent = "100%";
    setTimeout(() => { document.body.classList.add("ready"); $("loading").classList.add("gone"); $("btnStart").disabled = false; }, 350);
  }
}
$("btnStart").disabled = true;

// 캐릭터 모델 · 동작 불러오기 → 다 되면 캡슐을 모델로 바꾼다
let clipNames = [];
loadCharacters().then((names) => {
  console.log("[chars] 동작", names.length);
  clipNames = names;
  player.attachModel(makeModel("rapsandu"));
  for (const r of game.runners) r.attachModel(makeModel(r.kind));
}).catch((e) => console.warn("[chars] 못 읽음", e)).finally(() => { loadState.chars = true; updateLoading(); });

// Blender 건물(있으면) 불러오기. 없으면 회색 상자 그대로
loadManifest().then((m) => m && attachEnvironment(scene, world, m.env, m.version)).then((n) => {
  if (!n) return;
  console.log("[assets] 건물 GLB", n);
  // 충돌을 보이는 건물 모양으로 바꾼다 (회색 상자는 시야 검사 · 카메라용으로만 남는다)
  const c = buildCollision(world, world.envRoots || []);
  if (c) { player.octree = c.oct; console.log("[collide] 가구 삼각형", c.used, "→ 상자", c.furniture, "+ 소품", c.props, c.ms + "ms"); }
}).catch((e) => console.warn("[assets] 건물 못 읽음", e)).finally(() => { loadState.env = true; updateLoading(); });

const targets = () => game.runners.filter((r) => r.kind !== "clone" && r.kind !== "matthew");
game.ui.setTargets(targets());

// ---- 입력 ----
const keys = {};
addEventListener("keydown", (e) => {
  // 닉네임을 적는 중에는 게임 키(M 소리 · Q 화질 · P 멈춤 등)로 받지 않는다
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  keys[e.code] = true;
  // Alt 누르고 있는 동안 둘러보기 (몸은 그대로, 카메라만). 브라우저 메뉴가 열리지 않게 막는다
  if (e.code === "AltLeft" || e.code === "AltRight") { e.preventDefault(); if (state === "play") player.freeLook = true; }
  if (e.code === "KeyQ") {
    quality = quality === "high" ? "normal" : "high";
    try { localStorage.setItem("pov-quality2", quality); } catch (er) { }
    applyQuality();
    game.ui.bubble("player", "화질: " + (quality === "high" ? "높음 (무거움)" : "보통"), 1.2);
  }
  // 마우스 감도: [ 둔하게 · ] 빠르게 (이 컴퓨터에 저장)
  if ((e.code === "BracketLeft" || e.code === "BracketRight") && state === "play") {
    player.sens = Math.max(0.2, Math.min(3, +(player.sens * (e.code === "BracketLeft" ? 0.85 : 1.18)).toFixed(2)));
    try { localStorage.setItem("pov-sens", player.sens); } catch (er) { }
    game.ui.bubble("player", "마우스 감도 " + player.sens.toFixed(2), 1.0);
  }
  // P: 라프산두 자세 설정 창 (마우스 잠금을 풀고 연다)
  if (e.code === "Space" && state === "intro") intro.skip();
  if (e.code === "KeyP") pauseGame();
  if (e.code === "KeyM") game.ui.bubble("player", toggleMute() ? "소리 끔 (M)" : "소리 켬 (M)", 1.2);
  if (e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => {
  keys[e.code] = false;
  if (e.code === "AltLeft" || e.code === "AltRight") { e.preventDefault(); player.freeLook = false; }
});
addEventListener("blur", () => { for (const k in keys) keys[k] = false; player.freeLook = false; player.holding = false; });
document.addEventListener("mousemove", (e) => { if (state === "play") player.look(e.movementX, e.movementY); });
// 좌클릭을 누르고 있는 동안 팔을 뻗은 채로 움직인다. 손이 닿으면 잡힌다
document.addEventListener("mousedown", (e) => { if (state === "play" && e.button === 0) player.holding = true; });
document.addEventListener("mouseup", (e) => { if (e.button === 0) player.holding = false; });

let state = "start", elapsed = 0, opened = false;
const intro = createIntro({ player, camera, world, ui: game.ui });
// 인트로 뒤로는 '예아 브뤄 암마 고 할ㄷ 허! 대체 너 어디야!!!!!'를 반복: 소리가 끝나고 3초 뒤에 다시 (사용자 결정)
const SHOUT_REST = 3;
let shoutT = 3;
function endIntro() {
  $("intro").hidden = true;
  if (state === "intro") state = "play";
  $("hud").hidden = false;
  $("hint").hidden = false; setTimeout(() => ($("hint").hidden = true), 7000);
}
$("intro").onclick = () => { if (state === "intro") intro.skip(); };
// 게임처럼 마우스 가속 없는 원래 움직임(raw)으로 잠근다. 안 되면 이번 판은 보통 잠금으로.
// 잠금이 실패해도 조용히 멈추지 않게 버튼 글자로 알려 준다
let useRaw = true;
const btnLabel = $("btnStart").textContent;
const retry = () => { $("btnStart").textContent = "한 번 더 눌러 주세요"; };
document.addEventListener("pointerlockerror", retry);
const plainLock = () => {
  try { const q = renderer.domElement.requestPointerLock(); if (q && q.catch) q.catch(retry); } catch (e) { retry(); }
};
const lock = () => {
  $("btnStart").textContent = btnLabel;
  if (!useRaw) return plainLock();
  let p = null;
  try { p = renderer.domElement.requestPointerLock({ unadjustedMovement: true }); } catch (e) { p = Promise.reject(e); }
  if (p && p.catch) p.catch(() => {
    useRaw = false;
    plainLock();
  });
};
$("btnStart").onclick = () => { unlockSound(); lock(); };
$("pause").onclick = (e) => { if (e.target === $("pause")) lock(); };   // 카드 밖(어두운 곳)을 눌러도 이어서
$("btnResume").onclick = (e) => { e.stopPropagation(); lock(); };
// 다시 하기: 처음 사이트를 켰을 때와 똑같이 (시작 화면 → 인트로 → 게임). 2026-11-13 사용자 결정
function restart() { location.reload(); }
$("btnRestart").onclick = (e) => { e.stopPropagation(); restart(); };
// 멈춤: 버튼(작게) · P 키 · Esc
function pauseGame() { if (state === "play") { document.exitPointerLock(); state = "pause"; $("pause").hidden = false; } }
$("btnPause").onclick = (e) => { e.stopPropagation(); pauseGame(); };
let skipIntro = false;
try { skipIntro = sessionStorage.getItem("pov-skip-intro") === "1"; sessionStorage.removeItem("pov-skip-intro"); } catch (er) { }
// (1인칭 · P 자세 설정 창은 2026-11-12 사용자 결정으로 뺐다. 자세는 js/pose.js DEFAULT 로 고정)
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked && (state === "start" || state === "pause")) {
    $("start").hidden = true; $("pause").hidden = true;
    if (!opened && skipIntro) {
      // '다시 하기'로 온 판: 인트로 없이 로비에서 바로
      opened = true;
      intro.finish();
      endIntro();
      state = "play";
      return;
    }
    if (!opened) {
      // 처음 한 번: 시작 인트로 (라프산두가 밤거리를 걸어와 유리문을 열고 들어옴)
      opened = true;
      state = "intro";
      $("intro").hidden = false;
      intro.start();
      return;
    }
    state = "play"; $("hud").hidden = false;
  } else if (!locked && state === "intro") {
    intro.skip(); endIntro();
    state = "pause"; $("pause").hidden = panelOpen();
  } else if (!locked && state === "play") {
    state = "pause"; $("pause").hidden = panelOpen();
  }
});

// ---- 잡기 ----
function tryGrab() {
  if (!player.reaching) return;
  const e = player.eye(), f = player.forward(), feet = player.feet();
  let best = null, bd = 1e9;
  for (const r of game.runners) {
    if (!r.catchable || r.caught) continue;
    const dx = r.pos.x - e.x, dz = r.pos.z - e.z;
    const h = Math.hypot(dx, dz);
    // 손이 실제로 닿는 거리: 내 몸(0.42) + 팔(약 0.75) + 상대 몸(약 0.35)
    if (h > 1.5 || Math.abs(r.pos.y - feet.y) > 1.2) continue;
    if (h > 0.6 && (dx * f.x + dz * f.z) / h < 0.7) continue;   // 앞쪽(약 45도 안)만
    const to = new THREE.Vector3(r.pos.x, r.pos.y + 1.0, r.pos.z);
    game.ray.set(e, to.clone().sub(e).normalize()); game.ray.far = e.distanceTo(to);
    if (game.ray.intersectObjects(world.solid.children, false).length) continue;
    if (h < bd) { bd = h; best = r; }
  }
  if (!best) return;
  const real = best.catchMe();
  game.ui.setTargets(targets());   // 메이슨홈 · 풀업보이가 바뀌었을 수도 있으니 늘 새로
  if (real) {
    playSound("catch", { volume: 0.8 });
    // 마지막 사람: 잡힌 자세(앉기)를 약 1.2초 보여 준 뒤 결과 연출로. 기록 시간은 잡은 순간에 멈춘다
    if (targets().every((r) => r.caught)) { if (finishIn < 0) finishIn = 1.2; }
    else game.ui.bubble("player", "하나 잡았다!", 1.2);
  }
}

// ---- 기록 (이 컴퓨터에만 저장. 전체 순위는 다음 단계에서 서버에) ----
const KEY = "pov-hide-records";
const loadRecords = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
function saveRecord(t) {
  const list = loadRecords();
  list.push({ t, d: new Date().toISOString().slice(0, 10) });
  list.sort((a, b) => a.t - b.t);
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10))); } catch (e) { }
  return list;
}
function renderRecords(el, list, mine) {
  el.innerHTML = list.length
    ? list.slice(0, 10).map((r, i) => `<li class="${r === mine ? "mine" : ""}"><b>${i + 1}</b> ${fmt(r.t)} <small>${r.d}</small></li>`).join("")
    : "<li>아직 기록이 없어요</li>";
}
renderRecords($("startRecords"), loadRecords());
// ---- 전체 순위 (온라인) ----
const isTest = /[?&]test(&|$)/.test(location.search);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function renderOnline(el, rows, me) {
  if (!rows) { el.innerHTML = '<li class="empty">불러오는 중…</li>'; return; }
  if (!rows.length) { el.innerHTML = '<li class="empty">아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요!</li>'; return; }
  let marked = false;
  el.innerHTML = rows.slice(0, rank.RANK_N).map((r, i) => {
    const mine = me && !marked && r.n === me.n && r.s === me.s;
    if (mine) marked = true;
    return `<li class="${mine ? "mine" : ""}"><b>${i + 1}</b><span class="who">${esc(r.n)}</span><span class="tm">${fmt(r.s / 1000)}</span></li>`;
  }).join("");
  const m = el.querySelector(".mine");
  if (m) m.scrollIntoView({ block: "nearest" });
}
async function refreshOnline(el) {
  renderOnline(el, null);
  try { renderOnline(el, await rank.loadTop()); }
  catch (e) { el.innerHTML = '<li class="empty">순위를 불러오지 못했어요</li>'; }
}
// 탭: 전체 순위 / 이 컴퓨터
for (const tabs of document.querySelectorAll(".rank-tabs")) {
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    e.stopPropagation();
    for (const x of tabs.querySelectorAll("button")) x.classList.toggle("on", x === b);
    for (const ol of tabs.parentElement.querySelectorAll("ol[data-tab]")) ol.hidden = ol.dataset.tab !== b.dataset.tab;
  });
}
refreshOnline($("startOnline"));
// 결과 화면: 닉네임 등록
let resultMs = 0, submitted = false;
$("nameIn").value = rank.loadName();
$("nameForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (submitted) return;
  const name = $("nameIn").value.trim();
  if (!name) { $("submitMsg").textContent = "닉네임을 적어 주세요"; $("nameIn").focus(); return; }
  rank.saveName(name);
  $("btnSubmit").disabled = true; $("submitMsg").textContent = "등록하는 중…";
  try {
    const rows = await rank.submit(name, resultMs);
    submitted = true;
    $("nameForm").hidden = true;
    const me = { n: name.slice(0, 10), s: Math.round(resultMs) };
    const at = rows.findIndex((x) => x.n === me.n && x.s === me.s);
    $("submitMsg").textContent = at >= 0 && at < rank.RANK_N ? `전체 ${at + 1}등으로 올라갔어요!` : `등록했어요 (${rank.RANK_N}등 밖)`;
    renderOnline($("resultOnline"), rows, me);
    $("resultRecords").parentElement.querySelector('[data-tab="online"]').click();
  } catch (err) {
    $("btnSubmit").disabled = false;
    $("submitMsg").textContent = rank.ERR_TEXT[err.message] || "등록하지 못했어요. 인터넷 연결을 확인해 주세요";
  }
});
// 제목 글자를 한 글자씩 떨어지게 (CSS .ch)
for (const el of document.querySelectorAll(".logo .word")) {
  el.innerHTML = [...el.textContent].map((c, i) => `<span class="ch" style="--i:${i}">${c === " " ? "&nbsp;" : c}</span>`).join("");
}
// 시작 화면 배경: 밤거리, 정문(POV 간판) 앞에 라프산두가 서 있고 카메라가 천천히 옆으로 흐른다
let titleT = 0;
function titleScene(dt) {
  titleT += dt;
  const fd = world.frontDoor;
  const cx = fd ? fd.center.x : 11.25, cz = fd ? fd.center.z : 30;
  const p = new THREE.Vector3(cx + 1.2, 0, cz + 3.2);
  player.spawn(p.x, 0.05, p.z);
  player.body.position.copy(p); player.body.rotation.set(0, Math.PI - 0.35, 0); player.body.visible = true;
  if (player.armVM) player.armVM.obj.visible = false;
  player.hand.visible = false;
  if (player.model) { player.model.play("standing_relax", 1, 0.4); player.model.setOverlay({}); player.model.reach(0); player.model.update(dt); }
  const s = Math.sin(titleT * 0.08);
  camera.position.set(cx + 4 + s * 3.5, 1.9 + Math.sin(titleT * 0.11) * 0.25, cz + 9.5 - s * 1.2);
  camera.lookAt(cx + 0.6 + s * 0.8, 2.0, cz);
}

// 다 잡았다: 바로 결과 창 대신 약 5초 연출 (클릭하면 건너뜀) → 결과 창
let outroT = 0;
let shoutAudio = null;
// 세레모니 관객: 라프산두 앞쪽, 조금 떨어진 곳에 다섯 명이 앉아서 본다 (게임 속 캐릭터와 따로 새로 만든 모델)
const AUDIENCE = ["kid", "jeffrey", "mason", "clone", "matthew"];   // 라프산두가 볼 때 왼쪽 → 오른쪽
let audience = [];
// 관객 의자 (검은 접이식 의자 느낌). 원점 = 바닥, 앉는 면 높이 SEAT, 등받이는 +z(뒤)
const SEAT = 0.5;
function makeChair() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.55, metalness: 0.4 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.44), mat);
  seat.position.y = SEAT - 0.025;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.38, 0.04), mat);
  back.position.set(0, SEAT + 0.22, 0.21);
  g.add(seat, back);
  for (const [x, z] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, SEAT - 0.05, 6), mat);
    leg.position.set(x, (SEAT - 0.05) / 2, z);
    g.add(leg);
  }
  return g;
}
function seatAudience() {
  if (!charactersReady()) return;
  const f = player.feet();
  const k = Math.max(0, Math.min(2, Math.floor((f.y + 0.6) / FH)));
  const myRoom = roomAt(k, Math.floor(f.x / CS), Math.floor(f.z / CS));
  // 다섯 자리가 모두 같은 방 바닥 위에 오는 방향 · 거리를 고른다 (멀수록 좋게)
  const spots = (yaw, D) => {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;   // 앞 · 오른쪽
    return AUDIENCE.map((_, i) => {
      const lat = (i - 2) * 1.15;
      const x = f.x + fx * D + rx * lat, z = f.z + fz * D + rz * lat;
      // 같은 방 · 걸을 수 있는 칸 · 가구와 안 겹침 (엉덩이 높이의 작은 캡슐로 확인)
      const ok = roomAt(k, Math.floor(x / CS), Math.floor(z / CS)) === myRoom && nodeAt(nav, x, f.y, z) >= 0
        && !(player.octree && player.octree.capsuleIntersect(new Capsule(new THREE.Vector3(x, f.y + 0.45, z), new THREE.Vector3(x, f.y + 0.9, z), 0.38)));
      return { x, z, ok };
    });
  };
  let best = null;
  for (const D of [5.2, 4.6, 4.0, 3.5]) {
    for (let a = 0; a < 16; a++) {
      const yaw = player.yaw + (a * Math.PI) / 8;
      const sp = spots(yaw, D);
      const n = sp.filter((p) => p.ok).length;
      if (!best || n > best.n) best = { n, yaw, sp };
      if (n === AUDIENCE.length) break;
    }
    if (best.n === AUDIENCE.length) break;
  }
  player.yaw = best.yaw;
  audience = AUDIENCE.map((kind, i) => {
    const m = makeModel(kind);
    if (!m) return null;
    const p = best.sp[i];
    m.obj.position.set(p.x, f.y, p.z);
    m.obj.rotation.y = Math.atan2(-(f.x - p.x), -(f.z - p.z));   // 라프산두 쪽을 본다
    m.play("sit", 1, 0);
    m.update(Math.random() * 2);   // 다섯이 똑같이 움직이지 않게
    scene.add(m.obj);
    // 엉덩이 밑에 의자 (앉는 동작이 의자에 앉는 자세라서)
    m.obj.updateMatrixWorld(true);
    let hips = null;
    m.obj.traverse((o) => { if (!hips && /Hips$/.test(o.name)) hips = o; });
    const chair = makeChair();
    if (hips) { const h = m.obj.worldToLocal(hips.getWorldPosition(new THREE.Vector3())); chair.position.set(h.x, 0, h.z + 0.04); }
    m.obj.add(chair);
    return m;
  }).filter(Boolean);
  // 이름표는 게임 중에만
  for (const el of document.querySelectorAll(".nametag")) el.style.display = "none";
}   // 지금 나오는 '대체 너 어디야' (세레모니 때 끊는다)
let finishIn = -1;   // 0 이상이면 마지막 사람을 잡고 결과 연출까지 남은 시간
function finish() {
  state = "outro"; outroT = 0;
  player.holding = false;
  document.exitPointerLock();
  // 잡힌 애들 · 매튜는 숨기고 라프산두만. 좁은 곳에서 잡았을 수도 있으니 그 층에서 가장 넓은 방 가운데로 옮긴다
  for (const r of game.runners) r.mesh.visible = false;
  game.ui.clearBubbles && game.ui.clearBubbles();
  const k = Math.max(0, Math.min(2, Math.floor((player.feet().y + 0.6) / FH)));
  const big = ROOMS.filter((r) => r.k === k && r.type !== "hall" && r.type !== "stair")
    .sort((a, b) => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) - (a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1))[0];
  if (big) {
    const cx = (big.x0 + big.x1 + 1) / 2, cy = (big.y0 + big.y1 + 1) / 2;
    const n = nodeAt(nav, cx * CS, k * FH, cy * CS);
    const p = n >= 0 ? nav.nodes[n].p : { x: cx * CS, y: k * FH, z: cy * CS };
    player.spawn(p.x, p.y + 0.05, p.z);
  }
  $("hud").hidden = true; $("hint").hidden = true;
  $("outroTime").textContent = fmt(elapsed);
  $("outro").hidden = false;
  // 세레모니: 담배 피우기 (Mixamo Smoking). 못 불러왔으면 예전 응원 동작
  player.setCrouch(false); player.holding = false;
  // 세레모니 노래 = 인트로 노래 그대로 (말풍선 없이). 외치던 소리는 끊는다
  stopSound(shoutAudio); shoutAudio = null;
  playSound("rap_intro", { volume: 1 });
  if (player.model) { const ok = player.model.clipDuration("smoke") > 1; player.model.play(ok ? "smoke" : "cheer", 1, 0.3); player.model.setMic(false); player.model.setCig(ok); }
  seatAudience();
  // 밝게: 라프산두 머리 위 천장 쪽에 큰 빛 + 하늘빛 · 노출 올림
  const pf = player.feet();
  outroLight.position.set(pf.x, pf.y + 2.9, pf.z);
  outroLight.intensity = OUTRO_LIGHT.room;
  hemi.intensity = OUTRO_LIGHT.hemi;
  renderer.toneMappingExposure = OUTRO_LIGHT.exposure;
  brighten.uniforms.gamma.value = OUTRO_LIGHT.gamma; brighten.enabled = true;
  bloom.strength = OUTRO_LIGHT.bloom;
}
$("outro").onclick = () => showResult();
function showResult() {
  if (state !== "outro") return;
  $("outro").hidden = true;
  state = "end";
  // ?test(자동 시험)로 연 판은 기록을 남기지 않는다 — 같은 브라우저의 진짜 기록을 더럽히지 않게
  // 1초도 안 걸린 판(시험용)도 기록하지 않는다
  const list = /[?&]test(&|$)/.test(location.search) || elapsed < 1 ? loadRecords() : saveRecord(elapsed);
  const mine = list.find((r) => r.t === elapsed);
  $("hud").hidden = true; $("result").hidden = false;
  // 시간이 0 에서 기록까지 빠르게 올라간다
  const t0 = performance.now(), dur = 1300;
  const count = () => {
    const k = Math.min(1, (performance.now() - t0) / dur);
    $("resultTime").textContent = fmt(elapsed * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(count);
  };
  count();
  const rank = list.indexOf(mine) + 1;
  $("resultRank").textContent = rank > 0 ? "이 컴퓨터 기록 중 " + rank + "등" : "";
  $("resultBadge").hidden = rank !== 1 || list.length < 2;
  renderRecords($("resultRecords"), list, mine);
  // 전체 순위: 시험 판 · 15초 안 판은 등록 칸을 숨긴다
  resultMs = elapsed * 1000;
  const can = !isTest && resultMs >= rank.MIN_MS;
  $("nameForm").hidden = !can;
  $("submitMsg").textContent = can ? "닉네임을 적고 전체 순위에 올려 보세요" : isTest ? "시험 판(?test)은 순위에 올리지 않아요" : "";
  refreshOnline($("resultOnline"));
}
$("btnAgain").onclick = () => restart();

// ---- 반복 ----
const clock = new THREE.Clock();
let djT = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (state === "play") {
    if (finishIn < 0) elapsed += dt;
    else { finishIn -= dt; if (finishIn <= 0) { finishIn = -1; finish(); } }
    // 방금 결과 연출로 넘어갔으면 이번 프레임에 걷기 · 앉기 동작을 다시 틀지 않는다 (랩 세레모니를 덮어써 버림)
    if (state === "play") player.update(dt, keys);
    if (state === "play" && player.holding) tryGrab();
    shoutT -= dt;
    if (shoutT <= 0) {
      const len = soundDuration("rap_shout") || 2.6;
      shoutT = len + SHOUT_REST;
      shoutAudio = playSound("rap_shout", { volume: 0.85 });
      game.ui.bubble("player", "예아 브뤄 암마 고 할ㄷ 허! |대체 너 어디야!!!!!", len);
    }
    world.updateLamps(camera.position);
    const f = player.feet();
    const n = nodeAt(nav, f.x, f.y, f.z);
    if (n >= 0 && n !== game.playerNode) { game.playerNode = n; game.dP = bfs(nav, n); }
    if (game.dP) for (const r of game.runners) r.update(dt);
    game.ui.setTime(elapsed);
    const fk = Math.max(0, Math.min(2, Math.floor((f.y + 0.6) / FH)));
    const room = roomAt(fk, Math.floor(f.x / CS), Math.floor(f.z / CS));
    game.playerRoom = room;   // 숨은 애들은 술래가 '자기 방'에 들어와야 도망간다
    game.ui.setFloor(f.z / CS >= BUILD_H ? "건물 앞" : (fk + 1) + "층" + (room && room.type !== "hall" ? " · " + room.name : ""));
  } else if (state === "intro") {
    intro.tick(dt);
    if (intro.done) endIntro();
  } else if (state === "outro") {
    outroT += dt;
    player.outroTick(dt, outroT);   // 게임 속 캐릭터는 숨겨 두고, 관객(새 모델)만 움직인다
    for (const m of audience) m.update(dt);
    if (outroT > OUTRO_LEN) showResult();
  } else {
    if (state === "start") titleScene(dt);
    else if (state === "end") { outroT += dt; player.outroTick(dt, outroT % OUTRO_LEN); for (const m of audience) m.update(dt); }   // 결과 화면 뒤에서도 계속 돈다
    else if (panelOpen()) player.previewTick(dt); else player.placeCamera();
  }
  if (world.djLight) { djT += dt; world.djLight.color.setHSL((djT * 0.3) % 1, 1, 0.55); }
  game.ui.update(dt);
  composer.render();
}
frame();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// 확인용: 주소 끝에 ?test 를 붙이면 마우스 잠금 없이 바로 시작하고, 콘솔에서 __pov 로 만질 수 있다
if (/[?&]test\b/.test(location.search)) {
  window.__pov = {
    game, player, keys, tryGrab, renderer, composer, gtao, bloom, scene, camera, finish, intro, OUTRO_LIGHT, outroLight, hemi, brighten, setResultMs: (v) => { resultMs = v; },
    startIntro() { opened = true; state = "intro"; $("start").hidden = true; $("intro").hidden = false; intro.start(); },
    play() { state = "play"; $("start").hidden = true; $("hud").hidden = false; },
    get state() { return state; }, get elapsed() { return elapsed; },
  };
}
