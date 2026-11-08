/* 소리 — WebAudio (아이폰이 <audio> 자동재생을 막아서).
   아~~(부스터) · 스껄!(드리프트) 은 파일, 사이렌·엔진은 합성.
   사이렌은 경찰이 가까울수록 커지지만 SIREN_MAX 를 넘지 않는다 — 캐릭터 목소리가 묻히면 안 된다.
   귀 아프지 않게 부드러운 파형만 쓴다 (디스토션·잡음 없음). */
const SIREN_MAX = 0.15, SIREN_MIN = 0.018;
const VOICE = 1.0, ENGINE_VOL = 0.055;

let ctx = null, master = null, voiceBus = null, sfx = {};
let boostSrc = null, boostGain = null;
let siren = null, engine = null;

async function fetchBuf(url) {
  const r = await fetch(url); const a = await r.arrayBuffer();
  return new Promise((ok, no) => ctx.decodeAudioData(a, ok, no));
}

export async function loadAudio() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.95;
  // 소리가 한꺼번에 겹치면(아~~ + 스껄 + 사이렌) 합이 0dB 를 넘어 찢어지는 소리가 났다 → 마지막에 리미터
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -6; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.2;
  master.connect(lim); lim.connect(ctx.destination);
  voiceBus = ctx.createGain(); voiceBus.gain.value = VOICE; voiceBus.connect(master);
  const [aaa, skkeol] = await Promise.all([fetchBuf("assets/audio/aaa.mp3"), fetchBuf("assets/audio/skkeol.mp3")]);
  sfx = { aaa, skkeol };
}
export function unlock() { if (ctx && ctx.state !== "running") ctx.resume(); }
/* 게임 멈추기: 소리 시계를 통째로 세운다 (아~~ 도 그 자리에서 멈췄다가 이어진다) */
export function suspend() { if (ctx && ctx.state === "running") ctx.suspend(); }
export const boostLength = () => (sfx.aaa ? sfx.aaa.duration : 5.1);

/* ---- 목소리 ---- */
export function playBoost() {
  if (!ctx) return;
  stopBoost(0.01);
  boostGain = ctx.createGain(); boostGain.gain.value = 1; boostGain.connect(voiceBus);
  boostSrc = ctx.createBufferSource(); boostSrc.buffer = sfx.aaa; boostSrc.connect(boostGain); boostSrc.start();
  const me = boostSrc; me.onended = () => { if (boostSrc === me) boostSrc = null; };
}
export function stopBoost(fade = 0.04) {
  if (!boostSrc || !ctx) return;
  const t = ctx.currentTime;
  boostGain.gain.cancelScheduledValues(t);
  boostGain.gain.setValueAtTime(boostGain.gain.value, t);
  boostGain.gain.linearRampToValueAtTime(0, t + fade);
  try { boostSrc.stop(t + fade + 0.01); } catch (e) { /* 이미 끝남 */ }
  boostSrc = null;
}
let lastDrift = null;
let lastDriftAt = -9, lastDriftGain = null;
export function playDrift() {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (t - lastDriftAt < 0.25) return;            // 아주 짧게 연달아 걸리면 무시 (뚝뚝 끊기는 소리 방지)
  lastDriftAt = t;
  if (lastDrift) {                                // 이전 스껄은 뚝 자르지 않고 아주 짧게 줄여서 끈다 (딸깍 방지)
    try { lastDriftGain.gain.setTargetAtTime(0, t, 0.012); lastDrift.stop(t + 0.08); } catch (e) { /* 이미 끝남 */ }
  }
  const g = ctx.createGain(); g.gain.value = 1; g.connect(voiceBus);
  const s = ctx.createBufferSource(); s.buffer = sfx.skkeol; s.connect(g); s.start();
  lastDrift = s; lastDriftGain = g;
}

/* ---- 사이렌: 위아래로 부드럽게 오르내리는 울림 ---- */
function makeSiren() {
  const g = ctx.createGain(); g.gain.value = 0;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400;
  const a = ctx.createOscillator(), b = ctx.createOscillator();
  a.type = "sine"; b.type = "triangle";
  a.frequency.value = 900; b.frequency.value = 900;
  const bg = ctx.createGain(); bg.gain.value = 0.28;
  const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.42;
  const lfoG = ctx.createGain(); lfoG.gain.value = 310;
  lfo.connect(lfoG); lfoG.connect(a.frequency); lfoG.connect(b.frequency);
  a.connect(lp); b.connect(bg); bg.connect(lp); lp.connect(g); g.connect(master);
  a.start(); b.start(); lfo.start();
  return { g, a, b, lfo };
}
function makeEngine() {
  const g = ctx.createGain(); g.gain.value = 0;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420;
  const a = ctx.createOscillator(), b = ctx.createOscillator();
  a.type = "triangle"; b.type = "sine";
  a.frequency.value = 60; b.frequency.value = 90;
  a.connect(lp); b.connect(lp); lp.connect(g); g.connect(master);
  a.start(); b.start();
  return { g, a, b, lp };
}
export function startLoops() {
  if (!ctx) return;
  if (!siren) siren = makeSiren();
  if (!engine) engine = makeEngine();
  const t = ctx.currentTime;
  siren.a.detune.setValueAtTime(0, t); siren.b.detune.setValueAtTime(0, t);
  siren.lfo.frequency.setValueAtTime(0.42, t);
}
/* nearest: 가장 가까운 경찰까지 거리(m), n: 경찰 수 */
export function updateSiren(nearest, n) {
  if (!siren) return;
  const k = Math.max(0, 1 - nearest / 110);
  const vol = n === 0 ? 0 : SIREN_MIN + (SIREN_MAX - SIREN_MIN) * k * k * (0.85 + 0.075 * n);
  siren.g.gain.setTargetAtTime(Math.min(SIREN_MAX, vol), ctx.currentTime, 0.12);
}
export function updateEngine(speed, boosting) {
  if (!engine) return;
  const t = ctx.currentTime, f = 52 + Math.abs(speed) * 3.1;
  engine.a.frequency.setTargetAtTime(f, t, 0.08);
  engine.b.frequency.setTargetAtTime(f * 1.5, t, 0.08);
  engine.lp.frequency.setTargetAtTime(boosting ? 620 : 420, t, 0.2);
  engine.g.gain.setTargetAtTime(ENGINE_VOL * (0.45 + Math.min(1, Math.abs(speed) / 30) * 0.55), t, 0.1);
}
/* wasted: 사이렌이 낮게 늘어지며 사라진다 */
export function wastedAudio() {
  stopBoost(0.2);
  if (siren) {
    const t = ctx.currentTime;
    siren.a.detune.linearRampToValueAtTime(-900, t + 1.4); siren.b.detune.linearRampToValueAtTime(-900, t + 1.4);
    siren.lfo.frequency.linearRampToValueAtTime(0.08, t + 1.2);
    siren.g.gain.cancelScheduledValues(t); siren.g.gain.setTargetAtTime(0, t + 0.5, 0.5);
  }
  if (engine) engine.g.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
}
export function silence() {
  stopBoost();
  if (siren) siren.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  if (engine) engine.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
}
