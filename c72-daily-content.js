/*
  c72-daily-content.js
  Täglich wechselnder Tagesimpuls auf der Home-Seite.

  - füllt #dailyFocusTitle / #dailyFocusText
  - wählt deterministisch nach Kalendertag (gleicher Tag -> gleicher Impuls),
    wechselt automatisch um Mitternacht (lokale Zeit)
  - die Horoskop-Fokuskarten (#horoFocusTitle/Text) bleiben unberührt,
    die füllt das Backend mit echten Transit-Daten.

  Neue Impulse? Einfach unten in IMPULSES ergänzen.
*/
(function () {
  "use strict";

  var IMPULSES = [
    { t: "Innere Klarheit",  x: "Heute ordnen sich deine Gedanken — höre auf die leise Stimme, nicht auf den Lärm." },
    { t: "Sanfter Aufbruch", x: "Ein neuer Zyklus beginnt. Ein kleiner Schritt genügt, um ihn zu eröffnen." },
    { t: "Stille Kraft",     x: "Deine Ruhe ist heute deine Stärke. Lass andere eilen." },
    { t: "Offenes Herz",     x: "Die Sterne laden dich ein, eine Verbindung behutsam zu vertiefen." },
    { t: "Klare Grenzen",    x: "Ein Nein zur richtigen Zeit schützt dein Ja." },
    { t: "Loslassen",        x: "Was schwer wiegt, darf heute gehen. Öffne die Hand." },
    { t: "Mut zur Stimme",   x: "Sprich aus, was du längst weißt — der Mond stärkt dein Wort." },
    { t: "Erdung",           x: "Kehre zu deinem Atem zurück; dort wartet deine Mitte." },
    { t: "Neues Licht",      x: "Eine Idee sucht dich. Gib ihr Raum, bevor du sie prüfst." },
    { t: "Geduld",           x: "Nicht alles reift heute. Vertraue dem langsamen Werden." },
    { t: "Verbindung",       x: "Ein Gespräch klärt heute mehr als tagelanges Grübeln." },
    { t: "Fülle",            x: "Zähle, was schon da ist — von dort wächst das Weitere." },
    { t: "Wandlung",         x: "Ein Übergang zeigt sich. Du musst ihn nicht erzwingen, nur zulassen." },
    { t: "Intuition",        x: "Dein erster Impuls trägt heute Weisheit. Traue ihm." },
    { t: "Weite",            x: "Hebe den Blick. Der Horizont ist größer, als der Tag dich glauben lässt." },
    { t: "Dankbarkeit",      x: "Ein stiller Dank am Morgen färbt den ganzen Tag." }
  ];

  function dayIndex() {
    var now = new Date();
    // lokale Mitternacht als Tagesgrenze
    var localMidnightDays = Math.floor(
      (now.getTime() - now.getTimezoneOffset() * 60000) / 86400000
    );
    return ((localMidnightDays % IMPULSES.length) + IMPULSES.length) % IMPULSES.length;
  }

  function apply() {
    var pick = IMPULSES[dayIndex()];
    var titleEl = document.getElementById("dailyFocusTitle");
    var textEl = document.getElementById("dailyFocusText");
    if (titleEl) titleEl.textContent = pick.t;
    if (textEl) textEl.textContent = pick.x;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
  // falls die Home-Sektion erst später gerendert wird
  window.setTimeout(apply, 1200);

  window.sorayaDailyImpulse = apply;
})();
