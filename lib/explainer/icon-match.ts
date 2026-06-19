// Deterministische controle die een icoon koppelt aan de betekenis van een label.
// Voorkomt willekeurige iconen: het label/voice-over-onderwerp bepaalt het icoon.
// De keys zijn icon-keywords uit icons.tsx; de waarden zijn trigger-woorden (NL+EN).
// Volgorde = prioriteit (specifiek voor generiek).

const RULES: [string, string[]][] = [
  ["thermometer", ["temperatuur", "temperature", "warmte", "koud", "graden", "klimaat", "koeling"]],
  ["glass", ["breekbaar", "fragile", "kwetsbaar", "glas", "voorzichtig"]],
  ["gauge", ["druk", "pressure", "meter", "prestatie", "snelheidsmeter"]],
  ["shock", ["schok", "shock", "impact", "trilling", "stoot", "val"]],
  ["gps", ["locatie", "location", "gps", "plaats", "kaart", "positie", "bezorgadres"]],
  ["thermometer", ["temperatuurgevoelig"]],
  ["shield", ["veilig", "beveilig", "bescherming", "secure", "verzekerd", "verzegeld", "betrouwbaar", "garantie", "vertrouwen"]],
  ["lock", ["slot", "vergrendel", "privacy", "encryptie", "afgeschermd"]],
  ["key", ["sleutel", "key", "toegang", "ontsluit"]],
  ["users", ["klant", "klanten", "mensen", "team", "gebruikers", "medewerker", "doelgroep", "publiek", "leden", "personeel", "community"]],
  ["user", ["gebruiker", "persoon", "profiel", "account", "individu"]],
  ["truck", ["vrachtwagen", "transport", "bezorg", "levering", "wegtransport", "logistiek", "distributie"]],
  ["plane", ["vliegtuig", "luchtvracht", "vlucht", "luchtvaart", "vliegen", "luchthaven"]],
  ["ship", ["schip", "zeevracht", "container", "scheepvaart", "haven", "boot"]],
  ["building", ["gebouw", "kantoor", "vestiging", "pand", "filiaal"]],
  ["factory", ["fabriek", "productie", "industrie", "fabricage", "magazijn"]],
  ["box", ["doos", "pakket", "verpakking", "inpakken", "voorraad", "product", "zending"]],
  ["cart", ["winkel", "webshop", "bestelling", "order", "aankoop", "kopen", "winkelwagen", "conversie"]],
  ["euro", ["euro", "omzet", "prijs", "bedrag", "geld", "winst", "kosten", "budget", "betaling", "miljoen", "verkoop", "revenue"]],
  ["money", ["geldstroom", "kasstroom", "investering", "financ"]],
  ["percent", ["procent", "percentage", "aandeel", "ratio"]],
  ["creditcard", ["betaal", "afreken", "creditcard", "pinnen"]],
  ["growth", ["groei", "stijg", "toename", "omhoog", "growth", "verbeter", "boost", "meer", "opwaarts"]],
  ["decline", ["daling", "afname", "omlaag", "minder", "reductie", "retour", "verlaag", "krimp"]],
  ["target", ["doel", "target", "focus", "ambitie", "mikpunt", "nauwkeurig", "precisie"]],
  ["star", ["kwaliteit", "beoordeling", "review", "favoriet", "ster", "tevredenheid", "nps", "rating", "topkwaliteit"]],
  ["award", ["award", "winnaar", "erkenning", "certificaat", "prijswinnend", "beste", "medaille"]],
  ["heart", ["loyaliteit", "betrokkenheid", "gezondheid", "liefde", "favoriet", "welzijn"]],
  ["thumbsup", ["aanbeveling", "aanbevel", "goedkeuring", "positief", "like", "duim"]],
  ["chart", ["grafiek", "data", "statistiek", "cijfer", "rapport", "analyse", "dashboard", "meetwaarde", "resultaten"]],
  ["document", ["document", "rapport", "contract", "papier", "bestand", "factuur", "formulier", "tekst"]],
  ["mail", ["mail", "email", "e-mail", "nieuwsbrief"]],
  ["phone", ["telefoon", "bellen", "mobiel", "smartphone"]],
  ["chat", ["chat", "gesprek", "support", "communicatie", "klantenservice", "berichten"]],
  ["send", ["verzend", "verstuur", "versturen", "leveren", "transmissie", "doorsturen"]],
  ["bell", ["melding", "notificatie", "alert", "waarschuwing", "herinnering", "sms"]],
  ["gear", ["instelling", "proces", "techniek", "configuratie", "automatis", "systeem", "machine", "werking", "instellingen"]],
  ["clock", ["tijd", "klok", "snel", "uur", "duur", "wachttijd", "realtime", "direct", "24/7", "moment"]],
  ["calendar", ["datum", "planning", "agenda", "maand", "jaar", "kalender", "periode", "deadline"]],
  ["globe", ["wereld", "global", "internationaal", "wereldwijd", "landen", "markten", "europa", "online"]],
  ["wifi", ["verbinding", "wifi", "draadloos", "connectiviteit", "netwerk", "iot"]],
  ["signal", ["signaal", "bereik", "sterkte"]],
  ["cloud", ["cloud", "opslag", "back-up", "server"]],
  ["battery", ["batterij", "energie", "accu", "levensduur", "stroom"]],
  ["link", ["koppeling", "integratie", "verbinden", "schakel", "keten"]],
  ["refresh", ["vernieuw", "herhaal", "sync", "update", "cyclus", "terugkerend"]],
  ["bulb", ["licht", "idee", "innovatie", "inzicht", "slim", "creatief", "oplossing"]],
  ["motion", ["beweging", "motion", "verplaatsing", "onderweg"]],
  ["compass", ["richting", "navigatie", "koers", "kompas", "strategie"]],
  ["search", ["zoek", "vinden", "onderzoek", "ontdek", "monitor"]],
  ["eye", ["zicht", "inzicht", "bekijk", "transparant", "overzicht", "view", "volgen"]],
  ["rocket", ["lancer", "launch", "start", "opstart", "versnel", "raket"]],
  ["leaf", ["duurzaam", "groen", "milieu", "eco", "natuur", "co2", "klimaatneutraal"]],
  ["flag", ["mijlpaal", "vlag", "doelpaal", "markering"]],
  ["check", ["klaar", "gereed", "voltooid", "goedgekeurd", "akkoord", "afgerond", "succes", "compleet", "gedaan"]],
  ["warning", ["waarschuwing", "risico", "gevaar", "let op", "probleem", "fout"]],
  ["info", ["informatie", "uitleg", "details", "toelichting"]],
];

