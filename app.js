/*
  Soraya — C.2 Clean app.js
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

    if (id === "analysis") {
      setTimeout(() => loadRealChartData(false), 120);
    }

    if (id === "synastry") {
      setTimeout(() => {
        ensureSynastryUi();
        loadPeopleFromSupabase(false);
      }, 120);
    }

    if (id === "profile") {
      setTimeout(renderAuthUi, 120);
    }

    if (id === "home") {
      setTimeout(renderHomeSky, 120);
    }
  }

  function openLogin() {
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
      toast(error.message || "Abmelden fehlgeschlagen.");
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
      renderHomeSky();
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
      toast("Analyse geladen.");
    } catch (error) {
      if ($("analysisReading")) $("analysisReading").textContent = "Fehler: " + error.message;
      toast("Analyse konnte nicht geladen werden.");
    }
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

  function renderWheel(chartData = null) {
    const svg = $("chartWheel");
    if (!svg) return;

    const cx = 210;
    const cy = 210;
    const outer = 190;
    const middle = 145;
    const inner = 72;

    let html = "";
    html += `<circle cx="${cx}" cy="${cy}" r="${outer}" fill="rgba(255,255,255,.025)" stroke="rgba(228,181,90,.55)" stroke-width="1.4"/>`;
    html += `<circle cx="${cx}" cy="${cy}" r="${middle}" fill="none" stroke="rgba(190,108,255,.22)" stroke-width="1"/>`;
    html += `<circle cx="${cx}" cy="${cy}" r="${inner}" fill="rgba(7,8,23,.55)" stroke="rgba(255,255,255,.12)" stroke-width="1"/>`;

    ZODIAC.forEach((sign, index) => {
      const a = zodiacAngle(index);
      const p1 = xy(cx, cy, inner, a);
      const p2 = xy(cx, cy, outer, a);
      const label = xy(cx, cy, 166, a + Math.PI / 12);

      html += `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="rgba(255,255,255,.11)" stroke-width="1"/>`;
      html += `<text x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="20" fill="rgba(228,181,90,.95)">${sign.g}</text>`;
    });

    const planets = extractPlanets(chartData);
    planets.slice(0, 10).forEach((planet, index) => {
      const deg = Number(planet.degree_total ?? planet.lon ?? planet.longitude ?? index * 36);
      const angle = ((deg - 90) * Math.PI) / 180;
      const point = xy(cx, cy, 108 + (index % 3) * 9, angle);
      html += `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="10" fill="rgba(228,181,90,.14)" stroke="rgba(228,181,90,.65)"/>`;
      html += `<text x="${point.x.toFixed(1)}" y="${point.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="#fff">${planetGlyph(planet.name || planet.planet || planet.de || "")}</text>`;
    });

    html += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="22" fill="rgba(228,181,90,.95)" font-family="serif">SORAYA</text>`;
    html += `<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="11" fill="rgba(231,222,255,.65)">Birth Chart</text>`;

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
      Pluto: "♇"
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

  async function loadRealChartData(force = false) {
    const birth = readJson(KEYS.birth, null);
    const details = ensureChartDetails();

    if (!birth || !birth.day || !birth.month || !birth.year || !birth.birthplace) {
      renderWheel(null);
      if (details) details.textContent = "Speichere zuerst dein Profil, dann lädt Soraya dein echtes Birth Chart.";
      return null;
    }

    try {
      const config = getConfig();
      const response = await fetch(config.engineUrl.replace(/\/$/, "") + "/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(birth)
      });

      const json = await response.json();
      if (!json || json.ok === false) throw new Error((json && json.error) || "Chart nicht verfügbar.");

      renderWheel(json);

      const data = json.data || json;
      const big = data.big_three || {};
      const text = [
        "✅ Birth Chart geladen.",
        big.sun ? "Sonne: " + safe(big.sun.sign || big.sun) : "",
        big.moon ? "Mond: " + safe(big.moon.sign || big.moon) : "",
        big.ascendant ? "Aszendent: " + safe(big.ascendant.sign || big.ascendant) : ""
      ].filter(Boolean).join("\n");

      if (details) details.textContent = text || "✅ Birth Chart geladen.";
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
