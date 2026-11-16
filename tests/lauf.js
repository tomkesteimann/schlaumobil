/*
 * Gemeinsamer Test-Runner für Node und Browser.
 * laufeTests(Pruefung, FRAGEN, TESTFAELLE) → { ok, fehler, details: [{ok, text}] }
 */
(function (root) {
  "use strict";

  function laufeTests(P, FRAGEN, FAELLE) {
    var nachId = {};
    FRAGEN.forEach(function (q) { nachId[q.id] = q; });
    var details = [];
    function melde(ok, text) { details.push({ ok: ok, text: text }); }

    FAELLE.antworten.forEach(function (f) {
      var q = nachId[f.frage];
      if (!q) { melde(false, "Frage " + f.frage + " fehlt"); return; }
      var eingabe = Array.isArray(f.eingabe) ? f.eingabe : [f.eingabe];
      var erg = P.pruefeAntwort(q, eingabe);
      var ok = erg.richtig === f.erwartet;
      melde(ok, "Antwort " + f.frage + " „" + eingabe.join(" | ") + "“ → " + (erg.richtig ? "richtig" : "falsch") +
        (erg.art ? " (" + erg.art + ")" : "") + (ok ? "" : "  ERWARTET: " + (f.erwartet ? "richtig" : "falsch")) +
        (f.info ? "  · " + f.info : ""));
    });

    FAELLE.befehle.forEach(function (f) {
      var b = P.erkenneBefehl(f.eingabe);
      var ok = b === f.erwartet;
      melde(ok, "Befehl „" + f.eingabe + "“ → " + b + (ok ? "" : "  ERWARTET: " + f.erwartet));
    });

    FAELLE.normalisierung.forEach(function (f) {
      var n = P.normalisiere(f.eingabe);
      var ok = n === f.erwartet;
      melde(ok, "Normalisierung „" + f.eingabe + "“ → „" + n + "“" + (ok ? "" : "  ERWARTET: „" + f.erwartet + "“"));
    });

    // Jede Frage muss ihre eigene Antwort und alle eigenen Varianten akzeptieren
    FRAGEN.forEach(function (q) {
      [q.antwort].concat(q.varianten || []).forEach(function (v) {
        var erg = P.pruefeAntwort(q, [v]);
        if (!erg.richtig) melde(false, "Selbsttest " + q.id + ": eigene Variante „" + v + "“ wird nicht akzeptiert");
      });
    });
    melde(true, "Selbsttest: alle " + FRAGEN.length + " Fragen akzeptieren ihre eigenen Antworten und Varianten");

    var fehler = details.filter(function (d) { return !d.ok; }).length;
    return { ok: details.length - fehler, fehler: fehler, details: details };
  }

  var Tests = { laufeTests: laufeTests };
  if (typeof module !== "undefined" && module.exports) module.exports = Tests;
  if (root) root.SchlaumobilTests = Tests;
})(typeof window !== "undefined" ? window : this);
