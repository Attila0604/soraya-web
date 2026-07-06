/*
  Soraya — C.5.7 Mobile UX + Button Guard
  Nur Frontend. Keine Backend-Änderung.
*/
(function () {
  "use strict";

  var READY_CLASS = "soraya-c57";
  var MOBILE_CLASS = "soraya-mobile";
  var DEV_QUERY = "dev";

  function $(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function isMobile() {
    return window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  }

  function isDeveloperMode() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get(DEV_QUERY) === "1" || localStorage.getItem("soraya_dev") === "1";
    } catch (error) {
      return false;
    }
  }

  function safeText(node) {
    return (node && node.textContent ? node.textContent : "").replace(/\s+/g, " ").trim();
  }

  function setDeviceClass() {
    document.body.classList.add(READY_CLASS);
    document.body.classList.toggle(MOBILE_CLASS, isMobile());
  }

  function hideDeveloperNoise() {
    if (isDeveloperMode()) return;
    $(".developer-only").forEach(function (node) {
      if (node.classList.contains("open")) return;
      node.style.display = "none";
      node.setAttribute("aria-hidden", "true");
    });
  }

  function polishTextDensity() {
    if (!isMobile()) return;

    var selectors = [
      ".page-title p",
      ".c54-insight-card p",
      ".c43-chat-intro p",
      ".c42-guidance-card p",
      ".c44-syn-card p",
      ".c45-profile-hero p"
    ];

    selectors.forEach(function (selector) {
      $(selector).forEach(function (node) {
        if (node.closest(".reading") || node.id === "analysisReading" || node.id === "synastryText") return;
        node.classList.add("c57-compact-text");
      });
    });

    var statusPill = document.getElementById("appStatusPill");
    if (statusPill && !/login|profil|fehler|offen/i.test(statusPill.textContent || "")) {
      statusPill.classList.add("c57-mobile-hidden-info");
    }
  }

  function buttonHasAction(button) {
    if (!button) return false;
    if (button.disabled) return true;
    if (button.getAttribute("onclick")) return true;
    if (button.dataset && (button.dataset.nav || button.dataset.action)) return true;
    if (button.type === "submit") return true;
    if (button.closest(".login-tabs")) return true;
    if (button.classList.contains("password-toggle")) return true;
    if (button.getAttribute("aria-controls")) return true;
    return false;
  }

  function inferButtonLabel(button) {
    var text = safeText(button);
    if (text) return text;
    if (button.title) return button.title;
    if (button.getAttribute("aria-label")) return button.getAttribute("aria-label");
    return "Aktion";
  }

  function polishButtons() {
    $("button").forEach(function (button) {
      if (!button.hasAttribute("type") && !button.closest("form")) {
        button.setAttribute("type", "button");
      }

      if (!button.getAttribute("aria-label") && safeText(button).length <= 3) {
        button.setAttribute("aria-label", button.title || inferButtonLabel(button));
      }

      button.addEventListener("pointerdown", function () {
        button.classList.add("c57-pressed");
      }, { passive: true });

      button.addEventListener("pointerup", function () {
        window.setTimeout(function () { button.classList.remove("c57-pressed"); }, 90);
      }, { passive: true });

      button.addEventListener("pointercancel", function () {
        button.classList.remove("c57-pressed");
      }, { passive: true });

      if (!buttonHasAction(button)) {
        var text = safeText(button).toLowerCase();
        var looksDecorative = !text || text === "›" || text === "×";
        if (looksDecorative) {
          button.classList.add("c57-disabled-button");
          button.setAttribute("aria-hidden", "true");
          return;
        }

        button.addEventListener("click", function (event) {
          event.preventDefault();
          if (window.toast) window.toast("Diese Funktion ist noch nicht aktiv.");
        });
      }
    });

    $("a.btn").forEach(function (link) {
      if (!link.getAttribute("href")) {
        link.classList.add("c57-disabled-button");
      }
    });
  }

  function improveKeyboardAccess() {
    $(".brand[role='button']").forEach(function (brand) {
      if (brand.dataset.c57Keyboard) return;
      brand.dataset.c57Keyboard = "1";
      brand.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (window.showSection) window.showSection("home");
        }
      });
    });
  }

  function tuneChatComposer() {
    var textarea = document.getElementById("chatMessage");
    if (!textarea || textarea.dataset.c57Composer) return;
    textarea.dataset.c57Composer = "1";
    textarea.addEventListener("input", function () {
      if (!isMobile()) return;
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
    });
  }

  function observeDynamicUi() {
    if (!window.MutationObserver) return;
    var observer = new MutationObserver(function () {
      window.clearTimeout(observeDynamicUi._timer);
      observeDynamicUi._timer = window.setTimeout(function () {
        polishButtons();
        polishTextDensity();
        tuneChatComposer();
      }, 120);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function boot() {
    setDeviceClass();
    hideDeveloperNoise();
    polishTextDensity();
    polishButtons();
    improveKeyboardAccess();
    tuneChatComposer();
    observeDynamicUi();

    window.addEventListener("resize", function () {
      window.clearTimeout(boot._resizeTimer);
      boot._resizeTimer = window.setTimeout(function () {
        setDeviceClass();
        polishTextDensity();
      }, 160);
    }, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
