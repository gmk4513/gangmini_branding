(function () {
  "use strict";

  var projects = (typeof PROJECTS !== "undefined" ? PROJECTS : []).slice();
  var apps = (typeof APPS !== "undefined" ? APPS : []).slice();

  // 최신이 위로. 둘 다 번호(no)가 있으면 번호 기준, 하나라도 없으면 날짜 기준
  // (번호 없는 항목도 만든 날짜 자리에 끼어 들어가게)
  function newestFirst(a, b) {
    if (a.no != null && b.no != null && a.no !== b.no) return b.no - a.no;
    return String(b.date).localeCompare(String(a.date));
  }
  projects.sort(newestFirst);
  apps.sort(newestFirst);

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

  function newTab(a) {
    a.target = "_blank";
    a.rel = "noopener";
  }

  // 스토어가 여럿인 카드: 링크 안에 링크를 넣을 수 없으므로 카드는 <div> 로 두고,
  // 제목 링크를 카드 전체로 늘린다(.card__hit). 스토어 버튼은 그 위에 따로 얹는다
  var isAndroid = /android/i.test(navigator.userAgent || "");
  function primaryLink(links) {
    if (isAndroid) {
      for (var i = 0; i < links.length; i++) if (links[i].os === "android") return links[i];
    }
    return links[0];
  }

  function buildCard(item) {
    var multi = item.links && item.links.length;
    var a = el(multi ? "div" : "a", multi ? "card card--multi" : "card");
    if (!multi) {
      a.href = item.href || "#";
      if (isExternal(item.href)) newTab(a);
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
    var title = el("h4", "card__title", multi ? null : (item.title || "제목 없음"));
    if (multi) {
      var hit = el("a", "card__hit", item.title || "제목 없음");
      hit.href = primaryLink(item.links).href;
      newTab(hit);
      title.appendChild(hit);
    }
    head.appendChild(title);
    head.appendChild(el("time", "card__date", fmtDate(item.date)));
    body.appendChild(head);

    if (item.desc) body.appendChild(el("p", "card__desc", item.desc));

    var foot = el("div", "card__foot");
    if (item.input) foot.appendChild(el("span", "tag", item.input));
    if (multi) {
      var ctas = el("span", "card__ctas");
      item.links.forEach(function (l) {
        var b = el("a", "card__cta", l.label + " ↗");
        b.href = l.href;
        newTab(b);
        ctas.appendChild(b);
      });
      foot.appendChild(ctas);
    } else {
      foot.appendChild(el("span", "card__cta", item.cta || (isExternal(item.href) ? "열기 ↗" : "열기 →")));
    }
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

  // 출시 앱은 없으면 칸째로 숨긴다 (빈 칸에 "없음"을 띄울 이유가 없다)
  if (apps.length) {
    render("apps", apps, "");
    var sec = document.getElementById("apps-section");
    if (sec) sec.hidden = false;
  }

  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();
