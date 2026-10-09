/*
  Soraya — öffentliche Frontend-Konfiguration
  Datei: config.js

  Wichtig:
  - Supabase anon/public key ist für Browser-Apps gedacht.
  - Keine service_role keys, keine geheimen Keys hier eintragen.
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

/* Die UI-Zusaetze (c58, c70, c72, c73, c74) laedt index.html direkt in fester
   Reihenfolge nach app.js. Die frueheren Fix-Schichten c66/c67/c68 sind in
   app.js aufgegangen. */
