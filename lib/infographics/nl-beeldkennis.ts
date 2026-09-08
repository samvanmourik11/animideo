// NEDERLANDSE BEELDKENNIS.
//
// Beeldmodellen zijn getraind op overwegend Amerikaans materiaal. Vraag je om een
// rijbewijs, dan krijg je een geel-oranje Amerikaanse driver's license; vraag je
// om een brief van de belasting, dan komt er een wit envelopje. Voor een
// Nederlandse kijker is dat meteen fout: een rijbewijs is roze, de brief van de
// Belastingdienst is de blauwe envelop, en een woonstraat is een rijtje bakstenen
// huizen met identieke gevels — geen Amerikaanse houten huizen met een gazon.
//
// Dat zijn geen creatieve keuzes maar feiten, dus horen ze niet per prompt
// opnieuw bedacht te worden. Deze tabel plakt bij de trefwoorden die in de scene
// voorkomen het juiste uiterlijk aan de beeld-prompt. Alleen wat van toepassing
// is: een lijst van dertig feiten in elke prompt is ruis en verwatert de rest.

interface Beeldfeit {
  /** Kleingeschreven trefwoorden, NL en EN, waarop we in de scene zoeken. */
  trefwoorden: string[];
  /** Het uiterlijk, in het Engels — het gaat rechtstreeks naar het beeldmodel. */
  feit: string;
}

const FEITEN: Beeldfeit[] = [
  {
    trefwoorden: ["rijbewijs", "driving licence", "driver's license", "drivers license", "driving license"],
    feit: "A Dutch driving licence is a PINK credit-card-sized plastic card, in landscape format, with a small photo on the left and the Dutch coat of arms; never a white, yellow or blue American-style licence.",
  },
  {
    trefwoorden: ["paspoort", "passport"],
    feit: "A Dutch passport is a dark burgundy-red booklet with a gold coat of arms and gold lettering on the cover.",
  },
  {
    trefwoorden: ["identiteitskaart", "id-kaart", "identity card", "id card"],
    feit: "A Dutch identity card is a pale blue-grey credit-card-sized plastic card with a photo on the left.",
  },
  {
    trefwoorden: ["belasting", "belastingdienst", "aanslag", "tax letter", "tax bill", "tax office", "tax authority"],
    feit: "Post from the Dutch tax office is the well-known BLUE envelope: a plain deep-blue envelope with a white address window. The tax office's own colour is that same blue.",
  },
  {
    trefwoorden: ["envelop", "brief", "envelope", "letter from"],
    feit: "Dutch official letters arrive in a plain envelope with a rectangular address window on the left; letters from the government are often blue or white, never a manila American envelope.",
  },
  {
    trefwoorden: ["huis", "huizen", "woning", "straat", "wijk", "buurt", "house", "houses", "home", "street", "neighbourhood", "neighborhood", "terraced"],
    feit: "A Dutch residential street is a row of TERRACED brick houses ('rijtjeshuizen'): narrow, identical, joined side by side in one long row, two storeys with a pitched tiled roof, large ground-floor windows, a small or no front garden, and a brick-paved pavement. Never detached American wooden houses with lawns and driveways.",
  },
  {
    trefwoorden: ["gracht", "binnenstad", "canal", "old town", "historic centre", "historic center"],
    feit: "A Dutch old town is a row of tall, narrow brick canal houses with stepped or bell gables, standing shoulder to shoulder along a canal, with a bridge and moored boats.",
  },
  {
    trefwoorden: ["fiets", "fietsen", "bike", "bicycle", "cycling"],
    feit: "Dutch bicycles are upright black or coloured city bikes with a straight back, a chain guard and often panniers; cycle paths are red asphalt separated from the road.",
  },
  {
    trefwoorden: ["auto", "kenteken", "car", "licence plate", "license plate", "number plate"],
    feit: "Dutch cars have YELLOW rectangular number plates with black lettering, front and back.",
  },
  {
    trefwoorden: ["politie", "police"],
    feit: "Dutch police cars are white with a broad blue and orange-red diagonal striping and the word politie; officers wear dark blue uniforms. Never American black-and-white police cars.",
  },
  {
    trefwoorden: ["ambulance", "spoed", "ziekenwagen"],
    feit: "A Dutch ambulance is a bright yellow van with an orange-red stripe and blue lights.",
  },
  {
    trefwoorden: ["trein", "station", "ns ", "openbaar vervoer", "train", "public transport"],
    feit: "Dutch intercity trains are yellow with a blue stripe; stations have simple grey platforms with yellow signage.",
  },
  {
    trefwoorden: ["gemeente", "stadhuis", "loket", "town hall", "city hall", "municipality", "council"],
    feit: "A Dutch town hall is a plain modern brick or glass building with the municipal coat of arms and a service counter inside; not a domed American courthouse.",
  },
  {
    trefwoorden: ["geld", "euro", "bedrag", "salaris", "uitkering", "money", "salary", "benefit", "payment", "coins", "banknote"],
    feit: "Money is EUROS: coins with the € symbol and banknotes in euro colours (grey five, red ten, blue twenty, orange fifty). Never dollars, never a dollar sign.",
  },
  {
    trefwoorden: ["pinnen", "betalen", "kassa", "pin", "payment terminal", "checkout", "paying"],
    feit: "Paying in the Netherlands is done by card (pinnen) on a small handheld terminal, or with a phone; no cheques, and cash is rare.",
  },
  {
    trefwoorden: ["zorgverzekering", "zorgpas", "huisarts", "health insurance", "gp ", "general practitioner"],
    feit: "Dutch healthcare: a general practitioner works in a small neighbourhood practice, not a large hospital; an insurance card is a plain credit-card-sized card.",
  },
  {
    trefwoorden: ["digid", "inloggen", "online aanvragen", "log in", "apply online"],
    feit: "Dutch government services are used online via a plain, sober website on a laptop or phone, with a simple blue-and-white interface.",
  },
  {
    trefwoorden: ["postbode", "post", "pakket", "postman", "parcel", "mail"],
    feit: "Dutch post and parcels are delivered in orange-and-white vans and orange uniforms; letterboxes are a slot in the front door.",
  },
  {
    trefwoorden: ["landschap", "weiland", "platteland", "landscape", "countryside", "field", "meadow"],
    feit: "The Dutch landscape is completely FLAT: green polder meadows cut by straight ditches, black-and-white cows, a low horizon and a big cloudy sky. No hills or mountains.",
  },
  {
    trefwoorden: ["school", "klas", "onderwijs", "classroom", "education", "pupils", "students"],
    feit: "A Dutch classroom is a plain, bright room with tables in groups rather than rows, no uniforms, and children in ordinary everyday clothes.",
  },
  {
    trefwoorden: ["supermarkt", "boodschappen", "supermarket", "groceries"],
    feit: "A Dutch supermarket is a compact shop with narrow aisles, plastic crates and reusable bags; no giant American trolleys or paper bags.",
  },
];

