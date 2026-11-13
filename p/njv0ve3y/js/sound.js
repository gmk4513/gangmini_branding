// 소리: 사용자가 준 영상에서 뽑은 대사 · 노래 (assets/sound/*.mp3)
//  rap_intro  라프산두 첫 시작 (0~19.1초, 마지막에 '대체 너 어디야!!!!!')
//  rap_shout  라프산두 '대체 너 어디야!!!!' (게임 중 가끔 반복)
//  kid_lines  키드밀리 '나는 키드밀리~ / 자꾸 차가 밀리~ / 그래서 자꾸 지각하지~ / 티~원~'
// 브라우저는 사람이 한 번 클릭한 뒤에야 소리를 낼 수 있어서, 시작 버튼에서 unlock() 한다.
import * as THREE from "three";
import { ASSET_V, A } from "./assets.js?v=20261113154252";

//  step0~5    발소리 (사용자가 준 352870__potatokingxii__footsteps-dirt-gravel.wav 에서 또렷한 걸음 6개를 잘라 냄)
const FILES = {
  rap_intro: "assets/sound/rap_intro.mp3", rap_shout: "assets/sound/rap_shout.mp3",
  kid_lines: "assets/sound/kid_lines.mp3",
};
const STEPS = 6;
for (let i = 0; i < STEPS; i++) FILES["step" + i] = `assets/sound/step${i}.mp3`;

let listener = null;
const buffers = {};
let muted = false;
try { muted = localStorage.getItem("pov-muted") === "1"; } catch (e) { }

export function initSound(camera) {
  listener = new THREE.AudioListener();
  listener.setMasterVolume(muted ? 0 : 1);
  camera.add(listener);
  makeSfx(listener.context);
  const loader = new THREE.AudioLoader();
  for (const [k, url] of Object.entries(FILES)) loader.load(A(url) + ASSET_V, (b) => (buffers[k] = b), undefined, (e) => console.warn("[sound] 못 읽음", url, e));
}

export const soundReady = (name) => !!buffers[name];
export function unlock() { if (listener && listener.context.state !== "running") listener.context.resume(); }

// 효과음: 파일 없이 소리를 직접 만든다 (잡음 + 낮은 음 + 소리 크기 곡선)
function makeSfx(ctx) {
  const sr = ctx.sampleRate;
  const make = (sec, fn) => {
    const n = Math.floor(sec * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    let lp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, r = Math.random() * 2 - 1;
      lp += (r - lp) * 0.08; lp2 += (r - lp2) * 0.5;            // 낮은 잡음 · 밝은 잡음
      d[i] = Math.max(-1, Math.min(1, fn(t, lp * 3, lp2, r)));
    }
    return b;
  };
  // (발소리는 파일 step0~5 를 쓴다)
  buffers.land = make(0.25, (t, low) => Math.sin(2 * Math.PI * 60 * t) * Math.exp(-t * 20) * 0.9 + low * Math.exp(-t * 25) * 0.7);
  // 팔 뻗기 '휙'
  buffers.whoosh = make(0.28, (t, low, mid) => mid * Math.sin(Math.PI * t / 0.28) ** 2 * 0.5);
  // 잡았다 '띠링'
  buffers.catch = make(0.45, (t) => (Math.sin(2 * Math.PI * 880 * t) * (t < 0.12 ? 1 : 0) + Math.sin(2 * Math.PI * 1320 * t) * (t >= 0.1 ? 1 : 0)) * Math.exp(-t * 7) * 0.35);
  // 풀업보이 '펑' (연기)
  buffers.poof = make(0.7, (t, low, mid) => (low * 0.9 + mid * 0.25 * Math.exp(-t * 12)) * Math.min(1, t * 60) * Math.exp(-t * 6));
  // 제프리 미끄러짐: '삐익' 하고 '쿵'
  buffers.slip = make(0.6, (t, low) => (t < 0.18 ? Math.sin(2 * Math.PI * (1300 - 3000 * t) * t) * 0.25 : 0) + (t > 0.3 ? (Math.sin(2 * Math.PI * 55 * t) * 0.9 + low * 0.6) * Math.exp(-(t - 0.3) * 14) : 0));
  // 유리 자동문 '스르륵'
  buffers.door = make(1.0, (t, low, mid) => mid * 0.18 * Math.sin(Math.PI * t) + low * 0.1 * Math.sin(Math.PI * t));
}

// 소리 하나 틀기. follow 를 주면 그 물체에서 나는 소리(가까울수록 크게), 아니면 화면 전체에 같은 크기
// far: 이 거리(m)에서 소리가 0 이 되게(직선으로 줄어듦) - 소리로 위치를 찾는 용도
export function play(name, { follow = null, volume = 1, ref = 6, rate = 1, far = 0 } = {}) {
  if (!listener || !buffers[name]) return null;
  const a = follow ? new THREE.PositionalAudio(listener) : new THREE.Audio(listener);
  a.setBuffer(buffers[name]);
  a.setVolume(volume);
  if (rate !== 1) a.setPlaybackRate(rate);
  if (follow) {
    if (far) { a.setDistanceModel("linear"); a.setRefDistance(ref); a.setMaxDistance(far); a.setRolloffFactor(1); }
    else { a.setRefDistance(ref); a.setRolloffFactor(1.2); }
    follow.add(a);
  }
  a.onEnded = () => { a.isPlaying = false; if (a.parent) a.parent.remove(a); };
  a.play();
  return a;
}

// 발소리: 매번 다른 것 + 높낮이 살짝
let stepN = 0;
export function step(opts = {}) { stepN = (stepN + 1 + Math.floor(Math.random() * (STEPS - 1))) % STEPS; return play("step" + stepN, { ...opts, rate: 0.94 + Math.random() * 0.12 }); }
export const duration = (name) => (buffers[name] ? buffers[name].duration : 0);

export function stop(a) { if (a && a.isPlaying) a.stop(); if (a && a.parent) a.parent.remove(a); }

export function toggleMute() {
  muted = !muted;
  if (listener) listener.setMasterVolume(muted ? 0 : 1);
  try { localStorage.setItem("pov-muted", muted ? "1" : "0"); } catch (e) { }
  return muted;
}
