# Soraya Phase B.1 — Real Birth Chart

Diese Version baut auf Phase A.1 auf.

## Neu
- Analyse-Seite lädt echte Chart-Daten über Backend `/chart`.
- Birth-Chart-Rad wird mit echten Planetenpositionen, Häusern und Aspektlinien gezeichnet.
- Neue Panels:
  - Big Three
  - Planetenliste
  - Elemente-Balance
  - stärkste Aspekte
- Kein Backend-Umbau nötig.

## Wichtig
Die App braucht weiterhin im Settings-Modal die Soraya Backend URL.
Für echte Chart-Daten müssen im Profil Name, Geburtsdatum, Geburtszeit soweit bekannt und Geburtsort gespeichert sein.

## Einbau
1. `index.html` ersetzen.
2. `manifest.webmanifest` und `icon.svg` unverändert lassen.
3. Commit: `Phase B.1 real chart visualization`
