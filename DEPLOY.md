# Online stellen: geteilter Link, der sich selbst aktuell hält

Ziel: ein Link für den Freundeskreis, der sich mehrmals täglich automatisch
aktualisiert, ganz ohne deinen Laptop. Technik: GitHub Pages (Hosting) +
GitHub Actions (Cron sammelt die Termine). Kostenlos, ein Konto genügt.

## Einmalige Einrichtung

1. **GitHub-Konto** anlegen (falls noch keins): <https://github.com> → Sign up.
2. **Rechtstexte ausfüllen (Pflicht vor dem Livegang):** in `impressum.html` und
   `datenschutz.html` alle `[Platzhalter]` durch deine echten Angaben ersetzen
   (Name, ladungsfähige Anschrift, Kontakt-E-Mail).
3. **Neues Repository:** github.com → *New repository* → Name z. B. `demomelder`,
   Sichtbarkeit **Public**, *Create repository*.
   (Public ist nötig für kostenloses Pages + unbegrenzte Actions. Es sind keine
   Geheimnisse im Projekt, der Code darf offen sein.)
4. **Dateien hochladen:** den **gesamten Ordnerinhalt** ins Repo laden, per
   `git push` oder über *Add file → Upload files*. Wichtig: die Struktur muss
   erhalten bleiben, besonders `.github/workflows/update.yml`.
   Mindestens nötig: `index.html`, `demos.js`, `demos.json`, `scrape.mjs`,
   `impressum.html`, `datenschutz.html`, `.github/`.
5. **Schreibrechte für den Job:** Settings → Actions → General →
   „Workflow permissions" → **Read and write permissions** → Save.
   (Damit darf der tägliche Lauf die frischen Daten zurück committen.)
6. **Pages aktivieren:** Settings → Pages → „Build and deployment" →
   Source: **Deploy from a branch** → Branch: **main** / **/(root)** → Save.
   Nach ~1 Minute erscheint oben die öffentliche URL
   (`https://<dein-name>.github.io/demomelder/`).
7. **Ersten Datenlauf testen:** Tab **Actions** → „Demos aktualisieren" →
   *Run workflow*. Danach ist `demos.js` frisch und die Seite zeigt aktuelle Termine.

## Danach

- Läuft von allein: der Job holt 2× täglich neue Termine, committet sie, Pages
  veröffentlicht sie.
- **Link teilen:** die Pages-URL an den Freundeskreis geben. Die Seite ist
  `noindex`, taucht also nicht in Suchmaschinen auf.
- Ist der Stand oben auf der Seite mal alt: im Actions-Tab *Run workflow* drücken.

## Gut zu wissen

- Cron läuft in UTC und kann sich unter Last etwas verzögern. Wegen der
  48-Stunden-Anmeldefrist ist das unkritisch.
- Der Zeitstempel ändert sich bei jedem Lauf, daher gibt es immer einen Commit,
  das hält den geplanten Workflow aktiv (sonst deaktiviert GitHub ihn nach
  60 Tagen Repo-Inaktivität).
- Es wird nie ein Anmelder-/Personenname angezeigt, jeder Eintrag verlinkt zur
  Quelle. Vor breiter Verbreitung im Zweifel LfDI Baden-Württemberg oder
  Fachanwalt konsultieren.
