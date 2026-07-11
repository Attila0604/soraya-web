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

/* Alte lokale Verbindung überschreiben, damit keine falsche Backend-URL im Browser hängen bleibt. */
try {
  localStorage.setItem("soraya_config", JSON.stringify({
    supabaseUrl: window.SORAYA_PUBLIC_CONFIG.supabaseUrl,
    supabaseAnonKey: window.SORAYA_PUBLIC_CONFIG.supabaseAnonKey,
    engineUrl: window.SORAYA_PUBLIC_CONFIG.engineUrl.replace(/\/$/, "")
  }));
} catch (error) {}

(function loadSorayaRuntimeFixes() {
  var files = [
    "/c66-profile-storage-fix.js?v=1.0.1",
    "/c67-stability-polish.js?v=1.0.0",
    "/c68-mobile-fit-fix.js?v=1.0.0",
    "/c70-account-deletion.js?v=1.0.0",
    "/c72-daily-content.js?v=1.0.0"
  ];

  files.forEach(function (file) {
    var cleanName = file.split("?")[0].replace("/", "");

    if (document.querySelector('script[src*="' + cleanName + '"]')) {
      return;
    }

    var script = document.createElement("script");
    script.src = file;
    script.defer = true;
    document.head.appendChild(script);
  });
})();
