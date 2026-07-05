/*
  Soraya — C.5.6 Mobile Login Hotfix
  Ziel:
  - Login funktioniert auch auf neuen Geräten ohne vorherige localStorage-Verbindung.
  - login.html und login.js passen wieder zusammen.
  - Registrierung, Einloggen, Passwort anzeigen und Passwort vergessen funktionieren stabiler.
  - Keine Backend-Änderung, kein Payment.
*/

(function () {
  "use strict";

  const LOGIN_KEYS = {
    config: "soraya_config",
    name: "soraya_person_name",
    afterLoginPath: "soraya_after_login_path"
  };

  let loginClient = null;

  function el(id) {
    return document.getElementById(id);
  }

  function cleanUrl(value) {
    return String(value || "").trim().replace(/\/$/, "");
  }

  function setLoginStatus(message, type = "") {
    const node = el("loginStatus");
    if (!node) return;
    node.classList.remove("ok", "bad");
    if (type) node.classList.add(type);
    node.textContent = message;
  }

  function readStoredConfig() {
    try {
      const raw = localStorage.getItem(LOGIN_KEYS.config);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function readPublicConfig() {
    const publicConfig = window.SORAYA_PUBLIC_CONFIG || null;
    if (!publicConfig) return null;

    const config = {
      supabaseUrl: cleanUrl(publicConfig.supabaseUrl),
      supabaseAnonKey: String(publicConfig.supabaseAnonKey || "").trim(),
      engineUrl: cleanUrl(publicConfig.engineUrl)
    };

    if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
    return config;
  }

  function writeConfig(config) {
    try {
      localStorage.setItem(LOGIN_KEYS.config, JSON.stringify(config));
    } catch (error) {
      // Private mode / blocked storage: login can still work during this page session.
    }
  }

  function getConfig() {
    const stored = readStoredConfig();
    const publicConfig = readPublicConfig();
    const config = stored && stored.supabaseUrl && stored.supabaseAnonKey ? stored : publicConfig;

    if (config && config.supabaseUrl && config.supabaseAnonKey) {
      writeConfig(config);
      return config;
    }

    return null;
  }

  function fillConfigForm(config) {
    const c = config || getConfig();
    if (!c) return;
    if (el("loginSupabaseUrl")) el("loginSupabaseUrl").value = c.supabaseUrl || "";
    if (el("loginSupabaseAnonKey")) el("loginSupabaseAnonKey").value = c.supabaseAnonKey || "";
    if (el("loginEngineUrl")) el("loginEngineUrl").value = c.engineUrl || "";
  }

  function initLoginClient(config) {
    const c = config || getConfig();

    if (!window.supabase) {
      throw new Error("Supabase konnte nicht geladen werden. Bitte Internetverbindung prüfen.");
    }

    if (!c || !c.supabaseUrl || !c.supabaseAnonKey) {
      throw new Error("Login-Verbindung fehlt. Bitte App-Konfiguration prüfen.");
    }

    loginClient = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage
      }
    });

    writeConfig(c);
    return loginClient;
  }

  function getLoginClient() {
    return loginClient || initLoginClient();
  }

  function getReturnPath() {
    let path = "/";
    try {
      path = localStorage.getItem(LOGIN_KEYS.afterLoginPath) || "/";
    } catch (error) {}

    if (!path || path === "/login" || path.startsWith("/login?")) return "/";
    if (!path.startsWith("/")) return "/";
    return path;
  }

  function goBackToApp() {
    const target = getReturnPath();
    try {
      localStorage.removeItem(LOGIN_KEYS.afterLoginPath);
    } catch (error) {}
    window.location.assign(target);
  }

  function getEmailPassword() {
    const email = (el("loginEmail") && el("loginEmail").value.trim().toLowerCase()) || "";
    const password = (el("loginPassword") && el("loginPassword").value) || "";

    if (!email) throw new Error("Bitte E-Mail eingeben.");
    if (!email.includes("@")) throw new Error("Bitte eine gültige E-Mail eingeben.");
    if (!password) throw new Error("Bitte Passwort eingeben.");
    if (password.length < 6) throw new Error("Das Passwort muss mindestens 6 Zeichen haben.");

    return { email, password };
  }

  function setMode(mode) {
    const isRegister = mode === "register";
    const modeInput = el("loginMode");
    const loginTab = el("loginTabButton");
    const registerTab = el("registerTabButton");
    const submit = el("loginSubmitButton");
    const password = el("loginPassword");

    if (modeInput) modeInput.value = isRegister ? "register" : "login";
    if (loginTab) loginTab.classList.toggle("active", !isRegister);
    if (registerTab) registerTab.classList.toggle("active", isRegister);
    if (submit) submit.textContent = isRegister ? "Konto erstellen" : "Einloggen";
    if (password) password.autocomplete = isRegister ? "new-password" : "current-password";

    setLoginStatus(isRegister ? "Bereit zur Registrierung." : "Bereit zum Einloggen.");
  }

  function togglePassword() {
    const password = el("loginPassword");
    if (!password) return;
    password.type = password.type === "password" ? "text" : "password";
  }

  async function checkLoginSession() {
    try {
      const config = getConfig();
      fillConfigForm(config);

      if (!config) {
        const box = el("connectionBox");
        if (box && window.location.search.includes("dev=1")) box.open = true;
        setLoginStatus("Login-Konfiguration fehlt. Bitte config.js prüfen.", "bad");
        return false;
      }

      const client = getLoginClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      if (data && data.session && data.session.user) {
        const email = data.session.user.email || "";
        if (email && !localStorage.getItem(LOGIN_KEYS.name)) {
          localStorage.setItem(LOGIN_KEYS.name, email.split("@")[0]);
        }
        setLoginStatus("✅ Du bist eingeloggt. Soraya öffnet die App ...", "ok");
        window.setTimeout(goBackToApp, 550);
        return true;
      }

      setLoginStatus("Bereit zum Einloggen.");
      return false;
    } catch (error) {
      const box = el("connectionBox");
      if (box && window.location.search.includes("dev=1")) box.open = true;
      setLoginStatus(error.message || "Login konnte nicht geprüft werden.", "bad");
      return false;
    }
  }

  async function signIn() {
    try {
      const { email, password } = getEmailPassword();
      setLoginStatus("Login läuft ...");

      const client = getLoginClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const userEmail = data && data.user && data.user.email ? data.user.email : email;
      try {
        localStorage.setItem(LOGIN_KEYS.name, localStorage.getItem(LOGIN_KEYS.name) || userEmail.split("@")[0]);
      } catch (storageError) {}

      setLoginStatus("✅ Login erfolgreich. Soraya öffnet die App ...", "ok");
      window.setTimeout(goBackToApp, 550);
    } catch (error) {
      setLoginStatus("Login fehlgeschlagen: " + friendlyError(error), "bad");
    }
  }

  async function signUp() {
    try {
      const { email, password } = getEmailPassword();
      setLoginStatus("Konto wird erstellt ...");

      const client = getLoginClient();
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + "/login"
        }
      });

      if (error) throw error;

      if (data && data.session) {
        try {
          localStorage.setItem(LOGIN_KEYS.name, email.split("@")[0]);
        } catch (storageError) {}
        setLoginStatus("✅ Registrierung erfolgreich. Soraya öffnet die App ...", "ok");
        window.setTimeout(goBackToApp, 650);
        return;
      }

      setLoginStatus("✅ Konto erstellt. Bitte bestätige deine E-Mail und logge dich danach ein.", "ok");
      setMode("login");
    } catch (error) {
      setLoginStatus("Registrierung fehlgeschlagen: " + friendlyError(error), "bad");
    }
  }

  async function resetPassword() {
    try {
      const email = (el("loginEmail") && el("loginEmail").value.trim().toLowerCase()) || "";
      if (!email || !email.includes("@")) {
        setLoginStatus("Bitte zuerst deine E-Mail eingeben.", "bad");
        return;
      }

      setLoginStatus("Passwort-Link wird gesendet ...");
      const client = getLoginClient();
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/login"
      });

      if (error) throw error;
      setLoginStatus("✅ Passwort-Link gesendet. Bitte E-Mail prüfen.", "ok");
    } catch (error) {
      setLoginStatus("Passwort-Reset fehlgeschlagen: " + friendlyError(error), "bad");
    }
  }

  function saveConfig() {
    try {
      const config = {
        supabaseUrl: cleanUrl(el("loginSupabaseUrl") && el("loginSupabaseUrl").value),
        supabaseAnonKey: String((el("loginSupabaseAnonKey") && el("loginSupabaseAnonKey").value) || "").trim(),
        engineUrl: cleanUrl(el("loginEngineUrl") && el("loginEngineUrl").value)
      };

      if (!config.supabaseUrl || !config.supabaseAnonKey) {
        setLoginStatus("Bitte Supabase URL und anon/public key ausfüllen.", "bad");
        return;
      }

      writeConfig(config);
      loginClient = null;
      initLoginClient(config);
      setLoginStatus("✅ Verbindung gespeichert. Du kannst dich jetzt einloggen.", "ok");
    } catch (error) {
      setLoginStatus("Verbindung konnte nicht gespeichert werden: " + friendlyError(error), "bad");
    }
  }

  function friendlyError(error) {
    const message = (error && error.message ? error.message : String(error || "")).trim();
    const lower = message.toLowerCase();

    if (lower.includes("invalid login credentials")) return "E-Mail oder Passwort ist falsch.";
    if (lower.includes("email not confirmed")) return "Bitte bestätige zuerst deine E-Mail.";
    if (lower.includes("user already registered") || lower.includes("already registered")) return "Diese E-Mail ist bereits registriert. Bitte einloggen.";
    if (lower.includes("failed to fetch") || lower.includes("network")) return "Netzwerkfehler. Bitte Internet prüfen und erneut versuchen.";
    if (lower.includes("supabase") && lower.includes("geladen")) return "Supabase konnte nicht geladen werden. Bitte Seite neu laden.";

    return message || "Unbekannter Fehler.";
  }

  function bindForm() {
    const form = el("loginForm");
    if (!form) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const mode = (el("loginMode") && el("loginMode").value) || "login";
      if (mode === "register") signUp();
      else signIn();
    });
  }

  function init() {
    const config = getConfig();
    fillConfigForm(config);
    bindForm();

    const connectionBox = el("connectionBox");
    if (connectionBox) {
      connectionBox.classList.toggle("developer-only", !window.location.search.includes("dev=1"));
      if (!config && window.location.search.includes("dev=1")) connectionBox.open = true;
    }

    checkLoginSession();
  }

  window.sorayaLogin = {
    setMode,
    togglePassword,
    signIn,
    signUp,
    resetPassword,
    saveConfig,
    checkLoginSession
  };

  document.addEventListener("DOMContentLoaded", init);
})();
