// HET RECEPTENBOEK — de één-klik-effecten en apps van de nieuwe app.
//
// Een recept is wat Higgsfield een "preset" noemt: één model + een vaste, goed geschreven
// opdracht + wat de klant moet aanleveren (meestal één foto). Een nieuw effect toevoegen
// is hier een item bij, plus de bijbehorende opdracht in recepten-opdrachten.ts.
//
// Dit bestand is client-veilig en bevat alleen wat de klant mag zien. De opdrachten zelf
// staan apart, alleen op de server: daar zit het vakmanschap, dat hoeft niet in de browser.

import { CREDIT_COSTS } from "@/lib/credit-costs";
import { videoModel } from "@/lib/video-modellen";

export type ReceptSoort = "beeld" | "video";

export type ReceptGroep =
  | "effect"
  | "bedrijf"
  | "nederland"
  | "personage"
  | "fun"
  | "branche";

/** De branches met eigen sjablonen (fase 4). Zie BRANCHES onderaan. */
export type BrancheId = "zorg" | "onderwijs" | "gemeente" | "horeca" | "makelaar" | "installateur";

export interface Recept {
  id: string;
  naam: string;
  /** Eén zin: wat er gebeurt, in gewone taal. */
  uitleg: string;
  icoon: string;
  /** Tailwind-gradient voor de tegel, zolang er nog geen voorbeeldbeeld is. */
  kleur: string;
  groep: ReceptGroep;
  soort: ReceptSoort;
  credits: number;
  /** Wat de foto moet zijn ("Een foto van jezelf", "Een foto van je product"). */
  fotoLabel: string;
  /** Optioneel extra tekstveld, bv. welke outfit of welke sfeer. */
  tekst?: { label: string; placeholder: string; verplicht?: boolean };
  /** Er staat een herkenbaar gezicht op: toestemming vragen vóór het maken. */
  gezicht?: boolean;
  /** Komt in "Nieuw" op Ontdek. */
  nieuw?: boolean;
  /** Alleen bij groep "branche": bij welke branche het sjabloon hoort. */
  branche?: BrancheId;
  /**
   * Geen foto nodig: het beeld komt helemaal uit de tekst (een poster, een vacature-post).
   * Dan is het tekstveld verplicht en kiest de klant zelf het formaat.
   */
  zonderFoto?: { formaat: "1:1" | "9:16" | "16:9" };
}

/** Het videomodel van de effecten: het beste in de beweging van mensen. */
export const EFFECT_MODEL = "kling-2-5";

const BEELD = CREDIT_COSTS.IMAGE_GENERATION;
const BEELD_PRO = CREDIT_COSTS.IMAGE_GENERATION_PRO;
const EFFECT = videoModel(EFFECT_MODEL).credits;

