/* 이론/용어 목록 — 주제별 목차.
   기록(/notes/)은 날짜순 카드(notes-app.js)지만, 여기는 "다시 찾아보는" 글이라
   큰 주제 → 소주제 → 읽는 순서로 묶는다. 칩은 주제 몇 개만 두고, 세부 키워드는 검색창이 맡는다.
   데이터는 learn.js 의 TOPICS · CATS · NOTES. */
(function () {
  "use strict";

  var topics = (typeof TOPICS !== "undefined" ? TOPICS : []);
  var cats   = (typeof CATS   !== "undefined" ? CATS   : []);
  var notes  = (typeof NOTES  !== "undefined" ? NOTES  : []).slice();
  var base   = (typeof NOTE_BASE !== "undefined" ? NOTE_BASE : "/learn/");

  // 주제에 안 맞는 글이 생기면 맨 아래에 모은다
  var OTHER = { id: "_other", label: "그 밖의 글", note: "", groups: [] };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function catLabel(id) {
    for (var i = 0; i < cats.length; i++) if (cats[i].id === id) return cats[i].label;
    return "";
  }
  function topicOf(n) {
    for (var i = 0; i < topics.length; i++) if (topics[i].id === n.topic) return topics[i];
    return OTHER;
  }

  /* ---------- 상태: 주제 하나 + 검색어. 주소 #team 처럼 주제를 바로 열 수 있다 ---------- */
  var sel = { topic: null, q: "" };
  var h = decodeURIComponent((location.hash || "").slice(1));
  if (topics.some(function (t) { return t.id === h; })) sel.topic = h;

  function hit(n) {
    if (sel.topic && topicOf(n).id !== sel.topic) return false;
    if (!sel.q) return true;
    var hay = [n.title, n.desc, (n.tags || []).join(" "), catLabel(n.cat)].join(" ").toLowerCase();
    // 띄어쓴 낱말이 모두 들어 있으면 맞는 것으로
    return sel.q.toLowerCase().split(/\s+/).every(function (w) { return !w || hay.indexOf(w) >= 0; });
  }

  /* ---------- 위: 주제 칩 + 검색창 ---------- */
  function chip(label, isOn, onClick) {
    var b = el("button", "chip chip--cat", label);
    b.type = "button";
    b.setAttribute("aria-pressed", isOn ? "true" : "false");
    b.addEventListener("click", onClick);
    return b;
  }

  function buildFilters() {
    var wrap = document.getElementById("filters");
    if (!wrap) return;
    wrap.textContent = "";
    var row = el("div", "filters__row");
    row.appendChild(chip("전체", !sel.topic, function () { setTopic(null); }));
    topics.forEach(function (t) {
      if (!notes.some(function (n) { return n.topic === t.id; })) return;
      row.appendChild(chip(t.label, sel.topic === t.id, function () {
        setTopic(sel.topic === t.id ? null : t.id);
      }));
    });
    wrap.appendChild(row);
  }

  function setTopic(id) {
    sel.topic = id;
    try { history.replaceState(null, "", id ? "#" + id : location.pathname); } catch (e) { }
    draw();
  }

  /* ---------- 목차 ---------- */
  function buildRow(n) {
    var a = el("a", "row");
    a.href = base + n.slug + "/";
    a.appendChild(el("span", "row__no", n.order != null ? String(n.order).padStart(2, "0") : "·"));
    a.appendChild(el("span", "row__title", n.title || "제목 없음"));
    a.appendChild(el("span", "row__kind", catLabel(n.cat)));
    if (n.desc) a.appendChild(el("p", "row__desc", n.desc));
    return a;
  }

  function byOrder(a, b) {
    var x = a.order != null ? a.order : 999, y = b.order != null ? b.order : 999;
    return x - y || String(b.date).localeCompare(String(a.date));
  }

  function buildTopic(t, list) {
    var sec = el("section", "topic");
    sec.id = "t-" + t.id;
    var head = el("div", "topic__head");
    head.appendChild(el("h3", "topic__title", t.label));
    head.appendChild(el("span", "topic__count", list.length + "편"));
    sec.appendChild(head);
    if (t.note) sec.appendChild(el("p", "topic__note", t.note));

    var groups = (t.groups || []).slice();
    var rest = list.filter(function (n) { return !groups.some(function (g) { return g.id === n.group; }); });
    if (rest.length) groups.push({ id: "_rest", label: groups.length ? "그 밖에" : "" });

    groups.forEach(function (g) {
      var items = g.id === "_rest" ? rest : list.filter(function (n) { return n.group === g.id; });
      if (!items.length) return;
      if (g.label) sec.appendChild(el("h4", "group__head", g.label));
      var rows = el("div", "rows");
      items.sort(byOrder).forEach(function (n) { rows.appendChild(buildRow(n)); });
      sec.appendChild(rows);
    });
    return sec;
  }

  function draw() {
    buildFilters();
    var shown = notes.filter(hit);

    var count = document.getElementById("count");
    if (count) {
      count.textContent = (sel.topic || sel.q)
        ? shown.length + "편 보이는 중 · 전체 " + notes.length + "편"
        : "지금까지 " + notes.length + "편 · 주제를 고르거나 검색해 보세요";
    }

    var mount = document.getElementById("list");
    if (!mount) return;
    mount.textContent = "";
    if (!shown.length) { mount.appendChild(el("p", "empty", "맞는 글이 없어요.")); return; }

    topics.concat([OTHER]).forEach(function (t) {
      var list = shown.filter(function (n) { return topicOf(n).id === t.id; });
      if (list.length) mount.appendChild(buildTopic(t, list));
    });
  }

  var input = document.getElementById("q");
  if (input) input.addEventListener("input", function () { sel.q = input.value.trim(); draw(); });

  draw();

  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();
