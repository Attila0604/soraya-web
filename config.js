/*
  Soraya — öffentliche Frontend-Konfiguration
  Datei: config.js

  Wichtig:
  - Supabase anon/public key ist für Browser-Apps gedacht.
  - Keine service_role keys, keine geheimen Keys hier eintragen.
  - Diese Datei lädt die sauberen visuellen Zusatz-Layer und Profil-Speicher-Fix.
*/

window.SORAYA_PUBLIC_CONFIG = {
  supabaseUrl: "https://qpvniafpajeafcwsrtds.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwdm5pYWZwYWplYWZjd3NydGRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDMzNzIsImV4cCI6MjA5Nzk3OTM3Mn0.ns5pRpXdRdeocvdJPTIhvQEWV4zALr8ty0WJCKH_1QY",
  engineUrl: "https://astro-engine-production-7b18.up.railway.app/"
};

(function loadSorayaVisualLayers() {
  var files = [
    "/c63-visual-boost.css?v=2.0.3",
    "/c64-final-clean-ui.css?v=1.0.2"
  ];

  files.forEach(function (file) {
    var cleanName = file.split("?")[0].replace("/", "");

    if (document.querySelector('link[href*="' + cleanName + '"]')) {
      return;
    }

    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = file;
    document.head.appendChild(link);
  });
})();

(function loadSorayaProfileStorageFix() {
  var file = "/c66-profile-storage-fix.js?v=1.0.0";
  var cleanName = file.split("?")[0].replace("/", "");

  if (document.querySelector('script[src*="' + cleanName + '"]')) {
    return;
  }

  var script = document.createElement("script");
  script.src = file;
  script.defer = true;
  document.head.appendChild(script);
})();
