/* Soraya C68 Mobile Text Polish */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function txt(v) { return v === undefined || v === null ? "" : String(v); }
  function setText(id, value) { var n = $(id); if (n) n.textContent = value; }

  function compact(value, limit) {
    var s = txt(value).replace(/\s+/g, " ").trim();
    if (!s || s.length <= limit) return s;
    var cut = s.slice(0, limit);
    var end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    if (end > 70) return cut.slice(0, end + 1).trim();
    var space = cut.lastIndexOf(" ");
    return (space > 50 ? cut.slice(0, space) : cut).trim() + "…";
  }

  function compactHoroscope() {
    var mood = $("horoMood");
    var body = $("horoBody");
    var tip = $("horoTip");

    if (mood) mood.textContent = compact(mood.textContent, 68) || "Dein Horoskop";
    if (body) body.textContent = compact(body.textContent, 210) || "Wähle einen Zeitraum und lade dein Horoskop.";
    if (tip) tip.textContent = compact(tip.textContent, 105) || "✦ Dein Tipp erscheint hier";
  }

  function normalizeChatCards() {
    document.querySelectorAll("#chat .c43-prompt").forEach(function (card) {
      card.style.gridRow = "auto";
      card.style.gridColumn = "auto";
      card.style.height = "";
    });
  }

  function fixHomeWidths() {
    var props = document.querySelector("#home .props");
    if (!props) return;
    props.style.display = "grid";
    props.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
  }

  function patchLoadHoroscope() {
    if (window.__sorayaC68HoroPatched || typeof window.loadHoroscope !== "function") return;
    window.__sorayaC68HoroPatched = true;
    var original = window.loadHoroscope;
    window.loadHoroscope = async function () {
      var result = await original.apply(this, arguments);
      window.setTimeout(compactHoroscope, 80);
      window.setTimeout(compactHoroscope, 450);
      return result;
    };
  }

  function patchShowSection() {
    if (window.__sorayaC68SectionPatched || typeof window.showSection !== "function") return;
    window.__sorayaC68SectionPatched = true;
    var original = window.showSection;
    window.showSection = function (id) {
      var result = original.apply(this, arguments);
      window.setTimeout(run, 80);
      return result;
    };
  }

  function run() {
    compactHoroscope();
    normalizeChatCards();
    fixHomeWidths();
    patchLoadHoroscope();
    patchShowSection();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  window.addEventListener("load", function () {
    run();
    window.setTimeout(run, 600);
    window.setTimeout(run, 1800);
  });
})();
