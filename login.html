/*
  Soraya — C.5.7 Universal Login
  Ziel:
  - Login/Registrierung auf neuen Geräten über config.js
  - Handy-sicher, klare Fehlermeldungen
  - Passwort anzeigen, Passwort zurücksetzen
*/
(function () {
  "use strict";

  var LOGIN_KEYS = {
    config: "soraya_config",
    name: "soraya_person_name",
    afterPath: "soraya_after_login_path",
    afterSection: "soraya_after_login_section"
  };

  var loginClient = null;

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

  function readStoredConfig() {
    try {
      var raw = localStorage.getItem(LOGIN_KEYS.config);
      return raw ? normalizeConfig(JSON.parse(raw)) : null;
    } catch (error) {
      return null;
    }
  }

  function getPublicConfig() {
    return normalizeConfig(window.SORAYA_PUBLIC_CONFIG || {});
  }

  function getAvailableConfig() {
    var stored = readStoredConfig();
    if (hasConfig(stored)) return stored;
    var publicConfig = getPublicConfig();
    if (hasConfig(publicConfig)) return publicConfig;
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

  function friendlyError(error, fallback) {
    var msg = error && error.message ? error.message : text(error || fallback);
    if (/invalid login|invalid credentials|email not confirmed/i.test(msg)) return "E-Mail oder Passwort stimmt nicht, oder die E-Mail ist noch nicht bestätigt.";
    if (/password/i.test(msg) && /short|weak|6/i.test(msg)) return "Bitte ein Passwort mit mindestens 6 Zeichen verwenden.";
    if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(msg)) return "Verbindung nicht erreichbar. Bitte Internet prüfen und später erneut versuchen.";
    if (/rate limit|too many/i.test(msg)) return "Zu viele Versuche. Bitte kurz warten und erneut versuchen.";
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
    loginClient = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return loginClient;
  }

  function getLoginClient() {
    return loginClient || initLoginClient();
  }

  function getEmail() {
    return el("loginEmail") ? el("loginEmail").value.trim() : "";
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

  function returnToApp() {
    var target = "/";
    try {
      target = localStorage.getItem(LOGIN_KEYS.afterPath) || "/";
      if (!target || target.indexOf("/login") === 0) target = "/";
    } catch (error) {}
    window.location.href = target;
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
      var result = await client.auth.getSession();
      if (result.error) throw result.error;
      if (result.data && result.data.session && result.data.session.user) {
        var email = result.data.session.user.email || "";
        if (email && !localStorage.getItem(LOGIN_KEYS.name)) localStorage.setItem(LOGIN_KEYS.name, email.split("@")[0]);
        setLoginStatus("✅ Du bist eingeloggt.", "ok");
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
    try {
      var fields = validateLoginFields(true);
      setLoginStatus("Login läuft ...");
      var client = getLoginClient();
      var result = await client.auth.signInWithPassword({ email: fields.email, password: fields.password });
      if (result.error) throw result.error;
      var userEmail = result.data && result.data.user && result.data.user.email ? result.data.user.email : fields.email;
      if (!localStorage.getItem(LOGIN_KEYS.name)) localStorage.setItem(LOGIN_KEYS.name, userEmail.split("@")[0]);
      setLoginStatus("✅ Login erfolgreich. Soraya öffnet die App ...", "ok");
      window.setTimeout(returnToApp, 450);
    } catch (error) {
      setLoginStatus("Login fehlgeschlagen: " + friendlyError(error, "Bitte Daten prüfen."), "bad");
    }
  }

  async function signUp() {
    try {
      var fields = validateLoginFields(true);
      setLoginStatus("Registrierung läuft ...");
      var client = getLoginClient();
      var redirectTo = window.location.origin + "/login";
      var result = await client.auth.signUp({
        email: fields.email,
        password: fields.password,
        options: { emailRedirectTo: redirectTo }
      });
      if (result.error) throw result.error;
      setLoginStatus("✅ Registrierung erfolgreich. Bitte E-Mail bestätigen, falls Soraya danach fragt.", "ok");
    } catch (error) {
      setLoginStatus("Registrierung fehlgeschlagen: " + friendlyError(error, "Bitte Daten prüfen."), "bad");
    }
  }

  async function resetPassword() {
    try {
      var fields = validateLoginFields(false);
      setLoginStatus("Passwort-E-Mail wird gesendet ...");
      var client = getLoginClient();
      var result = await client.auth.resetPasswordForEmail(fields.email, {
        redirectTo: window.location.origin + "/login"
      });
      if (result.error) throw result.error;
      setLoginStatus("✅ E-Mail zum Zurücksetzen wurde gesendet.", "ok");
    } catch (error) {
      setLoginStatus("Passwort zurücksetzen fehlgeschlagen: " + friendlyError(error, "Bitte E-Mail prüfen."), "bad");
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
      localStorage.setItem(LOGIN_KEYS.config, JSON.stringify(config));
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
    document.body.classList.add("soraya-c57-login");
    fillConfigForm(getAvailableConfig());
    renderConnectionBox();
    setMode((new URLSearchParams(window.location.search)).get("mode") === "register" ? "register" : "login");
    checkLoginSession();
    var form = el("loginForm");
    if (form) form.addEventListener("submit", handleSubmit);
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
