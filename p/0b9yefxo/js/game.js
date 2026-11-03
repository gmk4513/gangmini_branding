/* 샷건치기 — 화면·소리·입력·순위표 (판정은 sim.js)

   그리는 순서: 방 배경 → 캐릭터(책상 윗선에서 자름) → 책상 → 뽀또·압정 → 팔(주먹) → 효과 → 글자
   캐릭터 그림은 모두 기본자세 그림(1528x1029) 좌표계를 쓴다 (tools/build_assets.py) */
(function () {
  "use strict";
  const Sim = window.ShotgunSim;
  const W = 1280, H = 720, HZ = Sim.HZ;

  const q = new URLSearchParams(location.search);
  const API = q.get("api") || "https://bamti-bomb.fly.dev";
  const BOARD = "shotgun";

  /* ---------------- 배치 ---------------- */
  const SC = 0.6;                 // 캐릭터 크기
  const DESK_TOP = 560;           // 책상 윗선 — 몸은 여기서 잘린다
  const FIST_Y = 628;             // 내려친 주먹 바닥
  const ITEM_Y = 606;             // 뽀또 가운데 높이
  const DESK_SC = 0.45;
  let CX = 0, CY = 0;             // 캐릭터 좌표계 → 화면 (manifest 를 읽고 정한다)

  /* ---------------- 불러오기 ---------------- */
  const IMG = {}, SND = {};
  const FACES = [0, 2, 3];        // 기본 → 표정2 → 표정3 (입벌림·찡그림은 뺌)
  let man = null;
  async function loadAll(onProgress) {
    man = await (await fetch("assets/img/manifest.json?v=4")).json();
    CX = Sim.STRIKE_X - man.fist.x * SC;        // 주먹이 판정 원 위에 떨어지게 맞춘다
    CY = FIST_Y - man.fist.bottom * SC;
    const names = ["room", "desk", "potto", "potto_crumbs", "tack"];
    for (let i = 1; i <= 4; i++) names.push("punch" + i, "arm" + i);
    for (const i of FACES) names.push("face" + i);
    for (let i = 1; i <= 5; i++) names.push("hoe" + i);
    let done = 0;
    await Promise.all(names.map(n => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => { IMG[n] = im; onProgress(++done / names.length); res(); };
      im.onerror = () => rej(new Error("이미지 " + n));
      im.src = "assets/img/" + n + ".webp?v=4";
    })));
    // 얼굴이 빨개지는 효과: 피부에만 (머리카락·안경·이 빼고), 목 아래로 갈수록 옅게
    for (const i of FACES) {
      const f = IMG["face" + i], c = document.createElement("canvas");
      c.width = f.width; c.height = f.height;
      const g = c.getContext("2d");
      g.drawImage(f, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
      const chin = man.face[i] ? 480 - man.face[i].y : c.height * 0.75;   // 턱 높이 (기본자세 좌표 480)
      for (let y = 0; y < c.height; y++) {
        const fade = Math.max(0, Math.min(1, 1 - (y - chin) / 110));
        for (let x = 0; x < c.width; x++) {
          const k = (y * c.width + x) * 4, r = px[k], gg = px[k + 1], b = px[k + 2];
          const skin = Math.max(0, Math.min(1, (r - Math.max(gg, b) - 12) / 35)) * (r > 90 ? 1 : 0);
          px[k] = 255; px[k + 1] = 70; px[k + 2] = 55;
          px[k + 3] = px[k + 3] * skin * fade;
        }
      }
      g.putImageData(d, 0, 0);
      IMG["red" + i] = c;
    }
  }

  /* ---------------- 소리 (WebAudio — 아이폰은 <audio> 자동재생을 막는다) ---------------- */
  let actx = null, master = null, sndLoading = false;
  const AC = window.AudioContext || window.webkitAudioContext;
  function makeContext() {
    actx = new AC();
    master = actx.createGain(); master.gain.value = 0.9; master.connect(actx.destination);
  }
  function audioInit() {
    if (!AC) return;
    if (!actx) makeContext();
    else if (actx.state === "suspended") actx.resume();
    if (sndLoading) return;
    sndLoading = true;
    // 파일은 페이지를 열 때 미리 받아 둔다(SND_BYTES). 소리 장치는 버튼을 눌러야 열 수 있어서 풀기만 여기서
    Object.keys(SND_BYTES).forEach(n => {
      SND_BYTES[n].then(b => new Promise((ok, no) => actx.decodeAudioData(b.slice(0), ok, no)))
        .then(buf => { SND[n] = buf; }).catch(() => { });
    });
  }
  const SND_BYTES = {};
  ["bang1", "bang2", "bang3", "hoe1", "hoe2", "ppotto3", "scream", "death"].forEach(n => {
    SND_BYTES[n] = fetch("assets/audio/" + n + ".mp3?v=4").then(r => r.arrayBuffer());
    SND_BYTES[n].catch(() => { });
  });

  /* 소리 장치 지킴이.
     블루투스 이어폰(에어팟 등)이 다른 기기로 넘어가거나 통화 모드로 바뀌면, 브라우저는 "재생 중"이라고 하면서
     실제로는 소리 시계(currentTime)가 멈춘다 — 게임뿐 아니라 유튜브도 같이 멈춘다 (2026-11-03 이 컴퓨터에서 확인).
     게임이 고칠 수는 없으니: 시계가 멈춘 걸 알아채면 화면에 안내를 띄우고, 장치가 바뀌거나 몇 초마다
     소리 장치를 새로 열어 본다 (이어폰을 다시 연결하면 새로고침 없이 소리가 돌아온다). 받아 둔 소리는 그대로 쓴다 */
  let acLast = -1, acLastAt = 0, audioStuck = false, reopenAt = 0;
  function reopenAudio() {
    if (!AC || !actx) return;
    stopVoice();                                    // 세레모니 화면은 그대로 두고 소리만 끊는다
    if (deathSrc) { try { deathSrc.stop(); } catch (e) { } deathSrc = null; }
    if (hoeSrc) { try { hoeSrc.stop(); } catch (e) { } hoeSrc = null; }
    try { actx.close(); } catch (e) { }
    makeContext();
    acLast = -1;
  }
  function audioWatch(now) {
    if (!actx || actx.state !== "running") { acLast = -1; return; }
    const t = actx.currentTime;
    if (t !== acLast) {
      if (audioStuck) toast("");                     // 돌아왔다
      acLast = t; acLastAt = now; audioStuck = false;
      return;
    }
    if (now - acLastAt < 1500) return;
    if (!audioStuck) { audioStuck = true; toast("소리가 안 나오면 이어폰·스피커 연결을 확인해 주세요"); }
    if (now > reopenAt) { reopenAt = now + 4000; reopenAudio(); }
  }
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => { if (actx) { reopenAt = 0; reopenAudio(); } });
  }
  let toastTimer = 0;
  function toast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg; el.classList.toggle("show", !!msg);
    clearTimeout(toastTimer);
    if (msg) toastTimer = setTimeout(() => el.classList.remove("show"), 6000);
  }
  function play(n, vol, rate) {
    if (!actx || !SND[n]) return null;
    const s = actx.createBufferSource(), g = actx.createGain();
    s.buffer = SND[n]; s.playbackRate.value = rate || 1;
    g.gain.value = vol == null ? 1 : vol;
    s.connect(g); g.connect(master); s.start();
    return s;
  }
  /* 뽀또 먹는 소리 — 파일 없이 부드러운 "뽁". 잡음·찌그러짐 없이 사인파만 */
  function pop(perfect) {
    if (!actx) return;
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(perfect ? 700 : 560, t);
    o.frequency.exponentialRampToValueAtTime(perfect ? 1250 : 980, t + 0.07);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.15);
  }
  let bangN = 0, hoeN = 0, hoeSrc = null;
  /* 게임 중 대사 — 한 번에 하나만 (서로 겹치지 않게, 2026-11-02 사용자 요청).
     "나 뽀또 한번만! 진짜 뽀또 한번만!" (ppotto3): 시작하자마자, 끝나고 2초 쉬고 또. 뽀또 먹는 것과는 상관없다
     소리 지르기 (scream): 포병지 카드가 뒤집히는 순간에만 (아래 카드 참고).
     카드가 곧 뒤집힐 때는 뽀또 대사를 새로 시작하지 않는다. 시간은 게임 시계(멈추면 같이 멈춤) */
  const PP_GAP = 2;
  const vlog = new URLSearchParams(location.search).has("debug") ? [] : null;   // 점검용 대사 기록
  let voice = null, nextPp = 0, quietUntil = 0;
  function stopVoice() {
    if (voice) { try { voice.onended = null; voice.stop(); } catch (e) { } voice = null; }
  }
  function voiceReset() { stopVoice(); nextPp = 0; quietUntil = 0; }
  function say(name, kind) {
    const src = play(name, kind === "scream" ? 1 : 0.95);
    if (!src) return null;
    voice = src;
    if (vlog) vlog.push([kind, +(s.tick / HZ).toFixed(2), +src.buffer.duration.toFixed(2)]);
    src.onended = () => {
      if (voice === src) voice = null;
      if (!s) return;
      quietUntil = s.tick / HZ + 0.4;
      if (kind === "pp") nextPp = s.tick / HZ + PP_GAP;
    };
    return src;
  }
  function voiceTick() {
    if (voice || mode !== "play" || paused || !s || s.dead || !actx) return;
    if (s.tick < s.hoeUntil + 18) return;          // 호에에 소리와 안 겹치게 (끝나고 0.3초 뒤부터)
    const now = s.tick / HZ;
    if (now < quietUntil || now < nextPp) return;   // 대사끼리 바로 붙지 않게 0.4초 쉰다
    // 카드가 곧 뒤집히면(뽀또 대사가 끝나기 전에) 시작하지 않는다
    const pp = SND.ppotto3 ? SND.ppotto3.duration : 2.4;
    const reveal = cardOn ? (cardScreamed ? -1 : now + (CARD_REVEAL - cardVideo.currentTime)) : nextCard + CARD_REVEAL;
    if (reveal >= now && reveal < now + pp + 0.4) return;
    if (!say("ppotto3", "pp")) nextPp = now + 0.5;  // 소리를 아직 못 받았으면 조금 뒤에 다시
  }

  /* ---------------- 포병지 카드 ----------------
     게임 시작 10초 뒤 처음, 그 뒤 15초마다 왼쪽 흰 문 위에 카드 영상(2.09초, 자르지 않음)을 띄운다.
     카드가 뒤집혀 김병지가 보이는 순간(1.067초) 소리를 지르기 시작한다. 영상 소리는 끈다 */
  const CARD_FIRST = 10, CARD_EVERY = 15, CARD_REVEAL = 32 / 30;
  const CARD_X = 6, CARD_Y = 100, CARD_W = 228;   // 영상 네모(잘라 낸 760x1150) 자리. 보이는 카드는 그 안쪽
  const cardVideo = document.createElement("video");
  cardVideo.muted = true; cardVideo.playsInline = true; cardVideo.setAttribute("playsinline", "");
  cardVideo.preload = "auto"; cardVideo.src = "assets/video/card.mp4?v=1";
  let cardReady = false, cardOn = false, cardScreamed = false, nextCard = CARD_FIRST, cardAlpha = 0;
  cardVideo.addEventListener("canplaythrough", () => { cardReady = true; });
  cardVideo.addEventListener("loadeddata", () => { cardReady = true; });
  cardVideo.load();
  function cardReset() { cardOn = false; cardScreamed = false; nextCard = CARD_FIRST; cardAlpha = 0; try { cardVideo.pause(); } catch (e) { } }
  function cardTick(dt) {
    cardAlpha = Math.max(0, Math.min(1, cardAlpha + (cardOn ? dt * 8 : -dt * 5)));
    if (mode !== "play" || paused || !s || s.dead) return;
    const now = s.tick / HZ;
    if (!cardOn && now >= nextCard) {
      nextCard = now + CARD_EVERY;
      if (cardReady) {
        cardOn = true; cardScreamed = false;
        try { cardVideo.currentTime = 0; } catch (e) { }
        const pr = cardVideo.play(); if (pr && pr.catch) pr.catch(() => { cardOn = false; });
      }
    }
    if (!cardOn) return;
    if (!cardScreamed && cardVideo.currentTime >= CARD_REVEAL) {
      cardScreamed = true;
      stopVoice();                                  // 혹시 말하는 중이면 끊고 지른다
      say("scream", "scream");
    }
    if (cardVideo.ended || (cardVideo.duration && cardVideo.currentTime >= cardVideo.duration - 0.03)) cardOn = false;
  }
  /* 카드 모양대로 오리기 — 영상 배경이 카드와 비슷한 색이라 자동으로는 못 따서, 프레임마다 카드 테두리를
     직접 재 두었다 (잘라 낸 영상 760x1150 좌표, x0 y0 x1 y1). 위는 평평하고 아래는 둥근 방패 모양으로 자른다.
     0~25 카드 팩 · 26~31 뒤집힘(27~30 은 옆면) · 32~53 김병지 카드 · 54~56 오른쪽 위로 날아감 · 57~ 없음 */
  const PACK_BOX = [14, 14, 740, 1126], CARD_BOX = [37, 47, 725, 1133];
  function cardBox(f) {
    if (f <= 25) return PACK_BOX;
    if (f === 26) return [208, 18, 533, 1110];
    if (f <= 30) return [355, 20, 372, 1120];
    if (f === 31) return [254, 16, 479, 1140];
    if (f <= 53) return CARD_BOX;
    if (f === 54) return [50, 35, 735, 1105];
    if (f === 55) return [150, 22, 783, 1022];
    if (f === 56) return [300, 30, 890, 960];
    return null;
  }
  function shieldPath(x0, y0, x1, y1) {
    const w = x1 - x0, h = y1 - y0, r = Math.min(w * 0.04, 10), side = y0 + h * 0.905, cx = (x0 + x1) / 2;
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.lineTo(x1 - r, y0); ctx.quadraticCurveTo(x1, y0, x1, y0 + r);
    ctx.lineTo(x1, side);
    ctx.quadraticCurveTo(cx, y0 + h * 1.095, x0, side);   // 아래 가운데가 y1 에 닿는 둥근 바닥
    ctx.lineTo(x0, y0 + r); ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
    ctx.closePath();
  }
  function drawCard() {
    if (cardAlpha <= 0 || cardVideo.readyState < 2) return;
    const box = cardBox(Math.floor(cardVideo.currentTime * 30 + 0.001));
    if (!box) return;
    const k = CARD_W / 760, h = 1150 * k;
    const X = v => CARD_X + v * k, Y = v => CARD_Y + v * k;
    ctx.save();
    ctx.globalAlpha = cardAlpha;
    ctx.beginPath(); ctx.rect(CARD_X, CARD_Y, CARD_W, h); ctx.clip();   // 영상 밖으로는 안 나가게 (날아갈 때)
    shieldPath(X(box[0]), Y(box[1]), X(box[2]), Y(box[3]));
    ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
    ctx.fillStyle = "#0b2a2a"; ctx.fill();          // 그림자
    ctx.shadowColor = "transparent";
    ctx.clip();
    ctx.drawImage(cardVideo, CARD_X, CARD_Y, CARD_W, h);
    ctx.restore();
  }

  /* ---------------- 화면 맞추기 ---------------- */
  const stage = document.getElementById("stage");
  const cv = document.getElementById("cv");
  const ctx = cv.getContext("2d");
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    stage.style.transform = `scale(${s}) translate(-50%, -50%)`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(W * s * dpr);
    if (cv.width !== px) { cv.width = px; cv.height = Math.round(H * s * dpr); }
  }
  addEventListener("resize", fit); fit();

  /* ---------------- 게임 상태 ---------------- */
  let mode = "title";             // title | play | over
  let s = null, taps = [], session = null, startedAt = 0;
  let acc = 0, last = 0, pendingAt = -1;
  let heat = 0;                   // 연타 열기 → 표정·빨개짐 (화면용, 판정과 무관)
  let shake = 0, ringFlash = 0, redFlash = 0, hoeStart = -999, hoeText = 0;
  let fx = [];                    // {kind, x, y, t, life, ...}
  let tackFly = [];
  let debris = [];                // 책상에 남은 뽀또 부스러기 {wx, flip}
  /* 내려칠 때 캐릭터만 따로 휙 흔들린다. 레퍼런스 영상에서 머리가 한 번 칠 때마다
     머리 폭의 약 8% 움직였다 → 게임 머리 폭 약 200px 기준 좌우 ±10~18px, 아래로 14px */
  let jolt = 0, joltX = 0, joltR = 0;
  function hitShake() {
    shake = 1; jolt = 1;
    joltX = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 8);
    joltR = (Math.random() - 0.5) * 0.03;
  }

  /* ---------------- 죽었을 때: 결과 화면 + 으아아아 세레모니 ----------------
     death.mp3 (으아아아_사운드.mp4 소리 15초 그대로) 를 틀면서, 소리가 시작되자마자(0.095초)부터
     마지막 타격(13.6초)까지 0.22초 간격으로 똑같이 내려친다 (영상 박자가 흐트러져도 간격은 일정하게, 사용자 요청).
     결과 화면은 처음부터 같이 뜨고, 캐릭터는 왼쪽으로 비켜서 결과 카드에 가리지 않는다 */
  const DEATH_LEN = 15.07;
  // 첫 타격: 비명에 묻혀 소리로는 안 잡히지만 1.195초에 잡힌 타격에서 0.22초씩 거꾸로 세면 0.095초 (소리 시작 0.08초)
  const DEATH_FIRST = 0.095, DEATH_LAST = 13.6, DEATH_GAP = 0.22;
  const DEATH_HITS = [];
  for (let t = DEATH_FIRST; t <= DEATH_LAST + 0.001; t += DEATH_GAP) DEATH_HITS.push(t);
  let ceremony = false, cerT0 = 0, cerP0 = 0, cerAudio = false, cerHit = 0, deathSrc = null;
  let aside = 0;                  // 캐릭터가 왼쪽으로 비켜선 정도 0~1
  const ASIDE_X = -175;
  /* 소리가 실제로 흐르면 소리 시계에 맞추고, 소리가 막혀 있으면(자동재생 차단 등) 화면 시계로 간다
     — 소리 시계만 믿으면 멈춘 채로 영영 안 끝난다 */
  /* 화면 시계로 잰다. 소리 시계는 장치가 멈추거나 새로 열리면 같이 멈추거나 처음으로 돌아가서 쓸 수 없다
     (소리는 시작할 때 같이 틀었으니 15초 동안 어긋나는 건 수십 ms 안쪽) */
  function cerTime() { return performance.now() / 1000 - cerP0; }
  function startCeremony() {
    stopVoice(); cardOn = false; try { cardVideo.pause(); } catch (e) { }
    if (hoeSrc) { try { hoeSrc.stop(); } catch (x) { } hoeSrc = null; }
    deathSrc = play("death", 1);
    cerAudio = !!deathSrc;
    cerT0 = actx ? actx.currentTime : 0;
    cerP0 = performance.now() / 1000;
    cerHit = 0;
    ceremony = true;
  }
  function stopDeath() {
    if (deathSrc) { try { deathSrc.stop(); } catch (x) { } deathSrc = null; }
    ceremony = false;
  }
  /* 타격 시각에 맞춘 팔 그림: 닿기 0.07초 전부터 2→3, 닿으면 4, 그 뒤 3→2→1 */
  function deathFrame(t) {
    let f = 1;
    for (const h of DEATH_HITS) {
      const d = t - h;
      if (d < -0.07) break;
      if (d < -0.035) f = 2;
      else if (d < 0) f = 3;
      else if (d < 0.08) f = 4;
      else if (d < 0.13) f = 3;
      else if (d < 0.18) f = 2;
      else f = 1;
    }
    return f;
  }
  let paused = false;

  function reset(seed) {
    s = Sim.create(seed);
    taps = []; acc = 0; pendingAt = -1; heat = 0;
    voiceReset(); cardReset();
    shake = 0; ringFlash = 0; redFlash = 0; hoeStart = -999; fx = []; tackFly = []; debris = [];
    paused = false;
  }

  async function startGame() {
    audioInit();
    stopDeath();
    show(null);
    mode = "play";
    // 서버에 판을 연다 (시드를 서버가 정한다). 안 되면 순위표 없이 그냥 한다
    session = null;
    let seed = (Math.random() * 4294967296) >>> 0;
    try {
      const r = await fetchJson(API + "/api/shotgun/start", { v: Sim.VERSION }, 4000);
      if (r && r.sid && Number.isInteger(r.seed)) { session = r; seed = r.seed >>> 0; }
    } catch (e) { }
    reset(seed);
    startedAt = performance.now();
    last = performance.now();
    tryLandscape();
  }

  function tryLandscape() {
    // 안드로이드 크롬은 전체화면일 때만 가로 고정이 된다. 아이폰은 둘 다 안 되므로 조용히 넘어간다
    if (!matchMedia("(pointer: coarse)").matches) return;
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape").catch(() => { }))
        .catch(() => { });
    }
  }

  /* ---------------- 입력 ---------------- */
  function press() {
    if (mode !== "play" || paused || !s || s.dead) return;
    pendingAt = s.tick;
  }
  addEventListener("keydown", e => {
    if (e.target && e.target.tagName === "INPUT") return;
    if ((e.code === "Escape" || e.code === "KeyP") && mode === "play") { e.preventDefault(); setPause(!paused); return; }
    if (e.code === "Space" || e.code === "ArrowDown" || e.code === "KeyJ" || e.code === "KeyF") {
      e.preventDefault();
      if (e.repeat) return;
      if (mode === "play") { if (!paused) press(); }
      else if (mode === "title" && !btnStart.disabled) startGame();
    }
  });
  cv.addEventListener("pointerdown", e => { e.preventDefault(); press(); });
  stage.addEventListener("contextmenu", e => e.preventDefault());

  /* ---------------- 한 틱 ---------------- */
  function tickOnce() {
    // 누른 직후 못 치는 때(내려치는 중)여도 3틱까지는 기다렸다 친다 — 연타가 씹히지 않게
    if (pendingAt >= 0) {
      if (Sim.canTap(s)) {
        Sim.tap(s); taps.push(s.tick); pendingAt = -1;
        heat = Math.min(14, heat + 1.25);
      } else if (s.tick - pendingAt > 3) pendingAt = -1;
    }
    const ev = [];
    Sim.step(s, ev);
    heat = Math.max(0, heat - 2.4 / HZ);
    for (const e of ev) onEvent(e);
  }

  function onEvent(e) {
    if (e.t === "impact") {
      hitShake(); ringFlash = 1;
      play("bang" + (1 + (bangN++ % 3)), 0.95, 0.94 + Math.random() * 0.12);
    } else if (e.t === "eat") {
      pop(e.perfect);
      fx.push({ kind: "crumbs", x: e.x, y: ITEM_Y - 6, t: 0, life: 22 });
      debris.push({ wx: e.x + s.cam, flip: Math.random() < 0.5 });   // 부스러기는 책상에 남아 같이 흘러간다
      fx.push({ kind: "fly", x: e.x, y: ITEM_Y, t: 0, life: 26 });
      if (e.perfect) fx.push({ kind: "text", txt: "정확한!", x: e.x, y: ITEM_Y - 90, t: 0, life: 30 });
    } else if (e.t === "tack") {
      redFlash = 1; hoeStart = s.tick; heat = 0;
      tackFly.push({ x: e.x, y: ITEM_Y, vx: 9, vy: -17, r: 0, t: 0 });
      if (hoeSrc) { try { hoeSrc.stop(); } catch (x) { } }
      stopVoice();
      hoeSrc = play("hoe" + (1 + (hoeN++ % 2)), 1);
    } else if (e.t === "dead") {
      mode = "over";
      startCeremony();
      gameOver();
    }
  }

  /* ---------------- 그리기 ---------------- */
  function img(n, x, y, sc) {
    const im = IMG[n]; if (!im) return;
    ctx.drawImage(im, x, y, im.width * sc, im.height * sc);
  }
  function punchFrame() {
    const t = s ? s.punchT : -1;
    if (t < 0) return 1;
    if (t <= 1) return 2;
    if (t <= 3) return 3;
    if (t <= 8) return 4;
    if (t <= 11) return 3;
    return 2;
  }
  function faceIndex() {
    return heat < 2 ? 0 : heat < 6 ? 2 : 3;
  }
  const HOE_SEQ = [1, 2, 3, 4, 5, 4, 3, 2];

  function draw() {
    const k = cv.width / W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingQuality = "high";

    // 흔들림 (내려칠 때 아래로 툭 + 좌우 떨림)
    let sx = 0, sy = 0;
    if (shake > 0) { sx = (Math.random() - 0.5) * 18 * shake; sy = 8 * shake; }
    ctx.save();
    ctx.translate(sx, sy);

    // 방 (조금 어둡게 해서 캐릭터를 띄운다)
    const room = IMG.room;
    if (room) {
      const rs = Math.max((W + 40) / room.width, (H + 40) / room.height);
      ctx.drawImage(room, -20 - sx * 0.5, -20, room.width * rs, room.height * rs);
      ctx.fillStyle = "rgba(10,12,30,.25)"; ctx.fillRect(-20, -20, W + 40, H + 40);
    }
    drawCard();                     // 왼쪽 흰 문 위 (캐릭터 뒤)

    const inHoe = s && s.tick < s.hoeUntil && mode === "play";
    // 캐릭터 몸 — 책상 윗선 아래는 잘라낸다
    ctx.save();
    ctx.beginPath(); ctx.rect(-40, -40, W + 80, DESK_TOP + 42); ctx.clip();
    if (inHoe) drawHoe();
    else { joltOn(); drawGamst(); ctx.restore(); }
    ctx.restore();

    // 책상 (흘러가는 상판)
    const desk = IMG.desk;
    if (desk) {
      const dw = desk.width * DESK_SC, dh = desk.height * DESK_SC;
      let x = -((s ? s.cam : 0) % dw) - 20;
      while (x < W + 20) { ctx.drawImage(desk, x, DESK_TOP, dw, dh); x += dw; }
      // 윗선 그림자
      const g = ctx.createLinearGradient(0, DESK_TOP, 0, DESK_TOP + 26);
      g.addColorStop(0, "rgba(0,0,0,.45)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(-20, DESK_TOP, W + 40, 26);
    }

    // 판정 원 (게임 중에만)
    if (mode === "play") {
      ctx.save();
      ctx.translate(Sim.STRIKE_X, ITEM_Y + 14);
      ctx.scale(1, 0.3);
      ctx.lineWidth = 6;
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.6 * ringFlash})`;
      ctx.setLineDash([16, 12]);
      ctx.beginPath(); ctx.arc(0, 0, 66, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // 책상에 남은 부스러기 (납작하게 눌러서 바닥에 깔린 것처럼)
    const cr = IMG.potto_crumbs;
    if (s && cr) for (const d of debris) {
      const x = d.wx - s.cam;
      if (x < -150 || x > W + 150) continue;
      const w = 150, h = cr.height * w / cr.width * 0.42;
      ctx.save(); ctx.translate(x, ITEM_Y + 14); if (d.flip) ctx.scale(-1, 1);
      ctx.drawImage(cr, -w / 2, -h / 2, w, h); ctx.restore();
    }

    // 뽀또·압정
    if (s) for (const it of s.items) {
      const x = it.wx - s.cam;
      if (x < -120 || x > W + 120) continue;
      if (it.kind === "potto") {
        const w = 104, im = IMG.potto; if (!im) continue;
        const h = im.height * w / im.width;
        ctx.fillStyle = "rgba(0,0,0,.28)";
        ctx.beginPath(); ctx.ellipse(x, ITEM_Y + h * 0.42, w * 0.46, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.drawImage(im, x - w / 2, ITEM_Y - h / 2, w, h);
      } else {
        const w = 80, im = IMG.tack; if (!im) continue;
        const h = im.height * w / im.width;
        ctx.fillStyle = "rgba(0,0,0,.3)";
        ctx.beginPath(); ctx.ellipse(x, ITEM_Y + 24, w * 0.5, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.drawImage(im, x - w / 2, ITEM_Y + 24 - h, w, h);
      }
    }

    // 주먹 — 책상 위로 한 번 더 그린다 (뽀또를 덮으며 내려찍는다)
    if (!inHoe) {
      const f = curFrame(), a = man && man.arm[f - 1];
      joltOn();
      if (a) img("arm" + f, CX + a.x * SC, CY + a.y * SC, SC);
      ctx.restore();
    }

    // 효과
    for (const e of fx) {
      const p = e.t / e.life;
      if (e.kind === "crumbs") {
        const im = IMG.potto_crumbs; if (!im) continue;
        const w = 120 + 150 * p, h = im.height * w / im.width;
        ctx.globalAlpha = 1 - p * p;
        ctx.drawImage(im, e.x - w / 2, e.y - h / 2 - 20 * p, w, h);
        ctx.globalAlpha = 1;
      } else if (e.kind === "fly") {
        // 게이지로 날아가는 작은 뽀또
        const tx = gaugeEndX(), ty = 44, e2 = p * p;
        const x = e.x + (tx - e.x) * e2, y = e.y + (ty - e.y) * e2 - 120 * Math.sin(Math.PI * p);
        const w = 54 - 20 * p, im = IMG.potto;
        if (im) ctx.drawImage(im, x - w / 2, y - w * 0.4, w, w * im.height / im.width);
      } else if (e.kind === "text") {
        ctx.globalAlpha = 1 - p;
        label(e.txt, e.x, e.y - 30 * p, 40, "#ffe066");
        ctx.globalAlpha = 1;
      }
    }
    for (const t of tackFly) {
      const im = IMG.tack; if (!im) continue;
      ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.r);
      ctx.drawImage(im, -33, -30, 66, 66 * im.height / im.width); ctx.restore();
    }
    ctx.restore();   // 흔들림 끝

    // 빨간 번쩍 (압정)
    if (redFlash > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
      g.addColorStop(0, "rgba(255,0,0,0)"); g.addColorStop(1, `rgba(255,0,0,${0.55 * redFlash})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    drawHud();
  }

  function curFrame() { return ceremony ? deathFrame(cerTime()) : punchFrame(); }
  /* 캐릭터 흔들림 적용 (책상 윗선을 축으로 살짝 기울며 툭 내려간다). 끝나면 ctx.restore() */
  function joltOn() {
    ctx.save();
    if (aside > 0) { const e = aside * aside * (3 - 2 * aside); ctx.translate(ASIDE_X * e, 0); }
    if (jolt <= 0) return;
    const k = jolt * jolt;
    ctx.translate(joltX * k + W * 0.45, 14 * k + DESK_TOP);
    ctx.rotate(joltR * k);
    ctx.translate(-W * 0.45, -DESK_TOP);
  }

  function drawGamst() {
    const dying = mode === "over" && s && s.dead;   // 죽은 뒤 (세레모니 중·후)
    const f = curFrame(), p = man.punch[f - 1];
    img("punch" + f, CX + p.x * SC, CY + p.y * SC, SC);
    const fi = dying ? 3 : faceIndex(), fa = man.face[fi];
    img("face" + fi, CX + fa.x * SC, CY + fa.y * SC, SC);
    // 죽을 때는 영상 내내 점점 빨개진다 (9초쯤 가장 빨갛게)
    const red = dying ? (ceremony ? 0.1 + Math.min(1, cerTime() / 9) * 0.45 : 0.4)
      : Math.max(0, Math.min(1, (heat - 4) / 9)) * 0.4;
    if (red > 0.01) {
      ctx.globalAlpha = red;
      ctx.globalCompositeOperation = "multiply";
      img("red" + fi, CX + fa.x * SC, CY + fa.y * SC, SC);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
  }

  function drawHoe() {
    const t = s.tick - hoeStart;
    const i = HOE_SEQ[Math.floor(t / 6) % HOE_SEQ.length];   // 한 장에 0.1초 — 한 바퀴 0.8초
    const hs = 0.48, a = man.hoe[i - 1];
    const ox = (W - man.hoeSpace.w * hs) / 2 + 30, oy = DESK_TOP + 25 - 1110 * hs;
    // 들어갈 때 살짝 튕긴다
    const pop = t < 8 ? 1 + 0.07 * (1 - t / 8) : 1;
    ctx.save();
    ctx.translate(W / 2, DESK_TOP); ctx.scale(pop, pop); ctx.translate(-W / 2, -DESK_TOP);
    img("hoe" + i, ox + a.x * hs, oy + a.y * hs + Math.sin(t * 0.9) * 2, hs);
    ctx.restore();
  }

  const G_X = 850, G_Y = 30, G_W = 390, G_H = 28;
  function gaugeEndX() { return G_X + G_W * (s ? s.gauge / Sim.GAUGE_MAX : 1); }

  function drawHud() {
    // 시간
    const t = s ? s.tick / HZ : 0;
    label(fmt(t), 34, 58, 46, "#ffffff", 0, "left");
    // 게이지
    const r = s ? s.gauge / Sim.GAUGE_MAX : 1;
    const low = r < 0.25 && s && !s.dead && Math.floor(s.tick / 8) % 2 === 0;
    rr(G_X - 4, G_Y - 4, G_W + 8, G_H + 8, 18, "rgba(0,0,0,.55)");
    if (r > 0) {
      const g = ctx.createLinearGradient(G_X, 0, G_X + G_W, 0);
      g.addColorStop(0, low ? "#ff3b30" : "#ff8a1f"); g.addColorStop(1, low ? "#ff7b6b" : "#ffd24a");
      rr(G_X, G_Y, Math.max(G_H, G_W * r), G_H, 14, g);
    }
    const im = IMG.potto;
    if (im) { const w = 58; ctx.drawImage(im, gaugeEndX() - w / 2, G_Y + G_H / 2 - w * 0.4, w, w * im.height / im.width); }
    // 연속
    if (s && s.streak >= 5 && mode === "play") label(s.streak + "연속", Sim.STRIKE_X, DESK_TOP - 20, 30, "#ffe066");
    ctx.globalAlpha = 0.6; label("비공식 팬 게임", 16, H - 14, 15, "#ffffff", 0, "left"); ctx.globalAlpha = 1;
  }

  function rr(x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  }
  function label(txt, x, y, size, color, rot, align) {
    ctx.save();
    ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.font = `900 ${size}px Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
    ctx.textAlign = align || "center"; ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round"; ctx.lineWidth = Math.max(4, size * 0.16); ctx.strokeStyle = "rgba(0,0,0,.85)";
    ctx.strokeText(txt, 0, 0); ctx.fillStyle = color; ctx.fillText(txt, 0, 0);
    ctx.restore();
  }
  function fmt(sec) {
    const m = Math.floor(sec / 60), r = sec - m * 60;
    return String(m).padStart(2, "0") + ":" + r.toFixed(1).padStart(4, "0");
  }

  /* 효과 시간 흐르기 (화면 프레임 기준 — 판정과 무관) */
  function animate(dt) {
    const f = dt * 60;
    shake = Math.max(0, shake - 0.14 * f);
    jolt = Math.max(0, jolt - 0.16 * f);
    ringFlash = Math.max(0, ringFlash - 0.08 * f);
    redFlash = Math.max(0, redFlash - 0.03 * f);
    for (const e of fx) e.t += f;
    fx = fx.filter(e => e.t < e.life);
    for (const t of tackFly) { t.t += f; t.x += t.vx * f; t.y += t.vy * f; t.vy += 1.1 * f; t.r += 0.35 * f; }
    tackFly = tackFly.filter(t => t.y < H + 100);
    if (s) debris = debris.filter(d => d.wx - s.cam > -200);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (mode === "play" && s && !s.dead && !paused) {
      acc += dt;
      while (acc >= 1 / HZ && !s.dead) { tickOnce(); acc -= 1 / HZ; }
    }
    if (ceremony) {
      const t = cerTime();
      while (cerHit < DEATH_HITS.length && t >= DEATH_HITS[cerHit]) { hitShake(); cerHit++; }
      if (t >= DEATH_LEN) { ceremony = false; deathSrc = null; }
    }
    // 죽은 뒤엔 캐릭터가 왼쪽으로 비켜서 결과 카드 자리를 만든다
    const want = mode === "over" && s && s.dead ? 1 : 0;
    aside = want > aside ? Math.min(1, aside + dt * 2.5) : want < aside ? Math.max(0, aside - dt * 4) : aside;
    audioWatch(now);
    cardTick(dt);
    voiceTick();
    animate(dt);
    if (man) draw();
    const pb = mode === "play" && !paused && !!s && !s.dead;
    if (pb !== pauseShown) { pauseShown = pb; btnPause.classList.toggle("show", pb); }
  }

  /* ---------------- 화면 패널 ---------------- */
  const $ = id => document.getElementById(id);
  const btnStart = $("btnStart");
  const btnPause = $("btnPause");
  let pauseShown = false;
  function show(id) {
    ["title", "over", "rank", "pause"].forEach(p => $(p).classList.toggle("show", p === id));
  }

  function gameOver() {
    $("overTime").textContent = fmt(s.tick / HZ);
    $("overSub").textContent = `뽀또 ${s.eaten}개 · 압정 ${s.tacks}번`;
    $("submitMsg").textContent = session ? "" : "서버에 연결되지 않아 이번 기록은 순위표에 올릴 수 없어요";
    $("nameForm").style.display = session ? "" : "none";
    $("btnSubmit").disabled = false;
    $("nameIn").value = loadName();
    show("over");
  }

  $("nameForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("nameIn").value.trim();
    if (!name) { $("submitMsg").textContent = "닉네임을 적어 주세요"; return; }
    saveName(name);
    $("btnSubmit").disabled = true;
    $("submitMsg").textContent = "기록 확인 중…";
    try {
      const r = await fetchJson(API + "/api/shotgun/submit",
        { sid: session.sid, v: Sim.VERSION, name: name, ticks: s.tick, taps: delta(taps) }, 8000);
      if (r && r.rows) {
        session = null;   // 한 판에 한 번
        $("nameForm").style.display = "none";
        $("submitMsg").textContent = r.rank ? `${r.rank}등으로 올라갔어요!` : "등록했어요 (100등 밖)";
        renderRank(r.rows, { n: name, s: r.ms });
        show("rank");
      } else throw new Error((r && r.error) || "fail");
    } catch (err) {
      $("btnSubmit").disabled = false;
      const m = { too_many: "잠깐 뒤에 다시 눌러 주세요", expired: "판이 너무 오래돼서 등록할 수 없어요",
        old_version: "게임이 새로 바뀌었어요. 새로고침 후 다시 해 주세요", used: "이미 등록한 판이에요",
        bad_name: "닉네임을 다시 적어 주세요" }[err.message];
      $("submitMsg").textContent = m || "기록을 확인하지 못했어요";
    }
  });

  async function openRank() {
    show("rank");
    $("rankList").innerHTML = '<li class="empty">불러오는 중…</li>';
    try {
      const r = await (await fetchT(API + "/api/scores/" + BOARD + "?limit=100", {}, 5000)).json();
      renderRank(r.rows || []);
    } catch (e) { $("rankList").innerHTML = '<li class="empty">순위표를 불러오지 못했어요</li>'; }
  }
  function renderRank(rows, me) {
    const ol = $("rankList");
    ol.innerHTML = "";
    if (!rows.length) { ol.innerHTML = '<li class="empty">아직 기록이 없어요</li>'; return; }
    let marked = false;
    rows.forEach((row, i) => {
      const li = document.createElement("li");
      if (i < 3) li.className = "top";
      if (me && !marked && row.n === me.n && row.s === me.s) { li.className += " me"; marked = true; }
      const r = document.createElement("span"); r.className = "r"; r.textContent = i + 1;
      const n = document.createElement("span"); n.className = "n"; n.textContent = row.n;
      const t = document.createElement("span"); t.className = "s"; t.textContent = fmt(row.s / 1000);
      li.append(r, n, t); ol.append(li);
    });
    const meEl = ol.querySelector(".me");
    if (meEl) meEl.scrollIntoView({ block: "center" });
  }
  let rankBack = "title";
  $("btnRank1").onclick = () => { rankBack = "title"; openRank(); };
  $("btnRank2").onclick = () => { rankBack = "over"; openRank(); };
  $("btnRankClose").onclick = () => show(rankBack === "over" && mode === "over" ? "over" : "title");
  $("btnRetry").onclick = () => startGame();
  $("btnHome1").onclick = goHome;
  $("btnHome2").onclick = goHome;
  $("btnPause").onclick = () => setPause(true);
  $("btnResume").onclick = () => setPause(false);

  /* 멈추기 — 판정 시간도 멈춘다 (서버는 실제 흐른 시간이 더 긴 건 문제 삼지 않는다) */
  function setPause(on) {
    if (mode !== "play" || !s || s.dead) return;
    paused = on; acc = 0; pendingAt = -1;
    if (on) { stopVoice(); if (cardOn) cardVideo.pause(); show("pause"); }
    else { show(null); last = performance.now(); if (cardOn) { const pr = cardVideo.play(); if (pr && pr.catch) pr.catch(() => { }); } }
  }
  function goHome() {
    stopVoice(); stopDeath(); cardReset();
    mode = "title"; s = null; session = null; paused = false;
    debris = []; fx = []; tackFly = []; heat = 0;
    show("title");
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) setPause(true); });
  btnStart.onclick = () => startGame();

  /* ---------------- 통신 ---------------- */
  function fetchT(url, opt, ms) {
    const c = new AbortController(); const id = setTimeout(() => c.abort(), ms);
    return fetch(url, Object.assign({ signal: c.signal }, opt)).finally(() => clearTimeout(id));
  }
  async function fetchJson(url, body, ms) {
    const r = await fetchT(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, ms);
    return r.json();
  }
  function delta(a) { const o = []; let p = 0; for (const v of a) { o.push(v - p); p = v; } return o; }
  function loadName() { try { return localStorage.getItem("shotgun.name") || ""; } catch (e) { return ""; } }
  function saveName(n) { try { localStorage.setItem("shotgun.name", n); } catch (e) { } }

  /* 점검용 (?debug): 멈추고 한 틱씩 넘기며 화면을 본다 */
  if (q.has("debug")) window.__dbg = {
    get s() { return s; }, get heat() { return heat; }, set heat(v) { heat = v; },
    get mode() { return mode; }, get frame() { return curFrame(); }, get cerT() { return ceremony ? cerTime() : -1; }, get audio() { return actx && actx.state; }, get ac() { return actx && { t: actx.currentTime, rate: actx.sampleRate, base: actx.baseLatency, out: actx.outputLatency }; }, get vlog() { return vlog; }, get cardVideo() { return cardVideo; }, get card() { return { cardReady, cardOn, cardScreamed, nextCard, t: cardVideo.currentTime, rs: cardVideo.readyState, err: cardVideo.error && cardVideo.error.code, snd: Object.keys(SND), voice: !!voice, nextPp, quietUntil }; },
    pause(b) { paused = b; acc = 0; }, press() { pendingAt = s.tick; }, tick(n) { for (let i = 0; i < (n || 1); i++) tickOnce(); }
  };

  /* ---------------- 시작 ---------------- */
  loadAll(p => { btnStart.textContent = `불러오는 중… ${Math.round(p * 100)}%`; })
    .then(() => { btnStart.disabled = false; btnStart.textContent = "시작"; btnStart.classList.remove("loading"); })
    .catch(() => { btnStart.textContent = "불러오지 못했어요 (새로고침)"; });
  requestAnimationFrame(t => { last = t; frame(t); });
  // 방문 숫자 (gangmini.com 에서 열렸을 때만)
  if (/gangmini\.com$/.test(location.hostname)) new Image().src = API + "/beacon.gif?s=shotgun";
})();
