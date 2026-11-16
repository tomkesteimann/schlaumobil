#!/usr/bin/env node
/* Prüft die Fragen-Datenbank:  node tools/pruefe-fragen.js */
"use strict";
const P = require("../pruefung.js");
const FRAGEN = require("../fragen.js");
const { pruefeDatenbank } = require("./datenbank.js");

const erg = pruefeDatenbank(FRAGEN, P);
const s = erg.statistik;
console.log(`Fragen gesamt: ${s.gesamt}`);
for (const k of Object.keys(s.proKategorie)) {
  const d = s.proSchwierigkeit[k];
  console.log(`  ${k.padEnd(13)} ${s.proKategorie[k]}  (leicht ${d[1]}, mittel ${d[2]}, schwer ${d[3]})`);
}
if (erg.warnungen.length) {
  console.log(`\nHinweise (${erg.warnungen.length}):`);
  erg.warnungen.forEach((w) => console.log("  ! " + w));
}
if (erg.fehler.length) {
  console.log(`\nFEHLER (${erg.fehler.length}):`);
  erg.fehler.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}
console.log("\n✓ Datenbank ist in Ordnung.");
