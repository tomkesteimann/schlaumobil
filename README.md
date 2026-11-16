# Schlaumobil 🚗💡

Ein Allgemeinwissen-Quiz per Sprache fürs Auto. Die App liest dir Fragen vor, du antwortest laut,
sie prüft deine Antwort per Spracherkennung und sagt dir, ob sie richtig war. Ist sie falsch,
nennt sie die Lösung plus einen kurzen Fun Fact. Das Quiz läuft endlos, bis du „Stopp“ sagst.

**Adresse:** https://tomkesteimann.github.io/schlaumobil/

## Was die App kann

- **200 Fragen** in vier Kategorien: Geografie & Hauptstädte, Geschichte & Politik,
  Wissenschaft & Natur, Sport, Musik & Popkultur – oder alles gemischt.
- **Freihändig:** ein Tipp zum Start, danach läuft alles per Sprache.
- **Sprachbefehle:** „Stopp“ · „Nochmal“ / „Wie bitte“ · „Weiß nicht“ / „Keine Ahnung“ ·
  „Weiter“ / „Überspringen“ · „Pause“.
- **Tolerante Antwortprüfung:** versteht „ich glaube Canberra“, Zahlwörter („neunzehnhundertneunundachtzig“),
  Varianten und kleine Hörfehler – aber keine ähnlich klingenden falschen Antworten (Bukarest ≠ Budapest).
- **Lernlogik:** falsche Fragen kommen in derselben Fahrt ca. 10 Fragen später wieder und bei der
  nächsten Fahrt zuerst. Jede Frage hat eine Lernstufe 0–4; Stufe 4 = gemeistert.
- **Hörmodus** ohne Mikro: Frage → Denkpause → Lösung. Springt automatisch an, wenn im Funkloch
  dreimal hintereinander die Spracherkennung ausfällt.
- **Pause:** Nach 3 Fragen ohne Antwort macht die App Pause und wartet bis zu 10 Minuten auf „weiter“.
- **Ergebnis-Screen** mit allen falschen Fragen und dem Knopf „War doch richtig“ für falsch verstandene Antworten.
- **Technik-Check** für Ton, Mikro, Bildschirm und Umgebung – mit Lösungen auf Deutsch.
- **Protokoll** der letzten 50 Erkennungen zum Kopieren (Einstellungen → Protokoll).
- Läuft **offline** aus dem Cache, Fortschritt bleibt auf dem Handy gespeichert.

## So kommt die App aufs iPhone

1. Öffne auf dem iPhone **Safari** und rufe die Adresse oben auf.
2. Tippe auf das **Teilen-Symbol** (Quadrat mit Pfeil nach oben) → **„Zum Home-Bildschirm“**.
3. Steht dort ein Schalter **„Als Web-App öffnen“**: **ausschalten**. So öffnet das Symbol die App
   in Safari – dort funktioniert die Spracherkennung am zuverlässigsten. Dann **„Hinzufügen“**.
4. Öffne die App über das neue Symbol. Beim ersten Start fragt Safari nach dem **Mikrofon** und
   der **Spracherkennung** → beide Male **„Erlauben“**.
5. Damit Safari nicht jedes Mal fragt: In Safari links in der Adressleiste auf das Seiten-Symbol
   (z. B. „aA“) tippen → **Website-Einstellungen** → **Mikrofon: Erlauben**.
6. Mach einmal den **Technik-Check** (unten auf der Startseite) – am besten im Auto mit Bluetooth.

Voraussetzung: **Siri bzw. Diktieren** muss eingeschaltet sein (Einstellungen-App → Siri bzw.
Allgemein → Tastatur → Diktierfunktion; die Bezeichnungen unterscheiden sich je nach iOS-Version leicht).

## Vor der Fahrt

- Handy in die Halterung, Bluetooth verbinden, App öffnen, eine Karte antippen – fertig.
- Während der Fahrt nichts antippen. Die App muss im Vordergrund bleiben (ein Navi darf im Hintergrund laufen).
- Kommt ein Anruf oder wechselst du die App, pausiert die Fahrt. Danach einfach auf „Weiter“ tippen.

