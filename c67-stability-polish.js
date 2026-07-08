/*
  Soraya C67 Stability Polish
  Datei: c67-stability-polish.js

  Ziel:
  - öffentliche config.js ist immer die Quelle der Wahrheit
  - alte/falsche localStorage-Backend-URL wird überschrieben
  - Profil wird nach Login stabil aus Backend/localStorage wiederhergestellt
  - Home/Analyse/Horoskop zeigen schöne Fallbacks statt hässlicher Fehlerkarten
  - bestehende App-Funktionen werden nur stabilisiert, nicht komplett ersetzt
*/
(function () {
  "use strict";

  var KEYS = {
    config: "soraya_config",
    person: "soraya_person_id",
    conv: "soraya_conversation_id",
    name: "soraya_person_name",
    birth: "soraya_birth",
    created: "soraya_created_at",
    analyses: "soraya_analysis_count",
    people: "soraya_people_cache_v1"
  };

  var stableClient = null;
  var stableBootDone = false;

  function $(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return value === undefined || value === null ? "" : String(value);
  }

  function safe(value, fallback) {
    var s = text(value).trim();
    return s || fallback || "";
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {}
  }

  function normalizeConfig(config) {
    var c = config || {};
    return {
      supabaseUrl: safe(c.supabaseUrl),
      supabaseAnonKey: safe(c.supabaseAnonKey),
      engineUrl: safe(c.engineUrl).replace(/\/$/, "")
    };
  }

  function hasConfig(config) {
    var c = normalizeConfig(config);
    return !!(c.supabaseUrl && c.supabaseAnonKey && c.engineUrl && /^https:\/\//i.test(c.supabaseUrl) && /^https:\/\//i.test(c.engineUrl));
  }

  function getPublicConfig() {
    return normalizeConfig(window.SORAYA_PUBLIC_CONFIG || {});
  }

  function getStableConfig() {
    var publicConfig = getPublicConfig();

    /* Wichtig: public config gewinnt immer gegen alte lokale Werte. */
    if (hasConfig(publicConfig)) {
      writeJson(KEYS.config, publicConfig);
      return publicConfig;
    }

    return normalizeConfig(readJson(KEYS.config, null));
  }

  function syncConfig() {
    var config = getStableConfig();
    if (hasConfig(config)) writeJson(KEYS.config, config);
    return config;
  }

  function ensureClient() {
    if (stableClient) return stableClient;
    if (window.sb) return window.sb;
    if (!window.supabase) return null;

    var config = syncConfig();
    if (!hasConfig(config)) return null;

    stableClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    window.sb = stableClient;
    return stableClient;
  }

  async function getSession() {
    try {
      var client = ensureClient();
      if (!client) return null;
      var result = await client.auth.getSession();
      if (result.error) return null;
      return result.data && result.data.session ? result.data.session : null;
    } catch (error) {
      return null;
    }
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function setText(id, value) {
    var node = $(id);
    if (node) node.textContent = value;
  }

  function toast(message) {
    if (typeof window.toast === "function") {
      try { window.toast(message); return; } catch (error) {}
    }
    var node = $("toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    window.setTimeout(function () { node.classList.remove("show"); }, 2400);
  }

  function friendlyError(error, fallback) {
    var msg = error && error.message ? error.message : text(error || fallback);
    if (/not logged|nicht eingeloggt|JWT|session/i.test(msg)) return "Bitte zuerst einloggen.";
    if (/Failed to fetch|NetworkError|Load failed|fetch|timeout|timed out|Network request failed/i.test(msg)) return "Verbindung kurz nicht erreichbar. Soraya zeigt vorläufige Werte und versucht es später erneut.";
    return msg || fallback || "Soraya konnte nicht laden.";
  }

  async function withTimeout(promise, ms, label) {
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = window.setTimeout(function () { reject(new Error(label || "timeout")); }, ms || 12000);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function getToken() {
    var session = await getSession();
    if (!session || !session.access_token) throw new Error("Nicht eingeloggt. Bitte über /login einloggen.");
    return session.access_token;
  }

  async function callSoraya(path, body, method) {
    method = method || "POST";
    var config = syncConfig();
    if (!hasConfig(config)) throw new Error("App-Verbindung fehlt.");

    var token = await getToken();
    var response = await withTimeout(fetch(config.engineUrl + path, {
      method: method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: method === "GET" ? undefined : JSON.stringify(body || {})
    }), 15000, "Backend dauerte zu lange.");

    var responseText = await response.text();
    var json;
    try { json = JSON.parse(responseText); }
    catch (error) { throw new Error(responseText || "Ungültige Backend-Antwort."); }

    if (!response.ok) throw new Error(json.detail || json.error || "HTTP " + response.status);
    if (json.ok === false) throw new Error(json.error || "Soraya ok=false");
    return json;
  }

  async function directEngine(path, payload) {
    var config = syncConfig();
    if (!hasConfig(config)) throw new Error("App-Verbindung fehlt.");

    var response = await withTimeout(fetch(config.engineUrl + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    }), 14000, "Backend dauerte zu lange.");

    var json = await response.json();
    if (!response.ok) throw new Error(json.detail || json.error || "HTTP " + response.status);
    if (!json || json.ok === false || !json.data) throw new Error((json && json.error) || "Keine Daten erhalten.");
    return json;
  }

  function parseDateParts(value) {
    var raw = text(value).trim();
    var iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    var de = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (de) return { year: Number(de[3]), month: Number(de[2]), day: Number(de[1]) };
    return {};
  }

  function parseTimeParts(value) {
    var raw = text(value).trim();
    var match = raw.match(/(\d{1,2}):(\d{1,2})/);
    if (!match) return {};
    return { hour: Number(match[1]), minute: Number(match[2]) };
  }

  function normalizeBirth(row) {
    row = row || {};
    var nested = row.person || row.birth || row.birthData || {};
    var date = parseDateParts(row.birth_date || nested.birth_date || nested.date || "");
    var time = parseTimeParts(row.birth_time || nested.birth_time || nested.time || "");

    var birth = {
      name: safe(row.name || nested.name || localStorage.getItem(KEYS.name), ""),
      year: Number(row.year || row.birth_year || nested.year || date.year),
      month: Number(row.month || row.birth_month || nested.month || date.month),
      day: Number(row.day || row.birth_day || nested.day || date.day),
      hour: row.hour !== undefined ? row.hour : (nested.hour !== undefined ? nested.hour : time.hour),
      minute: row.minute !== undefined ? row.minute : (nested.minute !== undefined ? nested.minute : time.minute),
      birthplace: safe(row.birthplace || row.birth_place || nested.birthplace || nested.birth_place || nested.place, "")
    };

    birth.hour = birth.hour === undefined || birth.hour === null || birth.hour === "" ? null : Number(birth.hour);
    birth.minute = birth.minute === undefined || birth.minute === null || birth.minute === "" ? null : Number(birth.minute);

    if (!Number.isFinite(birth.year)) birth.year = null;
    if (!Number.isFinite(birth.month)) birth.month = null;
    if (!Number.isFinite(birth.day)) birth.day = null;
    if (!Number.isFinite(birth.hour)) birth.hour = null;
    if (!Number.isFinite(birth.minute)) birth.minute = null;
    return birth;
  }

  function hasBirth(birth) {
    return !!(birth && birth.name && birth.year && birth.month && birth.day && birth.birthplace);
  }

  function getBirth() {
    var birth = readJson(KEYS.birth, null);
    if (hasBirth(birth)) return birth;

    var formBirth = normalizeBirth({
      name: $("pName") && $("pName").value,
      year: $("pYear") && $("pYear").value,
      month: $("pMonth") && $("pMonth").value,
      day: $("pDay") && $("pDay").value,
      hour: $("pHour") && $("pHour").value,
      minute: $("pMinute") && $("pMinute").value,
      birthplace: $("pBirthplace") && $("pBirthplace").value
    });

    if (hasBirth(formBirth)) {
      writeJson(KEYS.birth, formBirth);
      return formBirth;
    }

    return birth || null;
  }

  function fillProfile(birth, personId) {
    if (!birth) return;
    var map = {
      pName: birth.name,
      pYear: birth.year,
      pMonth: birth.month,
      pDay: birth.day,
      pHour: birth.hour === null || birth.hour === undefined ? "" : birth.hour,
      pMinute: birth.minute === null || birth.minute === undefined ? "" : birth.minute,
      pBirthplace: birth.birthplace,
      personId: personId || localStorage.getItem(KEYS.person) || ""
    };

    Object.keys(map).forEach(function (id) {
      var node = $(id);
      if (node && map[id] !== undefined && map[id] !== null && text(map[id]) !== "") node.value = map[id];
    });

    if (birth.name) localStorage.setItem(KEYS.name, birth.name);
    writeJson(KEYS.birth, birth);
  }

  function pickSelf(people) {
    if (!Array.isArray(people) || !people.length) return null;
    var candidates = people.filter(function (p) {
      return p && (p.is_self === true || text(p.relation).toLowerCase() === "self");
    });
    if (!candidates.length) candidates = people.filter(Boolean);
    candidates.sort(function (a, b) {
      var ad = Date.parse(a.created_at || "") || 0;
      var bd = Date.parse(b.created_at || "") || 0;
      return bd - ad;
    });
    return candidates[0] || null;
  }

  async function restoreProfile(force) {
    var current = getBirth();
    var currentId = localStorage.getItem(KEYS.person) || "";
    if (!force && currentId && hasBirth(current)) {
      fillProfile(current, currentId);
      updateProfileState();
      return current;
    }

    try {
      var people = await callSoraya("/mobile/people/list", null, "GET");
      var list = people && people.data && Array.isArray(people.data.people) ? people.data.people : [];
      writeJson(KEYS.people, list);
      var self = pickSelf(list);
      if (!self || !self.id) return current;

      var birth = normalizeBirth(self);
      localStorage.setItem(KEYS.person, self.id);
      localStorage.setItem(KEYS.name, birth.name || self.name || "Dein Profil");
      if (!localStorage.getItem(KEYS.created)) localStorage.setItem(KEYS.created, self.created_at || new Date().toISOString());
      fillProfile(birth, self.id);
      updateProfileState();
      return birth;
    } catch (error) {
      updateProfileState();
      return current;
    }
  }

  var SIGNS = [
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

  var MONTHS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

  function signFor(day, month) {
    for (var i = 0; i < SIGNS.length; i += 1) {
      var z = SIGNS[i];
      if ((month === z.from[0] && day >= z.from[1]) || (month === z.to[0] && day <= z.to[1])) return z;
    }
    return null;
  }

  function renderIdentity() {
    var birth = getBirth();
    var name = (birth && birth.name) || localStorage.getItem(KEYS.name) || "du";
    var hour = new Date().getHours();
    var greeting = hour < 11 ? "Guten Morgen" : hour < 18 ? "Schön, dass du da bist" : "Guten Abend";

    setText("profileTitle", name);
    setText("profileInitial", (name[0] || "S").toUpperCase());
    if ($("greetLine")) $("greetLine").innerHTML = escapeHtml(greeting) + ',<br><span class="gold" id="heroName">' + escapeHtml(name) + '</span>.';

    if (birth && birth.day && birth.month) {
      var sign = signFor(Number(birth.day), Number(birth.month));
      if (sign) {
        setText("sunGlyph", sign.g);
        setText("sunSign", sign.s);
        setText("sunRange", sign.from[1] + ". " + MONTHS[sign.from[0] - 1] + " – " + sign.to[1] + ". " + MONTHS[sign.to[0] - 1]);
        setText("sunElement", sign.el);
        setText("sunQuality", sign.q);
        setText("sunRuler", sign.r);
        setText("profileSub", "Sonnenzeichen · " + sign.s);
        if ($("sunProps")) $("sunProps").style.display = "grid";
      }
    }

    if ($("personId")) $("personId").value = localStorage.getItem(KEYS.person) || "";
    setText("savedStat", localStorage.getItem(KEYS.person) ? "1" : "0");
    setText("analysisStat", localStorage.getItem(KEYS.analyses) || "0");
  }

  function updateProfilePreview() {
    var birth = getBirth();
    var preview = document.querySelector(".c45-birth-preview");
    if (!preview || !hasBirth(birth)) return;

    var time = birth.hour !== null && birth.hour !== undefined ? String(birth.hour).padStart(2, "0") + ":" + String(birth.minute || 0).padStart(2, "0") : "Geburtszeit offen";
    preview.innerHTML = '<div><b>✦</b><span>' + escapeHtml(birth.day) + '.' + escapeHtml(birth.month) + '.' + escapeHtml(birth.year) + ' · ' + escapeHtml(time) + '</span></div><div><b>⌖</b><span>' + escapeHtml(birth.birthplace) + '</span></div>';
  }

  function updateProfileState() {
    var birth = getBirth();
    var hasProfile = !!(localStorage.getItem(KEYS.person) || hasBirth(birth));
    document.body.classList.toggle("soraya-has-profile", hasProfile);

    var guide = $("analysisEmptyGuide");
    if (guide) guide.style.display = hasProfile ? "none" : "";

    var card = $("onboardingCard");
    if (card) card.style.display = hasProfile ? "none" : "";

    updateProfilePreview();
    renderIdentity();
  }

  function setHomeTransits(html) {
    var box = $("homeTransits");
    if (box) box.innerHTML = html;
  }

  function planetGlyph(name) {
    var map = { Sonne: "☉", Sun: "☉", Mond: "☾", Moon: "☾", Merkur: "☿", Mercury: "☿", Venus: "♀", Mars: "♂", Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptun: "♆", Neptune: "♆", Pluto: "♇" };
    return map[name] || "✦";
  }

  function transitRow(glyph, title, sub, right) {
    return '<div class="row"><div class="left"><span class="orb-sm">' + escapeHtml(glyph) + '</span><div><h4>' + escapeHtml(title) + '</h4><p>' + escapeHtml(sub) + '</p></div></div><span>' + escapeHtml(right || '') + '</span></div>';
  }

  function setEnergy(percent, label) {
    if ($("energyRing")) $("energyRing").style.setProperty("--energy", (percent == null ? 42 : percent) + "%");
    setText("energyPct", percent == null ? "42%" : percent + "%");
    setText("energyLabel", label || "Ruhig & stabil");
  }

  function renderMoon() {
    var synodic = 29.530588853;
    var reference = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
    var now = Date.now() / 86400000;
    var age = ((now - reference) % synodic + synodic) % synodic;
    var illum = Math.round(((1 - Math.cos((2 * Math.PI * age) / synodic)) / 2) * 100);
    var label = "Mondphase";

    if (age < 1.85) label = "Neumond";
    else if (age < 5.5) label = "Zunehmende Sichel";
    else if (age < 9.2) label = "Erstes Viertel";
    else if (age < 12.9) label = "Zunehmender Mond";
    else if (age < 16.6) label = "Vollmond";
    else if (age < 20.3) label = "Abnehmender Mond";
    else if (age < 23.99) label = "Letztes Viertel";
    else label = "Abnehmende Sichel";

    setText("moonPhase", label);
    setText("moonIllum", illum + "% beleuchtet");
  }

  async function renderHomeSky() {
    var birth = await restoreProfile(false);
    renderMoon();
    updateProfileState();

    if (!hasBirth(birth)) {
      setHomeTransits(transitRow("✦", "Profil bereit machen", "Speichere dein Profil, dann erscheinen persönliche Transite."));
      setEnergy(42, "Profil offen");
      return;
    }

    setHomeTransits(transitRow("✦", "Transite werden geladen", "Soraya prüft deinen aktuellen Himmel."));
    setEnergy(42, "Wird berechnet");

    try {
      var json = await directEngine("/transits", { person: birth, at: null });
      var aspects = (json.data.aspects_to_natal || []).slice(0, 3);
      if (!aspects.length) {
        setHomeTransits(transitRow("☾", "Ruhiger Himmel", "Heute wirken wenige enge Transite. Nutze Klarheit und Ruhe."));
        setEnergy(60, "Ruhig & offen");
        return;
      }

      var html = aspects.map(function (aspect) {
        var movement = aspect.movement === "Applying" ? "im Kommen" : aspect.movement === "Separating" ? "klingt ab" : "aktiv";
        var title = [aspect.transit_de, aspect.type_de, aspect.natal_de].filter(Boolean).join(" ") || "Aktueller Transit";
        var right = aspect.orb != null ? Number(aspect.orb).toFixed(1) + "°" : "";
        return transitRow(planetGlyph(aspect.transit_de), title, movement, right);
      }).join("");

      setHomeTransits(html);

      var harmony = 0;
      var tension = 0;
      (json.data.aspects_to_natal || []).slice(0, 7).forEach(function (aspect) {
        if (aspect.type_de === "Trigon" || aspect.type_de === "Sextil") harmony += 1;
        if (aspect.type_de === "Quadrat" || aspect.type_de === "Opposition") tension += 1;
      });
      var total = harmony + tension;
      var score = total ? Math.round(50 + ((harmony - tension) / total) * 42) : 60;
      score = Math.max(8, Math.min(96, score));
      setEnergy(score, score >= 66 ? "Harmonisch & offen" : score >= 45 ? "Ausgeglichen" : "Intensiv & fordernd");
    } catch (error) {
      document.body.classList.add("soraya-backend-soft-fail");
      setHomeTransits(transitRow("✦", "Sanfter Tagesimpuls", "Backend ist kurz nicht erreichbar. Dein Profil bleibt gespeichert; Soraya versucht es später erneut."));
      setEnergy(42, "Ruhig & stabil");
    }
  }

  function renderChartFallback(detailsText) {
    if (typeof window.renderWheel === "function") {
      try { window.renderWheel(null); } catch (error) {}
    }
    var details = $("chartDetails") || document.querySelector(".c4-chart-card + .status") || document.querySelector("#analysis .status");
    if (details) {
      details.classList.add("c67-soft-status");
      details.textContent = detailsText || "Soraya zeigt die Chart-Ansicht. Sobald das Backend erreichbar ist, erscheinen Planeten und Häuser automatisch.";
    }
  }

  async function loadRealChartData(force) {
    var birth = await restoreProfile(!!force);
    updateProfileState();

    if (!hasBirth(birth)) {
      renderChartFallback("Speichere zuerst dein Profil, dann lädt Soraya dein echtes Birth Chart.");
      return null;
    }

    try {
      var json = await directEngine("/chart", birth);
      if (typeof window.renderWheel === "function") window.renderWheel(json);
      if (typeof window.renderAnalysisDetails === "function") window.renderAnalysisDetails(json);

      var details = $("chartDetails") || document.querySelector("#analysis .c4-chart-card + .status") || document.querySelector("#analysis .status");
      if (details) {
        var data = json.data || {};
        var big = data.big_three || {};
        var sun = big.sun && (big.sun.sign_de || big.sun.sign) ? (big.sun.sign_de || big.sun.sign) : "geladen";
        var moon = big.moon && (big.moon.sign_de || big.moon.sign) ? (big.moon.sign_de || big.moon.sign) : "geladen";
        var asc = big.ascendant && (big.ascendant.sign_de || big.ascendant.sign) ? (big.ascendant.sign_de || big.ascendant.sign) : "geladen";
        details.classList.remove("bad");
        details.textContent = "✅ Echtes Birth Chart geladen.\nSonne: " + sun + "\nMond: " + moon + "\nAszendent: " + asc;
      }
      return json;
    } catch (error) {
      renderChartFallback("Chart aktuell nicht erreichbar. Profil ist gespeichert; Soraya versucht die Berechnung später erneut.");
      return null;
    }
  }

  function renderHoroscopeDefaults() {
    setText("horoFocusTitle", "Innere Klarheit");
    setText("horoFocusText", "Wähle heute eine klare Priorität und gehe sie ruhig Schritt für Schritt an.");
    setText("horoLoveTitle", "Herz & Nähe");
    setText("horoLoveText", "Nähe entsteht durch ehrliche Worte und kleine Zeichen von Aufmerksamkeit.");
    setText("horoWorkTitle", "Richtung & Kraft");
    setText("horoWorkText", "Ordne zuerst das Wichtigste. Weniger Druck bringt heute bessere Entscheidungen.");
    setText("horoRitualTitle", "Atem & Erdung");
    setText("horoRitualText", "Atme fünfmal tief ein und aus. Spüre den Boden und formuliere eine klare Intention.");
    setText("horoAffirmation", "„Ich gehe meinen Weg mit Ruhe und Klarheit.“");
  }

  function patchShowSection() {
    var originalShow = window.showSection;
    window.showSection = function (id) {
      var target = $(id);
      if (!target) {
        if (typeof originalShow === "function") return originalShow(id);
        return false;
      }

      document.querySelectorAll(".section").forEach(function (section) { section.classList.remove("active"); });
      target.classList.add("active");
      document.querySelectorAll("[data-nav]").forEach(function (button) {
        button.classList.toggle("active", button.getAttribute("data-nav") === id);
      });

      window.scrollTo({ top: 0, behavior: "auto" });
      updateProfileState();

      if (id === "home") window.setTimeout(renderHomeSky, 120);
      if (id === "analysis") window.setTimeout(function () { loadRealChartData(false); }, 120);
      if (id === "horoscope") window.setTimeout(renderHoroscopeDefaults, 80);
      if (id === "profile") window.setTimeout(function () { restoreProfile(false); updateProfileState(); }, 100);
      if (id === "synastry" && typeof window.loadPeopleFromSupabase === "function") window.setTimeout(function () { window.loadPeopleFromSupabase(false); }, 120);

      try {
        var url = new URL(window.location.href);
        url.searchParams.set("section", id);
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      } catch (error) {}

      return true;
    };
  }

  function patchCreatePerson() {
    if (window.__sorayaC67CreatePatched || typeof window.createPerson !== "function") return;
    window.__sorayaC67CreatePatched = true;
    var original = window.createPerson;
    window.createPerson = async function () {
      var result = await original.apply(this, arguments);
      window.setTimeout(function () { restoreProfile(true); renderHomeSky(); }, 700);
      return result;
    };
  }

  function patchWindowFunctions() {
    window.getEngineUrl = function () { return syncConfig().engineUrl; };
    window.getToken = getToken;
    window.callSoraya = callSoraya;
    window.loadRealChartData = loadRealChartData;
    window.renderMoon = renderMoon;
    window.sorayaRestoreProfile = function () { return restoreProfile(true); };
    window.sorayaRenderHomeSky = renderHomeSky;

    patchShowSection();
    patchCreatePerson();
  }

  async function boot() {
    syncConfig();
    patchWindowFunctions();
    renderHoroscopeDefaults();
    await restoreProfile(false);
    updateProfileState();
    renderMoon();
    renderHomeSky();

    var active = document.querySelector(".section.active");
    if (active && active.id === "analysis") loadRealChartData(false);

    stableBootDone = true;
  }

  function delayedBoot() {
    boot();
    window.setTimeout(function () { if (!stableBootDone) boot(); }, 900);
    window.setTimeout(function () { restoreProfile(false); updateProfileState(); }, 1600);
    window.setTimeout(renderHomeSky, 2600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", delayedBoot, { once: true });
  } else {
    delayedBoot();
  }

  window.addEventListener("load", function () {
    window.setTimeout(delayedBoot, 300);
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) window.setTimeout(renderHomeSky, 250);
  });
})();
