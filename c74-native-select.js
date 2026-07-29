/*
  c74-native-select.js
  Ersetzt native <select>-Dropdowns durch eigene, dunkle Menüs im Soraya-Look.
  Grund: Android zeichnet die aufgeklappte Liste eines <select> als System-
  Element (schwarz/weiß) – das lässt sich per CSS nicht zuverlässig stylen.

  - hält das echte <select> als Datenquelle (versteckt), synchronisiert Wert
  - funktioniert für alle <select> mit Klasse .c74-select ODER data-c74
  - ändert kein app.js; Änderungen lösen ein 'change'-Event am <select> aus,
    damit bestehende Logik (z. B. Synastrie-Auswahl) normal reagiert.
*/
(function () {
  "use strict";

  function build(select) {
    if (!select || select.dataset.c74Ready === "1") return;
    select.dataset.c74Ready = "1";
    select.classList.add("c74-native-hidden");

    var wrap = document.createElement("div");
    wrap.className = "c74-select-wrap";

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "c74-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.innerHTML = '<span class="c74-select-label"></span><span class="c74-select-caret">\u25be</span>';

    var menu = document.createElement("div");
    menu.className = "c74-select-menu";
    menu.setAttribute("role", "listbox");

    function labelFor(val) {
      var opt = Array.prototype.find.call(select.options, function (o) { return o.value === val; });
      return opt ? opt.textContent : (select.options[0] ? select.options[0].textContent : "");
    }
    function refreshLabel() {
      trigger.querySelector(".c74-select-label").textContent = labelFor(select.value);
    }

    function rebuildMenu() {
      menu.innerHTML = "";
      Array.prototype.forEach.call(select.options, function (o) {
        var item = document.createElement("button");
        item.type = "button";
        item.className = "c74-select-option" + (o.value === select.value ? " active" : "");
        item.textContent = o.textContent;
        item.setAttribute("role", "option");
        item.addEventListener("click", function () {
          select.value = o.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          refreshLabel();
          close();
        });
        menu.appendChild(item);
      });
    }

    function open() {
      rebuildMenu();
      wrap.classList.add("open");
      document.addEventListener("click", onDocClick, true);
    }
    function close() {
      wrap.classList.remove("open");
      document.removeEventListener("click", onDocClick, true);
    }
    function onDocClick(e) {
      if (!wrap.contains(e.target)) close();
    }

    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      if (wrap.classList.contains("open")) close(); else open();
    });

    // wenn app.js das <select> per Code ändert (z. B. Optionen nachlädt), Label aktualisieren
    select.addEventListener("change", refreshLabel);
    var mo = new MutationObserver(function () { refreshLabel(); });
    mo.observe(select, { childList: true });

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    select.parentNode.insertBefore(wrap, select.nextSibling);
    refreshLabel();
  }

  function scan() {
    var sels = document.querySelectorAll("select.c74-select, select[data-c74], #synPersonSelect, #partnerRelation");
    Array.prototype.forEach.call(sels, build);
  }

  function init() {
    scan();
    // Synastrie-Personenliste wird nachgeladen -> ein paar Mal nachscannen, dann Ruhe
    var n = 0;
    var t = window.setInterval(function () {
      scan();
      if (++n >= 6) window.clearInterval(t);
    }, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
