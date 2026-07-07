/*
  Soraya — C.6.0 Wisch-Navigation
  Links/rechts wischen wechselt die Seite (wie die Tabs unten).
  Additiv, ändert keine Logik. Ignoriert Wischen in scrollbaren/Eingabe-Bereichen.
*/
(function () {
  "use strict";

  var ORDER = ["home", "analysis", "horoscope", "chat", "profile"];

  function currentIndex() {
    var active = document.querySelector(".section.active, section.active");
    if (active && active.id) {
      var i = ORDER.indexOf(active.id);
      if (i >= 0) return i;
    }
    var tab = document.querySelector(".tabbar button.active, .c410-tabbar button.active");
    if (tab) {
      var j = ORDER.indexOf(tab.getAttribute("data-nav"));
      if (j >= 0) return j;
    }
    return 0;
  }

  function go(dir) {
    var next = currentIndex() + dir;
    if (next < 0 || next >= ORDER.length) return;
    if (typeof window.showSection === "function") {
      window.showSection(ORDER[next]);
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) { window.scrollTo(0, 0); }
    }
  }

  // Wischen ignorieren, wenn es in einem scrollbaren/interaktiven Element startet
  function blockSwipe(el) {
    while (el && el.nodeType === 1 && el !== document.body) {
      var tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.classList && (
        el.classList.contains("chat-window") ||
        el.classList.contains("segmented") ||
        el.classList.contains("c4-period-picker") ||
        el.classList.contains("soraya-person-menu") ||
        el.classList.contains("modal")
      )) return true;
      try {
        var st = getComputedStyle(el);
        if ((st.overflowX === "auto" || st.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 4) return true;
      } catch (e) {}
      el = el.parentNode;
    }
    return false;
  }

  var x0 = null, y0 = null, blocked = false;

  document.addEventListener("touchstart", function (e) {
    if (!e.touches || e.touches.length !== 1) { x0 = null; return; }
    var t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY;
    blocked = blockSwipe(e.target);
  }, { passive: true });

  document.addEventListener("touchend", function (e) {
    if (x0 === null || blocked) { x0 = null; return; }
    var t = e.changedTouches[0];
    var dx = t.clientX - x0;
    var dy = t.clientY - y0;
    x0 = null;
    // klarer horizontaler Wisch: mind. 60px, überwiegend horizontal
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
    go(dx < 0 ? 1 : -1); // nach links wischen -> nächste Seite
  }, { passive: true });
})();