## Wenn etwas nicht klappt: Protokoll schicken

Einstellungen → **Protokoll kopieren** → in eine Nachricht an Claude einfügen. Darin steht für jede
Frage, was die Spracherkennung verstanden hat, wie gewertet wurde und welche Fehlercodes auftraten.

## Fragen ergänzen oder ändern

Alle Fragen stehen in **`fragen.js`**. Eine Frage sieht so aus:

```js
{ id: "geo-051", kategorie: "geografie", schwierigkeit: 2,
  frage: "Wie heißt die Hauptstadt von Australien?",
  antwort: "Canberra",
  varianten: ["canberra", "kanberra"],
  ausschluss: ["sydney"],          // optional: ähnlich klingende falsche Antworten
  funfact: "Canberra wurde als Kompromiss gebaut, weil sich Sydney und Melbourne nicht einigen konnten." }
```

- `kategorie`: `geografie`, `geschichte`, `wissenschaft` oder `popkultur`
- `schwierigkeit`: 1 = leicht, 2 = mittel, 3 = schwer
- `varianten`: alle sinnvollen gesprochenen Formen (Zahlwort und Ziffer, Nachname, englischer Name …)
- `funfact`: ein Satz, höchstens 25 Wörter

Danach prüfen (im Terminal im Projektordner):

```bash
node tools/pruefe-fragen.js
```

Das Prüfskript erwartet genau 200 Fragen (50 pro Kategorie). Wenn du mehr Fragen willst,
passe die Zahlen oben in `tools/datenbank.js` an (`GESAMT`, `PRO_KATEGORIE`).

## Änderungen veröffentlichen

Im Terminal im Projektordner:

```bash
git add -A
```

```bash
git commit -m "Neue Fragen"
```

```bash
git push
```

Nach 1–2 Minuten ist die neue Version online. Auf dem iPhone die App einmal neu öffnen –
die neuen Dateien werden automatisch geladen. (Oder einfach Claude bitten, das zu erledigen.)

## Name ändern

Der Name steht zentral in **`config.js`** (`name`). Damit er auch beim Home-Bildschirm-Symbol
stimmt, zusätzlich in `manifest.webmanifest` (`name`, `short_name`) und im `<title>` sowie
`apple-mobile-web-app-title` in `index.html` ändern.

## Für Entwickler

| Datei | Inhalt |
| --- | --- |
| `index.html`, `style.css` | Oberfläche |
| `app.js` | Sprachausgabe, Spracherkennung, Fahrt-Ablauf, Lernlogik, Einstellungen, Technik-Check |
| `pruefung.js` | Antwortprüfung (Normalisierung, Zahlwörter, Levenshtein, Kölner Phonetik, Befehle) |
| `fragen.js` | die 200 Fragen |
| `config.js` | Name, Standard-Einstellungen, Kategorien & Farben |
| `sw.js` | Service Worker (network-first, Offline-Cache) |
| `tests.html`, `tests/` | Tests der Antwortprüfung im Browser bzw. mit Node |
| `tools/` | Prüfskript für die Fragen, Icon-Generator |

Tests ausführen:

```bash
node tests/pruefung.test.js
```

Im Browser: `tests.html` öffnen. Debug-Modus mit Texteingabe statt Mikro: `?debug=1`
(zusätzlich `&schnell=1` überspringt die Sprachausgabe). Die App startet auch per Doppelklick
auf `index.html` am Mac (dann ohne Offline-Cache).

## Bekannte Einschränkungen

- Die Spracherkennung von Safari braucht meist Internet; im Funkloch wechselt die App in den Hörmodus.
- In Web-Apps, die mit „Als Web-App öffnen“ zum Home-Bildschirm hinzugefügt wurden, ist die
  Spracherkennung laut WebKit nicht (zuverlässig) verfügbar – deshalb die Safari-Variante.
- Über Bluetooth kann iOS beim Einschalten des Mikros in den Freisprech-Modus wechseln; dann klingt
  die Stimme kurz anders oder das Autoradio schaltet auf „Telefon“.
- Die App muss im Vordergrund bleiben; mit gesperrtem Bildschirm funktioniert sie nicht.
