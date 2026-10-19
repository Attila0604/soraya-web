/*
  Soraya — Mehrsprachigkeit (de, en, hu, it)
  Datei: i18n.js  (vor app.js laden, nach i18n/en.js, i18n/hu.js, i18n/it.js)

  Prinzip:
  - Deutsch ist der Ausgangstext. Die Uebersetzungsdateien (window.SORAYA_STRINGS.en
    usw.) bilden den deutschen Text auf die Uebersetzung ab.
  - t("Text {name}", { name }) uebersetzt dynamische Texte in JavaScript.
  - apply() uebersetzt beim Start alle statischen Texte im HTML (Textknoten,
    placeholder, aria-label, title). Elemente mit gemischtem Inhalt (z. B. <b>
    im Satz) tragen data-i18n-html und werden als Ganzes uebersetzt.
  - Elemente mit data-i18n-skip (z. B. Claude-Texte) werden nie angefasst.
  - Sprache: gespeichert > Handy-Sprache > Englisch.
*/
(function () {
  "use strict";

  var LANGS = ["de", "en", "hu", "it"];
  var LOCALES = { de: "de-AT", en: "en-GB", hu: "hu-HU", it: "it-IT" };
  var NAMES = { de: "Deutsch", en: "English", hu: "Magyar", it: "Italiano" };
  var KEY = "soraya_lang";
  var STRINGS = window.SORAYA_STRINGS || {};

  function detect() {
    // ?lang= aus einem Link (Landingpage, Post) gilt und wird gemerkt
    try {
      var q = new URLSearchParams(location.search).get("lang");
      if (q && LANGS.indexOf(q) >= 0) { localStorage.setItem(KEY, q); return q; }
    } catch (error) {}
    try {
      var stored = localStorage.getItem(KEY);
      if (stored && LANGS.indexOf(stored) >= 0) return stored;
    } catch (error) {}
    var list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""]);
    for (var i = 0; i < list.length; i += 1) {
      var code = String(list[i] || "").toLowerCase().slice(0, 2);
      if (LANGS.indexOf(code) >= 0) return code;
    }
    return "en";
  }

  var lang = detect();
  document.documentElement.lang = lang;

  // Kein deutsches Aufblitzen: Die Seiten sind auf Deutsch geschrieben und werden
  // beim Laden uebersetzt. Bis dahin (Bruchteil einer Sekunde) bleibt der Inhalt
  // unsichtbar; Sicherung nach 2,5 s, falls etwas schiefgeht.
  if (lang !== "de") {
    try {
      var wait = document.createElement("style");
      wait.id = "i18n-wait";
      wait.textContent = "html.i18n-wait body{opacity:0!important}";
      (document.head || document.documentElement).appendChild(wait);
      document.documentElement.classList.add("i18n-wait");
      window.setTimeout(function () { document.documentElement.classList.remove("i18n-wait"); }, 2500);
    } catch (error) {}
  }

  function norm(text) {
    return String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  }

  function lookup(key) {
    if (lang === "de") return key;
    var table = STRINGS[lang] || {};
    var hit = table[key];
    return hit === undefined || hit === null || hit === "" ? key : hit;
  }

  function t(key, vars) {
    var text = lookup(key);
    if (vars) {
      text = text.replace(/\{(\w+)\}/g, function (match, name) {
        return vars[name] === undefined || vars[name] === null ? match : String(vars[name]);
      });
    }
    return text;
  }

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1 };
  var ATTRS = ["placeholder", "aria-label", "title", "alt"];

  // data-i18n-html="Schluessel": der Wert in der Uebersetzungsdatei ist HTML.
  function translateElementHtml(el) {
    var key = el.getAttribute("data-i18n-html");
    if (!key) return;
    var translated = lookup(key);
    if (translated !== key) el.innerHTML = translated;
  }

  function apply(root) {
    if (lang === "de") return;
    root = root || document.body;
    if (!root) return;
    if (root.nodeType === 1 && root.hasAttribute("data-i18n-html")) {
      translateElementHtml(root);
      return;
    }

    // Rechtstexte: Links auf die Fassung in der App-Sprache (/datenschutz-en usw.)
    var legal = root.querySelectorAll ? root.querySelectorAll('a[href="/datenschutz"],a[href="/impressum"],a[href="/nutzungsbedingungen"],a[href="/konto-loeschen"]') : [];
    Array.prototype.forEach.call(legal, function (a) { a.setAttribute("href", a.getAttribute("href") + "-" + lang); });

    var htmlEls = root.querySelectorAll ? root.querySelectorAll("[data-i18n-html]") : [];
    Array.prototype.forEach.call(htmlEls, translateElementHtml);

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS[parent.tagName]) return NodeFilter.FILTER_REJECT;
        if (parent.closest("[data-i18n-skip],[data-i18n-html]")) return NodeFilter.FILTER_REJECT;
        return norm(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var raw = node.nodeValue;
      var key = norm(raw);
      var translated = lookup(key);
      if (translated === key) return;
      var lead = raw.match(/^\s*/)[0];
      var trail = raw.match(/\s*$/)[0];
      node.nodeValue = lead + translated + trail;
    });

    var attrEls = root.querySelectorAll ? root.querySelectorAll("[placeholder],[aria-label],[title],[alt]") : [];
    Array.prototype.forEach.call(attrEls, function (el) {
      if (el.closest("[data-i18n-skip]")) return;
      ATTRS.forEach(function (attr) {
        if (!el.hasAttribute(attr)) return;
        var key = norm(el.getAttribute(attr));
        var translated = lookup(key);
        if (translated !== key) el.setAttribute(attr, translated);
      });
    });
    if (root === document.body) document.title = t(norm(document.title));
  }

  function setLang(next) {
    if (LANGS.indexOf(next) < 0) return;
    try { localStorage.setItem(KEY, next); } catch (error) {}
    lang = next;
  }

  // ---------------------------------------------------------------------------
  // Astrologische Begriffe je Sprache (Schluessel wie im Backend)
  // ---------------------------------------------------------------------------
  var SIGN_KEYS = ["Ari", "Tau", "Gem", "Can", "Leo", "Vir", "Lib", "Sco", "Sag", "Cap", "Aqu", "Pis"];
  var SIGNS = {
    de: ["Widder", "Stier", "Zwillinge", "Krebs", "Löwe", "Jungfrau", "Waage", "Skorpion", "Schütze", "Steinbock", "Wassermann", "Fische"],
    en: ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"],
    hu: ["Kos", "Bika", "Ikrek", "Rák", "Oroszlán", "Szűz", "Mérleg", "Skorpió", "Nyilas", "Bak", "Vízöntő", "Halak"],
    it: ["Ariete", "Toro", "Gemelli", "Cancro", "Leone", "Vergine", "Bilancia", "Scorpione", "Sagittario", "Capricorno", "Acquario", "Pesci"]
  };
  var OLD_DE = { Loewe: "Löwe", Schuetze: "Schütze" };

  // Planeten/Punkte: Schluessel = Name im Backend (englisch), dazu deutsche Namen
  var PLANETS = {
    Sun: ["Sonne", "Sun", "Nap", "Sole"],
    Moon: ["Mond", "Moon", "Hold", "Luna"],
    Mercury: ["Merkur", "Mercury", "Merkúr", "Mercurio"],
    Venus: ["Venus", "Venus", "Vénusz", "Venere"],
    Mars: ["Mars", "Mars", "Mars", "Marte"],
    Jupiter: ["Jupiter", "Jupiter", "Jupiter", "Giove"],
    Saturn: ["Saturn", "Saturn", "Szaturnusz", "Saturno"],
    Uranus: ["Uranus", "Uranus", "Uránusz", "Urano"],
    Neptune: ["Neptun", "Neptune", "Neptunusz", "Nettuno"],
    Pluto: ["Pluto", "Pluto", "Plútó", "Plutone"],
    Chiron: ["Chiron", "Chiron", "Kheirón", "Chirone"],
    True_North_Lunar_Node: ["Mondknoten (Nord)", "North Node", "Északi holdcsomó", "Nodo Nord"],
    True_South_Lunar_Node: ["Mondknoten (Süd)", "South Node", "Déli holdcsomó", "Nodo Sud"],
    Mean_Lilith: ["Lilith", "Lilith", "Lilith", "Lilith"],
    Ascendant: ["Aszendent", "Ascendant", "Aszcendens", "Ascendente"],
    Medium_Coeli: ["MC (Himmelsmitte)", "Midheaven (MC)", "MC (Égközép)", "Medio Cielo (MC)"],
    Descendant: ["Deszendent", "Descendant", "Deszcendens", "Discendente"],
    Imum_Coeli: ["IC", "IC", "IC", "Fondo Cielo (IC)"]
  };
  var ASPECTS = {
    conjunction: ["Konjunktion", "Conjunction", "Együttállás", "Congiunzione"],
    opposition: ["Opposition", "Opposition", "Szembenállás", "Opposizione"],
    trine: ["Trigon", "Trine", "Trigon", "Trigono"],
    square: ["Quadrat", "Square", "Kvadrát", "Quadratura"],
    sextile: ["Sextil", "Sextile", "Szextil", "Sestile"],
    quincunx: ["Quincunx", "Quincunx", "Kvinkunx", "Quinconce"],
    semisextile: ["Halbsextil", "Semi-sextile", "Félszextil", "Semisestile"],
    semisquare: ["Halbquadrat", "Semi-square", "Félkvadrát", "Semiquadrato"],
    sesquiquadrate: ["Anderthalbquadrat", "Sesquiquadrate", "Másfélkvadrát", "Sesquiquadrato"],
    quintile: ["Quintil", "Quintile", "Kvintil", "Quintile"],
    biquintile: ["Biquintil", "Biquintile", "Bikvintil", "Biquintile"]
  };
  var MOON_PHASES = [
    ["Neumond", "New Moon", "Újhold", "Luna nuova"],
    ["Zunehmende Sichel", "Waxing Crescent", "Növő holdsarló", "Luna crescente"],
    ["Erstes Viertel", "First Quarter", "Első negyed", "Primo quarto"],
    ["Zunehmender Mond", "Waxing Gibbous", "Növő Hold", "Gibbosa crescente"],
    ["Vollmond", "Full Moon", "Telihold", "Luna piena"],
    ["Abnehmender Mond", "Waning Gibbous", "Fogyó Hold", "Gibbosa calante"],
    ["Letztes Viertel", "Last Quarter", "Utolsó negyed", "Ultimo quarto"],
    ["Abnehmende Sichel", "Waning Crescent", "Fogyó holdsarló", "Luna calante"]
  ];

  function idx() { return LANGS.indexOf(lang); }

  function findRow(table, value) {
    var keys = Object.keys(table);
    for (var i = 0; i < keys.length; i += 1) {
      if (keys[i] === value || table[keys[i]].indexOf(value) >= 0) return table[keys[i]];
    }
    return null;
  }

  var astro = {
    signKeys: SIGN_KEYS,
    // Schluessel ("Gem") oder deutscher Name ("Zwillinge"/"Loewe") -> aktuelle Sprache
    sign: function (keyOrName) {
      if (!keyOrName) return "";
      var name = OLD_DE[keyOrName] || keyOrName;
      var i = SIGN_KEYS.indexOf(name);
      if (i < 0) i = SIGNS.de.indexOf(name);
      if (i < 0) {
        Object.keys(SIGNS).forEach(function (l) { if (i < 0) i = SIGNS[l].indexOf(name); });
      }
      return i < 0 ? name : SIGNS[lang][i];
    },
    signKey: function (keyOrName) {
      var name = OLD_DE[keyOrName] || keyOrName;
      if (SIGN_KEYS.indexOf(name) >= 0) return name;
      var i = SIGNS.de.indexOf(name);
      return i < 0 ? null : SIGN_KEYS[i];
    },
    planet: function (keyOrName) {
      var row = findRow(PLANETS, keyOrName);
      return row ? row[idx()] : (keyOrName || "");
    },
    aspect: function (keyOrName) {
      var row = findRow(ASPECTS, String(keyOrName || "").toLowerCase()) || findRow(ASPECTS, keyOrName);
      return row ? row[idx()] : (keyOrName || "");
    },
    moonPhase: function (index) {
      var row = MOON_PHASES[index];
      return row ? row[idx()] : "";
    },
    moonPhaseIndexOf: function (name) {
      for (var i = 0; i < MOON_PHASES.length; i += 1) if (MOON_PHASES[i].indexOf(name) >= 0) return i;
      return -1;
    }
  };

  function formatDate(value, options) {
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    try { return new Intl.DateTimeFormat(LOCALES[lang], options).format(d); } catch (error) { return d.toDateString(); }
  }

  // ---------------------------------------------------------------------------
  // Sprachauswahl: <div data-lang-picker></div> wird mit 4 Knoepfen gefuellt.
  // Nach der Wahl speichert die App die Sprache (window.sorayaOnLangChange)
  // und laedt neu, damit alle Texte in der neuen Sprache erscheinen.
  // ---------------------------------------------------------------------------
  var FLAGS = { de: "🇩🇪", en: "🇬🇧", hu: "🇭🇺", it: "🇮🇹" };

  function mountPickers(root) {
    var boxes = (root || document).querySelectorAll("[data-lang-picker]");
    Array.prototype.forEach.call(boxes, function (box) {
      if (box.dataset.mounted === "1") return;
      box.dataset.mounted = "1";
      box.setAttribute("role", "group");
      box.setAttribute("data-i18n-skip", "");
      LANGS.forEach(function (code) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "lang-option" + (code === lang ? " active" : "");
        button.setAttribute("lang", code);
        button.setAttribute("aria-pressed", code === lang ? "true" : "false");
        button.innerHTML = '<span aria-hidden="true">' + FLAGS[code] + "</span> " + NAMES[code];
        button.addEventListener("click", function () { choose(code); });
        box.appendChild(button);
      });
    });
  }

  function choose(code) {
    if (code === lang) return;
    setLang(code);
    var done = function () { window.location.reload(); };
    var hook = window.sorayaOnLangChange;
    if (typeof hook !== "function") return done();
    var timer = window.setTimeout(done, 2500);
    Promise.resolve()
      .then(function () { return hook(code); })
      .catch(function () {})
      .then(function () { window.clearTimeout(timer); done(); });
  }

  window.SorayaI18n = {
    get lang() { return lang; },
    langs: LANGS,
    names: NAMES,
    locale: function () { return LOCALES[lang]; },
    t: t,
    apply: apply,
    setLang: setLang,
    mountPickers: mountPickers,
    astro: astro,
    formatDate: formatDate
  };
  window.sorayaT = t;

  function start() {
    try {
      apply(document.body);
      mountPickers(document);
    } finally {
      document.documentElement.classList.remove("i18n-wait");
    }
  }

  // Vor den defer-Skripten (app.js, login.js) uebersetzen: "interactive" kommt
  // vor deren Ausfuehrung, DOMContentLoaded erst danach. Sonst wuerde apply()
  // Texte ueberschreiben, die die App schon gesetzt hat.
  var started = false;
  function startOnce() {
    if (started || document.readyState === "loading") return;
    started = true;
    start();
  }
  if (document.readyState === "loading") {
    document.addEventListener("readystatechange", startOnce);
    document.addEventListener("DOMContentLoaded", startOnce, { once: true });
  } else {
    startOnce();
  }
})();
