#!/usr/bin/env node
// Demomelder Stuttgart — Datensammler
// Liest mehrere öffentliche Quellen aus und schreibt einen normalisierten
// Datensatz nach demos.js (für die Oberfläche) und demos.json (Rohdaten).
//
// Bewusste Grundsätze (siehe README):
//   - Nur Sachdaten (Datum/Zeit/Ort/Thema), KEINE Anmelder-/Personennamen.
//   - Jede Quelle ist fail-soft: bricht eine weg, laufen die anderen weiter.
//   - Kein Überschreiben mit leerem Ergebnis, falls ausnahmsweise alles fehlschlägt.
//
// Ausführen:  node scrape.mjs

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Zeit-Helfer (alles auf Europe/Berlin normalisieren)
// ---------------------------------------------------------------------------
const berlinFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
function berlinParts(date) {
  const p = berlinFmt.formatToParts(date);
  const g = (t) => p.find((x) => x.type === t).value;
  return { datum: `${g("year")}-${g("month")}-${g("day")}`, zeit: `${g("hour")}:${g("minute")}` };
}
// Heutiges Datum in Berlin (für den Zukunftsfilter)
const HEUTE = berlinParts(new Date()).datum;

// ---------------------------------------------------------------------------
// Netz-Helfer
// ---------------------------------------------------------------------------
async function fetchText(url, { timeout = 45000, retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept": "text/html,application/xhtml+xml,text/calendar,application/rss+xml,application/ld+json,*/*",
          "Accept-Language": "de,en;q=0.8",
        },
        signal: ctrl.signal,
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (/^HTTP 4\d\d/.test(err.message || "")) break;           // Client-Fehler: nicht wiederholen
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * attempt));
    } finally {
      clearTimeout(t);
    }
  }
  const cause = lastErr && lastErr.cause ? ` (${lastErr.cause.code || lastErr.cause.message || lastErr.cause})` : "";
  throw new Error(((lastErr && lastErr.message) || "unbekannt") + cause);
}

// ---------------------------------------------------------------------------
// Text-Helfer
// ---------------------------------------------------------------------------
function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&#8217;/g, "’")
    .replace(/&#8211;/g, "–").replace(/&#8212;/g, "—").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function decodeJsonUnicode(s) {
  return (s || "").replace(/\\u([0-9a-fA-F]{4})/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\\\//g, "/").replace(/\\"/g, '"').replace(/\\r|\\n|\\t/g, " ");
}
function stripTags(s) { return decodeEntities((s || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim(); }
function clip(s, n = 240) { s = (s || "").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }

// ===========================================================================
// QUELLE 1 — eintopf.info (ICS-Feed, Kategorie "Demonstration")
// ===========================================================================
function unescapeICS(v) {
  return (v || "").replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}
function icsDateToBerlin(raw) {
  // Formen: 20260101T180000Z  |  20260101T180000  |  20260101 (VALUE=DATE)
  const m = raw.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?/);
  if (!m) return null;
  const [, Y, Mo, D, h, mi, s, z] = m;
  if (h === undefined) return { datum: `${Y}-${Mo}-${D}`, zeit: null, ganztags: true };
  if (z === "Z") return { ...berlinParts(new Date(Date.UTC(+Y, +Mo - 1, +D, +h, +mi, +(s || 0)))), ganztags: false };
  // ohne Z: als lokale Berliner Zeit interpretieren
  return { datum: `${Y}-${Mo}-${D}`, zeit: `${h}:${mi}`, ganztags: false };
}
function parseEintopf(ics) {
  // Zeilen entfalten (Fortsetzungszeilen beginnen mit Space/Tab)
  const unfolded = ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const out = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0];
    const get = (key) => {
      const m = body.match(new RegExp("^" + key + "(?:;[^:\\n]*)?:(.*)$", "m"));
      return m ? m[1].trim() : null;
    };
    const cats = get("CATEGORIES") || "";
    if (!/Demonstration/i.test(unescapeICS(cats))) continue;
    const dtRaw = get("DTSTART");
    const d = dtRaw && icsDateToBerlin(dtRaw);
    if (!d || d.datum < HEUTE) continue;
    const dtEnd = get("DTEND");
    const e = dtEnd && icsDateToBerlin(dtEnd);
    const kategorien = unescapeICS(cats).split(",").map((x) => x.trim()).filter((x) => x && x !== "Demonstration");
    let besch = clip(unescapeICS(get("DESCRIPTION")));
    if (/^https?:\/\/\S+$/i.test((besch || "").trim())) besch = null; // reine URL ist keine Beschreibung
    out.push({
      titel: unescapeICS(get("SUMMARY")) || "Demonstration",
      datum: d.datum, zeit: d.zeit, endeZeit: e && e.datum === d.datum ? e.zeit : null,
      ort: unescapeICS(get("LOCATION")),
      beschreibung: besch,
      url: get("URL"),
      kategorien,
      quelle: "eintopf.info", spektrum: "links / zivilgesellschaftlich",
    });
  }
  return out;
}

// ===========================================================================
// QUELLE 2 — Friedenskooperative (Termine, clientseitig auf Stuttgart gefiltert)
// ===========================================================================
const DE_MON = { jan: 1, feb: 2, "mär": 3, mrz: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12 };
function inferYear(monat, tag) {
  const [Y, M, D] = HEUTE.split("-").map(Number);
  let year = Y;
  // wenn das Datum mehr als ~30 Tage in der Vergangenheit läge, nächstes Jahr
  const cand = new Date(Date.UTC(year, monat - 1, tag));
  const heute = new Date(Date.UTC(Y, M - 1, D));
  if (cand.getTime() < heute.getTime() - 30 * 864e5) year += 1;
  return year;
}
function parseFriedenskoop(html) {
  const out = [];
  // Jeder Termin: date-column (Datum + city) gefolgt von content-column (Typ + Titel/Link)
  const re = /class="[^"]*date-column[^"]*"[\s\S]*?<div class="date"><span[^>]*class="date-display-single">([^<]+)<\/span><\/div>\s*<small class="city">([^<]*)<\/small>[\s\S]*?class="[^"]*content-column[^"]*"\s*[^>]*>\s*<small>([^<]*)<\/small>\s*<h2 class="node-title"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const [, dateStr, cityRaw, typ, href, titelRaw] = m;
    const city = decodeEntities(cityRaw).trim();
    if (!/stuttgart/i.test(city)) continue;
    const dm = dateStr.match(/(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s*(\d{1,2}):(\d{2})/);
    if (!dm) continue;
    const tag = +dm[1];
    const monat = DE_MON[dm[2].toLowerCase().slice(0, 3).replace("ä", "ä")] || DE_MON[dm[2].toLowerCase().slice(0, 3)];
    if (!monat) continue;
    const year = inferYear(monat, tag);
    const datum = `${year}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
    if (datum < HEUTE) continue;
    out.push({
      titel: stripTags(titelRaw) || "Aktion",
      datum, zeit: `${dm[3].padStart(2, "0")}:${dm[4]}`, endeZeit: null,
      ort: city, beschreibung: null,
      url: href.startsWith("http") ? href : "https://www.friedenskooperative.de" + href,
      kategorien: stripTags(typ) ? [stripTags(typ)] : [],
      quelle: "Friedenskooperative", spektrum: "Friedensbewegung",
    });
  }
  return out;
}

// ===========================================================================
// QUELLE 3 — demokrateam.org (Aktionskarte, Geo-Filter auf Stuttgart)
// ===========================================================================
const MONATE_LANG = { januar: 1, februar: 2, "märz": 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 };
const STGT_BOX = { latMin: 48.50, latMax: 48.90, lngMin: 8.95, lngMax: 9.35 };
function parseDemokrateam(html) {
  const out = [];
  // Marker-Positionen finden; Inhalt eines Markers reicht bis zum nächsten Marker.
  const markerRe = /"latitude":(-?\d+(?:\.\d+)?),"longitude":(-?\d+(?:\.\d+)?)/g;
  const positions = [];
  let mm;
  while ((mm = markerRe.exec(html))) positions.push({ lat: +mm[1], lng: +mm[2], idx: mm.index });
  for (let i = 0; i < positions.length; i++) {
    const { lat, lng, idx } = positions[i];
    if (lat < STGT_BOX.latMin || lat > STGT_BOX.latMax || lng < STGT_BOX.lngMin || lng > STGT_BOX.lngMax) continue;
    const slice = decodeJsonUnicode(html.slice(idx, positions[i + 1]?.idx ?? idx + 8000));
    // Events im Marker: Datum, Titel/URL, Startzeit
    const dates = [...slice.matchAll(/mec-map-lightbox-month">([^<]+)<\/span><span class="mec-map-lightbox-day">\s*(\d+)<\/span><span class="mec-map-lightbox-year">\s*(\d+)/g)];
    const titles = [...slice.matchAll(/class="mec-color-hover" href="([^"]+)">([\s\S]*?)<\/a>/g)];
    const times = [...slice.matchAll(/mec-start-time">([^<]+)</g)];
    const n = Math.min(dates.length, titles.length);
    for (let k = 0; k < n; k++) {
      const monat = MONATE_LANG[dates[k][1].trim().toLowerCase()];
      if (!monat) continue;
      const datum = `${dates[k][3]}-${String(monat).padStart(2, "0")}-${String(dates[k][2]).padStart(2, "0")}`;
      if (datum < HEUTE) continue;
      out.push({
        titel: stripTags(titles[k][2]) || "Aktion gegen rechts",
        datum, zeit: times[k] ? times[k][1].trim() : null, endeZeit: null,
        ort: "Stuttgart (Umkreis)", beschreibung: null,
        url: titles[k][1], kategorien: [],
        quelle: "DemokraTEAM", spektrum: "gegen rechts",
      });
    }
  }
  return out;
}

// ===========================================================================
// QUELLE 4 — Montagsdemo Stuttgart 21 (wiederkehrender Fixtermin, Mo 18 Uhr)
// ===========================================================================
function nextMondays(count) {
  const [Y, M, D] = HEUTE.split("-").map(Number);
  const d = new Date(Date.UTC(Y, M - 1, D));
  // auf nächsten Montag (inkl. heute, falls Montag)
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`);
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return list;
}
function parseMontagsdemo(html) {
  // Anker: "Mo., 13.07., 18 Uhr: ... 813. Montagsdemo"  → Nummer an Datum verankern
  let anchorNr = null, anchorDate = null;
  if (html) {
    const a = html.match(/Mo\.,?\s*(\d{2})\.(\d{2})\.[\s\S]{0,120}?(\d{3,4})\.\s*Montagsdemo/);
    if (a) {
      const [, dd, mm, nr] = a;
      const [Y] = HEUTE.split("-").map(Number);
      let year = Y;
      const cand = `${year}-${mm}-${dd}`;
      if (cand < HEUTE.slice(0, 4) + "-01-01") year += 1;
      anchorDate = `${year}-${mm}-${dd}`;
      anchorNr = +nr;
    }
  }
  const out = [];
  const mondays = nextMondays(8);
  for (const datum of mondays) {
    let nr = null;
    if (anchorNr && anchorDate) {
      const weeks = Math.round((Date.parse(datum + "T00:00:00Z") - Date.parse(anchorDate + "T00:00:00Z")) / (7 * 864e5));
      nr = anchorNr + weeks;
    }
    out.push({
      titel: nr ? `${nr}. Montagsdemo gegen Stuttgart 21` : "Montagsdemo gegen Stuttgart 21",
      datum, zeit: "18:00", endeZeit: null,
      ort: "Schlossplatz, Stuttgart", beschreibung: "Wöchentliche Kundgebung der Parkschützer:innen (seit 2010).",
      url: "https://www.bei-abriss-aufstand.de/", kategorien: [],
      quelle: "Montagsdemo (Parkschützer)", spektrum: "Stuttgart 21",
    });
  }
  return out;
}

// ===========================================================================
// QUELLE 5 — PRÜF (nächste Kundgebung, strukturiert via demokrateam JSON-LD)
// ===========================================================================
function parsePruef(html) {
  const out = [];
  // Zeit aus der SICHTBAREN MEC-Anzeige nehmen: das JSON-LD-startDate hat bei
  // diesem Plugin einen systematischen Zeitzonen-Versatz (zeigt 14:00 statt 12:00).
  const tm = html.match(/mec-start-time[^0-9]{0,6}(\d{1,2}:\d{2})/i);
  const em = html.match(/mec-end-time[^0-9]{0,6}(\d{1,2}:\d{2})/i);
  const zeitSichtbar = tm ? tm[1].padStart(5, "0") : null;
  const endeSichtbar = em ? em[1].padStart(5, "0") : null;

  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let data;
    try { data = JSON.parse(b[1].trim()); } catch { continue; }
    const items = Array.isArray(data) ? data : (data["@graph"] || [data]);
    for (const it of items) {
      const types = [].concat((it && it["@type"]) || []);
      if (!types.includes("Event") || typeof it.startDate !== "string") continue;
      const datum = it.startDate.slice(0, 10);                 // Datum ist zuverlässig
      if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || datum < HEUTE) continue;
      const loc = it.location || {};
      const ort = loc.name || (loc.address && (loc.address.streetAddress || loc.address.addressLocality)) || "Stuttgart";
      if (!/stuttgart/i.test(JSON.stringify(loc) + " " + ort)) continue; // nur Stuttgart-Termine
      out.push({
        titel: (it.name || "PRÜF-Kundgebung").trim(),
        datum,
        zeit: zeitSichtbar,
        endeZeit: endeSichtbar && endeSichtbar !== zeitSichtbar ? endeSichtbar : null,
        ort, beschreibung: null,
        url: (typeof it.url === "string" && it.url) || "https://www.demokrateam.org/aktionen/pruef-baden-wuerttemberg/",
        kategorien: [],
        quelle: "PRÜF (demokrateam)", spektrum: "gegen rechts",
      });
    }
  }
  return out;
}

// ===========================================================================
// QUELLE 6 — Fridays for Future (Streiktermine, strukturierte Karten-Popups)
// ===========================================================================
function parseFff(html) {
  const out = [];
  const re = /bindPopup\('<b>([^<]+)<\/b><\/br>(\d{2})\.(\d{2})\.(\d{4})<br>(\d{1,2}):(\d{2})\s*Uhr<br>([^<]*)/g;
  let m;
  while ((m = re.exec(html))) {
    const [, stadt, dd, mm, yyyy, H, M, ort] = m;
    if (!/^\s*stuttgart\s*$/i.test(stadt)) continue;          // nur Stuttgart-Stadt, kein Umland
    const datum = `${yyyy}-${mm}-${dd}`;
    if (datum < HEUTE) continue;
    out.push({
      titel: "Klimastreik (Fridays for Future)", datum, zeit: `${H.padStart(2, "0")}:${M}`, endeZeit: null,
      ort: (ort || "").trim() || "Stuttgart", beschreibung: null,
      url: "https://fridaysforfuture.de/streiktermine/", kategorien: [],
      quelle: "Fridays for Future", spektrum: "links / zivilgesellschaftlich",
    });
  }
  return out;
}

// ===========================================================================
// Orchestrierung
// ===========================================================================
const QUELLEN = [
  { key: "eintopf", name: "eintopf.info", url: "https://eintopf.info/ical", parse: parseEintopf },
  { key: "friedenskoop", name: "Friedenskooperative", url: "https://www.friedenskooperative.de/termine", parse: parseFriedenskoop },
  { key: "demokrateam", name: "DemokraTEAM", url: "https://www.demokrateam.org/aktionskarte/", parse: parseDemokrateam },
  { key: "pruef", name: "PRÜF (demokrateam)", url: "https://www.demokrateam.org/aktionen/pruef-baden-wuerttemberg/", parse: parsePruef },
  { key: "fff", name: "Fridays for Future", url: "https://fridaysforfuture.de/streiktermine/", parse: parseFff },
  { key: "montagsdemo", name: "Montagsdemo (Parkschützer)", url: "https://www.bei-abriss-aufstand.de/", parse: parseMontagsdemo },
];

function normTitle(t) {
  return (t || "").toLowerCase().replace(/[^a-zäöüß0-9 ]/gi, " ").replace(/\s+/g, " ").trim();
}
function titleMatch(a, b) {
  const x = normTitle(a), y = normTitle(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 10 && l.includes(s);
}
function ortScore(d) {
  const o = d.ort || "";
  return (o && !/umkreis/i.test(o) ? 3 : 0) + Math.min(o.length, 40) / 10 + (d.beschreibung ? 1 : 0);
}
// Führt Termine zusammen, die dasselbe Ereignis aus mehreren Quellen beschreiben.
function dedupe(list) {
  const out = [];
  for (const d of list) {
    d.weitereQuellen = d.weitereQuellen || [];
    const hit = out.find((o) => o.datum === d.datum && titleMatch(o.titel, d.titel));
    if (!hit) { out.push(d); continue; }
    const refs = [
      { quelle: hit.quelle, spektrum: hit.spektrum, url: hit.url },
      ...hit.weitereQuellen,
      { quelle: d.quelle, spektrum: d.spektrum, url: d.url },
    ];
    const primary = ortScore(d) > ortScore(hit) ? d : hit;
    const other = primary === hit ? d : hit;
    const merged = { ...primary };
    merged.beschreibung = (primary.beschreibung || "").length >= (other.beschreibung || "").length
      ? primary.beschreibung : other.beschreibung;
    merged.kategorien = [...new Set([...(hit.kategorien || []), ...(d.kategorien || [])])];
    merged.endeZeit = primary.endeZeit || other.endeZeit || null;
    const seen = new Set([primary.quelle]);
    merged.weitereQuellen = [];
    for (const r of refs) if (!seen.has(r.quelle)) { seen.add(r.quelle); merged.weitereQuellen.push(r); }
    out[out.indexOf(hit)] = merged;
  }
  return out;
}

async function main() {
  const status = [];
  let alle = [];
  for (const q of QUELLEN) {
    const t0 = Date.now();
    try {
      const text = await fetchText(q.url);
      const items = q.parse(text) || [];
      alle = alle.concat(items);
      status.push({ key: q.key, name: q.name, ok: true, count: items.length, ms: Date.now() - t0, error: null });
      console.log(`✓ ${q.name.padEnd(26)} ${String(items.length).padStart(3)} Termine   (${Date.now() - t0} ms)`);
    } catch (err) {
      status.push({ key: q.key, name: q.name, ok: false, count: 0, ms: Date.now() - t0, error: String(err.message || err) });
      console.log(`✗ ${q.name.padEnd(26)} FEHLER: ${err.message || err}`);
    }
  }

  // Manuell kuratierte Einträge (für Termine, die nirgends maschinenlesbar stehen)
  try {
    const mp = join(DIR, "manuell.json");
    if (existsSync(mp)) {
      const arr = JSON.parse(readFileSync(mp, "utf8"));
      let n = 0;
      for (const e of (Array.isArray(arr) ? arr : [])) {
        if (!e || !e.titel || !/^\d{4}-\d{2}-\d{2}$/.test(e.datum || "")) continue;
        if (e.datum < HEUTE) continue;
        alle.push({
          titel: String(e.titel).trim(), datum: e.datum,
          zeit: /^\d{1,2}:\d{2}$/.test(e.zeit || "") ? e.zeit : null,
          endeZeit: /^\d{1,2}:\d{2}$/.test(e.endeZeit || "") ? e.endeZeit : null,
          ort: e.ort ? String(e.ort) : null, beschreibung: e.beschreibung ? String(e.beschreibung) : null,
          url: e.url ? String(e.url) : null, kategorien: [],
          quelle: e.quelle ? String(e.quelle) : "Eingetragen",
          spektrum: e.spektrum || "links / zivilgesellschaftlich",
        });
        n++;
      }
      status.push({ key: "manuell", name: "Eingetragen (manuell)", ok: true, count: n, ms: 0, error: null });
      console.log(`✓ ${"Eingetragen (manuell)".padEnd(26)} ${String(n).padStart(3)} Termine`);
    }
  } catch (err) {
    console.log(`✗ manuell.json konnte nicht gelesen werden: ${err.message || err}`);
  }

  // Ort-Feld säubern (Quelldaten haben teils Leerzeichen vor dem Komma)
  for (const d of alle) if (d.ort) d.ort = d.ort.replace(/\s+/g, " ").replace(/\s+,/g, ",").replace(/,\s*,/g, ",").replace(/[,\s]+$/, "").trim();

  // Sortieren nach lokalem Datum+Zeit
  alle.sort((a, b) => (`${a.datum}T${a.zeit || "00:00"}`).localeCompare(`${b.datum}T${b.zeit || "00:00"}`));

  // Dubletten zusammenführen (gleiches Ereignis aus mehreren Quellen)
  alle = dedupe(alle);

  // ID vergeben
  alle.forEach((d, i) => (d.id = `${d.quelle}-${d.datum}-${i}`));

  const payload = {
    generatedAt: new Date().toISOString(),
    heute: HEUTE,
    quellen: status,
    anzahl: alle.length,
    demos: alle,
  };

  const anyOk = status.some((s) => s.ok && s.count > 0);
  const outJs = join(DIR, "demos.js");
  const outJson = join(DIR, "demos.json");

  if (!anyOk && existsSync(outJson)) {
    console.log("\n⚠ Keine Quelle lieferte Termine — behalte vorhandene Daten (kein Überschreiben).");
    return;
  }

  writeFileSync(outJson, JSON.stringify(payload, null, 2), "utf8");
  writeFileSync(outJs, "window.DEMOS = " + JSON.stringify(payload) + ";\n", "utf8");
  console.log(`\n➜ ${alle.length} Termine geschrieben nach demos.js / demos.json  (Stand: ${payload.generatedAt})`);
}

main().catch((e) => { console.error("Fataler Fehler:", e); process.exit(1); });
