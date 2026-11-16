/*
 * Antwortprüfung für Schlaumobil – das Herzstück.
 * Funktioniert im Browser (window.Pruefung) und in Node (require).
 *
 *   Pruefung.normalisiere(text)            → "karl grosse"
 *   Pruefung.erkenneBefehl(text)           → "stopp" | "nochmal" | "weissnicht" | "weiter" | "pause" | null
 *   Pruefung.pruefeAntwort(frage, [texte]) → { richtig, art, treffer, erkannt }
 */
(function (root) {
  "use strict";

  // ---------- Zahlwörter ----------
  var EINER = {
    null: 0, eins: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
    zehn: 10, elf: 11, zwoelf: 12, dreizehn: 13, vierzehn: 14, fuenfzehn: 15, sechzehn: 16,
    siebzehn: 17, achtzehn: 18, neunzehn: 19
  };
  var ZEHNER = {
    zwanzig: 20, dreissig: 30, vierzig: 40, fuenfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90
  };
  var EINER_KOMBI = { ein: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
  var ORDINAL = {
    erste: 1, erster: 1, ersten: 1, erstes: 1, zweite: 2, zweiter: 2, zweiten: 2, zweites: 2,
    dritte: 3, dritter: 3, dritten: 3, drittes: 3, vierte: 4, vierter: 4, vierten: 4,
    fuenfte: 5, fuenfter: 5, fuenften: 5, sechste: 6, sechster: 6, sechsten: 6,
    siebte: 7, siebter: 7, siebten: 7, ii: 2, iii: 3
  };

  function unter100(w) {
    if (Object.prototype.hasOwnProperty.call(EINER, w)) return EINER[w];
    if (Object.prototype.hasOwnProperty.call(ZEHNER, w)) return ZEHNER[w];
    var m = /^(ein|zwei|drei|vier|fuenf|sechs|sieben|acht|neun)und(zwanzig|dreissig|vierzig|fuenfzig|sechzig|siebzig|achtzig|neunzig)$/.exec(w);
    if (m) return EINER_KOMBI[m[1]] + ZEHNER[m[2]];
    return null;
  }

  function teile(w, wort, faktor, links, rechts) {
    var i = w.indexOf(wort);
    if (i < 0) return null;
    var l = w.slice(0, i), r = w.slice(i + wort.length);
    var lv = 1;
    if (l) {
      lv = l === "ein" ? 1 : links(l);
      if (lv === null || lv < 1) return null;
    }
    if (r.indexOf("und") === 0) r = r.slice(3);
    var rv = 0;
    if (r) {
      rv = rechts(r);
      if (rv === null) return null;
    }
    return lv * faktor + rv;
  }

  function unter1000(w) {
    if (w.indexOf("hundert") < 0) return unter100(w);
    return teile(w, "hundert", 100, unter100, unter100);
  }

  /** Wandelt ein (bereits normalisiertes) deutsches Zahlwort in eine Zahl um, sonst null. */
  function zahlwort(w) {
    if (!w) return null;
    if (w.indexOf("tausend") < 0) return unter1000(w);
    return teile(w, "tausend", 1000, unter1000, unter1000);
  }

  // ---------- Füllwörter ----------
  var FUELLWOERTER = {};
  ("der die das den dem des ein eine einen einem einer eines the a an " +
   "aeh aehm aehmm aehh ehm hm hmm hmmm mh mhm oeh also ja na nun ok okay ach " +
   "ich glaube glaub denke meine wuerde sagen sag tippe tipp vielleicht wahrscheinlich vermutlich bestimmt " +
   "es ist war waren sind sein muss muesste koennte wohl heisst hiess lautet antwort bitte mal doch eigentlich halt schon " +
   "von van de im jahr jahre prozent grad"
  ).split(" ").forEach(function (w) { if (w) FUELLWOERTER[w] = true; });

  var ERSETZUNGEN = { st: "sankt" };

  /**
   * Normalisiert einen Text für den Vergleich.
   * optionen.fuellwoerter (Standard true): Artikel & Füllwörter entfernen
   * optionen.zahlen (Standard true): Zahlwörter in Ziffern umwandeln
   */
  function normalisiere(text, optionen) {
    optionen = optionen || {};
    var mitFuell = optionen.fuellwoerter !== false;
    var mitZahlen = optionen.zahlen !== false;

    var s = String(text == null ? "" : text).toLowerCase();
    s = s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
    if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    s = s.replace(/(\d)[.’'](?=\d{3}(\D|$))/g, "$1"); // 1.000 → 1000
    s = s.replace(/[-‐-―_/]/g, " ");
    s = s.replace(/[^a-z0-9 ]+/g, " ");

    var roh = s.split(/\s+/).filter(Boolean);
    var tokens = [];
    for (var i = 0; i < roh.length; i++) {
      var t = roh[i];
      if (Object.prototype.hasOwnProperty.call(ERSETZUNGEN, t)) t = ERSETZUNGEN[t];
      // Ziffern und Buchstaben trennen, z. B. "11er" bleibt, aber "co2" bleibt auch zusammen
      if (mitZahlen) {
        var zahl = null;
        if (Object.prototype.hasOwnProperty.call(ORDINAL, t)) zahl = ORDINAL[t];
        else zahl = zahlwort(t);
        if (zahl !== null) {
          var vorher = tokens.length ? tokens[tokens.length - 1] : null;
          // Zahlwörter verbinden: "neunzehnhundert neunundachtzig", "zwei tausend"
          if (vorher && vorher.ausWort) {
            var p = vorher.wert;
            if ((zahl === 100 || zahl === 1000) && p < zahl) { vorher.wert = p * zahl; continue; }
            if (p >= 100 && p % 100 === 0 && zahl < 100) { vorher.wert = p + zahl; continue; }
            if (p >= 1000 && p % 1000 === 0 && zahl < 1000) { vorher.wert = p + zahl; continue; }
          }
          tokens.push({ wert: zahl, ausWort: true });
          continue;
        }
      }
      tokens.push({ wort: t });
    }

    var aus = [];
    for (var j = 0; j < tokens.length; j++) {
      var tok = tokens[j];
      if (tok.wort !== undefined) {
        if (mitFuell && FUELLWOERTER[tok.wort]) continue;
        aus.push(tok.wort);
      } else {
        aus.push(String(tok.wert));
      }
    }
    return aus.join(" ");
  }

  // ---------- Levenshtein ----------
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var vorher = new Array(b.length + 1), aktuell = new Array(b.length + 1);
    for (var j = 0; j <= b.length; j++) vorher[j] = j;
    for (var i = 1; i <= a.length; i++) {
      aktuell[0] = i;
      for (var k = 1; k <= b.length; k++) {
        var kosten = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
        aktuell[k] = Math.min(vorher[k] + 1, aktuell[k - 1] + 1, vorher[k - 1] + kosten);
      }
      var tmp = vorher; vorher = aktuell; aktuell = tmp;
    }
    return vorher[b.length];
  }

  function enthaeltWortfolge(text, teil) {
    if (!text || !teil) return false;
    return (" " + text + " ").indexOf(" " + teil + " ") >= 0;
  }

  function hatZiffer(s) { return /\d/.test(s); }
  function zifferTokens(tokens) { return tokens.filter(hatZiffer).join(" "); }

  /**
   * Kölner Phonetik: ein Lautcode für deutsche Wörter.
   * "Canberra" und "Kanberra" ergeben denselben Code, "Darwin" und "Dublin" nicht.
   */
  function koelnerPhonetik(wort) {
    var s = String(wort).replace(/[^a-z]/g, "");
    var codes = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i), vor = i > 0 ? s.charAt(i - 1) : "", nach = i + 1 < s.length ? s.charAt(i + 1) : "";
      var code;
      if ("aeijouy".indexOf(c) >= 0) code = "0";
      else if (c === "h") code = "";
      else if (c === "b") code = "1";
      else if (c === "p") code = nach === "h" ? "3" : "1";
      else if (c === "d" || c === "t") code = (nach && "csz".indexOf(nach) >= 0) ? "8" : "2";
      else if ("fvw".indexOf(c) >= 0) code = "3";
      else if ("gkq".indexOf(c) >= 0) code = "4";
      else if (c === "c") {
        if (i === 0) code = (nach && "ahkloqrux".indexOf(nach) >= 0) ? "4" : "8";
        else code = (nach && "ahkoqux".indexOf(nach) >= 0 && "sz".indexOf(vor) < 0) ? "4" : "8";
      }
      else if (c === "x") code = (vor && "ckq".indexOf(vor) >= 0) ? "8" : "48";
      else if (c === "l") code = "5";
      else if (c === "m" || c === "n") code = "6";
      else if (c === "r") code = "7";
      else if (c === "s" || c === "z") code = "8";
      else code = "";
      codes.push(code);
    }
    var roh = codes.join("");
    var aus = "";
    for (var j = 0; j < roh.length; j++) {
      if (j > 0 && roh.charAt(j) === roh.charAt(j - 1)) continue;
      aus += roh.charAt(j);
    }
    return aus.charAt(0) + aus.slice(1).replace(/0/g, "");
  }

  /**
   * Unscharfer Vergleich für Hörfehler der Spracherkennung.
   * - verglichen wird die ganze Äußerung (ohne Füllwörter) mit der Antwort, Leerzeichen egal ("Kan Berra")
   * - Levenshtein ≤ 1 bei Antworten bis 5 Zeichen, ≤ 2 bei längeren
   * - Zahlen müssen exakt stimmen
   * - zusätzlich muss es ähnlich KLINGEN (Kölner Phonetik), damit z. B. "Darwin" nicht als "Dublin" durchgeht
   */
  function unscharfGleich(aeusserung, kandidat) {
    var u = aeusserung.split(" ").filter(Boolean);
    var k = kandidat.split(" ").filter(Boolean);
    if (!u.length || !k.length) return false;
    if (zifferTokens(u) !== zifferTokens(k)) return false;
    var kText = k.filter(function (t) { return !hatZiffer(t); }).join("");
    var uText = u.filter(function (t) { return !hatZiffer(t); }).join("");
    if (!kText || uText.length < 2) return false; // reine Zahlen: nur exakt
    var grenze = kText.length <= 5 ? 1 : 2;
    if (kText.length <= 3 && uText.charAt(0) !== kText.charAt(0)) return false;
    if (Math.abs(uText.length - kText.length) > grenze) return false;
    if (levenshtein(uText, kText) > grenze) return false;
    var pu = koelnerPhonetik(uText), pk = koelnerPhonetik(kText);
    if (pu === pk) return true;
    return kText.length >= 8 && levenshtein(pu, pk) <= 1;
  }

  function eindeutig(liste) {
    var gesehen = {}, aus = [];
    for (var i = 0; i < liste.length; i++) {
      var x = liste[i];
      if (x && !gesehen[x]) { gesehen[x] = true; aus.push(x); }
    }
    return aus;
  }

  function kandidatenFuer(frage) {
    var roh = [frage.antwort].concat(frage.varianten || []);
    var liste = [];
    for (var i = 0; i < roh.length; i++) {
      var n = normalisiere(roh[i]);
      if (!n) n = normalisiere(roh[i], { fuellwoerter: false }); // falls die Antwort nur aus "Füllwörtern" besteht
      liste.push(n);
    }
    return eindeutig(liste);
  }

  /**
   * Prüft eine oder mehrere erkannte Äußerungen (Alternativen der Spracherkennung).
   * Reihenfolge: exakt → Ausschluss (ähnlich klingende falsche Antwort) → enthalten → unscharf.
   */
  function pruefeAntwort(frage, alternativen) {
    if (typeof alternativen === "string") alternativen = [alternativen];
    alternativen = (alternativen || []).filter(function (a) { return a && String(a).trim(); });
    var kandidaten = kandidatenFuer(frage);
    var ausschluss = eindeutig((frage.ausschluss || []).map(function (a) { return normalisiere(a); }));
    var norm = eindeutig(alternativen.map(function (a) { return normalisiere(a); }));
    var ergebnis = { richtig: false, art: null, treffer: null, erkannt: alternativen[0] || "" };

    var i, j;
    // 1. exakt
    for (i = 0; i < norm.length; i++) {
      for (j = 0; j < kandidaten.length; j++) {
        if (norm[i] === kandidaten[j]) return { richtig: true, art: "exakt", treffer: alternativen[i] || norm[i], erkannt: ergebnis.erkannt };
      }
    }
    // 2. Ausschluss – nur für die beste Alternative und nur, wenn sie keine richtige Antwort enthält
    var gesperrt = false;
    if (norm.length) {
      for (j = 0; j < ausschluss.length; j++) {
        if (norm[0] === ausschluss[j] || enthaeltWortfolge(norm[0], ausschluss[j])) { gesperrt = true; break; }
      }
    }
    if (gesperrt) return ergebnis;
    // 3. enthalten als ganzes Wort bzw. ganze Wortfolge ("ich glaube canberra")
    for (i = 0; i < norm.length; i++) {
      var istAusgeschlossen = ausschluss.some(function (a) { return norm[i] === a || enthaeltWortfolge(norm[i], a); });
      if (istAusgeschlossen) continue;
      for (j = 0; j < kandidaten.length; j++) {
        if (enthaeltWortfolge(norm[i], kandidaten[j])) return { richtig: true, art: "enthalten", treffer: alternativen[i], erkannt: ergebnis.erkannt };
      }
    }
    // 4. unscharf (Hörfehler)
    if (!frage.exakt) {
      for (i = 0; i < norm.length; i++) {
        var gesperrtAlt = ausschluss.some(function (a) { return norm[i] === a || enthaeltWortfolge(norm[i], a); });
        if (gesperrtAlt) continue;
        for (j = 0; j < kandidaten.length; j++) {
          if (unscharfGleich(norm[i], kandidaten[j])) return { richtig: true, art: "unscharf", treffer: alternativen[i], erkannt: ergebnis.erkannt };
        }
      }
    }
    return ergebnis;
  }

  // ---------- Sprachbefehle ----------
  var BEFEHLE = [
    ["stopp", ["stopp", "stop", "stoppen", "stoppe", "ende", "beenden", "beende", "aufhoeren", "schluss", "schluss jetzt", "fahrt beenden", "quiz beenden"]],
    ["nochmal", ["nochmal", "noch mal", "noch einmal", "nochmals", "wiederholen", "wiederhole", "wiederholung", "wie bitte", "frage wiederholen", "bitte wiederholen", "was hast du gesagt"]],
    ["weissnicht", ["weiss nicht", "weiss ich nicht", "weiss es nicht", "weiss leider nicht", "weiss ich leider nicht", "weiss das nicht",
                    "keine ahnung", "null ahnung", "keinen plan", "keine idee", "aufloesen", "aufloesung", "loesung", "passe", "passen",
                    "sag es mir", "sags mir", "verrat es mir"]],
    ["weiter", ["weiter", "ueberspringen", "uberspringen", "naechste", "naechste frage", "nachste", "skip", "andere frage"]],
    ["pause", ["pause", "pausieren", "mach pause", "pause machen", "kurze pause"]]
  ];
  var VORSPANN = { ich: 1, also: 1, aeh: 1, aehm: 1, ehm: 1, hm: 1, hmm: 1, okay: 1, ok: 1, na: 1, ja: 1, bitte: 1, jetzt: 1, dann: 1, oh: 1, och: 1, ach: 1, nee: 1, nein: 1 };

  /** Erkennt einen Sprachbefehl – nur wenn die Äußerung ein Befehl ist oder damit beginnt. */
  function erkenneBefehl(text) {
    var s = normalisiere(text, { fuellwoerter: false, zahlen: false });
    if (!s) return null;
    var t = s.split(" ");
    while (t.length > 1 && VORSPANN[t[0]]) t.shift();
    s = t.join(" ");
    for (var i = 0; i < BEFEHLE.length; i++) {
      var phrasen = BEFEHLE[i][1];
      for (var j = 0; j < phrasen.length; j++) {
        var p = phrasen[j];
        if (s === p || s.indexOf(p + " ") === 0) return BEFEHLE[i][0];
      }
    }
    return null;
  }

  var Pruefung = {
    normalisiere: normalisiere,
    zahlwort: zahlwort,
    levenshtein: levenshtein,
    unscharfGleich: unscharfGleich,
    koelnerPhonetik: koelnerPhonetik,
    pruefeAntwort: pruefeAntwort,
    erkenneBefehl: erkenneBefehl
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Pruefung;
  if (root) root.Pruefung = Pruefung;
})(typeof window !== "undefined" ? window : this);
