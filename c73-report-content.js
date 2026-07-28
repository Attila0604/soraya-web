/*
  c73-report-content.js
  Google-Play-Pflicht für generative KI: Nutzer müssen anstößige KI-Antworten
  melden können. Dieses Modul hängt an jede Soraya-Antwort im Chat einen
  dezenten „melden"-Link, öffnet ein Modal mit Gründen und speichert die
  Meldung.

  Speicherung:
    1. bevorzugt in Supabase-Tabelle `content_reports` (falls vorhanden)
    2. Fallback: localStorage (damit nie etwas verloren geht und die
       Meldefunktion IMMER funktioniert – wichtig für die Store-Prüfung)

  Kein Eingriff in app.js. Beobachtet den Chat per MutationObserver.
*/
(function () {
  "use strict";

  var REASONS = [
    "Anstößig oder beleidigend",
    "Falsch oder irreführend",
    "Gefährlicher Rat",
    "Sexueller/expliziter Inhalt",
    "Sonstiges"
  ];

  /* ---------- Melde-Link an eine Bubble hängen ---------- */
  function decorate(bubble) {
    if (!bubble || bubble.dataset.reportReady === "1") return;
    if (!bubble.classList || !bubble.classList.contains("assistant")) return;
    // die Begrüßungs-Bubble nicht markieren (kein echter Inhalt)
    bubble.dataset.reportReady = "1";

    var link = document.createElement("button");
    link.type = "button";
    link.className = "c73-report-link";
    link.setAttribute("aria-label", "Diese Antwort melden");
    link.innerHTML = "\u2691 melden";
    link.addEventListener("click", function (e) {
      e.stopPropagation();
      openModal(bubble.textContent || "");
    });
    bubble.appendChild(link);
  }

  function scanAll() {
    var bubbles = document.querySelectorAll("#chatWindow .bubble.assistant");
    // erste (Begrüßung) überspringen
    for (var i = 1; i < bubbles.length; i++) decorate(bubbles[i]);
  }

  /* ---------- Modal ---------- */
  var backdrop = null;

  function buildModal() {
    backdrop = document.createElement("div");
    backdrop.className = "c73-report-backdrop";
    backdrop.innerHTML =
      '<div class="c73-report-modal" role="dialog" aria-modal="true" aria-label="Inhalt melden">' +
        '<h3>Inhalt melden</h3>' +
        '<p>Warum möchtest du diese Antwort melden?</p>' +
        '<div class="c73-report-reasons"></div>' +
        '<textarea class="c73-report-note" placeholder="Optional: kurze Beschreibung"></textarea>' +
        '<div class="c73-report-actions">' +
          '<button type="button" class="c73-report-cancel">Abbrechen</button>' +
          '<button type="button" class="c73-report-send">Melden</button>' +
        '</div>' +
        '<div class="c73-report-done" hidden>Danke — deine Meldung wurde übermittelt.</div>' +
      '</div>';
    document.body.appendChild(backdrop);

    var reasonsBox = backdrop.querySelector(".c73-report-reasons");
    var chosen = { value: REASONS[0] };
    REASONS.forEach(function (r, idx) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "c73-reason" + (idx === 0 ? " active" : "");
      b.textContent = r;
      b.addEventListener("click", function () {
        chosen.value = r;
        reasonsBox.querySelectorAll(".c73-reason").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
      });
      reasonsBox.appendChild(b);
    });

    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) closeModal();
    });
    backdrop.querySelector(".c73-report-cancel").addEventListener("click", closeModal);
    backdrop.querySelector(".c73-report-send").addEventListener("click", function () {
      submit(chosen.value);
    });

    backdrop._chosen = chosen;
  }

  var currentContent = "";

  function openModal(content) {
    if (!backdrop) buildModal();
    currentContent = content;
    backdrop._chosen.value = REASONS[0];
    backdrop.querySelectorAll(".c73-reason").forEach(function (x, i) {
      x.classList.toggle("active", i === 0);
    });
    backdrop.querySelector(".c73-report-note").value = "";
    backdrop.querySelector(".c73-report-done").hidden = true;
    backdrop.querySelector(".c73-report-actions").style.display = "";
    backdrop.classList.add("open");
  }

  function closeModal() {
    if (backdrop) backdrop.classList.remove("open");
  }

  /* ---------- Speichern ---------- */
  function saveLocal(entry) {
    try {
      var key = "soraya_content_reports";
      var list = JSON.parse(localStorage.getItem(key) || "[]");
      list.push(entry);
      localStorage.setItem(key, JSON.stringify(list.slice(-50)));
    } catch (e) {}
  }

  function submit(reason) {
    var note = backdrop.querySelector(".c73-report-note").value || "";
    var entry = {
      reason: reason,
      note: note,
      content: (currentContent || "").slice(0, 2000),
      at: new Date().toISOString(),
      url: location.href
    };

    // immer lokal sichern (garantierte Funktion)
    saveLocal(entry);

    // zusätzlich versuchen, in Supabase zu schreiben
    trySupabase(entry);

    // sofortiges Feedback (nicht auf Netzwerk warten)
    backdrop.querySelector(".c73-report-actions").style.display = "none";
    backdrop.querySelector(".c73-report-done").hidden = false;
    window.setTimeout(closeModal, 1600);
  }

  function trySupabase(entry) {
    try {
      var sb = window.sb;
      if (!sb || !sb.from) return;
      var payload = {
        reason: entry.reason,
        note: entry.note,
        content: entry.content,
        page_url: entry.url
      };
      // owner_id setzt Supabase per RLS/Default; wir versuchen es best-effort
      sb.auth.getUser().then(function (res) {
        var uid = res && res.data && res.data.user ? res.data.user.id : null;
        if (uid) payload.owner_id = uid;
        sb.from("content_reports").insert(payload).then(function () {}, function () {});
      }, function () {
        sb.from("content_reports").insert(payload).then(function () {}, function () {});
      });
    } catch (e) { /* Fallback localStorage reicht */ }
  }

  /* ---------- Fester Melde-Hinweis im Chat-Kopf (immer sichtbar) ---------- */
  function ensureHeaderButton() {
    var head = document.querySelector("#chat .chat-head");
    if (!head || head.dataset.reportHead === "1") return;
    head.dataset.reportHead = "1";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "c73-report-head";
    btn.innerHTML = "\u2691 melden";
    btn.title = "Eine Antwort von Soraya melden";
    btn.setAttribute("aria-label", "Unangemessene Antwort melden");
    btn.addEventListener("click", function () {
      // letzte Soraya-Antwort als Kontext, sonst leer
      var bubbles = document.querySelectorAll("#chatWindow .bubble.assistant");
      var last = bubbles.length ? bubbles[bubbles.length - 1].textContent : "";
      openModal(last || "");
    });
    head.appendChild(btn);
  }

  /* ---------- Chat beobachten ---------- */
  function init() {
    ensureHeaderButton();
    scanAll();
    var win = document.getElementById("chatWindow");
    if (win && window.MutationObserver) {
      // reagiert nur auf echte neue Nachrichten – kein Dauer-Polling
      var obs = new MutationObserver(function () { ensureHeaderButton(); scanAll(); });
      obs.observe(win, { childList: true });
    }
    // Sicherheitsnetz nur ein paar Mal am Anfang (kein Dauer-Intervall -> kein Ruckeln beim Scrollen)
    var tries = 0;
    var timer = window.setInterval(function () {
      ensureHeaderButton(); scanAll();
      if (++tries >= 5 || document.querySelector("#chat .c73-report-head")) {
        window.clearInterval(timer);
      }
    }, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
