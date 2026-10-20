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
  `soraya-v43`, `APP_VERSION` in `app.js` = `web-v43`).
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

- `index.html` (4 Sprachen über `data-t`-Schlüssel + `L`-Objekt im Script). **SEO (20.10.):** `node tools/seiten.mjs`
  erzeugt daraus `en.html`/`hu.html`/`it.html` (URLs `/en`, `/hu`, `/it`, feste Sprache), 48 Sternzeichen-Seiten aus
  `inhalte/zeichen/<lang>/*.json` (`/sternzeichen/<slug>`, `/en/zodiac/…`, `/hu/csillagjegyek/…`, `/it/segni-zodiacali/…`),
  4 Übersichten und `sitemap.xml`. **Nach jeder Änderung an `index.html` oder den Inhalten das Skript laufen lassen und
  die erzeugten Dateien mit committen.** `cleanUrls` in `vercel.json`. Besuche der Zeichen-Seiten zählen als `q=seo-<slug>`.
- Bereiche: Hero mit Store-Knöpfen (Android → Play, iPhone → Web-App), „Probier es jetzt gleich“
  (Sonne/Mond über `/public/preview`, Tageshoroskop über `/public/sign-horoscope`), Funktionen,
  Video, „So einfach geht's“, FAQ, Schluss-Aufruf, feste „Kostenlos starten“-Leiste am Handy.
- `?q=` wird gezählt (`/public/event`) und an die App-Links weitergereicht.

## astro-engine (Backend)

- FastAPI auf Railway, Version ~2.19. Wichtig: `main.py`, `chart_engine.py`, `agents.py`, `analysis.py`,
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

- **„Automatisch posten“ hat Attila am 18.10. selbst EINGESCHALTET** (EN, Facebook; Story 06:00, Feed 12:30, Reel 09:00).
  Die **Tagesplan-Automatik** (Reiter „Heute“) war da noch AUS – ohne sie entstehen keine neuen Posts.
  Schalter nur Attila überlassen – **nicht eigenmächtig ein- oder ausschalten**.
- **Schnellstart-Zählung (18.10.):** Gäste wurden beim Berechnen nicht gezählt (nur `app_events` mit Login). Jetzt
  anonymes Ereignis `quickstart_done`; Engine ergänzt `schnellstart_berechnet` und `gratis_tests` (App + Landingpage).
- **Meta-App „Soraya Agent“ ist angelegt (16.10.2026)**, ohne Business-Portfolio, Modus „Entwicklung“
  (reicht fürs Posten auf eigene Konten; App-Review/„Tech-Anbieter“ NICHT nötig und NICHT machen –
  verlangt Unternehmensverifizierung, unumkehrbar). Rechte „Bereit zum Testen“: `pages_show_list`,
  `pages_read_engagement`, `pages_manage_posts` (+ automatisch `business_management`, `public_profile`),
  `instagram_business_basic`, `instagram_business_content_publish`. Redirect-URIs für Facebook und Instagram
  eingetragen. In Railway gesetzt: `META_APP_ID`, `META_APP_SECRET`.
- **Facebook-Seite „Soraya Luxury Astrology“ ist verbunden**, erster Testpost (Feed-Post EN) am 16.10. erfolgreich
  (Text, Bild, Link `?q=p<id>`; auf Facebook wird „Link in bio“ automatisch zu „Link below“).
- **Instagram ist verbunden (19.10.):** früheres Konto `attilazsolt.kovacs` umbenannt in **`soraya.astroguide`**
  (Name „Soraya – Luxury Astro Guide“, Logo, Bio EN, Bio-Link `?q=bio-ig`). `INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET`
  in Railway, Instagram-Tester angenommen, im Dashboard verbunden (Zugang 60 Tage, verlängert sich selbst).
  Ob Instagram beim automatischen Posten mitläuft, entscheidet Attila selbst (Posten → Plattformen).
- **Lernen aus der Wirkung (17.10.):** Punkte je Post (neues Konto 15, geteilt 4, Kommentar 3, Link-Besuch 2,
  Gefällt mir 1); Facebook-Reaktionen werden alle 6 h gemerkt. Tagesplan bekommt die 3 besten Posts (auch aus
  anderen Sprachen) und welche Formate am besten/schwächsten ankommen. Sichtbar unter Wirkung → „Was Soraya daraus lernt“.
- **Selbst-Tests (18.10.):** Jeder Tagesplan wählt einen Hook-Stil (Frage, Mutige Aussage, Neugier-Lücke, Alltags-Szene,
  Sternzeichen direkt, Zahl & Liste) und eine Handlungsaufforderung (`redaktion.selbsttest`, in `meta.hook_stil` /
  `meta.aufforderung`). Nach je 3 gemessenen Posts meist die beste Variante, 20 % Neugier; Aufforderung zählt nach
  Besuchen/Konten. Facebook-Reichweite (Recht `read_insights`, noch nicht in der Meta-App) gibt je 100 erreicht 1 Punkt.
- **Bilder/Reels (18.10.):** Mond mit Oberfläche und Erdschein, Sternennebel, Goldrahmen (`bild-3`); Farb-Emojis auf
  Bildern (`fonts/NotoColorEmoji-Soraya.ttf`, Auszug, OFL); Reels mit wandernden Sternen und Sternschnuppen (`reel-5`).
