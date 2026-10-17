# Soraya – Projektüberblick für Claude

Dieses Dokument fasst das ganze Soraya-Projekt zusammen, damit ein neuer Chat ohne Erklärungen
weiterarbeiten kann. Es gilt für alle fünf Repos (siehe unten). Stand: Oktober 2026.

## Wer und wie

- Inhaber: **Attila** (GitHub `Attila0604`). Schreibt **Deutsch** (oft schnell getippt, Tippfehler normal),
  ist kein Entwickler. Antworten bitte **auf Deutsch, einfach, ohne Fachjargon**, kurz und mit klaren
  Schritten. Er schickt oft **Screenshots** (Handy/PC) – darauf konkret eingehen.
- Er möchte, dass Dinge **umgesetzt und live gestellt** werden (PR → Merge → Deploy prüfen), nicht nur
  vorgeschlagen. Bei echten Entscheidungen (Geld, Konten, Löschen, Veröffentlichen) vorher fragen.
- Sprachen der App und Inhalte: **DE, EN, HU, IT** (Ungarisch ist ihm wichtig: muttersprachlich, keine
  deutschen Reste).

## Feste Regeln

- **Nie** Passwörter, Signing-Key-Passwörter oder API-Keys im Chat erfragen oder ausgeben. Geheimnisse
  trägt Attila selbst in Railway/Vercel ein.
- Das **Demo-Konto** `kovacs.attilazsolt@gmx.at` nicht verändern.
- Keine Modellnamen in Commits/PRs. Keine Umgehung von gesperrten Netzwerk-Hosts.
- **Meta/Facebook:** Attilas Facebook-Profil hat seit 19.01.2021 eine dauerhafte **Werbe-Einschränkung**
  (keine Werbekonten, keine Business-Assets verwalten; Portfolio „Affliate with Attila“ ebenfalls gesperrt,
  Portfolio „Attila Zsolt Kovacs“ ist sauber). **Niemals** raten, neue Profile/Werbekonten anzulegen
  (Umgehung → Totalsperre). Bezahlte Werbung → **Google Ads (App-Kampagne)**. Organisches Posten über
  die API sollte gehen (noch nicht getestet).

## Produkte, Repos, Hosting

| Teil | Repo | Hosting / URL |
|---|---|---|
| Web-App (PWA, auch als Android-App) | `Attila0604/soraya-web` | Vercel · https://app.sorayaluxuryastroguide.com |
| Landingpage | `Attila0604/soraya-landing` | Vercel · https://www.sorayaluxuryastroguide.com |
| Backend „astro-engine“ (FastAPI) | `Attila0604/astro-engine` | Railway · https://astro-engine-production-7b18.up.railway.app |
| Marketing-Agent „Soraya-Agent“ (FastAPI + Dashboard „Content Studio“) | `Attila0604/Soraya-Agent` | Railway · https://soraya-agent-production.up.railway.app (HTTP-Basic-Login) |
| Datenbank/Auth | Supabase Projekt `qpvniafpajeafcwsrtds` | – |

- Android: Play-Store-App `com.sorayaluxuryastroguide.app.twa` (TWA, gebaut mit **PWABuilder**; für ein
  neues App-Icon muss ein neues AAB mit dem **alten** Signing-Key und höherem Versionscode gebaut werden).
- Deploy: Merge auf `main` → Vercel/Railway deployen automatisch. Status prüfen mit
  `gh api repos/Attila0604/<repo>/commits/main/status`. Reihenfolge bei Abhängigkeiten: erst Engine, dann Web.
- Arbeitsweise bisher: Feature-Branch → PR (über GitHub-MCP) → Squash-Merge mit vollem `expectedHeadSha`
  → Deploy-Status prüfen → kurze Erklärung auf Deutsch.

## Web-App (`soraya-web`)

- Statisches Vanilla-JS: `index.html`, `app.js` (Hauptlogik), `soraya.css`, Module `c58…c74-*.js`,
  `sw.js` (Service Worker, network-first; **bei jeder Änderung `CACHE_VERSION` erhöhen**, aktuell
  `soraya-v32`, `APP_VERSION` in `app.js` = `web-v32`).
- i18n: deutsche Quelltexte sind die Schlüssel; Übersetzungen in `i18n/en.js`, `i18n/hu.js`, `i18n/it.js`
  (je ~644 Einträge), `t()` in `app.js`, `i18n.js` blendet die Seite bis zur Übersetzung aus (kein Flackern).
