#!/bin/bash
# Doppelklick: holt frische Demo-Daten und öffnet die Übersicht.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js wurde nicht gefunden. Bitte installieren: https://nodejs.org"
  read -r -p "Enter zum Schließen."
  exit 1
fi

echo "Hole aktuelle Demo-Termine …"
node scrape.mjs
echo ""
echo "Öffne Übersicht …"
open index.html
echo "Fertig."
