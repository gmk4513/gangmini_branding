/* 비트 재생기 — 모든 박자는 AudioContext 시계로 잰다.
   화면은 engine.position() 으로 "지금 몇 마디 몇 박인지" 를 읽어 그리기만 한다.
   (setTimeout 으로 박을 세면 폰에서 금방 어긋난다)

   비트는 두 종류:
   - file   진짜 비트 파일. bpm·offset(첫 박이 시작하는 초) 을 같이 적는다
   - synth  파일이 오기 전까지 쓰는 임시 드럼. 아래 패턴을 코드로 연주한다 */

const LOOKAHEAD = 0.15;         // 이만큼 앞까지 미리 예약
const TICK_MS = 25;

const noteHz = n => 440 * Math.pow(2, (n - 69) / 12);

/* 아이폰 무음 스위치 — 웹 오디오는 '벨소리' 취급이라 무음 모드면 안 들린다 → '음악 재생' 으로 바꾼다.
   새 사파리(17+)는 audioSession 으로, 예전 iOS 는 소리 없는 <audio> 를 하나 틀어 두면 페이지 전체가 음악 재생이 된다.
   손으로 누른 순간(init)에 불러야 한다 */
let silentEl = null;
function playThroughSilentSwitch() {
  if (navigator.audioSession) { try { navigator.audioSession.type = "playback"; } catch {} return; }
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios) return;
  if (!silentEl) {
    silentEl = new Audio(silentWav());
    silentEl.loop = true;
    silentEl.setAttribute("playsinline", "");
    // 다른 앱으로 가면 같이 멈춘다 (안 그러면 잠금 화면에 '재생 중' 이 남는다). 돌아와서 누르면 init 이 다시 튼다
    document.addEventListener("visibilitychange", () => { if (document.hidden) silentEl.pause(); });
  }
  silentEl.play().catch(() => {});
}
function silentWav() {
  const n = 4000, b = new Uint8Array(44 + n), v = new DataView(b.buffer);   // 8kHz 8비트 0.5초 무음
  const s = (o, t) => [...t].forEach((c, i) => b[o + i] = c.charCodeAt(0));
  s(0, "RIFF"); v.setUint32(4, 36 + n, true); s(8, "WAVEfmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, "data"); v.setUint32(40, n, true);
  b.fill(128, 44);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}

export class Engine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.bus = null;
    this.beat = null;
    this.t0 = 0;                // 0번 마디가 시작하는 오디오 시각
    this.timer = 0;
  }

  async init(offline = null) {          // offline: 소리 확인용 OfflineAudioContext (평소엔 비움)
    if (!offline) playThroughSilentSwitch();
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = offline || new AC({ latencyHint: "interactive" });
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      // 맨 끝 부드러운 리미터 — 킥이 1 을 넘어 "빡" 하고 깨지지 않게 둥글게 누른다 (작은 소리는 거의 그대로)
      const pre = this.ctx.createGain();
      pre.gain.value = 0.66;
      const limit = this.ctx.createWaveShaper();
      limit.curve = softClip(1.5);
      this.master.connect(comp).connect(pre).connect(limit).connect(this.ctx.destination);
      this.chans = {};
      this.noise = this.makeNoise();
      // 비트는 전부 이 노드를 지난다 — 판을 긁는 동안 비트 소리를 줄이는 데 쓴다
      this.beatOut = this.ctx.createGain();
      this.beatOut.connect(this.master);
      // 폰 스피커는 60Hz 아래가 거의 안 나온다 → 808 에 배음을 살짝 입혀 들리게
      this.drive = this.ctx.createWaveShaper();
      this.drive.curve = softClip(2.2);
    }
    if (!offline && this.ctx.state !== "running" && !(this.ctx instanceof OfflineAudioContext)) await this.ctx.resume();
  }

  get bpm() { return this.beat ? this.beat.bpm : 90; }
  get beatDur() { return 60 / this.bpm; }
  get barDur() { return 4 * this.beatDur; }

  /** 귀에 들리는 시각 — 출력 지연만큼 빼야 화면과 소리가 맞는다 */
  now() {
    const c = this.ctx;
    return c ? c.currentTime - (c.outputLatency || c.baseLatency || 0) : 0;
  }

  /** 지금 위치. bar 는 0 부터(0 = 준비 마디), beat 0~3, frac 0~1 */
  position() {
    const b = (this.now() - this.t0) / this.beatDur;
    const whole = Math.floor(b);
    return { bar: Math.floor(whole / 4), beat: ((whole % 4) + 4) % 4, frac: b - whole, total: b };
  }

  async load(beat) {
    if (!beat.file || this.buffers.has(beat.file)) return;
    let buf;
    try { buf = await this.decode(beat.file); }
    catch (e) {                                      // FLAC 을 못 푸는 브라우저 → 같은 소리의 WAV
      if (!beat.fallback) throw e;
      buf = await this.decode(beat.fallback);
    }
    this.buffers.set(beat.file, buf);
  }

  async decode(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(url + " " + res.status);
    return await this.ctx.decodeAudioData(await res.arrayBuffer());
  }

  /**
   * 비트를 틀고, 그 시작을 firstBar 번째 마디로 맞춘다 (비트를 바꿔도 마디 번호가 이어지게).
   * @param delay 지금부터 몇 초 뒤에 시작할지
   */
  async play(beat, firstBar = 0, delay = 0.12) {
    this.stop();
    await this.init();
    await this.load(beat);
    this.beat = beat;
    const start = this.ctx.currentTime + delay;
    this.t0 = start - firstBar * this.barDur;

    const bus = this.ctx.createGain();
    bus.gain.value = beat.gain ?? 1;
    bus.connect(this.beatOut);
    this.bus = bus;
    this.beatOut.gain.cancelScheduledValues(this.ctx.currentTime);
    this.beatOut.gain.setValueAtTime(1, this.ctx.currentTime);

    if (beat.file) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers.get(beat.file);
      src.loop = true;
      const off = beat.offset || 0;
      src.loopStart = off;
      src.loopEnd = beat.loopBars ? off + beat.loopBars * this.barDur : src.buffer.duration;
      src.connect(bus);
      src.start(start, off);
      this.src = src;
    } else {
      this.step = firstBar * 16;           // 16분음표 단위
      this.stepBase = firstBar * 16;
      this.last808 = null;
      if (beat.synth.crackle) this.hiss = this.vinylHiss(this.chan(bus, "vinyl"), start);
      const run = () => this.schedule(bus);
      run();
      this.timer = setInterval(run, TICK_MS);
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = 0;
    if (this.src) { try { this.src.stop(); } catch {} this.src = null; }
    if (this.hiss) { try { this.hiss.stop(this.ctx.currentTime + 0.1); } catch {} this.hiss = null; }
    if (this.bus && this.ctx) {
      const g = this.bus.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 0.06);
      const old = this.bus;
      setTimeout(() => old.disconnect(), 200);    // 이미 예약된 소리도 이 버스를 지나므로 같이 끊긴다
    }
    this.bus = null;
  }

  /* ---------- 임시 드럼 ---------- */

  schedule(bus, until = this.ctx.currentTime + LOOKAHEAD) {
    const p = this.beat.synth;
    const sd = this.beatDur / 4;
    while (true) {
      const s = this.step;
      let t = this.t0 + s * sd;
      if (t > until) break;
      this.step++;
      if (t < this.ctx.currentTime - 0.01) continue;
      if (s % 2 === 1) t += (p.swing || 0) * sd;          // 붐뱁 스윙 — 홀수 16분음표를 살짝 늦춘다
      if (s % 4 === 2) t += (p.swing8 || 0) * this.beatDur; // 8분 스윙(셋잇단 느낌) — 뒷박 8분음표를 늦춘다

      // 줄마다 길이가 달라도 된다 (킥 2마디, 화음 4마디 …) — 각자 자기 길이로 돈다
      const barI = Math.floor((s - this.stepBase) / 16);
      const i = s % 16;
      const at = (row, k = barI) => (row[k % row.length] || "")[i];
      const root = p.roots[barI % p.roots.length];
      const ch = name => this.chan(bus, name);

      if (at(p.kick) === "x") {
        this.kick(ch("kick"), t);
        // b808: 킥마다 808 을 깔고 다음 킥까지 끈다. slide808: 음이 바뀌면 앞 음에서 미끄러져 들어간다
        if (p.b808) {
          const from = p.slide808 && this.last808 != null && this.last808 !== root ? this.last808 : null;
          this.k808(ch("bass"), t, root, this.gap(p.kick, barI, i) * sd * 0.97, from);
          this.last808 = root;
        }
      }
      if (at(p.snare) === "x") this.snare(ch("snare"), t);
      if (p.clap && at(p.clap) === "x") this.clap(ch("snare"), t);
      if (p.rim && at(p.rim) === "x") this.rim(ch("hat"), t);
      const h = at(p.hat);
      if (h === "x") this.hat(ch("hat"), t, 0.045, 0.26);
      if (h === "o") this.hat(ch("hat"), t, 0.22, 0.2);
      if (h === "r") { this.hat(ch("hat"), t, 0.03, 0.2); this.hat(ch("hat"), t + sd / 2, 0.03, 0.16); }
      if (h === "t") for (let k = 0; k < 3; k++) this.hat(ch("hat"), t + (sd * k) / 3, 0.025, 0.15);
      if (p.bass && at(p.bass) === "x") this.bass(ch("bass"), t, root, sd * 3);
      if (p.shaker && at(p.shaker) === "x") this.shaker(ch("hat"), t, i % 4 === 2 ? 0.09 : 0.05);
      if (p.stab && at(p.stab) === "x") this.stab(ch("keys"), t, p.stabChords[barI % p.stabChords.length]);
      if (p.janggu) {
        const j = at(p.janggu);
        if (j === "d" || j === "k") this.janggu(ch("janggu"), t, "kung", j === "d" ? 0.55 : 0.4);
        if (j === "d" || j === "t") this.janggu(ch("janggu"), t, "deok", 0.35);
      }
      if (i === 0) {
        const chord = p.chords && p.chords[barI % p.chords.length];
        if (chord) p.keys === "rhodes" ? this.rhodes(ch("keys"), t, chord, this.barDur * 0.95) : this.keys(ch("keys"), t, chord, this.barDur * 0.9);
        if (p.crackle) this.crackle(ch("vinyl"), t);
        // 선율 파트 — [시작 박, 길이(박), 음, 미끄러짐] 목록. 박 단위라 셋잇단도 그대로 적는다
        for (const part of p.parts || []) this.part(ch(part.inst === "synbass" || part.inst === "808" ? "bass" : "melody"), t, part, barI);
      }
    }
  }

  /** 이 줄에서 다음 "x" 까지 몇 칸인지 (다음 마디로 넘어가도 센다) — 808 을 다음 킥까지 끌 때 */
  gap(row, barI, i) {
    for (let j = 1; j <= 32; j++) {
      const k = i + j, c = (row[(barI + Math.floor(k / 16)) % row.length] || "")[k % 16];
      if (c === "x") return j;
    }
    return 16;
  }

  /** 악기 묶음별 볼륨 — 비트의 synth.mix = { kick: 1.4, hat: 0.6, … } 로 비트마다 섞는 비율을 맞춘다 */
  chan(bus, name) {
    if (this.chans.bus !== bus) this.chans = { bus };
    let c = this.chans[name];
    if (!c) {
      c = this.chans[name] = this.ctx.createGain();
      c.gain.value = this.beat.synth.mix?.[name] ?? 1;
      c.connect(bus);
    }
    return c;
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  env(dest, t, peak, decay, attack = 0.002) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }

  noiseHit(dest, t, len) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    n.connect(dest);
    n.start(t, Math.random() * 0.5);
    n.stop(t + len);
    return n;
  }

  /** 킥 — 높은 데서 확 떨어지는 사인파를 살짝 찌그러뜨려 "쿵" 에 힘을 준다. 맨 앞에 "탁" 클릭 */
  kick(bus, t) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.3);
    const sh = this.ctx.createWaveShaper();
    sh.curve = softClip(2.2);
    o.connect(sh).connect(this.env(bus, t, 0.75, 0.3, 0.001));
    o.start(t); o.stop(t + 0.42);
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = 1800;
    f.connect(this.env(bus, t, 0.5, 0.012, 0.0005));
    this.noiseHit(f, t, 0.025);
  }

  /** 808 — 길게 끄는 서브 베이스. 처음에 살짝 위에서 떨어지며 "둥", 앞 음에서 미끄러지기(from)도.
      찌그러뜨린 배음을 섞어 폰 스피커에서도 들리게 한다 */
  k808(bus, t, note, len, from = null, gain = 1) {
    const hz = noteHz(note);
    const o = this.ctx.createOscillator();
    if (from != null) {
      o.frequency.setValueAtTime(noteHz(from), t);
      o.frequency.exponentialRampToValueAtTime(hz, t + 0.13);
    } else {
      o.frequency.setValueAtTime(hz * 2.4, t);
      o.frequency.exponentialRampToValueAtTime(hz, t + 0.045);
    }
    const sh = this.ctx.createWaveShaper();
    sh.curve = softClip(this.beat?.synth?.dist808 ?? 3);
    const g = this.ctx.createGain();
    const end = t + Math.max(0.2, len);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.4 * gain, t + 0.004);
    g.gain.setTargetAtTime(0.24 * gain, t + 0.05, Math.max(0.15, len * 0.6));
    g.gain.setValueAtTime(0.24 * gain, end);
    g.gain.linearRampToValueAtTime(0, end + 0.07);
    g.connect(bus);
    o.connect(sh).connect(g);
    o.start(t); o.stop(end + 0.1);
  }

  /** 스네어 — 몸통(200Hz 톤) + 밝게 "착" 하는 잡음 + 짧은 방 울림 */
  snare(bus, t) {
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(230, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.05);
    o.connect(this.env(bus, t, 0.55, 0.1, 0.001));
    o.start(t); o.stop(t + 0.15);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 3200; bp.Q.value = 0.6;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 1100;
    bp.connect(hp).connect(this.env(bus, t, 1.3, 0.17, 0.001));
    this.noiseHit(bp, t, 0.22);
    const room = this.ctx.createBiquadFilter();
    room.type = "lowpass"; room.frequency.value = 5000;
    room.connect(this.env(bus, t + 0.01, 0.12, 0.3, 0.01));
    this.noiseHit(room, t + 0.01, 0.35);
  }

  /** 클랩 — 손뼉 여러 번이 겹친 "짝" */
  clap(bus, t) {
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 1600; f.Q.value = 0.8;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 700;
    f.connect(hp).connect(bus);
    for (const [d, peak, dec] of [[0, 0.7, 0.01], [0.011, 0.6, 0.01], [0.022, 0.75, 0.012], [0.034, 0.85, 0.2]]) {
      const g = this.env(f, t + d, peak, dec);
      const n = this.ctx.createBufferSource();
      n.buffer = this.noise;
      n.connect(g);
      n.start(t + d, Math.random() * 0.5); n.stop(t + d + dec + 0.03);
    }
  }

  /** 하이햇 — 808 처럼 사각파 여섯 개를 겹친 쇳소리 (그냥 잡음보다 "칙" 이 또렷하다) */
  hat(bus, t, decay, vol) {
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 7000;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 10000; bp.Q.value = 0.7;
    bp.connect(hp).connect(this.env(bus, t, vol * 2.6, decay, 0.0008));
    for (const r of [2, 3, 4.16, 5.43, 6.79, 8.21]) {
      const o = this.ctx.createOscillator();
      o.type = "square"; o.frequency.value = 40 * r * 2;
      o.connect(bp);
      o.start(t); o.stop(t + decay + 0.05);
    }
  }

  /** 림 — 드릴·트랩의 "똑" */
  rim(bus, t) {
    const o = this.ctx.createOscillator();
    o.type = "square"; o.frequency.value = 1700;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 1700; f.Q.value = 3;
    o.connect(f).connect(this.env(bus, t, 0.35, 0.035, 0.0005));
    o.start(t); o.stop(t + 0.06);
  }

  /** 벨 — 트랩의 어두운 종소리 멜로디 (FM) */
  bell(bus, t, note, len, gain = 1) {
    const hz = noteHz(note);
    const car = this.ctx.createOscillator(), mod = this.ctx.createOscillator(), mg = this.ctx.createGain();
    car.frequency.value = hz;
    mod.frequency.value = hz * 3.5;
    mg.gain.setValueAtTime(hz * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(hz * 0.2, t + 0.6);
    mod.connect(mg).connect(car.frequency);
    const ring = Math.max(0.6, Math.min(2, len * 2));
    car.connect(this.env(bus, t, 0.22 * gain, ring, 0.002));
    car.start(t); mod.start(t); car.stop(t + ring + 0.1); mod.stop(t + ring + 0.1);
  }

  /** 피아노 한 음 — 어두운 단음 멜로디용 */
  piano(bus, t, note, len, gain = 1) {
    const hz = noteHz(note);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(800, t + 0.6);
    const ring = Math.max(0.5, Math.min(2.2, len * 2));
    f.connect(this.env(bus, t, 0.25 * gain, ring, 0.002));
    for (const [type, mul, v] of [["triangle", 1, 1], ["sawtooth", 1, 0.2], ["sine", 2, 0.3]]) {
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = hz * mul;
      o.detune.value = (Math.random() - 0.5) * 4;
      const g = this.ctx.createGain(); g.gain.value = v;
      o.connect(g).connect(f);
      o.start(t); o.stop(t + ring + 0.1);
    }
  }

  bass(bus, t, note, len) {
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = noteHz(note);
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 700;
    o.connect(f).connect(this.env(bus, t, 0.45, len, 0.01));
    o.start(t); o.stop(t + len + 0.05);
  }

  keys(bus, t, notes, len) {
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 1800;
    f.connect(this.env(bus, t, 0.13, len, 0.03));
    for (const n of notes) {
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = noteHz(n);
      o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(f);
      o.start(t); o.stop(t + len + 0.05);
    }
  }

  /* ---------- 90년대 붐뱁 · 웨스트코스트 · 국악 리믹스용 ---------- */

  /** 누르는 동안 소리가 유지되는 엔벨로프 (env 는 치고 사라지는 소리용) */
  hold(dest, t, peak, len, attack = 0.02, release = 0.08) {
    const g = this.ctx.createGain();
    const end = t + Math.max(attack, len);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, end);
    g.gain.linearRampToValueAtTime(0, end + release);
    g.connect(dest);
    return g;
  }

  /** 선율 파트 하나에서 이번 마디 몫을 예약한다 */
  part(bus, barT, part, barN) {
    const loop = part.bars || 1, b = barN % loop, notes = part.notes;
    notes.forEach((n, k) => {
      const [beat, dur, note, glide] = n;
      if (Math.floor(beat / 4) !== b) return;
      const t = barT + (beat - 4 * b) * this.beatDur, len = dur * this.beatDur;
      const from = glide ? notes[(k - 1 + notes.length) % notes.length][2] : null;
      const g = part.gain ?? 1;
      if (part.inst === "lead") this.lead(bus, t, note, len, from, g);
      else if (part.inst === "synbass") this.synBass(bus, t, note, len, from, g);
      else if (part.inst === "pluck") this.pluck(bus, t, note, len, g);
      else if (part.inst === "808") this.k808(bus, t, note, len * 0.97, from, g);
      else if (part.inst === "bell") this.bell(bus, t, note, len, g);
      else if (part.inst === "piano") this.piano(bus, t, note, len, g);
    });
  }

  /** 로즈(전자피아노) — 사인파 + 칠 때 "땅" 하는 배음, 트레몰로 살짝 */
  rhodes(bus, t, notes, len) {
    const out = this.ctx.createGain();
    out.gain.value = 1;
    out.connect(this.env(bus, t, 0.2, len, 0.008));
    const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
    lfo.frequency.value = 4.6; lg.gain.value = 0.22;
    lfo.connect(lg).connect(out.gain);
    lfo.start(t); lfo.stop(t + len + 0.1);
    for (const n of notes) {
      const hz = noteHz(n);
      const o = this.ctx.createOscillator();
      o.frequency.value = hz;
      o.detune.value = (Math.random() - 0.5) * 6;
      o.connect(out);
      const bark = this.ctx.createOscillator();
      bark.frequency.value = hz * 4;
      bark.connect(this.env(out, t, 0.18, 0.25, 0.002));
      o.start(t); o.stop(t + len + 0.1);
      bark.start(t); bark.stop(t + 0.35);
    }
  }

  /** 피아노 스탭 — 샘플을 잘라 쓴 듯 짧게 끊는 화음 */
  stab(bus, t, notes) {
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.25);
    f.connect(this.env(bus, t, 0.14, 0.32, 0.003));
    for (const n of notes) {
      for (const [type, v] of [["triangle", 1], ["sawtooth", 0.25]]) {
        const o = this.ctx.createOscillator();
        o.type = type; o.frequency.value = noteHz(n);
        const g = this.ctx.createGain(); g.gain.value = v;
        o.connect(g).connect(f);
        o.start(t); o.stop(t + 0.4);
      }
    }
  }

  /** G펑크 리드 — 높게 우는 사인파. 앞 음에서 미끄러져 들어오고, 길게 끌면 비브라토 */
  lead(bus, t, note, len, from, gain = 1) {
    const hz = noteHz(note);
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
    o2.type = "sawtooth";
    for (const x of [o, o2]) {
      if (from != null) { x.frequency.setValueAtTime(noteHz(from), t); x.frequency.exponentialRampToValueAtTime(hz, t + 0.09); }
      else x.frequency.setValueAtTime(hz, t);
    }
    const lfo = this.ctx.createOscillator(), depth = this.ctx.createGain();
    lfo.frequency.value = 5.6;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(hz * 0.014, t + Math.min(0.35, len));
    lfo.connect(depth); depth.connect(o.frequency); depth.connect(o2.frequency);
    const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 2200;
    const g2 = this.ctx.createGain(); g2.gain.value = 0.12;
    const out = this.hold(bus, t, 0.13 * gain, len, 0.03, 0.12);
    o.connect(out); o2.connect(g2).connect(f).connect(out);
    for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + len + 0.2); }
  }

  /** 신스 베이스(무그 느낌) — 톱니파를 낮은 필터로 막고, 음 사이를 미끄러진다 */
  synBass(bus, t, note, len, from, gain = 1) {
    const hz = noteHz(note);
    const o = this.ctx.createOscillator(), sub = this.ctx.createOscillator();
    o.type = "sawtooth";
    for (const x of [o, sub]) {
      if (from != null) { x.frequency.setValueAtTime(noteHz(from), t); x.frequency.exponentialRampToValueAtTime(hz, t + 0.06); }
      else x.frequency.setValueAtTime(hz, t);
    }
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.Q.value = 5;
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(380, t + 0.18);
    const out = this.hold(bus, t, 0.32 * gain, len * 0.92, 0.008, 0.06);
    const gs = this.ctx.createGain(); gs.gain.value = 0.8;
    o.connect(f).connect(out);
    sub.connect(gs).connect(out);
    for (const x of [o, sub]) { x.start(t); x.stop(t + len + 0.1); }
  }

  /** 가야금 — 뜯는 순간 살짝 높았다 제자리로, 긴 음은 농현(떨림) */
  pluck(bus, t, note, len, gain = 1) {
    const hz = noteHz(note);
    const ring = Math.max(0.5, Math.min(1.6, len * 1.4));
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.Q.value = 2;
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.3);
    f.connect(this.env(bus, t, 0.3 * gain, ring, 0.003));
    const lfo = this.ctx.createOscillator(), depth = this.ctx.createGain();
    lfo.frequency.value = 6.2;
    depth.gain.setValueAtTime(0, t);
    if (len > 0.5) { depth.gain.setValueAtTime(0, t + 0.22); depth.gain.linearRampToValueAtTime(hz * 0.02, t + 0.45); }
    lfo.connect(depth);
    for (const [type, v] of [["triangle", 1], ["sawtooth", 0.35]]) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(hz * 1.025, t);
      o.frequency.exponentialRampToValueAtTime(hz, t + 0.05);
      depth.connect(o.frequency);
      const g = this.ctx.createGain(); g.gain.value = v;
      o.connect(g).connect(f);
      o.start(t); o.stop(t + ring + 0.1);
    }
    lfo.start(t); lfo.stop(t + ring + 0.1);
  }

  /** 장구 — kung(궁편, 낮게 울림) / deok(채편, 딱 치는 소리) */
  janggu(bus, t, kind, vol) {
    if (kind === "kung") {
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(82, t + 0.12);
      o.connect(this.env(bus, t, vol, 0.32));
      o.start(t); o.stop(t + 0.4);
      return;
    }
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 2600; f.Q.value = 1.4;
    f.connect(this.env(bus, t, vol, 0.07));
    this.noiseHit(f, t, 0.09);
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.05);
    o.connect(this.env(bus, t, vol * 0.6, 0.06));
    o.start(t); o.stop(t + 0.1);
  }

  /** 셰이커 — 웨스트코스트의 잘게 흔드는 16분 */
  shaker(bus, t, vol) {
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 6500; f.Q.value = 0.9;
    f.connect(this.env(bus, t, vol, 0.045, 0.006));
    this.noiseHit(f, t, 0.07);
  }

  /** LP 판 잡음 — 마디마다 "틱, 틱" 몇 번 */
  crackle(bus, t) {
    for (let k = 0; k < 9; k++) {
      const at = t + Math.random() * this.barDur;
      const f = this.ctx.createBiquadFilter();
      f.type = "highpass"; f.frequency.value = 2500;
      f.connect(this.env(bus, at, 0.03 + Math.random() * 0.09, 0.006, 0.001));
      this.noiseHit(f, at, 0.012);
    }
  }

  /** LP 판 "쉬—" 하는 바닥 잡음. stop() 에서 끈다 */
  vinylHiss(bus, t) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise; n.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 3800; f.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0.011;
    n.connect(f).connect(g).connect(bus);
    n.start(t);
    return n;
  }

  /* ---------- 효과음 ---------- */

  /** 판을 잡고 있는 동안 비트를 줄인다 (진짜 판도 손으로 잡으면 멈추듯) */
  duck(on) {
    if (!this.ctx) return;
    const g = this.beatOut.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(on ? 0.18 : 1, t, on ? 0.03 : 0.08);
  }

  /**
   * 손으로 긁는 소리 — "휘끼휘끼". 판 속도(도/초)를 set() 으로 계속 넣어 주면
   * 속도에 따라 음높이·모음 소리가 오르내린다. 멈추면 조용해진다.
   * 원리: 톱니파 "아—" 소리를 모음 필터(포먼트) 둘에 통과 — 판을 빨리 돌리면 녹음된 목소리가 높아지는 것과 같게
   * 음높이와 필터를 같이 올린다. 판 잡음(노이즈)도 조금.
   */
  scratchStart() {
    if (!this.ctx) return null;
    const c = this.ctx;
    const out = c.createGain();
    out.gain.value = 0;
    out.connect(this.master);
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 120;
    const f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), f3 = c.createBiquadFilter();
    f1.type = f2.type = f3.type = "bandpass";
    f1.Q.value = 5; f2.Q.value = 6; f3.Q.value = 0.8;
    const g2 = c.createGain(); g2.gain.value = 0.6;
    o.connect(f1).connect(out);
    o.connect(f2).connect(g2).connect(out);
    const n = c.createBufferSource();
    n.buffer = this.noise; n.loop = true;
    const gn = c.createGain(); gn.gain.value = 0.25;
    n.connect(f3).connect(gn).connect(out);
    o.start(); n.start();
    let dir = 1;
    return {
      set(vel) {
        const r = Math.min(4, Math.abs(vel) / 240);     // 1 = 보통 재생 속도쯤
        const t = c.currentTime, k = 0.012;
        // 방향이 바뀌는 순간 소리가 "끽" 하고 끊겼다 다시 붙게
        const d = Math.sign(vel) || dir;
        if (d !== dir) { out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(0, t); dir = d; }
        o.frequency.setTargetAtTime(45 + 170 * r, t, k);
        f1.frequency.setTargetAtTime(250 + 600 * r, t, k);
        f2.frequency.setTargetAtTime(400 + 1000 * r, t, k);
        f3.frequency.setTargetAtTime(600 + 2400 * r, t, k);
        out.gain.setTargetAtTime(r < 0.06 ? 0 : Math.min(0.9, 0.25 + r * 0.45), t, 0.008);
      },
      stop() {
        const t = c.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setTargetAtTime(0, t, 0.02);
        o.stop(t + 0.2); n.stop(t + 0.2);
        setTimeout(() => out.disconnect(), 400);
      },
    };
  }

  /** 판 긁는 소리 — 대역 필터를 앞뒤로 흔든다 (키보드로 돌렸을 때) */
  scratch(len = 0.55) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.Q.value = 3;
    const wig = [600, 2400, 500, 2800, 700, 1800, 400];
    wig.forEach((hz, i) => f.frequency.linearRampToValueAtTime(hz, t + (len * i) / (wig.length - 1)));
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    wig.forEach((_, i) => g.gain.linearRampToValueAtTime(i % 2 ? 0.9 : 0.15, t + (len * i) / (wig.length - 1)));
    g.gain.linearRampToValueAtTime(0, t + len + 0.05);
    f.connect(g).connect(this.master);
    this.noiseHit(f, t, len + 0.1);
  }
}

function softClip(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}
