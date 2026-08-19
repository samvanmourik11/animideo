// ── Iconenbibliotheek ────────────────────────────────────────────────────────
//
// Eén keer met AI gemaakt, daarna gewoon plaatjes: gratis, direct beschikbaar en
// elke keer hetzelfde. Zelfde patroon als de muziekbibliotheek — het verschil
// tussen "de AI verzint elke keer opnieuw iets" en "je pakt wat je nodig hebt".
//
// Alle iconen zijn PNG met echte transparantie, vierkant, in dezelfde vlakke
// stijl als de video's die de tools maken. Ze staan in de publieke `icons`-bucket
// (scripts/generate-icon-library.mjs).
//
// `trefwoorden` is wat de zoekfunctie én de AI-editor gebruiken om "zet er een
// vrachtwagen bij" om te zetten naar een bestand. Nederlands én Engels, want de
// klant typt Nederlands en het model denkt vaak Engels.

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://suuskaaobsbttahqcoct.supabase.co";

export type IconCategorie =
  | "zakelijk"
  | "mensen"
  | "techniek"
  | "transport"
  | "bouw"
  | "zorg"
  | "wonen"
  | "eten"
  | "kennis"
  | "natuur"
  | "markering";

export interface IconCategorieInfo {
  id: IconCategorie;
  label: string;
}

export const ICON_CATEGORIEEN: IconCategorieInfo[] = [
  { id: "zakelijk", label: "Zakelijk & geld" },
  { id: "mensen", label: "Mensen & contact" },
  { id: "techniek", label: "Techniek & digitaal" },
  { id: "transport", label: "Transport & logistiek" },
  { id: "bouw", label: "Bouw & industrie" },
  { id: "zorg", label: "Zorg & gezondheid" },
  { id: "wonen", label: "Wonen & vastgoed" },
  { id: "eten", label: "Eten & horeca" },
  { id: "kennis", label: "Kennis & onderwijs" },
  { id: "natuur", label: "Natuur & duurzaam" },
  { id: "markering", label: "Markeringen & pijlen" },
];

export interface IconDefinitie {
  slug: string;
  label: string;
  categorie: IconCategorie;
  /** Wat het icoon moet voorstellen — gaat naar de beeldgenerator. */
  prompt: string;
  trefwoorden: string[];
}

