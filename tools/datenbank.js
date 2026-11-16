/*
 * Prüfungen für die Fragen-Datenbank (Node und Browser).
 * pruefeDatenbank(FRAGEN, Pruefung) → { fehler: [...], warnungen: [...], statistik: {...} }
 */
(function (root) {
  "use strict";

  var KATEGORIEN = ["geografie", "geschichte", "wissenschaft", "popkultur"];
  var PRO_KATEGORIE = 50;
  var GESAMT = 200;
  var MAX_WOERTER = 25;

  function woerter(text) {
    return String(text).split(/\s+/).filter(function (w) { return /[0-9A-Za-zÄÖÜäöüß]/.test(w); }).length;
  }

  function pruefeDatenbank(FRAGEN, P) {
    var fehler = [], warnungen = [];
    var ids = {}, fragen = {};
    var proKat = {}, proSchwierigkeit = {};
    KATEGORIEN.forEach(function (k) { proKat[k] = 0; proSchwierigkeit[k] = { 1: 0, 2: 0, 3: 0 }; });

    if (FRAGEN.length !== GESAMT) fehler.push("Es sind " + FRAGEN.length + " Fragen statt " + GESAMT + ".");

    FRAGEN.forEach(function (q, i) {
      var wo = (q && q.id) ? q.id : "Eintrag " + (i + 1);
      ["id", "kategorie", "schwierigkeit", "frage", "antwort", "varianten", "funfact"].forEach(function (feld) {
        var v = q[feld];
        var leer = v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
        if (leer) fehler.push(wo + ": Feld „" + feld + "“ fehlt oder ist leer.");
      });
      if (!q.id) return;
      if (ids[q.id]) fehler.push("Doppelte ID: " + q.id);
      ids[q.id] = true;

      if (KATEGORIEN.indexOf(q.kategorie) < 0) fehler.push(wo + ": unbekannte Kategorie „" + q.kategorie + "“.");
      else {
        proKat[q.kategorie]++;
        if (proSchwierigkeit[q.kategorie][q.schwierigkeit] !== undefined) proSchwierigkeit[q.kategorie][q.schwierigkeit]++;
      }
      if ([1, 2, 3].indexOf(q.schwierigkeit) < 0) fehler.push(wo + ": Schwierigkeit muss 1, 2 oder 3 sein.");
      if (!Array.isArray(q.varianten)) fehler.push(wo + ": varianten muss eine Liste sein.");

      var normFrage = P.normalisiere(q.frage, { fuellwoerter: false });
      if (fragen[normFrage]) fehler.push(wo + ": doppelte Frage (wie " + fragen[normFrage] + ").");
      fragen[normFrage] = q.id;

      var w = woerter(q.funfact || "");
      if (w > MAX_WOERTER) fehler.push(wo + ": Fun Fact hat " + w + " Wörter (max. " + MAX_WOERTER + ").");
      if (/[()\[\]{}]/.test(q.frage)) fehler.push(wo + ": Frage enthält Klammern.");
      if (/folgenden|nenne zwei|nenne drei/i.test(q.frage)) fehler.push(wo + ": Multiple-Choice- oder Mehrfach-Formulierung.");
      if (!/\?$/.test(q.frage.trim())) warnungen.push(wo + ": Frage endet nicht mit einem Fragezeichen.");

      // Antwort muss von der eigenen Prüfung akzeptiert werden
      [q.antwort].concat(q.varianten || []).forEach(function (v) {
        if (!P.pruefeAntwort(q, [v]).richtig) fehler.push(wo + ": eigene Antwort/Variante „" + v + "“ wird nicht erkannt.");
      });
      // Ausschlüsse dürfen nicht akzeptiert werden
      (q.ausschluss || []).forEach(function (a) {
        if (P.pruefeAntwort(q, [a]).richtig) fehler.push(wo + ": ausgeschlossene Antwort „" + a + "“ wird trotzdem akzeptiert.");
      });
    });

    KATEGORIEN.forEach(function (k) {
      if (proKat[k] !== PRO_KATEGORIE) fehler.push("Kategorie " + k + ": " + proKat[k] + " statt " + PRO_KATEGORIE + " Fragen.");
    });

    // Kreuztest: Die Antwort einer anderen Frage darf nicht versehentlich als richtig gelten.
    FRAGEN.forEach(function (q) {
      var eigene = [q.antwort].concat(q.varianten || []).map(function (v) { return P.normalisiere(v); });
      FRAGEN.forEach(function (andere) {
        if (andere === q) return;
        var a = P.normalisiere(andere.antwort);
        if (eigene.indexOf(a) >= 0) return; // gleiche Antwort ist gewollt (z. B. "8")
        var erg = P.pruefeAntwort(q, [andere.antwort]);
        if (erg.richtig) warnungen.push(q.id + " („" + q.antwort + "“) akzeptiert auch „" + andere.antwort + "“ aus " + andere.id + " (" + erg.art + ").");
      });
    });

    return { fehler: fehler, warnungen: warnungen, statistik: { gesamt: FRAGEN.length, proKategorie: proKat, proSchwierigkeit: proSchwierigkeit } };
  }

  var Datenbank = { pruefeDatenbank: pruefeDatenbank };
  if (typeof module !== "undefined" && module.exports) module.exports = Datenbank;
  if (root) root.SchlaumobilDatenbank = Datenbank;
})(typeof window !== "undefined" ? window : this);
