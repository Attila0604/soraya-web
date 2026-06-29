# Soraya Phase B.3 — Synastrie ohne UUID

Baut auf Phase B.2 auf.

## Neu
- Synastrie-Seite bekommt eine UI für „Zweite Person“.
- Du kannst eine zweite Person direkt in der App anlegen.
- Die App speichert die zweite Person über den bestehenden Backend-Endpunkt `/mobile/people/create`.
- Danach kannst du die Person aus einer Liste auswählen.
- Das alte UUID-Feld wird versteckt.
- Keine Backend-Änderung nötig.

## Wichtig
Die Personenliste ist in Phase B.3 lokal im Browser gespeichert. Personen, die früher auf einem anderen Gerät angelegt wurden, werden noch nicht automatisch aus Supabase geladen. Das wäre Phase B.4 mit eigenem Backend-Endpunkt `/mobile/people/list`.

## Einbau
1. `index.html` ersetzen.
2. `manifest.webmanifest` und `icon.svg` können bleiben.
3. Commit: `Phase B.3 synastry person selector`
