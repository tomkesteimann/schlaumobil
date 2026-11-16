/*
 * Schlaumobil – App-Logik
 * Sprachausgabe, Spracherkennung, Fahrt-Ablauf, Lernlogik, Einstellungen, Technik-Check.
 * Kein Framework, keine externen Bibliotheken.
 */
(function () {
  "use strict";

  const CFG = window.APP_CONFIG;
  const P = window.Pruefung;
  const FRAGEN = window.FRAGEN;
  const params = new URLSearchParams(location.search);
  const DEBUG = params.get("debug") === "1";
  const SCHNELL = DEBUG && params.get("schnell") === "1";      // Debug: Sprachausgabe überspringen
  const DEBUG_SIM = DEBUG && params.get("mikro") !== "1";      // Debug: Texteingabe statt Mikro

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const KAT = {};
  CFG.kategorien.forEach((k) => { KAT[k.id] = k; });
  const FRAGE_NACH_ID = {};
  FRAGEN.forEach((q) => { FRAGE_NACH_ID[q.id] = q; });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const UMGEBUNG = {
    standalone: !!((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true),
    ios: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    datei: location.protocol === "file:",
    sicher: !!window.isSecureContext
  };
  let swAktiv = false;

  // ═════════ Speicher ═════════
  const SPEICHER_KEY = CFG.speicherPraefix + ".daten.v1";
  function leereDaten() {
    return { einstellungen: Object.assign({}, CFG.standard), fortschritt: {}, fahrten: 0, introGesehen: false, protokoll: [], erkennungOk: null, letzteFahrt: null };
  }
  function ladeDaten() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SPEICHER_KEY) || "null"); } catch (e) { d = null; }
    const basis = leereDaten();
    if (!d || typeof d !== "object") return basis;
    d.einstellungen = Object.assign({}, CFG.standard, d.einstellungen || {});
    d.fortschritt = d.fortschritt && typeof d.fortschritt === "object" ? d.fortschritt : {};
    d.protokoll = Array.isArray(d.protokoll) ? d.protokoll : [];
    return Object.assign(basis, d);
  }
  let daten = ladeDaten();
  let speicherWarnung = false;
  function speichere() {
    try { localStorage.setItem(SPEICHER_KEY, JSON.stringify(daten)); }
    catch (e) { if (!speicherWarnung) { speicherWarnung = true; toast("Fortschritt kann hier nicht gespeichert werden."); } }
  }
  const einst = () => daten.einstellungen;

  function protokolliere(eintrag) {
    eintrag.zeit = new Date().toISOString();
    daten.protokoll.unshift(eintrag);
    if (daten.protokoll.length > 50) daten.protokoll.length = 50;
    speichere();
    if (UI.aktuell === "einstellungen") renderProtokoll();
  }
  function systemLog(text) {
    console.warn("[Schlaumobil]", text);
    protokolliere({ art: "system", wertung: text });
  }

  // ═════════ Sprachausgabe ═════════
  const gesprochenLog = [];
  const Sprecher = {
    synth: window.speechSynthesis || null,
    stimmen: [],
    entsperrt: false,

    ladeStimmen() {
      if (!this.synth) return;
      const alle = this.synth.getVoices() || [];
      this.stimmen = alle.filter((v) => /^de([-_]|$)/i.test(v.lang || ""));
      if (UI.aktuell === "einstellungen") fuelleStimmen();
    },
    bewerte(v) {
      const n = ((v.name || "") + " " + (v.voiceURI || "")).toLowerCase();
      let p = 0;
      if (/premium/.test(n)) p += 50;
      if (/enhanced|erweitert|verbessert/.test(n)) p += 40;
      if (/siri/.test(n)) p += 20;
      if (/^de[-_]de/i.test(v.lang || "")) p += 10;
      if (/anna|helena|petra|markus|yannick|martin|viktor|katja|conrad|vicki|hedda|stefan|google deutsch/.test(n)) p += 5;
      if (/eddy|flo\b|grandma|grandpa|oma|opa|reed|rocko|sandy|shelley|eloquence|bad news|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|fred|junior|kathy|ralph/.test(n)) p -= 60;
      if (v.localService) p += 2;
      return p;
    },
    besteStimme() {
      let beste = null, punkte = -1e9;
      for (const v of this.stimmen) { const p = this.bewerte(v); if (p > punkte) { punkte = p; beste = v; } }
      return beste;
    },
    stimme() {
      if (!this.stimmen.length) this.ladeStimmen();
      const uri = einst().stimme;
      if (uri) { const v = this.stimmen.find((s) => s.voiceURI === uri); if (v) return v; }
      return this.besteStimme();
    },
    /** Muss im Tap-Handler aufgerufen werden: schaltet die Sprachausgabe auf iOS frei. */
    entsperren() {
      if (!this.synth || this.entsperrt) return;
      try {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0; u.lang = "de-DE";
        this.synth.speak(u);
        this.entsperrt = true;
      } catch (e) { /* egal */ }
    },
    stopp() {
      if (this.synth) { try { this.synth.cancel(); } catch (e) { /* egal */ } }
    },
    /** Spricht einen Text. Promise wird erfüllt, wenn fertig (onend ODER Fallback-Timer), oder bei Abbruch. */
    sprich(text, l) {
      gesprochenLog.push(text);
      if (gesprochenLog.length > 200) gesprochenLog.shift();
      if (DEBUG) console.log("🔊", text);
      return new Promise((resolve) => {
        if (SCHNELL || !this.synth) { setTimeout(resolve, SCHNELL ? 30 : schaetzeDauer(text, 1)); return; }
        const synth = this.synth;
        const tempo = Number(einst().tempo) || 1;
        const geschaetzt = schaetzeDauer(text, tempo);
        let fertig = false, timer = null, poll = null;
        const ende = () => {
          if (fertig) return;
          fertig = true;
          clearTimeout(timer); clearInterval(poll);
          if (l) l.abbrecher.delete(abbruch);
          resolve();
        };
        const abbruch = () => { try { synth.cancel(); } catch (e) { /* egal */ } ende(); };
        if (l) l.abbrecher.add(abbruch);

        const u = new SpeechSynthesisUtterance(text);
        u.lang = "de-DE";
        const v = this.stimme();
        if (v) u.voice = v;
        u.rate = tempo; u.pitch = 1; u.volume = 1;
        u.onend = ende;
        u.onerror = (e) => { if (e && e.error && e.error !== "interrupted" && e.error !== "canceled") systemLog("Sprachausgabe-Fehler: " + e.error); ende(); };
        // Fallback: onend feuert auf iOS nicht immer → nach geschätzter Dauer prüfen, ob noch gesprochen wird
        timer = setTimeout(() => {
          const grenze = Date.now() + geschaetzt * 1.5 + 2500;
          poll = setInterval(() => { if (!synth.speaking || Date.now() > grenze) ende(); }, 250);
        }, geschaetzt + 700);

        const los = () => {
          if (fertig) return;
          try { if (synth.paused) synth.resume(); synth.speak(u); }
          catch (e) { systemLog("speak() fehlgeschlagen: " + e.message); ende(); }
        };
        if (synth.speaking || synth.pending) { synth.cancel(); setTimeout(los, 80); }
        else los();
      });
    }
  };
  function schaetzeDauer(text, tempo) {
    return Math.round((String(text).length / 13) * 1000 / (tempo || 1)) + 300;
  }

  // ═════════ Soundeffekte (Web Audio) ═════════
  const Ton = {
    ctx: null,
    init() {
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state !== "running") this.ctx.resume().catch(() => {});
      } catch (e) { /* egal */ }
    },
    /** Spielt einen Effekt, gibt die Dauer in ms zurück (0 = aus). */
    spiele(art) {
      if (!einst().sounds || !this.ctx || SCHNELL) return 0;
      const ctx = this.ctx;
      if (ctx.state !== "running") ctx.resume().catch(() => {});
      const NOTEN = {
        piep: { typ: "sine", noten: [[880, 0, 0.13]], laut: 0.16 },
        richtig: { typ: "sine", noten: [[660, 0, 0.11], [990, 0.1, 0.2]], laut: 0.16 },
        falsch: { typ: "triangle", noten: [[392, 0, 0.16], [311, 0.15, 0.26]], laut: 0.14 },
        pause: { typ: "sine", noten: [[523, 0, 0.12], [392, 0.13, 0.18]], laut: 0.12 },
        ende: { typ: "sine", noten: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.24]], laut: 0.14 }
      };
      const def = NOTEN[art];
      if (!def) return 0;
      const t0 = ctx.currentTime + 0.03;
      let ende = 0;
      for (const [freq, start, dauer] of def.noten) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = def.typ;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0 + start);
        gain.gain.exponentialRampToValueAtTime(def.laut, t0 + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dauer);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + start);
        osc.stop(t0 + start + dauer + 0.02);
        ende = Math.max(ende, start + dauer);
      }
      return Math.round(ende * 1000) + 40;
    }
  };

  // ═════════ Bildschirm wach halten ═════════
  const Wach = {
    lock: null, video: null, zeichner: null, timer: null, modus: "aus", gewuenscht: false,
    async an() {
      this.gewuenscht = true;
      if ("wakeLock" in navigator) {
        try {
          if (!this.lock) {
            this.lock = await navigator.wakeLock.request("screen");
            this.lock.addEventListener("release", () => { this.lock = null; if (this.modus === "wakelock") this.modus = "freigegeben"; });
          }
          this.modus = "wakelock";
          return this.modus;
        } catch (e) {
          systemLog("Wake Lock nicht möglich: " + (e.name || "") + " " + (e.message || ""));
        }
      }
      try { await this.starteVideo(); this.modus = "video"; }
      catch (e) { this.modus = "nicht-verfuegbar"; systemLog("Video-Fallback nicht möglich: " + (e.message || e)); }
      return this.modus;
    },
    /** Fallback ohne Bibliothek: stummes, in Schleife laufendes Inline-Video aus einem Canvas. */
    starteVideo() {
      if (!this.video) {
        const c = document.createElement("canvas");
        c.width = 16; c.height = 16;
        if (!c.captureStream) throw new Error("canvas.captureStream fehlt");
        const v = document.createElement("video");
        v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
        v.muted = true; v.playsInline = true; v.loop = true;
        v.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;";
        v.srcObject = c.captureStream(2);
        document.body.appendChild(v);
        this.video = v;
        this.zeichner = c.getContext("2d");
      }
      clearInterval(this.timer);
      let i = 0;
      this.timer = setInterval(() => { i ^= 1; this.zeichner.fillStyle = i ? "#000" : "#020202"; this.zeichner.fillRect(0, 0, 16, 16); }, 500);
      return this.video.play();
    },
    aus() {
      this.gewuenscht = false;
      if (this.lock) { try { this.lock.release(); } catch (e) { /* egal */ } this.lock = null; }
      if (this.video) { try { this.video.pause(); } catch (e) { /* egal */ } }
      clearInterval(this.timer);
      this.modus = "aus";
    }
  };

  // ═════════ Spracherkennung ═════════
  function sammleAlternativen(results) {
    let maxAlt = 1;
    for (let i = 0; i < results.length; i++) maxAlt = Math.max(maxAlt, results[i].length);
    const alts = [];
    for (let a = 0; a < maxAlt; a++) {
      let t = "";
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const alt = r[a] || r[0];
        if (alt && alt.transcript) t += (t ? " " : "") + alt.transcript.trim();
      }
      t = t.trim();
      if (t && alts.indexOf(t) < 0) alts.push(t);
    }
    return alts;
  }

  const EchtHoerer = {
    aktiv: null,
    abbrechen() {
      const r = this.aktiv;
      this.aktiv = null;
      if (r) { try { r.abort(); } catch (e) { /* egal */ } }
    },
    /** Kurzer Mikro-Start im Tap-Handler: holt die Erlaubnis und entsperrt das Mikro auf iOS. */
    vorwaermen() {
      return new Promise((resolve) => {
        if (!SR) { resolve({ ok: false, code: "nicht-verfuegbar" }); return; }
        let r, fertig = false, code = null;
        const ende = (erg) => {
          if (fertig) return;
          fertig = true;
          clearTimeout(t);
          if (r) { r.onstart = r.onerror = r.onend = r.onresult = null; try { r.abort(); } catch (e) { /* egal */ } }
          if (this.aktiv === r) this.aktiv = null;
          resolve(erg);
        };
        try {
          r = new SR();
          r.lang = "de-DE"; r.continuous = false; r.interimResults = false; r.maxAlternatives = 1;
        } catch (e) { resolve({ ok: false, code: "service-not-allowed", info: e.message }); return; }
        this.aktiv = r;
        r.onstart = () => { setTimeout(() => { try { r.abort(); } catch (e) { /* egal */ } }, 150); };
        r.onerror = (ev) => { code = ev.error; };
        r.onend = () => ende({ ok: !istHarterFehler(code), code: code || "ok" });
        const t = setTimeout(() => ende({ ok: true, code: "timeout" }), 12000);
        try { r.start(); } catch (e) { ende({ ok: true, code: "start-fehler", info: e.name + ": " + e.message }); }
      });
    },
    /**
     * Hört bis zu dauerMs zu. Für jede Runde wird eine NEUE Instanz erzeugt.
     * Ergebnis: { art: "ergebnis", alternativen } | { art: "stille" } | { art: "fehler", code } | { art: "abbruch" }
     */
    hoere(opt) {
      const dauerMs = opt.dauerMs, l = opt.l;
      if (l && l.grund) return Promise.resolve({ art: "abbruch", fehlerListe: [], dauerMs: 0, versuche: 0 });
      return new Promise((resolve) => {
        const start = Date.now();
        const fehlerListe = [];
        let fertig = false, rec = null, letzteZwischen = null, versuche = 0;
        let gnadenTimer = null, startWatchdog = null, neustartTimer = null;

        const ende = (erg) => {
          if (fertig) return;
          fertig = true;
          clearTimeout(hauptTimer); clearTimeout(gnadenTimer); clearTimeout(startWatchdog); clearTimeout(neustartTimer);
          if (l) l.abbrecher.delete(abbruch);
          if (rec) {
            const r = rec; rec = null;
            r.onresult = r.onerror = r.onend = r.onstart = null;
            try { r.abort(); } catch (e) { /* egal */ }
          }
          this.aktiv = null;
          erg.fehlerListe = fehlerListe;
          erg.dauerMs = Date.now() - start;
          erg.versuche = versuche;
          resolve(erg);
        };
        const abbruch = () => ende({ art: "abbruch" });
        if (l) l.abbrecher.add(abbruch);

        const mitZwischen = () => (letzteZwischen ? { art: "ergebnis", alternativen: letzteZwischen, nurZwischen: true } : { art: "stille" });

        const starte = () => {
          if (fertig) return;
          if (Date.now() > start + dauerMs - 500) { ende(mitZwischen()); return; }
          versuche++;
          let r;
          try { r = new SR(); }
          catch (e) { fehlerListe.push("konstruktor:" + e.name); ende({ art: "fehler", code: "service-not-allowed" }); return; }
          rec = r; this.aktiv = r;
          r.lang = "de-DE";
          r.continuous = false;
          r.interimResults = true;
          r.maxAlternatives = 3;
          let gestartet = false, letzterFehler = null;

          r.onstart = () => { gestartet = true; clearTimeout(startWatchdog); };
          r.onresult = (ev) => {
            if (rec !== r || fertig) return;
            const alts = sammleAlternativen(ev.results);
            if (!alts.length) return;
            const istFinal = ev.results[ev.results.length - 1].isFinal;
            if (istFinal) { ende({ art: "ergebnis", alternativen: alts }); return; }
            letzteZwischen = alts;
            if (opt.beiZwischen) opt.beiZwischen(alts);
            if (opt.pruefeZwischen && opt.pruefeZwischen(alts)) ende({ art: "ergebnis", alternativen: alts, frueh: true });
          };
          r.onerror = (ev) => {
            if (rec !== r) return;
            letzterFehler = ev.error || "unbekannt";
            fehlerListe.push(letzterFehler);
          };
          r.onend = () => {
            if (rec !== r || fertig) return;
            rec = null; this.aktiv = null;
            clearTimeout(startWatchdog);
            if (letzterFehler === "network") { ende({ art: "fehler", code: "network" }); return; }
            if (istHarterFehler(letzterFehler)) { ende({ art: "fehler", code: letzterFehler }); return; }
            if (letzteZwischen) { ende({ art: "ergebnis", alternativen: letzteZwischen, nurZwischen: true }); return; }
            // no-speech, aborted oder Ende ohne Ergebnis → bis zum Ablauf der Antwortzeit neu starten
            neustartTimer = setTimeout(starte, 250);
          };
          try { r.start(); }
          catch (e) {
            fehlerListe.push("start:" + e.name);
            rec = null; this.aktiv = null;
            neustartTimer = setTimeout(starte, 400);
            return;
          }
          // Watchdog: Mikro hängt (startet nicht) → neu starten
          startWatchdog = setTimeout(() => {
            if (!gestartet && rec === r && !fertig) {
              fehlerListe.push("start-haengt");
              r.onresult = r.onerror = r.onend = r.onstart = null;
              try { r.abort(); } catch (e) { /* egal */ }
              rec = null; this.aktiv = null;
              neustartTimer = setTimeout(starte, 400);
            }
          }, 3000);
        };

        const hauptTimer = setTimeout(() => {
          if (letzteZwischen && rec) {
            // Es wird gerade gesprochen → kurz auf das Endergebnis warten
            try { rec.stop(); } catch (e) { /* egal */ }
            gnadenTimer = setTimeout(() => ende(mitZwischen()), 2000);
          } else {
            ende(mitZwischen());
          }
        }, dauerMs);

        starte();
      });
    }
  };

  function istHarterFehler(code) {
    return code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture" || code === "language-not-supported";
  }

  /** Debug-Ersatz für das Mikro: Texteingabe (nur mit ?debug=1). */
  const DebugHoerer = {
    aktiv: null,
    abbrechen() { if (this.aktiv) this.aktiv.ende({ art: "abbruch" }); },
    vorwaermen() { return Promise.resolve({ ok: true, code: "debug" }); },
    hoere(opt) {
      const l = opt.l;
      if (l && l.grund) return Promise.resolve({ art: "abbruch", fehlerListe: [], dauerMs: 0, versuche: 0 });
      return new Promise((resolve) => {
        const start = Date.now();
        let fertig = false;
        const ende = (erg) => {
          if (fertig) return;
          fertig = true;
          clearTimeout(t);
          if (l) l.abbrecher.delete(abbruch);
          this.aktiv = null;
          $("#debug-panel").classList.remove("hoert");
          erg.fehlerListe = erg.code ? [erg.code] : [];
          erg.dauerMs = Date.now() - start;
          erg.versuche = 1;
          resolve(erg);
        };
        const abbruch = () => ende({ art: "abbruch" });
        if (l) l.abbrecher.add(abbruch);
        const t = setTimeout(() => ende({ art: "stille" }), opt.dauerMs);
        this.aktiv = {
          ende,
          antworte: (text) => ende({ art: "ergebnis", alternativen: Array.isArray(text) ? text : [text] }),
          stille: () => ende({ art: "stille" }),
          fehler: (code) => ende({ art: "fehler", code })
        };
        $("#debug-panel").classList.add("hoert");
      });
    }
  };

  const Hoerer = DEBUG_SIM ? DebugHoerer : EchtHoerer;
  const hoererVerfuegbar = () => DEBUG_SIM || !!SR;

  // ═════════ Abläufe & Unterbrechungen ═════════
  class Unterbrechung extends Error {
    constructor(grund) { super("unterbrochen: " + grund); this.grund = grund; }
  }
  let lauf = null;
  function neuerLauf() {
    if (lauf && !lauf.grund) unterbrich("ersetzt");
    lauf = { grund: null, abbrecher: new Set() };
    return lauf;
  }
  function unterbrich(grund, l) {
    l = l || lauf;
    if (!l || l.grund) return;
    l.grund = grund;
    for (const fn of Array.from(l.abbrecher)) { try { fn(); } catch (e) { /* egal */ } }
    l.abbrecher.clear();
    Sprecher.stopp();
    Hoerer.abbrechen();
  }
  function pruefeLauf(l) { if (l.grund) throw new Unterbrechung(l.grund); }
  function warte(ms, l) {
    if (l.grund) return Promise.reject(new Unterbrechung(l.grund));
    if (SCHNELL) ms = Math.min(ms, 40);
    return new Promise((resolve) => {
      const fertig = () => { clearTimeout(t); l.abbrecher.delete(fertig); resolve(); };
      const t = setTimeout(fertig, Math.max(0, ms));
      l.abbrecher.add(fertig);
    }).then(() => pruefeLauf(l));
  }
  async function sag(text, l) { pruefeLauf(l); await Sprecher.sprich(text, l); pruefeLauf(l); }
  async function ton(art, l) { const ms = Ton.spiele(art); if (ms) await warte(ms + 60, l); }

  // ═════════ Lernlogik ═════════
  const INTERVALL_TAGE = [0, 1, 3, 7, 21];
  const TAG = 86400000;
  const fp = (id) => daten.fortschritt[id];
  function mische(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  const istGemeistert = (id) => { const e = fp(id); return !!(e && e.s >= 4); };

  function neueFahrt(katId) {
    const ohneMikro = !hoererVerfuegbar();
    return {
      kat: katId, status: "laeuft", start: Date.now(),
      nummer: 0, gewertet: 0, richtig: 0, gehoert: 0,
      versuche: [], verlauf: [], gefragt: new Set(), warteschlange: [], wiederholt: {},
      letzteKat: null, stilleInFolge: 0, netzFehlerInFolge: 0, abstuerze: 0,
      hoermodus: !!einst().hoermodus || ohneMikro,
      hoermodusGrund: einst().hoermodus ? "einstellung" : (ohneMikro ? "nicht-verfuegbar" : null),
      aktuelle: null, aktuelleErledigt: true, inPause: false,
      bestaetigung: Math.floor(Math.random() * 4)
    };
  }

  /** Auswahl: fällige falsche > neue > bekannte mit niedriger Stufe > gemeisterte (selten). */
  function waehleFrage(f) {
    const gemischt = f.kat === "gemischt";
    const pool = gemischt ? FRAGEN : FRAGEN.filter((q) => q.kategorie === f.kat);
    const passt = (q) => !gemischt || q.kategorie !== f.letzteKat;

    // 1. In dieser Fahrt falsch beantwortete / übersprungene Fragen, die jetzt dran sind
    const faellig = f.warteschlange.filter((w) => w.faelligBei <= f.nummer).sort((a, b) => a.faelligBei - b.faelligBei);
    const w = faellig.find((x) => passt(FRAGE_NACH_ID[x.id])) || faellig[0];
    if (w) { f.warteschlange.splice(f.warteschlange.indexOf(w), 1); return FRAGE_NACH_ID[w.id]; }

    let frei = pool.filter((q) => !f.gefragt.has(q.id) && !f.warteschlange.some((x) => x.id === q.id));
    if (!frei.length) {
      if (f.warteschlange.length) {
        f.warteschlange.sort((a, b) => a.faelligBei - b.faelligBei);
        return FRAGE_NACH_ID[f.warteschlange.shift().id];
      }
      const letzte = new Set(f.verlauf.slice(-10));
      f.gefragt = new Set(letzte);
      frei = pool.filter((q) => !letzte.has(q.id));
      if (!frei.length) frei = pool.slice();
    }

    const jetzt = Date.now();
    const falsch = [], neu = [], faelligBekannt = [], spaeter = [], gemeistert = [];
    for (const q of frei) {
      const e = fp(q.id);
      if (!e || !e.g) neu.push(q);
      else if (!e.s) falsch.push(q);
      else if (e.s >= 4) gemeistert.push(q);
      else if (jetzt - (e.z || 0) >= INTERVALL_TAGE[e.s] * TAG) faelligBekannt.push(q);
      else spaeter.push(q);
    }
    const alter = (a, b) => ((fp(a.id) || {}).z || 0) - ((fp(b.id) || {}).z || 0);
    const stufe = (a, b) => (fp(a.id).s - fp(b.id).s) || alter(a, b);
    falsch.sort(alter);
    mische(neu);
    neu.sort((a, b) => ((fp(a.id) || {}).h || 0) - ((fp(b.id) || {}).h || 0)); // Gehörtes (Hörmodus) nach hinten
    faelligBekannt.sort(stufe);
    spaeter.sort(stufe);
    gemeistert.sort(alter);

    let reihenfolge = [falsch, neu, faelligBekannt, spaeter, gemeistert];
    if (gemeistert.length && Math.random() < 0.08 && jetzt - (fp(gemeistert[0].id).z || 0) >= INTERVALL_TAGE[4] * TAG) {
      reihenfolge = [gemeistert, falsch, neu, faelligBekannt, spaeter];
    }
    for (const liste of reihenfolge) { const q = liste.find(passt); if (q) return q; }
    for (const liste of reihenfolge) { if (liste.length) return liste[0]; }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function nimmFrage(f) {
    const q = waehleFrage(f);
    f.gefragt.add(q.id);
    f.verlauf.push(q.id);
    f.letzteKat = q.kategorie;
    f.nummer++;
    f.aktuelle = q;
    f.aktuelleErledigt = false;
    return q;
  }

  function planeWiederholung(f, q, abstand) {
    f.wiederholt[q.id] = (f.wiederholt[q.id] || 0) + 1;
    if (f.wiederholt[q.id] > 2) return;
    if (f.warteschlange.some((w) => w.id === q.id)) return;
    f.warteschlange.push({ id: q.id, faelligBei: f.nummer + abstand });
  }

  /** ergebnis: "richtig" | "falsch" | "keine" | "weissnicht" */
  function bewerte(f, q, ergebnis, erkannt) {
    const e = daten.fortschritt[q.id] || { g: 0, r: 0, z: 0, s: 0 };
    const vorherStufe = e.s || 0;
    e.g = (e.g || 0) + 1;
    e.z = Date.now();
    const versuch = { schluessel: f.start + ":" + (f.versuche.length + 1), id: q.id, ergebnis, erkannt: erkannt || "", vorherStufe };
    if (ergebnis === "richtig") {
      e.r = (e.r || 0) + 1;
      e.s = Math.min(4, vorherStufe + 1);
      f.richtig++;
    } else {
      e.s = 0; // einfaches Leitner-System: falsch → zurück auf Stufe 0
      planeWiederholung(f, q, 10);
    }
    e.v = versuch.schluessel;
    daten.fortschritt[q.id] = e;
    f.gewertet++;
    f.versuche.push(versuch);
    f.aktuelleErledigt = true;
    speichere();
    UI.zaehler(f);
    return versuch;
  }

  function markiereGehoert(f, q) {
    const e = daten.fortschritt[q.id] || { g: 0, r: 0, z: 0, s: 0 };
    e.h = (e.h || 0) + 1;
    e.z = Date.now();
    daten.fortschritt[q.id] = e;
    f.gehoert++;
    f.aktuelleErledigt = true;
    f.versuche.push({ schluessel: f.start + ":" + (f.versuche.length + 1), id: q.id, ergebnis: "gehoert" });
    speichere();
    UI.zaehler(f);
  }

  function korrigiere(f, versuch) {
    if (versuch.ergebnis === "korrigiert") return;
    const q = FRAGE_NACH_ID[versuch.id];
    const vorher = versuch.ergebnis;
    versuch.ergebnis = "korrigiert";
    f.richtig++;
    const e = daten.fortschritt[versuch.id];
    if (e) {
      e.r = (e.r || 0) + 1;
      e.s = e.v === versuch.schluessel ? Math.min(4, (versuch.vorherStufe || 0) + 1) : Math.min(4, (e.s || 0) + 1);
    }
    if (daten.letzteFahrt) daten.letzteFahrt.richtig = f.richtig;
    protokolliere({ art: "korrektur", frageId: versuch.id, frage: q.frage, erwartet: q.antwort, erkannt: versuch.erkannt ? [versuch.erkannt] : [], wertung: "von Hand korrigiert (vorher: " + vorher + ")" });
    speichere();
  }

  // ═════════ Fahrt ═════════
  let fahrt = null;
  let ergebnisFahrt = null;
  const BESTAETIGUNGEN = ["Richtig!", "Genau!", "Stimmt!", "Sehr gut!"];
  const kurz = (s) => String(s || "").trim().slice(0, 80);

  /** Start-Tipp: Ton, Sprache und Mikro werden HIER (im Tap-Handler) freigeschaltet. */
  function starteFahrt(katId) {
    if (fahrt) return;
    Ton.init();
    Sprecher.entsperren();
    const f = neueFahrt(katId);
    let vorbereitung = null;
    if (!f.hoermodus) vorbereitung = Hoerer.vorwaermen();
    Wach.an();
    fahrt = f;
    UI.zeigeFahrt(f);
    fahrtSchleife(neuerLauf(), { vorbereitung, start: true });
  }

  async function fahrtSchleife(l, opt) {
    const f = fahrt;
    if (!f) return;
    opt = opt || {};
    try {
      if (opt.vorbereitung) {
        UI.status("frage", "Mikro wird vorbereitet …");
        const v = await opt.vorbereitung;
        pruefeLauf(l);
        protokolliere({ art: "system", wertung: "Mikro-Vorbereitung: " + (v.code || "ok") + (v.info ? " (" + v.info + ")" : "") });
        if (!v.ok) {
          f.hoermodus = true;
          f.hoermodusGrund = v.code;
          UI.fahrtHinweis(hoermodusText(v.code));
          await warte(300, l);
          await sag("Ich habe keinen Zugriff auf Mikrofon oder Spracherkennung. Ich lese dir deshalb Fragen und Antworten im Hörmodus vor. Schau nach der Fahrt in den Technik-Check.", l);
        } else {
          await warte(350, l);
        }
      }
      if (opt.start) {
        if (f.hoermodus) UI.fahrtHinweis(hoermodusText(f.hoermodusGrund));
        await sag(f.hoermodus ? "Los geht's im Hörmodus! Erste Frage." : "Los geht's! Erste Frage.", l);
      } else if (opt.begruessung) {
        await sag(opt.begruessung, l);
      }

      let q = null, wiederholung = false;
      if (opt.wiederholeAktuelle && f.aktuelle && !f.aktuelleErledigt) q = f.aktuelle;
      for (;;) {
        if (!q) q = nimmFrage(f);
        const aktion = await frageRunde(f, q, l, wiederholung);
        wiederholung = false;
        if (aktion === "nochmal") { wiederholung = true; continue; }
        if (aktion === "stopp") { await beendeFahrt("befehl"); return; }
        if (aktion === "pause" || aktion === "pause-stille") {
          const weiter = await pausenModus(f, l, aktion === "pause"
            ? "Okay, Pause. Sag weiter, wenn du wieder magst."
            : "Ich mache kurz Pause. Sag weiter, wenn du wieder magst.");
          if (!weiter) { await beendeFahrt("pause"); return; }
          f.stilleInFolge = 0;
          await sag("Weiter geht's!", l);
          q = null;
          continue;
        }
        q = null;
        await warte(1100, l);
      }
    } catch (e) {
      if (e instanceof Unterbrechung) { behandleUnterbrechung(f, e.grund); return; }
      console.error(e);
      systemLog("Fehler im Ablauf: " + (e && e.message ? e.message : e));
      f.abstuerze++;
      if (fahrt === f && f.status === "laeuft") {
        if (f.abstuerze > 3) { beendeFahrt("fehler"); return; }
        setTimeout(() => { if (fahrt === f && f.status === "laeuft") fahrtSchleife(neuerLauf(), {}); }, 1500);
      }
    }
  }

  function hoermodusText(grund) {
    switch (grund) {
      case "einstellung": return "🎧 Hörmodus: Ich lese vor, ohne zuzuhören.";
      case "nicht-verfuegbar": return "🎧 Hörmodus: Spracherkennung ist hier nicht verfügbar. Öffne die App in Safari.";
      case "netz": return "🎧 Hörmodus für diese Fahrt: Die Spracherkennung hat keinen Empfang.";
      case "not-allowed": return "🎧 Hörmodus: Mikrofon nicht erlaubt. Lösung im Technik-Check.";
      case "service-not-allowed": return "🎧 Hörmodus: Spracherkennung nicht erlaubt. Siri/Diktieren aktivieren oder in Safari öffnen – siehe Technik-Check.";
      case "audio-capture": return "🎧 Hörmodus: Kein Mikrofon gefunden. Lösung im Technik-Check.";
      default: return "🎧 Hörmodus: Ich lese vor, ohne zuzuhören.";
    }
  }

  async function frageRunde(f, q, l, wiederholung) {
    UI.frage(f, q);
    UI.status("frage", wiederholung ? "Ich wiederhole …" : "Ich frage …");
    const kat = KAT[q.kategorie];
    await sag(wiederholung ? q.frage : kat.gesprochen + ". " + q.frage, l);

    if (f.hoermodus) {
      UI.status("frage", "Denk nach …");
      await warte(einst().denkpause * 1000, l);
      await loese(q, l, "Die Antwort ist:");
      markiereGehoert(f, q);
      return "weiter";
    }

    await warte(300, l);
    await ton("piep", l);
    UI.status("hoere", "Ich höre zu");
    UI.zwischen("");
    const erg = await Hoerer.hoere({
      dauerMs: einst().antwortzeit * 1000,
      l,
      beiZwischen: (alts) => UI.zwischen(alts[0]),
      pruefeZwischen: (alts) => {
        const b = P.erkenneBefehl(alts[0]);
        if (b === "stopp") return true;
        if (b) return false;
        const p = P.pruefeAntwort(q, alts);
        return p.richtig && p.art !== "unscharf"; // nur eindeutige Treffer früh werten
      }
    });
    pruefeLauf(l);
    return verarbeiteErgebnis(f, q, l, erg);
  }

  async function verarbeiteErgebnis(f, q, l, erg) {
    const log = {
      art: "erkennung", frageId: q.id, frage: q.frage, erwartet: q.antwort,
      erkannt: erg.alternativen || [], fehler: erg.fehlerListe || [], dauerMs: erg.dauerMs, starts: erg.versuche,
      nurZwischen: !!erg.nurZwischen, frueh: !!erg.frueh
    };

    if (erg.art === "ergebnis") {
      f.stilleInFolge = 0;
      f.netzFehlerInFolge = 0;
      const alts = erg.alternativen;
      const befehl = P.erkenneBefehl(alts[0]);
      if (befehl) {
        log.wertung = "Befehl: " + befehl;
        protokolliere(log);
        return fuehreBefehlAus(f, q, l, befehl);
      }
      const p = P.pruefeAntwort(q, alts);
      log.wertung = p.richtig ? "richtig (" + p.art + ")" : "falsch";
      protokolliere(log);
      UI.zwischen("");
      if (p.richtig) {
        bewerte(f, q, "richtig", p.treffer);
        Ton.spiele("richtig");
        const text = BESTAETIGUNGEN[f.bestaetigung++ % BESTAETIGUNGEN.length];
        UI.status("richtig", text);
        UI.loesung(q, einst().funfactBeiRichtig);
        await warte(200, l);
        await sag(einst().funfactBeiRichtig ? text + " " + q.funfact : text, l);
        return "weiter";
      }
      bewerte(f, q, "falsch", alts[0]);
      Ton.spiele("falsch");
      UI.status("falsch", "Leider nicht");
      UI.loesung(q, true, alts[0]);
      await warte(350, l);
      const gehoert = kurz(alts[0]);
      await sag("Leider nicht. " + (gehoert ? "Ich habe " + gehoert + " verstanden. " : "") + "Richtig ist: " + q.antwort + ". " + q.funfact, l);
      return "weiter";
    }

    if (erg.art === "stille") {
      f.stilleInFolge++;
      f.netzFehlerInFolge = 0;
      log.wertung = "keine Antwort";
      protokolliere(log);
      bewerte(f, q, "keine", "");
      await loese(q, l, "Die Antwort ist:");
      return f.stilleInFolge >= 3 ? "pause-stille" : "weiter";
    }

    if (erg.art === "fehler") {
      log.wertung = "Fehler: " + erg.code;
      protokolliere(log);
      if (erg.code === "network") {
        f.netzFehlerInFolge++;
        UI.status("frage", "Kein Empfang – denk nach …");
        const rest = einst().denkpause * 1000 - (erg.dauerMs || 0);
        if (rest > 0) await warte(rest, l);
        await loese(q, l, "Die Antwort ist:");
        markiereGehoert(f, q);
        if (f.netzFehlerInFolge >= 3) {
          f.hoermodus = true;
          f.hoermodusGrund = "netz";
          UI.fahrtHinweis(hoermodusText("netz"));
          await sag("Die Spracherkennung hat gerade keinen Empfang. Ich wechsle für diese Fahrt in den Hörmodus und lese dir Fragen und Antworten einfach vor.", l);
        }
        return "weiter";
      }
      // not-allowed / service-not-allowed / audio-capture
      f.hoermodus = true;
      f.hoermodusGrund = erg.code;
      UI.fahrtHinweis(hoermodusText(erg.code));
      await sag("Ich kann gerade nicht zuhören, weil mir der Zugriff auf Mikrofon oder Spracherkennung fehlt. Ich wechsle in den Hörmodus. Schau nach der Fahrt in den Technik-Check.", l);
      await loese(q, l, "Die Antwort ist:");
      markiereGehoert(f, q);
      return "weiter";
    }

    pruefeLauf(l);
    return "weiter";
  }

  async function loese(q, l, einleitung) {
    UI.status("loesung", "Die Lösung");
    UI.loesung(q, true);
    await sag(einleitung + " " + q.antwort + ". " + q.funfact, l);
  }

  async function fuehreBefehlAus(f, q, l, befehl) {
    switch (befehl) {
      case "stopp": return "stopp";
      case "nochmal": return "nochmal";
      case "pause": return "pause";
      case "weissnicht":
        bewerte(f, q, "weissnicht", "");
        await loese(q, l, "Kein Problem. Die Antwort ist:");
        return "weiter";
      case "weiter":
        f.aktuelleErledigt = true;
        f.versuche.push({ schluessel: f.start + ":" + (f.versuche.length + 1), id: q.id, ergebnis: "uebersprungen" });
        planeWiederholung(f, q, 8);
        UI.status("frage", "Übersprungen");
        await sag("Okay, die kommt später nochmal.", l);
        return "weiter";
      default: return "weiter";
    }
  }

  function istZustimmung(text) {
    const n = P.normalisiere(text, { fuellwoerter: false, zahlen: false });
    return /^(ja|los|weiter|okay|ok|klar|gerne|na klar|ja bitte|los gehts|weiter gehts|weitermachen)( |$)/.test(n);
  }

  /** Pause: bis zu 10 Minuten auf „weiter“ hören (Mikro immer wieder neu starten). */
  async function pausenModus(f, l, text) {
    f.inPause = true;
    UI.pause(true);
    try {
      UI.status("pause", "Pause");
      await ton("pause", l);
      await sag(text, l);
      const dauer = DEBUG && params.get("pausems") ? Number(params.get("pausems")) : 10 * 60 * 1000;
      const ende = Date.now() + dauer;
      while (Date.now() < ende) {
        UI.status("pause", "Pause – sag „weiter“");
        if (f.hoermodus || !hoererVerfuegbar()) { await warte(ende - Date.now(), l); break; }
        const erg = await Hoerer.hoere({
          dauerMs: Math.min(20000, Math.max(1000, ende - Date.now())),
          l,
          pruefeZwischen: (alts) => { const b = P.erkenneBefehl(alts[0]); return b === "weiter" || b === "stopp"; }
        });
        pruefeLauf(l);
        if (erg.art === "ergebnis") {
          const b = P.erkenneBefehl(erg.alternativen[0]);
          protokolliere({ art: "erkennung", frage: "(Pause)", erwartet: "weiter", erkannt: erg.alternativen, fehler: erg.fehlerListe, dauerMs: erg.dauerMs, starts: erg.versuche, wertung: b ? "Befehl: " + b : "ignoriert" });
          if (b === "stopp") return false;
          if (b === "weiter" || b === "nochmal" || istZustimmung(erg.alternativen[0])) return true;
        } else if (erg.art === "fehler") {
          protokolliere({ art: "erkennung", frage: "(Pause)", erwartet: "weiter", erkannt: [], fehler: erg.fehlerListe, wertung: "Fehler: " + erg.code });
          if (erg.code === "network") { await warte(5000, l); continue; }
          await warte(ende - Date.now(), l); // kein Mikro → nur noch per Tipp weiter
          break;
        }
      }
      return false;
    } finally {
      f.inPause = false;
      UI.pause(false);
    }
  }

  function behandleUnterbrechung(f, grund) {
    if (fahrt !== f || !f) return;
    if (grund === "stopp") { beendeFahrt("knopf"); return; }
    if (grund === "skip") {
      if (f.aktuelle && !f.aktuelleErledigt) {
        f.versuche.push({ schluessel: f.start + ":" + (f.versuche.length + 1), id: f.aktuelle.id, ergebnis: "uebersprungen" });
        planeWiederholung(f, f.aktuelle, 8);
        f.aktuelleErledigt = true;
      }
      UI.zwischen("");
      fahrtSchleife(neuerLauf(), {});
      return;
    }
    if (grund === "weiter-tap") {
      f.stilleInFolge = 0;
      fahrtSchleife(neuerLauf(), { begruessung: "Weiter geht's!" });
      return;
    }
    if (grund === "hintergrund") {
      UI.status("pause", "Pausiert");
      if (!document.hidden) zeigeWeiterOverlay();
    }
  }

  function zeigeWeiterOverlay() {
    if (!fahrt || fahrt.status !== "hintergrund") return;
    $("#overlay-weiter").hidden = false;
  }

  function weiterNachHintergrund() {
    const f = fahrt;
    $("#overlay-weiter").hidden = true;
    if (!f) return;
    Ton.init();
    Sprecher.entsperren();
    Wach.an();
    f.status = "laeuft";
    let vorbereitung = null;
    if (!f.hoermodus) vorbereitung = Hoerer.vorwaermen();
    fahrtSchleife(neuerLauf(), { vorbereitung, begruessung: "Weiter geht's.", wiederholeAktuelle: true });
  }

  function beendeFahrt(grund) {
    const f = fahrt;
    if (!f || f.status === "beendet") return;
    f.status = "beendet";
    f.endGrund = grund;
    if (lauf && !lauf.grund) unterbrich("ende");
    Hoerer.abbrechen();
    Wach.aus();
    $("#overlay-weiter").hidden = true;
    if (f.nummer > 0) daten.fahrten++;
    daten.letzteFahrt = { zeit: Date.now(), kat: f.kat, gewertet: f.gewertet, richtig: f.richtig, gehoert: f.gehoert };
    speichere();
    ergebnisFahrt = f;
    fahrt = null;
    UI.ergebnis(f);
    let text;
    if (f.gewertet > 0) text = "Heute " + f.richtig + " von " + f.gewertet + " richtig. Gute Fahrt!";
    else if (f.gehoert > 0) text = "Du hast " + f.gehoert + (f.gehoert === 1 ? " Frage" : " Fragen") + " gehört. Gute Fahrt!";
    else text = "Bis zum nächsten Mal. Gute Fahrt!";
    Ton.spiele("ende");
    Sprecher.sprich(text, null);
  }

  // ═════════ Oberfläche ═════════
  let toastTimer = null;
  function toast(text) {
    const el = $("#toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function zeigeDialog(o) {
    return new Promise((resolve) => {
      const d = $("#dialog");
      $("#dialog-titel").textContent = o.titel;
      $("#dialog-text").textContent = o.text;
      $("#dialog-ja").textContent = o.ja || "OK";
      $("#dialog-nein").textContent = o.nein || "Abbrechen";
      d.hidden = false;
      const fertig = (wert) => {
        d.hidden = true;
        $("#dialog-ja").onclick = null; $("#dialog-nein").onclick = null; d.onclick = null;
        resolve(wert);
      };
      $("#dialog-ja").onclick = () => fertig(true);
      $("#dialog-nein").onclick = () => fertig(false);
      d.onclick = (e) => { if (e.target === d) fertig(false); };
      $("#dialog-nein").focus();
    });
  }

  const UI = {
    aktuell: null,
    zeige(name) {
      $$(".screen").forEach((s) => { s.hidden = s.id !== "screen-" + name; });
      this.aktuell = name;
      document.body.classList.toggle("in-fahrt", name === "fahrt");
      window.scrollTo(0, 0);
    },
    zeigeFahrt(f) {
      $("#fahrt-frage").textContent = "";
      $("#fahrt-loesung").hidden = true;
      $("#fahrt-hinweis").hidden = true;
      $("#fahrt-zwischen").textContent = "";
      this.faerbe(f.kat === "gemischt" ? "gemischt" : f.kat);
      $("#fahrt-kat").textContent = KAT[f.kat].emoji + " " + (KAT[f.kat].kurz || KAT[f.kat].name);
      this.zaehler(f);
      this.pause(false);
      this.status("frage", "Gleich geht's los …");
      $("#debug-panel").hidden = !DEBUG;
      this.zeige("fahrt");
    },
    faerbe(katId) {
      const k = KAT[katId];
      const el = $("#screen-fahrt");
      el.style.setProperty("--d1", k.dunkel[0]);
      el.style.setProperty("--d2", k.dunkel[1]);
      el.style.setProperty("--akzent", k.akzent);
    },
    frage(f, q) {
      const k = KAT[q.kategorie];
      this.faerbe(q.kategorie);
      $("#fahrt-kat").textContent = k.emoji + " " + (k.kurz || k.name);
      $("#fahrt-frage").textContent = q.frage;
      $("#fahrt-loesung").hidden = true;
      $("#fahrt-zwischen").textContent = "";
    },
    zaehler(f) {
      const el = $("#fahrt-zaehler");
      if (f.gewertet === 0 && f.gehoert > 0) el.textContent = f.gehoert + " gehört";
      else el.textContent = f.richtig + " von " + f.gewertet + " richtig";
    },
    status(zustand, text) {
      $("#fahrt-status").dataset.zustand = zustand;
      $("#fahrt-status-text").textContent = text;
    },
    zwischen(text) { $("#fahrt-zwischen").textContent = text ? "„" + text + "“" : ""; },
    loesung(q, mitFact, gehoert) {
      $("#fahrt-loesung-antwort").textContent = (gehoert ? "Gehört: „" + kurz(gehoert) + "“ · " : "") + "Richtig: " + q.antwort;
      $("#fahrt-loesung-fact").textContent = mitFact ? q.funfact : "";
      $("#fahrt-loesung-fact").hidden = !mitFact;
      $("#fahrt-loesung").hidden = false;
    },
    fahrtHinweis(text) {
      const el = $("#fahrt-hinweis");
      el.textContent = text;
      el.hidden = !text;
    },
    pause(an) {
      $("#btn-pause-weiter").hidden = !an;
      $("#btn-skip").hidden = !!an;
    },
    ergebnis(f) {
      const anteil = f.gewertet ? f.richtig / f.gewertet : 0;
      $("#ergebnis-emoji").textContent = f.gewertet === 0 ? (f.gehoert ? "🎧" : "🏁") : anteil >= 0.8 ? "🏆" : anteil >= 0.5 ? "🎉" : "💪";
      if (f.gewertet > 0) {
        $("#ergebnis-zahl").textContent = f.richtig + " von " + f.gewertet;
        $("#ergebnis-unter").textContent = "richtig beantwortet" + (f.gehoert ? " · " + f.gehoert + " gehört" : "");
      } else if (f.gehoert > 0) {
        $("#ergebnis-zahl").textContent = String(f.gehoert);
        $("#ergebnis-unter").textContent = f.gehoert === 1 ? "Frage gehört" : "Fragen gehört";
      } else {
        $("#ergebnis-zahl").textContent = "–";
        $("#ergebnis-unter").textContent = "Diesmal keine Fragen beantwortet";
      }
      renderFalschListe(f);
      this.zeige("ergebnis");
    }
  };

  function renderFalschListe(f) {
    const liste = $("#ergebnis-liste");
    liste.innerHTML = "";
    const falsche = f.versuche.filter((v) => ["falsch", "keine", "weissnicht", "korrigiert"].indexOf(v.ergebnis) >= 0);
    $("#ergebnis-liste-titel").hidden = !falsche.length;
    $("#ergebnis-liste-info").hidden = !falsche.some((v) => v.ergebnis !== "weissnicht");
    for (const v of falsche) {
      const q = FRAGE_NACH_ID[v.id];
      const li = document.createElement("li");
      const deine = v.ergebnis === "keine" ? "keine Antwort" : v.ergebnis === "weissnicht" ? "weiß nicht" : "„" + esc(kurz(v.erkannt)) + "“";
      li.innerHTML =
        '<p class="falsch-frage">' + esc(q.frage) + "</p>" +
        '<p class="falsch-detail">Du: ' + deine + " · Richtig: <b>" + esc(q.antwort) + "</b></p>";
      if (v.ergebnis !== "weissnicht") {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "knopf-klein";
        const setze = () => {
          const fertig = v.ergebnis === "korrigiert";
          li.classList.toggle("korrigiert", fertig);
          btn.textContent = fertig ? "✓ Als richtig gezählt" : "War doch richtig";
          btn.disabled = fertig;
        };
        btn.addEventListener("click", () => {
          korrigiere(f, v);
          setze();
          $("#ergebnis-zahl").textContent = f.richtig + " von " + f.gewertet;
          toast("Als richtig gezählt");
        });
        setze();
        li.appendChild(btn);
      }
      liste.appendChild(li);
    }
  }

  // ───── Startseite ─────
  function renderStart() {
    const gem = FRAGEN.filter((q) => istGemeistert(q.id)).length;
    $("#fortschritt-zeile").textContent = gem + " von " + FRAGEN.length + " gemeistert · " + daten.fahrten + (daten.fahrten === 1 ? " Fahrt" : " Fahrten");
    const karten = $("#karten");
    karten.innerHTML = "";
    for (const k of CFG.kategorien) {
      const fragen = k.id === "gemischt" ? FRAGEN : FRAGEN.filter((q) => q.kategorie === k.id);
      const g = fragen.filter((q) => istGemeistert(q.id)).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "karte" + (k.id === "gemischt" ? " karte-gross" : "");
      btn.style.setProperty("--c1", k.hell[0]);
      btn.style.setProperty("--c2", k.hell[1]);
      btn.setAttribute("aria-label", k.name + " starten, " + g + " von " + fragen.length + " gemeistert");
      if (k.id === "gemischt") {
        btn.innerHTML = '<span class="karte-emoji" aria-hidden="true">' + k.emoji + '</span><span class="karte-text"><span class="karte-name">' + esc(k.name) +
          '</span><span class="karte-unter">Alle Kategorien · ' + g + " von " + fragen.length + " gemeistert</span></span>";
      } else {
        btn.innerHTML = '<span class="karte-emoji" aria-hidden="true">' + k.emoji + '</span><span class="karte-unten"><span class="karte-name">' + esc(k.name) +
          '</span><span class="karte-info">' + g + "/" + fragen.length + " gemeistert</span></span>";
      }
      btn.addEventListener("click", () => starteFahrt(k.id));
      karten.appendChild(btn);
    }
    renderStartHinweis();
  }

  function safariAnleitung() {
    const url = location.href.split("?")[0].split("#")[0];
    return "<ol>" +
      "<li>Öffne <b>Safari</b> und rufe <b>" + esc(url) + "</b> auf.</li>" +
      "<li>Fürs Symbol auf dem Home-Bildschirm: Teilen-Symbol → „Zum Home-Bildschirm“. Gibt es dort den Schalter „Als Web-App öffnen“, schalte ihn <b>aus</b>. Dann öffnet das Symbol die App in Safari.</li>" +
      "<li>Alternativ: in Safari als Lesezeichen oder Favorit speichern.</li>" +
      "</ol>";
  }

  function renderStartHinweis() {
    const el = $("#hinweis-start");
    let html = "";
    if (!hoererVerfuegbar()) {
      html = UMGEBUNG.standalone
        ? "<strong>🎙️ Hier kann ich nicht zuhören.</strong>In der Home-Bildschirm-App ist die Spracherkennung nicht verfügbar. Öffne " + esc(CFG.name) + " in Safari:" + safariAnleitung()
        : "<strong>🎙️ Keine Spracherkennung in diesem Browser.</strong>Nutze auf dem iPhone Safari. Bis dahin läuft das Quiz im Hörmodus (vorlesen ohne Zuhören).";
    } else if (UMGEBUNG.standalone && daten.erkennungOk !== true) {
      html = "<strong>🎙️ Du nutzt die Home-Bildschirm-App.</strong>Dort klappt die Spracherkennung oft nicht. Mach den Technik-Check – und öffne die App bei Problemen in Safari:" + safariAnleitung();
    } else if (einst().hoermodus) {
      html = "<strong>🎧 Hörmodus ist an.</strong>Ich lese Fragen und Lösungen vor, ohne zuzuhören. Ändern unter Einstellungen.";
    }
    el.innerHTML = html;
    el.hidden = !html;
  }

  // ───── Einstellungen ─────
  function fuelleStimmen() {
    const sel = $("#einst-stimme");
    const beste = Sprecher.besteStimme();
    sel.innerHTML = "";
    const auto = document.createElement("option");
    auto.value = "";
    auto.textContent = "Automatisch" + (beste ? " (" + beste.name + ")" : "");
    sel.appendChild(auto);
    const sortiert = Sprecher.stimmen.slice().sort((a, b) => Sprecher.bewerte(b) - Sprecher.bewerte(a));
    for (const v of sortiert) {
      const o = document.createElement("option");
      o.value = v.voiceURI;
      o.textContent = v.name.replace(/\s*\(Deutsch \(Deutschland\)\)/, "") + (/^de[-_]de/i.test(v.lang) ? "" : " · " + v.lang);
      sel.appendChild(o);
    }
    sel.value = einst().stimme || "";
    if (sel.value !== (einst().stimme || "")) sel.value = "";
    $("#einst-stimme-info").textContent = Sprecher.stimmen.length
      ? Sprecher.stimmen.length + " deutsche Stimmen gefunden. Am schönsten klingen Stimmen mit „Erweitert“ oder „Premium“."
      : "Keine deutsche Stimme gefunden. Auf dem iPhone kannst du Stimmen laden – meist unter Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen → Deutsch (je nach iOS-Version etwas anders).";
  }

  function renderEinstellungen() {
    const e = einst();
    fuelleStimmen();
    $("#einst-tempo").value = e.tempo;
    $("#einst-tempo-wert").textContent = Number(e.tempo).toFixed(2).replace(".", ",") + "×";
    $("#einst-antwortzeit").value = e.antwortzeit;
    $("#einst-antwortzeit-wert").textContent = e.antwortzeit + " s";
    $("#einst-denkpause").value = e.denkpause;
    $("#einst-denkpause-wert").textContent = e.denkpause + " s";
    $("#einst-funfact").checked = !!e.funfactBeiRichtig;
    $("#einst-sounds").checked = !!e.sounds;
    $("#einst-hoermodus").checked = !!e.hoermodus;
    $("#version-info").textContent = CFG.name + " " + CFG.version + " · " + FRAGEN.length + " Fragen";
    renderProtokoll();
  }

  function protokollZeile(p, i) {
    const zeit = p.zeit ? new Date(p.zeit).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
    const teile = ["#" + (i + 1) + " " + zeit];
    if (p.art && p.art !== "erkennung") teile.push("[" + p.art + "]");
    if (p.frageId || p.frage) teile.push((p.frageId ? p.frageId + " " : "") + (p.frage ? "„" + p.frage + "“" : ""));
    if (p.erwartet) teile.push("erwartet: " + p.erwartet);
    if (p.erkannt) teile.push("erkannt: " + (p.erkannt.length ? p.erkannt.map((a) => "„" + a + "“").join(" / ") : "–"));
    if (p.wertung) teile.push("Wertung: " + p.wertung);
    if (p.fehler && p.fehler.length) teile.push("Fehlercodes: " + p.fehler.join(", "));
    if (p.dauerMs !== undefined) teile.push((p.dauerMs / 1000).toFixed(1) + " s" + (p.starts ? ", " + p.starts + " Mikro-Start(s)" : ""));
    if (p.nurZwischen) teile.push("nur Zwischenergebnis");
    if (p.frueh) teile.push("früh gewertet");
    return teile.join(" | ");
  }

  function renderProtokoll() {
    const ol = $("#protokoll-liste");
    ol.innerHTML = "";
    if (!daten.protokoll.length) {
      const li = document.createElement("li");
      li.textContent = "Noch leer. Nach der ersten Fahrt stehen hier die Erkennungen.";
      ol.appendChild(li);
      return;
    }
    daten.protokoll.forEach((p, i) => {
      const li = document.createElement("li");
      li.textContent = protokollZeile(p, i);
      ol.appendChild(li);
    });
  }

  function protokollText() {
    const kopf = [
      CFG.name + " " + CFG.version + " – Protokoll",
      "Erstellt: " + new Date().toLocaleString("de-DE"),
      "Gerät: " + navigator.userAgent,
      "Modus: " + (UMGEBUNG.standalone ? "Home-Bildschirm-App" : "Browser") + " · Spracherkennung: " + (SR ? "ja" : "nein") +
        " · Online: " + (navigator.onLine ? "ja" : "nein") + " · Wake Lock: " + ("wakeLock" in navigator ? "ja" : "nein"),
      "Stimme: " + ((Sprecher.stimme() || {}).name || "–") + " · Einstellungen: " + JSON.stringify(einst()),
      "Fahrten: " + daten.fahrten + " · Gemeistert: " + FRAGEN.filter((q) => istGemeistert(q.id)).length,
      ""
    ];
    return kopf.concat(daten.protokoll.map(protokollZeile)).join("\n");
  }

  async function kopiereProtokoll() {
    const text = protokollText();
    try {
      await navigator.clipboard.writeText(text);
      toast("Protokoll kopiert ✓");
      return;
    } catch (e) { /* Fallback */ }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    toast(ok ? "Protokoll kopiert ✓" : "Kopieren nicht möglich");
  }

  // ───── Technik-Check ─────
  let technikLauf = null;
  function technikAbbrechen() {
    if (technikLauf) { unterbrich("verlassen", technikLauf); technikLauf = null; }
  }
  function setzeCheck(id, status, loesungHtml, art) {
    const karte = $("#" + id);
    const icon = $(".check-icon", karte);
    icon.dataset.status = status;
    icon.textContent = { offen: "○", ok: "✓", fehler: "✗", warnung: "!", laeuft: "…" }[status] || "○";
    const lo = $(".check-loesung", karte);
    lo.className = "check-loesung" + (art === "ok" ? " ist-ok" : art === "warnung" ? " ist-warnung" : "");
    lo.innerHTML = loesungHtml || "";
    lo.hidden = !loesungHtml;
  }

  function technikTon() {
    Ton.init();
    Sprecher.entsperren();
    const karte = $("#check-ton");
    setzeCheck("check-ton", "laeuft");
    $('[data-aktion="ton-ja"]', karte).hidden = false;
    $('[data-aktion="ton-nein"]', karte).hidden = false;
    Ton.spiele("richtig");
    Sprecher.sprich("Hallo! Hier ist " + CFG.name + ". Wenn du mich hörst, funktioniert der Ton.", null);
  }
  function technikTonAntwort(gehoert) {
    if (gehoert) {
      setzeCheck("check-ton", "ok", "Super, der Ton klappt. Tipp: Im Auto vorher das Handy per Bluetooth verbinden und hier nochmal testen.", "ok");
    } else {
      setzeCheck("check-ton", "fehler",
        "<b>So klappt's:</b><ul>" +
        "<li>Lautstärke mit den Tasten an der Seite hochdrehen.</li>" +
        "<li>Lautlos-Modus ausschalten (Schalter oder Aktionstaste an der Seite) – je nach iOS-Version ist Web-Ton sonst stumm.</li>" +
        "<li>Im Auto: per Bluetooth verbinden und am Radio die Quelle Bluetooth bzw. Telefon wählen.</li>" +
        "<li>Seite neu laden und den Test wiederholen.</li></ul>");
    }
  }

  function istBereit(alts) {
    return (alts || []).some((a) => {
      const n = P.normalisiere(a, { fuellwoerter: false, zahlen: false });
      return n.split(" ").some((w) => w === "bereit" || P.levenshtein(w, "bereit") <= 1);
    });
  }

  function mikroLoesung(code) {
    const safari = UMGEBUNG.standalone ? "<li><b>Öffne die App in Safari</b> statt als Home-Bildschirm-Web-App:" + safariAnleitung() + "</li>" : "";
    switch (code) {
      case "nicht-verfuegbar":
        return "<b>Dieser Browser hat keine Spracherkennung.</b><ul>" + (safari || "<li>Nutze auf dem iPhone <b>Safari</b>.</li>") +
          "<li>Siri bzw. Diktieren muss aktiviert sein (in der Einstellungen-App unter Siri bzw. unter Allgemein → Tastatur → Diktierfunktion).</li></ul>";
      case "not-allowed":
        return "<b>Das Mikrofon ist für diese Website nicht erlaubt.</b><ul>" +
          "<li>In Safari in der Adressleiste auf das Seiten-Symbol (z. B. „aA“ oder ☰) tippen → Website-Einstellungen → Mikrofon → <b>Erlauben</b>.</li>" +
          "<li>In der Einstellungen-App unter Apps → Safari (bzw. Safari) → Mikrofon prüfen, dass es nicht auf „Ablehnen“ steht.</li>" +
          "<li>Danach die Seite neu laden und den Test wiederholen.</li>" + safari + "</ul>";
      case "service-not-allowed":
        return "<b>Die Spracherkennung ist nicht erlaubt.</b><ul>" +
          "<li>Siri bzw. Diktieren aktivieren: in der Einstellungen-App unter Siri und unter Allgemein → Tastatur → <b>Diktierfunktion</b> einschalten (Bezeichnungen je nach iOS-Version leicht anders).</li>" +
          "<li>Bildschirmzeit-Beschränkungen für Siri/Diktieren prüfen.</li>" + safari +
          "<li>Danach Safari schließen, neu öffnen und den Test wiederholen.</li></ul>";
      case "audio-capture":
        return "<b>Kein Mikrofon gefunden.</b><ul><li>Läuft gerade ein Anruf oder nutzt eine andere App das Mikrofon? Beenden und nochmal testen.</li><li>Im Auto: Bluetooth kurz trennen und den Test wiederholen.</li></ul>";
      case "network":
        return "<b>Keine Verbindung zur Spracherkennung.</b><ul><li>Prüfe die Internetverbindung (WLAN oder mobile Daten) und teste nochmal.</li><li>Im Funkloch wechselt die App während der Fahrt automatisch in den Hörmodus.</li></ul>";
      case "stille":
        return "<b>Ich habe nichts gehört.</b><ul><li>Nach dem Piepton deutlich „Ich bin bereit“ sagen.</li><li>Im Auto: Testen, ob das Auto-Mikrofon per Bluetooth genutzt wird – sonst das Handy näher halten.</li></ul>" + (safari ? "<ul>" + safari + "</ul>" : "");
      case "falsch":
        return "<b>Ich habe etwas anderes verstanden.</b><ul><li>Nochmal versuchen – ruhig und deutlich sprechen.</li><li>Laute Lüftung oder Musik ausschalten.</li></ul>";
      default:
        return "<b>Es hat nicht geklappt (" + esc(code) + ").</b><ul><li>Seite neu laden und nochmal testen.</li>" + safari + "</ul>";
    }
  }

  async function technikMikro() {
    const karte = $("#check-mikro");
    const erkannt = $(".check-erkannt", karte);
    if (technikLauf) return;
    if (!hoererVerfuegbar()) {
      setzeCheck("check-mikro", "fehler", mikroLoesung("nicht-verfuegbar"));
      return;
    }
    Ton.init();
    Sprecher.entsperren();
    const vorbereitung = Hoerer.vorwaermen();   // erster Mikro-Start im Tap
    const l = { grund: null, abbrecher: new Set() };
    technikLauf = l;
    setzeCheck("check-mikro", "laeuft");
    erkannt.hidden = false;
    erkannt.textContent = "Mikro wird vorbereitet …";
    try {
      const v = await vorbereitung;
      pruefeLauf(l);
      if (!v.ok) {
        protokolliere({ art: "technik", frage: "Technik-Check Mikro", erwartet: "ich bin bereit", erkannt: [], fehler: [v.code], wertung: "Fehler: " + v.code });
        setzeCheck("check-mikro", "fehler", mikroLoesung(v.code));
        erkannt.textContent = "Fehler: " + v.code;
        daten.erkennungOk = false; speichere();
        return;
      }
      await warte(350, l);
      erkannt.textContent = "Hör zu …";
      await sag("Sag jetzt: Ich bin bereit.", l);
      await warte(300, l);
      await ton("piep", l);
      erkannt.textContent = "🎙️ Ich höre zu …";
      const erg = await Hoerer.hoere({
        dauerMs: 7000, l,
        beiZwischen: (alts) => { erkannt.textContent = "„" + alts[0] + "“"; },
        pruefeZwischen: (alts) => istBereit(alts)
      });
      pruefeLauf(l);
      let code = null;
      if (erg.art === "ergebnis") code = istBereit(erg.alternativen) ? "ok" : "falsch";
      else if (erg.art === "stille") code = "stille";
      else if (erg.art === "fehler") code = erg.code;
      protokolliere({ art: "technik", frage: "Technik-Check Mikro", erwartet: "ich bin bereit", erkannt: erg.alternativen || [], fehler: erg.fehlerListe, dauerMs: erg.dauerMs, starts: erg.versuche, wertung: code });
      erkannt.textContent = erg.alternativen && erg.alternativen.length ? "Erkannt: „" + erg.alternativen[0] + "“" : "Nichts erkannt.";
      if (code === "ok") {
        daten.erkennungOk = true; speichere();
        setzeCheck("check-mikro", "ok", "Mikro und Spracherkennung funktionieren. 🎉", "ok");
        Ton.spiele("richtig");
        Sprecher.sprich("Perfekt, ich habe dich verstanden.", null);
      } else {
        if (code !== "falsch" && code !== "stille") { daten.erkennungOk = false; speichere(); }
        setzeCheck("check-mikro", "fehler", mikroLoesung(code));
        Ton.spiele("falsch");
      }
    } catch (e) {
      if (!(e instanceof Unterbrechung)) { systemLog("Technik-Check Mikro: " + e.message); setzeCheck("check-mikro", "fehler", mikroLoesung("unbekannt")); }
    } finally {
      if (technikLauf === l) technikLauf = null;
      renderStartHinweis();
    }
  }

  async function technikWach() {
    setzeCheck("check-wach", "laeuft");
    const modus = await Wach.an();
    if (modus === "wakelock") {
      setzeCheck("check-wach", "ok", "Der Bildschirm bleibt während der Fahrt an (Wake Lock aktiv).", "ok");
    } else if (modus === "video") {
      setzeCheck("check-wach", "warnung", "Ersatzlösung aktiv (stummes Video). Das klappt nicht auf jedem Gerät. Sicherer: in der Einstellungen-App unter Anzeige &amp; Helligkeit → Automatische Sperre für die Fahrt auf „Nie“ stellen.", "warnung");
    } else {
      setzeCheck("check-wach", "fehler", "Der Bildschirm kann nicht wach gehalten werden. Stelle in der Einstellungen-App unter Anzeige &amp; Helligkeit → Automatische Sperre für die Fahrt auf „Nie“. Tipp: Das Laden im Auto verhindert das Sperren nicht.");
    }
    setTimeout(() => { if (!fahrt) Wach.aus(); }, 1500);
  }

  function renderUmgebung() {
    const ul = $("#check-umgebung .umgebung-liste");
    const stimme = Sprecher.stimme();
    const zeilen = [
      ["Geöffnet als", UMGEBUNG.standalone ? "Home-Bildschirm-App" : UMGEBUNG.ios ? "Safari" : "Browser"],
      ["Spracherkennung", SR ? "verfügbar ✓" : "nicht verfügbar ✗"],
      ["Internet", navigator.onLine ? "online ✓" : "offline ✗"],
      ["Sichere Verbindung", UMGEBUNG.sicher ? "ja ✓" : "nein"],
      ["Offline-Start", swAktiv ? "bereit ✓" : (UMGEBUNG.datei ? "nicht bei lokaler Datei" : "noch nicht")],
      ["Deutsche Stimmen", Sprecher.stimmen.length + (stimme ? " · " + stimme.name : "")]
    ];
    ul.innerHTML = zeilen.map((z) => "<li><span>" + esc(z[0]) + "</span><span>" + esc(z[1]) + "</span></li>").join("");
    if (!SR) setzeCheck("check-umgebung", "fehler", mikroLoesung("nicht-verfuegbar"));
    else if (UMGEBUNG.standalone) setzeCheck("check-umgebung", daten.erkennungOk ? "ok" : "warnung",
      daten.erkennungOk ? "Die Spracherkennung hat hier im Test funktioniert. 👍" : "Du nutzt die Home-Bildschirm-App. Klappt das Mikro nicht, öffne die App in Safari:" + safariAnleitung(), daten.erkennungOk ? "ok" : "warnung");
    else if (!navigator.onLine) setzeCheck("check-umgebung", "warnung", "Du bist offline. Die App startet trotzdem, aber die Spracherkennung braucht meist Internet. Ohne Netz liest die App im Hörmodus vor.", "warnung");
    else setzeCheck("check-umgebung", "ok", "Alles bereit für die Fahrt.", "ok");
  }

  function oeffneTechnik() {
    UI.zeige("technik");
    renderUmgebung();
  }

  // ═════════ Debug-Hilfen (nur ?debug=1) ═════════
  function richteDebugEin() {
    if (!DEBUG) return;
    document.documentElement.classList.add("debug");
    $("#debug-panel").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#debug-eingabe");
      if (DebugHoerer.aktiv) DebugHoerer.aktiv.antworte(input.value);
      input.value = "";
    });
    $("#debug-stille").addEventListener("click", () => DebugHoerer.aktiv && DebugHoerer.aktiv.stille());
    $("#debug-netz").addEventListener("click", () => DebugHoerer.aktiv && DebugHoerer.aktiv.fehler("network"));
    $("#debug-verboten").addEventListener("click", () => DebugHoerer.aktiv && DebugHoerer.aktiv.fehler("not-allowed"));
    window.__debug = {
      antworte: (t) => { if (!DebugHoerer.aktiv) return false; DebugHoerer.aktiv.antworte(t); return true; },
      stille: () => { if (!DebugHoerer.aktiv) return false; DebugHoerer.aktiv.stille(); return true; },
      fehler: (c) => { if (!DebugHoerer.aktiv) return false; DebugHoerer.aktiv.fehler(c); return true; },
      hoertZu: () => !!DebugHoerer.aktiv,
      gesprochen: () => gesprochenLog.slice(),
      zustand: () => ({
        screen: UI.aktuell,
        status: $("#fahrt-status-text").textContent,
        zaehler: $("#fahrt-zaehler").textContent,
        hoertZu: !!DebugHoerer.aktiv,
        fahrt: fahrt ? {
          nummer: fahrt.nummer, gewertet: fahrt.gewertet, richtig: fahrt.richtig, gehoert: fahrt.gehoert,
          hoermodus: fahrt.hoermodus, inPause: fahrt.inPause, status: fahrt.status,
          frage: fahrt.aktuelle && fahrt.aktuelle.id, antwort: fahrt.aktuelle && fahrt.aktuelle.antwort,
          warteschlange: fahrt.warteschlange.slice()
        } : null,
        letztesErgebnis: ergebnisFahrt ? { gewertet: ergebnisFahrt.gewertet, richtig: ergebnisFahrt.richtig, versuche: ergebnisFahrt.versuche.length } : null,
        fahrten: daten.fahrten
      }),
      daten: () => daten,
      hintergrund: () => { if (fahrt && fahrt.status === "laeuft") { fahrt.status = "hintergrund"; unterbrich("hintergrund"); zeigeWeiterOverlay(); } }
    };
  }

  // ═════════ Start ═════════
  function zurStartseite() {
    technikAbbrechen();
    renderStart();
    UI.zeige("start");
  }

  function init() {
    document.title = CFG.name;
    $$("[data-app-name]").forEach((el) => { el.textContent = CFG.name; });

    $("#btn-technik").addEventListener("click", oeffneTechnik);
    $("#btn-einstellungen").addEventListener("click", () => { renderEinstellungen(); UI.zeige("einstellungen"); });
    $$("[data-zurueck]").forEach((b) => b.addEventListener("click", zurStartseite));

    $("#btn-intro-ok").addEventListener("click", () => { daten.introGesehen = true; speichere(); zurStartseite(); });
    $("#btn-intro-technik").addEventListener("click", () => { daten.introGesehen = true; speichere(); oeffneTechnik(); });

    // Fahrt
    $("#btn-stopp").addEventListener("click", () => { Ton.init(); beendeFahrt("knopf"); });
    $("#btn-skip").addEventListener("click", () => { if (fahrt && fahrt.status === "laeuft" && lauf && !lauf.grund) unterbrich("skip"); });
    $("#btn-pause-weiter").addEventListener("click", () => { Ton.init(); if (fahrt && lauf && !lauf.grund) unterbrich("weiter-tap"); });
    $("#btn-overlay-weiter").addEventListener("click", weiterNachHintergrund);
    $("#btn-overlay-ende").addEventListener("click", () => { Ton.init(); beendeFahrt("hintergrund"); });

    // Ergebnis
    $("#btn-ergebnis-nochmal").addEventListener("click", () => starteFahrt(ergebnisFahrt ? ergebnisFahrt.kat : "gemischt"));
    $("#btn-ergebnis-start").addEventListener("click", zurStartseite);

    // Einstellungen
    const setze = (schluessel, wert) => { daten.einstellungen[schluessel] = wert; speichere(); };
    $("#einst-stimme").addEventListener("change", (e) => setze("stimme", e.target.value));
    $("#btn-stimme-test").addEventListener("click", () => {
      Sprecher.entsperren();
      Sprecher.sprich("Hallo! Ich bin " + CFG.name + ". So klinge ich mit diesem Tempo.", null);
    });
    $("#einst-tempo").addEventListener("input", (e) => {
      setze("tempo", Number(e.target.value));
      $("#einst-tempo-wert").textContent = Number(e.target.value).toFixed(2).replace(".", ",") + "×";
    });
    $("#einst-antwortzeit").addEventListener("input", (e) => { setze("antwortzeit", Number(e.target.value)); $("#einst-antwortzeit-wert").textContent = e.target.value + " s"; });
    $("#einst-denkpause").addEventListener("input", (e) => { setze("denkpause", Number(e.target.value)); $("#einst-denkpause-wert").textContent = e.target.value + " s"; });
    $("#einst-funfact").addEventListener("change", (e) => setze("funfactBeiRichtig", e.target.checked));
    $("#einst-sounds").addEventListener("change", (e) => { setze("sounds", e.target.checked); if (e.target.checked) { Ton.init(); Ton.spiele("richtig"); } });
    $("#einst-hoermodus").addEventListener("change", (e) => setze("hoermodus", e.target.checked));
    $("#btn-protokoll-kopieren").addEventListener("click", kopiereProtokoll);
    $("#btn-protokoll-leeren").addEventListener("click", async () => {
      const ja = await zeigeDialog({ titel: "Protokoll leeren?", text: "Die gespeicherten Erkennungen werden gelöscht.", ja: "Leeren", nein: "Abbrechen" });
      if (ja) { daten.protokoll = []; speichere(); renderProtokoll(); }
    });
    $("#btn-reset").addEventListener("click", async () => {
      const ja = await zeigeDialog({
        titel: "Fortschritt zurücksetzen?",
        text: "Alle Lernstufen, gemeisterten Fragen und die Zahl der Fahrten werden gelöscht. Deine Einstellungen bleiben erhalten.",
        ja: "Ja, zurücksetzen", nein: "Abbrechen"
      });
      if (ja) {
        daten.fortschritt = {}; daten.fahrten = 0; daten.letzteFahrt = null;
        speichere();
        toast("Fortschritt zurückgesetzt");
      }
    });

    // Technik-Check
    $("#screen-technik").addEventListener("click", (e) => {
      const b = e.target.closest("[data-aktion]");
      if (!b) return;
      const a = b.dataset.aktion;
      if (a === "ton") technikTon();
      else if (a === "ton-ja") technikTonAntwort(true);
      else if (a === "ton-nein") technikTonAntwort(false);
      else if (a === "mikro") technikMikro();
      else if (a === "wach") technikWach();
    });

    // Hintergrund (Anruf, andere App): Fahrt pausieren
    const imHintergrund = () => {
      if (fahrt && fahrt.status === "laeuft") {
        fahrt.status = "hintergrund";
        unterbrich("hintergrund");
      }
      technikAbbrechen();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { imHintergrund(); return; }
      if (fahrt) {
        Wach.an();
        if (fahrt.status === "hintergrund") zeigeWeiterOverlay();
      }
    });
    window.addEventListener("pagehide", imHintergrund);
    window.addEventListener("online", () => { if (UI.aktuell === "technik") renderUmgebung(); });
    window.addEventListener("offline", () => { if (UI.aktuell === "technik") renderUmgebung(); });

    // Stimmen laden (kommen auf manchen Geräten verzögert)
    if (Sprecher.synth) {
      Sprecher.ladeStimmen();
      if (Sprecher.synth.addEventListener) Sprecher.synth.addEventListener("voiceschanged", () => Sprecher.ladeStimmen());
      else Sprecher.synth.onvoiceschanged = () => Sprecher.ladeStimmen();
    }

    richteDebugEin();
    renderStart();
    UI.zeige(daten.introGesehen ? "start" : "intro");

    // Service Worker (nicht unter file://)
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
        .then(() => { swAktiv = true; })
        .catch((e) => systemLog("Service Worker nicht registriert: " + e.message));
    }
  }

  init();
})();
