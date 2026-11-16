// Startrecepten (verbeterplan idee 10): wie niet weet waar te beginnen, kiest een voorbeeld.
// Eén klik zet soort, stijl, lengte, formaat en muziek goed en zet een eerste bericht voor de
// regisseur klaar dat de klant alleen nog hoeft aan te vullen. Alles blijft daarna aan te passen.
import type { MotionFormaat, MotionLengte, MotionSoort } from "./types";

export interface Recept {
  id: string;
  icoon: string;
  naam: string;
  uitleg: string;
  soort: MotionSoort;
  stijl: string;
  lengte: MotionLengte;
  formaat: MotionFormaat;
  muziek: string;
  /** Het eerste bericht aan de regisseur; [haken] vult de klant zelf in. */
  bericht: string;
}

export const RECEPTEN: Recept[] = [
  {
    id: "lancering",
    icoon: "🚀",
    naam: "Productlancering",
    uitleg: "Nieuw product of nieuwe dienst aankondigen",
    soort: "bedrijf",
    stijl: "",
    lengte: 45,
    formaat: "16:9",
    muziek: "upbeat-inspiratie-business",
    bericht: "We lanceren [naam van het product]. Het is voor [doelgroep] en lost [probleem] op. Het belangrijkste voordeel: [voordeel]. De kijker moet daarna [actie, bijv. een demo aanvragen].",
  },
  {
    id: "vacature",
    icoon: "👋",
    naam: "Vacature",
    uitleg: "Een functie aantrekkelijk maken voor Reels en TikTok",
    soort: "bedrijf",
    stijl: "strip",
    lengte: 30,
    formaat: "9:16",
    muziek: "vrolijk-positief-motiverend",
    bericht: "We zoeken een [functie] in [plaats]. Wat je doet: [taken]. Wat we bieden: [salaris, sfeer, extra's]. Solliciteren via [link of manier].",
  },
  {
    id: "cijfers",
    icoon: "📈",
    naam: "Jaarcijfers",
    uitleg: "Resultaten en groei helder in beeld",
    soort: "bedrijf",
    stijl: "lichtlijn",
    lengte: 60,
    formaat: "16:9",
    muziek: "corporate-uplifting",
    bericht: "Een video over onze resultaten van [jaar]. De belangrijkste cijfers: [cijfer 1], [cijfer 2], [cijfer 3]. Waar we trots op zijn: [mijlpaal]. Volgend jaar willen we [doel].",
  },
  {
    id: "dienst",
    icoon: "💡",
    naam: "Uitleg van je dienst",
    uitleg: "Hoe het werkt, in drie stappen",
    soort: "bedrijf",
    stijl: "plat",
    lengte: 60,
    formaat: "16:9",
    muziek: "inspirerend-corporate-simpel",
    bericht: "Leg uit hoe [dienst] werkt. Het probleem van de klant: [probleem]. De stappen: 1. [stap], 2. [stap], 3. [stap]. Wat het oplevert: [resultaat].",
  },
  {
    id: "geschiedenis",
    icoon: "📜",
    naam: "Geschiedenisverhaal",
    uitleg: "Een waargebeurd verhaal met een verrassend einde",
    soort: "verhaal",
    stijl: "prentenboek",
    lengte: 120,
    formaat: "16:9",
    muziek: "filmisch-orkest",
    bericht: "Vertel het verhaal van [onderwerp]. Begin met het spannendste moment en eindig met een verrassende wending.",
  },
  {
    id: "ondergang",
    icoon: "📉",
    naam: "Opkomst en ondergang",
    uitleg: "Hoe een bedrijf groot werd en viel",
    soort: "verhaal",
    stijl: "archief",
    lengte: 180,
    formaat: "16:9",
    muziek: "piano-drama",
    bericht: "De opkomst en ondergang van [bedrijf of merk]: hoe het groot werd, wat er misging, en wat er nu van over is.",
  },
];