export const RECEPTEN: Recept[] = [
  // ── Effecten (video) ────────────────────────────────────────────────
  { id: "smelten", naam: "Smelten", uitleg: "Je smelt langzaam weg tot een glanzende plas.", icoon: "🫠", kleur: "from-orange-500/30", groep: "effect", soort: "video", credits: EFFECT, fotoLabel: "Een foto van jezelf, van top tot teen", gezicht: true, nieuw: true },
  { id: "verdwijnen", naam: "Verdwijnen", uitleg: "Je lichaam verdwijnt, je kleren vallen op de grond.", icoon: "👻", kleur: "from-slate-400/30", groep: "effect", soort: "video", credits: EFFECT, fotoLabel: "Een foto van jezelf, van top tot teen", gezicht: true },
  { id: "bullet-time", naam: "Bullet time", uitleg: "De tijd staat stil en de camera draait om je heen.", icoon: "⏱️", kleur: "from-sky-500/30", groep: "effect", soort: "video", credits: EFFECT, fotoLabel: "Een foto met iemand in actie", gezicht: true },
  { id: "uitzoomen-ruimte", naam: "Naar de ruimte", uitleg: "De camera schiet omhoog, door de wolken, tot je de aarde ziet.", icoon: "🌍", kleur: "from-indigo-500/30", groep: "effect", soort: "video", credits: EFFECT, fotoLabel: "Een foto buiten, op straat of in de natuur", nieuw: true },
  { id: "confetti", naam: "Confetti!", uitleg: "Een explosie van confetti en feestelijk gejuich.", icoon: "🎉", kleur: "from-pink-500/30", groep: "effect", soort: "video", credits: EFFECT, fotoLabel: "Een foto van een persoon of een product" },
  { id: "tot-leven", naam: "Schilderij komt tot leven", uitleg: "Een foto of schilderij gaat langzaam bewegen, ogen knipperen.", icoon: "🖼️", kleur: "from-amber-500/30", groep: "effect", soort: "video", credits: EFFECT, fotoLabel: "Een portret of schilderij" },
  { id: "product-draai", naam: "Product draait rond", uitleg: "Je product draait langzaam rond in een strakke studio.", icoon: "🔄", kleur: "from-emerald-500/30", groep: "effect", soort: "video", credits: EFFECT, fotoLabel: "Een foto van je product" },

  // ── Voor bedrijven ──────────────────────────────────────────────────
  { id: "productfoto", naam: "Productfoto-studio", uitleg: "Je product als professionele studiofoto op een strakke achtergrond.", icoon: "📦", kleur: "from-blue-500/30", groep: "bedrijf", soort: "beeld", credits: BEELD_PRO, fotoLabel: "Een foto van je product (mag met je telefoon)", tekst: { label: "Achtergrond (mag leeg)", placeholder: "Bijvoorbeeld: zacht beige, marmer, buiten in het gras" }, nieuw: true },
  { id: "product-sfeer", naam: "Product in sfeer", uitleg: "Je product in een echte situatie: op tafel, in een woonkamer, buiten.", icoon: "🛋️", kleur: "from-teal-500/30", groep: "bedrijf", soort: "beeld", credits: BEELD_PRO, fotoLabel: "Een foto van je product", tekst: { label: "Waar moet het staan?", placeholder: "Bijvoorbeeld: op een ontbijttafel in een lichte keuken" } },
  { id: "billboard", naam: "Billboard langs de snelweg", uitleg: "Jouw beeld of logo op een groot billboard langs de A2.", icoon: "🛣️", kleur: "from-yellow-500/30", groep: "bedrijf", soort: "beeld", credits: BEELD, fotoLabel: "Je advertentie, logo of productfoto" },
  { id: "abri", naam: "Poster in bushokje", uitleg: "Jouw beeld als verlichte poster in een bushokje in de stad.", icoon: "🚏", kleur: "from-cyan-500/30", groep: "bedrijf", soort: "beeld", credits: BEELD, fotoLabel: "Je poster of advertentie" },
  { id: "profielfoto", naam: "Zakelijke profielfoto", uitleg: "Van een selfie naar een nette studiofoto voor LinkedIn of je website.", icoon: "👔", kleur: "from-slate-500/30", groep: "bedrijf", soort: "beeld", credits: BEELD_PRO, fotoLabel: "Een duidelijke foto van je gezicht", gezicht: true, nieuw: true },

  // ── Typisch Nederlands ──────────────────────────────────────────────
  { id: "vermeer", naam: "Jij als Vermeer", uitleg: "Jij als het Meisje met de parel, in olieverf.", icoon: "🦪", kleur: "from-blue-600/30", groep: "nederland", soort: "beeld", credits: BEELD, fotoLabel: "Een duidelijke foto van je gezicht", gezicht: true, nieuw: true },
  { id: "rembrandt", naam: "Rembrandt-portret", uitleg: "Een donker, dramatisch portret met het licht van Rembrandt.", icoon: "🎨", kleur: "from-amber-700/30", groep: "nederland", soort: "beeld", credits: BEELD, fotoLabel: "Een duidelijke foto van je gezicht", gezicht: true },
  { id: "van-gogh", naam: "Van Gogh-stijl", uitleg: "Je foto geschilderd met de dikke, wervelende streken van Van Gogh.", icoon: "🌻", kleur: "from-yellow-500/30", groep: "nederland", soort: "beeld", credits: BEELD, fotoLabel: "Een foto van jezelf of een plek" },
  { id: "delfts-blauw", naam: "Delfts blauw", uitleg: "Je foto als handbeschilderd Delfts-blauw tegeltje.", icoon: "🫖", kleur: "from-blue-500/30", groep: "nederland", soort: "beeld", credits: BEELD, fotoLabel: "Een foto van jezelf, je huisdier of je huis" },
  { id: "koningsdag", naam: "Koningsdag", uitleg: "Jij in het oranje op een boot door de Amsterdamse grachten.", icoon: "👑", kleur: "from-orange-500/30", groep: "nederland", soort: "beeld", credits: BEELD, fotoLabel: "Een duidelijke foto van jezelf", gezicht: true },
  { id: "elfstedentocht", naam: "Elfstedentocht", uitleg: "Jij op de schaats tussen de knotwilgen, met ijspegels in je muts.", icoon: "⛸️", kleur: "from-sky-400/30", groep: "nederland", soort: "beeld", credits: BEELD, fotoLabel: "Een duidelijke foto van jezelf", gezicht: true },
  { id: "pakjesavond", naam: "Pakjesavond", uitleg: "Een warme pakjesavond-foto bij de open haard, vol cadeautjes.", icoon: "🎁", kleur: "from-red-500/30", groep: "nederland", soort: "beeld", credits: BEELD, fotoLabel: "Een foto van jezelf of je gezin", gezicht: true },

  // ── Personage & stijl ───────────────────────────────────────────────
  { id: "actiefiguur", naam: "Jij als actiefiguur", uitleg: "Jij als speelgoedfiguur in een doos, met accessoires.", icoon: "🧸", kleur: "from-fuchsia-500/30", groep: "personage", soort: "beeld", credits: BEELD, fotoLabel: "Een foto van jezelf", tekst: { label: "Welke accessoires?", placeholder: "Bijvoorbeeld: laptop, koffiebeker, fiets" }, gezicht: true },
  { id: "knuffel", naam: "Jij als knuffel", uitleg: "Een zachte, pluizige knuffelversie van jou of je huisdier.", icoon: "🧶", kleur: "from-rose-400/30", groep: "personage", soort: "beeld", credits: BEELD, fotoLabel: "Een foto van jezelf of je huisdier" },
  { id: "game", naam: "Jij in een game", uitleg: "Jij als 3D-personage in een kleurrijke videogame.", icoon: "🎮", kleur: "from-violet-500/30", groep: "personage", soort: "beeld", credits: BEELD, fotoLabel: "Een foto van jezelf", gezicht: true },
  { id: "tekenfilm", naam: "Tekenfilmfiguur", uitleg: "Jij als vrolijk 3D-tekenfilmpersonage.", icoon: "✨", kleur: "from-purple-500/30", groep: "personage", soort: "beeld", credits: BEELD, fotoLabel: "Een foto van jezelf", gezicht: true },
  { id: "outfit", naam: "Andere outfit", uitleg: "Dezelfde foto, maar in een andere outfit.", icoon: "👗", kleur: "from-pink-500/30", groep: "personage", soort: "beeld", credits: BEELD, fotoLabel: "Een foto van jezelf, liefst van top tot teen", tekst: { label: "Welke outfit?", placeholder: "Bijvoorbeeld: een donkerblauw pak met witte sneakers", verplicht: true }, gezicht: true },

  // ── Voor de grap ────────────────────────────────────────────────────
  { id: "jaren-80", naam: "Jaren-80-foto", uitleg: "Jij op een verkleurde schoolfoto uit 1985.", icoon: "📼", kleur: "from-lime-500/30", groep: "fun", soort: "beeld", credits: BEELD, fotoLabel: "Een duidelijke foto van jezelf", gezicht: true },
  { id: "huisdier-mens", naam: "Huisdier als mens", uitleg: "Hoe zou je hond of kat eruitzien als mens?", icoon: "🐶", kleur: "from-amber-400/30", groep: "fun", soort: "beeld", credits: BEELD, fotoLabel: "Een foto van je huisdier" },

  // ── Sjablonen per branche (fase 4) ──────────────────────────────────
  // Zorg & welzijn
  { id: "zorg-vacature", naam: "Vacature-post", uitleg: "Een warme social-post voor je vacature, met de functie er groot in.", icoon: "📣", kleur: "from-rose-400/30", groep: "branche", branche: "zorg", soort: "beeld", credits: BEELD_PRO, fotoLabel: "", tekst: { label: "Welke functie?", placeholder: "Bijvoorbeeld: Verzorgende IG, 24 uur", verplicht: true }, zonderFoto: { formaat: "1:1" } },
  { id: "zorg-wachtkamer", naam: "Poster voor de wachtkamer", uitleg: "Een vriendelijke, rustige poster met jouw boodschap.", icoon: "🪧", kleur: "from-teal-400/30", groep: "branche", branche: "zorg", soort: "beeld", credits: BEELD_PRO, fotoLabel: "", tekst: { label: "Wat moet er op de poster?", placeholder: "Bijvoorbeeld: Griepprik halen? Vraag het aan de balie", verplicht: true }, zonderFoto: { formaat: "9:16" } },
  { id: "zorg-uitleg", naam: "Uitleg-illustratie", uitleg: "Een heldere tekening bij een folder of website: geen ingewikkeld plaatje.", icoon: "🩺", kleur: "from-sky-400/30", groep: "branche", branche: "zorg", soort: "beeld", credits: BEELD, fotoLabel: "", tekst: { label: "Wat moet de tekening laten zien?", placeholder: "Bijvoorbeeld: hoe je een steunkous aantrekt", verplicht: true }, zonderFoto: { formaat: "16:9" } },
  { id: "zorg-portret", naam: "Teamfoto voor de website", uitleg: "Van een snelle foto naar een nette, warme portretfoto in zorgsetting.", icoon: "🧑‍⚕️", kleur: "from-emerald-400/30", groep: "branche", branche: "zorg", soort: "beeld", credits: BEELD_PRO, fotoLabel: "Een duidelijke foto van de medewerker", gezicht: true },

  // Onderwijs
  { id: "onderwijs-opendag", naam: "Poster open dag", uitleg: "Een vrolijke poster voor je open dag of informatieavond.", icoon: "🏫", kleur: "from-amber-400/30", groep: "branche", branche: "onderwijs", soort: "beeld", credits: BEELD_PRO, fotoLabel: "", tekst: { label: "Naam school, datum en tijd", placeholder: "Bijvoorbeeld: De Regenboog, open dag za 15 maart 10-13 uur", verplicht: true }, zonderFoto: { formaat: "9:16" } },
  { id: "onderwijs-les", naam: "Plaat bij een les", uitleg: "Een duidelijke, kleurrijke tekening om iets uit te leggen in de klas.", icoon: "📚", kleur: "from-lime-400/30", groep: "branche", branche: "onderwijs", soort: "beeld", credits: BEELD, fotoLabel: "", tekst: { label: "Waar gaat de les over?", placeholder: "Bijvoorbeeld: de kringloop van water", verplicht: true }, zonderFoto: { formaat: "16:9" } },
  { id: "onderwijs-vacature", naam: "Vacature-post", uitleg: "Een social-post om een leerkracht of medewerker te vinden.", icoon: "📣", kleur: "from-orange-400/30", groep: "branche", branche: "onderwijs", soort: "beeld", credits: BEELD_PRO, fotoLabel: "", tekst: { label: "Welke functie?", placeholder: "Bijvoorbeeld: Leerkracht groep 5, 0,8 fte", verplicht: true }, zonderFoto: { formaat: "1:1" } },
  { id: "onderwijs-tijdreis", naam: "Klassenfoto als tijdreis", uitleg: "Een groepsfoto alsof hij in 1955 op het schoolplein is genomen.", icoon: "🕰️", kleur: "from-stone-400/30", groep: "branche", branche: "onderwijs", soort: "beeld", credits: BEELD, fotoLabel: "Een groepsfoto (alleen met toestemming van ouders)", gezicht: true },

  // Gemeente
  { id: "gemeente-plan", naam: "Zo wordt het", uitleg: "Een foto van een straat of plein, en hoe het eruitziet na de verbouwing.", icoon: "🏗️", kleur: "from-green-500/30", groep: "branche", branche: "gemeente", soort: "beeld", credits: BEELD_PRO, fotoLabel: "Een foto van de straat, het plein of het park", tekst: { label: "Wat verandert er?", placeholder: "Bijvoorbeeld: meer bomen, een fietspad en bankjes", verplicht: true } },
  { id: "gemeente-campagne", naam: "Campagneposter", uitleg: "Een opvallende poster voor een campagne: afval scheiden, buurtfeest, verkiezingen.", icoon: "📢", kleur: "from-blue-500/30", groep: "branche", branche: "gemeente", soort: "beeld", credits: BEELD_PRO, fotoLabel: "", tekst: { label: "Wat is de boodschap?", placeholder: "Bijvoorbeeld: Plastic? Gewoon in de oranje bak!", verplicht: true }, zonderFoto: { formaat: "9:16" } },
  { id: "gemeente-nieuws", naam: "Beeld bij nieuwsbericht", uitleg: "Een passend beeld voor de website of social media, zonder rechtenproblemen.", icoon: "📰", kleur: "from-indigo-400/30", groep: "branche", branche: "gemeente", soort: "beeld", credits: BEELD, fotoLabel: "", tekst: { label: "Waar gaat het bericht over?", placeholder: "Bijvoorbeeld: de nieuwe bibliotheek in het centrum gaat open", verplicht: true }, zonderFoto: { formaat: "16:9" } },

  // Horeca
  { id: "horeca-gerecht", naam: "Gerecht als menukaartfoto", uitleg: "Een snelle foto van je bord wordt een foto voor de menukaart.", icoon: "🍽️", kleur: "from-orange-500/30", groep: "branche", branche: "horeca", soort: "beeld", credits: BEELD_PRO, fotoLabel: "Een foto van het gerecht (mag met je telefoon)" },
  { id: "horeca-sfeer", naam: "Vol terras, mooi licht", uitleg: "Je zaak of terras op een zonnige avond, gezellig vol.", icoon: "🌅", kleur: "from-amber-500/30", groep: "branche", branche: "horeca", soort: "beeld", credits: BEELD_PRO, fotoLabel: "Een foto van je zaak of terras" },
  { id: "horeca-actie", naam: "Post voor je actie", uitleg: "Dagmenu, happy hour of nieuw op de kaart: een post met de tekst erin.", icoon: "🍹", kleur: "from-pink-500/30", groep: "branche", branche: "horeca", soort: "beeld", credits: BEELD_PRO, fotoLabel: "", tekst: { label: "Wat is de actie?", placeholder: "Bijvoorbeeld: Vrijdag happy hour, 17-19 uur, alle bieren €3", verplicht: true }, zonderFoto: { formaat: "1:1" } },
  { id: "horeca-dampend", naam: "Gerecht komt tot leven", uitleg: "Je gerecht dampt, de saus loopt eroverheen: een filmpje voor social.", icoon: "♨️", kleur: "from-red-500/30", groep: "branche", branche: "horeca", soort: "video", credits: EFFECT, fotoLabel: "Een foto van het gerecht" },

  // Makelaar
  { id: "makelaar-inrichten", naam: "Lege kamer inrichten", uitleg: "Een foto van een lege kamer, virtueel ingericht. Kopers zien het meteen voor zich.", icoon: "🛋️", kleur: "from-amber-400/30", groep: "branche", branche: "makelaar", soort: "beeld", credits: BEELD_PRO, fotoLabel: "Een foto van de lege kamer", tekst: { label: "Welke stijl? (mag leeg)", placeholder: "Bijvoorbeeld: Scandinavisch, licht hout en wit" } },
  { id: "makelaar-zonnig", naam: "Woning op z'n mooist", uitleg: "Blauwe lucht, zachte zon, opgeruimde voortuin. Gevel en ramen blijven precies zoals ze zijn.", icoon: "☀️", kleur: "from-sky-400/30", groep: "branche", branche: "makelaar", soort: "beeld", credits: BEELD_PRO, fotoLabel: "Een foto van de buitenkant van de woning" },
  { id: "makelaar-avond", naam: "Avondfoto", uitleg: "De woning in de schemering, met warm licht achter de ramen.", icoon: "🌆", kleur: "from-indigo-500/30", groep: "branche", branche: "makelaar", soort: "beeld", credits: BEELD_PRO, fotoLabel: "Een foto van de buitenkant van de woning" },
  { id: "makelaar-verkocht", naam: "Verkocht-post", uitleg: "De woning met een feestelijk 'Verkocht!' voor op social media.", icoon: "🏷️", kleur: "from-red-400/30", groep: "branche", branche: "makelaar", soort: "beeld", credits: BEELD_PRO, fotoLabel: "Een foto van de woning", tekst: { label: "Extra regel (mag leeg)", placeholder: "Bijvoorbeeld: binnen 2 weken!" } },
  { id: "makelaar-rondgang", naam: "Rustige camerarit", uitleg: "Een foto van een kamer wordt een filmpje: de camera beweegt langzaam door de ruimte.", icoon: "🎥", kleur: "from-violet-400/30", groep: "branche", branche: "makelaar", soort: "video", credits: EFFECT, fotoLabel: "Een foto van een kamer of de tuin" },

  // Installateur
  { id: "installateur-zonnepanelen", naam: "Zonnepanelen op het dak", uitleg: "Laat een klant zien hoe zijn huis eruitziet met zonnepanelen.", icoon: "🔆", kleur: "from-yellow-400/30", groep: "branche", branche: "installateur", soort: "beeld", credits: BEELD_PRO, fotoLabel: "Een foto van het huis, met het dak in beeld" },
  { id: "installateur-warmtepomp", naam: "Warmtepomp erbij", uitleg: "Een foto van de tuin of gevel, met de buitenunit van een warmtepomp netjes geplaatst.", icoon: "🌡️", kleur: "from-cyan-400/30", groep: "branche", branche: "installateur", soort: "beeld", credits: BEELD_PRO, fotoLabel: "Een foto van de gevel of achtertuin" },
  { id: "installateur-laadpaal", naam: "Laadpaal op de oprit", uitleg: "De oprit of carport met een moderne laadpaal en een auto aan de lader.", icoon: "🔌", kleur: "from-emerald-400/30", groep: "branche", branche: "installateur", soort: "beeld", credits: BEELD_PRO, fotoLabel: "Een foto van de oprit of carport" },
  { id: "installateur-actie", naam: "Post voor je actie", uitleg: "Een post met jouw aanbieding erin, met een vakman aan het werk.", icoon: "🛠️", kleur: "from-orange-400/30", groep: "branche", branche: "installateur", soort: "beeld", credits: BEELD_PRO, fotoLabel: "", tekst: { label: "Wat is de actie?", placeholder: "Bijvoorbeeld: Gratis adviesgesprek over je warmtepomp", verplicht: true }, zonderFoto: { formaat: "1:1" } },
];

