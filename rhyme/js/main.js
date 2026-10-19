/* 라임놀이 — 화면과 진행.
   흐름: 첫 화면에서 인원·모드·비트 고르기 → 시작 → 준비 1마디 → 마디마다 문제.
   박자는 전부 engine.position() 에서 읽는다 (audio.js 참고).

   주소 옵션 (릴스 촬영·확인용)
     ?mode=1~4  ?players=1|2  ?beat=0~  ?len=3|mix  ?every=8  ?turn=4
     ?words=바지,가지,간지,사진   모드1 단어를 이 순서로 (4개씩 한 운)
     ?prompts=ㅏㅣ,ㅗㅣ          모드2~4 문제를 이 순서로
     ?go=1                        첫 화면 건너뛰고 바로 시작(소리는 화면을 한 번 눌러야 나는 브라우저도 있다) */

import { Engine } from "./audio.js";
import { BEATS } from "../beats/beats.js";
import { createSequencer, MIX } from "./prompts.js";
import { createTurntable, taegeukSVG, GENRE_EN } from "./turntable.js";

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const engine = new Engine();

const MODES = {
  1: { name: "단어 맞추기", ex: "바지 · 가지", how: "마디 끝에 단어가 떨어져요. 같은 운으로 네 마디." },
  2: { name: "모음 맞추기", ex: "ㅏ ㅣ", how: "모음 두 개, 그 소리로 네 마디를 채워요." },
  3: { name: "제시어 프리스타일", ex: "여행", how: "뜻밖의 단어로 새로운 이야기를 이어가요." },
  4: { name: "초성 프리스타일", ex: "ㅊ ㅊ", how: "빈칸을 채우는 너만의 한 수, 초성에 맞는 말을 뱉어요." },
};
const PROMPT_LABEL = { 2: "모음", 3: "제시어", 4: "초성" };
const PROMPT_EN = { 2: "VOWEL", 3: "KEYWORD", 4: "INITIAL" };
const ORD = ["첫째", "둘째", "셋째", "넷째"];