- Funktionen: Schnellstart ohne Konto (Sonne/Mond), Profil, Geburtshoroskop/Radix, Tageshoroskop,
  Tiefen-Analyse (Hintergrund-Auftrag mit Fortschritt), Partner-Vergleich in % (Hintergrund-Auftrag),
  Chat, Einladungslinks, Teilen-Bilder (Trio + Partner, Story 1080×1920, `?q=teilen-trio|teilen-partner`),
  Link-Kennung `?q=` (Quelle wird gemerkt und gezählt).
- Sternzeichen-Symbole kommen aus `fonts/soraya-zeichen.woff2` (Font `SorayaZeichen`, unicode-range),
  damit Android keine lila Emojis zeigt.
- Logo „Portal“ (Art-déco-Bogen mit Mond und Stern) in `brand/`, Favicons/Icons im Root.

## Landingpage (`soraya-landing`)

- Eine `index.html` (4 Sprachen über `data-t`-Schlüssel + `L`-Objekt im Script).
- Bereiche: Hero mit Store-Knöpfen (Android → Play, iPhone → Web-App), „Probier es jetzt gleich“
  (Sonne/Mond über `/public/preview`, Tageshoroskop über `/public/sign-horoscope`), Funktionen,
  Video, „So einfach geht's“, FAQ, Schluss-Aufruf, feste „Kostenlos starten“-Leiste am Handy.
- `?q=` wird gezählt (`/public/event`) und an die App-Links weitergereicht.

## astro-engine (Backend)

- FastAPI auf Railway, Version ~2.18. Wichtig: `main.py`, `chart_engine.py`, `agents.py`, `analysis.py`,
  `analysis_jobs.py`, `synastry_reading.py`, `synastrie_jobs.py`, `horoscope.py`, `public_content.py`,
  `namen.py` (Namen in 4 Sprachen + Prüfung auf deutsche Reste), `limits.py` (Kostenbremse).
- Öffentliche Endpunkte: `/public/preview`, `/public/sign-horoscope`, `/public/invite/...`, `/public/event`.
  App-Endpunkte unter `/mobile/...`. Statistik für den Agenten: `/internal/statistik`
  (Header `X-Agent-Token` = `AGENT_STATS_TOKEN`, in beiden Diensten gleich).
- Claude-Modelle per Railway-Variablen (`ANALYSIS_MODEL`, `SYNASTRY_MODEL`, `LEKTORAT_MODEL` …).

## Soraya-Agent (Marketing-Automatik)

Dashboard „Content Studio“ (`dashboard.html`) mit Reitern **Heute, Plan, Studio, Zielgruppen, Posten, Wirkung**.

- **Tagesplan** (`tagesplan.py`, `redaktion.py`): aus echten Himmelsdaten pro Sprache täglich Feed-Post,
  Reel (Text-Video) und Story. Jeder Wochentag eigenes Format (Deine Woche, Sternzeichen im Fokus,
  Liebe & Beziehung, Astro-Wissen, Ritual, Mitmachen, Rückblick); Neu-/Vollmond hat Vorrang.
  Handlungsaufforderung wechselt zwischen App-Funktionen. Qualitätsprüfung ohne KI-Kosten (Längen,
  Hashtags, heikle Versprechen, Links, deutsche Reste) – schwere Befunde → ein Korrekturdurchgang;
  Posts mit Befund gehen erst nach Freigabe raus. Lernt aus der Wirkung (Posts mit vielen Besuchern als
  Vorbild). Automatik schreibt **heute und morgen**. Sprachen im Dashboard wählbar.
- **Zielgruppen** (`research_agent.py`): Recherche-Profile; markierte Profile fließen in den Tagesplan.
- **Bilder & Reels vom Server** (`medien.py`, `reel.py`, `paket.py`): Pillow + ffmpeg (imageio-ffmpeg),
  Schriften in `fonts/` (OFL). Layout/Farbwelt je Format, Sternzeichen-Karten mit Symbolen, Reels mit
  Wort-für-Wort-Texten. Zwischenspeicher in Tabelle `soraya_medien` (21 Tage). Wochenpaket als ZIP.
- **Automatisch posten** (`posten.py`, `meta.py`): Facebook-Seite (Facebook-Login → Seiten-Token) und
  Instagram (Instagram-Business-Login, ohne Verknüpfung mit der Seite). Standard: Englisch,
  Story 09:00 / Feed 12:30 / Reel 19:00 (Wien), „automatisch außer gestoppt“, 3 Versuche, >12 h = verpasst.
  Instagram holt Medien über signierte öffentliche URLs `/oeffentlich/medien/...`.
