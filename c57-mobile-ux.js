/*
  Soraya — C.5.8 Mobile Layout Guard
  Kleine UX-Korrekturen. Keine Backend-Änderung.
*/
(function () {
  "use strict";

  function isMobile() {
    return window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  }

  function shortenMobileText() {
    if (!isMobile()) return;

    const replacements = new Map([
      ["Profil vervollständigen", "Profil öffnen"],
      ["Personen aktualisieren", "Aktualisieren"],
      ["Verbindung berechnen", "Berechnen"],
      ["Zweite Person speichern", "Speichern"],
      ["Tagesbotschaft", "Botschaft"],
      ["Horoskop laden", "Laden"],
      ["Analyse öffnen", "Öffnen"],
      ["Neu erzeugen", "Neu"]
    ]);

    document.querySelectorAll("button, .btn").forEach((button) => {
      const text = (button.textContent || "").trim();
      if (replacements.has(text)) button.textContent = replacements.get(text);
    });
  }

  function protectBottomNav() {
    const nav = document.querySelector(".tabbar");
    if (!nav) return;
    document.documentElement.style.setProperty("--soraya-bottom-nav-height", nav.offsetHeight + "px");
  }

  function markLoaded() {
    document.body.classList.add("soraya-c58-loaded");
  }

  function bindSafeButtons() {
    document.querySelectorAll("button").forEach((button) => {
      if (button.dataset.c58SafeBound) return;
      button.dataset.c58SafeBound = "1";
      button.addEventListener("click", () => {
        button.classList.add("c58-tap");
        window.setTimeout(() => button.classList.remove("c58-tap"), 140);
      }, { passive: true });
    });
  }

  function init() {
    markLoaded();
    shortenMobileText();
    protectBottomNav();
    bindSafeButtons();
    window.setTimeout(() => {
      shortenMobileText();
      protectBottomNav();
      bindSafeButtons();
    }, 700);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("resize", protectBottomNav, { passive: true });
})();
