// "Snel starten"-templates voor de storytelling-infographic (verbeterplan B9).
// Elk sjabloon vult het onderwerp + een brontekst-scaffold + passende toon/stijl/
// formaat voor, afgeleid uit de terugkerende use-cases in de onboarding-transcripts
// (dienstuitleg, proces-in-stappen, kennis/educatie, werving, product-ad, cursus).
// Puur data — de gebruiker past het daarna aan en genereert normaal.

import type { InfographicFormat } from "@/lib/types";

export interface StoryTemplate {
  id: string;
  label: string;
  emoji: string;
  hint: string;              // korte omschrijving onder het label
  topic: string;             // voorbeeld-onderwerp (bewerkbaar)
  text: string;              // brontekst-scaffold met invulhints
  tone: "zakelijk" | "speels" | "energiek";
  format: InfographicFormat;
}

export const STORY_TEMPLATES: StoryTemplate[] = [
  {
    id: "bedrijf",
    label: "Bedrijf / dienst uitleggen",
    emoji: "🏢",
    hint: "Wie zijn we, wat doen we",
    topic: "Wie wij zijn en hoe wij je helpen",
    text:
`[Bedrijfsnaam] helpt [doelgroep] met [kernaanbod].
Waarom wij:
- [sterk punt 1]
- [sterk punt 2]
- [sterk punt 3]
Hoe je bij ons terechtkomt: [eerste stap / contact]
Actie voor de kijker: [wat moeten ze doen?]`,
    tone: "zakelijk",
    format: "16:9",
  },
  {
    id: "proces",
    label: "Proces in stappen",
    emoji: "🪜",
    hint: "Leg een traject stap voor stap uit",
    topic: "Zo werkt [het proces] van A tot Z",
    text:
`Leg [het proces] uit in duidelijke stappen.
Stap 1: [wat gebeurt er + evt. bedrag/tijd]
Stap 2: [...]
Stap 3: [...]
Stap 4: [...]
Kernboodschap: [waarom het makkelijk/betrouwbaar is]`,
    tone: "zakelijk",
    format: "16:9",
  },
  {
    id: "kennis",
    label: "Kennis / educatie",
    emoji: "💡",
    hint: "Informatieve social-uitleg",
    topic: "Wat je moet weten over [onderwerp]",
    text:
`Informatieve uitleg over [onderwerp] voor [doelgroep].
Feit/inzicht 1: [...]
Feit/inzicht 2: [...]
Veelgemaakte fout of misverstand: [...]
Praktische tip: [...]`,
    tone: "zakelijk",
    format: "9:16",
  },
  {
    id: "werving",
    label: "Wervingsvideo",
    emoji: "🎯",
    hint: "Overtuig een (interne) beslisser",
    topic: "Waarom [organisatie/lidmaatschap] de moeite waard is",
    text:
`Overtuig de kijker om [ja te zeggen / lid te worden / te investeren].
Het probleem/gemis nu: [...]
Wat wij bieden: [...]
Concreet resultaat/opbrengst: [...]
Waarom nu: [urgentie]
Call-to-action: [de gevraagde stap]`,
    tone: "energiek",
    format: "16:9",
  },
  {
    id: "product",
    label: "Product / webshop-ad",
    emoji: "🛍️",
    hint: "Korte advertentie voor social",
    topic: "[Product] — dé oplossing voor [behoefte]",
    text:
`Korte, pakkende ad voor [product].
Herkenbare situatie/pijn: [...]
Wat het product doet: [...]
Belangrijkste voordelen: [voordeel 1], [voordeel 2]
Aanbod/actie: [korting, gratis verzending, etc.]
Call-to-action: [Bestel nu / Bekijk in de shop]`,
    tone: "energiek",
    format: "9:16",
  },
  {
    id: "cursus",
    label: "Cursus / coaching verkopen",
    emoji: "🎓",
    hint: "Verkoop een training of programma",
    topic: "Bereik [resultaat] met [cursus/traject]",
    text:
`Verkoop [cursus/coaching] aan [doelgroep].
Waar je nu tegenaan loopt: [...]
Wat je leert / wat er verandert: [...]
Voor wie dit is: [...]
Wat je krijgt: [modules / begeleiding / duur]
Call-to-action: [Meld je aan / Start vandaag]`,
    tone: "speels",
    format: "9:16",
  },
];