export const ICONEN: IconDefinitie[] = [
  // ── Zakelijk & geld ───────────────────────────────────────────────────────
  { slug: "euro-munt", label: "Euromunt", categorie: "zakelijk", prompt: "a golden euro coin with the euro symbol", trefwoorden: ["euro", "geld", "munt", "money", "coin", "prijs"] },
  { slug: "stapel-munten", label: "Stapel munten", categorie: "zakelijk", prompt: "a stack of golden coins", trefwoorden: ["geld", "besparing", "winst", "savings", "kosten"] },
  { slug: "portemonnee", label: "Portemonnee", categorie: "zakelijk", prompt: "a brown leather wallet with banknotes sticking out", trefwoorden: ["portemonnee", "wallet", "betalen", "budget"] },
  { slug: "creditcard", label: "Creditcard", categorie: "zakelijk", prompt: "a blue credit card with a chip", trefwoorden: ["creditcard", "betalen", "card", "pinnen", "abonnement"] },
  { slug: "kluis", label: "Kluis", categorie: "zakelijk", prompt: "a metal safe with a combination dial, closed", trefwoorden: ["kluis", "safe", "veilig", "sparen", "beveiliging"] },
  { slug: "rekenmachine", label: "Rekenmachine", categorie: "zakelijk", prompt: "a calculator with buttons and a display", trefwoorden: ["rekenmachine", "calculator", "berekenen", "kosten", "offerte"] },
  { slug: "factuur", label: "Factuur", categorie: "zakelijk", prompt: "an invoice document with lines and a euro total", trefwoorden: ["factuur", "invoice", "rekening", "boekhouding", "administratie"] },
  { slug: "contract", label: "Contract", categorie: "zakelijk", prompt: "a contract document with a signature and a pen", trefwoorden: ["contract", "handtekening", "overeenkomst", "tekenen", "afspraak"] },
  { slug: "grafiek-omhoog", label: "Grafiek omhoog", categorie: "zakelijk", prompt: "a bar chart with an upward green arrow showing growth", trefwoorden: ["groei", "omhoog", "growth", "stijging", "resultaat", "omzet"] },
  { slug: "grafiek-omlaag", label: "Grafiek omlaag", categorie: "zakelijk", prompt: "a bar chart with a downward red arrow showing decline", trefwoorden: ["daling", "omlaag", "verlies", "decline", "krimp"] },
  { slug: "taartdiagram", label: "Taartdiagram", categorie: "zakelijk", prompt: "a colorful pie chart divided in segments", trefwoorden: ["taartdiagram", "verdeling", "aandeel", "pie chart", "marktaandeel"] },
  { slug: "doelwit", label: "Doelwit", categorie: "zakelijk", prompt: "a target board with a dart in the bullseye", trefwoorden: ["doel", "target", "doelstelling", "raak", "focus"] },
  { slug: "handdruk", label: "Handdruk", categorie: "zakelijk", prompt: "two hands shaking in a business handshake", trefwoorden: ["handdruk", "deal", "samenwerking", "akkoord", "partner"] },
  { slug: "korting", label: "Kortingslabel", categorie: "zakelijk", prompt: "a red price tag with a percent sign", trefwoorden: ["korting", "aanbieding", "sale", "procent", "actie"] },
  { slug: "winkelwagen", label: "Winkelwagen", categorie: "zakelijk", prompt: "a shopping cart", trefwoorden: ["winkelwagen", "webshop", "bestellen", "cart", "kopen"] },
  { slug: "prijskaartje", label: "Prijskaartje", categorie: "zakelijk", prompt: "a price tag hanging on a string", trefwoorden: ["prijs", "tag", "label", "kosten", "tarief"] },
  { slug: "trofee", label: "Trofee", categorie: "zakelijk", prompt: "a golden trophy cup", trefwoorden: ["trofee", "winnaar", "award", "prijs", "beste"] },
  { slug: "aktetas", label: "Aktetas", categorie: "zakelijk", prompt: "a brown business briefcase", trefwoorden: ["aktetas", "zakelijk", "werk", "business", "kantoor"] },

  // ── Mensen & contact ──────────────────────────────────────────────────────
  { slug: "persoon", label: "Persoon", categorie: "mensen", prompt: "a simple person avatar, head and shoulders", trefwoorden: ["persoon", "gebruiker", "user", "klant", "profiel"] },
  { slug: "team", label: "Team", categorie: "mensen", prompt: "a group of three people standing together", trefwoorden: ["team", "groep", "mensen", "collega", "medewerkers", "samen"] },
  { slug: "klantenservice", label: "Klantenservice", categorie: "mensen", prompt: "a support agent wearing a headset", trefwoorden: ["klantenservice", "support", "helpdesk", "hulp", "contact"] },
  { slug: "chatwolk", label: "Chatwolk", categorie: "mensen", prompt: "two overlapping speech bubbles", trefwoorden: ["chat", "gesprek", "bericht", "praten", "communicatie"] },
  { slug: "envelop", label: "Envelop", categorie: "mensen", prompt: "a closed white envelope", trefwoorden: ["mail", "email", "envelop", "bericht", "nieuwsbrief"] },
  { slug: "telefoon", label: "Telefoon", categorie: "mensen", prompt: "a classic telephone handset", trefwoorden: ["telefoon", "bellen", "contact", "phone"] },
  { slug: "megafoon", label: "Megafoon", categorie: "mensen", prompt: "a megaphone", trefwoorden: ["megafoon", "aankondiging", "marketing", "reclame", "aandacht"] },
  { slug: "sterbeoordeling", label: "Vijf sterren", categorie: "mensen", prompt: "five large golden five-pointed stars side by side in a horizontal row, filling the frame", trefwoorden: ["sterren", "beoordeling", "review", "rating", "tevreden"] },
  { slug: "duim-omhoog", label: "Duim omhoog", categorie: "mensen", prompt: "a hand giving a thumbs up", trefwoorden: ["duim", "goed", "like", "tevreden", "akkoord"] },
  { slug: "vraagteken", label: "Vraagteken", categorie: "mensen", prompt: "a large question mark", trefwoorden: ["vraag", "vraagteken", "hulp", "onduidelijk", "faq"] },
  { slug: "handwijzen", label: "Wijzende hand", categorie: "mensen", prompt: "a hand pointing with the index finger", trefwoorden: ["wijzen", "aandacht", "hier", "klik"] },
  { slug: "netwerk-mensen", label: "Netwerk", categorie: "mensen", prompt: "people icons connected by lines, a network", trefwoorden: ["netwerk", "verbinding", "community", "connectie", "doelgroep"] },

  // ── Techniek & digitaal ───────────────────────────────────────────────────
  { slug: "laptop", label: "Laptop", categorie: "techniek", prompt: "an open laptop computer", trefwoorden: ["laptop", "computer", "werken", "online", "software"] },
  { slug: "smartphone", label: "Smartphone", categorie: "techniek", prompt: "a modern smartphone, front view", trefwoorden: ["telefoon", "mobiel", "smartphone", "app", "mobile"] },
  { slug: "tablet", label: "Tablet", categorie: "techniek", prompt: "a tablet computer, front view", trefwoorden: ["tablet", "ipad", "scherm"] },
  { slug: "wolk", label: "Cloud", categorie: "techniek", prompt: "a simple cloud symbol for cloud computing", trefwoorden: ["cloud", "wolk", "opslag", "online", "back-up"] },
  { slug: "server", label: "Server", categorie: "techniek", prompt: "a server rack with status lights", trefwoorden: ["server", "hosting", "datacenter", "it"] },
  { slug: "database", label: "Database", categorie: "techniek", prompt: "a database symbol, stacked cylinders", trefwoorden: ["database", "data", "gegevens", "opslag"] },
  { slug: "wifi", label: "Wifi", categorie: "techniek", prompt: "a wifi signal symbol with arcs", trefwoorden: ["wifi", "internet", "verbinding", "netwerk"] },
  { slug: "slot-dicht", label: "Slot", categorie: "techniek", prompt: "a closed padlock", trefwoorden: ["slot", "beveiliging", "privacy", "veilig", "lock"] },
  { slug: "schild", label: "Schild", categorie: "techniek", prompt: "a protective shield with a checkmark", trefwoorden: ["schild", "beveiliging", "bescherming", "garantie", "veilig"] },
  { slug: "sleutel", label: "Sleutel", categorie: "techniek", prompt: "a golden key", trefwoorden: ["sleutel", "toegang", "key", "wachtwoord"] },
  { slug: "robot", label: "Robot", categorie: "techniek", prompt: "a friendly robot head", trefwoorden: ["robot", "ai", "automatisering", "bot", "kunstmatige intelligentie"] },
  { slug: "chip", label: "Chip", categorie: "techniek", prompt: "a light blue microchip square with golden pins on the sides and circuit lines on top", trefwoorden: ["chip", "processor", "techniek", "hardware", "ai"] },
  { slug: "tandwielen", label: "Tandwielen", categorie: "techniek", prompt: "two interlocking gears", trefwoorden: ["tandwiel", "instellingen", "proces", "automatisering", "techniek"] },
  { slug: "batterij", label: "Batterij", categorie: "techniek", prompt: "a battery with green charge bars", trefwoorden: ["batterij", "energie", "opladen", "accu", "stroom"] },
  { slug: "stekker", label: "Stekker", categorie: "techniek", prompt: "an electrical plug and socket", trefwoorden: ["stekker", "stroom", "aansluiten", "elektra"] },
  { slug: "grafiek-scherm", label: "Dashboard", categorie: "techniek", prompt: "a computer screen showing a dashboard with charts", trefwoorden: ["dashboard", "statistieken", "analyse", "rapport", "inzicht"] },

  // ── Transport & logistiek ─────────────────────────────────────────────────
  { slug: "vrachtwagen", label: "Vrachtwagen", categorie: "transport", prompt: "a delivery truck, side view", trefwoorden: ["vrachtwagen", "truck", "transport", "bezorging", "logistiek"] },
  { slug: "bestelbus", label: "Bestelbus", categorie: "transport", prompt: "a white delivery van, side view", trefwoorden: ["bus", "bestelbus", "van", "bezorgen", "monteur"] },
  { slug: "vliegtuig", label: "Vliegtuig", categorie: "transport", prompt: "a friendly cartoon passenger plane flying, side view", trefwoorden: ["vliegtuig", "luchtvracht", "reizen", "vliegen", "export"] },
  { slug: "schip", label: "Vrachtschip", categorie: "transport", prompt: "a cargo ship with containers", trefwoorden: ["schip", "zeevracht", "container", "haven", "import"] },
  { slug: "container", label: "Container", categorie: "transport", prompt: "a shipping container", trefwoorden: ["container", "vracht", "zeecontainer", "opslag"] },
  { slug: "pakket", label: "Pakket", categorie: "transport", prompt: "a cardboard parcel box with tape", trefwoorden: ["pakket", "doos", "bezorging", "zending", "verpakking"] },
  { slug: "magazijn", label: "Magazijn", categorie: "transport", prompt: "a warehouse building with a loading dock", trefwoorden: ["magazijn", "opslag", "distributie", "voorraad"] },
  { slug: "heftruck", label: "Heftruck", categorie: "transport", prompt: "a yellow forklift, side view", trefwoorden: ["heftruck", "magazijn", "laden", "logistiek"] },
  { slug: "kaartspeld", label: "Locatiespeld", categorie: "transport", prompt: "a red map location pin", trefwoorden: ["locatie", "adres", "kaart", "gps", "vestiging"] },
  { slug: "route", label: "Route", categorie: "transport", prompt: "a map with a dotted route line between two points", trefwoorden: ["route", "navigatie", "onderweg", "planning", "traject"] },
  { slug: "bezorgscooter", label: "Bezorgscooter", categorie: "transport", prompt: "a delivery scooter with a box on the back", trefwoorden: ["scooter", "bezorging", "maaltijd", "koerier", "snel"] },
  { slug: "auto", label: "Auto", categorie: "transport", prompt: "a compact car, side view", trefwoorden: ["auto", "wagen", "rijden", "car", "vervoer"] },

  // ── Bouw & industrie ──────────────────────────────────────────────────────
  { slug: "fabriek", label: "Fabriek", categorie: "bouw", prompt: "a factory building with chimneys", trefwoorden: ["fabriek", "productie", "industrie", "maakindustrie"] },
  { slug: "bouwhelm", label: "Bouwhelm", categorie: "bouw", prompt: "a yellow safety helmet", trefwoorden: ["helm", "bouw", "veiligheid", "vakman", "werk"] },
  { slug: "hijskraan", label: "Hijskraan", categorie: "bouw", prompt: "a construction tower crane", trefwoorden: ["kraan", "bouw", "project", "constructie"] },
  { slug: "gereedschapskist", label: "Gereedschapskist", categorie: "bouw", prompt: "a red toolbox with tools", trefwoorden: ["gereedschap", "toolbox", "onderhoud", "monteur", "reparatie"] },
  { slug: "moersleutel", label: "Moersleutel", categorie: "bouw", prompt: "a wrench", trefwoorden: ["sleutel", "moersleutel", "reparatie", "onderhoud", "service"] },
  { slug: "hamer", label: "Hamer", categorie: "bouw", prompt: "a claw hammer", trefwoorden: ["hamer", "klussen", "bouw", "timmerman"] },
  { slug: "verfkwast", label: "Verfkwast", categorie: "bouw", prompt: "a paint brush with paint on the tip", trefwoorden: ["verf", "kwast", "schilder", "afwerking", "renovatie"] },
  { slug: "zonnepaneel", label: "Zonnepaneel", categorie: "bouw", prompt: "a solar panel with sun reflection", trefwoorden: ["zonnepaneel", "duurzaam", "energie", "zonne-energie", "verduurzamen"] },
  { slug: "windmolen", label: "Windmolen", categorie: "bouw", prompt: "a modern wind turbine", trefwoorden: ["windmolen", "windenergie", "duurzaam", "groen"] },
  { slug: "steiger", label: "Steiger", categorie: "bouw", prompt: "scaffolding on a building facade", trefwoorden: ["steiger", "bouw", "renovatie", "gevel"] },

  // ── Zorg & gezondheid ─────────────────────────────────────────────────────
  { slug: "hart", label: "Hart", categorie: "zorg", prompt: "a red heart", trefwoorden: ["hart", "liefde", "gezondheid", "zorg", "favoriet"] },
  { slug: "stethoscoop", label: "Stethoscoop", categorie: "zorg", prompt: "a doctor's stethoscope", trefwoorden: ["dokter", "arts", "zorg", "gezondheid", "medisch"] },
  { slug: "ehbo-koffer", label: "EHBO-koffer", categorie: "zorg", prompt: "a first aid kit with a white cross", trefwoorden: ["ehbo", "eerste hulp", "medisch", "veiligheid", "noodgeval"] },
  { slug: "pil", label: "Medicijn", categorie: "zorg", prompt: "a capsule pill", trefwoorden: ["medicijn", "pil", "apotheek", "behandeling"] },
  { slug: "tand", label: "Tand", categorie: "zorg", prompt: "a clean white tooth", trefwoorden: ["tand", "tandarts", "gebit", "mondzorg"] },
  { slug: "sportschoen", label: "Sportschoen", categorie: "zorg", prompt: "a running shoe, side view", trefwoorden: ["sport", "bewegen", "hardlopen", "fitness", "gezond"] },
  { slug: "waterfles", label: "Waterfles", categorie: "zorg", prompt: "a water bottle", trefwoorden: ["water", "drinken", "hydratatie", "gezond", "sport"] },
  { slug: "slaap", label: "Slaap", categorie: "zorg", prompt: "a smooth yellow crescent moon", trefwoorden: ["slaap", "rust", "nacht", "herstel"] },

  // ── Wonen & vastgoed ──────────────────────────────────────────────────────
  { slug: "huis", label: "Huis", categorie: "wonen", prompt: "a simple house with a red roof", trefwoorden: ["huis", "woning", "thuis", "vastgoed", "makelaar"] },
  { slug: "appartement", label: "Appartement", categorie: "wonen", prompt: "an apartment building with many windows", trefwoorden: ["appartement", "flat", "wonen", "verhuur"] },
  { slug: "kantoorgebouw", label: "Kantoorgebouw", categorie: "wonen", prompt: "a modern office building", trefwoorden: ["kantoor", "gebouw", "bedrijf", "vestiging", "zakelijk"] },
  { slug: "te-koop-bord", label: "Te-koop-bord", categorie: "wonen", prompt: "a blank real estate sign on a post, empty sign board", trefwoorden: ["te koop", "bord", "makelaar", "verkoop", "vastgoed"] },
  { slug: "huissleutel", label: "Huissleutel", categorie: "wonen", prompt: "a house key with a house-shaped keychain", trefwoorden: ["sleutel", "oplevering", "verhuizen", "nieuwe woning"] },
  { slug: "verhuisdoos", label: "Verhuisdoos", categorie: "wonen", prompt: "a moving box with items sticking out", trefwoorden: ["verhuizen", "doos", "verhuizing", "inpakken"] },
  { slug: "bank", label: "Bank", categorie: "wonen", prompt: "a comfortable sofa", trefwoorden: ["bank", "interieur", "meubel", "woonkamer", "comfort"] },
  { slug: "tuin", label: "Tuin", categorie: "wonen", prompt: "a garden with grass, a bush and flowers", trefwoorden: ["tuin", "groen", "buiten", "hovenier"] },

  // ── Eten & horeca ─────────────────────────────────────────────────────────
  { slug: "koffie", label: "Koffie", categorie: "eten", prompt: "a cup of coffee with steam", trefwoorden: ["koffie", "pauze", "horeca", "drinken", "cafe"] },
  { slug: "pizza", label: "Pizza", categorie: "eten", prompt: "a slice of pizza", trefwoorden: ["pizza", "eten", "bezorging", "restaurant", "horeca"] },
  { slug: "boodschappentas", label: "Boodschappentas", categorie: "eten", prompt: "a paper grocery bag with vegetables sticking out", trefwoorden: ["boodschappen", "supermarkt", "tas", "winkelen"] },
  { slug: "appel", label: "Appel", categorie: "eten", prompt: "a fresh red apple with a green leaf", trefwoorden: ["appel", "fruit", "gezond", "eten", "vers"] },
  { slug: "menukaart", label: "Menukaart", categorie: "eten", prompt: "a restaurant menu card", trefwoorden: ["menu", "kaart", "restaurant", "gerechten", "horeca"] },
  { slug: "chefmuts", label: "Chef-muts", categorie: "eten", prompt: "a white chef hat", trefwoorden: ["chef", "koken", "keuken", "restaurant", "kok"] },
  { slug: "bord-bestek", label: "Bord met bestek", categorie: "eten", prompt: "a plate with a fork and knife beside it", trefwoorden: ["eten", "diner", "restaurant", "maaltijd", "bord"] },

  // ── Kennis & onderwijs ────────────────────────────────────────────────────
  { slug: "boek", label: "Boek", categorie: "kennis", prompt: "an open book", trefwoorden: ["boek", "lezen", "kennis", "handleiding", "leren"] },
  { slug: "diploma", label: "Diploma", categorie: "kennis", prompt: "a rolled diploma with a ribbon", trefwoorden: ["diploma", "certificaat", "opleiding", "geslaagd", "cursus"] },
  { slug: "gloeilamp", label: "Gloeilamp", categorie: "kennis", prompt: "a glowing light bulb, an idea", trefwoorden: ["idee", "lamp", "inspiratie", "oplossing", "creatief"] },
  { slug: "vergrootglas", label: "Vergrootglas", categorie: "kennis", prompt: "a magnifying glass", trefwoorden: ["zoeken", "onderzoek", "analyse", "vinden", "detail"] },
  { slug: "checklist", label: "Checklist", categorie: "kennis", prompt: "a clipboard with a checklist and checkmarks", trefwoorden: ["checklist", "stappen", "takenlijst", "controle", "plan"] },
  { slug: "kalender", label: "Kalender", categorie: "kennis", prompt: "a wall calendar page with a marked date", trefwoorden: ["kalender", "datum", "planning", "afspraak", "agenda"] },
  { slug: "klok", label: "Klok", categorie: "kennis", prompt: "a round wall clock", trefwoorden: ["klok", "tijd", "snel", "deadline", "wachttijd"] },
  { slug: "zandloper", label: "Zandloper", categorie: "kennis", prompt: "an hourglass with sand running", trefwoorden: ["zandloper", "tijd", "wachten", "duur", "geduld"] },
  { slug: "schoolbord", label: "Schoolbord", categorie: "kennis", prompt: "a green chalkboard on a stand", trefwoorden: ["schoolbord", "uitleg", "les", "training", "workshop"] },
  { slug: "document", label: "Document", categorie: "kennis", prompt: "a document sheet with text lines", trefwoorden: ["document", "papier", "rapport", "tekst", "formulier"] },
  { slug: "map", label: "Map", categorie: "kennis", prompt: "a yellow file folder", trefwoorden: ["map", "dossier", "archief", "bestanden", "administratie"] },

  // ── Natuur & duurzaam ─────────────────────────────────────────────────────
  { slug: "blad", label: "Blad", categorie: "natuur", prompt: "a green leaf", trefwoorden: ["blad", "groen", "duurzaam", "natuur", "milieu"] },
  { slug: "boom", label: "Boom", categorie: "natuur", prompt: "a tree with a green crown", trefwoorden: ["boom", "natuur", "groen", "co2", "milieu"] },
  { slug: "recycling", label: "Recycling", categorie: "natuur", prompt: "a green recycling symbol with three arrows", trefwoorden: ["recycling", "hergebruik", "duurzaam", "circulair", "afval"] },
  { slug: "zon", label: "Zon", categorie: "natuur", prompt: "a bright yellow sun with a round face and simple triangular rays", trefwoorden: ["zon", "weer", "warm", "zomer", "energie"] },
  { slug: "regenwolk", label: "Regenwolk", categorie: "natuur", prompt: "a grey cloud with rain drops", trefwoorden: ["regen", "weer", "wolk", "nat", "storm"] },
  { slug: "waterdruppel", label: "Waterdruppel", categorie: "natuur", prompt: "a blue water drop", trefwoorden: ["water", "druppel", "vocht", "lekkage", "besparing"] },
  { slug: "aardbol", label: "Aardbol", categorie: "natuur", prompt: "a globe showing continents", trefwoorden: ["wereld", "globaal", "internationaal", "aarde", "export"] },

  // ── Markeringen & pijlen ──────────────────────────────────────────────────
  { slug: "vinkje", label: "Vinkje", categorie: "markering", prompt: "a green checkmark in a circle", trefwoorden: ["vinkje", "goed", "klaar", "check", "akkoord", "gelukt"] },
  { slug: "kruisje", label: "Kruisje", categorie: "markering", prompt: "a bold red X mark, two crossed diagonal strokes, in a white circle", trefwoorden: ["kruis", "fout", "nee", "afgekeurd", "stop"] },
  { slug: "uitroepteken", label: "Uitroepteken", categorie: "markering", prompt: "an orange exclamation mark in a triangle", trefwoorden: ["let op", "waarschuwing", "belangrijk", "attentie", "risico"] },
  { slug: "pijl-rechts", label: "Pijl rechts", categorie: "markering", prompt: "a thick arrow pointing right", trefwoorden: ["pijl", "volgende", "richting", "verder", "rechts"] },
  { slug: "pijl-omhoog", label: "Pijl omhoog", categorie: "markering", prompt: "a thick arrow pointing up", trefwoorden: ["pijl", "omhoog", "stijging", "meer", "beter"] },
  { slug: "ster", label: "Ster", categorie: "markering", prompt: "a single golden star", trefwoorden: ["ster", "favoriet", "top", "kwaliteit", "uitgelicht"] },
  { slug: "bel", label: "Notificatiebel", categorie: "markering", prompt: "a notification bell", trefwoorden: ["bel", "melding", "herinnering", "notificatie", "attentie"] },
  { slug: "slinger", label: "Feestslinger", categorie: "markering", prompt: "a colorful party popper with bright confetti bursting out", trefwoorden: ["feest", "confetti", "jubileum", "viering", "gelukt"] },
  { slug: "stopwatch", label: "Stopwatch", categorie: "markering", prompt: "a stopwatch showing time", trefwoorden: ["stopwatch", "snelheid", "tijd", "snel", "prestatie"] },
  { slug: "slot-open", label: "Open slot", categorie: "markering", prompt: "an open padlock", trefwoorden: ["ontgrendeld", "toegang", "open", "vrijgegeven"] },
];

