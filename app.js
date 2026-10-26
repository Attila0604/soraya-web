/*
  Soraya — App-Logik
  Datei: app.js

  Enthaelt seit Oktober 2026 auch die frueheren Fix-Schichten c66/c67/c68
  (Profil-Wiederherstellung, Benutzerwechsel, sanfte Fallbacks, Horoskop-
  Platzhalter). Die UI-Zusaetze c58/c70/c72/c73/c74 werden in index.html in
  fester Reihenfolge NACH dieser Datei geladen.
*/

(function () {
  "use strict";

  const KEYS = {
    config: "soraya_config",
    person: "soraya_person_id",
    conv: "soraya_conversation_id",
    name: "soraya_person_name",
    birth: "soraya_birth",
    created: "soraya_created_at",
    analyses: "soraya_analysis_count",
    people: "soraya_people_cache_v1",
    authUser: "soraya_auth_user_id",
    streak: "soraya_streak",
    daySky: "soraya_day_sky_v1"
  };

  // Alles, was zu einem bestimmten Nutzer gehoert (bei Benutzerwechsel loeschen)
  const BIRTH_CHANGED_KEY = "soraya_birth_changed_at";
  const PROFILE_KEYS = [BIRTH_CHANGED_KEY, KEYS.person, KEYS.conv, KEYS.name, KEYS.birth, KEYS.created, KEYS.analyses, KEYS.people, KEYS.streak, KEYS.daySky];

  const LOGIN_PATH = "/login";
  const SKY_REFRESH_MS = 10 * 60 * 1000;
  let lastHomeSkyAt = 0;
  let lastSkyTodayAt = 0;
  let skyToday = null;
  let chatBusy = false;
  const APP_VERSION = "web-v49";
  let chartCache = { personId: null, json: null };
  let sb = null;
  let homeSkyTimer = null;
  // Personenliste der letzten erfolgreichen Server-Abfrage (fuer den Chat)
  let serverPeople = null;

  const PUBLIC_CONFIG = normalizeConfig(window.SORAYA_PUBLIC_CONFIG || {});

  // Mehrsprachigkeit (i18n.js): t(deutscherText, vars) und Astro-Begriffe
  const I18N = window.SorayaI18n || null;
  const t = (key, vars) => (I18N ? I18N.t(key, vars) : String(key).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m)));
  const LANG = () => (I18N ? I18N.lang : "de");
  const ASTRO = I18N ? I18N.astro : null;

  const $ = (id) => document.getElementById(id);
  const isMobile = () => window.matchMedia && window.matchMedia("(max-width: 768px)").matches;

  function safe(value, fallback = "") {
    return value === undefined || value === null || value === "" ? fallback : String(value);
  }

  function escapeHtml(value) {
    return safe(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Lange Texte (Analyse, Partner-Deutung): echte Absaetze, Zwischentitel und Listen
  // statt <br><br> -- ruhiger Lesefluss und gleichmaessige Abstaende.
  function markdownToHtml(text) {
    const inline = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    const blocks = String(text || t("Noch kein Text vorhanden.")).replace(/\r/g, "").split(/\n\s*\n/);
    const out = [];
    blocks.forEach((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      let para = [];
      let list = [];
      const flushPara = () => { if (para.length) out.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; };
      const flushList = () => { if (list.length) out.push("<ul>" + list.map((l) => "<li>" + inline(l) + "</li>").join("") + "</ul>"); list = []; };
      lines.forEach((line) => {
        const h = /^#{1,4}\s+(.*)$/.exec(line);
        const li = /^[-*•]\s+(.*)$/.exec(line);
        if (h) { flushPara(); flushList(); out.push('<h3 class="rd-h">' + inline(h[1].replace(/[#*]+$/g, "").trim()) + "</h3>"); }
        else if (li) { flushPara(); list.push(li[1]); }
        else { flushList(); para.push(line); }
      });
      flushPara(); flushList();
    });
    return out.join("");
  }

  function toast(message) {
    const box = $("toast");
    if (!box) return;
    box.textContent = message;
    box.classList.add("show");
    window.setTimeout(() => box.classList.remove("show"), 2600);
  }

  function status(id, text, type = "") {
    const node = $(id);
    if (!node) return;
    node.classList.remove("ok", "bad");
    if (type) node.classList.add(type);
    node.textContent = typeof text === "string" ? text : JSON.stringify(text, null, 2);
  }

  function friendlyError(error, fallback) {
    // Fehler aus engineFail() tragen schon einen fertigen Text in der App-Sprache
    if (error && error.code && error.message) return error.message;
    const text = error && error.message ? error.message : fallback;
    if (/not logged|nicht eingeloggt|JWT|session/i.test(text)) return t("Bitte zuerst einloggen.");
    if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(text)) return t("Verbindung nicht erreichbar. Bitte prüfe dein Internet.");
    return text || fallback;
  }

  function showGlobalError(message, type = "") {
    const panel = $("globalErrorPanel");
    const text = $("globalErrorText");
    if (!panel || !text) return;
    text.textContent = message;
    panel.classList.remove("ok", "bad");
    if (type) panel.classList.add(type);
    panel.classList.add("show");
  }

  function hideGlobalError() {
    const panel = $("globalErrorPanel");
    if (panel) panel.classList.remove("show");
  }

  function readJson(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }


  function normalizeConfig(config) {
    const c = config || {};
    return {
      supabaseUrl: safe(c.supabaseUrl).trim(),
      supabaseAnonKey: safe(c.supabaseAnonKey).trim(),
      engineUrl: safe(c.engineUrl).trim().replace(/\/$/, "")
    };
  }

  function hasCompleteConfig(config) {
    const c = normalizeConfig(config);
    return !!(c.supabaseUrl && c.supabaseAnonKey && c.engineUrl);
  }

  function getStoredConfig() {
    return normalizeConfig(readJson(KEYS.config, null));
  }

  function getAvailableConfig() {
    // Die oeffentliche config.js gewinnt immer gegen alte lokale Werte.
    if (hasCompleteConfig(PUBLIC_CONFIG)) return PUBLIC_CONFIG;
    const stored = getStoredConfig();
    if (hasCompleteConfig(stored)) return stored;
    return null;
  }

  function isDeveloperMode() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("dev") === "1" || localStorage.getItem("soraya_dev") === "1";
    } catch (error) {
      return false;
    }
  }

  function renderDeveloperTools() {
    const show = isDeveloperMode() || !hasCompleteConfig(PUBLIC_CONFIG);
    document.body.classList.toggle("soraya-dev-visible", show);
    document.querySelectorAll(".developer-only").forEach((node) => {
      if (node.id === "settingsModal") {
        if (!node.classList.contains("open")) {
          node.style.display = "none";
          node.setAttribute("aria-hidden", "true");
        }
        return;
      }
      node.style.display = show ? "" : "none";
      node.setAttribute("aria-hidden", show ? "false" : "true");
    });
  }

  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value;
  }

  // Lade-Platzhalter (schimmernde Zeilen) statt leerer oder springender Inhalte
  function skeleton(lines = 3) {
    let html = '<div class="sk" role="status" aria-label="' + escapeHtml(t("Wird geladen…")) + '">';
    for (let i = 0; i < lines; i += 1) html += "<i></i>";
    return html + "</div>";
  }

  // Seitentitel je Bereich (Browser-Tab, Verlauf, Teilen-Vorschau)
  const SECTION_TITLES = {
    home: "Soraya — Luxury Astro Guide",
    analysis: "Geburtshoroskop · Soraya",
    horoscope: "Horoskop · Soraya",
    chat: "Chat mit Soraya",
    synastry: "Partner-Vergleich · Soraya",
    profile: "Profil · Soraya"
  };
  function setPageTitle(id) {
    const title = SECTION_TITLES[id];
    if (title) document.title = t(title);
  }

  function showSection(id) {
    const target = $(id);
    if (!target) {
      showGlobalError(t("Bereich nicht gefunden: {id}", { id }), "bad");
      return false;
    }

    document.querySelectorAll(".section").forEach((section) => section.classList.remove("active"));
    target.classList.add("active");

    document.querySelectorAll("[data-nav]").forEach((button) => {
      // Partner-Vergleich hat keinen eigenen Reiter -- er gehoert zu Home ("Deine Menschen")
      button.classList.toggle("active", button.getAttribute("data-nav") === (id === "synastry" ? "home" : id));
    });

    window.scrollTo({ top: 0, behavior: isMobile() ? "auto" : "smooth" });
    renderAppStatus();
    setPageTitle(id);

    track("section_view", { id });

    try {
      const url = new URL(window.location.href);
      url.searchParams.set("section", id);
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    } catch (error) {}

    if (id === "analysis") {
      window.setTimeout(() => {
        loadRealChartData(false);
        autoLoadAnalysis();
      }, 80);
    }

    if (id === "horoscope") {
      window.setTimeout(() => loadHoroscope({ silent: true }), 60);
    }

    if (id === "synastry") {
      window.setTimeout(() => {
        updateSynastryNames();
        // laeuft gerade ein Partner-Vergleich? Anzeige fortsetzen -- sonst ein
        // gespeichertes Ergebnis fuer die gewaehlte Person zeigen
        const running = synResume();
        loadPeopleFromSupabase(false).then(() => { if (!running) synShowSaved(); });
      }, 80);
    }

    if (id === "chat") {
      window.setTimeout(() => {
        renderChatSuggestions(false);
        loadChatHistory();
      }, 60);
    }

    if (id === "profile") {
      window.setTimeout(() => {
        prefillProfileFromPreview();
        renderAuthUi();
        renderProfilePreview();
        renderOnboardingState();
      }, 80);
    }

    if (id === "home") {
      window.setTimeout(() => {
        if (Date.now() - lastHomeSkyAt > SKY_REFRESH_MS) renderHomeSkyThrottled();
        renderSkyToday(false);
        renderOnboardingState();
      }, 80);
    }

    return true;
  }

  function openLogin() {
    try {
      const active = document.querySelector(".section.active");
      const sectionId = active && active.id ? active.id : "home";
      localStorage.setItem("soraya_after_login_section", sectionId);
      localStorage.setItem("soraya_after_login_path", "/?section=" + encodeURIComponent(sectionId));
    } catch (error) {}
    window.location.href = LOGIN_PATH;
  }

  function openSettings() {
    renderDeveloperTools();
    if (!isDeveloperMode() && hasCompleteConfig(PUBLIC_CONFIG)) {
      toast(t("App-Verbindung ist aktiv."));
      return;
    }
    const modal = $("settingsModal");
    if (!modal) return;
    loadConfig(false);
    modal.style.display = "";
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeSettings() {
    const modal = $("settingsModal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    renderDeveloperTools();
  }

  function initSupabase(config) {
    if (!window.supabase) throw new Error(t("Supabase CDN wurde nicht geladen."));
    if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error(t("Supabase-Verbindung fehlt."));
    }

    sb = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });

    window.sb = sb;
    return sb;
  }

  function saveConfig() {
    try {
      const config = {
        supabaseUrl: ($("supabaseUrl") && $("supabaseUrl").value.trim()) || "",
        supabaseAnonKey: ($("supabaseAnonKey") && $("supabaseAnonKey").value.trim()) || "",
        engineUrl: (($("engineUrl") && $("engineUrl").value.trim()) || "").replace(/\/$/, "")
      };

      if (!config.supabaseUrl || !config.supabaseAnonKey || !config.engineUrl) {
        status("configStatus", t("Bitte alle Felder ausfüllen."), "bad");
        return false;
      }

      if (!/^https:\/\//i.test(config.supabaseUrl) || !/^https:\/\//i.test(config.engineUrl)) {
        status("configStatus", t("Bitte gültige HTTPS-URLs verwenden."), "bad");
        return false;
      }

      writeJson(KEYS.config, config);
      initSupabase(config);
      status("configStatus", t("Verbindung gespeichert."), "ok");
      toast(t("Verbindung gespeichert."));
      renderAuthUi();
      renderAppStatus();
      return true;
    } catch (error) {
      status("configStatus", friendlyError(error, t("Verbindung konnte nicht gespeichert werden.")), "bad");
      return false;
    }
  }

  function loadConfig(showMessage = false) {
    const config = getAvailableConfig();
    if (!config) {
      if (showMessage) status("configStatus", t("App-Verbindung fehlt. Bitte einmal einrichten."), "bad");
      renderDeveloperTools();
      return false;
    }

    if ($("supabaseUrl")) $("supabaseUrl").value = config.supabaseUrl || "";
    if ($("supabaseAnonKey")) $("supabaseAnonKey").value = config.supabaseAnonKey || "";
    if ($("engineUrl")) $("engineUrl").value = config.engineUrl || "";

    try {
      initSupabase(config);
      if (showMessage) status("configStatus", t("Verbindung aktiv."), "ok");
      renderDeveloperTools();
      return true;
    } catch (error) {
      if (showMessage) status("configStatus", friendlyError(error, t("Verbindung konnte nicht geladen werden.")), "bad");
      renderDeveloperTools();
      return false;
    }
  }

  function getConfig() {
    const config = getAvailableConfig();
    if (!config) throw new Error(t("App-Verbindung fehlt."));
    return config;
  }

  function getEngineUrl() {
    return getConfig().engineUrl.replace(/\/$/, "");
  }

  async function checkSorayaConnection() {
    try {
      const ok = saveConfig() || loadConfig(true);
      if (!ok) return false;
      await getSessionState();
      status("connectionHealthStatus", t("◈ Verbindung ist aktiv."), "ok");
      return true;
    } catch (error) {
      status("connectionHealthStatus", friendlyError(error, t("Verbindung konnte nicht geprüft werden.")), "bad");
      return false;
    }
  }

  async function getToken() {
    if (!sb && !loadConfig(false)) throw new Error(t("Supabase Client nicht bereit."));

    const { data, error } = await sb.auth.getSession();
    if (error) throw error;

    const token = data && data.session && data.session.access_token;
    if (!token) {
      const missing = new Error(t("Bitte zuerst einloggen."));
      missing.code = "auth";
      throw missing;
    }

    return token;
  }

  // Header fuer /chart und /transits: das Backend verlangt dort einen eingeloggten User.
  async function engineHeaders() {
    const headers = { "Content-Type": "application/json" };
    try {
      headers.Authorization = "Bearer " + (await getToken());
    } catch (error) {}
    return headers;
  }

  // fetch mit Zeitlimit. Nur fuer schnelle Abfragen -- Analyse/Chat duerfen lange dauern.
  async function fetchWithTimeout(url, options, ms) {
    if (!ms || typeof AbortController === "undefined") return fetch(url, options);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error && error.name === "AbortError") {
        const slow = new Error(t("Soraya braucht gerade zu lange. Bitte versuch es gleich noch einmal."));
        slow.code = "timeout";
        throw slow;
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------------
  // Fehler der astro-engine: nie rohe Server-Texte zeigen (deutsch, technisch,
  // HTML-Fehlerseiten), sondern einen klaren Satz in der App-Sprache.
  // error.code: limit | auth | server | data | timeout ; error.raw = Originaltext
  // ---------------------------------------------------------------------------
  function engineMessage(raw) {
    const msg = String(raw || "").trim();
    if (/Ort nicht gefunden|Kein Ort angegeben|birthplace/i.test(msg)) return t("Diesen Geburtsort findet Soraya nicht. Bitte schreib ihn genauer, z. B. „Debrecen, Ungarn“.");
    if (/Geocoder|geocod|Nominatim/i.test(msg)) return t("Der Geburtsort konnte gerade nicht gesucht werden. Bitte versuch es gleich noch einmal.");
    if (/^Person nicht gefunden|^Profil nicht gefunden/i.test(msg)) return t("Profil nicht gefunden.");
    if (/muessen verschieden sein/i.test(msg)) return t("Bitte eine andere Person auswählen.");
    if (/ist nicht hinterlegt/i.test(msg)) return t("Das hat gerade nicht geklappt. Bitte versuch es gleich noch einmal.");
    if (/^[A-Za-z_.]*(Error|Exception|Timeout|TimedOut|Unavailable)\b|Traceback|Internal Server Error|Supabase|ok=false|HTTP \d|nicht gesetzt|Tool/.test(msg)) {
      return t("Das hat gerade nicht geklappt. Bitte versuch es gleich noch einmal.");
    }
    return msg ? t(msg) : t("Das hat gerade nicht geklappt. Bitte versuch es gleich noch einmal.");
  }

  function engineFail(status, json) {
    const detail = json && typeof json.detail === "string" ? json.detail : "";
    const raw = detail || (json && typeof json.error === "string" ? json.error : "");
    let message, code;
    if (status === 429) { message = t("Tageslimit erreicht – morgen geht es weiter ✨"); code = "limit"; }
    else if (status === 401 || status === 403) { message = t("Deine Anmeldung ist abgelaufen. Bitte melde dich neu an."); code = "auth"; }
    else if (status >= 500 || !json) { message = t("Soraya ist gerade nicht erreichbar. Bitte versuch es gleich noch einmal."); code = "server"; }
    else { message = engineMessage(raw); code = "data"; }
    const error = new Error(message);
    error.code = code;
    error.status = status;
    error.raw = raw || "HTTP " + status;
    return error;
  }

  // Antwort lesen: JSON pruefen, Fehler in engineFail() umwandeln
  async function readEngine(response) {
    let json = null;
    try {
      const text = await response.text();
      json = JSON.parse(text);
    } catch (error) {}
    if (!json || typeof json !== "object" || Array.isArray(json)) throw engineFail(response.ok ? 502 : response.status, null);
    if (!response.ok) throw engineFail(response.status, json);
    if (json.ok === false) throw engineFail(200, json);
    return json;
  }

  async function callSoraya(path, body, method = "POST", timeoutMs = 0) {
    const token = await getToken();
    const response = await fetchWithTimeout(getEngineUrl() + path, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: method === "GET" ? undefined : JSON.stringify(body || {})
    }, timeoutMs);
    return readEngine(response);
  }

  async function signOut() {
    try {
      if (!sb) loadConfig(false);
      if (sb) await sb.auth.signOut();

      clearProfileStorage();
      localStorage.removeItem(KEYS.authUser);
      // Laufende Auftraege und der Schnellstart gehoeren zur abgemeldeten Person
      ["soraya_analysis_job", "soraya_synastry_job", "soraya_preview_v1"].forEach((key) => {
        try { localStorage.removeItem(key); } catch (error) {}
      });
      serverPeople = null;
      chartCache = { personId: null, json: null };
      // Sauber neu starten: sonst bleiben Name, Chart, Analyse und Personen der
      // abgemeldeten Person auf dem Bildschirm stehen.
      try { sessionStorage.setItem("soraya_just_logged_out", "1"); } catch (error) {}
      window.location.replace("/");
    } catch (error) {
      const msg = friendlyError(error, t("Abmelden fehlgeschlagen."));
      showGlobalError(msg, "bad");
      toast(msg);
    }
  }

  // ---------------------------------------------------------------------------
  // Nutzungsstatistik & Fehlerprotokoll
  // Eigene Supabase-Tabelle app_events, nur fuer eingeloggte Nutzer, keine
  // Cookies, keine Drittanbieter, keine Inhalte (keine Chat-Texte/Geburtsdaten).
  // Loeschung nach 180 Tagen (pg_cron). Siehe datenschutz.html, Abschnitt 3.
  // ---------------------------------------------------------------------------
  const TRACK_LIMIT = 40;
  let trackedCount = 0;
  let trackedErrors = 0;

  function shortText(value, max = 200) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  // Herkunft: Kam jemand ueber einen Link aus einem Social-Media-Post (?q=p123)
  // oder einen Bio-Link (?q=bio-ig)? Die Kennung bleibt 7 Tage lokal gespeichert.
  // Gezaehlt wird anonym (nur Anzahl pro Kennung); bei eingeloggten Nutzern wird
  // sie einmal mit dem naechsten Nutzungsereignis gespeichert (neue Konten je Post).
  const QUELLE_KEY = "soraya_quelle";
  const QUELLE_MUSTER = /^[a-z0-9-]{2,32}$/;

  function quelle() {
    try {
      const d = JSON.parse(localStorage.getItem(QUELLE_KEY) || "null");
      if (d && QUELLE_MUSTER.test(d.code || "") && Date.now() - (d.t || 0) < 7 * 864e5) return d;
    } catch (error) {}
    return null;
  }

  function quelleAusLink() {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = (params.get("q") || "").trim().toLowerCase();
      if (!code) return;
      if (QUELLE_MUSTER.test(code)) {
        localStorage.setItem(QUELLE_KEY, JSON.stringify({ code, t: Date.now() }));
        if (params.get("qs") !== "1") publicEvent("besuch");  // qs=1: schon auf der Landingpage gezaehlt
      }
      params.delete("q");
      params.delete("qs");
      const rest = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? "?" + rest : "") + window.location.hash);
    } catch (error) {}
  }

  async function track(event, props = {}) {
    try {
      if (trackedCount >= TRACK_LIMIT) return;
      if (event === "error" && ++trackedErrors > 10) return;
      if (!sb && !loadConfig(false)) return;
      const { data } = await sb.auth.getSession();
      if (!data || !data.session) return;
      trackedCount += 1;
      // Kennung genau einmal mitschicken: sofort (vor dem Senden) als gemeldet markieren,
      // damit gleichzeitige Ereignisse sie nicht auch tragen; bei Fehler zuruecksetzen.
      const herkunft = quelle();
      const mitQuelle = herkunft && !herkunft.gemeldet ? { q: herkunft.code } : {};
      if (mitQuelle.q) localStorage.setItem(QUELLE_KEY, JSON.stringify({ ...herkunft, gemeldet: true }));
      const { error } = await sb.from("app_events").insert({ event, props: { ...props, ...mitQuelle, v: APP_VERSION } });
      if (error && mitQuelle.q) localStorage.setItem(QUELLE_KEY, JSON.stringify(herkunft));
    } catch (error) {}
  }

  function trackError(where, error) {
    track("error", { where, msg: shortText(error && error.message ? error.message : error) });
  }

  // iPhone/iPad (auch iPadOS, das sich als Mac ausgibt)
  function isIos() {
    const ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  function isInAppBrowser() {
    return /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Line\/|Snapchat|Pinterest/i.test(navigator.userAgent || "");
  }

  // Hinweis "Zum Home-Bildschirm" nur im iPhone-Browser, nicht in der
  // installierten App, und nur bis zum Wegklicken.
  function renderIosHint() {
    const card = $("iosInstallCard");
    if (!card) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem("soraya_ios_hint_dismissed") === "1"; } catch (error) {}
    const show = isIos() && !isStandalone() && !dismissed;
    card.hidden = !show;
    if (!show) return;
    const inApp = isInAppBrowser();
    if ($("iosInApp")) $("iosInApp").hidden = !inApp;
    if ($("iosSteps")) $("iosSteps").hidden = inApp;
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || "");
  }

  // Android im Browser (nicht in der Play-App): Hinweis auf Google Play, bis zum Wegklicken
  function renderAndroidHint() {
    const card = $("androidInstallCard");
    if (!card) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem("soraya_android_hint_dismissed") === "1"; } catch (error) {}
    const show = isAndroid() && !isStandalone() && !dismissed;
    card.hidden = !show;
    const link = $("androidPlayLink");
    if (show && link) link.href = link.href.split("&hl=")[0] + "&hl=" + LANG();
  }

  function dismissAndroidHint() {
    try { localStorage.setItem("soraya_android_hint_dismissed", "1"); } catch (error) {}
    const card = $("androidInstallCard");
    if (card) card.hidden = true;
    track("android_hint_closed", {});
  }

  function dismissIosHint() {
    try { localStorage.setItem("soraya_ios_hint_dismissed", "1"); } catch (error) {}
    const card = $("iosInstallCard");
    if (card) card.hidden = true;
    track("ios_hint_closed", {});
  }

  function isStandalone() {
    try {
      return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true || document.referrer.startsWith("android-app://");
    } catch (error) {
      return false;
    }
  }

  window.addEventListener("error", (event) => {
    const file = shortText(event && event.filename, 300).split("/").pop();
    track("error", { where: "js", msg: shortText(event && event.message), file, line: event && event.lineno });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event && event.reason;
    track("error", { where: "promise", msg: shortText(reason && reason.message ? reason.message : reason) });
  });

  function clearProfileStorage() {
    PROFILE_KEYS.forEach((key) => {
      try { localStorage.removeItem(key); } catch (error) {}
    });
    if ($("personId")) $("personId").value = "";
    if ($("conversationId")) $("conversationId").value = "";
  }

  // Meldet sich auf demselben Geraet ein anderer Nutzer an, duerfen dessen
  // Profil-Daten nicht beim neuen Nutzer auftauchen (frueher c66).
  async function ensureSameUser() {
    const state = await getSessionState();
    const userId = state.session && state.session.user ? state.session.user.id : "";
    if (!userId) return state;
    const previous = localStorage.getItem(KEYS.authUser) || "";
    if (previous && previous !== userId) {
      clearProfileStorage();
      serverPeople = null;
      chartCache = { personId: null, json: null };
    }
    localStorage.setItem(KEYS.authUser, userId);
    return state;
  }

  async function getSessionState() {
    try {
      if (!sb && !loadConfig(false)) return { ok: false, session: null };
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      return { ok: !!(data && data.session), session: data && data.session };
    } catch (error) {
      return { ok: false, session: null, error };
    }
  }

  // Sprache fuer die Mails (z. B. "Passwort zurücksetzen") im Konto aktuell halten.
  // Nur wenn sie sich geaendert hat; das Demo-Konto bleibt unveraendert.
  let mailLangSynced = false;
  function syncMailLang(session) {
    try {
      const user = session && session.user;
      if (mailLangSynced || !user || !sb || user.email === "kovacs.attilazsolt@gmx.at") return;
      mailLangSynced = true;
      if ((user.user_metadata || {}).lang === LANG()) return;
      sb.auth.updateUser({ data: { lang: LANG() } }).catch(() => {});
    } catch (error) {}
  }

  async function renderAuthUi() {
    const state = await getSessionState();
    const topButton = $("authTopButton");
    const profileButton = $("profileAuthButton");
    const logoutButton = $("logoutButton");
    const loginText = $("loginSessionText");
    const loginBadge = $("loginBadge");
    const loginCard = $("loginSessionCard");

    if (state.ok) {
      document.body.classList.remove("soraya-logged-out", "soraya-needs-login");
      syncMailLang(state.session);
      const email = state.session && state.session.user ? state.session.user.email : "Supabase User";

      if (topButton) {
        const who = (localStorage.getItem(KEYS.name) || email || "").trim();
        topButton.textContent = (who[0] || "✦").toUpperCase();
        topButton.classList.add("is-avatar");
        topButton.onclick = () => showSection("profile");
        topButton.setAttribute("aria-label", t("Profil öffnen"));
      }

      // Kein Knopf ohne Funktion ("Eingeloggt"): stattdessen zeigen, mit welcher Adresse
      if (profileButton) profileButton.style.display = "none";

      if (logoutButton) logoutButton.style.display = "block";
      if ($("profileSaveButton")) $("profileSaveButton").textContent = t("Profil speichern");
      // Eingeloggt ohne Profil: Schnellstart nicht mehr "ganz ohne Konto" anpreisen
      const qsLead = document.querySelector("#quickStartCard .qs-lead");
      if (qsLead) qsLead.textContent = t("Gib dein Geburtsdatum ein – Soraya zeigt dir sofort Sonne, Mond und dein Horoskop für heute. Geburtsort und Uhrzeit ergänzt du danach im Profil.");
      if (loginText) loginText.textContent = email && email !== "Supabase User"
        ? t("Angemeldet als {email}", { email })
        : t("Dein Konto ist aktiv.");
      if (loginBadge) loginBadge.textContent = t("Aktiv");
      if (loginCard) loginCard.classList.add("ok");
      return true;
    }

    document.body.classList.add("soraya-logged-out", "soraya-needs-login");
    if ($("profileSaveButton")) $("profileSaveButton").textContent = t("Kostenlos registrieren & speichern");

    if (topButton) {
      topButton.classList.remove("is-avatar");
      topButton.textContent = "☾";
      topButton.onclick = openLogin;
      topButton.setAttribute("aria-label", t("Einloggen"));
    }

    if (profileButton) {
      profileButton.style.display = "";
      profileButton.textContent = t("Einloggen");
      profileButton.onclick = openLogin;
    }

    if (logoutButton) logoutButton.style.display = "none";
    if (loginText) loginText.textContent = t("Melde dich an, damit Soraya deine Daten speichern kann.");
    if (loginBadge) loginBadge.textContent = t("Offen");
    if (loginCard) loginCard.classList.remove("ok");
    return false;
  }

  function numOrNull(id) {
    const node = $(id);
    if (!node) return null;
    const raw = node.value.trim();
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function requiredNumber(id, label) {
    const value = numOrNull(id);
    if (value === null) throw new Error(t("{label} fehlt.", { label }));
    return value;
  }

  function getBirthFromForm() {
    return {
      name: ($("pName") && $("pName").value.trim()) || "",
      year: requiredNumber("pYear", t("Jahr")),
      month: requiredNumber("pMonth", t("Monat")),
      day: requiredNumber("pDay", t("Tag")),
      hour: numOrNull("pHour"),
      minute: numOrNull("pMinute"),
      birthplace: ($("pBirthplace") && $("pBirthplace").value.trim()) || ""
    };
  }

  function getCurrentPersonId() {
    return (($("personId") && $("personId").value.trim()) || localStorage.getItem(KEYS.person) || "").trim();
  }

  const PROFILE_DRAFT_KEY = "soraya_profile_draft";

  async function createPerson() {
    // Ohne Konto: Eingaben merken und zur kostenlosen Registrierung -- danach
    // stehen sie wieder im Profil (statt Fehlermeldung "Bitte zuerst einloggen").
    if (document.body.classList.contains("soraya-logged-out")) {
      writeJson(PROFILE_DRAFT_KEY, getBirthFromForm());
      toast(t("Fast fertig – mit einem kostenlosen Konto speichert Soraya dein Profil."));
      window.setTimeout(quickStartCta, 700);
      return;
    }
    try {
      const person = getBirthFromForm();

      if (!person.name) throw new Error(t("Name fehlt."));
      if (!person.birthplace) throw new Error(t("Geburtsort fehlt."));

      showLoadingVeil(t("Profil wird gespeichert…"));
      const data = await callSoraya("/mobile/people/create", {
        is_self: true,
        relation: null,
        person
      });

      const row = data.data && data.data.person;
      if (!row || !row.id) throw new Error(t("Person wurde gespeichert, aber keine ID erhalten."));

      if ($("personId")) $("personId").value = row.id;

      localStorage.setItem(KEYS.person, row.id);
      localStorage.setItem(KEYS.name, row.name || person.name);
      // Geburtsdaten geaendert? Dann passt eine schon gespeicherte Analyse nicht mehr.
      const before = readJson(KEYS.birth, null);
      const sig = (b) => b ? [b.day, b.month, b.year, b.hour, b.minute, String(b.birthplace || "").trim().toLowerCase()].join("|") : "";
      if (before && sig(before) !== sig(person)) {
        try { localStorage.setItem(BIRTH_CHANGED_KEY, new Date().toISOString()); } catch (error) {}
        analysisShownFor = null;
        Object.keys(horoscopeCache).forEach((k) => { delete horoscopeCache[k]; });
      }
      writeJson(KEYS.birth, person);
      try { localStorage.removeItem(PROFILE_DRAFT_KEY); } catch (error) {}
      if (!localStorage.getItem(KEYS.created)) localStorage.setItem(KEYS.created, new Date().toISOString());

      addPersonToCache(row, { ...person, is_self: true, relation: "self" });
      chartCache = { personId: null, json: null };
      coreLine = "";
      loadPeopleFromSupabase(false);
      renderIdentity();
      renderProfilePreview();
      renderHomeSkyThrottled(true);
      renderOnboardingState();
      renderAppStatus();
      loadRealChartData(true);
      status("personResult", t("◈ Profil gespeichert.\nName: {name}", { name: row.name || person.name }), "ok");
      track("profile_saved", { time_known: person.hour !== null });
      toast(t("Profil gespeichert."));
    } catch (error) {
      const msg = friendlyError(error, t("Profil konnte nicht gespeichert werden."));
      trackError("profile", error);
      status("personResult", msg, "bad");
      toast(msg);
    } finally {
      hideLoadingVeil();
    }
  }

  function needPerson() {
    const id = getCurrentPersonId();
    // Ohne Konto fuehrte das frueher ins Profil, wo man ohne Login nichts
    // speichern kann (Sackgasse). Jetzt: Hinweis-Karte "Kostenloses Konto".
    if (!id && document.body.classList.contains("soraya-logged-out")) {
      const gate = document.querySelector(".section.active .guest-gate");
      if (gate) {
        gate.scrollIntoView({ behavior: "smooth", block: "center" });
        gate.classList.remove("is-nudged");
        void gate.offsetWidth;
        gate.classList.add("is-nudged");
      }
      toast(t("Dafür brauchst du ein kostenloses Konto."));
      return false;
    }
    if (!id) {
      toast(t("Bitte zuerst dein Profil speichern."));
      showSection("profile");
      return false;
    }
    return true;
  }

  // Analyse: beim Oeffnen des Bereichs wird eine GESPEICHERTE Analyse automatisch
  // angezeigt (only_cached -> nie ein ungefragter Claude-Aufruf). Neu erstellen
  // nur auf Knopfdruck, mit Rueckfrage (max. 3 pro Tag).
  let analysisShownFor = null;

  function setAnalysisButtons(hasReading) {
    if (!hasReading && $("readingToc")) $("readingToc").hidden = true;
    const open = $("analysisOpenButton");
    const regen = $("analysisRegenButton");
    if (open) {
      open.style.display = hasReading ? "none" : "";
      open.textContent = t("Analyse erstellen");
    }
    if (regen) regen.style.display = hasReading ? "" : "none";
    // Mit fertigem Text: "Neu erstellen" ans Ende (erst lesen, dann ggf. neu machen)
    const row = open && open.parentNode;
    const reading = $("analysisReading");
    if (row && reading && reading.parentNode === row.parentNode) {
      if (hasReading && row.nextElementSibling !== null && reading.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_PRECEDING) reading.after(row);
      if (!hasReading && reading.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING) reading.before(row);
      row.classList.toggle("is-after", !!hasReading);
    }
  }

  function showAnalysis(data) {
    const analysis = data.data && data.data.analysis ? data.data.analysis : {};
    const reading = analysis.reading || data.data.reading || data.data.text || "";
    if (!reading) return false;
    const source = data.data.source;
    if ($("analysisSource")) $("analysisSource").textContent = source === "created" ? t("neu") : t("gespeichert");
    if ($("analysisReading")) {
      let note = "";
      try {
        const changed = localStorage.getItem(BIRTH_CHANGED_KEY);
        const made = analysis.created_at ? new Date(analysis.created_at).getTime() : 0;
        if (changed && source !== "created" && made && made < new Date(changed).getTime()) {
          note = '<p class="reading-stale">' + escapeHtml(t("Du hast deine Geburtsdaten geändert. Diese Deutung beruht noch auf den alten Daten – tippe unten auf „Neu erstellen“.")) + "</p>";
        }
      } catch (error) {}
      $("analysisReading").innerHTML = note + markdownToHtml(reading);
      buildReadingToc(reading);
    }
    analysisShownFor = getCurrentPersonId();
    setAnalysisButtons(true);
    return true;
  }

  // Lange Deutung: Kapitel als Sprung-Chips oben + ungefaehre Lesezeit
  function buildReadingToc(text) {
    const nav = $("readingToc");
    const box = $("analysisReading");
    if (!nav || !box) return;
    const heads = Array.from(box.querySelectorAll("h3.rd-h"));
    if (heads.length < 3) { nav.hidden = true; nav.innerHTML = ""; return; }
    const words = String(text || "").split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.round(words / 200));
    nav.innerHTML = '<span class="r5-toc-time">' + escapeHtml(t("{n} Min. Lesezeit", { n: minutes })) + "</span>" +
      heads.map((h, i) => { h.id = "rd-" + i; return '<button type="button" class="r5-chip" data-target="rd-' + i + '">' + escapeHtml(h.textContent) + "</button>"; }).join("");
    nav.hidden = false;
    nav.onclick = (event) => {
      const chip = event.target.closest(".r5-chip");
      const target = chip && $(chip.dataset.target);
      if (!target) return;
      // Kapitel aufklappen (c75-mehr-lesen.js), dann hinscrollen
      if (window.sorayaMore && target.nextElementSibling) window.sorayaMore.open(target.nextElementSibling);
      const top = target.getBoundingClientRect().top + window.scrollY - 24;
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: top, behavior: reduce ? "auto" : "smooth" });
    };
  }

  async function autoLoadAnalysis() {
    const personId = getCurrentPersonId();
    if (anaResume()) return;                       // laeuft gerade: Anzeige fortsetzen
    if (anaRunning && $("analysisProgress")) $("analysisProgress").hidden = true;  // gehoert zu anderer Person
    if (!personId || analysisShownFor === personId) return;
    const reading = $("analysisReading");
    if (reading && !reading.querySelector("h1,h2,h3,strong") && !anaRunning) reading.innerHTML = skeleton(4);
    try {
      const data = await callSoraya("/mobile/analysis/save", { person_id: personId, only_cached: true, lang: LANG() }, "POST", 15000);
      if (!showAnalysis(data)) {
        setAnalysisButtons(false);
        if ($("analysisSource")) $("analysisSource").textContent = t("bereit");
        if ($("analysisReading")) $("analysisReading").textContent = t("Deine persönliche Analyse ist noch nicht erstellt. Tippe auf „Analyse erstellen“ – Soraya schreibt sie in etwa einer Minute.");
      }
    } catch (error) {
      setAnalysisButtons(false);
      if (reading && reading.querySelector(".sk")) {
        reading.textContent = isNetworkError(error)
          ? t("Deine gespeicherte Analyse ist gerade nicht erreichbar. Versuch es gleich noch einmal.")
          : t("Deine persönliche Analyse ist noch nicht erstellt. Tippe auf „Analyse erstellen“ – Soraya schreibt sie in etwa einer Minute.");
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Tiefen-Analyse als Hintergrund-Auftrag (Engine v2.17)
  // Der Start antwortet sofort; die App fragt alle paar Sekunden kurz nach dem
  // Stand (Phase, Sekunden). Kurze Funkloecher sind egal, die App darf verlassen
  // werden -- beim Zurueckkommen geht die Anzeige weiter oder die fertige Analyse
  // erscheint.
  // ---------------------------------------------------------------------------
  const ANA_JOB_KEY = "soraya_analysis_job";
  const ANA_MAX_MS = 12 * 60 * 1000;
  let anaTimer = null, anaTick = null, anaState = null, anaFails = 0, anaRunning = false;

  function anaPhaseText(phase) {
    return {
      chart: t("Geburtshoroskop wird berechnet"),
      bereiche: t("Vier Lebensbereiche werden gedeutet"),
      verweben: t("Soraya verwebt alles zu deiner Analyse"),
      pruefen: t("Sprache wird geprüft"),
      speichern: t("Wird gespeichert")
    }[phase] || t("Soraya schreibt deine Analyse");
  }

  function anaJob() {
    const job = readJson(ANA_JOB_KEY, null);
    if (!job || !job.personId || Date.now() - (job.start || 0) > ANA_MAX_MS) return null;
    return job;
  }

  function anaJobSet(job) {
    if (job) localStorage.setItem(ANA_JOB_KEY, JSON.stringify(job));
    else localStorage.removeItem(ANA_JOB_KEY);
  }

  // Gemeinsame Fortschritts-Anzeige fuer Hintergrund-Auftraege (Analyse, Partner-Vergleich)
  function jobBox(id, anker) {
    let box = $(id);
    if (box) return box;
    if (!anker || !anker.parentNode) return null;
    box = document.createElement("div");
    box.id = id;
    box.className = "ana-progress";
    box.setAttribute("role", "status");
    box.innerHTML = `
      <div class="ana-orbit" aria-hidden="true"><span class="ana-ring"></span><span class="ana-moon"></span><span class="ana-star"></span></div>
      <div class="ana-info">
        <p class="ana-step"></p>
        <div class="ana-bar" aria-hidden="true"><i></i></div>
        <p class="ana-time"></p>
        <ol class="ana-steps"></ol>
        <p class="ana-hint"></p>
        <p class="ana-net" hidden></p>
      </div>`;
    anker.parentNode.insertBefore(box, anker);
    return box;
  }

  function jobRestText(sec) {
    if (sec <= 0) return t("dauert etwas länger als üblich – gleich fertig");
    if (sec < 10) return t("gleich fertig …");
    if (sec < 45) return t("noch ca. {n} Sekunden", { n: Math.max(10, Math.round(sec / 5) * 5) });
    if (sec < 90) return t("noch ca. 1 Minute");
    return t("noch ca. {n} Minuten", { n: Math.round(sec / 60) });
  }

  function jobRender(box, s, { phaseText, hint, fails, standardPhasen, standardSekunden }) {
    if (!box || !s) return;
    const phasen = s.phasen && s.phasen.length ? s.phasen : standardPhasen;
    const idx = Math.max(0, phasen.indexOf(s.phase));
    const vergangen = (s.vergangen_sekunden || 0) + (Date.now() - s.empfangen) / 1000;
    const erwartet = s.erwartet_sekunden || standardSekunden;
    const prozent = Math.min(96, Math.max(idx / phasen.length * 100, vergangen / erwartet * 100, 3));
    box.hidden = false;
    box.querySelector(".ana-step").textContent = phaseText(s.phase) + " …";
    box.querySelector(".ana-bar i").style.width = prozent.toFixed(1) + "%";
    box.querySelector(".ana-time").textContent = jobRestText(Math.round(erwartet - vergangen));
    box.querySelector(".ana-steps").innerHTML = phasen.map((p, i) =>
      `<li class="${i < idx ? "done" : i === idx ? "active" : ""}">${escapeHtml(phaseText(p))}</li>`).join("");
    box.querySelector(".ana-hint").textContent = hint;
    const net = box.querySelector(".ana-net");
    net.hidden = fails < 2;
    net.textContent = t("Verbindung wackelt – Soraya arbeitet trotzdem weiter.");
  }

  function anaBox() {
    return jobBox("analysisProgress", $("analysisReading"));
  }

  function anaRender() {
    jobRender(anaBox(), anaState, {
      phaseText: anaPhaseText,
      hint: t("Du kannst die App ruhig verlassen – Soraya schreibt im Hintergrund weiter und deine Analyse wartet hier auf dich."),
      fails: anaFails,
      standardPhasen: ["chart", "bereiche", "verweben", "speichern"],
      standardSekunden: 90
    });
  }

  function anaStop() {
    anaRunning = false;
    window.clearTimeout(anaTimer);
    window.clearInterval(anaTick);
    anaTimer = anaTick = null;
    anaState = null;
    anaFails = 0;
    const box = $("analysisProgress");
    if (box) box.hidden = true;
  }

  function anaBegin(job, state) {
    anaRunning = true;
    anaState = { ...state, empfangen: Date.now() };
    if ($("analysisSource")) $("analysisSource").textContent = t("läuft");
    if ($("analysisReading")) $("analysisReading").textContent = "";
    if ($("readingToc")) $("readingToc").hidden = true;
    ["analysisOpenButton", "analysisRegenButton"].forEach((id) => { if ($(id)) $(id).style.display = "none"; });
    anaRender();
    window.clearInterval(anaTick);
    anaTick = window.setInterval(anaRender, 1000);
  }

  function anaSchedule(ms) {
    window.clearTimeout(anaTimer);
    anaTimer = window.setTimeout(anaPoll, ms);
  }

  function anaFinishedOk(analysis, source) {
    const job = anaJob();
    anaStop();
    anaJobSet(null);
    if (job && job.personId !== getCurrentPersonId()) {   // inzwischen andere Person geoeffnet
      analysisShownFor = null;
      toast(t("Deine Analyse ist fertig ✨"));
      return;
    }
    showAnalysis({ data: { source, analysis } });
    if (source === "created") {
      const count = Number(localStorage.getItem(KEYS.analyses) || 0) + 1;
      localStorage.setItem(KEYS.analyses, String(count));
      toast(t("Deine Analyse ist fertig ✨"));
    }
    renderIdentity();
    track("analysis_loaded", { source: source || "" });
  }

  function anaFailed(message) {
    anaStop();
    anaJobSet(null);
    setAnalysisButtons(false);
    if ($("analysisSource")) $("analysisSource").textContent = t("bereit");
    if ($("analysisReading")) $("analysisReading").textContent = message;
    toast(message);
  }

  async function anaPoll() {
    const job = anaJob();
    if (!job) return anaFailed(t("Die Analyse wurde unterbrochen. Bitte starte sie noch einmal."));
    try {
      const res = await callSoraya("/mobile/analysis/status?person_id=" + encodeURIComponent(job.personId)
        + "&lang=" + encodeURIComponent(job.lang), null, "GET", 12000);
      const d = res.data || {};
      anaFails = 0;
      if (d.status === "fertig" && d.analysis) return anaFinishedOk(d.analysis, "created");
      if (d.status === "fehler") {
        trackError("analysis", new Error(d.fehler || "fehler"));
        return anaFailed(t("Die Analyse konnte nicht erstellt werden. Bitte versuche es noch einmal – dein Tageslimit wurde dafür nicht verbraucht."));
      }
      if (d.status === "keiner" || (d.status === "fertig" && !d.analysis)) {
        // Server wurde neu gestartet o. ae.: ist die Analyse schon gespeichert?
        const saved = await callSoraya("/mobile/analysis/save", { person_id: job.personId, only_cached: true, lang: job.lang }, "POST", 15000);
        const a = saved.data && saved.data.analysis;
        if (a && a.reading && Date.parse(a.created_at || 0) >= job.start - 5000) return anaFinishedOk(a, "created");
        return anaFailed(t("Die Analyse wurde unterbrochen. Bitte starte sie noch einmal."));
      }
      if (job.personId === getCurrentPersonId()) {
        anaState = { ...d, empfangen: Date.now() };
        anaRender();
      }
      anaSchedule(3000);
    } catch (error) {
      if (error && (error.code === "limit" || error.code === "auth")) return anaFailed(friendlyError(error, ""));
      anaFails += 1;            // Funkloch: einfach weiter versuchen, nichts abbrechen
      anaRender();
      anaSchedule(Math.min(10000, 3000 + anaFails * 2000));
    }
  }

  // Beim Oeffnen/Zurueckkehren: laeuft fuer diese Person gerade eine Analyse?
  function anaResume() {
    const job = anaJob();
    if (!job || job.personId !== getCurrentPersonId() || job.lang !== LANG()) return false;
    if (!anaRunning) anaBegin(job, { status: "laeuft", phase: job.phase || "chart", phasen: job.phasen,
      vergangen_sekunden: Math.round((Date.now() - job.start) / 1000), erwartet_sekunden: job.erwartet });
    anaSchedule(0);
    return true;
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && anaRunning) { anaFails = 0; anaSchedule(0); }
  });

  async function loadAnalysis(forceNew) {
    if (!needPerson()) return;
    if (anaRunning) return;
    if (forceNew && !window.confirm(t("Eine neue Analyse ersetzt die bisherige. Du kannst bis zu 3 neue Analysen pro Tag erstellen. Jetzt neu erstellen?"))) return;

    const personId = getCurrentPersonId(), lang = LANG();
    const job = { personId, lang, start: Date.now(), erwartet: lang === "de" ? 75 : 100 };
    anaJobSet(job);   // vor dem Start merken: reisst die Verbindung, findet die App den Auftrag wieder
    anaBegin(job, { status: "laeuft", phase: "chart", vergangen_sekunden: 0, erwartet_sekunden: job.erwartet });
    try {
      const res = await callSoraya("/mobile/analysis/start", { person_id: personId, force_new: !!forceNew, lang }, "POST", 20000);
      const d = res.data || {};
      if (d.status === "fertig") return anaFinishedOk(d.analysis, d.source || "cached");
      anaJobSet({ ...job, erwartet: d.erwartet_sekunden || job.erwartet, phasen: d.phasen });
      anaState = { ...d, empfangen: Date.now() };
      anaRender();
      track("analysis_started", { force: !!forceNew });
      anaSchedule(3000);
    } catch (error) {
      if (isNetworkError(error)) {
        anaFails = 2;                      // vielleicht kam der Start trotzdem an -> nachsehen
        anaRender();
        return anaSchedule(4000);
      }
      trackError("analysis", error);
      anaFailed(friendlyError(error, t("Analyse konnte nicht geladen werden.")));
    }
  }

  // Wechselt jeden Tag (gleicher Tag = gleicher Text, auch nach Neuladen)
  const DAILY_RITUALS = [
    "Lege eine Hand auf dein Herz, atme fünfmal tief und formuliere eine klare Intention.",
    "Schreib drei Dinge auf, für die du heute dankbar bist – auch ganz kleine.",
    "Trink am Morgen ein Glas Wasser ganz bewusst und denk dabei an das, was du heute loslassen willst.",
    "Geh zehn Minuten ohne Handy nach draußen und schau einmal bewusst in den Himmel.",
    "Zünde am Abend eine Kerze an und lass den Tag in drei Sätzen Revue passieren.",
    "Räum eine kleine Ecke auf – Ordnung außen schafft Ruhe innen.",
    "Schreib einen Satz an dein zukünftiges Ich und lies ihn in einem Monat wieder."
  ];
  const DAILY_AFFIRMATIONS = [
    "Ich vertraue meinem Weg und bewege mich mit Klarheit.",
    "Ich darf langsam sein und trotzdem ankommen.",
    "Was für mich bestimmt ist, findet mich.",
    "Ich höre auf mein Gefühl – es kennt den Weg.",
    "Ich lasse los, was mich schwer macht.",
    "Ich bin genug, genau so, wie ich heute bin.",
    "Mein Licht wird stärker, wenn ich es teile."
  ];
  function ofTheDay(list) {
    const now = new Date();
    const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
    return list[day % list.length];
  }

  function pickText(source, keys, fallback) {
    if (!source) return fallback;
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
    }
    return fallback;
  }

  function renderHoroscopePremium(payload) {
    const root = payload && payload.data ? payload.data : payload || {};
    const h = root.horoscope || root || {};
    const body = pickText(h, ["body", "text", "beschreibung", "deutung", "message"], pickText(root, ["body", "text"], ""));
    const mood = pickText(h, ["stimmung", "mood", "title", "titel"], pickText(root, ["stimmung", "mood"], t("Dein Horoskop")));
    const tip = pickText(h, ["tipp", "tip", "hinweis", "advice"], pickText(root, ["tipp", "tip"], t("Vertraue deinem inneren Kompass.")));
    const lower = (body + " " + mood + " " + tip).toLowerCase();

    const focus = pickText(h, ["fokus", "focus"], pickText(root, ["fokus", "focus"], lower.includes("klar") ? t("Klarheit entsteht, wenn du heute bewusst langsamer wirst.") : t("Richte deine Energie auf eine Sache, die wirklich wichtig ist.")));
    const love = pickText(h, ["liebe", "love", "beziehung"], pickText(root, ["liebe", "love"], lower.includes("herz") || lower.includes("liebe") ? t("Sprich ehrlich, aber sanft. Nähe entsteht durch echtes Zuhören.") : t("Zeige dich offen, aber bleibe bei deinen eigenen Bedürfnissen.")));
    const work = pickText(h, ["beruf", "work", "career"], pickText(root, ["beruf", "work"], lower.includes("geduld") ? t("Geduld bringt heute mehr als Druck.") : t("Struktur hilft dir, deine Kraft sinnvoll einzusetzen.")));
    const ritual = pickText(h, ["ritual", "ritual_text"], pickText(root, ["ritual"], t(ofTheDay(DAILY_RITUALS))));
    const affirmation = pickText(h, ["affirmation", "mantra"], pickText(root, ["affirmation"], t(ofTheDay(DAILY_AFFIRMATIONS))));

    setText("horoFocusTitle", t("Dein Fokus"));
    setText("horoFocusText", focus);
    setText("horoLoveTitle", t("Herz & Nähe"));
    setText("horoLoveText", love);
    setText("horoWorkTitle", t("Richtung & Kraft"));
    setText("horoWorkText", work);
    setText("horoRitualTitle", t("Dein Ritual"));
    setText("horoRitualText", ritual);
    setText("horoAffirmation", t("„{text}“", { text: affirmation.replace(/^[„“"«»]+|[„“"«»]+$/g, "") }));
  }

  // Horoskop: laedt beim Oeffnen und beim Wechsel Tag/Woche/Monat automatisch.
  // Der Server liefert dasselbe Horoskop pro Zeitraum aus seinem Cache, hier wird
  // zusaetzlich im Speicher gehalten, damit Tab-Wechsel sofort reagieren.
  const horoscopeCache = {};
  let horoGuestShown = false;
  const horoscopePending = {};

  function horoscopeKey(period) {
    return getCurrentPersonId() + "|" + period + "|" + new Date().toDateString();
  }

  // Datum in der App-Sprache (Intl), z. B. "Freitag, 9. Oktober" / "Friday 9 October"
  function longDate(d) {
    return I18N ? I18N.formatDate(d, { weekday: "long", day: "numeric", month: "long" }) : d.toDateString();
  }

  function dayMonth(d) {
    return I18N ? I18N.formatDate(d, { day: "numeric", month: "long" }) : d.toDateString();
  }

  function horoscopeDateLabel(period) {
    const now = new Date();
    if (period === "weekly") {
      const end = new Date(now.getTime() + 6 * 86400000);
      return t("Die nächsten 7 Tage · bis {date}", { date: dayMonth(end) });
    }
    if (period === "monthly") return t("Die kommenden Wochen · ab {date}", { date: dayMonth(now) });
    return t("Heute · {date}", { date: longDate(now) });
  }

  function currentPeriod() {
    return ($("period") && $("period").value) || "daily";
  }

  function fetchHoroscope(period) {
    const key = horoscopeKey(period);
    const hit = horoscopeCache[period];
    if (hit && hit.key === key) return Promise.resolve(hit.data);
    if (horoscopePending[key]) return horoscopePending[key];
    const request = callSoraya("/mobile/horoscope/save", { person_id: getCurrentPersonId(), period, at: null, lang: LANG() })
      .then((data) => {
        horoscopeCache[period] = { key, data };
        return data;
      })
      .finally(() => { delete horoscopePending[key]; });
    horoscopePending[key] = request;
    return request;
  }

  function renderHoroscope(data) {
    if ($("horoGastCta")) $("horoGastCta").hidden = true;
    if ($("horoStartCta")) $("horoStartCta").hidden = true;
    const h = data.data && data.data.horoscope ? data.data.horoscope : {};
    const mood = h.stimmung || data.data.stimmung || t("Dein Horoskop");
    const body = h.body || h.text || data.data.body || data.data.text || t("Keine Horoskopdaten gefunden.");
    const tip = h.tipp || data.data.tipp || t("Vertraue deinem inneren Kompass.");

    setText("horoMood", mood);
    setText("horoDate", horoscopeDateLabel(currentPeriod()));
    setText("horoBody", body);
    setText("horoTip", "✦ " + tip);
    if ($("horoAskButton")) $("horoAskButton").hidden = false;
    renderHoroscopePremium(data);
    document.body.classList.add("soraya-horoscope-ready");
  }

  async function loadHoroscope(options) {
    const silent = !!(options && options.silent);
    if (!getCurrentPersonId()) {
      const preview = readPreview();
      const sunKey = preview && preview.result && preview.result.sun && !preview.result.sun.uncertain ? preview.result.sun.sign : null;
      if (sunKey) {
        if ($("horoStartCta")) $("horoStartCta").hidden = true;
        setText("horoDate", t("Allgemein für {sign} · heute", { sign: ASTRO ? ASTRO.sign(sunKey) : (preview.result.sun.sign_de || "") }));
        setText("horoMood", t("Soraya liest die Sterne…"));
        if ($("horoBody") && !horoGuestShown) $("horoBody").innerHTML = skeleton(3);
        try {
          const json = await publicJson("/public/sign-horoscope?sign=" + encodeURIComponent(sunKey) + "&lang=" + LANG());
          const d = json.data || {};
          setText("horoMood", d.stimmung || t("Dein Tag"));
          setText("horoBody", d.text || "");
          horoGuestShown = true;
          document.body.classList.remove("soraya-horo-empty");
          if ($("horoGastCta")) $("horoGastCta").hidden = false;
          // Ritual und Affirmation wechseln auch ohne Konto taeglich
          setText("horoRitualTitle", t("Dein Ritual"));
          setText("horoRitualText", t(ofTheDay(DAILY_RITUALS)));
          setText("horoAffirmation", t("„{text}“", { text: t(ofTheDay(DAILY_AFFIRMATIONS)) }));
          setText("horoTip", d.tipp ? "✦ " + d.tipp : "");
          if (d.liebe) setText("horoLoveText", d.liebe);
          if (d.beruf) setText("horoWorkText", d.beruf);
        } catch (error) {
          setText("horoMood", t("Gleich verfügbar"));
          if (!horoGuestShown) setText("horoBody", t("Das Tageshoroskop ist gerade kurz nicht erreichbar. Versuch es in einem Moment noch einmal."));
        }
        return;
      }
      if (!silent) needPerson();
      else {
        // Eingeloggt ohne Profil: direkt ins Profil statt zum Schnellstart
        const member = !document.body.classList.contains("soraya-logged-out");
        setText("horoMood", t("Dein Horoskop wartet"));
        setText("horoBody", member
          ? t("Speichere deine Geburtsdaten im Profil – dann schreibt Soraya jeden Tag dein persönliches Horoskop.")
          : t("Gib auf der Startseite dein Geburtsdatum ein – dann zeigt Soraya dir sofort dein Horoskop für heute."));
        setText("horoTip", "");
        const startBtn = $("horoStartCta") && $("horoStartCta").querySelector("button");
        if (startBtn) {
          startBtn.textContent = member ? t("Profil anlegen") : t("Geburtsdatum eingeben");
          startBtn.onclick = member ? () => showSection("profile") : () => window.sorayaGoToQuickStart();
        }
        if ($("horoStartCta")) $("horoStartCta").hidden = false;
        document.body.classList.add("soraya-horo-empty");
      }
      return;
    }
    document.body.classList.remove("soraya-horo-empty");
    const period = currentPeriod();
    const cached = horoscopeCache[period] && horoscopeCache[period].key === horoscopeKey(period);
    const retry = $("horoReloadButton");
    if (retry) retry.style.display = "none";

    try {
      if (!cached) {
        setText("horoMood", t("Soraya liest die Sterne…"));
        if ($("horoBody")) $("horoBody").innerHTML = skeleton(4) + '<small class="sk-note"></small>';
        const note = $("horoBody") && $("horoBody").querySelector(".sk-note");
        if (note) note.textContent = (t({ daily: "Dein Tageshoroskop wird geschrieben. Beim ersten Mal dauert das einige Sekunden.", weekly: "Dein Wochenhoroskop wird geschrieben. Beim ersten Mal dauert das einige Sekunden.", monthly: "Dein Monatshoroskop wird geschrieben. Beim ersten Mal dauert das einige Sekunden." }[period] || "Dein Tageshoroskop wird geschrieben. Beim ersten Mal dauert das einige Sekunden."));
        setText("horoTip", "");
        document.body.classList.add("soraya-horoscope-loading");
      }

      const data = await fetchHoroscope(period);
      if (period !== currentPeriod()) return; // inzwischen anderer Tab gewaehlt
      renderHoroscope(data);
      if (!cached) track("horoscope_loaded", { period, source: data.data.source || "" });
    } catch (error) {
      const msg = friendlyError(error, t("Horoskop konnte nicht geladen werden."));
      trackError("horoscope", error);
      setText("horoMood", t("Gerade nicht erreichbar"));
      setText("horoBody", msg);
      if (retry) retry.style.display = "";
      if (!silent) toast(msg);
    } finally {
      document.body.classList.remove("soraya-horoscope-loading");
    }
  }

  // Taegliche Gewohnheit: Tage in Folge zaehlen (nur auf diesem Geraet) und auf morgen hinweisen
  function localDayKey(d = new Date()) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function renderStreak() {
    const box = $("dailyStreak");
    if (!box) return;
    if (!getCurrentPersonId()) { box.hidden = true; return; }
    const today = localDayKey();
    const yesterday = localDayKey(new Date(Date.now() - 86400000));
    let st = readJson(KEYS.streak, null);
    if (!st || !st.last) st = { last: today, n: 1 };
    else if (st.last !== today) st = { last: today, n: st.last === yesterday ? (Number(st.n) || 1) + 1 : 1 };
    try { writeJson(KEYS.streak, st); } catch (error) {}
    box.textContent = st.n >= 2
      ? t("✦ {n} Tage in Folge bei Soraya – morgen wartet dein nächster Impuls.", { n: st.n })
      : t("✦ Morgen wartet ein neuer Impuls für dich – schau einfach wieder vorbei.");
    box.hidden = false;
  }

  // Startseite: "Dein Tag" aus dem eigenen Tageshoroskop (statt Zufallsspruch).
  async function loadDailyFocus() {
    renderStreak();
    setText("todayDate", longDate(new Date()));
    if (!getCurrentPersonId()) return;
    try {
      const data = await fetchHoroscope("daily");
      const h = data.data && data.data.horoscope ? data.data.horoscope : {};
      const mood = h.stimmung || data.data.stimmung;
      const tip = h.tipp || data.data.tipp;
      if (!mood || !tip) return;
      const title = $("dailyFocusTitle");
      if (title) title.dataset.personal = "1";
      setText("dailyFocusTitle", mood);
      setText("dailyFocusText", tip);
      setText("dailyFocusBadge", t("Dein Tag"));
      const card = $("dailyFocusCard");
      if (card) card.classList.add("is-personal");
    } catch (error) {}
  }

  function appendBubble(role, text) {
    const windowNode = $("chatWindow");
    if (!windowNode) return;

    const bubble = document.createElement("div");
    bubble.className = "bubble " + (role === "user" ? "user" : "assistant");
    // Soraya antwortet mit **fett** und Absaetzen -> lesbar darstellen statt Sternchen
    if (role === "user") bubble.textContent = text;
    else bubble.innerHTML = markdownToHtml(text);

    windowNode.appendChild(bubble);
    // Lange Antwort: am Anfang der Antwort beginnen statt am Ende
    if (role !== "user" && bubble.offsetHeight > windowNode.clientHeight * 0.6) {
      windowNode.scrollTop = bubble.offsetTop - windowNode.offsetTop - 8;
    } else {
      windowNode.scrollTop = windowNode.scrollHeight;
    }
    return bubble;
  }

  const CHAT_GREETING = t("Hallo, ich bin Soraya ✨ Was möchtest du heute verstehen?");
  let chatHistoryLoadedFor = null;

  // "Neues Gespraech": Ansicht leeren UND eine neue Unterhaltung beginnen
  // (vorher lief die alte serverseitig weiter, obwohl der Chat leer aussah).
  function clearChatView() {
    const windowNode = $("chatWindow");
    if (windowNode) windowNode.innerHTML = '<div class="bubble assistant greet">' + escapeHtml(CHAT_GREETING) + "</div>";
    if ($("conversationId")) $("conversationId").value = "";
    try { localStorage.removeItem(KEYS.conv); } catch (error) {}
    chatHistoryLoadedFor = "";
    renderChatSuggestions(false);
  }

  // Bisherigen Verlauf nach einem Neustart wieder anzeigen.
  async function loadChatHistory() {
    const conversationId = ($("conversationId") && $("conversationId").value.trim()) || "";
    if (!conversationId || chatHistoryLoadedFor === conversationId || chatBusy) return;
    chatHistoryLoadedFor = conversationId;
    try {
      const data = await callSoraya("/mobile/chat/history?conversation_id=" + encodeURIComponent(conversationId) + "&limit=30", null, "GET", 15000);
      const messages = data.data && Array.isArray(data.data.messages) ? data.data.messages : [];
      const windowNode = $("chatWindow");
      if (!messages.length || !windowNode || chatBusy) return;
      windowNode.innerHTML = '<div class="bubble assistant greet">' + escapeHtml(CHAT_GREETING) + "</div>";
      messages.forEach((m) => appendBubble(m.role === "user" ? "user" : "assistant", m.content));
      renderChatSuggestions(true);
    } catch (error) {
      chatHistoryLoadedFor = null;
    }
  }

  function needsSafetyNote(message) {
    return /(wohnung|haus|kaufen|kredit|vertrag|steuer|invest|aktie|crypto|bitcoin|gesund|krank|arzt|medizin|anwalt)/i.test(message || "");
  }

  function quickChat(message) {
    const input = $("chatMessage");
    if (input) {
      input.value = t(message);
      input.focus();
    }
    showSection("chat");
    if (chatBusy) return;
    window.setTimeout(() => sendChat(), 90);
  }

  function showTyping() {
    const windowNode = $("chatWindow");
    if (!windowNode) return null;
    const bubble = document.createElement("div");
    bubble.className = "bubble assistant typing";
    bubble.setAttribute("aria-label", t("Soraya schreibt"));
    bubble.innerHTML = "<i></i><i></i><i></i>";
    windowNode.appendChild(bubble);
    windowNode.scrollTop = windowNode.scrollHeight;
    return bubble;
  }

  function setChatBusy(busy) {
    chatBusy = busy;
    const button = $("chatSendButton");
    if (button) button.disabled = busy;
  }

  // Vorschlagsfragen: persoenlich (gespeicherte Personen, Mond heute) und
  // nach einer Antwort eine Vertiefung.
  function renderChatSuggestions(afterReply = false) {
    const box = $("chatSuggestions");
    if (!box) return;
    const selfId = getCurrentPersonId();
    const others = (serverPeople || []).filter((p) => p && p.id && p.id !== selfId && !p.is_self);
    const list = [];
    if (afterReply) list.push(t("Erzähl mir mehr dazu."));
    others.slice(0, 2).forEach((p) => list.push(t("Wie passe ich zu {name}?", { name: p.name })));
    if (skyToday && skyToday.moon && (skyToday.moon.sign || skyToday.moon.sign_de)) list.push(t("Was bedeutet der Mond in {sign} heute für mich?", { sign: ASTRO ? ASTRO.sign(skyToday.moon.sign || skyToday.moon.sign_de) : skyToday.moon.sign_de }));
    list.push(t("Worauf soll ich diese Woche achten?"));
    if (!afterReply) list.push(t("Welche Energie begleitet mich heute in Liebe und Beziehungen?"));
    list.push(t("Welche Stärke aus meinem Geburtshoroskop unterschätze ich?"));

    box.innerHTML = "";
    list.slice(0, afterReply ? 3 : 4).forEach((text) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.addEventListener("click", () => quickChat(text));
      box.appendChild(button);
    });
  }

  async function sendChat() {
    if (!needPerson()) return;
    if (chatBusy) return;

    const field = $("chatMessage");
    const message = field ? field.value.trim() : "";
    if (!message) {
      toast(t("Bitte zuerst eine Nachricht schreiben."));
      return;
    }
    if (message.length > 2000) {
      toast(t("Deine Nachricht ist zu lang (maximal 2000 Zeichen)."));
      return;
    }

    appendBubble("user", message);
    if (field) field.value = "";
    setChatBusy(true);
    const suggestions = $("chatSuggestions");
    if (suggestions) suggestions.innerHTML = "";
    const typing = showTyping();

    try {
      // Gespeicherte Personen mitschicken, damit Soraya z. B. "Wie passe ich
      // zu Sarah?" beantworten kann. Nur IDs aus der aktuellen Server-Liste.
      if (!serverPeople) await loadPeopleFromSupabase(false);
      const selfId = getCurrentPersonId();
      const peopleIds = (serverPeople || [])
        .filter((p) => p && p.id && p.id !== selfId && !p.is_self)
        .map((p) => p.id)
        .slice(0, 10);

      const data = await callSoraya("/mobile/chat/save", {
        person_id: selfId,
        message,
        conversation_id: ($("conversationId") && $("conversationId").value.trim()) || null,
        memory: null,
        people_ids: peopleIds,
        lang: LANG()
      });

      if ($("conversationId")) $("conversationId").value = data.data.conversation_id || "";
      if (data.data.conversation_id) {
        localStorage.setItem(KEYS.conv, data.data.conversation_id);
        chatHistoryLoadedFor = data.data.conversation_id;
      }

      let reply = data.data.reply || t("Keine Antwort.");
      if (needsSafetyNote(message)) {
        reply += "\n\n" + t("Hinweis: Soraya ersetzt keine professionelle Finanz-, Rechts- oder Gesundheitsberatung.");
      }

      if (typing) typing.remove();
      const answer = appendBubble("assistant", reply);
      // Lange Antwort: dort beginnen, wo sie anfaengt (nicht am Ende)
      if (answer && answer.offsetHeight > window.innerHeight * 0.45) {
        try { answer.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (error) {}
      }
      renderChatSuggestions(true);
      track("chat_sent", { people: peopleIds.length });
    } catch (error) {
      if (typing) typing.remove();
      trackError("chat", error);
      // Fehlermeldung ist keine Antwort von Soraya -> kein "melden"-Link (c73)
      const failed = appendBubble("assistant", friendlyError(error, t("Chat konnte nicht geladen werden.")));
      if (failed) failed.classList.add("is-error");
      renderChatSuggestions(false);
    } finally {
      setChatBusy(false);
    }
  }

  function readPeopleCache() {
    const rows = readJson(KEYS.people, []);
    return Array.isArray(rows) ? rows : [];
  }

  function writePeopleCache(rows) {
    const seen = new Set();
    const clean = [];

    rows.forEach((row) => {
      if (!row || !row.id || seen.has(row.id)) return;
      seen.add(row.id);
      clean.push(row);
    });

    writeJson(KEYS.people, clean);
  }

  function addPersonToCache(row, fallback = {}) {
    const rows = readPeopleCache();
    const merged = {
      id: row.id || fallback.id,
      name: row.name || fallback.name || t("Unbenannt"),
      is_self: row.is_self !== undefined ? row.is_self : !!fallback.is_self,
      relation: row.relation || fallback.relation || null,
      birth_date: row.birth_date || fallback.birth_date || null,
      birthplace: row.birthplace || fallback.birthplace || null,
      created_at: row.created_at || fallback.created_at || null
    };

    writePeopleCache([merged, ...rows.filter((item) => item.id !== merged.id)]);
  }

  function cacheSelfFromStorage() {
    const id = getCurrentPersonId();
    if (!id) return;

    const birth = readJson(KEYS.birth, null);
    addPersonToCache({
      id,
      name: localStorage.getItem(KEYS.name) || (birth && birth.name) || t("Ich"),
      is_self: true,
      relation: "self",
      birthplace: birth && birth.birthplace
    });
  }

  // Nach Login: Geburtsdaten aus dem Server-Profil in localStorage spiegeln,
  // damit das Birth-Chart auch auf einem frisch eingeloggten Gerät lädt.
  function hydrateBirthFromPeople(people) {
    try {
      const existing = readJson(KEYS.birth, null);

      // Nur echte Self-Profile, neueste zuerst. Ohne eigenes Profil NICHT auf
      // eine andere gespeicherte Person (z. B. Partner) ausweichen.
      const selfCandidates = (Array.isArray(people) ? people : [])
        .filter((p) => p && (p.is_self === true || String(p.relation || "").toLowerCase() === "self"))
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      const self = selfCandidates[0] || null;
      if (!self || !self.birth_date) return;

      // Server ist die Wahrheit: lokale Self-ID setzen bzw. korrigieren
      // (auch eine frueher faelschlich uebernommene Partner-ID)
      if (self.id) {
        if (localStorage.getItem(KEYS.person) !== self.id) localStorage.setItem(KEYS.person, self.id);
        var personIdField = $("personId");
        if (personIdField && personIdField.value !== self.id) personIdField.value = self.id;
      }

      const parts = String(self.birth_date).split("-");
      if (parts.length < 3) return;
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);
      if (!year || !month || !day) return;

      let hour = null;
      let minute = null;
      if (self.birth_time && /^\d{1,2}:\d{2}/.test(self.birth_time)) {
        const t = self.birth_time.split(":");
        hour = Number(t[0]);
        minute = Number(t[1]);
      }

      const fresh = {
        name: self.name || localStorage.getItem(KEYS.name) || t("Ich"),
        year, month, day, hour, minute,
        birthplace: self.birthplace || ""
      };

      // Server ist IMMER die Wahrheit. Typ-sicherer Vergleich (Zahlen/Strings/null),
      // damit Geräte-Abgleich zuverlässig erkennt, ob sich etwas geändert hat.
      const norm = (v) => (v === null || v === undefined || v === "") ? "" : String(v);
      const same = existing &&
        norm(existing.year) === norm(fresh.year) &&
        norm(existing.month) === norm(fresh.month) &&
        norm(existing.day) === norm(fresh.day) &&
        norm(existing.hour) === norm(fresh.hour) &&
        norm(existing.minute) === norm(fresh.minute) &&
        norm(existing.birthplace) === norm(fresh.birthplace) &&
        norm(existing.name) === norm(fresh.name);

      // Serverdaten immer lokal übernehmen (auch wenn "gleich" – schadet nicht,
      // stellt aber sicher, dass alte/kaputte lokale Werte ersetzt werden).
      writeJson(KEYS.birth, fresh);
      if (self.name) localStorage.setItem(KEYS.name, self.name);

      if (!same) {
        // Anzeige komplett & sofort aktualisieren
        try { if (typeof renderIdentity === "function") renderIdentity(true); } catch (e) {}
        try { if (typeof renderMoon === "function") renderMoon(); } catch (e) {}
        try { if (typeof renderProfilePreview === "function") renderProfilePreview(); } catch (e) {}
        try { if (typeof renderHomeSkyThrottled === "function") renderHomeSkyThrottled(true); } catch (e) {}
        try {
          const an = $("analysis");
          if (an && an.classList.contains("active") && typeof loadRealChartData === "function") {
            loadRealChartData(false);
          }
        } catch (e) {}
      }
    } catch (e) { /* still: Chart zeigt dann den Profil-Hinweis */ }
  }

  async function loadPeopleFromSupabase(showToast = true) {
    try {
      const data = await callSoraya("/mobile/people/list", null, "GET");
      const people = data.data && Array.isArray(data.data.people) ? data.data.people : [];
      serverPeople = people;

      people.forEach((person) => addPersonToCache(person));
      const hadBirth = !!readJson(KEYS.birth, null);
      const hadPerson = !!getCurrentPersonId();
      hydrateBirthFromPeople(people);
      const hasBirthNow = !!readJson(KEYS.birth, null);
      const hasPersonNow = !!getCurrentPersonId();
      cacheSelfFromStorage();
      refreshSynastryPeople();
      renderChatSuggestions(false);
      renderHomePeople();
      // Auf einem frischen Geraet kommen Name/Geburtsdaten erst jetzt vom Server:
      // "Erste Schritte", "Profil noetig" und der Hinweis oben duerfen nicht
      // auf dem alten Stand (kein Profil) stehen bleiben.
      if (!hadBirth && hasBirthNow) {
        renderIdentity();
        renderProfilePreview();
      }
      renderOnboardingState();
      renderAppStatus();
      setEngineReachable(true);

      // Wenn gerade erst Geburtsdaten/Person reingespiegelt wurden und die
      // Analyse offen ist, Chart automatisch nachladen (sonst bleibt der Hinweis).
      const newlyReady = (!hadBirth && hasBirthNow) || (!hadPerson && hasPersonNow);
      if (newlyReady) {
        const analysis = $("analysis");
        if (analysis && analysis.classList.contains("active") && typeof loadRealChartData === "function") {
          loadRealChartData(false);
        }
      }

      if (showToast) toast(t("Personen geladen."));
      return people;
    } catch (error) {
      cacheSelfFromStorage();
      refreshSynastryPeople();
      renderHomePeople();
      if (isNetworkError(error) || (error && error.code === "server")) setEngineReachable(false);
      if (showToast) toast(t("Personen konnten nicht geladen werden."));
      return readPeopleCache();
    }
  }

  const RELATION_LABELS = { partner: t("Partner/in"), friend: t("Freund/in"), family: t("Familie"), other: t("Person") };

  function renderHomePeople() {
    const box = $("homePeopleList");
    if (!box) return;
    const selfId = getCurrentPersonId();
    const people = (serverPeople || readPeopleCache())
      .filter((p) => p && p.id && p.id !== selfId && !p.is_self && String(p.relation || "").toLowerCase() !== "self");
    if (!people.length) {
      box.innerHTML = '<p class="people-empty" data-more="1">' + escapeHtml(t("Lege eine Person an – Partner, Freundin, Familie – und Soraya zeigt euch, wie ihr zusammenpasst.")) + '</p>';
      return;
    }
    box.innerHTML = people.slice(0, 6).map((p) =>
      '<div class="people-row">' +
        '<span class="people-avatar">' + escapeHtml(initials(p.name, "?")) + "</span>" +
        '<div class="people-info"><b>' + escapeHtml(p.name || t("Unbenannt")) + "</b><small>" + escapeHtml(RELATION_LABELS[p.relation] || t("Person")) + "</small></div>" +
        '<button type="button" class="text-link people-compare" data-person="' + escapeHtml(p.id) + '">' + escapeHtml(t("Vergleichen ›")) + '</button>' +
      "</div>"
    ).join("");
  }

  function openSynastryWith(personId) {
    showSection("synastry");
    window.setTimeout(() => {
      const select = $("synPersonSelect");
      if (!select) return;
      refreshSynastryPeople();
      select.value = personId;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }, 150);
  }

  function addPerson() {
    showSection("synastry");
    window.setTimeout(() => {
      const card = $("synastryPersonCreateCard");
      if (card && card.tagName === "DETAILS") card.open = true;
      const field = $("partnerName");
      if (!field) return;
      field.scrollIntoView({ behavior: "smooth", block: "center" });
      field.focus({ preventScroll: true });
    }, 250);
  }

  function refreshSynastryPeople() {
    const select = $("synPersonSelect");
    if (!select) return;

    const selfId = getCurrentPersonId();
    const people = readPeopleCache().filter((person) => person && person.id && person.id !== selfId);
    const current = select.value;

    select.innerHTML = "";

    const first = document.createElement("option");
    first.value = "";
    first.textContent = people.length ? t("Person wählen…") : t("Noch keine zweite Person gespeichert");
    select.appendChild(first);

    people.forEach((person) => {
      const option = document.createElement("option");
      option.value = person.id;
      option.textContent = (person.name || t("Unbenannt")) + (person.relation ? " · " + (RELATION_LABELS[person.relation] || person.relation) : "");
      select.appendChild(option);
    });

    if (current && people.some((person) => person.id === current)) {
      select.value = current;
    } else if (people.length === 1) {
      select.value = people[0].id;
    }

    const raw = $("personBId");
    if (raw) raw.value = select.value || "";
    // Noch niemand gespeichert: der Hauptknopf fuehrt direkt zum Anlegen
    const calc = $("synCalcButton");
    if (calc) calc.textContent = people.length ? t("Verbindung berechnen") : t("Zweite Person anlegen");
    // Formular "Zweite Person anlegen" nur offen, solange noch niemand gespeichert ist
    const createCard = $("synastryPersonCreateCard");
    if (createCard && createCard.tagName === "DETAILS" && !createCard.dataset.userToggled) createCard.open = !people.length;
    const createStatus = $("partnerCreateStatus");
    if (createStatus && !createStatus.classList.contains("ok") && !createStatus.classList.contains("bad")) {
      createStatus.textContent = people.length
        ? t("Gespeichert: {names}", { names: people.map((person) => person.name || t("Unbenannt")).join(", ") })
        : t("Noch keine zweite Person gespeichert.");
    }
    updateSynastryNames();
  }

  async function createSynastryPerson() {
    try {
      const person = {
        name: ($("partnerName") && $("partnerName").value.trim()) || "",
        year: requiredNumber("partnerYear", t("Jahr")),
        month: requiredNumber("partnerMonth", t("Monat")),
        day: requiredNumber("partnerDay", t("Tag")),
        hour: numOrNull("partnerHour"),
        minute: numOrNull("partnerMinute"),
        birthplace: ($("partnerBirthplace") && $("partnerBirthplace").value.trim()) || ""
      };

      const relation = ($("partnerRelation") && $("partnerRelation").value) || "partner";

      if (!person.name) throw new Error(t("Name fehlt."));
      if (!person.birthplace) throw new Error(t("Geburtsort fehlt."));

      showLoadingVeil(t("Zweite Person wird gespeichert…"));
      const data = await callSoraya("/mobile/people/create", {
        is_self: false,
        relation,
        person
      });

      const row = data.data && data.data.person;
      if (!row || !row.id) throw new Error(t("Person wurde gespeichert, aber keine ID erhalten."));

      addPersonToCache(row, { ...person, relation, is_self: false });
      if (Array.isArray(serverPeople)) serverPeople = [...serverPeople.filter((p) => p.id !== row.id), { ...row, relation, is_self: false }];
      refreshSynastryPeople();
      renderHomePeople();
      renderChatSuggestions(false);

      const select = $("synPersonSelect");
      if (select) select.value = row.id;
      if ($("personBId")) $("personBId").value = row.id;
      updateSynastryNames();

      status("partnerCreateStatus", t("◈ Zweite Person gespeichert.\nName: {name}", { name: row.name || person.name }), "ok");
      toast(t("Zweite Person gespeichert."));
    } catch (error) {
      const msg = friendlyError(error, t("Person konnte nicht gespeichert werden."));
      status("partnerCreateStatus", msg, "bad");
      toast(msg);
    } finally {
      hideLoadingVeil();
    }
  }

  // Ergebnis als eigene Karte (Titel, Deutung, Aspekte als Liste) statt als
  // Textblock im Statusfeld -- die Prozentzahl steht schon gross im Ring.
  function renderSynastryDescription(payload) {
    const box = $("synResult");
    if (!box) return;

    const syn = payload.synastry || {};
    const score = payload.score || syn.score || {};
    const summary = (payload.summary && typeof payload.summary === "object") ? payload.summary : (syn.summary && typeof syn.summary === "object" ? syn.summary : {});
    const aspects = payload.aspects || syn.aspects || [];

    const label = payload.label || score.label || summary.label || "Kosmische Verbindung";
    const text =
      [payload.text, summary.text, summary.short, typeof syn.summary === "string" ? syn.summary : ""].find((x) => typeof x === "string" && x.trim()) ||
      t("Eure Verbindung wurde berechnet. Achtet darauf, wo Harmonie entsteht und wo bewusste Kommunikation wichtig ist.");

    let html = '<span class="eyebrow">' + escapeHtml(t("Euer Ergebnis")) + "</span>";
    html += "<h4>" + escapeHtml(t(label)) + "</h4>";
    if (summary.harmonious != null || summary.challenging != null) {
      html += '<div class="syn-counts">' +
        "<span><b>" + escapeHtml(summary.harmonious || 0) + "</b>" + escapeHtml(t("Harmonisch")) + "</span>" +
        "<span><b>" + escapeHtml(summary.challenging || 0) + "</b>" + escapeHtml(t("Spannung")) + "</span></div>";
    }
    html += '<div class="reading syn-reading" data-i18n-skip data-more="p">' + markdownToHtml(text) + "</div>";

    if (Array.isArray(aspects) && aspects.length) {
      html += '<span class="eyebrow syn-aspects-title">' + escapeHtml(t("Wichtige Aspekte:").replace(/[:：]\s*$/, "")) + '</span><ul class="syn-aspects">';
      // Zuerst die Hauptaspekte zwischen echten Planeten (statt z. B. "MC Quintil Chiron")
      const MAJOR = ["conjunction", "opposition", "square", "trine", "sextile"];
      const CORE = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Ascendant"];
      const isMain = (a) => MAJOR.indexOf(String(a.type || "").toLowerCase()) >= 0 && CORE.indexOf(a.p1) >= 0 && CORE.indexOf(a.p2) >= 0;
      const ranked = aspects.filter((a) => a && (a.text || a.name || isMain(a))).concat(aspects.filter((a) => a && !(a.text || a.name || isMain(a))));
      ranked.slice(0, 3).forEach((aspect) => {
        const line = aspect.text || aspect.name ||
          (ASTRO ? [ASTRO.planet(aspect.p1 || aspect.p1_de), ASTRO.aspect(aspect.type || aspect.type_de), ASTRO.planet(aspect.p2 || aspect.p2_de)] : [aspect.p1_de || aspect.p1, aspect.type_de || aspect.type, aspect.p2_de || aspect.p2])
            .filter(Boolean).join(" ");
        html += "<li>" + escapeHtml(safe(line || t("Aspekt"))) + "</li>";
      });
      html += "</ul>";
    }

    box.innerHTML = html;
    box.hidden = false;
    status("synastryText", "");
  }

  // Schon einmal berechnet? Dann das gespeicherte Ergebnis gleich zeigen
  // (nur nachsehen -- startet nie eine neue, kostenpflichtige Deutung).
  let synSavedFor = "";
  async function synShowSaved() {
    const a = getCurrentPersonId();
    const b = ($("synPersonSelect") && $("synPersonSelect").value) || "";
    if (!a || !b || a === b || synRunning || synJob()) return;
    const key = a + "|" + b + "|" + LANG();
    if (synSavedFor === key && SYN_TEILEN) return;
    synSavedFor = key;
    try {
      const res = await callSoraya("/mobile/synastry/start", { person_a_id: a, person_b_id: b, lang: LANG(), nur_gespeichert: true }, "POST", 15000);
      const d = res.data || {};
      const still = ($("synPersonSelect") && $("synPersonSelect").value) === b;
      if (d.status === "fertig" && d.ergebnis && still && !synRunning) zeigeSynastrie({ data: d.ergebnis });
    } catch (error) {
      synSavedFor = "";
    }
  }

  function resetSynastryResult() {
    setText("compatScore", "–");
    if ($("compatRing")) $("compatRing").style.setProperty("--score", "0%");
    if ($("synResult")) $("synResult").hidden = true;
    if ($("synTeilen")) $("synTeilen").hidden = true;
    status("synastryText", "");
    SYN_TEILEN = null;
  }

  // Zahl sanft hochzaehlen (Ringe); ohne Animation, wenn der Nutzer das so eingestellt hat
  function countUp(node, to, suffix) {
    if (!node) return;
    const end = Math.round(Number(to) || 0);
    const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still || end <= 0) { node.textContent = end + suffix; return; }
    const startAt = performance.now(), ms = 900;
    const step = (now) => {
      const k = Math.min(1, (now - startAt) / ms);
      node.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))) + suffix;
      if (k < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }

  function initials(value, fallback = "?") {
    const text = safe(value).trim();
    if (!text) return fallback;
    return text
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

  function updateSynastryNames() {
    const selfName = localStorage.getItem(KEYS.name) || t("Du");
    setText("synAInitial", initials(selfName, t("Du")));
    setText("synAName", selfName);

    const select = $("synPersonSelect");
    const label = select && select.options && select.selectedIndex >= 0
      ? select.options[select.selectedIndex].textContent
      : "";
    // Nur der Name (ohne " · Partner/in"), sonst landet "·" im Kuerzel ("J·")
    const partner = label && select.value ? label.replace(/\s*\(.+\)\s*$/, "").split(" · ")[0] : t("Zweite Person");

    setText("synBInitial", initials(partner, "?"));
    setText("synBName", partner);
  }

  function renderSynastryPremium(payload) {
    updateSynastryNames();

    const root = payload && payload.data ? payload.data : payload || {};
    const text = [
      root.text,
      root.reading,
      root.analysis,
      root.message,
      root.summary,
      root.synastry_text
    ].filter(Boolean).join(" ");

    const lower = text.toLowerCase();

    const harmony = pickText(root, ["harmonie", "harmony"],
      lower.includes("harmonie") || lower.includes("trigon") || lower.includes("sextil")
        ? t("Zwischen euch gibt es Bereiche, die leicht und unterstützend fließen.")
        : t("Achte darauf, wo ihr euch ohne Druck gegenseitig stärkt."));

    const challenge = pickText(root, ["spannung", "challenge"],
      lower.includes("spannung") || lower.includes("quadrat") || lower.includes("opposition")
        ? t("Spannungen zeigen Entwicklungsfelder. Bewusste Kommunikation ist euer Schlüssel.")
        : t("Unterschiede können euch reifen lassen, wenn ihr sie bewusst anschaut."));

    const magnet = pickText(root, ["anziehung", "magnet"],
      lower.includes("venus") || lower.includes("mars") || lower.includes("mond")
        ? t("Eure Anziehung wirkt besonders über Gefühl, Nähe und persönliche Resonanz.")
        : t("Eure Verbindung kann durch ehrliche Aufmerksamkeit stärker werden."));

    const comm = pickText(root, ["kommunikation", "communication"],
      lower.includes("merkur") || lower.includes("kommunikation") || lower.includes("gespräch")
        ? t("Eure Gespräche tragen viel: Worte öffnen zwischen euch Türen, die Gesten allein nicht erreichen.")
        : t("Hört einander zu Ende zu — euer Verständnis wächst über echtes Zuhören."));

    setText("synHarmonyTitle", t("Seelische Resonanz"));
    setText("synHarmonyText", harmony);
    setText("synChallengeTitle", t("Lernfelder"));
    setText("synChallengeText", challenge);
    setText("synMagnetTitle", t("Anziehung"));
    setText("synMagnetText", magnet);
    setText("synCommTitle", t("Kommunikation"));
    setText("synCommText", comm);
  }

  // Ergebnis anzeigen (Antwort von /mobile/synastry/save bzw. "ergebnis" aus dem Hintergrund-Auftrag)
  function zeigeSynastrie(data) {
    const syn = (data.data && data.data.synastry) || {};
    const scoreObj = (data.data && data.data.score) || syn.score || {};
    // score_percent: Backend rechnet Discepolo-Punkte in Prozent um.
    // Alte Backends liefern nur Punkte -> grob umrechnen statt "29 %" zu zeigen.
    const points = syn.score_value || scoreObj.value || 0;
    const value = data.data && data.data.score_percent != null
      ? data.data.score_percent
      : Math.min(97, Math.round(35 + Number(points) * 1.9));

    countUp($("compatScore"), value, "%");
    SYN_TEILEN = { prozent: Math.round(Number(value) || 0), a: ($("synAName") || {}).textContent || t("Du"),
                   b: ($("synBName") || {}).textContent || "", label: data.data && data.data.score_label ? t(data.data.score_label) : "" };
    if ($("synTeilen")) $("synTeilen").hidden = false;
    if ($("compatRing")) $("compatRing").style.setProperty("--score", Math.min(100, Number(value) || 0) + "%");

    renderSynastryDescription({
      synastry: syn,
      percent: value,
      label: data.data && data.data.score_label,
      score: scoreObj,
      summary: data.data && data.data.summary,
      aspects: data.data && data.data.aspects,
      text: data.data && data.data.text
    });
    renderSynastryPremium(data);
  }

  // ---------------------------------------------------------------------------
  // Partner-Vergleich als Hintergrund-Auftrag (Engine v2.18) -- wie die Analyse
  // ---------------------------------------------------------------------------
  const SYN_JOB_KEY = "soraya_synastry_job";
  let synTimer = null, synTick = null, synState = null, synFails = 0, synRunning = false;

  function synPhaseText(phase) {
    return {
      chart: t("Eure Horoskope werden verglichen"),
      deutung: t("Soraya deutet eure Verbindung"),
      pruefen: t("Sprache wird geprüft"),
      speichern: t("Wird gespeichert")
    }[phase] || t("Partner-Vergleich wird berechnet…");
  }

  function synJob() {
    const job = readJson(SYN_JOB_KEY, null);
    if (!job || !job.a || !job.b || Date.now() - (job.start || 0) > 8 * 60 * 1000) return null;
    return job;
  }

  function synJobSet(job) {
    if (job) localStorage.setItem(SYN_JOB_KEY, JSON.stringify(job));
    else localStorage.removeItem(SYN_JOB_KEY);
  }

  function synButton() {
    return document.querySelector('[onclick="saveSynastry()"]');
  }

  function synRender() {
    jobRender(jobBox("synastryProgress", $("synastryText")), synState, {
      phaseText: synPhaseText,
      hint: t("Du kannst die App ruhig verlassen – das Ergebnis wartet hier auf dich."),
      fails: synFails,
      standardPhasen: ["chart", "deutung", "speichern"],
      standardSekunden: 40
    });
  }

  function synStop() {
    synRunning = false;
    window.clearTimeout(synTimer);
    window.clearInterval(synTick);
    synTimer = synTick = null;
    synState = null;
    synFails = 0;
    if ($("synastryProgress")) $("synastryProgress").hidden = true;
    if (synButton()) synButton().disabled = false;
  }

  function synBegin(state) {
    synRunning = true;
    synState = { ...state, empfangen: Date.now() };
    status("synastryText", "");
    if ($("synResult")) $("synResult").hidden = true;
    if (synButton()) synButton().disabled = true;
    synRender();
    window.clearInterval(synTick);
    synTick = window.setInterval(synRender, 1000);
  }

  function synSchedule(ms) {
    window.clearTimeout(synTimer);
    synTimer = window.setTimeout(synPoll, ms);
  }

  function synFertig(ergebnis) {
    synStop();
    synJobSet(null);
    const data = { data: ergebnis || {} };
    zeigeSynastrie(data);
    track("synastry_done", { source: (ergebnis && ergebnis.source) || "" });
    toast(t("Partner-Vergleich berechnet."));
  }

  function synFehler(msg) {
    synStop();
    synJobSet(null);
    status("synastryText", msg, "bad");
    toast(msg);
  }

  async function synPoll() {
    const job = synJob();
    if (!job) return synFehler(t("Der Partner-Vergleich wurde unterbrochen. Bitte starte ihn noch einmal."));
    try {
      const res = await callSoraya("/mobile/synastry/status?person_a_id=" + encodeURIComponent(job.a)
        + "&person_b_id=" + encodeURIComponent(job.b) + "&lang=" + encodeURIComponent(job.lang), null, "GET", 12000);
      const d = res.data || {};
      synFails = 0;
      if (d.status === "fertig" && d.ergebnis) return synFertig(d.ergebnis);
      if (d.status === "fehler") {
        trackError("synastry", new Error(d.fehler || "fehler"));
        return synFehler(t("Der Partner-Vergleich konnte nicht erstellt werden. Bitte versuche es noch einmal – dein Tageslimit wurde dafür nicht verbraucht."));
      }
      if (d.status !== "laeuft") {
        // Auftrag unbekannt (z. B. Server-Neustart): schon gespeichert?
        const nach = await callSoraya("/mobile/synastry/start", { person_a_id: job.a, person_b_id: job.b, lang: job.lang, nur_gespeichert: true }, "POST", 15000);
        const n = nach.data || {};
        if (n.status === "fertig" && n.ergebnis) return synFertig(n.ergebnis);
        return synFehler(t("Der Partner-Vergleich wurde unterbrochen. Bitte starte ihn noch einmal."));
      }
      synState = { ...d, empfangen: Date.now() };
      synRender();
      synSchedule(2500);
    } catch (error) {
      if (error && (error.code === "limit" || error.code === "auth")) return synFehler(friendlyError(error, ""));
      synFails += 1;            // Funkloch: weiter versuchen
      synRender();
      synSchedule(Math.min(10000, 3000 + synFails * 2000));
    }
  }

  function synResume() {
    const job = synJob();
    if (!job || synRunning) return false;
    synBegin({ status: "laeuft", phase: job.phase || "chart", phasen: job.phasen,
      vergangen_sekunden: Math.round((Date.now() - job.start) / 1000), erwartet_sekunden: job.erwartet });
    synSchedule(0);
    return true;
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && synRunning) { synFails = 0; synSchedule(0); }
  });

  async function saveSynastry() {
    if (!needPerson()) return;
    if (synRunning) return;

    let partnerId = "";
    try {
      partnerId = (($("synPersonSelect") && $("synPersonSelect").value) || "") || (($("personBId") && $("personBId").value.trim()) || "");
      if (!partnerId && !readPeopleCache().some((p) => p && p.id && p.id !== getCurrentPersonId())) return addPerson();
      if (!partnerId) throw new Error(t("Bitte zuerst eine zweite Person auswählen oder anlegen."));
      if (partnerId === getCurrentPersonId()) throw new Error(t("Bitte eine andere Person auswählen."));
    } catch (error) {
      const msg = friendlyError(error, t("Der Partner-Vergleich konnte nicht berechnet werden."));
      status("synastryText", msg, "bad");
      return toast(msg);
    }

    const lang = LANG();
    const job = { a: getCurrentPersonId(), b: partnerId, lang, start: Date.now(), erwartet: lang === "de" ? 30 : 45 };
    synJobSet(job);   // vor dem Start merken: reisst die Verbindung, findet die App den Auftrag wieder
    synBegin({ status: "laeuft", phase: "chart", vergangen_sekunden: 0, erwartet_sekunden: job.erwartet });
    try {
      const res = await callSoraya("/mobile/synastry/start", { person_a_id: job.a, person_b_id: job.b, lang }, "POST", 20000);
      const d = res.data || {};
      if (d.status === "fertig") return synFertig(d.ergebnis);
      synJobSet({ ...job, erwartet: d.erwartet_sekunden || job.erwartet, phasen: d.phasen });
      synState = { ...d, empfangen: Date.now() };
      synRender();
      synSchedule(2500);
    } catch (error) {
      if (isNetworkError(error)) {
        synFails = 2;                      // vielleicht kam der Start trotzdem an -> nachsehen
        synRender();
        return synSchedule(4000);
      }
      trackError("synastry", error);
      synFehler(friendlyError(error, t("Der Partner-Vergleich konnte nicht berechnet werden.")));
    }
  }

  const ZODIAC = [
    { s: "Steinbock", g: "♑", el: "Erde", q: "Kardinal", r: "Saturn", from: [12, 22], to: [1, 19] },
    { s: "Wassermann", g: "♒", el: "Luft", q: "Fix", r: "Uranus & Saturn", from: [1, 20], to: [2, 18] },
    { s: "Fische", g: "♓", el: "Wasser", q: "Veränderlich", r: "Neptun & Jupiter", from: [2, 19], to: [3, 20] },
    { s: "Widder", g: "♈", el: "Feuer", q: "Kardinal", r: "Mars", from: [3, 21], to: [4, 19] },
    { s: "Stier", g: "♉", el: "Erde", q: "Fix", r: "Venus", from: [4, 20], to: [5, 20] },
    { s: "Zwillinge", g: "♊", el: "Luft", q: "Veränderlich", r: "Merkur", from: [5, 21], to: [6, 20] },
    { s: "Krebs", g: "♋", el: "Wasser", q: "Kardinal", r: "Mond", from: [6, 21], to: [7, 22] },
    { s: "Löwe", g: "♌", el: "Feuer", q: "Fix", r: "Sonne", from: [7, 23], to: [8, 22] },
    { s: "Jungfrau", g: "♍", el: "Erde", q: "Veränderlich", r: "Merkur", from: [8, 23], to: [9, 22] },
    { s: "Waage", g: "♎", el: "Luft", q: "Kardinal", r: "Venus", from: [9, 23], to: [10, 22] },
    { s: "Skorpion", g: "♏", el: "Wasser", q: "Fix", r: "Pluto & Mars", from: [10, 23], to: [11, 21] },
    { s: "Schütze", g: "♐", el: "Feuer", q: "Veränderlich", r: "Jupiter", from: [11, 22], to: [12, 21] }
  ];

  // Tag und Monat in der App-Sprache ("21. März", "21 Mar", "márc. 21.")
  function dayMonthShort(day, month) {
    const d = new Date(2000, month - 1, day);
    return I18N ? I18N.formatDate(d, { day: "numeric", month: "short" }) : day + "." + month + ".";
  }

  const trSign = (value) => (ASTRO ? ASTRO.sign(value) : value);
  const trPlanet = (value) => (ASTRO ? ASTRO.planet(value) : value);

  function signFor(day, month) {
    return ZODIAC.find((z) => {
      const [fromMonth, fromDay] = z.from;
      const [toMonth, toDay] = z.to;
      return (month === fromMonth && day >= fromDay) || (month === toMonth && day <= toDay);
    }) || null;
  }

  // Sonne/Mond/Aszendent aus dem gespeicherten Chart fuer die Startseite.
  let coreLine = "";

  function renderCoreFromChart(json) {
    const data = json && (json.data || json);
    const big = data && data.big_three;
    if (!big || !big.sun) return;
    const timeKnown = !(data.meta && data.meta.time_known === false);
    const sun = signName(big.sun);
    const moon = big.moon ? signName(big.moon) : "–";
    const asc = big.ascendant && timeKnown ? signName(big.ascendant) : null;
    TRIO = { sun: big.sun, moon: big.moon || null, asc: asc ? big.ascendant : null };
    setText("statSun", sun);
    setText("statMoon", moon);
    setText("statAsc", asc || t("offen"));
    if ($("trioTeilen")) $("trioTeilen").hidden = false;
    coreLine = t("Mond in {sign}", { sign: moon }) + " · " + (asc ? t("Aszendent {sign}", { sign: asc }) : t("Aszendent: Geburtszeit fehlt"));
    setText("sunRange", coreLine);
    const ribbon = $("heroRibbon");
    if (ribbon) {
      ribbon.innerHTML = [["☉", sun], ["☾", moon], asc ? [t("AC"), asc] : null]
        .filter(Boolean)
        .map(([glyph, sign]) => "<span><b>" + escapeHtml(glyph) + "</b> " + escapeHtml(sign) + "</span>")
        .join("");
      ribbon.classList.add("is-personal");
    }
  }

  async function ensureCoreChart() {
    const personId = getCurrentPersonId();
    const birth = readJson(KEYS.birth, null);
    if (!personId || !birth || !birth.day) return;
    try {
      if (!(chartCache.personId === personId && chartCache.json)) {
        const json = await loadChartJson(personId, birth);
        chartCache = { personId, json };
      }
      renderCoreFromChart(chartCache.json);
    } catch (error) {}
  }

  function renderSun(day, month) {
    const sign = signFor(day, month);
    if (!sign) return;

    setText("sunGlyph", sign.g);
    setText("sunSign", trSign(sign.s));
    setText("sunRange", coreLine || dayMonthShort(sign.from[1], sign.from[0]) + " – " + dayMonthShort(sign.to[1], sign.to[0]));
    setText("sunElement", t(sign.el));
    setText("sunQuality", t(sign.q));
    setText("sunRuler", sign.r.split(" & ").map(trPlanet).join(" & "));
    if ($("sunProps")) $("sunProps").style.display = "grid";
    setText("profileSub", t("Sonnenzeichen · {sign}", { sign: trSign(sign.s) }));
  }

  function renderGreeting() {
    const hour = new Date().getHours();
    const greeting = hour < 11 ? t("Guten Morgen") : hour < 18 ? t("Schön, dass du da bist") : t("Guten Abend");
    const name = (localStorage.getItem(KEYS.name) || "").trim();
    const line = $("greetLine");
    if (!line) return;
    // Ohne Namen keine Platzhalter-Anrede ("Guten Morgen, du.") -- in anderen
    // Sprachen klang das schief ("Jó reggelt, kedves.", "Good morning, friend.").
    line.innerHTML = name
      ? escapeHtml(greeting) + ',<br><span class="gold" id="heroName">' + escapeHtml(name) + "</span>."
      : escapeHtml(t("{greeting}.", { greeting })) + '<br><span class="gold" id="heroName">' + escapeHtml(t("Willkommen bei Soraya.")) + "</span>";
  }

  function renderMoon() {
    if (skyToday && skyToday.moon) { applySkyMoon(); return; }
    const synodic = 29.530588853;
    const reference = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
    const now = Date.now() / 86400000;
    const age = ((now - reference) % synodic + synodic) % synodic;
    const illum = Math.round(((1 - Math.cos((2 * Math.PI * age) / synodic)) / 2) * 100);

    const bounds = [1.85, 5.5, 9.2, 12.9, 16.6, 20.3, 23.99];
    let index = bounds.findIndex((limit) => age < limit);
    if (index < 0) index = 7;
    const label = ASTRO ? ASTRO.moonPhase(index) : ["Neumond", "Zunehmende Sichel", "Erstes Viertel", "Zunehmender Mond", "Vollmond", "Abnehmender Mond", "Letztes Viertel", "Abnehmende Sichel"][index];

    setText("moonPhase", label);
    setText("moonIllum", t("{value} % beleuchtet", { value: illum }));
    if ($("moonVisual")) $("moonVisual").innerHTML = moonSvg((age / synodic) * 360);
  }

  // Mond als SVG: echtes Mondbild (brand/mond.webp, gleicher Mond wie in den Posts). Der beleuchtete Teil
  // (Halbkreis auf der Lichtseite plus elliptische Schattengrenze) zeigt das Bild hell, der Rest bleibt im
  // Erdschein sichtbar. elong = Winkel Mond-Sonne (0 Neu, 180 Voll).
  function moonSvg(elong) {
    const r = 46, c = 48;
    const e = ((elong % 360) + 360) % 360;
    const rx = Math.abs(Math.cos((e * Math.PI) / 180)) * r;
    const waxing = e < 180;
    const crescent = waxing ? e < 90 : e > 270;
    // Lichtseite: zunehmend rechts, abnehmend links (Nordhalbkugel)
    const limb = waxing
      ? `M ${c} ${c - r} A ${r} ${r} 0 0 1 ${c} ${c + r}`
      : `M ${c} ${c - r} A ${r} ${r} 0 0 0 ${c} ${c + r}`;
    const term = `A ${rx.toFixed(2)} ${r} 0 0 ${waxing ? (crescent ? 0 : 1) : (crescent ? 1 : 0)} ${c} ${c - r}`;
    const voll = e > 178 && e < 182;
    const lit = e < 1 || e > 359 ? "" : voll
      ? `<image href="/brand/mond.webp" x="${c - r}" y="${c - r}" width="${2 * r}" height="${2 * r}"/>`
      : `<image href="/brand/mond.webp" x="${c - r}" y="${c - r}" width="${2 * r}" height="${2 * r}" clip-path="url(#moonLitClip)"/>`;
    return `<svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true" class="moon-echt">
      <defs>
        <clipPath id="moonLitClip"><path d="${limb} ${term} Z"/></clipPath>
        <radialGradient id="moonShade" cx="50%" cy="50%" r="50%"><stop offset=".78" stop-color="#0b0716" stop-opacity=".78"/><stop offset="1" stop-color="#0b0716" stop-opacity=".9"/></radialGradient>
      </defs>
      <image href="/brand/mond.webp" x="${c - r}" y="${c - r}" width="${2 * r}" height="${2 * r}" opacity=".55"/>
      <circle cx="${c}" cy="${c}" r="${r}" fill="url(#moonShade)"/>
      ${lit}
    </svg>`;
  }

  function renderIdentity(force) {
    const savedName = localStorage.getItem(KEYS.name) || "";
    const birth = readJson(KEYS.birth, null);

    setText("profileTitle", savedName || t("Dein Profil"));
    setText("profileInitial", savedName ? savedName[0].toUpperCase() : "✦");
    const topAvatar = $("authTopButton");
    if (topAvatar && topAvatar.classList.contains("is-avatar") && savedName) topAvatar.textContent = savedName[0].toUpperCase();
    renderGreeting();

    if (birth) {
      // force=true (nach Server-Sync): Felder mit frischen Daten überschreiben.
      // sonst: nur füllen, wenn leer (stört den Nutzer nicht beim Tippen).
      const put = (id, val) => {
        const el = $(id);
        if (!el) return;
        if (force || !el.value) el.value = (val ?? "");
      };
      put("pName", birth.name || "");
      put("pDay", birth.day || "");
      put("pMonth", birth.month || "");
      put("pYear", birth.year || "");
      put("pHour", birth.hour ?? "");
      put("pMinute", birth.minute ?? "");
      put("pBirthplace", birth.birthplace || "");
      renderSun(Number(birth.day), Number(birth.month));
    }

    if ($("personId")) $("personId").value = localStorage.getItem(KEYS.person) || "";


    const hasProfile = !!(localStorage.getItem(KEYS.person) && birth && birth.day);
    document.body.classList.toggle("soraya-no-profile", !hasProfile);
    const result = $("personResult");
    if (hasProfile && result && !result.classList.contains("bad") &&
        (/Noch nicht gespeichert/.test(result.textContent) || result.textContent.trim() === t("Noch nicht gespeichert.").trim())) {
      status("personResult", t("◈ Dein Profil ist gespeichert. Änderungen einfach oben eintragen und erneut speichern."), "ok");
    }
  }

  // Geburtsdatum in der Sprache der App (z. B. "5. November 1990", "1990. november 5.")
  function birthDateLabel(birth) {
    const d = new Date(Number(birth.year), Number(birth.month) - 1, Number(birth.day));
    if (I18N && !Number.isNaN(d.getTime())) {
      const label = I18N.formatDate(d, { day: "numeric", month: "long", year: "numeric" });
      if (label) return label;
    }
    return birth.day + "." + birth.month + "." + birth.year;
  }

  function renderProfilePreview() {
    const birth = readJson(KEYS.birth, null);
    const preview = document.querySelector(".c45-birth-preview");
    if (!preview || !birth || !birth.day || !birth.month || !birth.year || !birth.birthplace) return;

    const time = birth.hour !== null && birth.hour !== undefined && birth.hour !== ""
      ? String(birth.hour).padStart(2, "0") + ":" + String(birth.minute || 0).padStart(2, "0")
      : t("Geburtszeit offen");

    preview.innerHTML = `
      <div><b>✦</b><span>${escapeHtml(birthDateLabel(birth))} · ${escapeHtml(time)}</span></div>
      <div><b>⌖</b><span>${escapeHtml(birth.birthplace)}</span></div>
    `;
  }

  async function renderOnboardingState() {
    const birth = readJson(KEYS.birth, null);
    const personId = getCurrentPersonId();
    const state = await getSessionState();
    const hasProfile = !!(personId || (birth && birth.name && birth.day && birth.month && birth.year && birth.birthplace));

    const card = $("onboardingCard");
    const analysisGuide = $("analysisEmptyGuide");
    const loginStep = $("stepLogin");
    const profileStep = $("stepProfile");
    const analysisStep = $("stepAnalysis");

    if (loginStep) loginStep.classList.toggle("done", !!state.ok);
    if (profileStep) profileStep.classList.toggle("done", !!hasProfile);
    if (analysisStep) analysisStep.classList.toggle("done", !!hasProfile);
    if (card) card.style.display = state.ok && hasProfile ? "none" : "";
    if (analysisGuide) analysisGuide.style.display = hasProfile ? "none" : "";
  }

  function signName(pointOrSign) {
    const sign = typeof pointOrSign === "string" ? pointOrSign : pointOrSign && pointOrSign.sign;
    const signDe = typeof pointOrSign === "object" && pointOrSign ? pointOrSign.sign_de : "";
    if (ASTRO && (sign || signDe)) return ASTRO.sign(sign || signDe) || "–";
    const map = { Ari: "Widder", Tau: "Stier", Gem: "Zwillinge", Can: "Krebs", Leo: "Löwe", Vir: "Jungfrau", Lib: "Waage", Sco: "Skorpion", Sag: "Schütze", Cap: "Steinbock", Aqu: "Wassermann", Pis: "Fische" };
    const fixed = { Loewe: "Löwe", Schuetze: "Schütze" };
    return fixed[signDe] || signDe || map[sign] || sign || "–";
  }

  function signStart(sign) {
    const map = { Ari: 0, Tau: 30, Gem: 60, Can: 90, Leo: 120, Vir: 150, Lib: 180, Sco: 210, Sag: 240, Cap: 270, Aqu: 300, Pis: 330, Widder: 0, Stier: 30, Zwillinge: 60, Krebs: 90, Löwe: 120, Jungfrau: 150, Waage: 180, Skorpion: 210, Schütze: 240, Steinbock: 270, Wassermann: 300, Fische: 330 };
    return map[sign] || 0;
  }

  function pointAbsPos(point) {
    const value = point && point.abs_pos !== undefined ? point.abs_pos : point && point.degree_total !== undefined ? point.degree_total : point && point.longitude !== undefined ? point.longitude : point && point.lon !== undefined ? point.lon : point && point.degree !== undefined && point.sign ? signStart(point.sign) + Number(point.degree) : 0;
    const n = Number(value);
    return Number.isFinite(n) ? ((n % 360) + 360) % 360 : 0;
  }

  function pointLabel(point) {
    if (point && ASTRO && point.name) return ASTRO.planet(point.name);
    return point && (point.name_de || point.name) ? (point.name_de || point.name) : t("Planet");
  }

  // ---------------------------------------------------------------------------
  // Teilen-Bilder (Story 1080x1920): kosmisches Trio und Partner-Ergebnis.
  // Mit Link-Kennung, damit unter "Wirkung" sichtbar wird, wie viele dadurch kommen.
  // ---------------------------------------------------------------------------
  let TRIO = null, SYN_TEILEN = null;
  const ZEICHEN_GLYPHE = { Ari: "♈", Tau: "♉", Gem: "♊", Can: "♋", Leo: "♌", Vir: "♍", Lib: "♎", Sco: "♏", Sag: "♐", Cap: "♑", Aqu: "♒", Pis: "♓" };
  const ZEICHEN_DE = { Widder: "Ari", Stier: "Tau", Zwillinge: "Gem", Krebs: "Can", "Löwe": "Leo", Loewe: "Leo", Jungfrau: "Vir", Waage: "Lib",
    Skorpion: "Sco", "Schütze": "Sag", Schuetze: "Sag", Steinbock: "Cap", Wassermann: "Aqu", Fische: "Pis" };
  const LANDING = "https://www.sorayaluxuryastroguide.com/";

  function zeichenKey(p) { return p ? (ZEICHEN_GLYPHE[p.sign] ? p.sign : ZEICHEN_DE[p.sign_de] || "") : ""; }

  function ladeBild(src) {
    return new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  }

  async function teilenLeinwand(zeichne) {
    try { await Promise.all(['600 80px "Cormorant Garamond"', '600 40px "Cinzel"', '500 30px "Inter"', '80px "SorayaZeichen"']
      .map((f) => document.fonts.load(f))); } catch (e) {}
    const c = document.createElement("canvas"); c.width = 1080; c.height = 1920;
    const g = c.getContext("2d");
    const bg = g.createRadialGradient(540, 0, 40, 540, 480, 1920);
    bg.addColorStop(0, "#2a1650"); bg.addColorStop(0.45, "#120a26"); bg.addColorStop(1, "#07040f");
    g.fillStyle = bg; g.fillRect(0, 0, 1080, 1920);
    let s = 7;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 190; i++) {
      const gold = rnd() < 0.12;
      g.fillStyle = gold ? `rgba(233,207,156,${0.5 + rnd() * 0.45})` : `rgba(188,178,214,${0.2 + rnd() * 0.45})`;
      g.beginPath(); g.arc(rnd() * 1080, rnd() * 1920, 0.6 + rnd() * (gold ? 2.4 : 1.6), 0, Math.PI * 2); g.fill();
    }
    // Art-déco-Rahmen: doppelte Goldlinie mit kleinen Rauten in den Ecken
    g.strokeStyle = "rgba(230,207,156,.55)"; g.lineWidth = 2; g.strokeRect(48, 48, 984, 1824);
    g.strokeStyle = "rgba(230,207,156,.22)"; g.lineWidth = 1; g.strokeRect(64, 64, 952, 1792);
    [[48, 48], [1032, 48], [48, 1872], [1032, 1872]].forEach(([x, y]) => {
      g.fillStyle = "#E6CF9C"; g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 9, y); g.lineTo(x, y + 9); g.lineTo(x - 9, y); g.closePath(); g.fill();
    });
    const halo = g.createRadialGradient(540, 960, 20, 540, 960, 560);
    halo.addColorStop(0, "rgba(201,168,106,.10)"); halo.addColorStop(1, "rgba(201,168,106,0)");
    g.fillStyle = halo; g.fillRect(0, 380, 1080, 1160);
    const logo = await ladeBild("/brand/zeichen.svg");
    if (logo) g.drawImage(logo, 540 - 70, 150, 140, 132);
    g.textAlign = "center"; g.fillStyle = "#E6CF9C"; g.font = '600 46px "Cinzel", serif';
    if ("letterSpacing" in g) g.letterSpacing = "16px";
    g.fillText("SORAYA", 548, 360);
    if ("letterSpacing" in g) g.letterSpacing = "0px";
    zeichne(g);
    g.fillStyle = "#a99dc6"; g.font = '500 30px "Inter", sans-serif';
    g.fillText(t("Berechne deins gratis"), 540, 1676);
    g.font = '600 34px "Inter", sans-serif';
    const url = "sorayaluxuryastroguide.com", w = g.measureText(url).width + 96;
    const px = 540 - w / 2, py = 1712, ph = 84, r = ph / 2;
    g.beginPath(); g.moveTo(px + r, py); g.arcTo(px + w, py, px + w, py + ph, r); g.arcTo(px + w, py + ph, px, py + ph, r);
    g.arcTo(px, py + ph, px, py, r); g.arcTo(px, py, px + w, py, r); g.closePath();
    g.fillStyle = "rgba(201,168,106,.12)"; g.fill(); g.strokeStyle = "rgba(230,207,156,.6)"; g.lineWidth = 2; g.stroke();
    g.fillStyle = "#F0DCAE"; g.fillText(url, 540, py + 54);
    return new Promise((ok) => c.toBlob(ok, "image/png"));
  }

  function textZeilen(g, text, breite) {
    const woerter = String(text || "").split(/\s+/), zeilen = []; let z = "";
    woerter.forEach((w) => { const v = z ? z + " " + w : w; if (g.measureText(v).width > breite && z) { zeilen.push(z); z = w; } else z = v; });
    if (z) zeilen.push(z);
    return zeilen;
  }

  async function teileBild(blob, name, text, code) {
    if (!blob) { toast(t("Das Bild konnte nicht erstellt werden.")); return; }
    const link = LANDING + "?q=" + code;
    const datei = new File([blob], name, { type: "image/png" });
    track("teilen", { art: code });
    if (navigator.canShare && navigator.canShare({ files: [datei] })) {
      try { await navigator.share({ files: [datei], text: text + "\n" + link }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    try { await navigator.clipboard.writeText(text + " " + link); } catch (e) {}
    toast(t("Bild gespeichert – teile es in deiner Story. Der Link ist kopiert."));
  }

  async function teileTrio() {
    if (!TRIO) return;
    const zeilen = [[t("Sonne"), TRIO.sun], [t("Mond"), TRIO.moon], [t("Aszendent"), TRIO.asc]].filter((z) => z[1]);
    const blob = await teilenLeinwand((g) => {
      g.fillStyle = "#C9A86A"; g.font = '500 30px "Inter", sans-serif';
      if ("letterSpacing" in g) g.letterSpacing = "6px";
      g.fillText(t("Mein kosmisches Trio").toUpperCase(), 546, 520);
      if ("letterSpacing" in g) g.letterSpacing = "0px";
      const start = 600, schritt = zeilen.length === 3 ? 320 : 420;
      zeilen.forEach(([was, punkt], i) => {
        const y = start + i * schritt, key = zeichenKey(punkt);
        g.strokeStyle = "rgba(230,207,156,.7)"; g.lineWidth = 3;
        g.beginPath(); g.arc(540, y + 70, 78, 0, Math.PI * 2); g.stroke();
        g.fillStyle = "rgba(233,207,156,.08)"; g.fill();
        g.fillStyle = "#E9CF9C"; g.font = '86px "SorayaZeichen", serif';
        g.fillText(ZEICHEN_GLYPHE[key] || "✦", 540, y + 100);
        g.fillStyle = "#8f83ad"; g.font = '500 28px "Inter", sans-serif';
        if ("letterSpacing" in g) g.letterSpacing = "6px";
        g.fillText(was.toUpperCase(), 543, y + 196);
        if ("letterSpacing" in g) g.letterSpacing = "0px";
        g.fillStyle = "#F6E3B4"; g.font = '600 72px "Cormorant Garamond", serif';
        g.fillText(signName(punkt), 540, y + 268);
      });
    });
    const sonne = signName(TRIO.sun);
    teileBild(blob, "soraya-trio.png", t("Mein kosmisches Trio: Sonne in {sign} ✨", { sign: sonne }), "teilen-trio");
  }

  async function teileSynastrie() {
    if (!SYN_TEILEN) return;
    const { prozent, a, b, label } = SYN_TEILEN;
    const blob = await teilenLeinwand((g) => {
      g.fillStyle = "#C9A86A"; g.font = '500 30px "Inter", sans-serif';
      if ("letterSpacing" in g) g.letterSpacing = "6px";
      g.fillText(t("Unsere Verbindung").toUpperCase(), 546, 540);
      if ("letterSpacing" in g) g.letterSpacing = "0px";
      // zwei verschlungene Ringe mit dem Ergebnis in der Mitte
      // Ergebnis-Ring wie in der App: feine Spur + goldener Bogen bis zum Prozentwert
      g.lineWidth = 14; g.strokeStyle = "rgba(195,183,218,.14)";
      g.beginPath(); g.arc(540, 900, 220, 0, Math.PI * 2); g.stroke();
      g.lineCap = "round"; g.strokeStyle = "#E6CF9C";
      g.beginPath(); g.arc(540, 900, 220, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(100, Number(prozent) || 0)) / 100); g.stroke();
      g.lineCap = "butt"; g.lineWidth = 2; g.strokeStyle = "rgba(230,207,156,.25)";
      g.beginPath(); g.arc(540, 900, 186, 0, Math.PI * 2); g.stroke();
      g.fillStyle = "#F6E3B4"; g.font = '600 150px "Cormorant Garamond", serif';
      g.fillText(prozent + " %", 540, 950);
      g.fillStyle = "#EFE8F8"; g.font = '600 64px "Cormorant Garamond", serif';
      g.fillText(a + " & " + b, 540, 1240);
      if (label) {
        g.fillStyle = "#C3B7DA"; g.font = '400 38px "Inter", sans-serif';
        textZeilen(g, label, 860).slice(0, 2).forEach((z, i) => g.fillText(z, 540, 1320 + i * 52));
      }
    });
    teileBild(blob, "soraya-verbindung.png", t("Wir passen zu {p} % zusammen – laut Soraya ✨", { p: prozent }), "teilen-partner");
  }

  function planetGlyph(name) {
    const map = {
      Sonne: "☉", Sun: "☉", Mond: "☾", Moon: "☾", Merkur: "☿", Mercury: "☿",
      Venus: "♀", Mars: "♂", Jupiter: "♃", Saturn: "♄", Uranus: "♅",
      Neptun: "♆", Neptune: "♆", Pluto: "♇", Chiron: "⚷",
      True_North_Lunar_Node: "☊", Mean_Lilith: "⚸", Ascendant: "AC", Medium_Coeli: "MC"
    };
    return map[name] || "✦";
  }

  function formatDegree(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "–";
    let deg = Math.floor(n);
    let min = Math.round((n - deg) * 60);
    if (min === 60) { deg += 1; min = 0; }
    return deg + "° " + String(min).padStart(2, "0") + "′";
  }

  function xy(cx, cy, radius, deg) {
    const angle = ((deg - 90) * Math.PI) / 180;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  }

  function svgText(x, y, text, size, fill, weight = "500") {
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeHtml(text)}</text>`;
  }

  // Radix wie in klassischen Horoskopen: Aszendent links, Tierkreis gegen den
  // Uhrzeigersinn, in der Mitte die Aspekt-Linien. Ohne Geburtszeit keine
  // Haeuser und kein Aszendent (die waeren nur geraten) -> Widder links.
  function chartAscendant(data) {
    if (data.meta && data.meta.time_known === false) return 0;
    if (data.big_three && data.big_three.ascendant) return pointAbsPos(data.big_three.ascendant);
    if (Array.isArray(data.houses) && data.houses[0] && data.houses[0].cusp_abs_pos !== undefined) return Number(data.houses[0].cusp_abs_pos);
    return 0;
  }

  function renderWheel(chartData = null) {
    const svg = $("chartWheel");
    if (!svg) return;

    const data = chartData ? (chartData.data || chartData) : {};
    const points = Array.isArray(data.points) ? data.points : [];
    const timeKnown = !(data.meta && data.meta.time_known === false);
    const houses = timeKnown && Array.isArray(data.houses) ? data.houses : [];
    const aspects = Array.isArray(data.aspects) ? data.aspects : [];
    const signGlyphs = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
    const corePoints = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Chiron", "True_North_Lunar_Node", "Mean_Lilith"];
    const cx = 210, cy = 210, outer = 202, zodiacIn = 166, planetR = 138, aspectR = 104;
    const asc = chartAscendant(data);
    const ang = (lon) => 270 - (lon - asc);           // Bildschirmwinkel (0 = oben, im Uhrzeigersinn)
    const P = (r, lon) => xy(cx, cy, r, ang(lon));
    const line = (a, b, stroke, width, extra = "") => `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${stroke}" stroke-width="${width}"${extra}/>`;
    let html = "";

    html += `<circle cx="${cx}" cy="${cy}" r="${outer}" fill="rgba(255,255,255,.025)" stroke="rgba(228,181,90,.72)" stroke-width="1.5"/>`;
    html += `<circle cx="${cx}" cy="${cy}" r="${zodiacIn}" fill="rgba(10,8,26,.35)" stroke="rgba(228,181,90,.38)" stroke-width="1"/>`;
    html += `<circle cx="${cx}" cy="${cy}" r="${aspectR}" fill="rgba(7,8,23,.72)" stroke="rgba(228,181,90,.26)" stroke-width="1"/>`;

    // Tierkreis-Band mit Grad-Strichen
    for (let i = 0; i < 12; i += 1) {
      html += line(P(zodiacIn, i * 30), P(outer, i * 30), "rgba(255,255,255,.14)", 1);
      const g = P((outer + zodiacIn) / 2, i * 30 + 15);
      html += svgText(g.x, g.y, signGlyphs[i], 20, "rgba(228,181,90,.96)", "600");
    }
    for (let d = 0; d < 360; d += 5) {
      if (d % 30 === 0) continue;
      html += line(P(zodiacIn, d), P(zodiacIn + (d % 10 === 0 ? 6 : 3.5), d), "rgba(228,181,90,.35)", 0.8);
    }

    // Haeuser (nur mit Geburtszeit)
    const cusps = houses.filter((h) => h.cusp_abs_pos !== undefined).sort((a, b) => a.number - b.number);
    cusps.forEach((house, i) => {
      const lon = Number(house.cusp_abs_pos);
      const isAngle = [1, 4, 7, 10].indexOf(house.number) >= 0;
      html += line(P(aspectR, lon), P(zodiacIn, lon), isAngle ? "rgba(228,181,90,.7)" : "rgba(190,108,255,.28)", isAngle ? 1.6 : 1);
      const next = cusps[(i + 1) % cusps.length];
      let span = next ? ((Number(next.cusp_abs_pos) - lon + 360) % 360) : 30;
      if (!span) span = 30;
      const n = P(aspectR + 9, lon + span / 2);
      html += svgText(n.x, n.y, String(house.number), 9, "rgba(231,222,255,.5)", "600");
    });
    if (cusps.length >= 10) {
      const acLabel = P(zodiacIn - 10, asc + 6);
      html += svgText(acLabel.x, acLabel.y, t("AC"), 10, "#f3dca2", "700");
      const mc = Number(cusps[9].cusp_abs_pos);
      const mcLabel = P(zodiacIn - 10, mc - 6);
      html += svgText(mcLabel.x, mcLabel.y, "MC", 10, "#f3dca2", "700");
    }

    // Aspekt-Linien in der Mitte (nur Hauptaspekte der Planeten)
    const byName = {};
    points.forEach((p) => { if (p && p.name) byName[p.name] = p; });
    const aspectPlanets = corePoints.slice(0, 10);
    const ASPECT_COLORS = { trine: "rgba(228,181,90,.55)", sextile: "rgba(228,181,90,.42)", square: "rgba(236,122,140,.55)", opposition: "rgba(236,122,140,.48)" };
    aspects.forEach((a) => {
      const type = String(a.type || "").toLowerCase();
      const color = ASPECT_COLORS[type];
      if (!color || aspectPlanets.indexOf(a.p1) < 0 || aspectPlanets.indexOf(a.p2) < 0) return;
      const p1 = byName[a.p1], p2 = byName[a.p2];
      if (!p1 || !p2) return;
      const orb = Math.abs(Number(a.orb) || 0);
      html += line(P(aspectR - 2, pointAbsPos(p1)), P(aspectR - 2, pointAbsPos(p2)), color, orb < 2 ? 1.3 : 0.9);
    });

    // Planeten: enge Gruppen auseinanderziehen, damit nichts uebereinander liegt
    const drawable = points.filter((p) => corePoints.includes(p.name)).map((p) => ({ p, lon: pointAbsPos(p) })).sort((a, b) => a.lon - b.lon);
    const pos = drawable.map((d) => d.lon);
    const MIN = 9.5;
    for (let iter = 0; iter < 60 && pos.length > 1; iter += 1) {
      let moved = false;
      for (let i = 0; i < pos.length; i += 1) {
        const j = (i + 1) % pos.length;
        let gap = pos[j] - pos[i];
        if (j === 0) gap += 360;
        if (gap < MIN) { const push = (MIN - gap) / 2; pos[i] -= push; pos[j] += push; moved = true; }
      }
      if (!moved) break;
    }
    drawable.forEach((d, i) => {
      const at = P(planetR, pos[i]);
      html += line(P(zodiacIn, d.lon), P(zodiacIn - 7, d.lon), "#f3dca2", 1.4);
      html += line(P(zodiacIn - 7, d.lon), P(planetR + 12, pos[i]), "rgba(228,181,90,.3)", 0.8);
      html += `<circle cx="${at.x.toFixed(1)}" cy="${at.y.toFixed(1)}" r="12.5" fill="rgba(22,13,45,.96)" stroke="rgba(228,181,90,.7)" stroke-width="1"/>`;
      const glyph = planetGlyph(d.p.name || d.p.name_de || "");
      html += svgText(at.x, at.y + 0.5, glyph, glyph.length > 1 ? 9 : 16, "#fff4c9", "600");
      if (d.p.retrograde && corePoints.indexOf(d.p.name) < 10) {
        const r = P(planetR - 19, pos[i]);
        html += svgText(r.x, r.y, "R", 7.5, "rgba(236,122,140,.9)", "700");
      }
    });

    if (!drawable.length) html += svgText(cx, cy, "✦", 26, "rgba(228,181,90,.6)", "500");
    svg.innerHTML = html;
  }

  function ensureChartDetails() {
    if ($("chartDetails")) return $("chartDetails");
    const svg = $("chartWheel");
    if (!svg || !svg.parentElement) return null;

    const box = document.createElement("div");
    box.id = "chartDetails";
    box.className = "reading";
    box.style.marginTop = "14px";
    box.textContent = t("Geburtshoroskop wird geladen.");
    svg.parentElement.appendChild(box);
    return box;
  }

  function renderAnalysisDetails(chartJson) {
    const data = chartJson ? (chartJson.data || chartJson) : null;
    if (!data) return;

    const points = Array.isArray(data.points) ? data.points : [];
    const aspects = Array.isArray(data.aspects) ? data.aspects : [];
    const big = data.big_three || {};
    const sun = big.sun || points.find((p) => p.name === "Sun");
    const moon = big.moon || points.find((p) => p.name === "Moon");
    const timeKnown = !(data.meta && data.meta.time_known === false);
    // Ohne Geburtszeit sind Aszendent und Haeuser nur geraten -> nicht als Fakt zeigen
    const asc = timeKnown ? (big.ascendant || points.find((p) => p.name === "Ascendant")) : null;

    const bigSign = (id, point) => {
      const node = $(id);
      if (!node) return;
      node.innerHTML = point
        ? escapeHtml(signName(point)) + '<small class="big-degree">' + escapeHtml(formatDegree(point.degree)) + "</small>"
        : "–";
    };
    bigSign("bigSunSign", sun);
    bigSign("bigMoonSign", moon);
    bigSign("bigAscSign", asc);
    setText("bigSunText", sun && sun.house && timeKnown ? t("Haus {n} · Identität und Wille", { n: sun.house }) : t("Identität · Ausdruck · Lebenslicht"));
    setText("bigMoonText", moon && moon.house && timeKnown ? t("Haus {n} · Gefühl und Sicherheit", { n: moon.house }) : t("Gefühl · Bedürfnis · innere Welt"));
    setText("bigAscText", asc ? t("Dein Auftreten und dein Weg") : timeKnown ? t("Auftreten · Weg · Wirkung") : t("Braucht deine Geburtszeit"));

    const planetList = $("planetList");
    if (planetList) {
      const wanted = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
      const rows = points.filter((p) => wanted.includes(p.name)).map((p) => {
        const glyph = planetGlyph(p.name);
        const name = pointLabel(p);
        const sign = signName(p);
        const degree = formatDegree(p.degree);
        const house = p.house && timeKnown ? t("Haus {n}", { n: p.house }) : "";
        return `<div class="c41-planet-row">
          <span class="c41-planet-glyph">${escapeHtml(glyph)}</span>
          <span class="c41-planet-name">${escapeHtml(name)}</span>
          <span class="c41-planet-sign">${escapeHtml(sign)} ${escapeHtml(degree)}</span>
          <span class="c41-planet-house">${escapeHtml(house)}</span>
        </div>`;
      }).join("");
      planetList.innerHTML = rows || `<div class="c41-empty">${escapeHtml(t("Keine Planetenliste verfügbar."))}</div>`;
    }

    const aspectSummary = $("aspectSummary");
    if (aspectSummary) {
      const total = aspects.length;
      const harmoniousNames = ["trine", "sextile", "conjunction", "trigon", "sextil", "konjunktion"];
      const challengingNames = ["square", "opposition", "quadrat"];
      const aspectType = (a) => String(a.type || a.aspect || a.name || a.type_de || "").toLowerCase();
      const harmonious = aspects.filter((a) => harmoniousNames.includes(aspectType(a))).length;
      const challenging = aspects.filter((a) => challengingNames.includes(aspectType(a))).length;
      const neutral = Math.max(0, total - harmonious - challenging);

      const elements = data.distributions && data.distributions.elements ? data.distributions.elements : null;
      const elementRows = elements ? Object.entries(elements).map(([key, val]) => {
        const label = t({ fire: "Feuer", earth: "Erde", air: "Luft", water: "Wasser", Feuer: "Feuer", Erde: "Erde", Luft: "Luft", Wasser: "Wasser" }[key] || key);
        const count = Number(val) || 0;
        const pct = Math.min(100, Math.max(6, count * 12));
        return `<div class="c41-balance-row"><span>${escapeHtml(label)}</span><i><em style="width:${pct}%"></em></i><b>${count}</b></div>`;
      }).join("") : "";

      aspectSummary.innerHTML = `
        <div class="c41-aspect-cards">
          <div><b>${harmonious}</b><span>${escapeHtml(t("Harmonisch"))}</span></div>
          <div><b>${challenging}</b><span>${escapeHtml(t("Spannung"))}</span></div>
          <div><b>${neutral}</b><span>${escapeHtml(t("Neutral"))}</span></div>
        </div>
        ${elementRows ? `<div class="c41-balance">${elementRows}</div>` : `<div class="c41-empty">${escapeHtml(t("Elemente-Balance wird geladen, sobald verfügbar."))}</div>`}
      `;
    }
  }

  async function loadRealChartData(force = false) {
    const birth = readJson(KEYS.birth, null);
    const details = ensureChartDetails();
    if (!birth || !birth.day || !birth.month || !birth.year || !birth.birthplace) {
      renderWheel(null);
      // Schon im Schnellstart gerechnet: Sonne und Mond trotzdem zeigen
      const preview = readPreview();
      const r = preview && preview.result;
      if (r && r.sun && r.moon) {
        const nameOf = (p) => (ASTRO ? ASTRO.sign(p.sign) : p.sign_de || p.sign) + (p.uncertain ? " ?" : "");
        setText("bigSunSign", nameOf(r.sun));
        setText("bigMoonSign", nameOf(r.moon));
        setText("bigAscText", t("Mit Geburtszeit und Ort im Profil"));
      }
      if (details) details.textContent = t("Speichere zuerst dein Profil, dann berechnet Soraya dein echtes Geburtshoroskop.");
      return null;
    }

    try {
      const personId = getCurrentPersonId();
      let json = null;
      if (!force && personId && chartCache.personId === personId && chartCache.json) {
        json = chartCache.json;
      } else {
        if (details) details.textContent = t("Soraya zeichnet dein Geburtshoroskop…");
        if ($("planetList") && !$("planetList").querySelector(".c41-planet-row")) $("planetList").innerHTML = skeleton(5);
        if ($("aspectSummary") && !$("aspectSummary").querySelector(".c41-aspect-cards")) $("aspectSummary").innerHTML = skeleton(3);
        json = await loadChartJson(personId, birth);
        if (personId) chartCache = { personId, json };
      }
      renderWheel(json);
      renderAnalysisDetails(json);
      renderCoreFromChart(json);

      // Kurze Info statt doppelter Textliste (Big Three + Planeten stehen darunter).
      const meta = (json.data || json).meta || {};
      const parts = [];
      if (meta.house_system) parts.push(t("Häuser: {system}", { system: meta.house_system }));
      parts.push(meta.time_known === false ? t("Geburtszeit unbekannt – Soraya rechnet mit 12:00 Uhr") : t("mit Geburtszeit berechnet"));
      if (details) {
        details.textContent = parts.join(" · ");
        details.classList.add("chart-meta-line");
      }
      return json;
    } catch (error) {
      renderWheel(null);
      if (details) {
        details.innerHTML = escapeHtml(t("Chart konnte nicht geladen werden: {error}", { error: friendlyError(error, t("Chart nicht verfügbar.")) })) +
          ' <button type="button" class="link-btn" onclick="loadRealChartData(true)">' + escapeHtml(t("Erneut versuchen")) + "</button>";
      }
      ["planetList", "aspectSummary"].forEach((id) => {
        const box = $(id);
        if (box && box.querySelector(".sk")) box.innerHTML = '<div class="c41-empty">' + escapeHtml(t("Gerade nicht erreichbar")) + "</div>";
      });
      return null;
    }
  }

  // Gespeichertes Radix (schnell, ohne Geocoding). Ohne Personen-ID oder bei
  // aelterem Backend: Berechnung aus den Geburtsdaten ueber /chart.
  async function loadChartJson(personId, birth) {
    if (personId) {
      try {
        const json = await callSoraya("/mobile/chart", { person_id: personId }, "POST", 15000);
        if (json && json.data) return json;
      } catch (error) {
        if (error && (error.code === "timeout" || error.code === "limit")) throw error;
      }
    }
    return engineJson("/chart", birth);
  }

  async function loadTransitsJson(personId, birth, at = null) {
    if (personId) {
      try {
        const json = await callSoraya("/mobile/transits", { person_id: personId, at: at }, "POST", 15000);
        if (json && json.data) return json;
      } catch (error) {
        if (error && (error.code === "timeout" || error.code === "limit")) throw error;
      }
    }
    return engineJson("/transits", { person: birth, at: at });
  }

  // ---------------------------------------------------------------------------
  // Tagesenergie: EIN fester Wert pro Person und Tag.
  // Grundlage ist der Himmel um 12:00 Ortszeit (nicht "jetzt") und nur die
  // langsameren Planeten (ohne Mond und ohne Achsen, die sich stuendlich drehen).
  // Ergebnis wird pro Datum gemerkt -> kein Springen mehr (vorher z. B. 24 % -> 92 %).
  // ---------------------------------------------------------------------------
  function localNoonUtc(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).toISOString().slice(0, 19);
  }
  function daySkySignature(personId, birth) {
    const b = birth || {};
    return [personId || "", b.day, b.month, b.year, b.hour, b.minute, b.lat || b.city || b.place || ""].join("|");
  }
  const ENERGY_TRANSIT_WEIGHT = { Sun: 1, Mercury: 0.8, Venus: 1, Mars: 1.1, Jupiter: 1.3, Saturn: 1.4, Uranus: 1.2, Neptune: 1.1, Pluto: 1.2 };
  const ENERGY_NATAL_WEIGHT = { Sun: 1.3, Moon: 1.3, Ascendant: 1.1, Mercury: 1, Venus: 1, Mars: 1, Jupiter: 0.8, Saturn: 0.8 };
  const ENERGY_SOFT = ["Venus", "Jupiter"];
  const ENERGY_HARD = ["Saturn", "Mars", "Pluto"];
  function energyFromAspects(list, timeKnown) {
    const rows = [];
    (list || []).forEach((a) => {
      const tw = ENERGY_TRANSIT_WEIGHT[a.transit];
      const nw = ENERGY_NATAL_WEIGHT[a.natal];
      if (!tw || !nw) return;
      if (a.natal === "Ascendant" && !timeKnown) return;
      const type = String(a.type || "").toLowerCase();
      let dir = 0;
      if (type === "trine" || type === "sextile") dir = 1;
      else if (type === "square" || type === "opposition") dir = -1;
      else if (type === "conjunction") dir = ENERGY_SOFT.indexOf(a.transit) >= 0 ? 0.7 : ENERGY_HARD.indexOf(a.transit) >= 0 ? -0.7 : 0.3;
      if (!dir) return;
      const orb = Math.abs(Number(a.orb) || 0);
      const close = Math.max(0.2, 1 - orb / 8);
      rows.push({ a: a, w: dir * tw * nw * close });
    });
    let plus = 0, minus = 0;
    rows.forEach((r) => { if (r.w > 0) plus += r.w; else minus -= r.w; });
    let score = Math.round(55 + 40 * (plus - minus) / (plus + minus + 1.5));
    score = Math.max(18, Math.min(96, score));
    rows.sort((x, y) => Math.abs(y.w) - Math.abs(x.w));
    const drivers = rows.slice(0, 2).map((r) => ({ transit: r.a.transit, transit_de: r.a.transit_de, natal: r.a.natal, natal_de: r.a.natal_de, type: r.a.type, type_de: r.a.type_de, plus: r.w > 0 }));
    return { score: score, drivers: drivers };
  }
  function energyLabel(score) {
    return score >= 66 ? t("Harmonisch & offen") : score >= 45 ? t("Ausgeglichen") : t("Intensiv & fordernd");
  }
  // Himmel des Tages (12:00 Ortszeit) holen -- einmal pro Tag, danach aus dem Speicher.
  async function loadDaySky(personId, birth) {
    const today = localDayKey();
    const sig = daySkySignature(personId, birth);
    const cached = readJson(KEYS.daySky, null);
    if (cached && cached.date === today && cached.sig === sig && Array.isArray(cached.aspects)) return cached;
    const json = await loadTransitsJson(personId, birth, localNoonUtc());
    const aspects = (json.data.aspects_to_natal || []).map((a) => ({
      transit: a.transit, transit_de: a.transit_de, natal: a.natal, natal_de: a.natal_de,
      type: a.type, type_de: a.type_de, orb: a.orb, movement: a.movement
    }));
    const timeKnown = birth && birth.hour != null && birth.hour !== "";
    const energy = energyFromAspects(aspects, timeKnown);
    const entry = { date: today, sig: sig, aspects: aspects, score: energy.score, drivers: energy.drivers };
    try { writeJson(KEYS.daySky, entry); } catch (error) {}
    return entry;
  }

  async function engineJson(path, body) {
    const config = getConfig();
    const response = await fetchWithTimeout(config.engineUrl.replace(/\/$/, "") + path, {
      method: "POST",
      headers: await engineHeaders(),
      body: JSON.stringify(body)
    }, 15000);
    const json = await readEngine(response);
    if (!json.data) throw engineFail(502, null);
    return json;
  }

  function setHomeTransits(html) {
    const box = $("homeTransits");
    if (box) box.innerHTML = html;
  }

  const PLANET_THEMES = {
    Sonne: "Selbstausdruck", Mond: "Gefühle", Merkur: "Denken & Gespräche", Venus: "Liebe & Genuss",
    Mars: "Energie & Mut", Jupiter: "Wachstum & Glück", Saturn: "Struktur & Verantwortung",
    Uranus: "Veränderung", Neptun: "Intuition & Träume", Pluto: "Wandlung", Chiron: "Heilung",
    Lilith: "Ursprünglichkeit", Aszendent: "Auftreten", "MC (Himmelsmitte)": "Beruf & Ziele",
    "Mondknoten (Nord)": "Lebensweg"
  };
  const ASPECT_MEANINGS = {
    Konjunktion: "verstärkt sich", Trigon: "fließt leicht", Sextil: "öffnet Chancen",
    Quadrat: "fordert heraus", Opposition: "sucht Balance",
    Quintil: "weckt Talente", Biquintil: "weckt Talente", Halbsextil: "gibt kleine Impulse",
    Quincunx: "verlangt Anpassung", Halbquadrat: "reibt leise", Anderthalbquadrat: "drängt zur Korrektur"
  };
  // Achsen des Transit-Horoskops (Aszendent usw.) wandern alle paar Minuten weiter --
  // fuer "Transit-Vorschau" und "Tagesenergie" zaehlen nur die Planeten.
  const FAST_TRANSIT_POINTS = ["Aszendent", "Deszendent", "IC", "MC (Himmelsmitte)"];
  function dailyAspects(list) {
    return (list || []).filter((aspect) => FAST_TRANSIT_POINTS.indexOf(aspect.transit_de) < 0);
  }

  function transitMeaning(aspect) {
    const from = PLANET_THEMES[aspect.transit_de];
    const to = PLANET_THEMES[aspect.natal_de];
    const how = ASPECT_MEANINGS[aspect.type_de];
    if (!from || !to || !how) return "";
    return t(from) + " → " + t(to) + " · " + t(how);
  }

  function transitRow(glyph, title, sub, right = "") {
    return '<div class="row"><div class="left"><span class="orb-sm">' + escapeHtml(glyph) + '</span><div><h4>' +
      escapeHtml(title) + '</h4><p>' + escapeHtml(sub) + '</p></div></div><span>' + escapeHtml(right) + '</span></div>';
  }

  let shownEnergy = null;
  function setEnergy(percent, label, drivers) {
    if ($("energyRing")) $("energyRing").style.setProperty("--energy", (percent == null ? 0 : percent) + "%");
    if (percent == null) { setText("energyPct", "–"); shownEnergy = null; }
    else if (shownEnergy !== percent) { countUp($("energyPct"), percent, "%"); shownEnergy = percent; }
    setText("energyLabel", label || "–");
    const why = $("energyWhy");
    if (!why) return;
    if (!drivers || !drivers.length) { why.hidden = true; return; }
    why.innerHTML = drivers.map((d) => {
      const title = [trPlanet(d.transit || d.transit_de), ASTRO ? ASTRO.aspect(d.type || d.type_de) : d.type_de, trPlanet(d.natal || d.natal_de)].filter(Boolean).join(" ");
      return '<li class="' + (d.plus ? "is-plus" : "is-minus") + '"><span aria-hidden="true">' + (d.plus ? "↗" : "↘") + "</span>" +
        escapeHtml(title) + " · " + escapeHtml(d.plus ? t("gibt Rückenwind") : t("fordert dich")) + "</li>";
    }).join("");
    why.hidden = false;
  }

  function renderHomeSkyThrottled(force = false) {
    if (homeSkyTimer) window.clearTimeout(homeSkyTimer);
    homeSkyTimer = window.setTimeout(() => renderHomeSky(force), force ? 0 : 120);
  }

  async function renderHomeSky() {
    loadDailyFocus();
    ensureCoreChart();
    const birth = readJson(KEYS.birth, null);
    const config = getAvailableConfig();

    if (!config || !config.engineUrl) {
      setHomeTransits(transitRow("✦", t("Verbindung fehlt"), t("Speichere zuerst Supabase & Backend.")));
      setEnergy(null, t("Verbindung fehlt"));
      return;
    }

    if (!birth || !birth.day || !birth.month || !birth.year) {
      setHomeTransits(transitRow("✦", t("Profil fehlt"), t("Hinterlege deine Geburtsdaten.")));
      setEnergy(null, t("Profil anlegen"));
      return;
    }

    lastHomeSkyAt = Date.now();
    try {
      const day = await loadDaySky(getCurrentPersonId(), birth);
      document.body.classList.remove("soraya-backend-soft-fail");
      setEnergy(day.score, energyLabel(day.score), day.drivers);

      const planetAspects = dailyAspects(day.aspects);
      // Vorschau: die wichtigsten Transite zuerst (Hauptaspekte der Planeten auf
      // persoenliche Punkte), Nebenaspekte wie Quintil oder Lilith/Mondknoten nur als Ersatz
      const MAJOR = ["conjunction", "opposition", "square", "trine", "sextile"];
      const CORE = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"].concat(birth.hour != null && birth.hour !== "" ? ["Ascendant"] : []);
      const isMain = (a) => MAJOR.indexOf(String(a.type || "").toLowerCase()) >= 0 && CORE.indexOf(a.transit) >= 0 && CORE.indexOf(a.natal) >= 0;
      const ranked = planetAspects.filter(isMain).concat(planetAspects.filter((a) => !isMain(a)));
      const aspects = ranked.slice(0, 3);
      if (!aspects.length) {
        setHomeTransits(transitRow("☾", t("Ruhiger Himmel"), t("Gerade keine engen Transite.")));
        return;
      }

      const VISIBLE = 4;
      const rowHtml = aspects.map((aspect) => {
        const movement = aspect.movement === "Applying" ? t("im Kommen") : aspect.movement === "Separating" ? t("klingt ab") : t("aktiv");
        const title = [trPlanet(aspect.transit || aspect.transit_de), ASTRO ? ASTRO.aspect(aspect.type || aspect.type_de) : aspect.type_de, trPlanet(aspect.natal || aspect.natal_de)].filter(Boolean).join(" ");
        const meaning = transitMeaning(aspect);
        return transitRow(planetGlyph(aspect.transit_de), title || t("Transit"), meaning ? meaning + " · " + movement : movement, aspect.movement === "Applying" ? "↗" : "↘");
      });

      let rows = rowHtml.slice(0, VISIBLE).join("");
      if (rowHtml.length > VISIBLE) {
        rows += '<div class="transit-more" id="transitMore">' + rowHtml.slice(VISIBLE).join("") + "</div>";
        rows += '<button type="button" class="collapse-toggle" data-collapse="transitMore">' +
          escapeHtml(t("Weitere {n} Transite anzeigen", { n: rowHtml.length - VISIBLE })) + "</button>";
      }

      setHomeTransits(rows);
    } catch (error) {
      trackError("transits", error);
      if (isNetworkError(error) || (error && error.code === "server")) setEngineReachable(false);
      lastHomeSkyAt = 0;
      document.body.classList.add("soraya-backend-soft-fail");
      setHomeTransits(transitRow("✦", t("Sanfter Tagesimpuls"), t("Deine Transite sind gerade kurz nicht erreichbar. Soraya versucht es gleich erneut.")));
      setEnergy(null, "–");
    }
  }

  // ---------------------------------------------------------------------------
  // Schnellstart OHNE Login: Geburtsdatum -> Sonne, Mond, Tageshoroskop fuers
  // Sternzeichen. Ergebnis bleibt lokal gespeichert und wird nach Login/Profil
  // ins Profilformular uebernommen.
  // ---------------------------------------------------------------------------
  const PREVIEW_KEY = "soraya_preview_v1";
  const SIGN_KEY_BY_DE = { Widder: "Ari", Stier: "Tau", Zwillinge: "Gem", Krebs: "Can", "Löwe": "Leo", Jungfrau: "Vir", Waage: "Lib", Skorpion: "Sco", "Schütze": "Sag", Steinbock: "Cap", Wassermann: "Aqu", Fische: "Pis" };
  const SIGN_PERSON = { Ari: "Widder", Tau: "Stier", Gem: "Zwilling", Can: "Krebs", Leo: "Löwe", Vir: "Jungfrau", Lib: "Waage", Sco: "Skorpion", Sag: "Schütze", Cap: "Steinbock", Aqu: "Wassermann", Pis: "Fisch" };
  const SUN_TEXTS = {
    Ari: "Mutig, direkt und voller Anfangsenergie – du gehst voran, wo andere noch zögern.",
    Tau: "Beständig, sinnlich und verlässlich – du baust Schritt für Schritt etwas, das bleibt.",
    Gem: "Neugierig, wortgewandt und vielseitig – dein Geist liebt Austausch und neue Ideen.",
    Can: "Fürsorglich, gefühlvoll und schützend – Geborgenheit ist deine stille Stärke.",
    Leo: "Warmherzig, kreativ und strahlend – du möchtest gesehen werden und andere zum Leuchten bringen.",
    Vir: "Klar, hilfsbereit und genau – du erkennst Details und machst Dinge besser.",
    Lib: "Charmant, fair und harmoniesuchend – Beziehungen und Schönheit sind dein Element.",
    Sco: "Intensiv, tiefgründig und loyal – du gehst den Dingen auf den Grund.",
    Sag: "Optimistisch, frei und sinnsuchend – Horizonte zu erweitern, treibt dich an.",
    Cap: "Ehrgeizig, ausdauernd und verantwortungsvoll – du erreichst Gipfel mit Geduld.",
    Aqu: "Originell, unabhängig und visionär – du denkst Zukunft und Gemeinschaft neu.",
    Pis: "Einfühlsam, fantasievoll und intuitiv – du spürst, was zwischen den Zeilen liegt."
  };
  const MOON_TEXTS = {
    Ari: "Gefühle zeigst du spontan und ehrlich – du brauchst Freiraum und Bewegung.",
    Tau: "Ruhe, Genuss und Verlässlichkeit geben dir emotionale Sicherheit.",
    Gem: "Du verarbeitest Gefühle im Gespräch – Austausch beruhigt dich.",
    Can: "Du fühlst tief und brauchst ein echtes Zuhause, innen wie außen.",
    Leo: "Wärme und Anerkennung nähren dich – du schenkst großzügig Herz.",
    Vir: "Ordnung und sinnvolle Aufgaben geben dir innere Ruhe.",
    Lib: "Harmonie und schöne Begegnungen bringen dich ins Gleichgewicht.",
    Sco: "Deine Gefühle sind intensiv – Vertrauen ist für dich alles.",
    Sag: "Du brauchst Weite, Abenteuer und etwas, an das du glauben kannst.",
    Cap: "Du zeigst Gefühle eher leise – Beständigkeit gibt dir Halt.",
    Aqu: "Du brauchst Freiheit und Freundschaft auf Augenhöhe.",
    Pis: "Du spürst Stimmungen sofort – Rückzug und Kreativität laden dich auf."
  };

  function readPreview() {
    const p = readJson(PREVIEW_KEY, null);
    return p && p.birth && p.result ? p : null;
  }

  async function publicJson(path, body) {
    const config = getConfig();
    const response = await fetchWithTimeout(config.engineUrl.replace(/\/$/, "") + path, body ? {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    } : { method: "GET" }, 30000);
    return readEngine(response);
  }

  // Anonymer Zaehler fuer nicht eingeloggte Nutzer (nur Ereignisart, sonst nichts).
  function publicEvent(kind) {
    try {
      const config = getConfig();
      fetch(config.engineUrl.replace(/\/$/, "") + "/public/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, q: (quelle() || {}).code }),
        keepalive: true
      }).catch(() => {});
    } catch (error) {}
  }

  function signDisplay(info) {
    if (!info) return "–";
    if (info.uncertain && Array.isArray(info.alternatives) && info.alternatives.length === 2) {
      return t("{a} oder {b}", { a: trSign(info.alternatives[0]), b: trSign(info.alternatives[1]) });
    }
    return trSign(info.sign || info.sign_de) || "–";
  }

  function renderQuickStart(preview) {
    const result = preview.result;
    const sun = result.sun || {};
    const moon = result.moon || {};
    const sunKey = sun.sign || SIGN_KEY_BY_DE[sun.sign_de];
    const moonKey = moon.sign || SIGN_KEY_BY_DE[moon.sign_de];
    const zodiac = ZODIAC.find((z) => z.s === sun.sign_de);
    setText("qsSunGlyph", zodiac ? zodiac.g : "☉");
    setText("qsSun", signDisplay(sun));
    setText("qsSunText", sun.uncertain ? t("Du bist an einem Wechseltag geboren – mit deiner Geburtszeit sagt Soraya dir genau, welches Zeichen es ist.") : (SUN_TEXTS[sunKey] ? t(SUN_TEXTS[sunKey]) : ""));
    setText("qsMoon", signDisplay(moon));
    setText("qsMoonText", moon.uncertain ? t("Der Mond hat an deinem Geburtstag das Zeichen gewechselt – mit Geburtszeit wird es genau.") : (MOON_TEXTS[moonKey] ? t(MOON_TEXTS[moonKey]) : ""));
    const signPerson = sunKey ? (LANG() === "de" ? SIGN_PERSON[sunKey] : trSign(sunKey)) : t("Sternzeichen");
    setText("qsHoroLabel", t("Dein Tag als {sign}", { sign: signPerson }));
    const ribbon = $("heroRibbon");
    if (!getCurrentPersonId()) setText("heroSub", t("Das verraten Sonne und Mond über dich – und so wird dein Tag heute."));
    if (ribbon && !getCurrentPersonId()) {
      ribbon.innerHTML = "<span><b>☉</b> " + escapeHtml(signDisplay(sun)) + "</span><span><b>☾</b> " + escapeHtml(signDisplay(moon)) + "</span>";
      ribbon.classList.add("is-personal");
    }

    updateQuickStartCta();

    const form = $("qsForm");
    const box = $("qsResult");
    if (form) form.style.display = "none";
    if (box) box.style.display = "block";
    document.body.classList.add("r5-qs-shown");
    if (sunKey && !sun.uncertain) loadSignHoroscope(sunKey);
    else {
      setText("qsHoroMood", t("Dein Tag"));
      setText("qsHoroText", t("Gib deine Geburtszeit an, dann zeigt Soraya dir das passende Tageshoroskop."));
      setText("qsHoroTip", "");
    }
  }

  async function updateQuickStartCta() {
    const state = await getSessionState();
    const cta = $("qsCtaText");
    if (cta) {
      cta.innerHTML = state.ok
        ? t("Ergänze Name und Geburtsort – dann wird alles <b>persönlich</b>.")
        : t("Dein <b>persönliches</b> Horoskop, Geburtshoroskop und Chat – kostenlos mit Konto.");
    }
    setText("qsCtaButton", state.ok ? t("Profil vervollständigen") : t("Kostenlos registrieren"));
    const login = $("qsLoginLink");
    if (login) login.style.display = state.ok ? "none" : "";
  }

  async function loadSignHoroscope(signKey) {
    try {
      setText("qsHoroMood", t("Soraya liest die Sterne…"));
      const json = await publicJson("/public/sign-horoscope?sign=" + encodeURIComponent(signKey) + "&lang=" + encodeURIComponent(LANG()));
      const d = json.data || {};
      setText("qsHoroMood", d.stimmung || t("Dein Tag"));
      setText("qsHoroText", d.text || "");
      setText("qsHoroTip", d.tipp ? "✦ " + d.tipp : "");
      return d;
    } catch (error) {
      setText("qsHoroMood", t("Gleich verfügbar"));
      setText("qsHoroText", t("Das Tageshoroskop ist gerade kurz nicht erreichbar. Versuch es in einem Moment noch einmal."));
      return null;
    }
  }

  function quickStartValue(id) {
    const node = $(id);
    const raw = node ? node.value.trim() : "";
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  }

  async function quickStart() {
    const birth = {
      day: quickStartValue("qsDay"), month: quickStartValue("qsMonth"), year: quickStartValue("qsYear"),
      hour: quickStartValue("qsHour"), minute: quickStartValue("qsMinute")
    };
    if (!birth.day || !birth.month || !birth.year || [birth.day, birth.month, birth.year].some(Number.isNaN)) {
      status("qsStatus", t("Bitte Tag, Monat und Jahr eingeben."), "bad");
      return;
    }
    const thisYear = new Date().getFullYear();
    const probe = new Date(birth.year, birth.month - 1, birth.day);
    if (birth.year < 1900 || birth.year > thisYear || probe.getMonth() !== birth.month - 1 || probe.getDate() !== birth.day) {
      status("qsStatus", t("Dieses Datum gibt es nicht. Bitte prüfe Tag, Monat und Jahr (z. B. 05 · 11 · 1990)."), "bad");
      return;
    }
    if ((birth.hour !== null && (Number.isNaN(birth.hour) || birth.hour < 0 || birth.hour > 23)) ||
        (birth.minute !== null && (Number.isNaN(birth.minute) || birth.minute < 0 || birth.minute > 59))) {
      status("qsStatus", t("Bitte die Uhrzeit als Stunde 0–23 und Minute 0–59 eingeben – oder leer lassen."), "bad");
      return;
    }
    if (birth.hour !== null && birth.minute === null) birth.minute = 0;
    const button = $("qsButton");
    if (button) button.disabled = true;
    status("qsStatus", t("Soraya berechnet deinen Kosmos…"));
    try {
      const json = await publicJson("/public/preview", birth);
      const preview = { birth, result: json.data, at: new Date().toISOString() };
      writeJson(PREVIEW_KEY, preview);
      status("qsStatus", "");
      renderQuickStart(preview);
      // Ergebnis sofort ins Blickfeld holen (der Moment, auf den der Gast wartet)
      const card = $("quickStartCard");
      if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ behavior: "smooth", block: "start" });
      track("quickstart_done", { time_known: birth.hour !== null });
      // anonym zaehlen (auch ohne Konto) -- sonst sieht die Statistik nur eingeloggte Schnellstarts
      publicEvent("quickstart_done");
      if (quelle()) publicEvent("schnellstart");
    } catch (error) {
      status("qsStatus", friendlyError(error, t("Das hat nicht geklappt. Bitte Datum prüfen.")), "bad");
    } finally {
      if (button) button.disabled = false;
    }
  }

  // Leerer Zustand (z. B. Horoskop ohne Daten): direkt zum Schnellstart springen
  function goToQuickStart() {
    if (typeof window.showSection === "function") window.showSection("home");
    window.setTimeout(() => {
      const card = $("quickStartCard");
      if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
      const day = $("qsDay");
      if (day && day.offsetParent) day.focus({ preventScroll: true });
    }, 120);
  }

  function quickStartEdit() {
    const preview = readPreview();
    const form = $("qsForm");
    const box = $("qsResult");
    if (preview) {
      const b = preview.birth;
      [["qsDay", b.day], ["qsMonth", b.month], ["qsYear", b.year], ["qsHour", b.hour], ["qsMinute", b.minute]].forEach(([id, v]) => {
        if ($(id)) $(id).value = v === null || v === undefined ? "" : v;
      });
    }
    if (box) box.style.display = "none";
    if (form) form.style.display = "block";
    document.body.classList.remove("r5-qs-shown");
    if (preview && preview.birth.hour !== null && preview.birth.hour !== undefined) toggleQuickStartTime(true);
  }

  function toggleQuickStartTime(open) {
    const row = $("qsTimeRow");
    const btn = $("qsTimeToggle");
    if (!row || !btn) return;
    const next = open === undefined ? row.hidden : !!open;
    row.hidden = !next;
    btn.setAttribute("aria-expanded", next ? "true" : "false");
    btn.hidden = next;
    if (next && open === undefined && $("qsHour")) $("qsHour").focus();
  }

  // Schnellstart-Felder: nach 2 Ziffern automatisch weiter, Enter rechnet sofort
  function bindQuickStartFields() {
    const chain = [["qsDay", 2, "qsMonth"], ["qsMonth", 2, "qsYear"], ["qsHour", 2, "qsMinute"],
      ["ivDay", 2, "ivMonth"], ["ivMonth", 2, "ivYear"], ["ivHour", 2, "ivMinute"]];
    chain.forEach(([id, len, next]) => {
      const node = $(id);
      if (!node || node.dataset.chain) return;
      node.dataset.chain = "1";
      node.addEventListener("input", () => {
        node.value = node.value.replace(/\D/g, "");
        if (node.value.length >= len && $(next) && !$(next).value) $(next).focus();
      });
    });
    ["qsDay", "qsMonth", "qsYear", "qsHour", "qsMinute"].forEach((id) => {
      const node = $(id);
      if (!node || node.dataset.enter) return;
      node.dataset.enter = "1";
      if (id === "qsYear" || id === "qsMinute") node.addEventListener("input", () => { node.value = node.value.replace(/\D/g, ""); });
      node.setAttribute("enterkeyhint", "go");
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); quickStart(); }
      });
    });
    const toggle = $("qsTimeToggle");
    if (toggle && !toggle.dataset.bound) {
      toggle.dataset.bound = "1";
      toggle.addEventListener("click", () => toggleQuickStartTime());
    }
    const preview = readPreview();
    if ((preview && preview.birth.hour !== null && preview.birth.hour !== undefined) || ($("qsHour") && $("qsHour").value)) toggleQuickStartTime(true);
  }

  async function quickStartCta() {
    const state = await getSessionState();
    if (state.ok) {
      showSection("profile");
      window.setTimeout(prefillProfileFromPreview, 120);
      return;
    }
    try {
      localStorage.setItem("soraya_after_login_section", "profile");
      localStorage.setItem("soraya_after_login_path", "/?section=profile");
    } catch (error) {}
    publicEvent("register_click");
    window.location.href = LOGIN_PATH + "?mode=register";
  }

  // Nach Login/Registrierung: Datum aus dem Schnellstart ins leere Profil uebernehmen.
  function prefillProfileFromPreview() {
    if (getCurrentPersonId()) return;
    const draft = readJson(PROFILE_DRAFT_KEY, null);
    if (draft) {
      let filledDraft = false;
      [["pName", draft.name], ["pDay", draft.day], ["pMonth", draft.month], ["pYear", draft.year], ["pHour", draft.hour], ["pMinute", draft.minute], ["pBirthplace", draft.birthplace]].forEach(([id, v]) => {
        const node = $(id);
        if (node && !node.value && v !== null && v !== undefined && v !== "") { node.value = v; filledDraft = true; }
      });
      if (filledDraft) {
        status("personResult", t("✦ Deine Angaben sind eingetragen – tippe auf „Profil speichern“."), "ok");
        previewIdentityFromForm();
        return;
      }
    }
    const preview = readPreview();
    if (!preview) return;
    const b = preview.birth;
    let filled = false;
    [["pDay", b.day], ["pMonth", b.month], ["pYear", b.year], ["pHour", b.hour], ["pMinute", b.minute]].forEach(([id, v]) => {
      const node = $(id);
      if (node && !node.value && v !== null && v !== undefined) { node.value = v; filled = true; }
    });
    if (filled) {
      status("personResult", t("✦ Dein Geburtsdatum aus dem Schnellstart ist eingetragen. Ergänze Name und Geburtsort und speichere dein Profil."), "ok");
      previewIdentityFromForm();
    }
  }

  // Von der Landingpage: Geburtsdatum mitgegeben -> Schnellstart sofort ausfuellen und rechnen
  function takeBirthFromUrl() {
    try {
      const url = new URL(window.location.href);
      const geb = url.searchParams.get("geb");
      if (geb === null) return false;
      const zeit = url.searchParams.get("zeit") || "";
      url.searchParams.delete("geb");
      url.searchParams.delete("zeit");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(geb);
      if (!m || getCurrentPersonId()) return false;
      const z = /^(\d{2}):(\d{2})$/.exec(zeit);
      [["qsYear", m[1]], ["qsMonth", String(+m[2])], ["qsDay", String(+m[3])],
       ["qsHour", z ? String(+z[1]) : ""], ["qsMinute", z ? String(+z[2]) : ""]].forEach(([id, v]) => { if ($(id)) $(id).value = v; });
      return true;
    } catch (error) {
      return false;
    }
  }

  async function restoreQuickStart() {
    if (takeBirthFromUrl()) {
      if ($("qsHour") && $("qsHour").value) toggleQuickStartTime(true);
      const form = $("qsForm");
      if (form) form.style.display = "block";
      await quickStart();
    }
    const preview = readPreview();
    if (preview) renderQuickStart(preview);
    else updateQuickStartCta();
    const state = await getSessionState();
    let counted = false;
    try { counted = sessionStorage.getItem("soraya_qs_open") === "1"; } catch (error) {}
    if (!state.ok && !counted) {
      try { sessionStorage.setItem("soraya_qs_open", "1"); } catch (error) {}
      publicEvent("quickstart_open");
    }
  }

  // ---------------------------------------------------------------------------
  // Partner-Einladung
  // Einladende: Link teilen. Eingeladene: ?einladung=CODE -> Karte mit
  // Geburtsdatum -> Ergebnis in Prozent -> Registrieren. Von der einladenden
  // Person sieht man nur Vornamen und Sternzeichen (Backend).
  // ---------------------------------------------------------------------------
  const INVITE_KEY = "soraya_invite_code";
  const INVITE_RE = /^[A-Za-z0-9]{8,24}$/;
  let inviteInfo = null;

  async function shareInvite() {
    if (!getCurrentPersonId()) {
      toast(t("Bitte zuerst dein Profil speichern."));
      showSection("profile");
      return;
    }
    status("inviteShareStatus", t("Dein Einladungslink wird erstellt…"));
    try {
      const json = await callSoraya("/mobile/invite/create", {}, "POST", 15000);
      const url = json.data && json.data.url;
      if (!url) throw new Error(t("Kein Link erhalten."));
      const text = t("Wie gut passen wir zusammen? ✨ Gib dein Geburtsdatum ein und sieh unser Ergebnis bei Soraya:");
      let method = "copy";
      if (navigator.share) {
        try {
          await navigator.share({ title: t("Soraya – Wie gut passen wir zusammen?"), text, url });
          method = "share";
        } catch (error) {
          if (error && error.name === "AbortError") { status("inviteShareStatus", ""); return; }
          method = "copy";
        }
      }
      if (method === "copy") {
        try { await navigator.clipboard.writeText(text + " " + url); toast(t("Link kopiert – jetzt einfügen und senden.")); } catch (error) {}
      }
      status("inviteShareStatus", method === "share" ? t("✦ Einladung geteilt.") : t("Dein Link: {url}", { url }), "ok");
      track("invite_shared", { method });
    } catch (error) {
      status("inviteShareStatus", friendlyError(error, t("Link konnte nicht erstellt werden.")), "bad");
      trackError("invite", error);
    }
  }

  function takeInviteFromUrl() {
    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("einladung");
      if (code && INVITE_RE.test(code)) localStorage.setItem(INVITE_KEY, code);
      if (code !== null) {
        url.searchParams.delete("einladung");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      }
    } catch (error) {}
  }

  function inviteResultKey(code) { return "soraya_invite_result_" + code; }

  async function renderInviteCard() {
    const card = $("inviteCard");
    if (!card) return;
    let code = "";
    try { code = localStorage.getItem(INVITE_KEY) || ""; } catch (error) {}
    if (!INVITE_RE.test(code)) { card.hidden = true; document.body.classList.remove("soraya-invite"); return; }
    try {
      const json = await publicJson("/public/invite/" + encodeURIComponent(code));
      inviteInfo = json.data || {};
    } catch (error) {
      if (/gibt es nicht/i.test((error && (error.raw || error.message)) || "")) {
        try { localStorage.removeItem(INVITE_KEY); } catch (e) {}
      }
      card.hidden = true;
      document.body.classList.remove("soraya-invite");
      return;
    }
    const name = inviteInfo.name || t("Jemand");
    const inviterSign = trSign(inviteInfo.sun_sign || inviteInfo.sun_sign_de);
    setText("inviteName", name);
    setText("inviteLead", t("Wie gut passt ihr zusammen?") + " " + (inviterSign ? t("{name} ist {sign}.", { name, sign: inviterSign }) : name + ".") + " " + t("Gib dein Geburtsdatum ein – Soraya rechnet es sofort aus."));
    card.hidden = false;
    document.body.classList.add("soraya-invite");
    const saved = readJson(inviteResultKey(code), null);
    if (saved) showInviteResult(saved);
    updateInviteCta();
  }

  function showInviteResult(d) {
    const you = d.you || {};
    const inviter = d.inviter || {};
    setText("ivPercent", (d.score_percent != null ? d.score_percent : "–") + " %");
    setText("ivLabel", d.score_label ? t(d.score_label) : "");
    const sun = you.sun ? signDisplay(you.sun) : "";
    const moon = you.moon ? signDisplay(you.moon) : "";
    const parts = [];
    const inviterSign = trSign(inviter.sun_sign || inviter.sun_sign_de);
    if (inviterSign && sun) {
      parts.push(moon
        ? t("{name} ist {sign}, du bist {you} mit Mond in {moon}.", { name: inviter.name || t("Jemand"), sign: inviterSign, you: sun, moon })
        : t("{name} ist {sign}, du bist {you}.", { name: inviter.name || t("Jemand"), sign: inviterSign, you: sun }));
    }
    if (d.harmonious != null) {
      parts.push(d.tone
        ? t("Zwischen euch gibt es {good} harmonische und {hard} spannungsreiche Verbindungen – der Grundton ist {tone}.", { good: d.harmonious, hard: d.challenging || 0, tone: t(d.tone) })
        : t("Zwischen euch gibt es {good} harmonische und {hard} spannungsreiche Verbindungen.", { good: d.harmonious, hard: d.challenging || 0 }));
    }
    setText("ivDetail", parts.join(" "));
    setText("inviteLead", t("So passt ihr laut euren Geburtshoroskopen zusammen:"));
    if ($("inviteForm")) $("inviteForm").hidden = true;
    if ($("inviteResult")) $("inviteResult").hidden = false;
  }

  async function inviteMatch() {
    let code = "";
    try { code = localStorage.getItem(INVITE_KEY) || ""; } catch (error) {}
    if (!INVITE_RE.test(code)) return;
    const v = (id) => quickStartValue(id);
    const birth = { day: v("ivDay"), month: v("ivMonth"), year: v("ivYear"), hour: v("ivHour"), minute: v("ivMinute") };
    if (!birth.day || !birth.month || !birth.year || [birth.day, birth.month, birth.year].some(Number.isNaN)) {
      status("ivStatus", t("Bitte Tag, Monat und Jahr eingeben."), "bad");
      return;
    }
    if (birth.hour !== null && birth.minute === null) birth.minute = 0;
    const button = $("ivButton");
    if (button) button.disabled = true;
    status("ivStatus", t("Soraya vergleicht eure Sterne…"));
    try {
      const json = await publicJson("/public/invite/" + encodeURIComponent(code) + "/match", birth);
      const d = json.data || {};
      writeJson(inviteResultKey(code), d);
      // Fuer spaeter: Datum in den Schnellstart/ins Profil uebernehmen
      if (!readPreview() && d.you) writeJson(PREVIEW_KEY, { birth, result: d.you, at: new Date().toISOString() });
      status("ivStatus", "");
      showInviteResult(d);
      updateInviteCta();
    } catch (error) {
      status("ivStatus", friendlyError(error, t("Das hat nicht geklappt. Bitte Datum prüfen.")), "bad");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function updateInviteCta() {
    const state = await getSessionState();
    const name = (inviteInfo && inviteInfo.name) || t("die Person");
    const cta = $("ivCtaText");
    if (state.ok && getCurrentPersonId()) {
      if (cta) cta.innerHTML = t("Für eure <b>ganze Deutung</b> lege {name} bei „Deine Menschen“ an und starte den Partner-Vergleich.", { name: escapeHtml(name) });
      setText("ivCtaButton", t("{name} hinzufügen", { name }));
    } else if (state.ok) {
      if (cta) cta.innerHTML = t("Speichere dein Profil – dann bekommst du eure <b>ganze Deutung</b> und dein persönliches Horoskop.");
      setText("ivCtaButton", t("Profil vervollständigen"));
    } else {
      if (cta) cta.innerHTML = t("Eure <b>ganze Deutung</b> – Harmonie, Spannung, Anziehung und Kommunikation – und dein persönliches Horoskop bekommst du mit einem kostenlosen Konto.");
      setText("ivCtaButton", t("Kostenlos registrieren"));
    }
  }

  async function inviteCta() {
    const state = await getSessionState();
    if (state.ok && getCurrentPersonId()) { addPerson(); return; }
    if (state.ok) { showSection("profile"); window.setTimeout(prefillProfileFromPreview, 120); return; }
    try {
      localStorage.setItem("soraya_after_login_section", "profile");
      localStorage.setItem("soraya_after_login_path", "/?section=profile");
    } catch (error) {}
    publicEvent("register_click");
    window.location.href = LOGIN_PATH + "?mode=register";
  }

  function closeInvite() {
    try { localStorage.removeItem(INVITE_KEY); } catch (error) {}
    const card = $("inviteCard");
    if (card) card.hidden = true;
    document.body.classList.remove("soraya-invite");
  }

  // ---------------------------------------------------------------------------
  // Der Himmel heute (fuer alle gleich, Backend /sky, stuendlich aktuell)
  // ---------------------------------------------------------------------------
  const WEEKDAYS = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
  const MONTHS_SHORT = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

  function formatDay(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    // Ungarisch: Kurzformen wie "H", "V" sind kaum lesbar -> Wochentag ausschreiben
    if (I18N && LANG() === "hu") return I18N.formatDate(d, { month: "short", day: "numeric", weekday: "long" });
    if (I18N && LANG() !== "de") return I18N.formatDate(d, { weekday: "short", day: "numeric", month: "short" });
    return WEEKDAYS[d.getDay()] + ", " + d.getDate() + ". " + MONTHS_SHORT[d.getMonth()];
  }

  function daysUntil(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const days = Math.round((target - start) / 86400000);
    if (days <= 0) return t("heute");
    if (days === 1) return t("morgen");
    return t("in {n} Tagen", { n: days });
  }

  // "noch 5 Tage" (Restdauer) statt "in 5 Tagen"
  function remainingDays(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const today = new Date();
    const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
    if (days <= 0) return t("heute");
    if (days === 1) return t("morgen");
    return t("noch {n} Tage", { n: days });
  }

  function skyRows(sky) {
    const rows = [];
    const moon = sky.moon || {};
    const phase = ASTRO && moon.phase_index != null ? ASTRO.moonPhase(moon.phase_index) : (ASTRO && ASTRO.moonPhaseIndexOf(moon.phase) >= 0 ? ASTRO.moonPhase(ASTRO.moonPhaseIndexOf(moon.phase)) : moon.phase);
    // Die Mondphasen-Karte direkt darueber zeigt Zeichen und Licht schon -> hier nicht doppelt
    if (!$("moonVisual")) rows.push(transitRow("☾", t("Mond in {sign}", { sign: trSign(moon.sign || moon.sign_de) || "–" }), (phase || t("Mondphase")) + " · " + t("{value} % beleuchtet", { value: moon.illumination ?? "–" })));

    const full = sky.next_full_moon;
    const fresh = sky.next_new_moon;
    const lunations = [
      fresh ? { glyph: "●", title: ASTRO ? ASTRO.moonPhase(0) : "Neumond", when: fresh, text: t("Zeit für neue Absichten") } : null,
      full ? { glyph: "○", title: ASTRO ? ASTRO.moonPhase(4) : "Vollmond", when: full, text: t("Höhepunkt und Loslassen") } : null
    ].filter(Boolean).sort((a, b) => new Date(a.when) - new Date(b.when));
    lunations.forEach((l) => rows.push(transitRow(l.glyph, l.title + " · " + formatDay(l.when), l.text, daysUntil(l.when))));

    const personal = ["Merkur", "Venus", "Mars"];
    const retro = Array.isArray(sky.retrograde) ? sky.retrograde : [];
    retro.filter((r) => personal.includes(r.planet)).forEach((r) => {
      rows.push(transitRow(planetGlyph(r.planet), t("{planet} rückläufig", { planet: trPlanet(r.key || r.planet) }), r.until ? t("bis {date}: Altes überdenken, nichts überstürzen", { date: formatDay(r.until) }) : t("Altes überdenken"), r.until ? remainingDays(r.until) : ""));
    });
    const slow = retro.filter((r) => !personal.includes(r.planet)).map((r) => trPlanet(r.key || r.planet));
    if (slow.length) {
      rows.push(transitRow("℞", t("{planet} rückläufig", { planet: slow.join(", ") }), t("Langsame Planeten: innere Themen statt äußerer Tempo-Wechsel")));
    }
    (Array.isArray(sky.retrograde_soon) ? sky.retrograde_soon : []).forEach((r) => {
      rows.push(transitRow(planetGlyph(r.planet), t("{planet} wird rückläufig", { planet: trPlanet(r.key || r.planet) }), t("ab {date}", { date: formatDay(r.from) }), daysUntil(r.from)));
    });
    return rows.join("");
  }

  // Mond-Karte und Begruessungs-Satz aus den genauen Himmelsdaten des Servers
  // (auch nachdem das Profil nachgeladen wurde -- sonst blieb die grobe lokale Rechnung stehen)
  function applySkyMoon() {
    if (!skyToday) return;
    const moon = skyToday.moon || {};
    const moonSign = trSign(moon.sign || moon.sign_de);
    if (moonSign && getCurrentPersonId()) {
      setText("heroSub", t("Heute wandert der Mond durch {sign} – hier ist, was das für dich bedeutet.", { sign: moonSign }));
    }

    if (moon.phase_index != null && ASTRO) setText("moonPhase", ASTRO.moonPhase(moon.phase_index));
    else if (moon.phase) setText("moonPhase", moon.phase);
    if (moon.illumination !== undefined) {
      setText("moonIllum", (moonSign ? t("Mond in {sign}", { sign: moonSign }) + " · " : "") + t("{value} % beleuchtet", { value: moon.illumination }));
      // Bild aus den genauen Werten des Servers (die eigene Rechnung nutzt nur den mittleren Mondmonat)
      const winkel = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * Number(moon.illumination) / 100))) * 180 / Math.PI;
      const zunehmend = moon.phase_index == null ? true : Number(moon.phase_index) < 4;
      if ($("moonVisual") && Number.isFinite(winkel)) $("moonVisual").innerHTML = moonSvg(zunehmend ? winkel : 360 - winkel);
    }
  }

  async function renderSkyToday(force = false) {
    const box = $("skyList");
    if (!box) return;
    if (!force && skyToday && Date.now() - lastSkyTodayAt < 60 * 60 * 1000) return;
    try {
      const config = getConfig();
      const response = await fetchWithTimeout(config.engineUrl.replace(/\/$/, "") + "/sky", { method: "GET" }, 15000);
      const json = await readEngine(response);
      if (!json.data) throw engineFail(502, null);
      skyToday = json.data;
      lastSkyTodayAt = Date.now();
      setEngineReachable(true);
      box.innerHTML = skyRows(skyToday);
      applySkyMoon();
      renderChatSuggestions();
    } catch (error) {
      if (isNetworkError(error) || (error && error.code === "server")) setEngineReachable(false);
      if (!skyToday) box.innerHTML = transitRow("☾", t("Himmelsereignisse"), t("Gerade kurz nicht erreichbar. Soraya versucht es später erneut."));
    }
  }

  function previewIdentityFromForm() {
    const typed = ($("pName") && $("pName").value.trim()) || localStorage.getItem(KEYS.name) || "";
    setText("profileTitle", typed || t("Dein Profil"));
    setText("profileInitial", typed ? typed[0].toUpperCase() : "✦");

    const day = Number(($("pDay") && $("pDay").value) || 0);
    const month = Number(($("pMonth") && $("pMonth").value) || 0);
    if (day && month) renderSun(day, month);
  }

  function setAppStatus(text, type = "") {
    const pill = $("appStatusPill");
    if (!pill) return;
    pill.textContent = text;
    pill.classList.remove("ok", "warn");
    if (type) pill.classList.add(type);
  }

  // Offline / Server nicht erreichbar: oben ein klarer, antippbarer Hinweis
  // statt falscher Aufforderungen ("Profil anlegen", obwohl es nur nicht laedt).
  let engineReachable = true;

  function isNetworkError(error) {
    if (error && error.code) return error.code === "timeout";
    return /Failed to fetch|NetworkError|Load failed|timeout|zu lange/i.test((error && error.message) || String(error || ""));
  }

  function setEngineReachable(ok) {
    if (engineReachable === ok) return;
    engineReachable = ok;
    renderAppStatus();
  }

  function retryConnection() {
    setAppStatus(t("Soraya verbindet…"), "warn");
    engineReachable = true;   // Ergebnis der neuen Abfragen entscheidet
    loadPeopleFromSupabase(false);
    renderHomeSkyThrottled(true);
    renderSkyToday(true);
    const active = document.querySelector(".section.active");
    if (active && active.id === "horoscope") loadHoroscope({ silent: true });
  }

  async function renderAppStatus() {
    const birth = readJson(KEYS.birth, null);
    const state = await getSessionState();

    const pill = $("appStatusPill");
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (offline || !engineReachable) {
      setAppStatus(offline ? t("Offline · keine Internetverbindung") : t("Verbindung wackelt · erneut versuchen ›"), "warn");
      if (pill) pill.dataset.action = offline ? "" : "retry";
      return;
    }
    if (!state.ok) {
      setAppStatus(t("Jetzt einloggen ›"), "warn");
      if (pill) pill.dataset.action = "login";
      return;
    }

    if (!birth || !birth.name) {
      setAppStatus(t("Profil anlegen ›"), "warn");
      if (pill) pill.dataset.action = "profile";
      return;
    }

    if (pill) pill.dataset.action = "";
    setAppStatus(t("Soraya · aktiv"), "ok");
  }

  function showLoadingVeil(text = t("Soraya lädt…")) {
    const veil = $("loadingVeil");
    if (!veil) return;
    const p = veil.querySelector("p");
    if (p) p.textContent = text;
    veil.classList.add("show");
    veil.setAttribute("aria-hidden", "false");
  }

  function hideLoadingVeil() {
    const veil = $("loadingVeil");
    if (!veil) return;
    veil.classList.remove("show");
    veil.setAttribute("aria-hidden", "true");
  }

  function bindUiEvents() {
    // Ausklappbare Listen (z. B. weitere Transite)
    if (!document.body.dataset.collapseBound) {
      document.body.dataset.collapseBound = "1";
      document.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-collapse]");
        if (!btn) return;
        const target = document.getElementById(btn.getAttribute("data-collapse"));
        if (!target) return;
        const open = target.classList.toggle("is-open");
        btn.classList.toggle("is-open", open);
        if (open) {
          btn.textContent = t("Weniger anzeigen");
        } else {
          const count = target.children.length;
          btn.textContent = t("Weitere {n} Transite anzeigen", { n: count });
        }
      });
    }

    const brand = document.querySelector(".brand");
    if (brand && !brand.dataset.bound) {
      brand.dataset.bound = "1";
      brand.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showSection("home");
        }
      });
    }

    const peopleBox = $("homePeopleList");
    if (peopleBox && !peopleBox.dataset.bound) {
      peopleBox.dataset.bound = "1";
      peopleBox.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-person]");
        if (btn) openSynastryWith(btn.getAttribute("data-person"));
      });
    }

    const periodSelect = $("period");
    if (periodSelect && !periodSelect.dataset.bound) {
      periodSelect.dataset.bound = "1";
      periodSelect.addEventListener("change", () => loadHoroscope({ silent: true }));
    }

    const appStatus = $("appStatusPill");
    if (appStatus && !appStatus.dataset.bound) {
      appStatus.dataset.bound = "1";
      appStatus.addEventListener("click", () => {
        if (appStatus.dataset.action === "login") openLogin();
        if (appStatus.dataset.action === "profile") showSection("profile");
        if (appStatus.dataset.action === "retry") retryConnection();
      });
    }

    const synSelect = $("synPersonSelect");
    if (synSelect && !synSelect.dataset.bound) {
      synSelect.dataset.bound = "1";
      synSelect.addEventListener("change", () => {
        const raw = $("personBId");
        const changed = raw && raw.value !== (synSelect.value || "");
        if (raw) raw.value = synSelect.value || "";
        updateSynastryNames();
        // Anderes Gegenueber gewaehlt: altes Ergebnis nicht stehen lassen
        if (changed && !synRunning) { resetSynastryResult(); synShowSaved(); }
      });
    }

    document.addEventListener("click", (event) => {
      const panel = $("settingsModal");
      if (!panel || !panel.classList.contains("open")) return;
      if (event.target === panel) closeSettings();
    });
  }

  function auditButtons() {
    const broken = Array.from(document.querySelectorAll("button")).filter((button) => {
      if (button.disabled) return false;
      if (button.closest(".section") && !button.closest(".section").classList.contains("active")) return false;
      return !button.onclick && !button.getAttribute("onclick");
    });

    if (broken.length) {
      console.warn("Soraya Button Audit: Buttons ohne Funktion", broken);
      // bewusst kein user-sichtbarer Status mehr (war Entwickler-Hinweis)
    }
  }

  let bootstrapped = false;

  async function bootstrap() {
    if (bootstrapped) return;
    bootstrapped = true;
    loadConfig(false);
    quelleAusLink();
    // Zuerst pruefen, ob noch derselbe Nutzer angemeldet ist -- sonst wuerden
    // fremde Profil-Daten kurz angezeigt.
    await ensureSameUser();

    const storedPersonId = localStorage.getItem(KEYS.person);
    if ($("personId") && storedPersonId) $("personId").value = storedPersonId;

    const storedConversation = localStorage.getItem(KEYS.conv);
    if ($("conversationId") && storedConversation) $("conversationId").value = storedConversation;

    renderMoon();
    renderIdentity();
    renderProfilePreview();
    renderWheel(null);
    renderHomeSkyThrottled();
    renderSkyToday(true);
    takeInviteFromUrl();
    renderInviteCard();
    bindQuickStartFields();
    restoreQuickStart();
    renderIosHint();
    renderAndroidHint();
    renderAuthUi();
    bindUiEvents();
    cacheSelfFromStorage();
    refreshSynastryPeople();
    renderHomePeople();
    // Erst-Sync mit dem Server. Nur bei einem Fehler (Netz/Backend) erneut
    // versuchen -- eine leere Personenliste ist bei neuen Nutzern normal.
    (function syncWithRetry(attempt) {
      loadPeopleFromSupabase(false).then(function () {
        if (serverPeople === null && attempt < 3) {
          window.setTimeout(function () { syncWithRetry(attempt + 1); }, 1500 * (attempt + 1));
        }
      });
    })(0);
    renderOnboardingState();
    renderAppStatus();
    renderDeveloperTools();

    try {
      // Nur direkt nach einem Login zur gemerkten Seite springen.
      // Normaler App-Start (auch als installierte App) landet immer auf Home.
      const afterLogin = localStorage.getItem("soraya_after_login_section");
      if (afterLogin && $(afterLogin)) {
        localStorage.removeItem("soraya_after_login_section");
        window.setTimeout(() => showSection(afterLogin), 120);
      } else {
        showSection("home");
      }
    } catch (error) {}

    try {
      if (sessionStorage.getItem("soraya_just_logged_out") === "1") {
        sessionStorage.removeItem("soraya_just_logged_out");
        window.setTimeout(() => toast(t("Abgemeldet. Bis bald ✨")), 400);
      }
    } catch (error) {}

    window.setTimeout(auditButtons, 500);
    track("app_open", { standalone: isStandalone(), ios: isIos(), lang: LANG() });
  }

  // Sprachwahl (i18n.js): im Konto merken, damit sie auf allen Geraeten gilt
  window.sorayaOnLangChange = async (code) => {
    await track("lang_changed", { lang: code });
    const state = await getSessionState();
    if (!state.ok || !state.session || !state.session.user) return;
    await sb.from("profiles").update({ locale: code }).eq("id", state.session.user.id);
  };

  window.toast = toast;
  window.status = status;
  window.safe = safe;
  window.escapeHtml = escapeHtml;
  window.markdownToHtml = markdownToHtml;
  window.friendlyError = friendlyError;
  window.showGlobalError = showGlobalError;
  window.hideGlobalError = hideGlobalError;

  window.showSection = showSection;
  window.openLogin = openLogin;
  window.openSettings = openSettings;
  window.closeSettings = closeSettings;

  window.initSupabase = initSupabase;
  window.saveConfig = saveConfig;
  window.loadConfig = loadConfig;
  window.checkSorayaConnection = checkSorayaConnection;
  window.getEngineUrl = getEngineUrl;
  window.getToken = getToken;
  window.callSoraya = callSoraya;

  window.signOut = signOut;
  window.createPerson = createPerson;
  window.needPerson = needPerson;
  window.loadAnalysis = loadAnalysis;
  window.loadHoroscope = loadHoroscope;
  window.appendBubble = appendBubble;
  window.clearChatView = clearChatView;
  window.quickChat = quickChat;
  window.sendChat = sendChat;
  // Vom Horoskop direkt ins Gespraech: Soraya erklaert den heutigen Impuls genauer
  window.sorayaAskAboutHoroscope = () => {
    const mood = (($("horoMood") && $("horoMood").textContent) || "").trim();
    const period = currentPeriod();
    const q = period === "weekly" ? t("Erklär mir mein Wochenhoroskop genauer: Worauf kommt es diese Woche für mich an?")
      : period === "monthly" ? t("Erklär mir mein Monatshoroskop genauer: Worauf kommt es diesen Monat für mich an?")
      : t("Erklär mir mein Tageshoroskop genauer: Was bedeutet „{mood}“ heute für mich?", { mood: mood || t("Dein Tag") });
    quickChat(q);
  };

  window.loadPeopleFromSupabase = loadPeopleFromSupabase;
  window.refreshSynastryPeople = refreshSynastryPeople;
  window.sorayaAddPerson = addPerson;
  window.sorayaQuickStart = quickStart;
  window.sorayaDismissIosHint = dismissIosHint;
  window.sorayaDismissAndroidHint = dismissAndroidHint;
  window.sorayaTrackPlay = () => { track("android_play_click", {}); if (quelle()) publicEvent("store_klick"); };
  window.sorayaShareInvite = shareInvite;
  window.sorayaInviteMatch = inviteMatch;
  window.sorayaInviteCta = inviteCta;
  window.sorayaCloseInvite = closeInvite;
  window.sorayaQuickStartEdit = quickStartEdit;
  window.sorayaGoToQuickStart = goToQuickStart;
  window.sorayaQuickStartCta = quickStartCta;
  window.sorayaOpenSynastryWith = openSynastryWith;
  window.createSynastryPerson = createSynastryPerson;
  window.saveSynastry = saveSynastry;
  window.teileTrio = teileTrio;
  window.teileSynastrie = teileSynastrie;
  window.renderSynastryDescription = renderSynastryDescription;

  // Doppeltippen: Solange ein Speichern/Berechnen laeuft, startet ein zweiter
  // Tipp nicht noch einmal denselben Auftrag (doppelte Personen, doppelte Kosten).
  // Der getippte Knopf zeigt waehrenddessen, dass er arbeitet.
  const onceRunning = new Set();
  ["createPerson", "createSynastryPerson", "saveSynastry", "sorayaQuickStart", "sorayaInviteMatch",
    "sorayaShareInvite", "teileTrio", "teileSynastrie", "signOut"].forEach((name) => {
    const fn = window[name];
    if (typeof fn !== "function") return;
    window[name] = function (...args) {
      if (onceRunning.has(name)) return undefined;
      const ev = window.event;
      const button = ev && ev.type === "click" && ev.target && ev.target.closest ? ev.target.closest("button") : null;
      const result = fn.apply(this, args);
      if (result && typeof result.then === "function") {
        onceRunning.add(name);
        if (button) { button.setAttribute("aria-busy", "true"); button.classList.add("is-busy"); }
        const done = () => {
          onceRunning.delete(name);
          if (button) { button.removeAttribute("aria-busy"); button.classList.remove("is-busy"); }
        };
        result.then(done, done);
      }
      return result;
    };
  });

  window.renderMoon = renderMoon;
  window.renderIdentity = renderIdentity;
  window.renderWheel = renderWheel;
  window.loadRealChartData = loadRealChartData;
  window._sorayaPreview = previewIdentityFromForm;
  window.sorayaRenderAuthUi = renderAuthUi;
  window.sorayaBootstrap = bootstrap;

  // Beim Zurueckkehren in die App: Home-Daten auffrischen, wenn sie alt sind.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    const home = $("home");
    if (home && home.classList.contains("active") && Date.now() - lastHomeSkyAt > SKY_REFRESH_MS) {
      renderHomeSkyThrottled();
    }
  });

  window.addEventListener("offline", () => {
    renderAppStatus();
    toast(t("Keine Internetverbindung – Soraya zeigt dir, was schon geladen ist."));
  });
  window.addEventListener("online", () => {
    toast(t("Wieder online ✨"));
    engineReachable = true;
    retryConnection();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
