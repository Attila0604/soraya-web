/*
  c70-account-deletion.js
  Store-Pflicht: In-App-Kontoloeschung (Apple App Store + Google Play).

  Ablauf:
  1. Button #deleteAccountBtn (in index.html) oeffnet einen Bestaetigungsdialog.
  2. Nach Bestaetigung: POST {engineUrl}/mobile/account/delete
     mit Authorization: Bearer <supabase access token>.
  3. Bei Erfolg: lokale Session/Config loeschen und zurueck zum Login.

  Sicherheit: Die owner_id wird NICHT mitgeschickt. Das Backend leitet sie
  aus dem verifizierten Token ab, ein User kann also nur sich selbst loeschen.
*/
(function () {
  "use strict";

  function engineBase() {
    var c = (window.SORAYA_PUBLIC_CONFIG || {});
    var url = (c.engineUrl || "").trim().replace(/\/$/, "");
    return url;
  }

  async function getAccessToken() {
    // window.getToken wird von app.js exportiert.
    if (typeof window.getToken === "function") {
      try { return await window.getToken(); } catch (e) { /* faellt unten durch */ }
    }
    // Fallback direkt ueber den Supabase-Client.
    if (window.sb && window.sb.auth && window.sb.auth.getSession) {
      var res = await window.sb.auth.getSession();
      return res && res.data && res.data.session && res.data.session.access_token;
    }
    return null;
  }

  function clearLocalSoraya() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && (/soraya/i.test(k) || /^sb-/i.test(k))) keys.push(k);
      }
      keys.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    } catch (e) {}
  }

  // --- Modal -----------------------------------------------------------------
  function buildModal() {
    var overlay = document.createElement("div");
    overlay.id = "c70-delete-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;" +
      "justify-content:center;padding:22px;background:rgba(3,4,13,.72);" +
      "backdrop-filter:blur(6px);";

    overlay.innerHTML =
      '<div style="max-width:420px;width:100%;background:linear-gradient(180deg,#0b1029,#070a1d);' +
      'border:1px solid rgba(255,120,90,.45);border-radius:22px;padding:26px 24px;' +
      'box-shadow:0 22px 70px rgba(0,0,0,.55);font-family:Inter,system-ui,sans-serif;color:#fff4df;">' +
        '<h3 style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:26px;margin:0 0 8px;color:#ffd0a0;">Konto löschen?</h3>' +
        '<p style="font-size:14.5px;line-height:1.6;color:#c8badf;margin:0 0 6px;">Das löscht dein Konto und <b style="color:#fff4df;">alle deine Daten</b> unwiderruflich:</p>' +
        '<p style="font-size:13.5px;line-height:1.6;color:#9184a8;margin:0 0 18px;">Personen, Analysen, Horoskope, Synastrien und dein Chat-Verlauf mit Soraya. Das kann nicht rückgängig gemacht werden.</p>' +
        '<div id="c70-msg" style="display:none;font-size:13px;margin:0 0 14px;padding:10px 12px;border-radius:12px;"></div>' +
        '<div style="display:flex;gap:10px;">' +
          '<button id="c70-cancel" style="flex:1;padding:13px;border-radius:14px;border:1px solid rgba(255,218,135,.30);background:transparent;color:#fff4df;font-weight:600;font-size:14px;cursor:pointer;">Abbrechen</button>' +
          '<button id="c70-confirm" style="flex:1.3;padding:13px;border-radius:14px;border:none;background:linear-gradient(180deg,#ff7a5c,#c23b2a);color:#fff;font-weight:700;font-size:14px;cursor:pointer;">Endgültig löschen</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    return overlay;
  }

  function showMsg(overlay, text, kind) {
    var box = overlay.querySelector("#c70-msg");
    if (!box) return;
    box.style.display = "block";
    box.textContent = text;
    if (kind === "error") {
      box.style.background = "rgba(255,80,60,.12)";
      box.style.color = "#ffb0a0";
      box.style.border = "1px solid rgba(255,120,90,.4)";
    } else {
      box.style.background = "rgba(181,107,255,.12)";
      box.style.color = "#d9c7ff";
      box.style.border = "1px solid rgba(181,107,255,.4)";
    }
  }

  async function runDeletion(overlay) {
    var confirmBtn = overlay.querySelector("#c70-confirm");
    var cancelBtn = overlay.querySelector("#c70-cancel");
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    confirmBtn.textContent = "Wird gelöscht …";
    confirmBtn.style.opacity = ".7";

    try {
      var base = engineBase();
      if (!base) { showMsg(overlay, "Backend-Verbindung fehlt. Bitte App neu laden.", "error"); resetButtons(overlay); return; }

      var token = await getAccessToken();
      if (!token) { showMsg(overlay, "Keine gültige Sitzung. Bitte neu anmelden.", "error"); resetButtons(overlay); return; }

      var resp = await fetch(base + "/mobile/account/delete", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }
      });
      var data = null;
      try { data = await resp.json(); } catch (e) {}

      if (resp.ok && data && data.ok) {
        showMsg(overlay, "Konto gelöscht. Du wirst abgemeldet …", "info");
        try { if (window.sb && window.sb.auth) await window.sb.auth.signOut(); } catch (e) {}
        clearLocalSoraya();
        setTimeout(function () { window.location.href = "/login"; }, 1200);
      } else {
        var err = (data && data.error) ? data.error : ("HTTP " + resp.status);
        showMsg(overlay, "Löschen fehlgeschlagen: " + err, "error");
        resetButtons(overlay);
      }
    } catch (e) {
      showMsg(overlay, "Netzwerkfehler: " + (e && e.message ? e.message : e), "error");
      resetButtons(overlay);
    }
  }

  function resetButtons(overlay) {
    var confirmBtn = overlay.querySelector("#c70-confirm");
    var cancelBtn = overlay.querySelector("#c70-cancel");
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = "Endgültig löschen"; confirmBtn.style.opacity = "1"; }
    if (cancelBtn) { cancelBtn.disabled = false; }
  }

  function openDialog() {
    if (document.getElementById("c70-delete-overlay")) return;
    var overlay = buildModal();
    overlay.querySelector("#c70-cancel").addEventListener("click", function () { overlay.remove(); });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector("#c70-confirm").addEventListener("click", function () { runDeletion(overlay); });
  }

  function wire() {
    var btn = document.getElementById("deleteAccountBtn");
    if (btn && !btn.dataset.c70) {
      btn.dataset.c70 = "1";
      btn.addEventListener("click", openDialog);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
  // Falls die Section erst spaeter gerendert wird, nochmal nachziehen.
  setTimeout(wire, 1500);

  window.sorayaOpenDeleteAccount = openDialog;
})();
