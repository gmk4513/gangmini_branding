(function () {
  "use strict";

  var projects = (typeof PROJECTS !== "undefined" ? PROJECTS : []).slice();

  // 최신이 위로. 번호(no)가 있으면 번호 기준, 같거나 없으면 날짜 기준.
  projects.sort(function (a, b) {
    var d = (b.no || 0) - (a.no || 0);
    return d !== 0 ? d : String(b.date).localeCompare(String(a.date));
  });

  function fmtDate(s) {
    if (!s) return "";
    var p = String(s).split("-");
    return p.length === 3 ? p[0] + "." + p[1] + "." + p[2] : s;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function isExternal(href) {
    return /^https?:\/\//i.test(href || "");
  }

  function buildCard(item) {
    var a = el("a", "card");
    a.href = item.href || "#";
    if (isExternal(item.href)) {
      a.target = "_blank";
      a.rel = "noopener";
    }

    // 표지
    var fig = el("div", "card__cover");
    if (item.cover) {
      var img = el("img");
      img.src = item.cover;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      // 이미지가 아직 없으면 조용히 빈 표지로 대체
      img.addEventListener("error", function () {
        fig.classList.add("is-blank");
        img.remove();
      });
      fig.appendChild(img);
    } else {
      fig.classList.add("is-blank");
    }
    if (item.no != null) {
      fig.appendChild(el("span", "stamp", "#" + item.no));
    }
    a.appendChild(fig);

    // 본문
    var body = el("div", "card__body");
    var head = el("div", "card__head");
    head.appendChild(el("h4", "card__title", item.title || "제목 없음"));
    head.appendChild(el("time", "card__date", fmtDate(item.date)));
    body.appendChild(head);

    if (item.desc) body.appendChild(el("p", "card__desc", item.desc));

    var foot = el("div", "card__foot");
    if (item.input) foot.appendChild(el("span", "tag", item.input));
    foot.appendChild(el("span", "card__cta", isExternal(item.href) ? "열기 ↗" : "열기 →"));
    body.appendChild(foot);

    a.appendChild(body);
    return a;
  }

  function render(mountId, items, emptyText) {
    var mount = document.getElementById(mountId);
    if (!mount) return;
    if (!items.length) {
      var e = el("p", "empty", emptyText);
      mount.appendChild(e);
      return;
    }
    var grid = el("div", "grid");
    items.forEach(function (it) { grid.appendChild(buildCard(it)); });
    mount.appendChild(grid);
  }

  render("projects", projects, "아직 첫 번째를 안 만들었습니다. 곧 #1이 올라옵니다.");

  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();
