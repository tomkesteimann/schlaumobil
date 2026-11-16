/*
 * Zentrale Konfiguration von Schlaumobil.
 * Hier kannst du den Namen der App ändern – zusätzlich auch in
 * manifest.webmanifest ("name" und "short_name") und im <title> von index.html.
 */
window.APP_CONFIG = {
  name: "Schlaumobil",
  untertitel: "Allgemeinwissen fürs Auto",
  version: "1.0.0",
  speicherPraefix: "schlaumobil",

  // Standard-Einstellungen
  standard: {
    stimme: "",              // leer = beste deutsche Stimme automatisch wählen
    tempo: 1.0,              // 0,8 bis 1,2
    antwortzeit: 8,          // Sekunden ab dem Piepton (5 bis 15)
    funfactBeiRichtig: false,
    hoermodus: false,        // ohne Mikro: Frage → Denkpause → Lösung
    denkpause: 6,            // Sekunden im Hörmodus
    sounds: true
  },

  // Kategorien mit Farben (hell = Startseite, dunkel = Fahrt-Screen bei Nacht)
  kategorien: [
    { id: "gemischt", name: "Alles gemischt", gesprochen: "", emoji: "🎲",
      hell: ["#7c3aed", "#db2777"], dunkel: ["#1d1535", "#2b1230"], akzent: "#d8b4fe" },
    { id: "geografie", name: "Geografie & Hauptstädte", kurz: "Geografie", gesprochen: "Geografie", emoji: "🌍",
      hell: ["#059669", "#0d9488"], dunkel: ["#0a2420", "#0a1e24"], akzent: "#6ee7b7" },
    { id: "geschichte", name: "Geschichte & Politik", kurz: "Geschichte", gesprochen: "Geschichte", emoji: "🏛️",
      hell: ["#ea6a0b", "#c2410c"], dunkel: ["#2a1a0c", "#26120b"], akzent: "#fcd34d" },
    { id: "wissenschaft", name: "Wissenschaft & Natur", kurz: "Wissenschaft", gesprochen: "Wissenschaft", emoji: "🔬",
      hell: ["#2563eb", "#0891b2"], dunkel: ["#0c1a33", "#0a2230"], akzent: "#93c5fd" },
    { id: "popkultur", name: "Sport, Musik & Popkultur", kurz: "Sport & Pop", gesprochen: "Sport und Popkultur", emoji: "🎤",
      hell: ["#e11d48", "#c026d3"], dunkel: ["#2a0e1b", "#260f2c"], akzent: "#f9a8d4" }
  ]
};