- **Wirkung** (`wirkung.py`): Statistik aus der Engine, Links pro Post `?q=p<id>`, Bio-Links `bio-ig` usw.

### Aktueller Stand / offen (Oktober 2026)

- **Beide Hauptschalter sind AUS** (Tagesplan-Automatik unter „Heute“, „Automatisch posten“ unter
  „Posten“). Attila will erst alles einrichten und dann selbst einschalten – **nicht eigenmächtig einschalten**.
- **Meta-App „Soraya Agent“ ist angelegt (16.10.2026)**, ohne Business-Portfolio, Modus „Entwicklung“
  (reicht fürs Posten auf eigene Konten; App-Review/„Tech-Anbieter“ NICHT nötig und NICHT machen –
  verlangt Unternehmensverifizierung, unumkehrbar). Rechte „Bereit zum Testen“: `pages_show_list`,
  `pages_read_engagement`, `pages_manage_posts` (+ automatisch `business_management`, `public_profile`),
  `instagram_business_basic`, `instagram_business_content_publish`. Redirect-URIs für Facebook und Instagram
  eingetragen. In Railway gesetzt: `META_APP_ID`, `META_APP_SECRET`.
- **Facebook-Seite „Soraya Luxury Astrology“ ist verbunden**, erster Testpost (Feed-Post EN) am 16.10. erfolgreich
  (Text, Bild, Link `?q=p<id>`; auf Facebook wird „Link in bio“ automatisch zu „Link below“).
- **Instagram noch offen:** `INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET` (Meta → Anwendungsfälle → Instagram →
  API-Einrichtung mit Instagram-Login) noch nicht in Railway. Soraya hat **kein eigenes Instagram-Konto**;
  vorhanden ist nur `attilazsolt.kovacs` (Business). Empfehlung: dieses umbenennen statt neues Konto anlegen
  (Sperr-Risiko). Danach in Meta unter App-Rollen → Instagram-Tester eintragen und im Dashboard verbinden.
- **Lernen aus der Wirkung (17.10.):** Punkte je Post (neues Konto 15, geteilt 4, Kommentar 3, Link-Besuch 2,
  Gefällt mir 1); Facebook-Reaktionen werden alle 6 h gemerkt. Tagesplan bekommt die 3 besten Posts (auch aus
  anderen Sprachen) und welche Formate am besten/schwächsten ankommen. Sichtbar unter Wirkung → „Was Soraya daraus lernt“.
- **Alle 4 Sprachen:** Posten → Sprache „Alle 4 Sprachen im Wechsel“ (Story/Feed/Reel täglich in 3 verschiedenen
  Sprachen, rotiert). Dafür müssen im Tagesplan alle 4 Sprachen angehakt sein (kostet 4 Claude-Aufrufe/Tag statt 1).
  Post-Links tragen `&lang=`, Landingpage und App öffnen in der Sprache des Posts.
- **Mails über Resend (vorbereitet, noch nicht eingerichtet):** App speichert `lang` im Konto; Vorlagen +
  Schritt-für-Schritt in `mail-vorlagen/` (ANLEITUNG.md). Attila legt Resend-Konto + Domain an, trägt SMTP in
  Supabase ein. Danach Branch `datenschutz-resend` (Datenschutz 4 Sprachen) mergen.
- Nutzerzahlen (15.10.2026): 6 Konten insgesamt (inkl. Demo), letzte Registrierung 03.10. – es fehlt
  Reichweite. Supabase-Abfragen gehen über den Supabase-MCP (Tabellen u. a. `people`, `analyses`,
  `synastries`, `public_usage(day, kind, n)`, `app_events`).
- Ideen für später: Google-Ads-App-Kampagne (Texte/Bilder liefert der Agent), TikTok-Anbindung,
  Instagram-Insights in die Lernschleife, neues App-Icon im Play Store (neues AAB über PWABuilder).

## Tests (bisher lokal im Scratchpad, nicht im Repo)

- Agent: pytest gegen eine lokale Postgres (Claude/Meta/Engine als Attrappen) + Playwright-UI-Test
  gegen einen lokalen Dev-Server mit Attrappen. Siehe `tests/` im Repo `Soraya-Agent`.
- Web/Landing: Playwright-Tests mit abgefangenen Supabase-/Engine-Aufrufen; Chromium liegt unter
  `/opt/pw-browsers/chromium` (kann kein H.264 abspielen → Videos über die Datei prüfen).
