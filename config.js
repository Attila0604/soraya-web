/*
  Soraya — öffentliche Frontend-Konfiguration + C.5.7 UX Loader

  Wichtig:
  - Supabase anon/public key ist für Browser-Apps gedacht.
  - Keine service_role keys, keine geheimen Keys hier eintragen.
  - C.5.7 lädt nur leichte Frontend-Dateien für Mobile-UX und Button-Polish.
*/

window.SORAYA_PUBLIC_CONFIG = {
  supabaseUrl: "https://qpvniafpajeafcwsrtds.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwdm5pYWZwYWplYWZjd3NydGRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDMzNzIsImV4cCI6MjA5Nzk3OTM3Mn0.ns5pRpXdRdeocvdJPTIhvQEWV4zALr8ty0WJCKH_1QY",
  engineUrl: "https://astro-engine-production-7b18.up.railway.app/"
};

(function loadSorayaC57Assets() {
  "use strict";

  var VERSION = "5.7.0";

  function addCss() {
    if (document.querySelector('link[data-soraya-c57="css"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/c57-mobile-ux.css?v=" + VERSION;
    link.setAttribute("data-soraya-c57", "css");
    document.head.appendChild(link);
  }

  function addJs() {
    if (document.querySelector('script[data-soraya-c57="js"]')) return;
    var script = document.createElement("script");
    script.src = "/c57-mobile-ux.js?v=" + VERSION;
    script.defer = true;
    script.setAttribute("data-soraya-c57", "js");
    document.body.appendChild(script);
  }

  function boot() {
    addCss();
    addJs();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
