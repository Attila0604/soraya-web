/*
  Soraya — C.5.8 Clean Mobile UX
  Datei: c58-mobile-layout.js

  Zweck:
  - Android-Standard-Select beim Horoskop durch edle Soraya-Tabs ersetzen.
  - Bottom-Navigation stabilisieren.
  - Keine Backend-Änderung.
*/
(function () {
  "use strict";

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function isInteractiveTarget(el) {
    while (el && el.nodeType === 1 && el !== document.body) {
      var tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A") return true;
      if (el.classList && (
        el.classList.contains("chat-window") ||
        el.classList.contains("modal") ||
        el.classList.contains("c58-period-tabs")
      )) return true;
      el = el.parentNode;
    }
    return false;
  }

  function buildPeriodTabs() {
    var select = $("#period");
    if (!select || select.dataset.c58TabsReady === "1") return;

    select.dataset.c58TabsReady = "1";
    select.classList.add("soraya-native-hidden");

    var wrapper = document.createElement("div");
    wrapper.className = "c58-period-tabs";
    wrapper.setAttribute("role", "tablist");
    wrapper.setAttribute("aria-label", "Zeitraum wählen");

    var labels = {
      daily: "Tag",
      weekly: "Woche",
      monthly: "Monat"
    };

    Array.prototype.slice.call(select.options).forEach(function (option) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "c58-period-tab";
      button.dataset.periodValue = option.value;
      button.textContent = labels[option.value] || option.textContent || option.value;
      button.setAttribute("role", "tab");

      button.addEventListener("click", function () {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        syncPeriodTabs();
      });

      wrapper.appendChild(button);
    });

    select.parentNode.insertBefore(wrapper, select);
    syncPeriodTabs();

    select.addEventListener("change", syncPeriodTabs);
  }

  function syncPeriodTabs() {
    var select = $("#period");
    if (!select) return;
    $all(".c58-period-tab").forEach(function (button) {
      var active = button.dataset.periodValue === select.value;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.tabIndex = active ? 0 : -1;
    });
  }

  function protectBottomNav() {
    var nav = $(".tabbar");
    if (!nav) return;
    document.documentElement.style.setProperty("--soraya-live-nav-height", nav.offsetHeight + "px");
  }

  function smoothSectionTop() {
    var original = window.showSection;
    if (typeof original !== "function" || original.__c58Wrapped) return;

    function wrappedShowSection(sectionId) {
      original.apply(this, arguments);
      protectBottomNav();
      window.setTimeout(function () {
        try {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (e) {
          window.scrollTo(0, 0);
        }
      }, 20);
    }

    wrappedShowSection.__c58Wrapped = true;
    window.showSection = wrappedShowSection;
  }

  function bindTapFeedback() {
    $all("button, .btn").forEach(function (button) {
      if (button.dataset.c58TapReady === "1") return;
      button.dataset.c58TapReady = "1";
      button.addEventListener("click", function () {
        button.classList.add("c58-tap");
        window.setTimeout(function () {
          button.classList.remove("c58-tap");
        }, 140);
      }, { passive: true });
    });
  }

  function initSwipeNavigation() {
    if (document.documentElement.dataset.c58SwipeReady === "1") return;
    document.documentElement.dataset.c58SwipeReady = "1";

    var order = ["home", "analysis", "horoscope", "chat", "profile"];
    var x0 = null;
    var y0 = null;
    var blocked = false;

    function currentIndex() {
      var active = $(".section.active, section.active");
      if (active && active.id) {
        var i = order.indexOf(active.id);
        if (i >= 0) return i;
      }
      return 0;
    }

    function go(direction) {
      var next = currentIndex() + direction;
      if (next < 0 || next >= order.length) return;
      document.documentElement.setAttribute("data-swipe-dir", direction < 0 ? "prev" : "next");
      if (typeof window.showSection === "function") window.showSection(order[next]);
      window.setTimeout(function () {
        document.documentElement.removeAttribute("data-swipe-dir");
      }, 440);
    }

    document.addEventListener("touchstart", function (event) {
      if (!event.touches || event.touches.length !== 1) {
        x0 = null;
        return;
      }
      var touch = event.touches[0];
      x0 = touch.clientX;
      y0 = touch.clientY;
      blocked = isInteractiveTarget(event.target);
    }, { passive: true });

    document.addEventListener("touchend", function (event) {
      if (x0 === null || blocked) {
        x0 = null;
        return;
      }

      var touch = event.changedTouches && event.changedTouches[0];
      if (!touch) return;

      var dx = touch.clientX - x0;
      var dy = touch.clientY - y0;
      x0 = null;

      if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.65) return;
      go(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function init() {
    document.body.classList.add("soraya-clean-ui");
    buildPeriodTabs();
    protectBottomNav();
    smoothSectionTop();
    bindTapFeedback();
    initSwipeNavigation();

    window.setTimeout(function () {
      buildPeriodTabs();
      protectBottomNav();
      bindTapFeedback();
    }, 700);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.addEventListener("resize", protectBottomNav, { passive: true });
})();
