/*
  Soraya — öffentliche Frontend-Konfiguration
  Datei: config.js

  Wichtig:
  - Supabase anon/public key ist für Browser-Apps gedacht.
  - Keine service_role keys, keine geheimen Keys hier eintragen.
  - Diese Datei lädt keine zusätzlichen alten Patch-CSS-Dateien mehr.
    Dadurch bleibt das UI sauber kontrollierbar.
*/

window.SORAYA_PUBLIC_CONFIG = {
  supabaseUrl: "https://qpvniafpajeafcwsrtds.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwdm5pYWZwYWplYWZjd3NydGRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDMzNzIsImV4cCI6MjA5Nzk3OTM3Mn0.ns5pRpXdRdeocvdJPTIhvQEWV4zALr8ty0WJCKH_1QY",
  engineUrl: "https://astro-engine-production-7b18.up.railway.app/"
};
