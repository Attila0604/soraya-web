# Mails über Resend – Anleitung

Die App merkt sich beim Registrieren (und bei jedem Öffnen) die Sprache im Konto (`lang`).
Die Vorlagen hier wählen damit selbst Deutsch, Englisch, Ungarisch oder Italienisch (sonst Englisch).

## 1. Resend
1. Konto auf resend.com anlegen.
2. **Domains → Add Domain** → `sorayaluxuryastroguide.com` (Region: EU, Frankfurt).
3. Die angezeigten DNS-Einträge (TXT/MX für SPF und DKIM) dort eintragen, wo die Domain verwaltet wird.
   Warten, bis bei Resend „Verified“ steht.
4. **API Keys → Create API Key** (Berechtigung „Sending access“, Domain sorayaluxuryastroguide.com).
   Schlüssel nur in Supabase eintragen, nirgends sonst teilen.

## 2. Supabase (Projekt qpvniafpajeafcwsrtds)
**Authentication → Emails → SMTP Settings → Enable Custom SMTP**
- Sender email: `hallo@sorayaluxuryastroguide.com` · Sender name: `Soraya`
- Host: `smtp.resend.com` · Port: `465` · Username: `resend` · Password: der Resend-API-Schlüssel
- Speichern.

**Authentication → Emails → Templates**
- **Confirm signup**: Inhalt von `bestaetigen.html` komplett einfügen.
  Betreff: `Soraya ✦ Bestätige deine E-Mail · Confirm your email`
- **Reset password**: Inhalt von `passwort.html` komplett einfügen.
  Betreff: `Soraya ✦ Neues Passwort · New password`

**Authentication → Rate Limits**: „Emails sent per hour“ auf z. B. 30 erhöhen (geht erst mit eigenem SMTP).

## 3. Danach
- Test: in der App mit einer zweiten E-Mail-Adresse registrieren und „Passwort vergessen“ ausprobieren.
- Datenschutzerklärung um Resend ergänzen (vorbereitet im Branch `datenschutz-resend`).