/** Altijd meegegeven bij een Nederlandstalige video. */
const NL_ALGEMEEN =
  " DUTCH CONTEXT — this video is made for a Dutch audience, so draw everyday objects, documents, buildings, streets, " +
  "vehicles and signage the way they actually look in the Netherlands, not their American equivalents. Any people are " +
  "ordinary Dutch people in everyday clothing. Avoid tourist clichés — no tulips, windmills, clogs or cheese — unless " +
  "the subject is literally about them.";

const VL_ALGEMEEN =
  " FLEMISH CONTEXT — this video is made for a Flemish (Belgian) audience, so draw everyday objects, documents, " +
  "buildings, streets, vehicles and signage the way they actually look in Belgium, not their American equivalents. " +
  "Money is euros. Avoid tourist clichés unless the subject is literally about them.";

/**
 * Zoekt in de tekst van een scene (briefing, voice-over, labels) naar dingen
 * waarvan het Nederlandse uiterlijk vastligt, en geeft die feiten terug als
 * aanvulling op de beeld-prompt. Lege string bij een anderstalige video.
 */
export function nlBeeldkennis(language: string | null | undefined, ...teksten: (string | null | undefined)[]): string {
  const taal = (language ?? "Nederlands").trim();
  if (taal !== "Nederlands" && taal !== "Vlaams") return "";
  if (taal === "Vlaams") return VL_ALGEMEEN;

  const hooi = teksten.filter(Boolean).join(" ").toLowerCase();
  const geraakt = FEITEN.filter((f) => f.trefwoorden.some((t) => hooi.includes(t)))
    // Meer dan een handvol feiten verwatert de prompt; de eerste treffers zijn
    // de meest specifieke, want de tabel staat op volgorde van herkenbaarheid.
    .slice(0, 5)
    .map((f) => f.feit);

  return geraakt.length ? `${NL_ALGEMEEN} ${geraakt.join(" ")}` : NL_ALGEMEEN;
}

/** Korte versie voor de art-director, die de briefings schrijft. */
export const NL_REGIE_REGEL =
  "NEDERLANDSE CONTEXT: deze video is voor een Nederlands publiek. Beschrijf alledaagse dingen zoals ze in Nederland " +
  "écht zijn, en zet dat er in je briefing bij, want het beeldmodel maakt er anders een Amerikaanse versie van: een " +
  "rijbewijs is een ROZE pasje, post van de Belastingdienst is de blauwe envelop, een woonstraat is een rij bakstenen " +
  "rijtjeshuizen met identieke gevels, geld is euro's, kentekenplaten zijn geel, het landschap is vlak. Vermijd " +
  "toeristenclichés (tulpen, molens, klompen) tenzij het onderwerp daar letterlijk over gaat.";
