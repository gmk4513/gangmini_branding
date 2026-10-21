/* 카드 만들기 — @to_twenties (21세기 괴테) 카드뉴스

   메모 붙여넣기 → 서버(bamti-bomb)가 Claude 로 다듬고 나눔 → 여기서 1080×1440 으로 그림
   → 공유 창으로 사진 앱에 한꺼번에 저장 → 인스타에서 여러 장 골라 게시.

   카드 디자인은 전부 이 파일의 draw* 함수 안에 있다. 고정 요소(배경·괴테·번호·계정)는
   손으로 배치하지 않으므로 매일 똑같이 나온다.
   비율이 3:4 인 건 인스타 프로필 격자가 3:4 로 잘라 보여 주기 때문이다. */
(function () {
  "use strict";

  const API = "https://bamti-bomb.fly.dev/api/card/polish";
  const W = 1080, H = 1440;
  const C = {
    paper: "#F3EEE4", ink: "#26221E", sub: "#8C8478", faint: "#B8AE9F",
    accent: "#C8553D", mark: "rgba(200, 85, 61, 0.24)"
  };
  const SERIF = '"Noto Serif KR", serif';
  const SANS = '"Pretendard", system-ui, sans-serif';
  const HANDLE = "@to_twenties";
  const OUTRO_DEFAULT = "저장해 두고\n흔들릴 때 다시 보기";

  const $ = id => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem("tt." + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem("tt." + k, v); } catch (e) { } }
  };

  /* ---------------- 상태 ---------------- */
  let deck = null;            // { title, cards: [...] }
  let files = [];             // 저장할 File[] (표지 + 본문 + 마지막)
  const bust = new Image();
  bust.src = "goethe-bust.png";
  const bustReady = new Promise(r => { bust.onload = r; bust.onerror = r; });

  /* ---------------- 처음 ---------------- */
  // #k=… 로 열면 열쇠를 저장하고 주소에서 지운다 (화면 녹화·캡처에 안 남게)
  const hk = /[#&]k=([^&]+)/.exec(location.hash);
  if (hk) {
    store.set("key", decodeURIComponent(hk[1]));
    history.replaceState(null, "", location.pathname);
  }
  function showKey() { $("keyBox").hidden = !!store.get("key"); }
  showKey();
  $("keySave").onclick = () => {
    const v = $("key").value.trim();
    if (!v) return;
    store.set("key", v); $("key").value = ""; showKey();
    say("열쇠를 저장했어요.");
  };

  const last = +store.get("lastDay") || 0;
  $("day").value = last + 1;
  $("date").value = today();
  $("memo").value = store.get("memo") || "";
  $("outro").value = store.get("outro") || OUTRO_DEFAULT;
  $("memo").addEventListener("input", () => store.set("memo", $("memo").value));
  ["day", "date"].forEach(id => $(id).addEventListener("change", renderAll));
  $("outro").addEventListener("input", debounce(() => {
    store.set("outro", $("outro").value); renderAll();
  }, 400));

  function today() {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function say(msg, err) {
    $("status").textContent = msg || "";
    $("status").classList.toggle("err", !!err);
  }

  /* ---------------- 다듬기 ---------------- */
  $("polish").onclick = async () => {
    const memo = $("memo").value.trim();
    if (!memo) { say("메모를 먼저 붙여 넣어 주세요.", true); return; }
    const key = store.get("key");
    if (!key) { showKey(); say("열쇠를 먼저 넣어 주세요.", true); return; }
    busy(true); say("다듬는 중… 10~20초쯤 걸려요");
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: key, memo: memo })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(errText(r.status, j.error));
      deck = { title: j.title, cards: j.cards };
      say("다 됐어요. 이상한 문장은 카드 아래에서 바로 고치면 돼요.");
      await renderAll(true);
      $("result").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      say((e && e.message && e.message !== "Failed to fetch" ? e.message
        : "서버에 못 닿았어요.") + " '그대로 나누기'로도 만들 수 있어요.", true);
    } finally { busy(false); }
  };

  function errText(status, code) {
    if (code === "bad_key") { store.set("key", ""); showKey(); return "열쇠가 맞지 않아요."; }
    if (code === "no_api_key") return "서버에 Claude API 키가 아직 없어요.";
    if (code === "too_many") return "한 시간에 너무 많이 돌렸어요. 조금 뒤에 다시.";
    if (code === "too_long") return "글이 너무 길어요 (6000자까지).";
    return "다듬기에 실패했어요 (" + status + ").";
  }

  function busy(on) {
    $("polish").disabled = on; $("plain").disabled = on;
  }

  /* 서버 없이: 문장 단위로 끊어 두 문장씩. 맞춤법은 안 고친다 */
  $("plain").onclick = () => {
    const memo = $("memo").value.trim();
    if (!memo) { say("메모를 먼저 붙여 넣어 주세요.", true); return; }
    const lines = memo.split(/\n+/).map(s => s.trim()).filter(Boolean);
    let title = "";
    if (lines.length > 1 && lines[0].length <= 40) title = lines.shift();
    const sents = lines.join(" ").match(/[^.?!。]+[.?!。]*/g) || [];
    const cards = [];
    let cur = [];
    sents.map(s => s.trim()).filter(Boolean).forEach(s => {
      const joined = cur.concat(s).join(" ");
      if (cur.length && (cur.length >= 2 || joined.length > 70)) { cards.push(cur.join(" ")); cur = []; }
      cur.push(s);
    });
    if (cur.length) cards.push(cur.join(" "));
    if (!title) title = cards.length ? cards[0].slice(0, 30) : "";
    deck = { title: title, cards: cards.slice(0, 18) };
    say("문장만 나눴어요. 맞춤법은 그대로예요.");
    renderAll(true);
  };

  /* ---------------- 목록 ---------------- */
  const listEl = $("cards");

  function pages() {
    // 표지, 본문들, 마지막 장
    return [{ kind: "cover", text: deck.title }]
      .concat(deck.cards.map(t => ({ kind: "body", text: t })))
      .concat([{ kind: "outro", text: $("outro").value || OUTRO_DEFAULT }]);
  }

  /* 글 상자를 다시 만들지 않고 그림만 바꿔야 고치는 중에 커서가 안 튄다.
     카드 개수가 바뀔 때(rebuild)만 목록을 새로 만든다 */
  let gen = 0;               // 그리는 도중에 또 고치면 앞의 그리기는 버린다
  async function renderAll(rebuild) {
    if (!deck) return;
    const my = ++gen;
    $("result").hidden = false;
    const ps = pages();
    if (rebuild || listEl.children.length !== ps.length) buildList(ps);
    files = new Array(ps.length);
    await fontsFor(ps);
    for (let i = 0; i < ps.length; i++) {
      if (my !== gen) return;
      await renderOne(i, ps, my);
    }
    $("count").textContent = "카드 " + ps.length + "장";
    $("saveN").textContent = ps.length;
  }

  function buildList(ps) {
    listEl.innerHTML = "";
    ps.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "card";
      const img = document.createElement("img");
      img.alt = (i + 1) + "번째 카드";
      li.appendChild(img);
      if (p.kind !== "outro") {
        const ta = document.createElement("textarea");
        ta.rows = p.kind === "cover" ? 2 : 3;
        ta.value = p.text;
        ta.addEventListener("input", debounce(() => {
          if (p.kind === "cover") deck.title = ta.value; else deck.cards[i - 1] = ta.value;
          renderAll();
        }, 350));
        li.appendChild(ta);
      }
      const tools = document.createElement("div");
      tools.className = "card__tools";
      const label = document.createElement("span");
      label.textContent = p.kind === "cover" ? "표지" : p.kind === "outro" ? "마지막 장 (아래 '마지막 장 문구'에서 고침)" : (i + 1) + " / " + ps.length;
      tools.appendChild(label);
      if (p.kind === "body") {
        const box = document.createElement("div");
        box.appendChild(btn("아래에 추가", () => { deck.cards.splice(i, 0, ""); renderAll(true); }));
        box.appendChild(btn("빼기", () => {
          if (deck.cards.length <= 1) return;
          deck.cards.splice(i - 1, 1); renderAll(true);
        }));
        tools.appendChild(box);
      }
      li.appendChild(tools);
      listEl.appendChild(li);
    });
  }

  function btn(text, fn) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = text; b.onclick = fn;
    return b;
  }

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  async function renderOne(i, ps, my) {
    await bustReady;
    if (my !== gen) return;
    const info = { day: +$("day").value || 1, date: $("date").value, page: i + 1, total: ps.length };
    const p = ps[i];
    if (p.kind === "cover") drawCover(p.text, info);
    else if (p.kind === "outro") drawOutro(p.text, info);
    else drawBody(p.text, info);
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.92));
    if (my !== gen) return;
    const name = "to_twenties_day" + String(info.day).padStart(3, "0") + "_" + String(i + 1).padStart(2, "0") + ".jpg";
    files[i] = new File([blob], name, { type: "image/jpeg" });
    const img = listEl.children[i].querySelector("img");
    const old = img.src;
    img.src = URL.createObjectURL(blob);
    if (old && old.startsWith("blob:")) URL.revokeObjectURL(old);
  }

  /* 구글 폰트는 글자 범위별로 쪼개져 있어서, 그릴 글자가 든 조각을 미리 받아야
     캔버스에 기본 글꼴로 찍히지 않는다 */
  async function fontsFor(ps) {
    const text = ps.map(p => p.text).join("") + "DAY0123456789./@_to_twenties21세기괴테넘겨보기→";
    const plain = text.replace(/\*\*/g, "");
    try {
      await Promise.all([
        document.fonts.load("500 60px " + SERIF, plain),
        document.fonts.load("700 60px " + SERIF, plain),
        document.fonts.load("900 60px " + SERIF, plain),
        document.fonts.load("600 30px " + SANS, plain),
        document.fonts.load("700 30px " + SANS, plain)
      ]);
    } catch (e) { }
  }

  /* ---------------- 그리기 ---------------- */
  // 종이 질감. 매번 같은 무늬가 나오게 씨앗을 고정한다
  const grain = (() => {
    const g = document.createElement("canvas");
    g.width = W; g.height = H;
    const x = g.getContext("2d");
    let s = 20261021;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 26000; i++) {
      x.fillStyle = rnd() < 0.5 ? "rgba(90,70,40," + (0.025 + rnd() * 0.05) + ")"
        : "rgba(255,255,255," + (0.05 + rnd() * 0.08) + ")";
      x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    return g;
  })();

  function paper() {
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(grain, 0, 0);
  }

  // 괴테 상반신. 아래 가장자리에 붙여 몸이 카드 밖으로 이어지는 것처럼 둔다
  function goethe(h, x) {
    if (!bust.naturalWidth) return;
    const w = h * bust.naturalWidth / bust.naturalHeight;
    ctx.drawImage(bust, x, H - h, w, h);
  }

  function spaced(text, x, y, gap, align) {
    // 캔버스 letterSpacing 은 사파리 버전에 따라 없어서 한 글자씩 찍는다
    const ws = [...text].map(ch => ctx.measureText(ch).width);
    const total = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
    let cx = align === "right" ? x - total : x;
    ctx.textAlign = "left";
    [...text].forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += ws[i] + gap; });
  }

  function header(info, right) {
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.accent;
    ctx.font = "700 30px " + SANS;
    spaced("DAY " + String(info.day).padStart(3, "0"), 96, 132, 3);
    ctx.fillStyle = C.sub;
    ctx.font = "600 28px " + SANS;
    spaced(right, W - 96, 132, 2, "right");
  }

  function footer() {
    ctx.fillStyle = C.sub;
    ctx.font = "600 28px " + SANS;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(HANDLE, W - 96, H - 84);
  }

  function dotDate(v) { return (v || today()).replace(/-/g, "."); }

  /* **강조** 를 갈라 낱말 단위로 줄을 바꾼다. 한국어는 어절(띄어쓰기)에서 끊어야
     자연스럽다. 한 어절이 줄보다 길 때만 글자 단위로 자른다 */
  /* 어절 하나 안에서도 강조가 끝날 수 있다 ("**무엇인가**를"). 그래서 어절을
     조각(piece) 묶음으로 두고, 줄은 어절 사이에서만 바꾼다 */
  function layout(text, size, maxW, weights) {
    const lines = [];
    const font = hl => (hl ? weights[1] : weights[0]) + " " + size + "px " + SERIF;
    const measure = (t, hl) => { ctx.font = font(hl); return ctx.measureText(t).width; };
    const word = pieces => {
      pieces.forEach(p => { p.width = measure(p.t, p.hl); });
      return { pieces: pieces, width: pieces.reduce((a, p) => a + p.width, 0) };
    };
    curly(text).split("\n").forEach(par => {
      const tokens = [];
      let cur = [];
      par.split("**").forEach((seg, k) => {
        const hl = k % 2 === 1;
        seg.split(/(\s+)/).forEach(w => {
          if (!w) return;
          if (/^\s+$/.test(w)) {
            if (cur.length) { tokens.push(word(cur)); cur = []; }
            tokens.push({ space: true, hl: hl, width: measure(" ", hl) });
            return;
          }
          cur.push({ t: w, hl: hl });
        });
      });
      if (cur.length) tokens.push(word(cur));

      let line = [], lw = 0;
      const push = () => {
        while (line.length && line[line.length - 1].space) line.pop();
        lines.push(line); line = []; lw = 0;
      };
      tokens.forEach(t => {
        if (t.space) { if (line.length) { line.push(t); lw += t.width; } return; }
        if (lw + t.width > maxW && line.length) push();
        if (t.width > maxW) {           // 줄보다 긴 어절은 글자 단위로 자른다
          let buf = [];
          t.pieces.forEach(p => [...p.t].forEach(ch => {
            const next = buf.concat({ t: ch, hl: p.hl });
            if (word(next.map(x => ({ t: x.t, hl: x.hl }))).width > maxW && buf.length) {
              line.push(word(buf)); push(); buf = [];
            }
            buf.push({ t: ch, hl: p.hl });
          }));
          t = word(buf);
        }
        line.push(t); lw += t.width;
      });
      push();
    });
    return lines;
  }

  // 곧은 따옴표를 둥근 따옴표로. 카드에서 "…" 는 타자기 글씨처럼 보인다
  function curly(s) {
    return String(s).replace(/"([^"\n]*)"/g, "“$1”").replace(/'([^'\n]*)'/g, "‘$1’");
  }

  function fit(text, sizes, maxW, maxH, lh, weights, maxLines) {
    for (const s of sizes) {
      const lines = layout(text, s, maxW, weights);
      if (lines.length * s * lh <= maxH && lines.length <= maxLines) return { size: s, lines: lines };
    }
    const s = sizes[sizes.length - 1];
    return { size: s, lines: layout(text, s, maxW, weights) };
  }

  function drawLines(f, x, top, lh, weights, color) {
    const step = f.size * lh;
    f.lines.forEach((line, i) => {
      const base = top + i * step + step / 2 + f.size * 0.36;
      // 줄을 조각 단위로 편다: [{t, hl, width, space}]
      const flat = [];
      line.forEach(t => {
        if (t.space) flat.push(t); else t.pieces.forEach(p => flat.push(p));
      });
      // 형광펜을 먼저 깔고 글자를 올린다. 이어진 강조 조각은 띠도 하나로
      let cx = x, from = -1;
      const pad = 4;
      flat.forEach((p, k) => {
        if (p.hl && from < 0) from = cx;
        const ends = from >= 0 && (!flat[k + 1] || !flat[k + 1].hl);
        cx += p.width;
        if (ends) {
          ctx.fillStyle = C.mark;
          ctx.fillRect(from - pad, base - f.size * 0.36, cx - from + pad * 2, f.size * 0.46);
          from = -1;
        }
      });
      cx = x;
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      flat.forEach(p => {
        if (!p.space) {
          ctx.font = (p.hl ? weights[1] : weights[0]) + " " + f.size + "px " + SERIF;
          ctx.fillText(p.t, cx, base);
        }
        cx += p.width;
      });
    });
    return f.lines.length * step;
  }

  function drawCover(title, info) {
    paper();
    header(info, dotDate(info.date));
    const weights = ["900", "900"];
    const f = fit(title || " ", [104, 96, 88, 80, 72, 64], W - 192, 520, 1.34, weights, 5);
    const used = drawLines(f, 96, 250, 1.34, weights, C.ink);
    const y = 250 + used + 44;
    ctx.fillStyle = C.accent;
    ctx.fillRect(96, y, 72, 6);
    ctx.fillStyle = C.sub;
    ctx.font = "600 32px " + SANS;
    ctx.textAlign = "left";
    ctx.fillText("21세기 괴테", 96, y + 64);
    // 제목이 길어지면 괴테를 줄여서라도 겹치지 않게 한다
    goethe(Math.max(400, Math.min(640, H - (y + 110))), 40);
    ctx.fillStyle = C.accent;
    ctx.font = "700 30px " + SANS;
    ctx.textAlign = "right";
    ctx.fillText("넘겨 보기 →", W - 96, H - 84);
  }

  function drawBody(text, info) {
    paper();
    header(info, info.page + " / " + info.total);
    const weights = ["500", "700"];
    const top = 220, bottom = 1000;
    const f = fit(text || " ", [64, 60, 56, 52, 48, 44], W - 192, bottom - top, 1.66, weights, 9);
    const h = f.lines.length * f.size * 1.66;
    // 짧은 글은 가운데보다 살짝 위에 둔다. 아래쪽엔 괴테가 있어 눈이 그쪽으로 쏠린다
    const y = top + Math.max(0, (bottom - top - h) * 0.42);
    drawLines(f, 96, y, 1.66, weights, C.ink);
    goethe(400, 52);
    footer();
  }

  function drawOutro(text, info) {
    paper();
    header(info, info.page + " / " + info.total);
    const weights = ["700", "900"];
    const f = fit(text, [76, 68, 60], W - 192, 460, 1.5, weights, 5);
    drawLines(f, 96, 330, 1.5, weights, C.ink);
    const y = 330 + f.lines.length * f.size * 1.5 + 50;
    ctx.fillStyle = C.accent;
    ctx.fillRect(96, y, 72, 6);
    ctx.fillStyle = C.sub;
    ctx.font = "600 32px " + SANS;
    ctx.textAlign = "left";
    ctx.fillText("21세기 괴테 · 매일 한 편", 96, y + 64);
    goethe(400, 52);
    footer();
  }

  /* ---------------- 저장 ----------------
     아이폰은 공유 창으로 여러 장을 한 번에 사진 앱에 넣을 수 있다.
     share() 는 누른 직후에 불러야 하므로(사파리가 터치 직후만 허락) 파일은
     미리 만들어 둔 것을 쓴다 — 여기서 그리기 시작하면 허락이 풀린다 */
  $("saveAll").onclick = async () => {
    if (!files.length || files.some(f => !f)) { say("아직 그리는 중이에요. 잠깐만요.", true); return; }
    store.set("lastDay", String(+$("day").value || 1));
    if (navigator.canShare && navigator.canShare({ files: files })) {
      try { await navigator.share({ files: files }); }
      catch (e) { if (e && e.name !== "AbortError") say("공유 창을 못 열었어요: " + e.message, true); }
      return;
    }
    // 컴퓨터: 한 장씩 내려받는다
    for (const f of files) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(f); a.download = f.name;
      document.body.appendChild(a); a.click(); a.remove();
      await new Promise(r => setTimeout(r, 250));
    }
  };

  function debounce(fn, ms) {
    let t = 0;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }
})();
