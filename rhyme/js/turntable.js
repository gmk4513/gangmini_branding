/* 턴테이블 — 판을 잡고 앞뒤로 긁으면 onScratch(속도) 가 계속 불리고,
   손을 떼면 onRelease(비트를 바꾸는지) 가 불린다. 충분히 긁었으면 그때 onSpin.
   살짝 건드리고 뗀 건 무시한다 (SCRATCH_DEG 미만). */

const SCRATCH_DEG = 90;
export const GENRE_EN = { "붐뱁": "BOOM BAP", "트랩": "TRAP", "드릴": "DRILL", "웨스트코스트": "WEST COAST", "리믹스": "REMIX" };

export function taegeukSVG(size = 100) {
  // 태극 — 위 빨강, 아래 파랑. 빨강 머리가 왼쪽, 파랑 머리가 오른쪽
  return `<svg viewBox="-50 -50 100 100" width="${size}" height="${size}" aria-hidden="true">
    <circle r="50" fill="var(--obang-blue)"/>
    <path d="M-50 0 A50 50 0 0 1 50 0 A25 25 0 0 0 0 0 A25 25 0 0 1 -50 0Z" fill="var(--obang-red)"/>
  </svg>`;
}

export function createTurntable(el, { onSpin, onGrab = () => {}, onScratch = () => {}, onRelease = () => {}, onList = () => {} }) {
  el.classList.add("deck");
  el.innerHTML = `
    <div class="deck__plate">
      <div class="deck__disc" role="button" aria-label="판을 잡고 긁다가 놓으면 다음 비트" tabindex="0">
        <div class="deck__spin">
          <div class="deck__grooves"></div>
          <div class="deck__label">${taegeukSVG(100)}</div>
          <i class="deck__mark"></i>
        </div>
      </div>
      <div class="deck__arm"><i></i></div>
    </div>
    <div class="deck__info">
      <button class="deck__title" type="button" aria-label="비트 목록 열기"></button><span class="deck__meta"></span><span class="deck__hint">↻ 판을 긁다 놓으면 다음 비트</span>
      <span class="deck__eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
    </div>`;

  const disc = el.querySelector(".deck__disc");
  el.querySelector(".deck__title").addEventListener("click", onList);
  const spin = el.querySelector(".deck__spin");
  let angle = 0, dragging = false, last = 0, moved = 0;
  let vel = 0, lastT = 0, raf = 0;          // vel: 판 속도(도/초), 손이 멈추면 0 으로 줄어든다

  const ang = e => {
    const r = disc.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
  };

  // 손을 멈추고 있으면 pointermove 가 안 오므로, 매 프레임 속도를 줄여 소리도 멎게 한다
  const tick = () => {
    if (!dragging) return;
    if (performance.now() - lastT > 40) vel *= 0.6;
    onScratch(vel);
    raf = requestAnimationFrame(tick);
  };

  disc.addEventListener("pointerdown", e => {
    dragging = true; moved = 0; vel = 0;
    last = ang(e);
    lastT = performance.now();
    disc.setPointerCapture(e.pointerId);
    el.classList.add("deck--grab");
    e.preventDefault();
    onGrab();
    raf = requestAnimationFrame(tick);
  });
  disc.addEventListener("pointermove", e => {
    if (!dragging) return;
    const a = ang(e), t = performance.now();
    let d = a - last;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    last = a;
    angle += d;
    moved += Math.abs(d);
    const dt = Math.max(8, t - lastT) / 1000;
    vel = vel * 0.4 + (d / dt) * 0.6;
    lastT = t;
    spin.style.setProperty("--hand", angle + "deg");
  });
  const up = () => {
    if (!dragging) return;
    dragging = false;
    cancelAnimationFrame(raf);
    el.classList.remove("deck--grab");
    const spins = moved >= SCRATCH_DEG;
    onRelease(spins);
    if (spins) onSpin({ scratched: true });
  };
  disc.addEventListener("pointerup", up);
  disc.addEventListener("pointercancel", up);
  // 키보드: 엔터/스페이스로도 돌린다
  disc.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); angle += 360; spin.style.setProperty("--hand", angle + "deg"); onSpin({ scratched: false }); }
  });

  return {
    set(beat, i = 0) {
      el.querySelector(".deck__title").textContent = beat.title;
      el.querySelector(".deck__meta").textContent = `${GENRE_EN[beat.genre] || beat.genre} / ${beat.shownBpm || beat.bpm} BPM / SIDE ${String.fromCharCode(65 + i)}`;
    },
    playing(on) { el.classList.toggle("deck--on", on); },
    info: el.querySelector(".deck__info"),
  };
}
