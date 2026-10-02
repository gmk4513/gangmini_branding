(function () {
  "use strict";

  var cats  = (typeof CATS  !== "undefined" ? CATS  : []);
  var notes = (typeof NOTES !== "undefined" ? NOTES : []).slice();

  // 최신이 위로.
  notes.sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date));
  });

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fmtDate(s) {
    var p = String(s || "").split("-");
    return p.length === 3 ? p[0] + "." + p[1] + "." + p[2] : s || "";
  }

  function catLabel(id) {
    for (var i = 0; i < cats.length; i++) if (cats[i].id === id) return cats[i].label;
    return id;
  }

  /* ---------- 필터 상태 ----------
     카테고리와 태그를 각각 하나씩만 고를 수 있게 한다.
     여러 개를 동시에 켜면 "무엇을 보고 있는지"가 금방 흐려진다. */
  var sel = { cat: null, tag: null };

  function matches(n) {
    if (sel.cat && n.cat !== sel.cat) return false;
    if (sel.tag && (n.tags || []).indexOf(sel.tag) < 0) return false;
    return true;
  }

  /* ---------- 칩 ---------- */

  function chip(label, cls, isOn, onClick) {
    var b = el("button", "chip" + (cls ? " " + cls : ""), label);
    b.type = "button";
    b.setAttribute("aria-pressed", isOn ? "true" : "false");
    b.addEventListener("click", onClick);
    return b;
  }

  function buildFilters() {
    var wrap = document.getElementById("filters");
    if (!wrap) return;
    wrap.textContent = "";

    // 카테고리 줄
    var rowC = el("div", "filters__row");
    rowC.appendChild(chip("전체", "chip--cat", !sel.cat && !sel.tag, function () {
      sel.cat = null; sel.tag = null; draw();
    }));
    cats.forEach(function (c) {
      // 글이 하나도 없는 카테고리는 숨긴다. 빈 칩을 누르게 두지 않는다.
      var has = notes.some(function (n) { return n.cat === c.id; });
      if (!has) return;
      rowC.appendChild(chip(c.label, "chip--cat", sel.cat === c.id, function () {
        sel.cat = (sel.cat === c.id) ? null : c.id;
        draw();
      }));
    });
    wrap.appendChild(rowC);

    // 태그 줄. 지금 보이는 글들에 실제로 달린 태그만 보여준다.
    var pool = notes.filter(function (n) { return !sel.cat || n.cat === sel.cat; });
    var tags = [];
    pool.forEach(function (n) {
      (n.tags || []).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); });
    });
    tags.sort(function (a, b) { return a.localeCompare(b, "ko"); });

    if (tags.length) {
      var rowT = el("div", "filters__row");
      tags.forEach(function (t) {
        rowT.appendChild(chip(t, "", sel.tag === t, function () {
          sel.tag = (sel.tag === t) ? null : t;
          draw();
        }));
      });
      wrap.appendChild(rowT);
    }
  }

  /* ---------- 카드 ---------- */

  function buildNote(n) {
    var a = el("a", "note");
    a.href = "/notes/" + n.slug + "/";

    var head = el("div", "note__head");
    head.appendChild(el("h4", "note__title", n.title || "제목 없음"));
    head.appendChild(el("time", "note__date", fmtDate(n.date)));
    a.appendChild(head);

    if (n.desc) a.appendChild(el("p", "note__desc", n.desc));

    var foot = el("div", "note__foot");
    if (n.mine) foot.appendChild(el("span", "badge-mine", "내 프로젝트"));
    if (n.cat) foot.appendChild(el("span", "tag", catLabel(n.cat)));
    (n.tags || []).forEach(function (t) { foot.appendChild(el("span", "tag", t)); });
    a.appendChild(foot);

    return a;
  }

  /* ---------- 그리기 ---------- */

  function draw() {
    buildFilters();

    var list = notes.filter(matches);

    var count = document.getElementById("count");
    if (count) {
      count.textContent = (sel.cat || sel.tag)
        ? list.length + "개 보이는 중 · 전체 " + notes.length + "개"
        : "지금까지 " + notes.length + "개 · 카테고리와 태그로 걸러 보세요";
    }

    var mount = document.getElementById("list");
    if (!mount) return;
    mount.textContent = "";

    if (!list.length) {
      mount.appendChild(el("p", "empty", "아직 여기엔 적어둔 게 없습니다."));
      return;
    }
    list.forEach(function (n) { mount.appendChild(buildNote(n)); });
  }

  draw();

  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();
