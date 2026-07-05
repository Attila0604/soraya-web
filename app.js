/*
  Soraya — C.2.1 Clean app.js
  Ziel:
  - Eine saubere, vollständige app.js als Ersatz
  - /login bleibt die einzige Login-Seite
  - keine doppelten Synastrie-Picker
  - mobile sichere Supabase-Endpunkte bleiben erhalten
  - Backend bleibt unverändert
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
    coords: "soraya_coords"
  };

  const LOGIN_PATH = "/login";
  let sb = null;

  const $ = (id) => document.getElementById(id);

  function safe(value, fallback = "") {
    return value === undefined || value === null || value === "" ? fallback : String(value);
  }

  function escapeHtml(value) {
    return safe(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function markdownToHtml(text) {
    return escapeHtml(text || "Noch kein Text vorhanden.")
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
    setTimeout(() => box.classList.remove("show"), 3300);
  }

  function status(id, text, type = "") {
    const node = $(id);
    if (!node) return;
    node.classList.remove("ok", "bad");
    if (type) node.classList.add(type);
    node.textContent = typeof text === "string" ? text : JSON.stringify(text, null, 2);
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

  function showSection(id) {
    document.querySelectorAll(".section").forEach((section) => section.classList.remove("active"));
    const target = $(id);
    if (target) target.classList.add("active");

    document.querySelectorAll("[data-nav]").forEach((button) => {
      button.classList.toggle("active", button.getAttribute("data-nav") === id);
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
    renderAppStatus();

    if (id === "analysis") {
      setTimeout(() => loadRealChartData(false), 120);
    }

    if (id === "synastry") {
      setTimeout(() => {
        ensureSynastryUi();
        updateSynastryNames();
        loadPeopleFromSupabase(false);
      }, 120);
    }

    if (id === "profile") {
      setTimeout(() => { renderAuthUi(); renderProfilePremium(); renderOnboardingState(); }, 120);
    }

    if (id === "home") {
      setTimeout(() => { renderHomeSky(); renderHomeDashboardPremium(); renderOnboardingState(); }, 120);
    }
  }

  function openLogin() {
    try {
      localStorage.setItem("soraya_after_login_path", window.location.pathname + window.location.search + window.location.hash);
    } catch (error) {}
    window.location.href = LOGIN_PATH;
  }

  function closeLogin() {
    const modal = $("loginModal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }

  function openSettings() {
    const modal = $("settingsModal");
    if (modal) modal.classList.add("open");
  }

  function closeSettings() {
    const modal = $("settingsModal");
    if (modal) modal.classList.remove("open");
  }

  function initSupabase(config) {
    if (!window.supabase) throw new Error("Supabase CDN wurde nicht geladen.");
    if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error("Supabase-Verbindung fehlt.");
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
        status("configStatus", "Bitte alle Felder ausfüllen.", "bad");
        return false;
      }

      writeJson(KEYS.config, config);
      initSupabase(config);
      status("configStatus", "Verbindung gespeichert.", "ok");
      toast("Verbindung gespeichert.");
      renderAuthUi();
      return true;
    } catch (error) {
      status("configStatus", error.message, "bad");
      toast("Verbindung konnte nicht gespeichert werden.");
      return false;
    }
  }

  function loadConfig() {
    const config = readJson(KEYS.config, null);
    if (!config) {
      status("configStatus", "Noch keine Verbindung gespeichert.", "bad");
      return false;
    }

    if ($("supabaseUrl")) $("supabaseUrl").value = config.supabaseUrl || "";
    if ($("supabaseAnonKey")) $("supabaseAnonKey").value = config.supabaseAnonKey || "";
    if ($("engineUrl")) $("engineUrl").value = config.engineUrl || "";

    try {
      initSupabase(config);
      status("configStatus", "Verbindung geladen.", "ok");
      return true;
    } catch (error) {
      status("configStatus", error.message, "bad");
      return false;
    }
  }

  function getConfig() {
    const config = readJson(KEYS.config, null);
    if (!config) throw new Error("Bitte zuerst Verbindung speichern.");
    return config;
  }

  function getEngineUrl() {
    return getConfig().engineUrl.replace(/\/$/, "");
  }

  async function getToken() {
    if (!sb && !loadConfig()) throw new Error("Supabase Client nicht bereit.");

    const { data, error } = await sb.auth.getSession();
    if (error) throw error;

    const token = data && data.session && data.session.access_token;
    if (!token) throw new Error("Nicht eingeloggt. Bitte über /login einloggen.");

    return token;
  }

  async function callSoraya(path, body, method = "POST") {
    const token = await getToken();
    const response = await fetch(getEngineUrl() + path, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: method === "GET" ? undefined : JSON.stringify(body || {})
    });

    const text = await response.text();
    let json;

    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new Error(text || "Ungültige Backend-Antwort.");
    }

    if (!response.ok) throw new Error(json.detail || json.error || "HTTP " + response.status);
    if (json.ok === false) throw new Error(json.error || "Soraya ok=false");

    return json;
  }

  async function signIn() {
    openLogin();
  }

  async function signUp() {
    openLogin();
  }

  async function signOut() {
    try {
      if (!sb) loadConfig();
      if (sb) await sb.auth.signOut();

      localStorage.removeItem(KEYS.conv);
      status("authStatus", "Abgemeldet.", "ok");
      toast("Abgemeldet.");
      renderAuthUi();
    } catch (error) {
      showGlobalError(friendlyError(error, "Abmelden fehlgeschlagen."), "bad");
      toast(friendlyError(error, "Abmelden fehlgeschlagen."));
    }
  }

  async function getSessionState() {
    try {
      if (!sb && !loadConfig()) return { ok: false, session: null };
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      return { ok: !!(data && data.session), session: data && data.session };
    } catch (error) {
      return { ok: false, session: null, error };
    }
  }

  function findLogoutButton() {
    return Array.from(document.querySelectorAll("button")).find((button) => {
      const text = (button.textContent || "").trim();
      const onclick = button.getAttribute("onclick") || "";
      return text.includes("Abmelden") || text === "Einloggen" || onclick.includes("signOut");
    });
  }


  function renderProfilePremium() {
    const birth = readJson(KEYS.birth, null);
    const name = localStorage.getItem(KEYS.name) || (birth && birth.name) || "";
    const profileTitle = $("profileTitle");

    if (profileTitle && name) profileTitle.textContent = name;

    const preview = document.querySelector(".c45-birth-preview");
    if (preview && birth && birth.day && birth.month && birth.year && birth.birthplace) {
      const time = birth.hour !== null && birth.hour !== undefined && birth.hour !== ""
        ? String(birth.hour).padStart(2, "0") + ":" + String(birth.minute || 0).padStart(2, "0")
        : "Geburtszeit offen";
      preview.innerHTML = `
        <div><b>✦</b><span>${escapeHtml(birth.day)}.${escapeHtml(birth.month)}.${escapeHtml(birth.year)} · ${escapeHtml(time)}</span></div>
        <div><b>⌖</b><span>${escapeHtml(birth.birthplace)}</span></div>
      `;
    }
  }



  async function renderOnboardingState() {
    const birth = readJson(KEYS.birth, null);
    const personId = getCurrentPersonId();
    const state = await getSessionState();

    const card = $("onboardingCard");
    const analysisGuide = $("analysisEmptyGuide");

    const hasProfile = !!(personId || (birth && birth.name && birth.day && birth.month && birth.year && birth.birthplace));

    const loginStep = $("stepLogin");
    const profileStep = $("stepProfile");
    const analysisStep = $("stepAnalysis");

    if (loginStep) loginStep.classList.toggle("done", !!state.ok);
    if (profileStep) profileStep.classList.toggle("done", !!hasProfile);
    if (analysisStep) analysisStep.classList.toggle("done", !!hasProfile);

    if (card) {
      card.style.display = state.ok && hasProfile ? "none" : "";
    }

    if (analysisGuide) {
      analysisGuide.style.display = hasProfile ? "none" : "";
    }
  }


  async function renderAuthUi() {
    closeLogin();

    const loginText = $("loginSessionText");
    const loginCard = $("loginSessionCard");
    const button = findLogoutButton();
    const state = await getSessionState();

    if (state.ok) {
      document.body.classList.remove("soraya-logged-out", "soraya-needs-login");

      if (loginText) {
        const email = state.session && state.session.user ? state.session.user.email : "Supabase User";
        loginText.textContent = "✅ Eingeloggt als " + email + ".";
      }

      if (loginCard) loginCard.classList.add("ok");

      if (button) {
        button.textContent = "⇥ Abmelden";
        button.onclick = signOut;
      }

      return true;
    }

    document.body.classList.add("soraya-logged-out", "soraya-needs-login");

    if (loginText) loginText.textContent = "Du bist abgemeldet. Bitte einloggen, um Daten zu speichern.";
    if (loginCard) loginCard.classList.remove("ok");

    if (button) {
      button.textContent = "Einloggen";
      button.onclick = openLogin;
    }

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
    if (value === null) throw new Error(label + " fehlt.");
    return value;
  }

  function getBirthFromForm() {
    return {
      name: ($("pName") && $("pName").value.trim()) || "",
      year: requiredNumber("pYear", "Jahr"),
      month: requiredNumber("pMonth", "Monat"),
      day: requiredNumber("pDay", "Tag"),
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

      if (!person.name) throw new Error("Name fehlt.");
      if (!person.birthplace) throw new Error("Geburtsort fehlt.");

      const data = await callSoraya("/mobile/people/create", {
        is_self: true,
        relation: null,
        person
      });

      const row = data.data && data.data.person;
      if (!row || !row.id) throw new Error("Person wurde gespeichert, aber keine ID erhalten.");

      if ($("personId")) $("personId").value = row.id;

      localStorage.setItem(KEYS.person, row.id);
      localStorage.setItem(KEYS.name, row.name || person.name);
      writeJson(KEYS.birth, person);
      if (!localStorage.getItem(KEYS.created)) localStorage.setItem(KEYS.created, new Date().toISOString());

      addPersonToCache(row, { ...person, is_self: true, relation: "self" });
      renderIdentity();
    bindLuxuryInteractions();
    installMobileStability();
    installAccessibilityPolish();
    sorayaHealthCheck();
    renderReleasePolish();
    renderProductState();
    bindSynastryPremiumEvents();
      renderHomeSky();
      renderHomeDashboardPremium();
      renderOnboardingState();
      renderAppStatus();
      loadRealChartData(true);
      status("personResult", "✅ Person gespeichert.\nName: " + (row.name || person.name) + "\nID: " + row.id, "ok");
      toast("Profil gespeichert.");
    } catch (error) {
      status("personResult", error.message, "bad");
      toast("Profil konnte nicht gespeichert werden.");
    }
  }

  function needPerson() {
    const id = getCurrentPersonId();
    if (!id) {
      toast("Bitte zuerst dein Profil speichern.");
      showSection("profile");
      return false;
    }
    return true;
  }

  async function loadAnalysis(forceNew) {
    if (!needPerson()) return;

    try {
      if ($("analysisReading")) $("analysisReading").innerHTML = "Soraya liest dein kosmisches Feld ...";

      const data = await callSoraya("/mobile/analysis/save", {
        person_id: getCurrentPersonId(),
        force_new: !!forceNew
      });

      const analysis = data.data && data.data.analysis ? data.data.analysis : {};
      const reading = analysis.reading || data.data.reading || data.data.text || "Keine Analyse gefunden.";

      if ($("analysisSource")) $("analysisSource").textContent = "source: " + (data.data.source || "loaded");
      if ($("analysisReading")) $("analysisReading").innerHTML = markdownToHtml(reading);

      const count = Number(localStorage.getItem(KEYS.analyses) || 0) + 1;
      localStorage.setItem(KEYS.analyses, String(count));
      renderIdentity();
      bumpUsage("analysis");
      hideLoadingVeil();
      toast("Analyse geladen.");
    } catch (error) {
      if ($("analysisReading")) $("analysisReading").textContent = "Fehler: " + error.message;
      toast("Analyse konnte nicht geladen werden.");
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
    const mood = pickText(h, ["stimmung", "mood", "title", "titel"], pickText(root, ["stimmung", "mood"], "Dein Horoskop"));
    const tip = pickText(h, ["tipp", "tip", "hinweis", "advice"], pickText(root, ["tipp", "tip"], "Vertraue deinem inneren Kompass."));

    const lower = (body + " " + mood + " " + tip).toLowerCase();

    const focus = pickText(h, ["fokus", "focus"], lower.includes("klar") ? "Klarheit entsteht, wenn du heute bewusst langsamer wirst." : "Richte deine Energie auf eine Sache, die wirklich wichtig ist.");
    const love = pickText(h, ["liebe", "love", "beziehung"], lower.includes("herz") || lower.includes("liebe") ? "Sprich ehrlich, aber sanft. Nähe entsteht durch echtes Zuhören." : "Zeige dich offen, aber bleibe bei deinen eigenen Bedürfnissen.");
    const work = pickText(h, ["beruf", "work", "career"], lower.includes("geduld") ? "Geduld bringt heute mehr als Druck. Schritt für Schritt entsteht Stabilität." : "Struktur hilft dir, deine Kraft sinnvoll einzusetzen.");
    const ritual = pickText(h, ["ritual", "ritual_text"], "Lege eine Hand auf dein Herz, atme fünfmal tief und formuliere eine klare Intention.");
    const affirmation = pickText(h, ["affirmation", "mantra"], "Ich vertraue meinem Weg und bewege mich mit Klarheit.");

    setText("horoFocusTitle", "Dein Fokus");
    setText("horoFocusText", focus);
    setText("horoLoveTitle", "Herz & Nähe");
    setText("horoLoveText", love);
    setText("horoWorkTitle", "Richtung & Kraft");
    setText("horoWorkText", work);
    setText("horoRitualTitle", "Dein Ritual");
    setText("horoRitualText", ritual);
    setText("horoAffirmation", "„" + affirmation.replace(/^„|“$|^"|"$/g, "") + "“");
  }


  async function loadHoroscope() {
    if (!needPerson()) return;

    try {
      if ($("horoMood")) $("horoMood").textContent = "Soraya berechnet ...";

      const data = await callSoraya("/mobile/horoscope/save", {
        person_id: getCurrentPersonId(),
        period: ($("period") && $("period").value) || "daily",
        at: null
      });

      const h = data.data && data.data.horoscope ? data.data.horoscope : {};
      const mood = h.stimmung || data.data.stimmung || "Dein Horoskop";
      const body = h.body || h.text || data.data.body || data.data.text || "Keine Horoskopdaten gefunden.";
      const tip = h.tipp || data.data.tipp || "Vertraue deinem inneren Kompass.";

      if ($("horoMood")) $("horoMood").textContent = mood;
      if ($("horoBody")) $("horoBody").textContent = body;
      if ($("horoTip")) $("horoTip").textContent = "✦ " + tip;

      renderHoroscopePremium(data);

      hideLoadingVeil();
      toast("Horoskop geladen.");
    } catch (error) {
      if ($("horoMood")) $("horoMood").textContent = "Fehler";
      if ($("horoBody")) $("horoBody").textContent = error.message;
      toast("Horoskop konnte nicht geladen werden.");
    }
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

  function clearChatView() {
    const windowNode = $("chatWindow");
    if (!windowNode) return;
    windowNode.innerHTML = '<div class="bubble assistant">Hallo, ich bin Soraya ✨ Wie kann ich dich heute unterstützen?</div>';
  }

  function needsSafetyNote(message) {
    return /(wohnung|haus|kaufen|kredit|vertrag|steuer|invest|aktie|crypto|bitcoin|gesund|krank|arzt|medizin|anwalt)/i.test(message || "");
  }



  function setRitualFocus(kind) {
    const title = $("ritualMoonTitle");
    const text = $("ritualMoonText");
    const affirmation = $("ritualAffirmation");

    const data = {
      "Mondwasser": {
        title: "Mondwasser",
        text: "Stelle ein Glas Wasser ans Fenster. Setze eine Intention und trinke es später bewusst als Symbol für Reinigung und innere Klarheit.",
        affirmation: "Ich reinige meine Energie und öffne mich für klare Führung."
      },
      "Dankbarkeit": {
        title: "Dankbarkeit",
        text: "Schreibe drei Dinge auf, für die du heute dankbar bist. Spüre jeden Satz kurz im Körper nach.",
        affirmation: "Ich erkenne die Fülle, die bereits in meinem Leben wirkt."
      },
      "Loslassen": {
        title: "Loslassen",
        text: "Schreibe auf, was du nicht länger tragen möchtest. Atme aus und stelle dir vor, wie diese Last leichter wird.",
        affirmation: "Ich lasse los, was nicht mehr zu meinem Weg gehört."
      }
    };

    const selected = data[kind] || data["Dankbarkeit"];
    if (title) title.textContent = selected.title;
    if (text) text.textContent = selected.text;
    if (affirmation) affirmation.textContent = "„" + selected.affirmation + "“";

    toast("Ritual gewählt: " + selected.title);
  }


  function quickChat(message) {
    const input = $("chatMessage");
    if (input) {
      input.value = message;
      input.focus();
    }
    showSection("chat");
    setTimeout(() => sendChat(), 120);
  }


  async function sendChat() {
    if (!needPerson()) return;

    const field = $("chatMessage");
    const message = field ? field.value.trim() : "";
    if (!message) return;

    appendBubble("user", message);
    if (field) field.value = "";

    try {
      const data = await callSoraya("/mobile/chat/save", {
        person_id: getCurrentPersonId(),
        message,
        conversation_id: ($("conversationId") && $("conversationId").value.trim()) || null,
        memory: null,
        people_ids: []
      });

      if ($("conversationId")) $("conversationId").value = data.data.conversation_id;
      if (data.data.conversation_id) localStorage.setItem(KEYS.conv, data.data.conversation_id);

      let reply = data.data.reply || "Keine Antwort.";
      if (needsSafetyNote(message)) {
        reply += "\n\nHinweis: Soraya ersetzt keine professionelle Finanz-, Rechts- oder Gesundheitsberatung.";
      }

      appendBubble("assistant", reply);
    } catch (error) {
      appendBubble("assistant", "Fehler: " + error.message);
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
      name: row.name || fallback.name || "Unbenannt",
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
      name: localStorage.getItem(KEYS.name) || (birth && birth.name) || "Ich",
      is_self: true,
      relation: "self",
      birthplace: birth && birth.birthplace
    });
  }

  async function loadPeopleFromSupabase(showToast = true) {
    try {
      const data = await callSoraya("/mobile/people/list", null, "GET");
      const people = data.data && Array.isArray(data.data.people) ? data.data.people : [];

      people.forEach((person) => addPersonToCache(person));
      cacheSelfFromStorage();
      refreshSynastryPeople();

      if (showToast) toast("Personen geladen.");
      return people;
    } catch (error) {
      cacheSelfFromStorage();
      refreshSynastryPeople();
      if (showToast) toast("Personen konnten nicht geladen werden.");
      return readPeopleCache();
    }
  }

  function hideNode(node) {
    if (!node) return;
    node.style.display = "none";
    node.setAttribute("aria-hidden", "true");
  }

  function cleanSynastryDom() {
    const section = $("synastry");
    if (!section) return;

    const selects = Array.from(section.querySelectorAll("#synPersonSelect"));
    const main = selects[0] || null;

    selects.forEach((select, index) => {
      if (select === main) return;
      select.id = "synPersonSelectLegacy" + index;
      hideNode(select);
    });

    const raw = $("personBId");
    if (raw) {
      const label = raw.previousElementSibling;
      const hint = raw.nextElementSibling;
      hideNode(raw);
      if (label && label.tagName === "LABEL") hideNode(label);
      if (hint && hint.tagName === "P") hideNode(hint);
    }
  }

  function ensureSynastryUi() {
    cleanSynastryDom();

    const wrap = document.querySelector("#synastry .syn-wrap");
    if (!wrap || $("synastryPersonCreateCard")) {
      refreshSynastryPeople();
      return;
    }

    const select = $("synPersonSelect");
    if (select && !select.dataset.sorayaBound) {
      select.dataset.sorayaBound = "1";
      select.addEventListener("change", () => {
        const raw = $("personBId");
        if (raw) raw.value = select.value || "";
      });
    }

    const createCard = document.createElement("div");
    createCard.id = "synastryPersonCreateCard";
    createCard.className = "card phaseb3-partner-card";
    createCard.innerHTML = `
      <div class="card-title">
        <h4>Zweite Person anlegen</h4>
        <span class="badge">ohne UUID</span>
      </div>
      <p class="synastry-hint">Lege eine zweite Person an. Danach erscheint sie automatisch oben in der Liste.</p>
      <label>Name</label>
      <input id="partnerName" placeholder="Name der zweiten Person" />
      <div class="partner-form-grid">
        <div><label>Tag</label><input id="partnerDay" inputmode="numeric" placeholder="14" /></div>
        <div><label>Monat</label><input id="partnerMonth" inputmode="numeric" placeholder="9" /></div>
        <div><label>Jahr</label><input id="partnerYear" inputmode="numeric" placeholder="1988" /></div>
      </div>
      <div class="partner-form-grid two">
        <div><label>Stunde optional</label><input id="partnerHour" inputmode="numeric" placeholder="18" /></div>
        <div><label>Minute optional</label><input id="partnerMinute" inputmode="numeric" placeholder="30" /></div>
      </div>
      <label>Geburtsort</label>
      <input id="partnerBirthplace" placeholder="z. B. Budapest, Ungarn" />
      <label>Beziehung</label>
      <select id="partnerRelation">
        <option value="partner">Partner/in</option>
        <option value="friend">Freund/in</option>
        <option value="family">Familie</option>
        <option value="other">Andere</option>
      </select>
      <button class="btn gold block" onclick="createSynastryPerson()" style="margin-top:16px">Zweite Person speichern</button>
      <div id="partnerCreateStatus" class="status">Noch keine zweite Person gespeichert.</div>
    `;

    const resultBox = $("synastryText");
    if (resultBox) resultBox.insertAdjacentElement("afterend", createCard);
    else wrap.appendChild(createCard);

    refreshSynastryPeople();
  }

  function refreshSynastryPeople() {
    cleanSynastryDom();

    const select = $("synPersonSelect");
    if (!select) return;

    const selfId = getCurrentPersonId();
    const people = readPeopleCache().filter((person) => person && person.id && person.id !== selfId);
    const current = select.value;

    select.innerHTML = "";

    const first = document.createElement("option");
    first.value = "";
    first.textContent = people.length ? "Person wählen…" : "Noch keine zweite Person gespeichert";
    select.appendChild(first);

    people.forEach((person) => {
      const option = document.createElement("option");
      option.value = person.id;
      option.textContent = (person.name || "Unbenannt") + (person.relation ? " · " + person.relation : "");
      select.appendChild(option);
    });

    if (current && people.some((person) => person.id === current)) {
      select.value = current;
    }

    const raw = $("personBId");
    if (raw) raw.value = select.value || "";
  }

  async function createSynastryPerson() {
    try {
      const person = {
        name: ($("partnerName") && $("partnerName").value.trim()) || "",
        year: requiredNumber("partnerYear", "Jahr"),
        month: requiredNumber("partnerMonth", "Monat"),
        day: requiredNumber("partnerDay", "Tag"),
        hour: numOrNull("partnerHour"),
        minute: numOrNull("partnerMinute"),
        birthplace: ($("partnerBirthplace") && $("partnerBirthplace").value.trim()) || ""
      };

      const relation = ($("partnerRelation") && $("partnerRelation").value) || "partner";

      if (!person.name) throw new Error("Name fehlt.");
      if (!person.birthplace) throw new Error("Geburtsort fehlt.");

      const data = await callSoraya("/mobile/people/create", {
        is_self: false,
        relation,
        person
      });

      const row = data.data && data.data.person;
      if (!row || !row.id) throw new Error("Person wurde gespeichert, aber keine ID erhalten.");

      addPersonToCache(row, { ...person, relation, is_self: false });
      refreshSynastryPeople();

      const select = $("synPersonSelect");
      if (select) select.value = row.id;
      if ($("personBId")) $("personBId").value = row.id;

      status("partnerCreateStatus", "✅ Zweite Person gespeichert.\nName: " + (row.name || person.name), "ok");
      toast("Zweite Person gespeichert.");
    } catch (error) {
      status("partnerCreateStatus", error.message, "bad");
      toast("Person konnte nicht gespeichert werden.");
    }
  }

  function renderSynastryDescription(payload) {
    const box = $("synastryText");
    if (!box) return;

    const syn = payload.synastry || {};
    const score = payload.score || syn.score || {};
    const summary = payload.summary || syn.summary || {};
    const aspects = payload.aspects || syn.aspects || [];

    const value = syn.score_value || score.value || score.score || 0;
    const label = score.label || summary.label || "Kosmische Verbindung";
    const text =
      summary.text ||
      summary.short ||
      syn.summary ||
      "Eure Verbindung wurde berechnet. Achtet darauf, wo Harmonie entsteht und wo bewusste Kommunikation wichtig ist.";

    let html = "";
    html += "✅ Synastrie gespeichert.\n";
    html += "Kompatibilität: " + value + "%\n\n";
    html += label + "\n";
    html += text;

    if (Array.isArray(aspects) && aspects.length) {
      html += "\n\nWichtige Aspekte:\n";
      aspects.slice(0, 5).forEach((aspect) => {
        html += "• " + safe(aspect.text || aspect.name || aspect.type_de || JSON.stringify(aspect)) + "\n";
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
    const selfName = localStorage.getItem(KEYS.name) || "Du";
    setText("synAInitial", initials(selfName, "Du"));
    setText("synAName", selfName);

    const select = $("synPersonSelect");
    const label = select && select.options && select.selectedIndex >= 0
      ? select.options[select.selectedIndex].textContent
      : "";
    const partner = label && !label.includes("Person wählen") ? label.replace(/\s*\(.+\)\s*$/, "") : "Zweite Person";

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

    const harmony = lower.includes("harmonie") || lower.includes("trigon") || lower.includes("sextil")
      ? "Zwischen euch gibt es Bereiche, die leicht, unterstützend und natürlich fließen."
      : "Achte darauf, wo ihr euch ohne Druck gegenseitig stärkt. Dort liegt eure natürliche Harmonie.";

    const challenge = lower.includes("spannung") || lower.includes("quadrat") || lower.includes("opposition")
      ? "Spannungen zeigen keine Schwäche, sondern Entwicklungsfelder. Bewusste Kommunikation ist euer Schlüssel."
      : "Unterschiede können euch reifen lassen, wenn ihr sie nicht als Kampf, sondern als Spiegel versteht.";

    const magnet = lower.includes("venus") || lower.includes("mars") || lower.includes("mond")
      ? "Eure Anziehung wirkt besonders über Gefühl, Nähe und persönliche Resonanz."
      : "Eure Verbindung kann durch ehrliche Aufmerksamkeit und gegenseitiges Interesse stärker werden.";

    const advice = text
      ? "Sorayas Empfehlung: Sprecht nicht nur über Probleme, sondern auch über eure Bedürfnisse. Je klarer ihr euch zeigt, desto tiefer kann die Verbindung werden."
      : "Berechne zuerst eure Verbindung. Danach erhältst du eine sanfte Empfehlung, wie ihr bewusster miteinander umgehen könnt.";

    setText("synHarmonyTitle", "Seelische Resonanz");
    setText("synHarmonyText", harmony);
    setText("synChallengeTitle", "Lernfelder");
    setText("synChallengeText", challenge);
    setText("synMagnetTitle", "Anziehung");
    setText("synMagnetText", magnet);
    setText("synAdviceText", advice);
  }


  async function saveSynastry() {
    if (!needPerson()) return;

    try {
      ensureSynastryUi();

      const partnerId =
        (($("synPersonSelect") && $("synPersonSelect").value) || "") ||
        (($("personBId") && $("personBId").value.trim()) || "");

      if (!partnerId) throw new Error("Bitte zuerst eine zweite Person auswählen oder anlegen.");
      if (partnerId === getCurrentPersonId()) throw new Error("Bitte eine andere Person auswählen.");

      const data = await callSoraya("/mobile/synastry/save", {
        person_a_id: getCurrentPersonId(),
        person_b_id: partnerId
      });

      const syn = (data.data && data.data.synastry) || {};
      const scoreObj = (data.data && data.data.score) || syn.score || {};
      const value = syn.score_value || scoreObj.value || scoreObj.score || 0;

      if ($("compatScore")) $("compatScore").textContent = value + "%";
      if ($("compatRing")) $("compatRing").style.setProperty("--score", Math.min(100, Number(value) || 0) + "%");

      renderSynastryDescription({
        synastry: syn,
        score: scoreObj,
        summary: data.data && data.data.summary,
        aspects: data.data && data.data.aspects
      });

      toast("Synastrie berechnet.");
    } catch (error) {
      status("synastryText", error.message, "bad");
      toast("Synastrie konnte nicht berechnet werden.");
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

  const MONTHS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

  function signFor(day, month) {
    return ZODIAC.find((z) => {
      const [fromMonth, fromDay] = z.from;
      const [toMonth, toDay] = z.to;
      return (month === fromMonth && day >= fromDay) || (month === toMonth && day <= toDay);
    }) || null;
  }

  function renderSun(day, month) {
    const sign = signFor(day, month);
    if (!sign) return;

    if ($("sunGlyph")) $("sunGlyph").textContent = sign.g;
    if ($("sunSign")) $("sunSign").textContent = sign.s;
    if ($("sunRange")) $("sunRange").textContent = `${sign.from[1]}. ${MONTHS[sign.from[0] - 1]} – ${sign.to[1]}. ${MONTHS[sign.to[0] - 1]}`;
    if ($("sunElement")) $("sunElement").textContent = sign.el;
    if ($("sunQuality")) $("sunQuality").textContent = sign.q;
    if ($("sunRuler")) $("sunRuler").textContent = sign.r;
    if ($("sunProps")) $("sunProps").style.display = "grid";
    if ($("profileSub")) $("profileSub").textContent = "Seelenlicht-Sucher · " + sign.s;
  }

  function renderGreeting() {
    const hour = new Date().getHours();
    const greeting = hour < 11 ? "Guten Morgen" : hour < 18 ? "Schön, dass du da bist" : "Guten Abend";
    const name = localStorage.getItem(KEYS.name) || "du";

    if ($("greetLine")) {
      $("greetLine").innerHTML = greeting + ',<br><span class="gold" id="heroName">' + escapeHtml(name) + "</span>.";
    }
  }

  function renderMoon() {
    const synodic = 29.530588853;
    const reference = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
    const now = Date.now() / 86400000;
    const age = ((now - reference) % synodic + synodic) % synodic;
    const illum = Math.round(((1 - Math.cos((2 * Math.PI * age) / synodic)) / 2) * 100);

    let label = "Mondphase";
    let sub = "Die Energie des Himmels für heute.";

    if (age < 1.85) {
      label = "Neumond";
      sub = "Zeit für Neuanfänge und Absichten.";
    } else if (age < 5.5) {
      label = "Zunehmende Sichel";
      sub = "Etwas Neues nimmt Form an.";
    } else if (age < 9.2) {
      label = "Erstes Viertel";
      sub = "Zeit zu handeln und dranzubleiben.";
    } else if (age < 12.9) {
      label = "Zunehmender Mond";
      sub = "Wachstum, Klärung, Ausrichtung.";
    } else if (age < 16.6) {
      label = "Vollmond";
      sub = "Höhepunkt — sehen, was gereift ist.";
    } else if (age < 20.3) {
      label = "Abnehmender Mond";
      sub = "Loslassen und dankbar sein.";
    } else if (age < 23.99) {
      label = "Letztes Viertel";
      sub = "Aufräumen und Klarheit schaffen.";
    } else {
      label = "Abnehmende Sichel";
      sub = "Ruhe, Rückzug, Vorbereitung.";
    }

    if ($("moonPhase")) $("moonPhase").textContent = label;
    if ($("moonIllum")) $("moonIllum").textContent = illum + "% beleuchtet";
    if ($("moonSub")) $("moonSub").textContent = sub;
    if ($("ritualMoonTitle")) $("ritualMoonTitle").textContent = label;
    if ($("ritualMoonText")) $("ritualMoonText").textContent = illum + "% beleuchtet · " + sub;
    if ($("moonVisual")) $("moonVisual").style.setProperty("--shadow-scale", Math.max(0.18, Math.min(1.25, 1 - illum / 100)));
  }

  function renderIdentity() {
    const name = localStorage.getItem(KEYS.name) || "Dein Profil";
    const birth = readJson(KEYS.birth, null);

    if ($("profileTitle")) $("profileTitle").textContent = name;
    if ($("profileInitial")) $("profileInitial").textContent = (name[0] || "S").toUpperCase();

    renderGreeting();

    if (birth) {
      if ($("pName")) $("pName").value = $("pName").value || birth.name || "";
      if ($("pDay")) $("pDay").value = $("pDay").value || birth.day || "";
      if ($("pMonth")) $("pMonth").value = $("pMonth").value || birth.month || "";
      if ($("pYear")) $("pYear").value = $("pYear").value || birth.year || "";
      if ($("pHour")) $("pHour").value = $("pHour").value || (birth.hour ?? "");
      if ($("pMinute")) $("pMinute").value = $("pMinute").value || (birth.minute ?? "");
      if ($("pBirthplace")) $("pBirthplace").value = $("pBirthplace").value || birth.birthplace || "";

      renderSun(Number(birth.day), Number(birth.month));
    }

    if ($("personId")) $("personId").value = localStorage.getItem(KEYS.person) || "";

    const created = localStorage.getItem(KEYS.created);
    if ($("daysStat")) {
      const days = created ? Math.max(1, Math.ceil((Date.now() - new Date(created).getTime()) / 86400000)) : 1;
      $("daysStat").textContent = String(days);
    }

    if ($("analysisStat")) $("analysisStat").textContent = localStorage.getItem(KEYS.analyses) || "0";
    if ($("savedStat")) $("savedStat").textContent = localStorage.getItem(KEYS.person) ? "1" : "0";
  }

  function zodiacAngle(index) {
    return ((index * 30 - 90) * Math.PI) / 180;
  }

  function xy(cx, cy, radius, angle) {
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    };
  }


  function signName(pointOrSign) {
    const sign = typeof pointOrSign === "string" ? pointOrSign : pointOrSign && pointOrSign.sign;
    const signDe = typeof pointOrSign === "object" && pointOrSign ? pointOrSign.sign_de : "";
    const map = { Ari: "Widder", Tau: "Stier", Gem: "Zwillinge", Can: "Krebs", Leo: "Löwe", Vir: "Jungfrau", Lib: "Waage", Sco: "Skorpion", Sag: "Schütze", Cap: "Steinbock", Aqu: "Wassermann", Pis: "Fische" };
    return signDe || map[sign] || sign || "–";
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

  function pointLabel(point) { return point && (point.name_de || point.name) ? (point.name_de || point.name) : "Planet"; }

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
      { key: "Ari", de: "Widder", glyph: "♈", start: 0 }, { key: "Tau", de: "Stier", glyph: "♉", start: 30 }, { key: "Gem", de: "Zwillinge", glyph: "♊", start: 60 }, { key: "Can", de: "Krebs", glyph: "♋", start: 90 },
      { key: "Leo", de: "Löwe", glyph: "♌", start: 120 }, { key: "Vir", de: "Jungfrau", glyph: "♍", start: 150 }, { key: "Lib", de: "Waage", glyph: "♎", start: 180 }, { key: "Sco", de: "Skorpion", glyph: "♏", start: 210 },
      { key: "Sag", de: "Schütze", glyph: "♐", start: 240 }, { key: "Cap", de: "Steinbock", glyph: "♑", start: 270 }, { key: "Aqu", de: "Wassermann", glyph: "♒", start: 300 }, { key: "Pis", de: "Fische", glyph: "♓", start: 330 }
    ];
    const corePoints = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Chiron", "True_North_Lunar_Node", "Mean_Lilith"];
    const cx = 210, cy = 210, outer = 190, zodiacR = 166, houseR = 145, planetR = 112, inner = 66;
    const rotation = chartRotation(data);
    let html = "";

    html += `<circle cx="${cx}" cy="${cy}" r="${outer}" fill="rgba(255,255,255,.025)" stroke="rgba(228,181,90,.72)" stroke-width="1.5"/>`;
    html += `<circle cx="${cx}" cy="${cy}" r="${houseR}" fill="none" stroke="rgba(190,108,255,.25)" stroke-width="1"/>`;
    html += `<circle cx="${cx}" cy="${cy}" r="${planetR - 20}" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="1"/>`;
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
      html += `<title>${escapeHtml(pointLabel(point))} · ${escapeHtml(signName(point))} ${safe(point.degree)}°</title>`;
    });

    const asc = data.big_three && data.big_three.ascendant ? data.big_three.ascendant : null;
    const mc = points.find((point) => point.name === "Medium_Coeli");
    if (asc) { const p = xy(cx, cy, outer + 1, pointAbsPos(asc) + rotation); html += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="13" fill="rgba(228,181,90,.20)" stroke="rgba(228,181,90,.85)"/>`; html += svgText(p.x, p.y, "AC", 9, "#fff4c9", "800"); }
    if (mc) { const p = xy(cx, cy, outer + 1, pointAbsPos(mc) + rotation); html += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="13" fill="rgba(190,108,255,.20)" stroke="rgba(190,108,255,.85)"/>`; html += svgText(p.x, p.y, "MC", 9, "#fff4c9", "800"); }
    html += svgText(cx, cy - 5, "SORAYA", 20, "rgba(228,181,90,.96)", "700");
    html += svgText(cx, cy + 17, drawablePoints.length ? "Radix" : "Birth Chart", 11, "rgba(231,222,255,.65)", "500");
    svg.innerHTML = html;
  }


  function planetGlyph(name) {
    const map = {
      Sonne: "☉",
      Sun: "☉",
      Mond: "☾",
      Moon: "☾",
      Merkur: "☿",
      Mercury: "☿",
      Venus: "♀",
      Mars: "♂",
      Jupiter: "♃",
      Saturn: "♄",
      Uranus: "♅",
      Neptun: "♆",
      Neptune: "♆",
      Pluto: "♇",
      Chiron: "⚷",
      True_North_Lunar_Node: "☊",
      Mean_Lilith: "⚸",
      Ascendant: "AC",
      Medium_Coeli: "MC"
    };

    return map[name] || "✦";
  }

  function extractPlanets(chartData) {
    if (!chartData) return [];

    const data = chartData.data || chartData;
    const candidates = [
      data.planets,
      data.planet_positions,
      data.positions,
      data.chart && data.chart.planets
    ];

    const found = candidates.find((candidate) => candidate && (Array.isArray(candidate) || typeof candidate === "object"));
    if (!found) return [];

    if (Array.isArray(found)) return found;

    return Object.entries(found).map(([name, value]) => ({
      name,
      ...(typeof value === "object" ? value : { degree_total: Number(value) || 0 })
    }));
  }

  function ensureChartDetails() {
    if ($("chartDetails")) return $("chartDetails");
    const svg = $("chartWheel");
    if (!svg || !svg.parentElement) return null;

    const box = document.createElement("div");
    box.id = "chartDetails";
    box.className = "reading";
    box.style.marginTop = "14px";
    box.textContent = "Birth-Chart-Daten werden geladen.";
    svg.parentElement.appendChild(box);
    return box;
  }





  function showLoadingVeil(text = "Soraya liest den Himmel…") {
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

  function pulseLoading(text, ms = 650) {
    showLoadingVeil(text);
    window.setTimeout(hideLoadingVeil, ms);
  }

  function bindLuxuryInteractions() {
    if (document.body.dataset.c411Bound) return;
    document.body.dataset.c411Bound = "1";

    document.addEventListener("click", (event) => {
      const interactive = event.target.closest("button, .tile, .card[onclick], .row");
      if (!interactive) return;
      interactive.classList.add("c411-tapped");
      window.setTimeout(() => interactive.classList.remove("c411-tapped"), 260);
    }, { passive: true });
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

    if (!state.ok) {
      setAppStatus("Login offen", "warn");
      return;
    }

    if (!birth || !birth.name) {
      setAppStatus("Profil offen", "warn");
      return;
    }

    setAppStatus("Soraya · aktiv", "ok");
  }


  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value;
  }

  function formatDegree(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "–";
    return Math.round(n * 10) / 10 + "°";
  }

  function planetGlyphByName(name) {
    const map = {
      Sun: "☉",
      Moon: "☾",
      Mercury: "☿",
      Venus: "♀",
      Mars: "♂",
      Jupiter: "♃",
      Saturn: "♄",
      Uranus: "♅",
      Neptune: "♆",
      Pluto: "♇",
      Chiron: "⚷",
      True_North_Lunar_Node: "☊",
      Mean_Lilith: "⚸",
      Ascendant: "AC",
      Medium_Coeli: "MC"
    };
    return map[name] || "✦";
  }

  function renderAnalysisPremium(chartJson) {
    const data = chartJson ? (chartJson.data || chartJson) : null;
    if (!data) return;

    const points = Array.isArray(data.points) ? data.points : [];
    const houses = Array.isArray(data.houses) ? data.houses : [];
    const aspects = Array.isArray(data.aspects) ? data.aspects : [];
    const big = data.big_three || {};

    const sun = big.sun || points.find((p) => p.name === "Sun");
    const moon = big.moon || points.find((p) => p.name === "Moon");
    const asc = big.ascendant || points.find((p) => p.name === "Ascendant");

    setText("bigSunSign", sun ? signName(sun) + " · " + formatDegree(sun.degree) : "–");
    setText("bigMoonSign", moon ? signName(moon) + " · " + formatDegree(moon.degree) : "–");
    setText("bigAscSign", asc ? signName(asc) + " · " + formatDegree(asc.degree) : "–");

    setText("bigSunText", sun && sun.house ? "Haus " + sun.house + " · Identität, Wille und Lebenslicht" : "Identität · Ausdruck · Lebenslicht");
    setText("bigMoonText", moon && moon.house ? "Haus " + moon.house + " · Gefühle, Sicherheit und innere Welt" : "Gefühl · Bedürfnis · innere Welt");
    setText("bigAscText", asc ? "Dein erster Eindruck, dein Weg und dein Auftreten" : "Auftreten · Weg · erste Wirkung");

    const planetList = $("planetList");
    if (planetList) {
      const wanted = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
      const rows = points
        .filter((p) => wanted.includes(p.name))
        .map((p) => {
          const glyph = planetGlyphByName(p.name);
          const name = pointLabel(p);
          const sign = signName(p);
          const degree = formatDegree(p.degree);
          const house = p.house ? "Haus " + p.house : "Haus –";
          return `<div class="c41-planet-row">
            <span class="c41-planet-glyph">${escapeHtml(glyph)}</span>
            <span class="c41-planet-name">${escapeHtml(name)}</span>
            <span class="c41-planet-sign">${escapeHtml(sign)} ${escapeHtml(degree)}</span>
            <span class="c41-planet-house">${escapeHtml(house)}</span>
          </div>`;
        })
        .join("");

      planetList.innerHTML = rows || `<div class="c41-empty">Keine Planetenliste verfügbar.</div>`;
    }

    const aspectSummary = $("aspectSummary");
    if (aspectSummary) {
      const total = aspects.length;
      const harmoniousNames = ["Trine", "Sextile", "Conjunction"];
      const challengingNames = ["Square", "Opposition"];
      const harmonious = aspects.filter((a) => harmoniousNames.includes(a.type || a.aspect || a.name)).length;
      const challenging = aspects.filter((a) => challengingNames.includes(a.type || a.aspect || a.name)).length;
      const neutral = Math.max(0, total - harmonious - challenging);

      const elements = data.distributions && data.distributions.elements ? data.distributions.elements : null;
      const elementRows = elements ? Object.entries(elements).map(([key, val]) => {
        const label = { fire: "Feuer", earth: "Erde", air: "Luft", water: "Wasser", Feuer: "Feuer", Erde: "Erde", Luft: "Luft", Wasser: "Wasser" }[key] || key;
        const count = Number(val) || 0;
        const pct = Math.min(100, Math.max(6, count * 12));
        return `<div class="c41-balance-row"><span>${escapeHtml(label)}</span><i><em style="width:${pct}%"></em></i><b>${count}</b></div>`;
      }).join("") : "";

      aspectSummary.innerHTML = `
        <div class="c41-aspect-cards">
          <div><b>${harmonious}</b><span>Harmonisch</span></div>
          <div><b>${challenging}</b><span>Spannung</span></div>
          <div><b>${neutral}</b><span>Neutral</span></div>
        </div>
        ${elementRows ? `<div class="c41-balance">${elementRows}</div>` : `<div class="c41-empty">Elemente-Balance wird geladen, sobald verfügbar.</div>`}
      `;
    }
  }


  async function loadRealChartData(force = false) {
    const birth = readJson(KEYS.birth, null);
    const details = ensureChartDetails();
    if (!birth || !birth.day || !birth.month || !birth.year || !birth.birthplace) {
      renderWheel(null);
      renderAnalysisPremium(null);
      if (details) details.textContent = "Speichere zuerst dein Profil, dann lädt Soraya dein echtes Birth Chart.";
      return null;
    }
    try {
      const config = getConfig();
      if (details) details.textContent = "Soraya berechnet dein echtes Radix ...";
      const response = await fetch(config.engineUrl.replace(/\/$/, "") + "/chart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(birth) });
      const json = await response.json();
      if (!json || json.ok === false || !json.data) throw new Error((json && json.error) || "Chart nicht verfügbar.");
      renderWheel(json);
      const data = json.data || json;
      const big = data.big_three || {};
      const meta = data.meta || {};
      const points = Array.isArray(data.points) ? data.points : [];
      const sun = big.sun ? signName(big.sun) : "–";
      const moon = big.moon ? signName(big.moon) : "–";
      const asc = big.ascendant ? signName(big.ascendant) : "–";
      const planetLine = points.filter((point) => ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"].includes(point.name)).map((point) => `${pointLabel(point)}: ${signName(point)} ${safe(point.degree)}°`).join("\n");
      const houseSystem = meta.house_system ? "Häusersystem: " + meta.house_system : "";
      const timeKnown = meta.time_known === false ? "Geburtszeit unbekannt: Soraya nutzt 12:00 als Näherung." : "";
      if (details) { details.textContent = ["✅ Echtes Birth Chart geladen.", "Sonne: " + sun, "Mond: " + moon, "Aszendent: " + asc, houseSystem, timeKnown, "", planetLine].filter((line) => line !== "").join("\n"); }
      return json;
    } catch (error) {
      renderWheel(null);
      if (details) details.textContent = "Chart konnte nicht geladen werden: " + error.message;
      return null;
    }
  }


  function setHomeTransits(html) {
    const box = $("homeTransits");
    if (box) box.innerHTML = html;
  }

  function transitRow(glyph, title, sub, right = "") {
    return '<div class="row"><div class="left"><span class="orb-sm">' + glyph + '</span><div><h4>' +
      escapeHtml(title) + '</h4><p>' + escapeHtml(sub) + '</p></div></div><span>' + escapeHtml(right) + '</span></div>';
  }

  function setEnergy(percent, label) {
    if ($("energyRing")) $("energyRing").style.setProperty("--energy", (percent == null ? 0 : percent) + "%");
    if ($("energyPct")) $("energyPct").textContent = percent == null ? "–" : percent + "%";
    if ($("energyLabel")) $("energyLabel").textContent = label || "–";
  }

  async function renderHomeSky() {
    const birth = readJson(KEYS.birth, null);
    const config = readJson(KEYS.config, null);

    if (!config || !config.engineUrl) {
      setHomeTransits(transitRow("✦", "Noch keine Verbindung", "Speichere zuerst Supabase & Backend."));
      setEnergy(null, "Verbindung fehlt");
      return;
    }

    if (!birth || !birth.day || !birth.month || !birth.year) {
      setHomeTransits(transitRow("✦", "Profil fehlt", "Hinterlege deine Geburtsdaten."));
      setEnergy(null, "Profil anlegen");
      return;
    }

    try {
      const response = await fetch(config.engineUrl.replace(/\/$/, "") + "/transits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person: birth, at: null })
      });

      const json = await response.json();
      if (!json || json.ok === false || !json.data) throw new Error((json && json.error) || "Transite nicht verfügbar.");

      const aspects = (json.data.aspects_to_natal || []).slice(0, 3);

      if (!aspects.length) {
        setHomeTransits(transitRow("☾", "Ruhiger Himmel", "Gerade keine engen Transite."));
        setEnergy(60, "Ruhig & offen");
        return;
      }

      const rows = aspects.map((aspect) => {
        const movement = aspect.movement === "Applying" ? "im Kommen" : aspect.movement === "Separating" ? "klingt ab" : "aktiv";
        const title = [aspect.transit_de, aspect.type_de, aspect.natal_de].filter(Boolean).join(" ");
        const right = aspect.orb != null ? Number(aspect.orb).toFixed(1) + "°" : "";
        return transitRow(planetGlyph(aspect.transit_de), title || "Transit", movement, right);
      }).join("");

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

      const label = score >= 66 ? "Harmonisch & offen" : score >= 45 ? "Ausgeglichen" : "Intensiv & fordernd";
      setEnergy(score, label);
    } catch (error) {
      setHomeTransits(transitRow("✦", "Transite nicht ladbar", error.message));
      setEnergy(null, "–");
    }
  }

  function previewIdentityFromForm() {
    const name = ($("pName") && $("pName").value.trim()) || localStorage.getItem(KEYS.name) || "du";
    if ($("profileTitle")) $("profileTitle").textContent = name;
    if ($("profileInitial")) $("profileInitial").textContent = (name[0] || "S").toUpperCase();

    const day = Number(($("pDay") && $("pDay").value) || 0);
    const month = Number(($("pMonth") && $("pMonth").value) || 0);
    if (day && month) renderSun(day, month);
  }

  function cleanLoginButtons() {
    closeLogin();

    document.querySelectorAll("button, a").forEach((node) => {
      const text = (node.textContent || "").trim();
      const onclick = node.getAttribute("onclick") || "";

      const isLoginTrigger =
        onclick.includes("openLogin") ||
        onclick.includes("signIn") ||
        text === "Einloggen";

      if (!isLoginTrigger) return;

      node.removeAttribute("onclick");

      if (node.tagName === "A") {
        node.href = LOGIN_PATH;
      } else {
        node.onclick = openLogin;
      }
    });
  }

  function bootstrap() {
    closeLogin();
    loadConfig();

    const storedPersonId = localStorage.getItem(KEYS.person);
    if ($("personId") && storedPersonId) $("personId").value = storedPersonId;

    const storedConversation = localStorage.getItem(KEYS.conv);
    if ($("conversationId") && storedConversation) $("conversationId").value = storedConversation;

    renderMoon();
    renderIdentity();
    renderWheel(null);
    renderHomeSky();
    renderAuthUi();
    cleanLoginButtons();
    ensureSynastryUi();
    loadPeopleFromSupabase(false);

    setTimeout(() => {
      renderIdentity();
      renderAuthUi();
      cleanLoginButtons();
      ensureSynastryUi();
      refreshSynastryPeople();
    }, 700);
  }

  window.toast = toast;
  window.status = status;
  window.safe = safe;
  window.escapeHtml = escapeHtml;
  window.markdownToHtml = markdownToHtml;

  window.showSection = showSection;
  window.openLogin = openLogin;
  window.closeLogin = closeLogin;
  window.openSettings = openSettings;
  window.closeSettings = closeSettings;

  window.initSupabase = initSupabase;
  window.saveConfig = saveConfig;
  window.loadConfig = loadConfig;
  window.getEngineUrl = getEngineUrl;
  window.getToken = getToken;
  window.callSoraya = callSoraya;

  window.signIn = signIn;
  window.signUp = signUp;
  window.signOut = signOut;

  window.createPerson = createPerson;
  window.needPerson = needPerson;
  window.loadAnalysis = loadAnalysis;
  window.loadHoroscope = loadHoroscope;
  window.appendBubble = appendBubble;
  window.clearChatView = clearChatView;
  window.sendChat = sendChat;

  window.loadPeopleFromSupabase = loadPeopleFromSupabase;
  window.refreshSynastryPeople = refreshSynastryPeople;
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

  window.addEventListener("load", bootstrap);
})();
