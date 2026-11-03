/* 샷건치기 — 판정 로직 (화면·소리 없음)

   브라우저(game.js)와 순위표 서버(bamti-bomb/server/shotgun-sim.js)가 이 파일을 똑같이 쓴다.
   서버는 "몇 번째 틱에 내려쳤는가" 목록만 받아서 이 코드로 판을 처음부터 다시 돌리고,
   버틴 시간을 직접 센다. 그래서 점수를 고쳐 보내도 소용이 없다.

   다시 돌렸을 때 결과가 같으려면:
     - 시간은 1/60초 틱 단위로만 흐른다 (화면 프레임과 무관)
     - 난수는 시드로 만든 정수 난수만 쓴다 (Math.random 금지)
     - Math.sin 같은 함수는 브라우저마다 끝자리가 다를 수 있어 쓰지 않는다. 사칙연산만
   규칙을 바꾸면 VERSION 을 올리고 서버 사본도 같이 바꾼다 (tools/sync_sim.py). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ShotgunSim = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const VERSION = 6;
  const HZ = 60;
  const W = 1280;                 // 판정 좌표는 화면 가로 1280 기준
  const STRIKE_X = 470;           // 주먹이 떨어지는 곳 (고정)
  /* 판정은 주먹이 책상에 닿는 순간, 화면에 보이는 그 자리 기준 (누른 순간 기준이면 0.07초 늦게 쳐야 맞아서
     일찍 치면 빗나가고 늦게 치면 맞는 쪽으로 치우쳤다, 2026-11-02).
     뽀또: 주먹 가운데에서 좌우 85px 안 (넉넉하게).
     압정: 주먹과 압정 모양이 조금이라도 겹치면 맞음. 주먹 아래쪽 60px 폭은 판정 x 기준 왼쪽 62(팔뚝)·오른쪽 44,
     압정(그린 폭 80)의 불투명 부분 반폭 20 → 압정 x 가 판정 x 기준 -82 ~ +64 이면 걸친다 */
  const POTTO_R = 85;
  const TACK_LEFT = 82, TACK_RIGHT = 64;

  /* 내려치기 동작 (틱). 누르면 IMPACT 틱 뒤에 책상에 닿는다.
     닿고 나서 REARM 틱이 지나면 다시 칠 수 있다 → 최대 초당 10번 */
  const IMPACT = 4;
  const REARM = 2;
  const RETURN = 14;              // 이 틱이 지나면 팔이 다시 올라가 있다

  const GAUGE_MAX = 100;
  const POTTO_GAIN = 10;
  const DESK_GAIN = 0.7;          // 빈 책상만 쳐도 조금 (뽀또의 7%). 연타하면 초당 최대 +7 (2026-11-03 사용자 요청)
  const TACK_LOSS = 35;           // 압정을 치면 크게 깎인다 (호에에 동안 안 닳는 만큼 더 깎는다)
  const HOE_TICKS = 90;           // 호에에 1.5초 — 그동안 못 친다

  const NO_TACK_TICKS = 3 * HZ;   // 처음 3초는 뽀또만

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 시간이 갈수록: 빨라지고, 게이지가 빨리 닳고, 압정이 많아진다.
     게이지 닳는 속도는 끝없이 오르고 뽀또가 나오는 빈도는 한계가 있어서,
     완벽하게 쳐도 언젠가는 죽는다 (사람이 낼 수 있는 기록에 상한이 생긴다) */
  function speedAt(sec) { return Math.min(1000, 380 + 9 * sec); }        // px/s
  function drainAt(sec) { return 7 + 0.09 * sec; }                       // 게이지/s
  function tackRateAt(sec) { return Math.min(0.5, 0.18 + 0.004 * sec); }

  function create(seed) {
    const s = {
      v: VERSION,
      seed: seed >>> 0,
      rnd: mulberry32(seed >>> 0),
      tick: 0,
      cam: 0,                     // 지금까지 흘러간 거리
      gauge: GAUGE_MAX,
      items: [],                  // {id, kind: "potto"|"tack", wx}
      nextX: W * 0.75,            // 다음 아이템을 놓을 월드 x
      nextId: 1,
      punchT: -1,                 // 내려치기 시작 후 틱 (-1 = 쉬는 중)
      hoeUntil: 0,                // 이 틱까지 호에에
      dead: false,
      eaten: 0,
      tacks: 0,
      streak: 0,                  // 연속 뽀또
      lastTack: false             // 바로 앞이 압정이었나
    };
    fill(s);
    return s;
  }

  function canTap(s) {
    if (s.dead || s.tick < s.hoeUntil) return false;
    return s.punchT < 0 || s.punchT >= IMPACT + REARM;
  }

  /* 이번 틱에 내려친다. 받아들였으면 true. step() 보다 먼저 부른다 */
  function tap(s) {
    if (!canTap(s)) return false;
    s.punchT = 0;
    return true;
  }

  function fill(s) {
    const sec = s.tick / HZ;
    const v = speedAt(sec);
    while (s.nextX < s.cam + W + 200) {
      // 압정은 두 개 연달아 나오지 않는다 — 뽀또가 꾸준히 나오게 (2026-10-30 사용자 요청)
      let kind = "potto";
      if (s.tick >= NO_TACK_TICKS && !s.lastTack && s.rnd() < tackRateAt(sec)) kind = "tack";
      s.lastTack = kind === "tack";
      s.items.push({ id: s.nextId++, kind: kind, wx: s.nextX });
      // 간격: 빠를수록 넓게 잡아 시간으로는 0.2초 이상 떨어지게 (초당 10번이 한계라서)
      const minGap = Math.max(170, v * 0.2);
      s.nextX += minGap + s.rnd() * 200;
    }
  }

  /* 한 틱 진행. 일어난 일을 out 배열에 넣는다 (화면 효과용) */
  function step(s, out) {
    if (s.dead) return;
    const sec = s.tick / HZ;
    const v = speedAt(sec);
    s.cam += v / HZ;

    if (s.punchT >= 0) {
      s.punchT++;
      if (s.punchT === IMPACT) impact(s, v, out);
      if (s.punchT > RETURN) s.punchT = -1;
    }

    // 호에에 하는 동안은 게이지가 닳지 않는다 (압정 값은 친 순간 한 번만)
    if (s.tick >= s.hoeUntil) s.gauge -= drainAt(sec) / HZ;
    if (s.gauge > GAUGE_MAX) s.gauge = GAUGE_MAX;

    // 왼쪽으로 지나간 것 정리
    let k = 0;
    for (let i = 0; i < s.items.length; i++) {
      const it = s.items[i];
      if (it.wx - s.cam > -200) s.items[k++] = it;
      else if (it.kind === "potto" && out) out.push({ t: "pass", id: it.id });
    }
    s.items.length = k;
    fill(s);

    s.tick++;
    if (s.gauge <= 0) {
      s.gauge = 0;
      s.dead = true;
      if (out) out.push({ t: "dead" });
    }
  }

  /* 주먹이 책상에 닿은 순간. 누른 순간에 원 안에 있던 것을 맞힌다
     (닿기까지 IMPACT 틱 동안 아이템이 왼쪽으로 간 만큼 판정 중심을 옮긴다) */
  function impact(s, v, out) {
    // 압정에 걸치면 그게 먼저다. 아니면 가장 가까운 뽀또
    let best = -1, bestD = 1e9, tack = -1;
    for (let i = 0; i < s.items.length; i++) {
      const it = s.items[i];
      const dx = it.wx - s.cam - STRIKE_X;
      if (it.kind === "tack") { if (dx >= -TACK_LEFT && dx <= TACK_RIGHT) tack = i; }
      else if (Math.abs(dx) <= POTTO_R && Math.abs(dx) < bestD) { best = i; bestD = Math.abs(dx); }
    }
    if (tack >= 0) best = tack;
    if (out) out.push({ t: "impact" });
    if (best < 0) {
      s.gauge += DESK_GAIN;
      if (s.gauge > GAUGE_MAX) s.gauge = GAUGE_MAX;
      if (out) out.push({ t: "whiff" });
      return;
    }
    const it = s.items.splice(best, 1)[0];
    if (it.kind === "potto") {
      s.gauge += POTTO_GAIN;
      if (s.gauge > GAUGE_MAX) s.gauge = GAUGE_MAX;
      s.eaten++; s.streak++;
      if (out) out.push({ t: "eat", id: it.id, x: it.wx - s.cam, perfect: bestD < 24 });
    } else {
      s.gauge -= TACK_LOSS;
      s.tacks++; s.streak = 0;
      s.hoeUntil = s.tick + HOE_TICKS;
      s.punchT = -1;
      if (out) out.push({ t: "tack", id: it.id, x: it.wx - s.cam });
    }
  }

  /* 서버에서 쓰는 다시 돌리기. taps = 내려친 틱 번호 (오름차순) */
  function replay(seed, taps, maxTicks) {
    const s = create(seed);
    let j = 0;
    while (!s.dead && s.tick < maxTicks) {
      while (j < taps.length && taps[j] < s.tick) j++;          // 지난 것(받아들여지지 않은 것)은 건너뛴다
      if (j < taps.length && taps[j] === s.tick) { tap(s); j++; }
      step(s, null);
    }
    return { dead: s.dead, ticks: s.tick, eaten: s.eaten, tacks: s.tacks };
  }

  return {
    VERSION, HZ, W, STRIKE_X, POTTO_R, TACK_LEFT, TACK_RIGHT, IMPACT, RETURN, HOE_TICKS, GAUGE_MAX,
    speedAt, create, canTap, tap, step, replay
  };
});
