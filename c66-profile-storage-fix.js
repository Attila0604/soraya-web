/*
  Soraya C66.1 Profile Storage Fix
  Datei: c66-profile-storage-fix.js

  Ziel:
  - öffentliche config.js zuverlässig in localStorage spiegeln
  - Profil nach Login aus Backend laden, wenn localStorage leer ist
  - bei mehreren gespeicherten Self-Profilen immer das neueste nehmen
  - falsche Profil-Daten bei Benutzerwechsel vermeiden
  - bestehende App-Funktionen nicht ersetzen, nur absichern
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
    people: "soraya_people_cache_v1",
    authUser: "soraya_auth_user_id",
    restored: "soraya_profile_restored_at"
  };

  var installed = false;
  var restoreRunning = false;

  function text(value) {
    return value === undefined || value === null ? "" : String(value);
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
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {}
  }

  function normalizeConfig(config) {
    var c = config || {};
    return {
      supabaseUrl: text(c.supabaseUrl).trim(),
      supabaseAnonKey: text(c.supabaseAnonKey).trim(),
      engineUrl: text(c.engineUrl).trim().replace(/\/$/, "")
    };
  }

  function hasConfig(config) {
    var c = normalizeConfig(config);
    return !!(c.supabaseUrl && c.supabaseAnonKey && c.engineUrl);
  }

  function getPublicConfig() {
    return normalizeConfig(window.SORAYA_PUBLIC_CONFIG || {});
  }

  function syncPublicConfig() {
    var publicConfig = getPublicConfig();
    if (!hasConfig(publicConfig)) return null;

    /* Die öffentliche App-Konfiguration ist die stabile Quelle. */
    writeJson(KEYS.config, publicConfig);
    return publicConfig;
  }

  function getConfig() {
    return syncPublicConfig() || normalizeConfig(readJson(KEYS.config, null));
  }

  function getSupabaseClient() {
    if (window.sb) return window.sb;
    if (!window.supabase) return null;

    var config = getConfig();
    if (!hasConfig(config)) return null;

    try {
      window.sb = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      return window.sb;
    } catch (error) {
      return null;
    }
  }

  async function getSession() {
    try {
      var client = getSupabaseClient();
      if (!client) return null;
      var result = await client.auth.getSession();
      if (result.error) return null;
      return result.data && result.data.session ? result.data.session : null;
    } catch (error) {
      return null;
    }
  }

  function clearProfileStorage() {
    [KEYS.person, KEYS.conv, KEYS.name, KEYS.birth, KEYS.created, KEYS.analyses, KEYS.people, KEYS.restored].forEach(function (key) {
      try { localStorage.removeItem(key); } catch (error) {}
    });
  }

  function firstValue() {
    for (var i = 0; i < arguments.length; i += 1) {
      var value = arguments[i];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return null;
  }

  function parseBirthDate(value) {
    var raw = text(value).trim();
    if (!raw) return {};

    var iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    }

    var de = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (de) {
      return { year: Number(de[3]), month: Number(de[2]), day: Number(de[1]) };
    }

    return {};
  }

  function parseBirthTime(value) {
    var raw = text(value).trim();
    if (!raw) return {};
    var match = raw.match(/(\d{1,2}):(\d{1,2})/);
    if (!match) return {};
    return { hour: Number(match[1]), minute: Number(match[2]) };
  }

  function normalizeBirthFromPerson(row) {
    row = row || {};
    var nested = row.birth || row.birth_data || row.birthData || row.person || row.profile || {};
    var dateParts = parseBirthDate(firstValue(row.birth_date, row.date_of_birth, row.dob, nested.birth_date, nested.date_of_birth, nested.dob, nested.date));
    var timeParts = parseBirthTime(firstValue(row.birth_time, row.time_of_birth, nested.birth_time, nested.time_of_birth, nested.time));

    var birth = {
      name: text(firstValue(row.name, nested.name, localStorage.getItem(KEYS.name), "")).trim(),
      year: Number(firstValue(row.year, row.birth_year, nested.year, nested.birth_year, dateParts.year)),
      month: Number(firstValue(row.month, row.birth_month, nested.month, nested.birth_month, dateParts.month)),
      day: Number(firstValue(row.day, row.birth_day, nested.day, nested.birth_day, dateParts.day)),
      hour: firstValue(row.hour, row.birth_hour, nested.hour, nested.birth_hour, timeParts.hour),
      minute: firstValue(row.minute, row.birth_minute, nested.minute, nested.birth_minute, timeParts.minute),
      birthplace: text(firstValue(row.birthplace, row.birth_place, row.place, row.location, nested.birthplace, nested.birth_place, nested.place, nested.location, "")).trim()
    };

    birth.hour = birth.hour === null || birth.hour === undefined || birth.hour === "" ? null : Number(birth.hour);
    birth.minute = birth.minute === null || birth.minute === undefined || birth.minute === "" ? null : Number(birth.minute);

    if (!Number.isFinite(birth.year)) birth.year = null;
    if (!Number.isFinite(birth.month)) birth.month = null;
    if (!Number.isFinite(birth.day)) birth.day = null;
    if (!Number.isFinite(birth.hour)) birth.hour = null;
    if (!Number.isFinite(birth.minute)) birth.minute = null;

    return birth;
  }

  function hasUsableBirth(birth) {
    return !!(birth && birth.name && birth.year && birth.month && birth.day && birth.birthplace);
  }

  function fillProfileForm(birth, personId) {
    var fields = {
      pName: birth.name,
      pYear: birth.year,
      pMonth: birth.month,
      pDay: birth.day,
      pHour: birth.hour === null || birth.hour === undefined ? "" : birth.hour,
      pMinute: birth.minute === null || birth.minute === undefined ? "" : birth.minute,
      pBirthplace: birth.birthplace,
      personId: personId || ""
    };

    Object.keys(fields).forEach(function (id) {
      var node = document.getElementById(id);
      if (node && fields[id] !== undefined && fields[id] !== null && String(fields[id]) !== "") {
        node.value = fields[id];
      }
    });
  }

  function renderAfterRestore() {
    try { if (window.renderIdentity) window.renderIdentity(); } catch (error) {}
    try { if (window.renderProfilePreview) window.renderProfilePreview(); } catch (error) {}
    try { if (window.loadRealChartData) window.loadRealChartData(false); } catch (error) {}
    try { if (window.renderAppStatus) window.renderAppStatus(); } catch (error) {}
  }

  function dateScore(row) {
    var value = row && row.created_at ? Date.parse(row.created_at) : 0;
    return Number.isFinite(value) ? value : 0;
  }

  function findSelfPerson(people) {
    if (!Array.isArray(people) || !people.length) return null;

    var selfRows = people.filter(function (p) {
      return p && (p.is_self === true || String(p.relation || "").toLowerCase() === "self");
    });

    var candidates = selfRows.length ? selfRows : people.filter(Boolean);

    candidates.sort(function (a, b) {
      return dateScore(b) - dateScore(a);
    });

    return candidates[0] || null;
  }

  function cachePeople(people) {
    if (!Array.isArray(people)) return;
    var clean = [];
    var seen = {};

    people.forEach(function (person) {
      if (!person || !person.id || seen[person.id]) return;
      seen[person.id] = true;
      clean.push(person);
    });

    writeJson(KEYS.people, clean);
  }

  async function fetchPeople() {
    if (typeof window.callSoraya === "function") {
      var viaApp = await window.callSoraya("/mobile/people/list", null, "GET");
      var peopleFromApp = viaApp && viaApp.data && Array.isArray(viaApp.data.people) ? viaApp.data.people : [];
      cachePeople(peopleFromApp);
      return peopleFromApp;
    }

    var session = await getSession();
    var config = getConfig();
    if (!session || !session.access_token || !hasConfig(config)) return [];

    var response = await fetch(config.engineUrl.replace(/\/$/, "") + "/mobile/people/list", {
      method: "GET",
      headers: {
        Authorization: "Bearer " + session.access_token,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) return [];
    var json = await response.json();
    var people = json && json.data && Array.isArray(json.data.people) ? json.data.people : [];
    cachePeople(people);
    return people;
  }

  async function restoreProfileFromBackend(force) {
    if (restoreRunning) return false;
    restoreRunning = true;

    try {
      syncPublicConfig();

      var session = await getSession();
      var userId = session && session.user ? session.user.id : "";
      var oldUserId = localStorage.getItem(KEYS.authUser) || "";

      if (userId && oldUserId && oldUserId !== userId) {
        clearProfileStorage();
      }
      if (userId) localStorage.setItem(KEYS.authUser, userId);

      var existingBirth = readJson(KEYS.birth, null);
      var existingPersonId = localStorage.getItem(KEYS.person) || "";
      if (!force && existingPersonId && hasUsableBirth(existingBirth)) {
        fillProfileForm(existingBirth, existingPersonId);
        renderAfterRestore();
        return true;
      }

      if (!session) return false;

      var people = await fetchPeople();
      var self = findSelfPerson(people);
      if (!self || !self.id) return false;

      var birth = normalizeBirthFromPerson(self);
      localStorage.setItem(KEYS.person, self.id);
      localStorage.setItem(KEYS.name, birth.name || self.name || "Dein Profil");
      if (!localStorage.getItem(KEYS.created)) localStorage.setItem(KEYS.created, self.created_at || new Date().toISOString());

      if (hasUsableBirth(birth)) {
        writeJson(KEYS.birth, birth);
        fillProfileForm(birth, self.id);
      } else {
        var personIdNode = document.getElementById("personId");
        if (personIdNode) personIdNode.value = self.id;
      }

      localStorage.setItem(KEYS.restored, new Date().toISOString());
      renderAfterRestore();
      return true;
    } catch (error) {
      return false;
    } finally {
      restoreRunning = false;
    }
  }

  function patchFunctions() {
    if (window.__sorayaC66Patched) return;
    if (!window.createPerson && !window.signOut && !window.loadPeopleFromSupabase) return;

    window.__sorayaC66Patched = true;

    if (typeof window.createPerson === "function") {
      var originalCreatePerson = window.createPerson;
      window.createPerson = async function () {
        var result = await originalCreatePerson.apply(this, arguments);
        window.setTimeout(function () { restoreProfileFromBackend(true); }, 650);
        return result;
      };
    }

    if (typeof window.loadPeopleFromSupabase === "function") {
      var originalLoadPeople = window.loadPeopleFromSupabase;
      window.loadPeopleFromSupabase = async function () {
        var result = await originalLoadPeople.apply(this, arguments);
        window.setTimeout(function () { restoreProfileFromBackend(true); }, 300);
        return result;
      };
    }

    if (typeof window.signOut === "function") {
      var originalSignOut = window.signOut;
      window.signOut = async function () {
        try {
          return await originalSignOut.apply(this, arguments);
        } finally {
          clearProfileStorage();
          localStorage.removeItem(KEYS.authUser);
          renderAfterRestore();
        }
      };
    }
  }

  function install() {
    if (!installed) {
      installed = true;
      syncPublicConfig();
      window.sorayaRestoreProfile = function () { return restoreProfileFromBackend(true); };
    }

    patchFunctions();
    restoreProfileFromBackend(false);
  }

  var tries = 0;
  var timer = window.setInterval(function () {
    tries += 1;
    install();
    if (tries >= 32 || window.__sorayaC66Patched) window.clearInterval(timer);
  }, 250);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }

  window.addEventListener("load", function () {
    window.setTimeout(install, 350);
    window.setTimeout(function () { restoreProfileFromBackend(false); }, 1300);
    window.setTimeout(function () { restoreProfileFromBackend(false); }, 2800);
  });
})();
