/*
 * Testfälle für die Antwortprüfung – werden von Node (tests/pruefung.test.js)
 * und vom Browser (tests.html) gleichermaßen benutzt.
 *
 * antworten:   { frage: "<id>", eingabe: "text" oder ["alt1", "alt2"], erwartet: true/false, info }
 * befehle:     { eingabe: "text", erwartet: "stopp" | "nochmal" | "weissnicht" | "weiter" | "pause" | null }
 * normalisierung: { eingabe: "text", erwartet: "normalisiert" }
 */
var TESTFAELLE = {
  antworten: [
    // Grundfälle & Varianten
    { frage: "geo-021", eingabe: "Canberra", erwartet: true, info: "exakte Antwort" },
    { frage: "geo-021", eingabe: "Kanberra", erwartet: true, info: "Variante aus der Datenbank" },
    { frage: "geo-021", eingabe: "Sydney", erwartet: false, info: "falsche Stadt" },
    { frage: "geo-021", eingabe: "Melbourne", erwartet: false, info: "falsche Stadt" },
    { frage: "geo-031", eingabe: "Prague", erwartet: true, info: "englischer Name" },
    { frage: "pop-009", eingabe: "Die Simpsons", erwartet: true, info: "mit Artikel" },
    { frage: "geo-030", eingabe: "Reykjavík", erwartet: true, info: "Akzent wird entfernt" },
    { frage: "pop-034", eingabe: "Wetten, dass..?", erwartet: true, info: "Satzzeichen werden ignoriert" },
    { frage: "geo-009", eingabe: "New York City", erwartet: true, info: "Langform" },
    { frage: "ges-044", eingabe: "St. Helena", erwartet: true, info: "Abkürzung St." },
    { frage: "ges-013", eingabe: "Deutsche Mark", erwartet: true, info: "Langform D-Mark" },
    { frage: "ges-013", eingabe: "D-Mark", erwartet: true, info: "Bindestrich" },
    { frage: "ges-013", eingabe: "Reichsmark", erwartet: false, info: "andere Währung" },
    // Artikel & Füllwörter
    { frage: "geo-021", eingabe: "ich glaube Canberra", erwartet: true, info: "ich glaube …" },
    { frage: "geo-031", eingabe: "Ähm, ich denke Prag", erwartet: true, info: "ähm, ich denke …" },
    { frage: "geo-014", eingabe: "Das ist die Elbe", erwartet: true, info: "das ist die …" },
    { frage: "ges-012", eingabe: "der Bundestag", erwartet: true, info: "mit Artikel" },
    { frage: "ges-021", eingabe: "Karl der Große", erwartet: true, info: "Artikel in der Antwort selbst" },
    { frage: "ges-021", eingabe: "Karl Marx", erwartet: false, info: "falscher Karl" },
    // Zahlwörter vs. Ziffern
    { frage: "ges-001", eingabe: "1989", erwartet: true, info: "Ziffern" },
    { frage: "ges-001", eingabe: "neunzehnhundertneunundachtzig", erwartet: true, info: "Jahreszahl als ein Wort" },
    { frage: "ges-001", eingabe: "neunzehnhundert neunundachtzig", erwartet: true, info: "Jahreszahl in zwei Wörtern" },
    { frage: "ges-001", eingabe: "im Jahr 1989", erwartet: true, info: "im Jahr …" },
    { frage: "ges-001", eingabe: "1988", erwartet: false, info: "Zahl muss exakt stimmen" },
    { frage: "ges-001", eingabe: "neunzehnhundertachtundachtzig", erwartet: false, info: "Zahlwort knapp daneben" },
    { frage: "wis-002", eingabe: "acht", erwartet: true, info: "Zahlwort" },
    { frage: "wis-002", eingabe: "Acht Beine", erwartet: true, info: "Zahl mit Einheit" },
    { frage: "wis-002", eingabe: "sechs", erwartet: false, info: "falsche Zahl" },
    { frage: "ges-041", eingabe: "hundertsechzehn", erwartet: true, info: "hundert…" },
    { frage: "ges-041", eingabe: "einhundertsechzehn", erwartet: true, info: "einhundert…" },
    { frage: "ges-041", eingabe: "hundertfünfzehn", erwartet: false, info: "um eins daneben" },
    { frage: "ges-048", eingabe: "siebenhundertdreiundfünfzig", erwartet: true, info: "dreistellig mit und" },
    { frage: "pop-002", eingabe: "zweitausendvierzehn", erwartet: true, info: "tausend…" },
    { frage: "pop-001", eingabe: "elf", erwartet: true, info: "elf → 11" },
    { frage: "pop-001", eingabe: "11 Spieler", erwartet: true, info: "Zahl mit Wort" },
    { frage: "wis-040", eingabe: "siebzig Prozent", erwartet: true, info: "erlaubte Rundung" },
    { frage: "wis-040", eingabe: "80", erwartet: false, info: "falsche Zahl" },
    { frage: "wis-045", eingabe: "null negativ", erwartet: true, info: "null → 0" },
    { frage: "wis-045", eingabe: "null positiv", erwartet: false, info: "ähnlich, aber falsch" },
    { frage: "ges-025", eingabe: "Ludwig der Zweite", erwartet: true, info: "Ordnungszahl als Wort" },
    { frage: "ges-025", eingabe: "Ludwig II.", erwartet: true, info: "römische Zahl" },
    { frage: "ges-025", eingabe: "Ludwig der Erste", erwartet: false, info: "falscher Ludwig" },
    { frage: "ges-032", eingabe: "Wilhelm der Erste", erwartet: false, info: "falscher Wilhelm" },
    { frage: "ges-035", eingabe: "Apollo elf", erwartet: true, info: "Zahl in Namen" },
    { frage: "ges-035", eingabe: "Apollo 13", erwartet: false, info: "Zahl in Namen muss stimmen" },
    // Erkennungsfehler (unscharf)
    { frage: "geo-021", eingabe: "Cambera", erwartet: true, info: "Hörfehler, 2 Buchstaben" },
    { frage: "geo-039", eingabe: "Budapesst", erwartet: true, info: "Hörfehler, 1 Buchstabe" },
    { frage: "pop-031", eingabe: "Bethofen", erwartet: true, info: "Hörfehler bei langem Namen" },
    { frage: "geo-049", eingabe: "Lesotto", erwartet: true, info: "Hörfehler" },
    { frage: "geo-021", eingabe: ["Kanne Berra", "Canberra"], erwartet: true, info: "zweite Alternative der Erkennung passt" },
    // ähnlich klingende falsche Antworten
    { frage: "geo-039", eingabe: "Bukarest", erwartet: false, info: "Bukarest ≠ Budapest" },
    { frage: "geo-005", eingabe: "Amerika", erwartet: false, info: "Amerika ≠ Afrika" },
    { frage: "geo-024", eingabe: "Brasilien", erwartet: false, info: "Land statt Hauptstadt" },
    { frage: "wis-009", eingabe: "Leopard", erwartet: false, info: "Leopard ≠ Gepard" },
    { frage: "ges-012", eingabe: "Bundesrat", erwartet: false, info: "Bundesrat ≠ Bundestag" },
    { frage: "wis-025", eingabe: "Vitamin B", erwartet: false, info: "Vitamin B ≠ D" },
    { frage: "pop-022", eingabe: "Paraguay", erwartet: false, info: "Paraguay ≠ Uruguay" },
    { frage: "pop-036", eingabe: "Nena", erwartet: false, info: "Nena ≠ Lena" },
    { frage: "wis-003", eingabe: "Sauerstoff", erwartet: false, info: "Sauerstoff ≠ Kohlendioxid" },
    { frage: "wis-003", eingabe: "CO2", erwartet: true, info: "Formel" },
    { frage: "wis-003", eingabe: "CO zwei", erwartet: true, info: "Formel gesprochen" },
    { frage: "wis-001", eingabe: "Mars", erwartet: false, info: "falscher Planet" },
    { frage: "pop-041", eingabe: "Raphael", erwartet: false, info: "Raphael ≠ Ravel" },
    { frage: "ges-044", eingabe: "Elba", erwartet: false, info: "Elba ≠ Sankt Helena" },
    { frage: "pop-012", eingabe: "Superman", erwartet: false, info: "falscher Held" },
    { frage: "geo-016", eingabe: "Darwin", erwartet: false, info: "ähnliche Buchstaben, klingt aber anders" },
    { frage: "geo-036", eingabe: "Ankara", erwartet: false, info: "Ankara ≠ Andorra" },
    { frage: "geo-044", eingabe: "Tetris", erwartet: false, info: "Tetris ≠ Tigris" },
    { frage: "ges-004", eingabe: "Titan", erwartet: false, info: "Titan ≠ Titanic" },
    { frage: "ges-015", eingabe: "Martin Luther King", erwartet: false, info: "falscher Martin Luther" },
    { frage: "pop-016", eingabe: "Marie Curie", erwartet: false, info: "Teilwort-Treffer zählt nicht" },
    { frage: "geo-021", eingabe: "das müsste Cambera sein", erwartet: true, info: "Hörfehler mitten im Satz" }
  ],

  befehle: [
    { eingabe: "Stopp", erwartet: "stopp" },
    { eingabe: "Stop bitte", erwartet: "stopp" },
    { eingabe: "Ende", erwartet: "stopp" },
    { eingabe: "Beenden", erwartet: "stopp" },
    { eingabe: "Nochmal bitte", erwartet: "nochmal" },
    { eingabe: "Wie bitte?", erwartet: "nochmal" },
    { eingabe: "Wiederholen", erwartet: "nochmal" },
    { eingabe: "Ich weiß nicht", erwartet: "weissnicht" },
    { eingabe: "Weiß ich nicht", erwartet: "weissnicht" },
    { eingabe: "Keine Ahnung", erwartet: "weissnicht" },
    { eingabe: "Auflösen", erwartet: "weissnicht" },
    { eingabe: "Ich passe", erwartet: "weissnicht" },
    { eingabe: "Weiter", erwartet: "weiter" },
    { eingabe: "Überspringen", erwartet: "weiter" },
    { eingabe: "Nächste Frage", erwartet: "weiter" },
    { eingabe: "Pause", erwartet: "pause" },
    { eingabe: "Canberra", erwartet: null, info: "Antwort, kein Befehl" },
    { eingabe: "Weimar", erwartet: null, info: "klingt wie weiter, ist aber eine Antwort" },
    { eingabe: "Kannst du das wiederholen", erwartet: null, info: "beginnt nicht mit Befehl" },
    { eingabe: "Ich glaube Ende des Krieges", erwartet: null, info: "Befehlswort mitten im Satz" },
    { eingabe: "Pompeji", erwartet: null, info: "Antwort" }
  ],

  normalisierung: [
    { eingabe: "Ähm, ich glaube: Köln!", erwartet: "koeln" },
    { eingabe: "Café Größe", erwartet: "cafe groesse" },
    { eingabe: "neunzehnhundertneunundachtzig", erwartet: "1989" },
    { eingabe: "Ludwig II.", erwartet: "ludwig 2" },
    { eingabe: "Es ist die Straße von Gibraltar", erwartet: "strasse gibraltar" },
    { eingabe: "zweitausendvierzehn", erwartet: "2014" },
    { eingabe: "1.000", erwartet: "1000" }
  ]
};

if (typeof module !== "undefined" && module.exports) module.exports = TESTFAELLE;
if (typeof window !== "undefined") window.TESTFAELLE = TESTFAELLE;