export const GROEPEN: { id: ReceptGroep; naam: string; uitleg: string }[] = [
  { id: "bedrijf", naam: "Voor je bedrijf", uitleg: "Productfoto's, reclame en profielfoto's" },
  { id: "nederland", naam: "Typisch Nederlands", uitleg: "Hollandse meesters, Koningsdag, Delfts blauw" },
  { id: "personage", naam: "Personage & stijl", uitleg: "Jij als figuur, in een game of in een andere outfit" },
  { id: "fun", naam: "Voor de grap", uitleg: "Om te delen met vrienden en collega's" },
];

export function recept(id: unknown): Recept | null {
  return RECEPTEN.find((r) => r.id === id) ?? null;
}

export const EFFECTEN = RECEPTEN.filter((r) => r.groep === "effect");
export const APPS = RECEPTEN.filter((r) => r.groep !== "effect" && r.groep !== "branche");

export const BRANCHES: { id: BrancheId; naam: string; icoon: string; uitleg: string; kleur: string }[] = [
  { id: "zorg", naam: "Zorg & welzijn", icoon: "🩺", uitleg: "Vacatures, wachtkamerposters en heldere uitleg voor patiënten.", kleur: "from-rose-400/25" },
  { id: "onderwijs", naam: "Onderwijs", icoon: "🏫", uitleg: "Open dag, platen bij je les en vacatures.", kleur: "from-amber-400/25" },
  { id: "gemeente", naam: "Gemeente", icoon: "🏛️", uitleg: "Laat bewoners zien hoe het wordt, en campagnes die opvallen.", kleur: "from-green-500/25" },
  { id: "horeca", naam: "Horeca", icoon: "🍽️", uitleg: "Menukaartfoto's, een vol terras en posts voor je acties.", kleur: "from-orange-500/25" },
  { id: "makelaar", naam: "Makelaar", icoon: "🏠", uitleg: "Lege kamers inrichten, avondfoto's en verkocht-posts.", kleur: "from-sky-400/25" },
  { id: "installateur", naam: "Installateur", icoon: "🔧", uitleg: "Laat klanten zien hoe hun huis wordt: zonnepanelen, warmtepomp, laadpaal.", kleur: "from-yellow-400/25" },
];

export function branche(id: unknown) {
  return BRANCHES.find((b) => b.id === id) ?? null;
}

export function sjablonen(id: BrancheId): Recept[] {
  return RECEPTEN.filter((r) => r.branche === id);
}

/** Waar de pagina van een recept staat: effecten en apps hebben elk hun eigen plek in het menu. */
export function receptPad(r: Recept): string {
  if (r.groep === "branche") return `/branches/${r.branche}/${r.id}`;
  return r.groep === "effect" ? `/effecten/${r.id}` : `/apps/${r.id}`;
}
