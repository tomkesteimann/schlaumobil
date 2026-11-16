#!/usr/bin/env node
/* Startet die Tests der Antwortprüfung:  node tests/pruefung.test.js */
"use strict";
const P = require("../pruefung.js");
const FRAGEN = require("../fragen.js");
const FAELLE = require("./faelle.js");
const { laufeTests } = require("./lauf.js");

const erg = laufeTests(P, FRAGEN, FAELLE);
for (const d of erg.details) {
  if (!d.ok || process.argv.includes("--alle")) console.log((d.ok ? "  ✓ " : "  ✗ ") + d.text);
}
const anzahlFaelle = FAELLE.antworten.length + FAELLE.befehle.length + FAELLE.normalisierung.length;
console.log(`\n${anzahlFaelle} Testfälle + Selbsttest der Datenbank: ${erg.ok} ok, ${erg.fehler} Fehler`);
process.exit(erg.fehler ? 1 : 0);
