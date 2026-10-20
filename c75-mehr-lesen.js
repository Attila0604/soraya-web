/*
  Soraya — „Mehr lesen“ (kurz zeigen, Rest aufklappbar)
  Datei: c75-mehr-lesen.js  (nach app.js laden)

  Ein gemeinsamer Helfer fuer alle langen Texte der App:
  - Element mit data-more="3"  -> zeigt die ersten 3 Zeilen, darunter „Mehr lesen ⌄“.
  - Element mit data-more="p"  -> zeigt den ersten Absatz (hoechstens 5 Zeilen).
  - Element mit data-more="sections" -> lange Deutung mit Zwischentiteln: jedes Kapitel
    zeigt Titel + ersten Absatz, der Rest des Kapitels ist aufklappbar.
  Der Text bleibt immer vollstaendig im HTML (nur optisch gekuerzt). Ist ein Text
  kurz genug, erscheint kein Knopf. Aendert sich der Inhalt (neues Horoskop, andere
  Sprache), klappt er wieder zu. Knopf mit aria-expanded / aria-controls.
*/
(function () {
  "use strict";

  var T = function (key) {
    return window.SorayaI18n && window.SorayaI18n.t ? window.SorayaI18n.t(key) : key;
  };
  var reduce = function () {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };
  var known = typeof WeakSet === "function" ? new WeakSet() : null;
  var queued = [];
  var frame = 0;
  var uid = 0;

  var resizeObs = typeof ResizeObserver === "function"
    ? new ResizeObserver(function (entries) { entries.forEach(function (e) { schedule(e.target); }); })
    : null;
  var contentObs = typeof MutationObserver === "function"
    ? new MutationObserver(function (records) {
        records.forEach(function (r) {
          var el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
          var box = el && el.closest("[data-more]");
          if (!box) return;
          if (box.getAttribute("data-more") === "sections") { group(box); return; }
          box.removeAttribute("data-more-open");
          schedule(box);
        });
      })
    : null;

  function schedule(el) {
    if (queued.indexOf(el) < 0) queued.push(el);
    if (!frame) frame = window.requestAnimationFrame(flush);
  }

  function flush() {
    frame = 0;
    var list = queued;
    queued = [];
    list.forEach(measure);
  }

  function toggleFor(el) {
    var next = el.nextElementSibling;
    if (next && next.classList.contains("more-toggle") && next.getAttribute("aria-controls") === el.id) return next;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "more-toggle";
    btn.hidden = true;
    btn.setAttribute("aria-controls", el.id);
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("data-i18n-skip", "");
    btn.onclick = function () { setOpen(el, el.getAttribute("data-more-open") !== "1", true); };
    el.insertAdjacentElement("afterend", btn);
    return btn;
  }

  function label(btn, open) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.innerHTML = "<span></span><i aria-hidden=\"true\"></i>";
    btn.firstChild.textContent = open ? T("Weniger") : T("Mehr lesen");
  }

  function lineHeight(el) {
    var cs = window.getComputedStyle(el);
    var lh = parseFloat(cs.lineHeight);
    if (!lh || isNaN(lh)) lh = (parseFloat(cs.fontSize) || 16) * 1.6;
    return lh;
  }

  // Hoehe des sichtbaren Anfangs in Pixeln
  function limitFor(el) {
    var mode = el.getAttribute("data-more") || "3";
    var lh = lineHeight(el);
    if (mode === "p") {
      var first = null;
      for (var i = 0; i < el.children.length; i += 1) {
        var c = el.children[i];
        if (/^(P|UL|OL)$/.test(c.tagName) && c.textContent.trim()) { first = c; break; }
      }
      var cap = lineHeight(first || el) * 5;
      if (!first) return cap;
      var top = el.getBoundingClientRect().top;
      var bottom = first.getBoundingClientRect().bottom - top;
      return Math.max(lineHeight(first) * 2, Math.min(bottom, cap));
    }
    var n = parseInt(mode, 10) || 3;
    return n * lh + (parseFloat(window.getComputedStyle(el).paddingTop) || 0);
  }

  function measure(el) {
    if (!el.isConnected || el.__moreAnimating || el.getAttribute("data-more") === "sections") return;
    var rect = el.getBoundingClientRect();
    if (!rect.width) return; // gerade unsichtbar: spaeter (ResizeObserver meldet sich)
    var btn = toggleFor(el);
    if (el.querySelector(".sk")) { off(el, btn); return; } // Lade-Platzhalter
    var limit = Math.round(limitFor(el));
    var full = el.scrollHeight;
    // Weniger als ca. 1,5 Zeilen versteckt: lieber alles zeigen
    if (full <= limit + lineHeight(el) * 1.5) { off(el, btn); return; }
    el.classList.add("more-on");
    el.style.setProperty("--more-h", limit + "px");
    var open = el.getAttribute("data-more-open") === "1";
    el.classList.toggle("more-closed", !open);
    el.style.maxHeight = open ? "none" : limit + "px";
    btn.hidden = false;
    label(btn, open);
  }

  function off(el, btn) {
    el.classList.remove("more-on", "more-closed");
    el.style.maxHeight = "";
    if (btn) btn.hidden = true;
  }

  function setOpen(el, open, user) {
    if (!el.classList.contains("more-on")) return;
    var btn = toggleFor(el);
    var limit = parseFloat(el.style.getPropertyValue("--more-h")) || limitFor(el);
    var still = reduce();
    if (open) el.setAttribute("data-more-open", "1"); else el.removeAttribute("data-more-open");
    label(btn, open);
    if (still) {
      el.classList.toggle("more-closed", !open);
      el.style.maxHeight = open ? "none" : limit + "px";
    } else {
      el.__moreAnimating = true;
      var from = el.getBoundingClientRect().height;
      el.style.maxHeight = from + "px";
      void el.offsetHeight; // Startwert festhalten
      if (open) el.classList.remove("more-closed");
      el.style.maxHeight = (open ? el.scrollHeight : limit) + "px";
      window.setTimeout(function () {
        el.__moreAnimating = false;
        if (!open) el.classList.add("more-closed");
        else el.style.maxHeight = "none";
      }, 380);
    }
    // Beim Zuklappen: Anfang des Textes wieder ins Bild holen
    if (!open && user) {
      var top = el.getBoundingClientRect().top;
      if (top < 0) window.scrollBy({ top: top - 90, behavior: still ? "auto" : "smooth" });
    }
  }

  // Lange Deutung in Kapitel gliedern: Titel bleibt sichtbar, Inhalt wird zu data-more="p"
  function group(box) {
    if (box.__moreGrouping) return;
    var kids = Array.prototype.slice.call(box.children);
    if (!kids.length || kids.some(function (k) { return k.classList.contains("more-sec"); })) return;
    box.__moreGrouping = true;
    var current = null;
    kids.forEach(function (k) {
      if (k.classList.contains("reading-stale") || k.classList.contains("sk")) { current = null; return; }
      if (/^H[1-6]$/.test(k.tagName)) { current = null; return; }
      if (!current) {
        current = document.createElement("div");
        current.className = "more-sec";
        current.setAttribute("data-more", "p");
        box.insertBefore(current, k);
      }
      current.appendChild(k);
    });
    box.__moreGrouping = false;
    register(box.querySelectorAll(".more-sec"));
  }

  function register(nodes) {
    Array.prototype.forEach.call(nodes, function (el) {
      if (known ? known.has(el) : el.__moreKnown) return;
      if (known) known.add(el); else el.__moreKnown = true;
      if (!el.id) { uid += 1; el.id = "more-" + uid; }
      if (el.getAttribute("data-more") === "sections") {
        if (contentObs) contentObs.observe(el, { childList: true });
        group(el);
        return;
      }
      if (contentObs) contentObs.observe(el, { childList: true, characterData: true, subtree: true });
      if (resizeObs) resizeObs.observe(el);
      schedule(el);
    });
  }

  function scan() {
    register(document.querySelectorAll("[data-more]"));
  }

  // Oeffentlich: z. B. Kapitel-Chip in der Analyse klappt sein Kapitel auf
  window.sorayaMore = {
    scan: scan,
    open: function (el) { if (el && el.getAttribute && el.getAttribute("data-more")) { measure(el); setOpen(el, true, false); } },
    refresh: function () { Array.prototype.forEach.call(document.querySelectorAll("[data-more]"), schedule); }
  };

  function start() {
    scan();
    // neu eingefuegte Bereiche (Partner-Ergebnis, Analyse) mit data-more erkennen
    if (typeof MutationObserver === "function") {
      var pending = 0;
      new MutationObserver(function () {
        if (pending) return;
        pending = window.requestAnimationFrame(function () { pending = 0; scan(); });
      }).observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener("resize", function () { window.sorayaMore.refresh(); }, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { window.sorayaMore.refresh(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