export function iconUrl(slug: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/icons/${slug}.png`;
}

export function iconenInCategorie(categorie: IconCategorie): IconDefinitie[] {
  return ICONEN.filter((i) => i.categorie === categorie);
}

/**
 * Zoekt het beste icoon bij een omschrijving. Gebruikt door de zoekbalk én door
 * de AI-editor: "zet er een vrachtwagen bij" hoort een bestaand icoon op te
 * leveren in plaats van een nieuwe generatie.
 */
// Woorden die niets zeggen over wélk icoon je zoekt. Zonder deze filter vond
// "zeppelin met kerstverlichting" een bord met bestek, puur door het woordje
// "met".
const VULWOORDEN = new Set([
  "een", "de", "het", "en", "met", "van", "in", "op", "voor", "er", "bij", "die",
  "dat", "of", "aan", "als", "naar", "zet", "maak", "plaats", "erbij", "icoon",
  "symbool", "plaatje", "a", "an", "the", "of", "with", "add", "put", "icon",
]);

export function zoekIconen(term: string, limiet = 24): IconDefinitie[] {
  const naald = term.toLowerCase().trim();
  if (!naald) return [];
  const woorden = naald
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !VULWOORDEN.has(w));
  if (woorden.length === 0) return [];

  const scores = ICONEN.map((icoon) => {
    const trefwoorden = new Set(icoon.trefwoorden.map((t) => t.toLowerCase()));
    const hooi = [icoon.slug, icoon.label.toLowerCase(), ...icoon.trefwoorden].join(" ").toLowerCase();

    let score = 0;
    woorden.forEach((woord, i) => {
      // In het Nederlands staat het zelfstandig naamwoord achteraan: bij
      // "groen vinkje" gaat het om het vinkje, niet om groen. Het laatste woord
      // weegt daarom zwaarder — anders wint een windmolen (die is ook "groen").
      const gewicht = i === woorden.length - 1 ? 2 : 1;
      if (trefwoorden.has(woord) || icoon.slug === woord) score += 3 * gewicht;
      else if (icoon.label.toLowerCase().includes(woord)) score += 2 * gewicht;
      else if (hooi.includes(woord)) score += 1 * gewicht;
    });
    return { icoon, score };
  });

  return scores
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limiet)
    .map((s) => s.icoon);
}

/** Precies één icoon, voor de AI-editor: de beste treffer of niets. */
export function besteIcoon(term: string): IconDefinitie | null {
  return zoekIconen(term, 1)[0] ?? null;
}
