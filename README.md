# Demomelder Stuttgart

Eine kleine, **lokale** App, die kommende Demonstrationen, Kundgebungen und
Aktionen in Stuttgart aus mehreren öffentlichen Quellen zusammenträgt und
übersichtlich anzeigt.

## Wichtig vorweg: ohne Gewähr, nicht amtlich, unvollständig

Die Stadt Stuttgart veröffentlicht **keine** offizielle Liste angemeldeter
Versammlungen (anders als z. B. Berlin). Es gibt also keine saubere amtliche
Datenquelle. Diese App bündelt stattdessen mehrere zivilgesellschaftliche
Kalender. Jeder davon bildet nur **sein eigenes politisches Spektrum** ab — das
ist in der Übersicht farblich gekennzeichnet. Spontane, kurzfristige oder nicht
öffentlich beworbene Versammlungen fehlen prinzipiell. **Vor dem Hingehen immer
an der Originalquelle prüfen.**

## Benutzung

**Der einfache Weg:** Doppelklick auf **`aktualisieren.command`**.
Das holt frische Termine und öffnet die Übersicht im Browser.

**Der manuelle Weg** (Terminal):
```
node scrape.mjs      # holt aktuelle Daten → demos.js / demos.json
open index.html      # öffnet die Übersicht
```

`index.html` ist eine einzelne, in sich geschlossene Seite — sie lädt nur die
lokal erzeugte `demos.js`. Kein Server, kein Internet zum Anzeigen nötig
(nur zum *Aktualisieren*).

> Beim allerersten Mal muss macOS die `.command`-Datei evtl. freigeben:
> Rechtsklick → „Öffnen" → „Öffnen" bestätigen.

## Voraussetzung

- **Node.js** (getestet mit v26). Prüfen: `node --version`.
  Falls nicht vorhanden: <https://nodejs.org>.

## Die Quellen

| Quelle | Spektrum | Was sie liefert |
|---|---|---|
| **eintopf.info** | links / zivilgesellschaftlich | Haupt­quelle; Demos, Kundgebungen, Kidical/Critical Mass, CSD u. v. m. (ICS-Feed, Kategorie „Demonstration") |
| **DemokraTEAM** | gegen rechts | Aktionen „gegen rechts / AfD" im Stuttgarter Umkreis (Aktionskarte, Geo-Filter) |
| **Friedenskooperative** | Friedensbewegung | Friedens-/Abrüstungstermine mit Ort Stuttgart |
| **Montagsdemo (Parkschützer)** | Stuttgart 21 | Wöchentliche Montagsdemo, Schlossplatz, 18 Uhr (fortlaufend nummeriert) |

Dieselbe Demo aus zwei Quellen wird automatisch zusammengeführt und zeigt beide
Herkünfte als Bestätigung an.

## Was bewusst NICHT passiert (Datenschutz)

- Es werden **nur Sachdaten** angezeigt: Datum, Zeit, Ort, Thema.
- **Keine** personenbezogenen Anmelder-/Veranstalternamen.
- Rein **privat/lokal** gedacht. Für eine öffentliche Veröffentlichung gälten
  zusätzliche Pflichten (Impressum, Datenschutzerklärung, Urheber-/Datenbankrecht) —
  siehe „Erweitern".

## Aktualität

- Wegen der gesetzlichen 48-Stunden-Anmeldefrist genügt es, **alle paar Tage**
  zu aktualisieren.
- Die Übersicht zeigt oben, wie alt der letzte Stand ist, und warnt, wenn er
  älter als 2 Tage ist.
- Bricht mal eine Quelle weg, laufen die anderen weiter (jede Quelle ist
  einzeln abgesichert). Liefert ausnahmsweise **gar keine** Quelle Daten,
  bleiben die letzten guten Daten erhalten (kein Überschreiben mit leer).

## Aufbau der Dateien

```
scrape.mjs            Datensammler (Node, ohne externe Pakete)
index.html            Oberfläche im Signal-Plakat-Design (eine Datei, offline
                      lauffähig, Display-Grotesk als woff2 eingebettet)
demos.js / demos.json vom Scraper erzeugte Daten (nicht von Hand ändern)
aktualisieren.command Doppelklick-Helfer (macOS)
assets/               Quell-Schrift (Archivo Black, OFL); beim Bau in index.html
                      eingebettet, zur Laufzeit nicht nötig
```

## Erweitern / anpassen

- **Neue Quelle:** in `scrape.mjs` eine `parseXY`-Funktion schreiben und in das
  Array `QUELLEN` eintragen. Normalisiertes Format pro Termin:
  `{ titel, datum (YYYY-MM-DD), zeit ("HH:MM"|null), endeZeit, ort, beschreibung,
  url, kategorien[], quelle, spektrum }`.
- **Umkreis von DemokraTEAM enger/weiter:** Konstante `STGT_BOX` (Geo-Bounding-Box).
- **Spektrums-Farben ändern/ergänzen:** in `index.html` die CSS-Variablen `--sp-*`
  und die `.tag[data-s="…"]`-Regeln (Farbe erscheint bewusst nur auf den Tags).
- **Automatisch aktualisieren:** Wer mag, kann `node scrape.mjs` per `launchd`
  oder `cron` täglich laufen lassen. Für den privaten Gebrauch reicht aber der
  Doppelklick bei Bedarf.