const norm = (s: string) => s.toLowerCase();

/** Beste icoon voor een label, of null als geen enkel trefwoord matcht. */
export function matchIcon(label: string): string | null {
  const t = norm(label);
  for (const [icon, kws] of RULES) {
    for (const kw of kws) {
      if (t.includes(kw)) return icon;
    }
  }
  return null;
}

// Zelfde controle voor de centrale illustratie. Volgorde = prioriteit (specifiek
// voor generiek; monitor laatst als brede vangnet voor software/data-scenes).
const ILLO_RULES: [string, string[]][] = [
  ["sensor", ["sensor", "tracker", "iot", "meetapparaat", "device", "meetinstrument", "slim apparaat"]],
  ["truck", ["vrachtwagen", "wegtransport", "bezorg", "levering", "distributie", "logistiek", "bestelbus", "transporteur"]],
  ["plane", ["vliegtuig", "luchtvracht", "vlucht", "luchtvaart", "luchthaven", "vliegen"]],
  ["ship", ["schip", "zeevracht", "container", "scheepvaart", "haven", "verscheping", "boot"]],
  ["boxes", ["doos", "pakket", "verpakking", "voorraad", "zending", "vracht", "cargo", "goederen", "product", "magazijn", "inpak", "artikel"]],
  ["building", ["gebouw", "kantoor", "vestiging", "pand", "filiaal", "hoofdkantoor", "bedrijfspand"]],
  ["monitor", ["scherm", "monitor", "dashboard", "software", "platform", "applicatie", "app", "online", "digitaal", "computer", "data", "rapport", "systeem", "website", "realtime", "inzicht", "overzicht", "meet"]],
];

/** Beste centrale illustratie voor de tekst van een scene, of null. */
export function matchIllustration(text: string): string | null {
  const t = norm(text);
  for (const [illo, kws] of ILLO_RULES) {
    for (const kw of kws) {
      if (t.includes(kw)) return illo;
    }
  }
  return null;
}
