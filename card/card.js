/* 카드 만들기 — @to__twenties (21세기 괴테) 카드뉴스

   메모 붙여넣기 → 서버(bamti-bomb)가 Claude 로 다듬고 나눔 → 여기서 1080×1440 으로 그림
   → 공유 창으로 사진 앱에 한꺼번에 저장 → 인스타에서 여러 장 골라 게시.

   카드 디자인은 전부 이 파일의 draw* 함수 안에 있다. 고정 요소(배경·괴테·번호·계정)는
   손으로 배치하지 않으므로 매일 똑같이 나온다.
   비율이 3:4 인 건 인스타 프로필 격자가 3:4 로 잘라 보여 주기 때문이다. */
(function () {
  "use strict";

  const API = "https://bamti-bomb.fly.dev/api/card/polish";
  const LOG = "https://bamti-bomb.fly.dev/api/card/log";   // 만든 기록 (Claude API 안 부름)
  const W = 1080, H = 1440;
  const C = {
    paper: "#F3EEE4", ink: "#26221E", sub: "#8C8478", faint: "#B8AE9F",
    accent: "#C8553D", mark: "rgba(200, 85, 61, 0.24)"
  };
  const SERIF = '"Noto Serif KR", serif';
  const SANS = '"Pretendard", system-ui, sans-serif';
  const HANDLE = "@to__twenties";
  const OUTRO_DEFAULT = "저장해 두고\n흔들릴 때 다시 보기";

  const $ = id => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem("tt." + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem("tt." + k, v); } catch (e) { } }
  };

  /* ---------------- 상태 ---------------- */
  let deck = null;            // { title, cards: [...], memo }  memo 는 만들 때 붙여 넣은 원문
  let curId = null;           // 지금 보고 있는 기록의 id. 고치면 이 기록에 덮어쓴다
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
    loadList();
  };

  // DAY 번호는 뺐다 (2026-10-22). 매일 올릴지 정해지지 않아서, 빠진 날이 숫자로 드러나지 않게
  $("date").value = today();
  $("memo").value = store.get("memo") || "";
  $("outro").value = store.get("outro") || OUTRO_DEFAULT;
  $("memo").addEventListener("input", () => store.set("memo", $("memo").value));
  $("date").addEventListener("change", () => renderAll());
  $("outro").addEventListener("input", debounce(() => {
    store.set("outro", $("outro").value); renderAll();
  }, 400));

  function today() {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  // 저장 파일 이름용 20261022
  function stamp() { return ($("date").value || today()).replace(/-/g, ""); }

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
      deck = { title: j.title, cards: j.cards, memo: memo };
      curId = newId();
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
    deck = { title: title, cards: cards.slice(0, 18), memo: memo };
    curId = newId();
    say("문장만 나눴어요. 맞춤법은 그대로예요.");
    renderAll(true);
  };

  /* ---------------- 지난 기록 ----------------
     만든 카드는 서버(bamti-bomb 볼륨)에 남긴다. 폰·컴퓨터 어디서 열어도 같은 목록이 보인다.
     넣고 꺼내기만 하므로 Claude API 요금은 안 나간다. 다듬기 버튼을 누를 때만 나간다 */
  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  async function logCall(body) {
    const key = store.get("key");
    if (!key) throw new Error("no_key");
    const r = await fetch(LOG, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign({ key: key }, body))
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || String(r.status));
    return j;
  }

  let known = new Set();     // 목록에 이미 있는 id. 새 기록이 저장되면 목록을 다시 받는다
  async function saveNow() {
    if (!deck || !curId) return;
    const id = curId;
    try {
      await logCall({ op: "put", item: {
        id: id, date: $("date").value, title: deck.title, cards: deck.cards,
        memo: deck.memo || "", outro: $("outro").value
      } });
      $("logStatus").textContent = "";
      if (!known.has(id)) loadList();
    } catch (e) {
      $("logStatus").textContent = "기록을 저장하지 못했어요. 인터넷이 되면 글을 조금 고쳐 다시 저장해 주세요.";
    }
  }
  const saveSoon = debounce(saveNow, 1200);

  async function loadList() {
    if (!store.get("key")) return;
    let items;
    try { items = (await logCall({ op: "list" })).items || []; }
    catch (e) { $("logStatus").textContent = "기록을 불러오지 못했어요."; return; }
    known = new Set(items.map(x => x.id));
    $("logBox").hidden = false;
    $("logStatus").textContent = items.length ? "" : "아직 기록이 없어요. 카드를 만들면 여기 남아요.";
    const ul = $("logList");
    ul.innerHTML = "";
    items.forEach(x => {
      const li = document.createElement("li");
      if (x.id === curId) li.className = "on";
      const open = document.createElement("button");
      open.type = "button"; open.className = "log__open";
      const t = document.createElement("b");
      t.textContent = (x.title || "(제목 없음)").replace(/\*\*/g, "");
      const m = document.createElement("span");
      m.textContent = (x.date ? x.date.replace(/-/g, ".") : "") + " · 카드 " + (x.n + 2) + "장" + (x.head ? " · " + x.head : "");
      open.appendChild(t); open.appendChild(m);
      open.onclick = () => openLog(x.id);
      const del = btn("지우기", async () => {
        if (!confirm("“" + t.textContent + "” 기록을 지울까요? 되돌릴 수 없어요.")) return;
        try {
          await logCall({ op: "del", id: x.id });
          if (curId === x.id) curId = null;
          loadList();
        } catch (e) { $("logStatus").textContent = "지우지 못했어요."; }
      });
      del.className = "log__del";
      li.appendChild(open); li.appendChild(del);
      ul.appendChild(li);
    });
  }

  async function openLog(id) {
    $("logStatus").textContent = "불러오는 중…";
    let it;
    try { it = (await logCall({ op: "get", id: id })).item; }
    catch (e) { $("logStatus").textContent = "불러오지 못했어요."; return; }
    $("logStatus").textContent = "";
    curId = it.id;
    deck = { title: it.title, cards: it.cards.length ? it.cards : [""], memo: it.memo };
    if (it.date) $("date").value = it.date;
    $("outro").value = it.outro || OUTRO_DEFAULT;
    $("memo").value = it.memo || "";
    say("지난 기록을 불러왔어요. 고치면 이 기록에 그대로 저장돼요.");
    [...$("logList").children].forEach(li => li.classList.remove("on"));
    await renderAll(true, true);
    loadList();
    $("result").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  loadList();

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
  async function renderAll(rebuild, noSave) {
    if (!deck) return;
    const my = ++gen;
    if (!noSave) saveSoon();   // 지난 기록을 열기만 한 건 저장할 게 없다
    $("result").hidden = false;
    $("reel").hidden = false;
    // 글이 바뀌면 만들어 둔 영상은 옛 글이다. 다시 만들게 한다
    if (reelFile) {
      reelFile = null;
      $("reelSave").hidden = true; $("reelVideo").hidden = true;
      $("reelStatus").textContent = "글이 바뀌었어요. 영상을 다시 만들어 주세요.";
    }
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
    const info = { date: $("date").value, page: i + 1, total: ps.length };
    const p = ps[i];
    if (p.kind === "cover") drawCover(p.text, info);
    else if (p.kind === "outro") drawOutro(p.text, info);
    else drawBody(p.text, info);
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.92));
    if (my !== gen) return;
    const name = "to_twenties_" + stamp() + "_" + String(i + 1).padStart(2, "0") + ".jpg";
    files[i] = new File([blob], name, { type: "image/jpeg" });
    const img = listEl.children[i].querySelector("img");
    const old = img.src;
    img.src = URL.createObjectURL(blob);
    if (old && old.startsWith("blob:")) URL.revokeObjectURL(old);
  }

  /* 구글 폰트는 글자 범위별로 쪼개져 있어서, 그릴 글자가 든 조각을 미리 받아야
     캔버스에 기본 글꼴로 찍히지 않는다 */
  async function fontsFor(ps) {
    const text = ps.map(p => p.text).join("") + "0123456789./@_to_twenties21세기괴테넘겨보기→팔로우하고다음글도같이";
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
    spaced("21세기 괴테", 96, 132, 2);
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
    ctx.fillText(HANDLE, 96, y + 64);
    // 제목이 길어지면 괴테를 줄여서라도 겹치지 않게 한다
    goethe(Math.max(400, Math.min(640, H - (y + 110))), 40);
    if (info.reel) return;               // 릴스에선 "넘겨 보기"가 옆으로 밀라는 말이 된다
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
    ctx.fillText("팔로우하고 다음 글도 같이 보기", 96, y + 64);
    goethe(400, 52);
    footer();
  }

  /* ---------------- 저장 ----------------
     아이폰은 공유 창으로 여러 장을 한 번에 사진 앱에 넣을 수 있다.
     share() 는 누른 직후에 불러야 하므로(사파리가 터치 직후만 허락) 파일은
     미리 만들어 둔 것을 쓴다 — 여기서 그리기 시작하면 허락이 풀린다 */
  $("saveAll").onclick = async () => {
    if (!files.length || files.some(f => !f)) { say("아직 그리는 중이에요. 잠깐만요.", true); return; }
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

  /* ---------------- 릴스 영상 ----------------
     카드를 제자리에서 한 장씩 바꿔 보여 주는 1080×1920 MP4. 소리는 넣지 않는다 —
     음악은 인스타 앱에서 고르는 게 저작권 걱정이 없다.

     실시간 녹화(MediaRecorder)는 영상 길이만큼 기다려야 하고 프레임이 튄다.
     그래서 프레임을 하나씩 그려 WebCodecs 로 H.264 인코딩하고 mp4-muxer 로 MP4 에 담는다.
     (아이폰 사파리 16.4+ 지원.) 안 되는 브라우저만 실시간 녹화로 내려간다 */
  const RW = 1080, RH = 1920, FPS = 30;
  const CS = 0.86;                       // 영상 속 카드 크기
  const CW = Math.round(W * CS), CH = Math.round(H * CS);
  const CX = Math.round((RW - CW) / 2), CY = 250;  // 위아래는 릴스 화면 글씨·버튼이 덮는 자리라 비운다
  const SLIDE = 0.6;                     // 바뀌는 데 걸리는 초 (사라짐 반, 나타남 반)
  let reelFile = null;

  // 한 장에 머무는 초. 글이 길수록 오래. 한국어는 화면에서 초당 열몇 자쯤 읽힌다
  function holdFor(p, speed) {
    let s;
    if (p.kind === "cover") s = 2.6;
    else if (p.kind === "outro") s = 2.4;
    else s = Math.min(6.5, Math.max(2.8, 1.6 + p.text.replace(/\*\*/g, "").length * 0.06));
    return s * speed;
  }

  // 카드마다 따로 떠 둔다. 영상에서는 이 그림을 바꿔 끼우기만 한다
  async function snapshots(ps) {
    await fontsFor(ps); await bustReady;
    const info0 = { date: $("date").value, total: ps.length, reel: true };
    const snap = () => {
      const c = document.createElement("canvas");
      c.width = CW; c.height = CH;
      c.getContext("2d").drawImage(canvas, 0, 0, CW, CH);
      return c;
    };
    paper();
    const blank = snap();                // 바뀌는 동안 밑에 깔리는 빈 종이
    const shots = ps.map((p, i) => {
      const info = Object.assign({ page: i + 1 }, info0);
      if (p.kind === "cover") drawCover(p.text, info);
      else if (p.kind === "outro") drawOutro(p.text, info);
      else drawBody(p.text, info);
      return snap();
    });
    shots.blank = blank;
    return shots;
  }

  function timeline(ps, speed) {
    const t = [];
    let at = 0;
    ps.forEach((p, i) => {
      const hold = holdFor(p, speed);
      t.push({ i: i, from: at, hold: hold });
      at += hold + (i < ps.length - 1 ? SLIDE : 0);
    });
    return { segs: t, total: at };
  }

  const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

  function drawFrame(rctx, shots, tl, sec) {
    rctx.fillStyle = "#E8E1D4";
    rctx.fillRect(0, 0, RW, RH);
    rctx.drawImage(grain, 0, 0, RW, RH);
    // 지금 몇 번째 장이고, 넘어가는 중이면 얼마나 넘어갔나
    let cur = 0, prog = 0;
    for (const s of tl.segs) {
      if (sec >= s.from) {
        cur = s.i;
        const into = sec - s.from - s.hold;
        prog = into > 0 && s.i < shots.length - 1 ? ease(Math.min(1, into / SLIDE)) : 0;
      }
    }
    // 옆으로 밀면 손으로 넘기는 캐러셀처럼 보여서, 사람들이 옆으로 밀다가 릴스를 나가 버린다.
    // 그래서 종이는 제자리에 두고 글만 바꾼다: 앞 장 글이 먼저 사라지고, 다음 장 글이 살짝 올라오며 나타난다.
    // 두 장을 겹쳐 흐리면 글자 두 벌이 겹쳐 보여서 차례로 한다
    rctx.save();
    rctx.shadowColor = "rgba(38, 34, 30, 0.16)";
    rctx.shadowBlur = 44; rctx.shadowOffsetY = 14;
    rctx.drawImage(prog > 0 ? shots.blank : shots[cur], CX, CY);
    rctx.restore();
    if (prog > 0) {
      const out = prog < 0.5, a = out ? 1 - prog * 2 : prog * 2 - 1;
      const img = out ? shots[cur] : shots[cur + 1];
      rctx.save();
      rctx.beginPath(); rctx.rect(CX, CY, CW, CH); rctx.clip();   // 올라오는 동안 종이 밖으로 삐져나오지 않게
      rctx.globalAlpha = a;
      rctx.drawImage(img, CX, CY + (out ? 0 : (1 - a) * 28));
      rctx.restore();
    }
    // 점 대신 혼자 차오르는 막대. "알아서 넘어가는 영상"으로 읽힌다
    const y = CY + CH + 60, r = 3;
    const bar = (w, color) => {
      rctx.beginPath();
      if (rctx.roundRect) rctx.roundRect(CX, y, w, r * 2, r); else rctx.rect(CX, y, w, r * 2);
      rctx.fillStyle = color;
      rctx.fill();
    };
    bar(CW, "rgba(38, 34, 30, 0.12)");
    bar(Math.max(r * 2, CW * Math.min(1, sec / tl.total)), C.accent);
  }

  function loadMuxer() {
    if (window.Mp4Muxer) return Promise.resolve();
    return new Promise((ok, bad) => {
      const s = document.createElement("script");
      s.src = "vendor/mp4-muxer-5.2.2.js";
      s.onload = ok; s.onerror = () => bad(new Error("muxer"));
      document.head.appendChild(s);
    });
  }

  async function pickCodec() {
    if (!window.VideoEncoder) return null;
    // High → Main → Baseline. 1080×1920 은 레벨 4.0 이 필요하다
    for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42e028"]) {
      const cfg = { codec: codec, width: RW, height: RH, bitrate: 8e6, framerate: FPS, avc: { format: "avc" } };
      try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch (e) { }
    }
    return null;
  }

  async function encodeMp4(shots, tl, cfg, onProg) {
    await loadMuxer();
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: "avc", width: RW, height: RH, frameRate: FPS },
      fastStart: "in-memory"
    });
    let fail = null;
    const enc = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: e => { fail = e; }
    });
    enc.configure(cfg);
    const rc = document.createElement("canvas");
    rc.width = RW; rc.height = RH;
    const rctx = rc.getContext("2d");
    const frames = Math.ceil(tl.total * FPS);
    for (let f = 0; f < frames; f++) {
      if (fail) throw fail;
      drawFrame(rctx, shots, tl, f / FPS);
      const vf = new VideoFrame(rc, { timestamp: Math.round(f * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame: f % (FPS * 2) === 0 });
      vf.close();
      // 인코더가 밀리면 잠깐 기다린다. 안 그러면 프레임이 메모리에 쌓여 폰이 버벅인다
      while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
      if (f % 15 === 0) { onProg(f / frames); await new Promise(r => setTimeout(r, 0)); }
    }
    await enc.flush();
    if (fail) throw fail;
    enc.close();
    muxer.finalize();
    return new Blob([muxer.target.buffer], { type: "video/mp4" });
  }

  // 대비책: 실시간 녹화. 영상 길이만큼 걸린다
  async function recordRealtime(shots, tl, onProg) {
    const rc = document.createElement("canvas");
    rc.width = RW; rc.height = RH;
    const rctx = rc.getContext("2d");
    const type = ["video/mp4", "video/webm;codecs=vp9", "video/webm"].find(t => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(rc.captureStream(FPS), { mimeType: type, videoBitsPerSecond: 8e6 });
    const parts = [];
    rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
    drawFrame(rctx, shots, tl, 0);
    rec.start(500);
    const t0 = performance.now();
    await new Promise(done => {
      const tick = () => {
        const sec = (performance.now() - t0) / 1000;
        drawFrame(rctx, shots, tl, Math.min(sec, tl.total));
        onProg(sec / tl.total);
        if (sec < tl.total) requestAnimationFrame(tick); else done();
      };
      requestAnimationFrame(tick);
    });
    await new Promise(r => { rec.onstop = r; rec.stop(); });
    return new Blob(parts, { type: type.split(";")[0] });
  }

  $("reelMake").onclick = async () => {
    if (!deck) return;
    const speed = +$("reelSpeed").value || 1;
    $("reelMake").disabled = true; $("reelSave").hidden = true;
    const msg = t => { $("reelStatus").textContent = t; };
    try {
      const ps = pages();
      const shots = await snapshots(ps);
      const tl = timeline(ps, speed);
      const cfg = await pickCodec();
      let blob;
      if (cfg) {
        blob = await encodeMp4(shots, tl, cfg, p => msg("영상 만드는 중… " + Math.round(p * 100) + "%"));
      } else {
        msg("이 브라우저는 빠른 인코딩이 안 돼서 실시간으로 녹화해요 (" + Math.round(tl.total) + "초)");
        blob = await recordRealtime(shots, tl, p => msg("녹화 중… " + Math.min(100, Math.round(p * 100)) + "%"));
      }
      const ext = blob.type === "video/mp4" ? "mp4" : "webm";
      reelFile = new File([blob], "to_twenties_" + stamp() + "_reel." + ext, { type: blob.type });
      const v = $("reelVideo");
      if (v.src.startsWith("blob:")) URL.revokeObjectURL(v.src);
      v.src = URL.createObjectURL(blob);
      v.hidden = false;
      $("reelSave").hidden = false;
      msg(Math.round(tl.total) + "초 · " + (blob.size / 1048576).toFixed(1) + "MB" + (ext === "mp4" ? "" : " · webm 이라 인스타에 바로 안 올라갈 수 있어요"));
    } catch (e) {
      msg("영상을 못 만들었어요: " + (e && e.message || e));
    } finally { $("reelMake").disabled = false; }
  };

  // 만들어 둔 파일을 누른 즉시 넘긴다 (사파리는 터치 직후에만 공유 창을 허락)
  $("reelSave").onclick = async () => {
    if (!reelFile) return;
    if (navigator.canShare && navigator.canShare({ files: [reelFile] })) {
      try { await navigator.share({ files: [reelFile] }); }
      catch (e) { if (e && e.name !== "AbortError") $("reelStatus").textContent = "공유 창을 못 열었어요: " + e.message; }
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(reelFile); a.download = reelFile.name;
    document.body.appendChild(a); a.click(); a.remove();
  };

  function debounce(fn, ms) {
    let t = 0;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }
})();