// 주소로 받은 단어는 화면(innerHTML)에 그대로 들어간다 → 태그가 될 수 있는 글자는 지운다
const list = k => (params.get(k) || "").split(",").map(s => s.replace(/[<>&"'`]/g, "").trim()).filter(Boolean);
const state = {
  players: params.get("players") === "2" ? 2 : 1,
  mode: Math.min(4, Math.max(1, +params.get("mode") || 1)),
  len: params.get("len") === "3" ? 3 : params.get("len") === "mix" ? MIX : 2,   // 제시어 글자 수 (MIX = 두·두·세 번갈아)
  every: params.get("every") === "8" ? 8 : 4,       // 혼자: 몇 마디마다 문제를 바꿀지 (제시어·초성)
  turn: params.get("turn") === "4" ? 4 : 2,         // 둘이 제시어: 한 사람당 몇 마디
  beat: Math.min(BEATS.length - 1, Math.max(0, +params.get("beat") || 0)),
  running: false,
  previewing: false,
  resumeAt: 0,         // 턴테이블을 돌린 뒤 새 비트가 시작되는 시각 — 그때까지 화면을 멈춘다
};
const custom = { 1: list("words") };
custom[2] = custom[3] = custom[4] = list("prompts");

/* ---------- 첫 화면 ---------- */

function renderHome() {
  document.querySelectorAll("#players button").forEach(b =>
    b.setAttribute("aria-pressed", String(+b.dataset.p === state.players)));

  $("#modes").innerHTML = Object.entries(MODES).map(([m, d]) => `
    <button class="mode" role="radio" data-mode="${m}" aria-checked="${+m === state.mode}">
      <i class="mode__no">${ORD[m - 1]} 판 / 0${m}</i>
      <b class="mode__name">${d.name}</b>
      <span class="mode__ex">${d.ex}</span>
    </button>`).join("");

  const d = MODES[state.mode];
  const how = state.players === 2 && state.mode === 3 ? "같은 제시어로 한 사람씩 번갈아 랩해요."
    : state.players === 2 && state.mode === 2 ? "같은 모음으로 한 사람씩 번갈아 랩해요." : d.how;
  let opts = `<p class="opts__desc"><b>놀이 방법</b>${how}</p>`;
  if (state.mode === 3) {
    // 글자 수 + (혼자: 몇 마디마다 바꿀지 / 둘이: 한 사람당 몇 마디) — 한 줄에 나란히
    opts += `<div class="opts__row">${toggle("len", [[2, "두 글자"], [3, "세 글자"], [MIX, "혼합"]])}${state.players === 1
      ? toggle("every", [[4, "4마디마다"], [8, "8마디마다"]])
      : toggle("turn", [[2, "두 마디씩"], [4, "네 마디씩"]])}</div>`;
  }
  if (state.mode === 2) {
    opts += state.players === 1
      ? toggle("every", [[4, "4마디마다"], [8, "8마디마다"]])
      : toggle("turn", [[2, "한 사람당 두 마디씩"], [4, "한 사람당 네 마디씩"]]);
  }
  if (state.mode === 4 && state.players === 1) opts += toggle("every", [[4, "4마디마다"], [8, "8마디마다"]]);
  // 둘이서 모음·제시어는 버튼(두 마디씩/네 마디씩)이 곧 설명이라 안내 줄을 생략 — 한 화면에 다 들어가게
  if (state.players === 2 && state.mode !== 2 && state.mode !== 3) opts += `<p class="opts__note">${turnNote()}</p>`;
  $("#opts").innerHTML = opts;
}

function toggle(key, items) {
  return `<div class="seg seg--small" role="group">${items.map(([v, t]) =>
    `<button data-opt="${key}" data-v="${v}" aria-pressed="${state[key] === v}">${t}</button>`).join("")}</div>`;
}

function turnNote() {
  if (state.mode === 1) return "두 마디씩 번갈아, 한 운을 둘이 나눠요";
  if (state.mode === 4) return "같은 초성으로 1P 네 마디 → 2P 네 마디";
  return "한 문제에 한 사람당 두 마디씩";
}

$("#players").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  state.players = +b.dataset.p;
  renderHome();
});
$("#modes").addEventListener("click", e => {
  const b = e.target.closest(".mode");
  if (!b) return;
  state.mode = +b.dataset.mode;
  renderHome();
});
$("#opts").addEventListener("click", e => {
  const b = e.target.closest("button[data-opt]");
  if (!b) return;
  state[b.dataset.opt] = +b.dataset.v;
  renderHome();
});

/* ---------- 턴테이블 ---------- */

// 판을 잡으면 비트를 줄이고, 긁는 속도대로 "휘끼휘끼". 놓으면 (충분히 긁었을 때) spin()
let scr = null;
const deckHooks = {
  onSpin: spin,
  onList: openBeats,
  async onGrab() {
    await engine.init();
    warmBeats();
    if (scr) scr.stop();
    scr = engine.scratchStart();
    engine.duck(true);
  },
  onScratch(v) { if (scr) scr.set(v); },
  onRelease(spins) {
    if (scr) { scr.stop(); scr = null; }
    if (!spins) engine.duck(false);
  },
};
const decks = [
  createTurntable($("#deckHome"), deckHooks),
  createTurntable($("#deckPlay"), deckHooks),
];
decks[0].info.append($("#start"));       // 시작 버튼은 첫 화면 턴테이블 오른쪽에
const setDecks = () => decks.forEach(d => d.set(BEATS[state.beat], state.beat));

// 첫 화면 미리 듣기 / 멈춤 — 소리 막대(eq)를 버튼 안에 넣는다
const previewBtn = document.createElement("button");
previewBtn.className = "deck__play";
previewBtn.append(decks[0].info.querySelector(".deck__eq"), document.createElement("span"));
decks[0].info.querySelector(".deck__title").after(previewBtn);
function setPreview(on) {
  state.previewing = on;
  decks.forEach(d => d.playing(on || state.running));
  previewBtn.lastChild.textContent = on ? "멈춤" : "▶ 들어보기";
  previewBtn.setAttribute("aria-pressed", String(on));
}
previewBtn.addEventListener("click", async () => {
  if (state.previewing) { engine.stop(); setPreview(false); return; }
  await engine.init();
  warmBeats();
  await playBeat(0, 0.1);
  setPreview(true);
});

// 비트를 못 틀면(파일을 못 읽는 브라우저 등) 다음 비트로 넘어간다 — 시작을 눌렀는데 멈춰 있지 않게
async function playBeat(firstBar, delay) {
  for (let n = 0; n < BEATS.length; n++) {
    try { return await engine.play(BEATS[state.beat], firstBar, delay); }
    catch (e) {
      console.warn("비트를 못 틀어 다음 비트로:", BEATS[state.beat].id, e);
      state.beat = (state.beat + 1) % BEATS.length;
      setDecks();
    }
  }
}

/* ---------- 비트 목록 ---------- */
// 첫 화면: 누르는 곡이 바로 재생(여러 곡 들어 보기) / 플레이 중: 다음 마디부터 그 비트로 바꾸고 닫힘

function openBeats() {
  renderBeats();
  $("#beatSheet").hidden = false;
  $("#beatList [aria-current='true']")?.scrollIntoView({ block: "nearest" });
  $("#beatSheetClose").focus();
}
function closeBeats() { $("#beatSheet").hidden = true; }

function renderBeats() {
  const on = state.previewing || state.running;
  $("#beatSheetSub").textContent = state.running ? "다음 마디부터 바뀌어요" : "누르면 바로 들려요";
  $("#beatList").innerHTML = BEATS.map((b, i) => `
    <li><button data-i="${i}" aria-current="${i === state.beat}">
      <span class="sheet__side">${String.fromCharCode(65 + i)}</span>
      <span class="sheet__name"><b>${b.title}</b><small>${GENRE_EN[b.genre] || b.genre} · ${b.shownBpm || b.bpm} BPM</small></span>
      ${i === state.beat && on ? `<span class="deck__eq sheet__eq" aria-label="재생 중"><i></i><i></i><i></i><i></i><i></i></span>` : ""}
    </button></li>`).join("");
}

$("#beatList").addEventListener("click", async e => {
  const b = e.target.closest("button[data-i]");
  if (!b) return;
  const i = +b.dataset.i;
  if (state.running) {
    closeBeats();
    if (i !== state.beat) spin({ to: i, quiet: true });
    return;
  }
  await engine.init();
  warmBeats();
  state.beat = i;
  setDecks();
  await playBeat(0, 0.05);
  setPreview(true);
  renderBeats();
});
$("#beatSheetClose").addEventListener("click", closeBeats);
$("#beatSheet").addEventListener("click", e => { if (e.target.id === "beatSheet") closeBeats(); });
addEventListener("keydown", e => { if (e.key === "Escape" && !$("#beatSheet").hidden) closeBeats(); });

// 아이폰은 손을 '뗄 때'(touchend·click)만 소리를 켜 준다 — 판을 잡는 pointerdown·떼는 pointerup 으론 안 켜져서
// 첫 화면에서 판부터 긁으면 비트가 안 나왔다. 어디든 손을 떼는 순간 소리를 켜 둔다(켜질 때까지 매번)
const unlockAudio = () => {
  if (engine.ctx && engine.ctx.state === "running") return;
  if (state.running && document.querySelector("#pause:not([hidden])")) return;   // 멈춤 안내는 그 버튼이 켠다
  engine.init().then(warmBeats).catch(() => {});
};
["touchend", "click", "keydown"].forEach(t => addEventListener(t, unlockAudio, true));

let spinVoice = null;      // 녹음해 둔 "DJ, spin that shit!" — 웹 오디오로 틀어야 아이폰에서도 난다(브라우저 음성은 막힌다)
let spinVoiceLoad = null;

async function spin({ scratched = false, to = null, quiet = false } = {}) {
  if (state.resumeAt && engine.now() < state.resumeAt) { engine.duck(false); return; }    // 이미 바꾸는 중
  await engine.init();
  state.beat = to ?? (state.beat + 1) % BEATS.length;
  setDecks();
  engine.stop();
  if (!quiet) {                            // 목록에서 고를 땐 조용히 바꾼다
    shout("디제이<br>스핀댓싯!", "spin");
    if (!scratched) engine.scratch();      // 손으로 긁었으면 이미 긁는 소리가 났다
    say();
  }
  const gap = quiet ? 0.15 : 1.1;
  if (state.running) {
    // 마디 번호는 이어 가고, 다음 마디부터 새 비트
    const next = Math.max(0, engine.position().bar) + 1;
    await playBeat(next, gap);
    state.resumeAt = engine.t0 + next * engine.barDur;
  } else {
    await playBeat(0, gap);                          // 첫 화면에선 미리 듣기
    setPreview(true);
    state.resumeAt = 0;
  }
}

function say() {
  const play = () => {
    const s = engine.ctx.createBufferSource();
    s.buffer = spinVoice;
    s.connect(engine.master);
    s.start(engine.ctx.currentTime + 0.25);
  };
  if (spinVoice) return play();
  if (!spinVoiceLoad) spinVoiceLoad = loadSpinVoice();
  // 아직 받는 중이면 받는 대로 (처음 판을 긁었을 때) — 못 받았을 때만 브라우저 음성
  spinVoiceLoad.then(() => spinVoice ? play() : speak());
}

function speak() {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance("DJ, spin that shit!");
  u.lang = "en-US"; u.rate = 1.1; u.pitch = 0.7;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// 진짜 비트 파일은 처음 틀 때 받아 오느라 늦다 — 소리를 켠 직후 미리 받아 둔다
let warmed = false;
function warmBeats() {
  if (warmed) return;
  warmed = true;
  BEATS.filter(b => b.file).forEach(b => engine.load(b).catch(() => {}));
  if (!spinVoiceLoad) spinVoiceLoad = loadSpinVoice();
}

async function loadSpinVoice() {
  try { spinVoice = await engine.decode("beats/dj-spin.mp3"); } catch {}
}

let shoutTimer = 0;
function shout(html, kind) {
  const el = $("#shout");
  el.innerHTML = html;
  el.className = "shout shout--" + kind;
  void el.offsetWidth;                     // 같은 애니메이션을 다시 틀기 위해
  el.classList.add("shout--on");
  clearTimeout(shoutTimer);
  shoutTimer = setTimeout(() => el.classList.remove("shout--on"), kind === "spin" ? 1300 : 900);
}

/* ---------- 플레이 ---------- */

let seq = null;
let view = null;        // 지금 마디·박 표시 상태
let slots = [];         // 공이 튈 칸들의 가운데 x, 위 y (stage 기준)

async function start() {
  holdScreen(true);                        // 누른 그 순간에 — 사파리는 손으로 누를 때만 허락한다
  await engine.init();
  engine.ctx.onstatechange = () => {       // 전화·알림 등으로 소리가 끊기면 멈춤 안내
    if (state.running && !document.hidden && engine.ctx.state !== "running") showPaused("away");
  };
  warmBeats();
  seq = createSequencer(state.mode, state.players, { len: state.len, every: state.every, turn: state.turn }, custom[state.mode]);
  $("#home").hidden = true;
  $("#play").hidden = false;
  $("#modeName").innerHTML = `<i>${ORD[state.mode - 1]} 판</i>${MODES[state.mode].name}${state.players === 2 ? "<small> · 둘이서</small>" : ""}`;
  document.body.dataset.players = state.players;
  view = { bar: null, beat: null };
  $("#ball").innerHTML = taegeukSVG(40);
  state.running = true;
  state.previewing = false;
  state.resumeAt = 0;
  decks.forEach(d => d.playing(true));
  drawBar(0);
  say();                                   // "스핀 댓 싯!" 버튼이니 외치고 시작
  await playBeat(0, 0.3);
  clock.ct = -1;
  requestAnimationFrame(frame);
}

function quit() {
  state.running = false;
  engine.stop();
  holdScreen(false);
  showPaused(null);
  if (engine.ctx && engine.ctx.state !== "running") engine.ctx.resume().catch(() => {});
  setPreview(false);
  $("#play").hidden = true;
  $("#home").hidden = false;
  delete document.body.dataset.player;
  renderHome();
}

$("#start").addEventListener("click", start);
$("#quit").addEventListener("click", quit);

/* ---------- 폰에서 놀 때: 화면 꺼짐 · 다른 앱 갔다 오기 · 소리 장치 ---------- */

// 랩하는 동안은 화면을 안 만진다 → 화면이 꺼지지 않게 붙잡아 둔다 (아이폰 16.4+, 안드로이드 크롬)
let wakeLock = null, wantLock = false;
async function holdScreen(on) {
  wantLock = on;
  try {
    if (on && !wakeLock && "wakeLock" in navigator) {
      const lock = await navigator.wakeLock.request("screen");
      if (!wantLock || wakeLock) return lock.release();   // 받는 사이에 그만했거나 이미 잡았으면
      wakeLock = lock;
      lock.addEventListener("release", () => { if (wakeLock === lock) wakeLock = null; });
    } else if (!on && wakeLock) {
      const lock = wakeLock;
      wakeLock = null;
      await lock.release();
    }
  } catch {}
}

// 다른 앱·탭으로 가면 그 자리에서 멈추고(오디오 시계가 서면 박자도 같이 선다), 돌아오면 눌러서 이어 한다
document.addEventListener("visibilitychange", () => {
  if (!engine.ctx) return;
  if (document.hidden) {
    if (state.running) engine.ctx.suspend().catch(() => {});
    else if (state.previewing) { engine.stop(); setPreview(false); }
  } else if (state.running && engine.ctx.state !== "running") {
    showPaused("away");
  }
});

function showPaused(kind) {
  const el = $("#pause");
  if (!kind) { el.hidden = true; return; }
  const stall = kind === "stall";
  el.querySelector("b").textContent = stall ? "소리가 멈췄어요" : "잠깐 멈췄어요";
  el.querySelector("span").textContent = stall ? "이어폰·스피커 연결을 확인하고 눌러 주세요" : "눌러서 이어 하기";
  el.hidden = false;
}
$("#pause").addEventListener("click", async () => {
  showPaused(null);
  holdScreen(true);                        // 숨겨지면 화면 잠금도 풀린다 — 다시 잡는다
  await engine.init();                     // 손으로 누른 지금 소리를 다시 켠다
  clock.ct = -1;
});

// 소리 장치가 연결만 되고 소리를 안 받으면(블루투스 이어폰 등) 오디오 시계가 멈춘 채 "running" 으로 남는다
const clock = { ct: -1, at: 0 };
function watchClock() {
  const c = engine.ctx, t = performance.now();
  if (c.state !== "running" || c.currentTime !== clock.ct) { clock.ct = c.currentTime; clock.at = t; return; }
  if (t - clock.at > 1500 && $("#pause").hidden) showPaused("stall");
}

function frame() {
  if (!state.running) return;
  requestAnimationFrame(frame);
  watchClock();
  const pos = engine.position();
  if (pos.total < 0) { placeBall(0, 0); return; }
  if (state.resumeAt && engine.now() < state.resumeAt) return;     // 판 바꾸는 중엔 멈춤
  if (pos.bar !== view.bar) drawBar(pos.bar);
  if (pos.beat !== view.beat) drawBeat(pos.bar, pos.beat);
  placeBall(pos.beat, pos.frac);
}

/* 마디가 바뀔 때 — 판 전체를 다시 그린다 */
function drawBar(bar) {
  view.bar = bar;
  view.beat = null;
  const now = seq.at(bar);
  const p = bar === 0 ? 0 : now.player;
  if (state.players === 2) {
    document.body.dataset.player = p + 1;
    $("#turn").textContent = (p + 1) + "P 차례";
    if (bar > 1 && now.turnStart) shout((p + 1) + "P!", "turn p" + (p + 1));
  } else {
    $("#turn").textContent = bar ? bar + "마디" : "준비";
  }
  if (bar === 0) drawReady();
  else if (state.mode === 1) drawRows(bar);
  else drawPrompt(bar, now);
  measureSlots();
}

const sealClass = c => "seal seal--" + c;

/* 준비 마디 — "다음 마디부터 시작" 을 크게, 첫 문제를 미리, 아래 칸에서 하나 둘 셋 넷 */
function drawReady() {
  const first = seq.at(1);
  const what = state.mode === 1 ? "첫 단어" : "첫 " + PROMPT_LABEL[state.mode];
  const text = state.mode === 1 ? first.word : first.prompt.text;
  $("#board").className = "board board--ready";
  $("#board").innerHTML = `
    <div class="ready">
      <p class="ready__kicker">판 까는 중 · READY</p>
      <h2 class="ready__title">다음 마디부터 <em>시작!</em></h2>
      ${state.players === 2 ? `<p class="ready__who">1P 먼저</p>` : ""}
      <p class="ready__first">${what} <span class="${sealClass(first.color)} seal--chip">${text}</span></p>
    </div>
    <div class="row row--now row--beats">
      ${[1, 2, 3, 4].map(n => `<div class="cell cell--count">${n}</div>`).join("")}
    </div>`;
}

function drawRows(bar) {
  // 지금 마디가 맨 위, 아래로 다음 마디 4개가 미리 보인다 (레퍼런스와 같은 방식)
  let html = `<div class="rows rows--slide">`;
  for (let b = bar; b < bar + 5; b++) {
    const a = seq.at(b);
    const who = state.players === 2 ? `data-p="${a.player + 1}P"` : "";
    const cls = "row" + (b === bar ? " row--now" : "") + (state.players === 2 ? " row--p" + (a.player + 1) : "");
    const cells = `<div class="cell"></div><div class="cell"></div><div class="cell"></div>
         <div class="${sealClass(a.color)}">${a.word}</div>`;
    html += `<div class="${cls}" ${who}>${cells}</div>`;
  }
  $("#board").innerHTML = html + `</div>`;
  $("#board").className = "board board--rows";
}

function drawPrompt(bar, now) {
  const a = now;
  const period = seq.rule.period;
  const left = period - a.inPeriod;
  const next = a.inPeriod === period - 1 ? seq.at(bar + 1).prompt.text : "";
  const changed = a.inPeriod === 0;
  $("#board").className = "board board--prompt";
  $("#board").innerHTML = `
    <p class="prompt__label">${PROMPT_LABEL[state.mode]} <span>${PROMPT_EN[state.mode]}</span></p>
    <div class="${sealClass(a.color)} seal--big${changed ? " seal--stamp" : ""}${state.mode === 3 && a.prompt.text.length > 2 ? " seal--long" : ""}">${a.prompt.text}</div>
    <div class="bars" aria-label="남은 마디 ${left}">
      ${Array.from({ length: period }, (_, i) =>
        `<i class="${i < a.inPeriod ? "done" : i === a.inPeriod ? "now" : ""}"></i>`).join("")}
    </div>
    <div class="row row--now row--beats">
      <div class="cell"></div><div class="cell"></div><div class="cell"></div><div class="cell"></div>
    </div>
    <p class="prompt__next">${next ? `다음 ▸ <b>${next}</b>` : "&nbsp;"}</p>`;
}

/* 박이 바뀔 때 — 지금 박 칸에 불을 켠다 */
function drawBeat(bar, beat) {
  view.beat = beat;
  const row = $("#board .row--now");
  if (!row) return;
  const cells = row.children;
  for (let i = 0; i < cells.length; i++) {
    cells[i].classList.toggle("lit", i === beat);
    cells[i].classList.toggle("past", i < beat);
  }
  // 준비 마디: 박마다 "시작!" 이 들썩
  if (bar === 0) {
    const t = $(".ready__title");
    t.classList.remove("ready__title--beat");
    void t.offsetWidth;
    t.classList.add("ready__title--beat");
  }
  // 모드1: 4번째 박에 단어 도장이 쾅
  if (state.mode === 1 && beat === 3 && bar > 0) cells[3].classList.add("seal--stamp");
  // 둘이서: 차례가 넘어가기 직전 마디 끝에서 미리 알림
  if (state.players === 2 && beat >= 2) {
    const nextP = seq.at(bar + 1).player;
    if (bar > 0 && nextP !== seq.at(bar).player || bar === 0) $("#turn").textContent = `곧 ${nextP + 1}P`;
  }
}

// 칸 위치는 offsetTop 으로 잰다 — getBoundingClientRect 는 줄이 올라오는 애니메이션(transform) 중간값을 줘서
// 공이 칸 안쪽에 떨어졌다
function measureSlots() {
  const stage = $("#stage");
  const row = $("#board .row--now");
  if (!row) return;
  slots = [...row.children].map(c => {
    let x = 0, y = 0;
    for (let n = c; n && n !== stage; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    return { x: x + c.offsetWidth / 2, y };
  });
}
addEventListener("resize", () => { if (state.running) measureSlots(); });

/* 공 — 박마다 칸에 내려앉고, 그 사이엔 포물선으로 다음 칸까지 */
function placeBall(beat, frac) {
  if (!slots.length) return;
  const a = slots[beat], b = slots[(beat + 1) % slots.length];
  const x = a.x + (b.x - a.x) * frac;
  const ground = Math.min(a.y, b.y) - 23;
  const h = Math.min(Math.max(46, Math.abs(b.x - a.x) * 0.45), ground - 22);     // 판 위로 튀어나가지 않게
  const y = ground - h * 4 * frac * (1 - frac);
  const squash = frac < 0.08 ? 1 - (0.08 - frac) * 3 : 1;     // 닿을 때 살짝 눌림
  $("#ball").style.transform = `translate(${x - 20}px, ${y - 20}px) scale(${2 - squash}, ${squash})`;
}

/* ---------- 시작 ---------- */

setDecks();
setPreview(false);
renderHome();
if (params.get("go") === "1") start();
