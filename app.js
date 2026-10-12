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
    authUser: "soraya_auth_user_id"
  };

  // Alles, was zu einem bestimmten Nutzer gehoert (bei Benutzerwechsel loeschen)
  const PROFILE_KEYS = [KEYS.person, KEYS.conv, KEYS.name, KEYS.birth, KEYS.created, KEYS.analyses, KEYS.people];

  const LOGIN_PATH = "/login";
  const SKY_REFRESH_MS = 10 * 60 * 1000;
  let lastHomeSkyAt = 0;
  let lastSkyTodayAt = 0;
  let skyToday = null;
  let chatBusy = false;
  const APP_VERSION = "web-v19";
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

  function markdownToHtml(text) {
    return escapeHtml(text || t("Noch kein Text vorhanden."))
      .replace(/^### (.*)$/gm, "<h3>$1</h3>")
      .replace(/^## (.*)$/gm, "<h2>$1</h2>")
      .replace(/^# (.*)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n\n/g, "<br><br>")
      .replace(/\n/g, "<br>");
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

  function showSection(id) {
    const target = $(id);
    if (!target) {
      showGlobalError(t("Bereich nicht gefunden: {id}", { id }), "bad");
      return false;
    }

    document.querySelectorAll(".section").forEach((section) => section.classList.remove("active"));
    target.classList.add("active");

    document.querySelectorAll("[data-nav]").forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-nav") === id);
    });

    window.scrollTo({ top: 0, behavior: isMobile() ? "auto" : "smooth" });
    renderAppStatus();

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
        loadPeopleFromSupabase(false);
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
    if (!token) throw new Error(t("Nicht eingeloggt. Bitte über /login einloggen."));

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
      if (error && error.name === "AbortError") throw new Error(t("Backend dauerte zu lange (timeout)."));
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
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

    const text = await response.text();
    let json;

    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new Error(text || t("Ungültige Backend-Antwort."));
    }

    // Tageslimit (Kostenbremse): Meldung in der App-Sprache
    if (response.status === 429) throw new Error(t("Tageslimit erreicht – morgen geht es weiter ✨"));
    if (!response.ok) throw new Error(json.detail || json.error || "HTTP " + response.status);
    if (json.ok === false) throw new Error(json.error || "Soraya ok=false");

    return json;
  }

  async function signOut() {
    try {
      if (!sb) loadConfig(false);
      if (sb) await sb.auth.signOut();

      clearProfileStorage();
      localStorage.removeItem(KEYS.authUser);
      serverPeople = null;
      chartCache = { personId: null, json: null };
      status("authStatus", t("Abgemeldet."), "ok");
      toast(t("Abgemeldet."));
      renderAuthUi();
      renderAppStatus();
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
      const email = state.session && state.session.user ? state.session.user.email : "Supabase User";

      if (topButton) {
        topButton.textContent = "✓";
        topButton.onclick = () => showSection("profile");
        topButton.setAttribute("aria-label", t("Profil öffnen"));
      }

      if (profileButton) {
        profileButton.textContent = t("Eingeloggt");
        profileButton.onclick = () => toast(t("Du bist bereits eingeloggt."));
      }

      if (logoutButton) logoutButton.style.display = "block";
      if (loginText) loginText.textContent = t("Dein Konto ist aktiv.");
      if (loginBadge) loginBadge.textContent = t("Aktiv");
      if (loginCard) loginCard.classList.add("ok");
      return true;
    }

    document.body.classList.add("soraya-logged-out", "soraya-needs-login");

    if (topButton) {
      topButton.textContent = "☾";
      topButton.onclick = openLogin;
      topButton.setAttribute("aria-label", t("Einloggen"));
    }

    if (profileButton) {
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

  async function createPerson() {
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
      writeJson(KEYS.birth, person);
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
    const open = $("analysisOpenButton");
    const regen = $("analysisRegenButton");
    if (open) {
      open.style.display = hasReading ? "none" : "";
      open.textContent = t("Analyse erstellen");
    }
    if (regen) regen.style.display = hasReading ? "" : "none";
  }

  function showAnalysis(data) {
    const analysis = data.data && data.data.analysis ? data.data.analysis : {};
    const reading = analysis.reading || data.data.reading || data.data.text || "";
    if (!reading) return false;
    const source = data.data.source;
    if ($("analysisSource")) $("analysisSource").textContent = source === "created" ? "neu" : "gespeichert";
    if ($("analysisReading")) $("analysisReading").innerHTML = markdownToHtml(reading);
    analysisShownFor = getCurrentPersonId();
    setAnalysisButtons(true);
    return true;
  }

  async function autoLoadAnalysis() {
    const personId = getCurrentPersonId();
    if (!personId || analysisShownFor === personId) return;
    try {
      const data = await callSoraya("/mobile/analysis/save", { person_id: personId, only_cached: true, lang: LANG() }, "POST", 15000);
      if (!showAnalysis(data)) {
        setAnalysisButtons(false);
        if ($("analysisSource")) $("analysisSource").textContent = t("bereit");
        if ($("analysisReading")) $("analysisReading").textContent = t("Deine persönliche Analyse ist noch nicht erstellt. Tippe auf „Analyse erstellen“ – Soraya schreibt sie in etwa einer Minute.");
      }
    } catch (error) {
      setAnalysisButtons(false);
    }
  }

  async function loadAnalysis(forceNew) {
    if (!needPerson()) return;
    if (forceNew && !window.confirm(t("Eine neue Analyse ersetzt die bisherige. Du kannst bis zu 3 neue Analysen pro Tag erstellen. Jetzt neu erstellen?"))) return;

    try {
      if ($("analysisReading")) $("analysisReading").textContent = t("Soraya schreibt deine Analyse… das dauert etwa eine Minute.");
      showLoadingVeil(t("Analyse wird erstellt…"));

      const data = await callSoraya("/mobile/analysis/save", {
        person_id: getCurrentPersonId(),
        force_new: !!forceNew,
        lang: LANG()
      });

      if (!showAnalysis(data) && $("analysisReading")) $("analysisReading").textContent = t("Keine Analyse gefunden.");

      if (data.data.source === "created") {
        const count = Number(localStorage.getItem(KEYS.analyses) || 0) + 1;
        localStorage.setItem(KEYS.analyses, String(count));
      }
      renderIdentity();
      track("analysis_loaded", { source: data.data.source || "", force: !!forceNew });
      toast(t("Analyse geladen."));
    } catch (error) {
      const msg = friendlyError(error, t("Analyse konnte nicht geladen werden."));
      trackError("analysis", error);
      if ($("analysisReading")) $("analysisReading").textContent = msg;
      toast(msg);
    } finally {
      hideLoadingVeil();
    }
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
    const ritual = pickText(h, ["ritual", "ritual_text"], pickText(root, ["ritual"], t("Lege eine Hand auf dein Herz, atme fünfmal tief und formuliere eine klare Intention.")));
    const affirmation = pickText(h, ["affirmation", "mantra"], pickText(root, ["affirmation"], t("Ich vertraue meinem Weg und bewege mich mit Klarheit.")));

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
    const h = data.data && data.data.horoscope ? data.data.horoscope : {};
    const mood = h.stimmung || data.data.stimmung || t("Dein Horoskop");
    const body = h.body || h.text || data.data.body || data.data.text || t("Keine Horoskopdaten gefunden.");
    const tip = h.tipp || data.data.tipp || t("Vertraue deinem inneren Kompass.");

    setText("horoMood", mood);
    setText("horoDate", horoscopeDateLabel(currentPeriod()));
    setText("horoBody", body);
    setText("horoTip", "✦ " + tip);
    renderHoroscopePremium(data);
    document.body.classList.add("soraya-horoscope-ready");
  }

  async function loadHoroscope(options) {
    const silent = !!(options && options.silent);
    if (!getCurrentPersonId()) {
      const preview = readPreview();
      const sunKey = preview && preview.result && preview.result.sun && !preview.result.sun.uncertain ? preview.result.sun.sign : null;
      if (sunKey) {
        setText("horoDate", t("Allgemein für {sign} · heute", { sign: ASTRO ? ASTRO.sign(sunKey) : (preview.result.sun.sign_de || "") }));
        setText("horoMood", t("Soraya liest die Sterne…"));
        try {
          const json = await publicJson("/public/sign-horoscope?sign=" + encodeURIComponent(sunKey) + "&lang=" + LANG());
          const d = json.data || {};
          setText("horoMood", d.stimmung || t("Dein Tag"));
          setText("horoBody", (d.text || "") + "\n\n" + t("Dein persönliches Horoskop – berechnet aus deinem ganzen Geburtshoroskop – bekommst du mit deinem Profil."));
          setText("horoTip", d.tipp ? "✦ " + d.tipp : "");
          if (d.liebe) setText("horoLoveText", d.liebe);
          if (d.beruf) setText("horoWorkText", d.beruf);
        } catch (error) {
          setText("horoMood", t("Gleich verfügbar"));
        }
        return;
      }
      if (!silent) needPerson();
      else {
        setText("horoMood", t("Dein Horoskop wartet"));
        setText("horoBody", t("Gib auf der Startseite dein Geburtsdatum ein – dann zeigt Soraya dir sofort dein Horoskop für heute."));
      }
      return;
    }
    const period = currentPeriod();
    const cached = horoscopeCache[period] && horoscopeCache[period].key === horoscopeKey(period);
    const retry = $("horoReloadButton");
    if (retry) retry.style.display = "none";

    try {
      if (!cached) {
        setText("horoMood", t("Soraya liest die Sterne…"));
        setText("horoBody", t({ daily: "Dein Tageshoroskop wird geschrieben. Beim ersten Mal dauert das einige Sekunden.", weekly: "Dein Wochenhoroskop wird geschrieben. Beim ersten Mal dauert das einige Sekunden.", monthly: "Dein Monatshoroskop wird geschrieben. Beim ersten Mal dauert das einige Sekunden." }[period] || "Dein Tageshoroskop wird geschrieben. Beim ersten Mal dauert das einige Sekunden."));
        setText("horoTip", "✦ …");
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

  // Startseite: "Dein Tag" aus dem eigenen Tageshoroskop (statt Zufallsspruch).
  async function loadDailyFocus() {
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
    bubble.textContent = text;

    windowNode.appendChild(bubble);
    windowNode.scrollTop = windowNode.scrollHeight;
  }

  const CHAT_GREETING = t("Hallo, ich bin Soraya ✨ Was möchtest du heute verstehen?");
  let chatHistoryLoadedFor = null;

  // "Neues Gespraech": Ansicht leeren UND eine neue Unterhaltung beginnen
  // (vorher lief die alte serverseitig weiter, obwohl der Chat leer aussah).
  function clearChatView() {
    const windowNode = $("chatWindow");
    if (windowNode) windowNode.innerHTML = '<div class="bubble assistant">' + escapeHtml(CHAT_GREETING) + "</div>";
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
      windowNode.innerHTML = '<div class="bubble assistant">' + escapeHtml(CHAT_GREETING) + "</div>";
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
    list.push(t("Welche Stärke aus meinem Geburtshoroskop unterschätze ich?"));

    box.innerHTML = "";
    list.slice(0, 3).forEach((text) => {
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
      appendBubble("assistant", reply);
      renderChatSuggestions(true);
      track("chat_sent", { people: peopleIds.length });
    } catch (error) {
      if (typing) typing.remove();
      trackError("chat", error);
      appendBubble("assistant", friendlyError(error, t("Chat konnte nicht geladen werden.")));
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
      box.innerHTML = '<p class="people-empty">' + escapeHtml(t("Lege eine Person an – Partner, Freundin, Familie – und Soraya zeigt euch, wie ihr zusammenpasst.")) + '</p>';
      return;
    }
    box.innerHTML = people.slice(0, 6).map((p) =>
      '<div class="people-row">' +
        '<span class="people-avatar">' + escapeHtml(initials(p.name, "?")) + "</span>" +
        '<div class="people-info"><b>' + escapeHtml(p.name || t("Unbenannt")) + "</b><small>" + escapeHtml(RELATION_LABELS[p.relation] || t("Person")) + "</small></div>" +
        '<button type="button" class="btn people-compare" data-person="' + escapeHtml(p.id) + '">' + escapeHtml(t("Vergleichen ›")) + '</button>' +
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

  function renderSynastryDescription(payload) {
    const box = $("synastryText");
    if (!box) return;

    const syn = payload.synastry || {};
    const score = payload.score || syn.score || {};
    const summary = payload.summary || syn.summary || {};
    const aspects = payload.aspects || syn.aspects || [];

    const value = payload.percent != null ? payload.percent : (score.value || score.score || 0);
    const label = payload.label || score.label || summary.label || t("Kosmische Verbindung");
    const text =
      [payload.text, summary.text, summary.short, syn.summary].find((x) => typeof x === "string" && x.trim()) ||
      t("Eure Verbindung wurde berechnet. Achtet darauf, wo Harmonie entsteht und wo bewusste Kommunikation wichtig ist.");

    let html = "";
    html += t("◈ Partner-Vergleich gespeichert.") + "\n";
    html += t("Kompatibilität: {value}%", { value }) + "\n\n";
    html += t(label) + "\n";
    html += text;

    if (Array.isArray(aspects) && aspects.length) {
      html += "\n\n" + t("Wichtige Aspekte:") + "\n";
      aspects.slice(0, 5).forEach((aspect) => {
        const line = aspect.text || aspect.name ||
          (ASTRO ? [ASTRO.planet(aspect.p1 || aspect.p1_de), ASTRO.aspect(aspect.type || aspect.type_de), ASTRO.planet(aspect.p2 || aspect.p2_de)] : [aspect.p1_de || aspect.p1, aspect.type_de || aspect.type, aspect.p2_de || aspect.p2])
            .filter(Boolean).join(" ");
        html += "• " + safe(line || t("Aspekt")) + "\n";
      });
    }

    status("synastryText", html, "ok");
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

  async function saveSynastry() {
    if (!needPerson()) return;

    try {
      const partnerId = (($("synPersonSelect") && $("synPersonSelect").value) || "") || (($("personBId") && $("personBId").value.trim()) || "");

      if (!partnerId) throw new Error(t("Bitte zuerst eine zweite Person auswählen oder anlegen."));
      if (partnerId === getCurrentPersonId()) throw new Error(t("Bitte eine andere Person auswählen."));

      showLoadingVeil(t("Synastrie wird berechnet…"));
      const data = await callSoraya("/mobile/synastry/save", {
        person_a_id: getCurrentPersonId(),
        person_b_id: partnerId,
        lang: LANG()
      });

      const syn = (data.data && data.data.synastry) || {};
      const scoreObj = (data.data && data.data.score) || syn.score || {};
      // score_percent: Backend rechnet Discepolo-Punkte in Prozent um.
      // Alte Backends liefern nur Punkte -> grob umrechnen statt "29 %" zu zeigen.
      const points = syn.score_value || scoreObj.value || 0;
      const value = data.data && data.data.score_percent != null
        ? data.data.score_percent
        : Math.min(97, Math.round(35 + Number(points) * 1.9));

      if ($("compatScore")) $("compatScore").textContent = value + "%";
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
      track("synastry_done", { source: (data.data && data.data.source) || "" });
      toast(t("Partner-Vergleich berechnet."));
    } catch (error) {
      const msg = friendlyError(error, t("Synastrie konnte nicht berechnet werden."));
      trackError("synastry", error);
      status("synastryText", msg, "bad");
      toast(msg);
    } finally {
      hideLoadingVeil();
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
    const name = localStorage.getItem(KEYS.name) || t("du");

    if ($("greetLine")) {
      $("greetLine").innerHTML = escapeHtml(greeting) + ',<br><span class="gold" id="heroName">' + escapeHtml(name) + "</span>.";
    }
  }

  function renderMoon() {
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
    setText("moonIllum", t("{value}% beleuchtet", { value: illum }));
    if ($("moonVisual")) $("moonVisual").innerHTML = moonSvg((age / synodic) * 360);
  }

  // Mond als SVG: beleuchteter Teil = Halbkreis auf der Lichtseite plus
  // elliptische Schattengrenze. elong = Winkel Mond-Sonne (0 Neu, 180 Voll).
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
    const lit = e < 1 || e > 359 ? "" : `<path d="${limb} ${term} Z" fill="url(#moonLit)"/>`;
    return `<svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
      <defs>
        <radialGradient id="moonLit" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#fffbe8"/><stop offset=".45" stop-color="#ffe9b0"/><stop offset="1" stop-color="#c9a86a"/></radialGradient>
        <radialGradient id="moonDark" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#2a2044"/><stop offset="1" stop-color="#120c22"/></radialGradient>
      </defs>
      <circle cx="${c}" cy="${c}" r="${r}" fill="url(#moonDark)" stroke="rgba(201,168,106,.35)" stroke-width="1"/>
      ${lit}
    </svg>`;
  }

  function renderIdentity(force) {
    const name = localStorage.getItem(KEYS.name) || t("Dein Profil");
    const birth = readJson(KEYS.birth, null);

    setText("profileTitle", name);
    setText("profileInitial", (name[0] || "S").toUpperCase());
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

    const created = localStorage.getItem(KEYS.created);
    if ($("daysStat")) {
      const days = created ? Math.max(1, Math.ceil((Date.now() - new Date(created).getTime()) / 86400000)) : 1;
      $("daysStat").textContent = String(days);
    }

    setText("analysisStat", localStorage.getItem(KEYS.analyses) || "0");
    setText("savedStat", localStorage.getItem(KEYS.person) ? "1" : "0");

    const hasProfile = !!(localStorage.getItem(KEYS.person) && birth && birth.day);
    document.body.classList.toggle("soraya-no-profile", !hasProfile);
    const result = $("personResult");
    if (hasProfile && result && !result.classList.contains("bad") && /Noch nicht gespeichert/.test(result.textContent)) {
      status("personResult", t("◈ Dein Profil ist gespeichert. Änderungen einfach oben eintragen und erneut speichern."), "ok");
    }
  }

  function renderProfilePreview() {
    const birth = readJson(KEYS.birth, null);
    const preview = document.querySelector(".c45-birth-preview");
    if (!preview || !birth || !birth.day || !birth.month || !birth.year || !birth.birthplace) return;

    const time = birth.hour !== null && birth.hour !== undefined && birth.hour !== ""
      ? String(birth.hour).padStart(2, "0") + ":" + String(birth.minute || 0).padStart(2, "0")
      : t("Geburtszeit offen");

    preview.innerHTML = `
      <div><b>✦</b><span>${escapeHtml(birth.day)}.${escapeHtml(birth.month)}.${escapeHtml(birth.year)} · ${escapeHtml(time)}</span></div>
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

  function chartRotation(data) {
    const asc = data.big_three && data.big_three.ascendant ? pointAbsPos(data.big_three.ascendant) : Array.isArray(data.houses) && data.houses[0] ? Number(data.houses[0].cusp_abs_pos) : 180;
    return 180 - asc;
  }

  function renderWheel(chartData = null) {
    const svg = $("chartWheel");
    if (!svg) return;

    const data = chartData ? (chartData.data || chartData) : {};
    const points = Array.isArray(data.points) ? data.points : [];
    const houses = Array.isArray(data.houses) ? data.houses : [];
    const signData = [
      { key: "Ari", glyph: "♈", start: 0 }, { key: "Tau", glyph: "♉", start: 30 }, { key: "Gem", glyph: "♊", start: 60 }, { key: "Can", glyph: "♋", start: 90 },
      { key: "Leo", glyph: "♌", start: 120 }, { key: "Vir", glyph: "♍", start: 150 }, { key: "Lib", glyph: "♎", start: 180 }, { key: "Sco", glyph: "♏", start: 210 },
      { key: "Sag", glyph: "♐", start: 240 }, { key: "Cap", glyph: "♑", start: 270 }, { key: "Aqu", glyph: "♒", start: 300 }, { key: "Pis", glyph: "♓", start: 330 }
    ];
    const corePoints = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Chiron", "True_North_Lunar_Node", "Mean_Lilith"];
    const cx = 210, cy = 210, outer = 190, zodiacR = 166, houseR = 145, planetR = 112, inner = 66;
    const rotation = chartRotation(data);
    let html = "";

    html += `<circle cx="${cx}" cy="${cy}" r="${outer}" fill="rgba(255,255,255,.025)" stroke="rgba(228,181,90,.72)" stroke-width="1.5"/>`;
    html += `<circle cx="${cx}" cy="${cy}" r="${houseR}" fill="none" stroke="rgba(190,108,255,.25)" stroke-width="1"/>`;
    html += `<circle cx="${cx}" cy="${cy}" r="${inner}" fill="rgba(7,8,23,.72)" stroke="rgba(228,181,90,.28)" stroke-width="1"/>`;

    signData.forEach((sign) => {
      const boundary = sign.start + rotation;
      const p1 = xy(cx, cy, inner, boundary);
      const p2 = xy(cx, cy, outer, boundary);
      const label = xy(cx, cy, zodiacR, sign.start + 15 + rotation);
      html += `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="rgba(255,255,255,.10)" stroke-width="1"/>`;
      html += svgText(label.x, label.y, sign.glyph, 21, "rgba(228,181,90,.96)", "600");
    });

    houses.forEach((house) => {
      if (house.cusp_abs_pos === undefined) return;
      const deg = Number(house.cusp_abs_pos) + rotation;
      const p1 = xy(cx, cy, inner, deg);
      const p2 = xy(cx, cy, outer, deg);
      const label = xy(cx, cy, 132, deg + 3);
      const isAngle = house.number === 1 || house.number === 4 || house.number === 7 || house.number === 10;
      html += `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="${isAngle ? "rgba(228,181,90,.62)" : "rgba(190,108,255,.25)"}" stroke-width="${isAngle ? 1.8 : 1}"/>`;
      html += svgText(label.x, label.y, String(house.number), 9, "rgba(231,222,255,.55)", "600");
    });

    const drawablePoints = points.filter((point) => corePoints.includes(point.name)).sort((a, b) => pointAbsPos(a) - pointAbsPos(b));
    drawablePoints.forEach((point, index) => {
      const deg = pointAbsPos(point) + rotation;
      const radius = planetR + (index % 3) * 8;
      const p = xy(cx, cy, radius, deg);
      const lineStart = xy(cx, cy, inner + 8, deg);
      const glyph = planetGlyph(point.name || point.name_de || "");
      html += `<line x1="${lineStart.x.toFixed(1)}" y1="${lineStart.y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="rgba(228,181,90,.18)" stroke-width="1"/>`;
      html += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="11" fill="rgba(22,13,45,.95)" stroke="rgba(228,181,90,.76)" stroke-width="1"/>`;
      html += svgText(p.x, p.y, glyph, glyph.length > 1 ? 9 : 15, "#fff4c9", "700");
    });

    html += svgText(cx, cy - 5, "SORAYA", 20, "rgba(228,181,90,.96)", "700");
    html += svgText(cx, cy + 17, drawablePoints.length ? t("Radix") : t("Birth Chart"), 11, "rgba(231,222,255,.65)", "500");
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
    box.textContent = t("Birth-Chart-Daten werden geladen.");
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
    const asc = big.ascendant || points.find((p) => p.name === "Ascendant");

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
    setText("bigSunText", sun && sun.house ? t("Haus {n} · Identität und Wille", { n: sun.house }) : t("Identität · Ausdruck · Lebenslicht"));
    setText("bigMoonText", moon && moon.house ? t("Haus {n} · Gefühl und Sicherheit", { n: moon.house }) : t("Gefühl · Bedürfnis · innere Welt"));
    setText("bigAscText", asc ? t("Dein Auftreten und dein Weg") : t("Auftreten · Weg · Wirkung"));

    const planetList = $("planetList");
    if (planetList) {
      const wanted = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
      const rows = points.filter((p) => wanted.includes(p.name)).map((p) => {
        const glyph = planetGlyph(p.name);
        const name = pointLabel(p);
        const sign = signName(p);
        const degree = formatDegree(p.degree);
        const house = p.house ? t("Haus {n}", { n: p.house }) : "";
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
      const harmoniousNames = ["Trine", "Sextile", "Conjunction", "Trigon", "Sextil", "Konjunktion"];
      const challengingNames = ["Square", "Opposition", "Quadrat"];
      const harmonious = aspects.filter((a) => harmoniousNames.includes(a.type || a.aspect || a.name || a.type_de)).length;
      const challenging = aspects.filter((a) => challengingNames.includes(a.type || a.aspect || a.name || a.type_de)).length;
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
      if (details) details.textContent = t("Speichere zuerst dein Profil, dann lädt Soraya dein echtes Birth Chart.");
      return null;
    }

    try {
      const personId = getCurrentPersonId();
      let json = null;
      if (!force && personId && chartCache.personId === personId && chartCache.json) {
        json = chartCache.json;
      } else {
        if (details) details.textContent = t("Soraya lädt dein Radix…");
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
      if (details) details.textContent = t("Chart konnte nicht geladen werden: {error}", { error: friendlyError(error, t("Chart nicht verfügbar.")) });
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
        if (/zu lange|timeout|Tageslimit/i.test(error.message || "")) throw error;
      }
    }
    return engineJson("/chart", birth);
  }

  async function loadTransitsJson(personId, birth) {
    if (personId) {
      try {
        const json = await callSoraya("/mobile/transits", { person_id: personId, at: null }, "POST", 15000);
        if (json && json.data) return json;
      } catch (error) {
        if (/zu lange|timeout|Tageslimit/i.test(error.message || "")) throw error;
      }
    }
    return engineJson("/transits", { person: birth, at: null });
  }

  async function engineJson(path, body) {
    const config = getConfig();
    const response = await fetchWithTimeout(config.engineUrl.replace(/\/$/, "") + path, {
      method: "POST",
      headers: await engineHeaders(),
      body: JSON.stringify(body)
    }, 15000);
    const json = await response.json();
    if (!response.ok) throw new Error(json.detail || json.error || "HTTP " + response.status);
    if (!json || json.ok === false || !json.data) throw new Error((json && json.error) || t("Keine Daten erhalten."));
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
    Quadrat: "fordert heraus", Opposition: "sucht Balance"
  };

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

  function setEnergy(percent, label) {
    if ($("energyRing")) $("energyRing").style.setProperty("--energy", (percent == null ? 0 : percent) + "%");
    setText("energyPct", percent == null ? "–" : percent + "%");
    setText("energyLabel", label || "–");
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
      const json = await loadTransitsJson(getCurrentPersonId(), birth);
      document.body.classList.remove("soraya-backend-soft-fail");

      const aspects = (json.data.aspects_to_natal || []).slice(0, 3);
      if (!aspects.length) {
        setHomeTransits(transitRow("☾", t("Ruhiger Himmel"), t("Gerade keine engen Transite.")));
        setEnergy(60, t("Ruhig & offen"));
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

      let harmony = 0;
      let tension = 0;
      (json.data.aspects_to_natal || []).slice(0, 7).forEach((aspect) => {
        if (aspect.type_de === "Trigon" || aspect.type_de === "Sextil") harmony += 1;
        if (aspect.type_de === "Quadrat" || aspect.type_de === "Opposition") tension += 1;
      });

      const total = harmony + tension;
      let score = total ? Math.round(50 + ((harmony - tension) / total) * 42) : 60;
      score = Math.max(8, Math.min(96, score));
      const label = score >= 66 ? t("Harmonisch & offen") : score >= 45 ? t("Ausgeglichen") : t("Intensiv & fordernd");
      setEnergy(score, label);
    } catch (error) {
      trackError("transits", error);
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
    const json = await response.json();
    if (!response.ok) throw new Error(json.detail || json.error || "HTTP " + response.status);
    if (!json || json.ok === false) throw new Error((json && json.error) || t("Keine Daten erhalten."));
    return json;
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
    if (ribbon && !getCurrentPersonId()) {
      ribbon.innerHTML = "<span><b>☉</b> " + escapeHtml(signDisplay(sun)) + "</span><span><b>☾</b> " + escapeHtml(signDisplay(moon)) + "</span>";
      ribbon.classList.add("is-personal");
    }

    updateQuickStartCta();

    const form = $("qsForm");
    const box = $("qsResult");
    if (form) form.style.display = "none";
    if (box) box.style.display = "block";
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
        ? t("Ergänze im Profil Name und Geburtsort – dann berechnet Soraya dein <b>persönliches</b> Horoskop, deinen Aszendenten und dein Birth Chart.")
        : t("Dein <b>persönliches</b> Horoskop, deinen Aszendenten, dein Birth Chart und den Chat mit Soraya bekommst du mit einem kostenlosen Konto.");
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
      track("quickstart_done", { time_known: birth.hour !== null });
      if (quelle()) publicEvent("schnellstart");
    } catch (error) {
      status("qsStatus", friendlyError(error, t("Das hat nicht geklappt. Bitte Datum prüfen.")), "bad");
    } finally {
      if (button) button.disabled = false;
    }
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
    const preview = readPreview();
    if (!preview || getCurrentPersonId()) return;
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

  async function restoreQuickStart() {
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
      if (/gibt es nicht/i.test(error.message || "")) {
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
    rows.push(transitRow("☾", t("Mond in {sign}", { sign: trSign(moon.sign || moon.sign_de) || "–" }), (phase || t("Mondphase")) + " · " + t("{value} % beleuchtet", { value: moon.illumination ?? "–" })));

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

  async function renderSkyToday(force = false) {
    const box = $("skyList");
    if (!box) return;
    if (!force && skyToday && Date.now() - lastSkyTodayAt < 60 * 60 * 1000) return;
    try {
      const config = getConfig();
      const response = await fetchWithTimeout(config.engineUrl.replace(/\/$/, "") + "/sky", { method: "GET" }, 15000);
      const json = await response.json();
      if (!json || json.ok === false || !json.data) throw new Error(t("Himmel nicht verfügbar."));
      skyToday = json.data;
      lastSkyTodayAt = Date.now();
      box.innerHTML = skyRows(skyToday);
      const moon = skyToday.moon || {};
      const moonSign = trSign(moon.sign || moon.sign_de);
      if (moonSign && getCurrentPersonId()) {
        setText("heroSub", t("Heute wandert der Mond durch {sign} – hier ist, was das für dich bedeutet.", { sign: moonSign }));
      }

      if (moon.phase_index != null && ASTRO) setText("moonPhase", ASTRO.moonPhase(moon.phase_index));
      else if (moon.phase) setText("moonPhase", moon.phase);
      if (moon.illumination !== undefined) {
        setText("moonIllum", (moonSign ? t("Mond in {sign}", { sign: moonSign }) + " · " : "") + t("{value} % beleuchtet", { value: moon.illumination }));
      }
      renderChatSuggestions();
    } catch (error) {
      if (!skyToday) box.innerHTML = transitRow("☾", t("Himmelsereignisse"), t("Gerade kurz nicht erreichbar. Soraya versucht es später erneut."));
    }
  }

  function previewIdentityFromForm() {
    const name = ($("pName") && $("pName").value.trim()) || localStorage.getItem(KEYS.name) || t("du");
    setText("profileTitle", name);
    setText("profileInitial", (name[0] || "S").toUpperCase());

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

  async function renderAppStatus() {
    const birth = readJson(KEYS.birth, null);
    const state = await getSessionState();

    const pill = $("appStatusPill");
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
      });
    }

    const synSelect = $("synPersonSelect");
    if (synSelect && !synSelect.dataset.bound) {
      synSelect.dataset.bound = "1";
      synSelect.addEventListener("change", () => {
        const raw = $("personBId");
        if (raw) raw.value = synSelect.value || "";
        updateSynastryNames();
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
    restoreQuickStart();
    renderIosHint();
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

  window.loadPeopleFromSupabase = loadPeopleFromSupabase;
  window.refreshSynastryPeople = refreshSynastryPeople;
  window.sorayaAddPerson = addPerson;
  window.sorayaQuickStart = quickStart;
  window.sorayaDismissIosHint = dismissIosHint;
  window.sorayaShareInvite = shareInvite;
  window.sorayaInviteMatch = inviteMatch;
  window.sorayaInviteCta = inviteCta;
  window.sorayaCloseInvite = closeInvite;
  window.sorayaQuickStartEdit = quickStartEdit;
  window.sorayaQuickStartCta = quickStartCta;
  window.sorayaOpenSynastryWith = openSynastryWith;
  window.createSynastryPerson = createSynastryPerson;
  window.saveSynastry = saveSynastry;
  window.renderSynastryDescription = renderSynastryDescription;

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