- **Posts professioneller (18.10.):** Feed-Posts als **Karussell** (Titelbild + 3 Folien + Schlussfolie; Facebook
  Mehrbild-Beitrag, Instagram CAROUSEL), **Serien-Nummer** im Etikett („Folge 12“, `meta.folge`), Hook allein in der
  ersten Zeile + Absätze, **besondere Tage** (`anlaesse.py`: Saisonbeginn, Vollmond-Namen, Feiertage), Uhrzeit-Tipps
  unter Posten. Reels mit eigener Klangfläche (`reel-6`). Freigabe nur bei ernsten Befunden (`redaktion.schwer`),
  Facebook max. 3 Hashtags. Die Tagesplan-Automatik ist seit 18.10. ebenfalls von Attila EINGESCHALTET.
- **TikTok (19.10.):** `tiktok.py` im Agent, nur Reels, eigener Schalter (Standard aus), Modus Entwurf (Posteingang der
  TikTok-App) oder Direkt (öffentlich erst nach TikTok-Audit). Railway: `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`,
  Rückruf `/tiktok/rueckruf`. Nutzungsbedingungen-Seiten `nutzungsbedingungen(-en|-hu|-it).html` in soraya-web (für TikTok).
- **Runde 5 (19.10.):** Post-Bilder mit eigenem Aufbau je Format (`bild-4`: Mondphasen-Woche, Umfrage A/B/C bei
  „Mitmachen“, Zitat beim Rückblick, großes Sternzeichen zum Saisonbeginn). Content Studio „Heute“: Zeitleiste
  „Heute geht raus“ + Kasten „Post braucht dich“ (Dashboard rechnet die Sprach-Rotation wie `posten.sprache_fuer()` nach –
  bei Änderungen beide anpassen). App v40: Tagesenergie ein fester Wert pro Tag, Karte „Dein Tag“ oben.
- **Alle 4 Sprachen:** Posten → Sprache „Alle 4 Sprachen im Wechsel“ (Story/Feed/Reel täglich in 3 verschiedenen
  Sprachen, rotiert). Dafür müssen im Tagesplan alle 4 Sprachen angehakt sein (kostet 4 Claude-Aufrufe/Tag statt 1).
  Post-Links tragen `&lang=`, Landingpage und App öffnen in der Sprache des Posts.
- **Mails über Resend sind live (17.10.):** Domain in Resend verifiziert (Region eu-west-1, DNS automatisch über
  Vercel: `send`, `rsend`, `resend._domainkey`). Supabase Custom SMTP: `smtp.resend.com:465`, User `resend`,
  Absender `hallo@sorayaluxuryastroguide.com` / „Soraya“. Vorlagen aus `mail-vorlagen/` eingetragen (Confirm sign up,
  Reset password). Test „Passwort vergessen“ kam im Posteingang an. **„Confirm email“ ist in Supabase EIN** (seit 17.10., von
  Attila eingeschaltet): nach der Registrierung zeigt die App „Bitte E-Mail bestätigen…“, der Link
  `/login?token_hash=…&type=email` bestätigt per `verifyOtp` und öffnet die App; Login vor Bestätigung → Hinweis
  „Bitte bestätige zuerst deine E-Mail…“.
- **Passwort vergessen funktioniert (17.10., getestet):** Supabase URL Configuration: Site URL
  `https://app.sorayaluxuryastroguide.com`, Redirect `https://app.sorayaluxuryastroguide.com/**`. Mail-Links gehen auf
  `/login?token_hash=…&type=recovery` (geräteunabhängig, `verifyOtp`), `/login` zeigt dann „Neues Passwort festlegen“.
- **Statistik ist verbunden (18.10.):** `AGENT_STATS_TOKEN` in beiden Diensten gesetzt, Wirkung zeigt Zahlen
  (30 Tage: 7 neue Konten, 6 aktive Nutzer, Schnellstart oft geöffnet, aber nur 1× berechnet – Absprung prüfen).
- **Google (20.10.):** Search Console als Domain-Property `sorayaluxuryastroguide.com` bestätigt (TXT-Eintrag
  `google-site-verification=…` in Vercel-DNS – **nicht löschen**). Landingpage: `soraya-landing.vercel.app` leitet per
  `vercel.json` auf www um, `robots.txt` + `sitemap.xml` (4 Sprachen), Organisation mit Instagram in den strukturierten Daten.
- Nutzerzahlen (17.10.2026): 8 Konten in Supabase (inkl. Demo und Attilas Testkonten).
- Es fehlt Reichweite. Supabase-Abfragen gehen über den Supabase-MCP (Tabellen u. a. `people`, `analyses`,
  `synastries`, `public_usage(day, kind, n)`, `app_events`).
- Ideen für später: Google-Ads-App-Kampagne (Texte/Bilder liefert der Agent), TikTok-Anbindung,
  Instagram-Insights in die Lernschleife, neues App-Icon im Play Store (neues AAB über PWABuilder).

## Tests (bisher lokal im Scratchpad, nicht im Repo)

- Agent: pytest gegen eine lokale Postgres (Claude/Meta/Engine als Attrappen) + Playwright-UI-Test
  gegen einen lokalen Dev-Server mit Attrappen. Siehe `tests/` im Repo `Soraya-Agent`.
- Web/Landing: Playwright-Tests mit abgefangenen Supabase-/Engine-Aufrufen; Chromium liegt unter
  `/opt/pw-browsers/chromium` (kann kein H.264 abspielen → Videos über die Datei prüfen).
