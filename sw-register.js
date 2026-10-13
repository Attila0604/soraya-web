/*
  sw-register.js
  Registriert den Soraya Service Worker (Offline-Faehigkeit fuer den Play Store).
  Bewusst schlank und fehlertolerant: schlaegt die Registrierung fehl,
  laeuft die App normal weiter (nur ohne Offline-Fallback).
*/
(function () {
  "use strict";
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").then(function (reg) {
      // Wenn ein neuer SW bereitsteht, aktivieren lassen (kein Warten auf Tab-Schliessen)
      reg.addEventListener("updatefound", function () {
        var sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", function () {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            reg.waiting && reg.waiting.postMessage("skipWaiting");
          }
        });
      });
    }).catch(function () { /* still: App laeuft ohne SW weiter */ });
  });

  // Kein automatisches Neuladen nach einem Update mehr: Der Service Worker holt
  // alle Dateien ohnehin zuerst frisch aus dem Netz (network-first). Das Neuladen
  // liess die App beim Oeffnen sichtbar ein zweites Mal starten (Sprache flackerte).
})();
