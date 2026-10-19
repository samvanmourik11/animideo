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
  | "fun";

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
export const APPS = RECEPTEN.filter((r) => r.groep !== "effect");

/** Waar de pagina van een recept staat: effecten en apps hebben elk hun eigen plek in het menu. */
export function receptPad(r: Recept): string {
  return r.groep === "effect" ? `/effecten/${r.id}` : `/apps/${r.id}`;
}
