/*
  c71-swipe-nav.js
  Links/rechts wischen blättert zwischen den Hauptseiten
  (home → analyse → horoskop → chat → profil).

  - nutzt die bestehende globale showSection() (kein Eingriff in app.js)
  - Reihenfolge kommt aus der Tab-Bar (data-nav), bleibt also automatisch synchron
  - Schutz: kein Wischen beim Tippen in Feldern, in horizontal scrollbaren
    Bereichen, bei offenem Dialog oder Mehrfinger-Gesten
  - kein preventDefault -> vertikales Scrollen bleibt flüssig
*/
(function () {
  "use strict";

  var THRESHOLD = 60;   // Mindest-Wischweite in px
  var RATIO = 1.4;      // wie klar horizontal die Geste sein muss
  var sx = 0, sy = 0, tracking = false, ignore = false;

  function order() {
    return Array.prototype.map.call(
      document.querySelectorAll(".tabbar [data-nav]"),
      function (b) { return b.getAttribute("data-nav"); }
    );
  }

  function currentSection() {
    var s = document.querySelector(".section.active");
    return s ? s.id : null;
  }

  function isBlocked(el) {
    while (el && el.nodeType === 1 && el !== document.body) {
      var tag = (el.tagName || "").toLowerCase();
      if (tag === "textarea" || tag === "input" || tag === "select") return true;
      if (el.hasAttribute && el.hasAttribute("data-noswipe")) return true;
      try {
        var ox = window.getComputedStyle(el).overflowX;
        if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 4) return true;
      } catch (e) {}
      el = el.parentElement;
    }
    return false;
  }

  function onStart(e) {
    if (!e.touches || e.touches.length !== 1) { tracking = false; return; }
    if (document.querySelector(".modal-backdrop.open")) { tracking = false; return; }
    var t = e.touches[0];
    sx = t.clientX; sy = t.clientY;
    ignore = isBlocked(e.target);
    tracking = true;
  }

  function onEnd(e) {
    if (!tracking || ignore) { tracking = false; return; }
    tracking = false;
    var t = e.changedTouches && e.changedTouches[0];
    if (!t) return;

    var dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < THRESHOLD) return;
    if (Math.abs(dx) < Math.abs(dy) * RATIO) return; // zu vertikal -> Scrollen

    var ord = order(), cur = currentSection();
    if (!ord.length || !cur) return;
    var i = ord.indexOf(cur);
    if (i < 0) return;

    var dir = dx < 0 ? "next" : "prev";
    var ni = dir === "next" ? i + 1 : i - 1;
    if (ni < 0 || ni >= ord.length) return; // kein Umlauf an den Enden

    document.documentElement.setAttribute("data-swipe-dir", dir);
    try { if (typeof window.showSection === "function") window.showSection(ord[ni]); } catch (err) {}
    window.setTimeout(function () {
      document.documentElement.removeAttribute("data-swipe-dir");
    }, 440);
  }

  document.addEventListener("touchstart", onStart, { passive: true });
  document.addEventListener("touchend", onEnd, { passive: true });
})();
