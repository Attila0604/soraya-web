/*
  Soraya — C.6.7 Stable Login
  Datei: login.js

  Ziel:
  - Login/Registrierung auf neuen Geräten und im Inkognito-Modus stabiler machen
  - öffentliche config.js automatisch in localStorage spiegeln
  - Supabase-Session zuverlässig erkennen
  - doppelte Klicks verhindern
  - klare, sichere Fehlermeldungen anzeigen
*/
(function () {
  "use strict";

  var LOGIN_KEYS = {
    config: "soraya_config",
    name: "soraya_person_name",
    afterPath: "soraya_after_login_path",
    afterSection: "soraya_after_login_section",
    lastEmail: "soraya_last_login_email"
  };

  var loginClient = null;
  var busy = false;

  function el(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return value === undefined || value === null ? "" : String(value);
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

  function readStoredConfig() {
    try {
      var raw = localStorage.getItem(LOGIN_KEYS.config);
      return raw ? normalizeConfig(JSON.parse(raw)) : null;
    } catch (error) {
      return null;
    }
  }

  function writeStoredConfig(config) {
    try {
      localStorage.setItem(LOGIN_KEYS.config, JSON.stringify(normalizeConfig(config)));
    } catch (error) {}
  }

  function getAvailableConfig() {
    var publicConfig = getPublicConfig();
    if (hasConfig(publicConfig)) {
      writeStoredConfig(publicConfig);
      return publicConfig;
    }

    var stored = readStoredConfig();
    if (hasConfig(stored)) return stored;
    return null;
  }

  function isDeveloperMode() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get("dev") === "1" || localStorage.getItem("soraya_dev") === "1";
    } catch (error) {
      return false;
    }
  }

  function setLoginStatus(message, type) {
    var node = el("loginStatus");
    if (!node) return;
    node.classList.remove("ok", "bad");
    if (type) node.classList.add(type);
    node.textContent = message;
  }

  function setBusy(nextBusy) {
    busy = !!nextBusy;
    ["loginSubmitButton", "loginTabButton", "registerTabButton"].forEach(function (id) {
      var node = el(id);
      if (node) node.disabled = busy;
    });
  }

  function friendlyError(error, fallback) {
    var msg = error && error.message ? error.message : text(error || fallback);

    if (/invalid login|invalid credentials/i.test(msg)) return "E-Mail oder Passwort stimmt nicht.";
    if (/email not confirmed|not confirmed|confirm/i.test(msg)) return "Bitte bestätige zuerst deine E-Mail und versuche es danach erneut.";
    if (/password/i.test(msg) && /short|weak|6/i.test(msg)) return "Bitte ein Passwort mit mindestens 6 Zeichen verwenden.";
    if (/Failed to fetch|NetworkError|Load failed|fetch|timeout|timed out/i.test(msg)) return "Verbindung nicht erreichbar. Bitte Internet prüfen und später erneut versuchen.";
    if (/rate limit|too many/i.test(msg)) return "Zu viele Versuche. Bitte kurz warten und erneut versuchen.";
    if (/storage|quota|localStorage/i.test(msg)) return "Der Browser-Speicher ist blockiert. Bitte Inkognito-Speicher erlauben oder normalen Browser verwenden.";

    return msg || fallback;
  }

  function fillConfigForm(config) {
    var c = normalizeConfig(config);
    if (el("loginSupabaseUrl")) el("loginSupabaseUrl").value = c.supabaseUrl || "";
    if (el("loginSupabaseAnonKey")) el("loginSupabaseAnonKey").value = c.supabaseAnonKey || "";
    if (el("loginEngineUrl")) el("loginEngineUrl").value = c.engineUrl || "";
  }

  function renderConnectionBox() {
    var box = el("connectionBox");
    if (!box) return;
    var show = isDeveloperMode() || !hasConfig(getPublicConfig());
    box.style.display = show ? "" : "none";
    box.open = show && !hasConfig(getAvailableConfig());
  }

  function initLoginClient(config) {
    var c = normalizeConfig(config || getAvailableConfig());
    if (!window.supabase) throw new Error("Supabase wurde nicht geladen.");
    if (!hasConfig(c)) throw new Error("App-Verbindung fehlt.");

    writeStoredConfig(c);

    loginClient = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce"
      }
    });

    window.sb = window.sb || loginClient;
    return loginClient;
  }

  function getLoginClient() {
    return loginClient || initLoginClient();
  }

  function getEmail() {
    return el("loginEmail") ? el("loginEmail").value.trim().toLowerCase() : "";
  }

  function getPassword() {
    return el("loginPassword") ? el("loginPassword").value : "";
  }

  function validateLoginFields(requirePassword) {
    var email = getEmail();
    var password = getPassword();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Bitte eine gültige E-Mail eingeben.");
    if (requirePassword && (!password || password.length < 6)) throw new Error("Bitte ein Passwort mit mindestens 6 Zeichen eingeben.");
    return { email: email, password: password };
  }

  function safeSetAfterPath() {
    try {
      if (!localStorage.getItem(LOGIN_KEYS.afterPath)) {
        localStorage.setItem(LOGIN_KEYS.afterPath, "/?section=profile");
      }
    } catch (error) {}
  }

  function returnToApp(delay) {
    var target = "/?section=profile";
    try {
      target = localStorage.getItem(LOGIN_KEYS.afterPath) || "/?section=profile";
      if (!target || target.indexOf("/login") === 0) target = "/?section=profile";
      localStorage.removeItem(LOGIN_KEYS.afterPath);
    } catch (error) {}

    window.setTimeout(function () {
      window.location.href = target;
    }, delay || 500);
  }

  function shouldReturnAfterSession() {
    try {
      var params = new URLSearchParams(window.location.search);
      return !!(
        params.get("code") ||
        params.get("access_token") ||
        params.get("refresh_token") ||
        params.get("return") === "1" ||
        localStorage.getItem(LOGIN_KEYS.afterPath)
      );
    } catch (error) {
      return false;
    }
  }

  function setMode(mode) {
    mode = mode === "register" ? "register" : "login";
    if (el("loginMode")) el("loginMode").value = mode;
    if (el("loginTabButton")) el("loginTabButton").classList.toggle("active", mode === "login");
    if (el("registerTabButton")) el("registerTabButton").classList.toggle("active", mode === "register");
    if (el("loginSubmitButton")) el("loginSubmitButton").textContent = mode === "register" ? "Registrieren" : "Einloggen";
    if (el("loginPassword")) el("loginPassword").autocomplete = mode === "register" ? "new-password" : "current-password";
    setLoginStatus(mode === "register" ? "Bereit zum Registrieren." : "Bereit zum Einloggen.");
  }

  function togglePassword() {
    var input = el("loginPassword");
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    var button = document.querySelector(".password-toggle");
    if (button) button.setAttribute("aria-label", input.type === "password" ? "Passwort anzeigen" : "Passwort verstecken");
  }

  async function withTimeout(promise, ms, label) {
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = window.setTimeout(function () {
        reject(new Error(label || "timeout"));
      }, ms || 12000);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function verifyBackendSession(session) {
    try {
      var config = getAvailableConfig();
      if (!session || !session.access_token || !config || !config.engineUrl) return false;

      var response = await withTimeout(fetch(config.engineUrl.replace(/\/$/, "") + "/auth/me", {
        method: "GET",
        headers: {
          Authorization: "Bearer " + session.access_token,
          "Content-Type": "application/json"
        }
      }), 8000, "Backend-Prüfung dauerte zu lange.");

      return response && response.ok;
    } catch (error) {
      return false;
    }
  }

  async function checkLoginSession() {
    try {
      var config = getAvailableConfig();
      fillConfigForm(config);
      renderConnectionBox();

      if (!config) {
        setLoginStatus("App-Verbindung fehlt. Bitte Admin-Verbindung prüfen.", "bad");
        return false;
      }

      var client = getLoginClient();
      var result = await withTimeout(client.auth.getSession(), 12000, "Session-Prüfung dauerte zu lange.");
      if (result.error) throw result.error;

      if (result.data && result.data.session && result.data.session.user) {
        var email = result.data.session.user.email || "";
        if (email && !localStorage.getItem(LOGIN_KEYS.name)) localStorage.setItem(LOGIN_KEYS.name, email.split("@")[0]);

        var backendOk = await verifyBackendSession(result.data.session);
        setLoginStatus(backendOk ? "✅ Du bist eingeloggt. Verbindung ist aktiv." : "✅ Login aktiv. Backend wird in der App erneut geprüft.", "ok");

        if (shouldReturnAfterSession()) returnToApp(650);
        return true;
      }

      setLoginStatus("Bereit zum Einloggen.");
      return false;
    } catch (error) {
      renderConnectionBox();
      setLoginStatus(friendlyError(error, "Login konnte nicht geprüft werden."), "bad");
      return false;
    }
  }

  async function signIn() {
    if (busy) return;

    try {
      setBusy(true);
      var fields = validateLoginFields(true);
      safeSetAfterPath();
      localStorage.setItem(LOGIN_KEYS.lastEmail, fields.email);

      setLoginStatus("Login läuft ...");
      var client = getLoginClient();
      var result = await withTimeout(client.auth.signInWithPassword({ email: fields.email, password: fields.password }), 15000, "Login dauerte zu lange.");
      if (result.error) throw result.error;

      var sessionResult = await withTimeout(client.auth.getSession(), 12000, "Session konnte nicht bestätigt werden.");
      if (sessionResult.error) throw sessionResult.error;
      if (!sessionResult.data || !sessionResult.data.session) throw new Error("Login wurde nicht gespeichert. Bitte erneut versuchen.");

      var userEmail = result.data && result.data.user && result.data.user.email ? result.data.user.email : fields.email;
      if (!localStorage.getItem(LOGIN_KEYS.name)) localStorage.setItem(LOGIN_KEYS.name, userEmail.split("@")[0]);

      var backendOk = await verifyBackendSession(sessionResult.data.session);
      setLoginStatus(backendOk ? "✅ Login erfolgreich. Soraya öffnet die App ..." : "✅ Login erfolgreich. Soraya öffnet die App und prüft Backend erneut ...", "ok");
      returnToApp(500);
    } catch (error) {
      setLoginStatus("Login fehlgeschlagen: " + friendlyError(error, "Bitte Daten prüfen."), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function signUp() {
    if (busy) return;

    try {
      setBusy(true);
      var fields = validateLoginFields(true);
      safeSetAfterPath();
      localStorage.setItem(LOGIN_KEYS.lastEmail, fields.email);

      setLoginStatus("Registrierung läuft ...");
      var client = getLoginClient();
      var redirectTo = window.location.origin + "/login?return=1";
      var result = await withTimeout(client.auth.signUp({
        email: fields.email,
        password: fields.password,
        options: { emailRedirectTo: redirectTo }
      }), 15000, "Registrierung dauerte zu lange.");

      if (result.error) throw result.error;

      if (result.data && result.data.session) {
        setLoginStatus("✅ Registrierung erfolgreich. Soraya öffnet die App ...", "ok");
        returnToApp(650);
        return;
      }

      setLoginStatus("✅ Registrierung erfolgreich. Bitte E-Mail bestätigen und danach einloggen.", "ok");
    } catch (error) {
      setLoginStatus("Registrierung fehlgeschlagen: " + friendlyError(error, "Bitte Daten prüfen."), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (busy) return;

    try {
      setBusy(true);
      var fields = validateLoginFields(false);
      localStorage.setItem(LOGIN_KEYS.lastEmail, fields.email);
      setLoginStatus("Passwort-E-Mail wird gesendet ...");

      var client = getLoginClient();
      var result = await withTimeout(client.auth.resetPasswordForEmail(fields.email, {
        redirectTo: window.location.origin + "/login?return=1"
      }), 15000, "Passwort-E-Mail dauerte zu lange.");

      if (result.error) throw result.error;
      setLoginStatus("✅ E-Mail zum Zurücksetzen wurde gesendet.", "ok");
    } catch (error) {
      setLoginStatus("Passwort zurücksetzen fehlgeschlagen: " + friendlyError(error, "Bitte E-Mail prüfen."), "bad");
    } finally {
      setBusy(false);
    }
  }

  function saveConfig() {
    try {
      var config = {
        supabaseUrl: el("loginSupabaseUrl") ? el("loginSupabaseUrl").value.trim() : "",
        supabaseAnonKey: el("loginSupabaseAnonKey") ? el("loginSupabaseAnonKey").value.trim() : "",
        engineUrl: el("loginEngineUrl") ? el("loginEngineUrl").value.trim().replace(/\/$/, "") : ""
      };
      if (!hasConfig(config)) throw new Error("Bitte alle Verbindungsfelder ausfüllen.");
      if (!/^https:\/\//i.test(config.supabaseUrl) || !/^https:\/\//i.test(config.engineUrl)) throw new Error("Bitte gültige HTTPS-URLs verwenden.");
      writeStoredConfig(config);
      loginClient = null;
      initLoginClient(config);
      renderConnectionBox();
      setLoginStatus("✅ Verbindung gespeichert. Du kannst dich jetzt einloggen.", "ok");
    } catch (error) {
      setLoginStatus("Verbindung konnte nicht gespeichert werden: " + friendlyError(error, "Bitte prüfen."), "bad");
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    var mode = el("loginMode") ? el("loginMode").value : "login";
    if (mode === "register") signUp();
    else signIn();
  }

  function boot() {
    document.body.classList.add("soraya-c67-login");
    var config = getAvailableConfig();
    fillConfigForm(config);
    renderConnectionBox();

    try {
      var lastEmail = localStorage.getItem(LOGIN_KEYS.lastEmail);
      if (lastEmail && el("loginEmail") && !el("loginEmail").value) el("loginEmail").value = lastEmail;
    } catch (error) {}

    setMode((new URLSearchParams(window.location.search)).get("mode") === "register" ? "register" : "login");
    checkLoginSession();

    var form = el("loginForm");
    if (form && !form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", handleSubmit);
    }
  }

  window.sorayaLogin = {
    setMode: setMode,
    togglePassword: togglePassword,
    signIn: signIn,
    signUp: signUp,
    resetPassword: resetPassword,
    saveConfig: saveConfig,
    checkLoginSession: checkLoginSession
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
