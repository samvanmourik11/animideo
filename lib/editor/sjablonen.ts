// ── Sjablonen ────────────────────────────────────────────────────────────────
//
// Canva's sjablonen zijn hele ontwerpen. Bij een video werkt dat anders: het
// beeld heb je al, wat je mist is de aankleding eromheen. Een sjabloon is hier
// dus een setje lagen dat samen iets afmaakt — een titelkaart, een naambalk
// onderin, een aandachtsblok.
//
// Elk sjabloon is niets meer dan een rijtje ops. Daardoor komt het door dezelfde
// validatie als handwerk, staat elke laag los in de geschiedenis, en kun je na
// het plaatsen elk onderdeel apart verslepen of weghalen. Geen samengesteld
// blok dat je alleen in zijn geheel kunt weggooien.

import type { Op } from "./core/ops";
import { lettertypeStack } from "./text-styles";

export interface Sjabloon {
  id: string;
  label: string;
  /** Waar het voor is, in gewone taal. */
  hint: string;
  /** Waar het op lijkt in het paneel: een miniatuur van de opbouw. */
  voorbeeld: Array<{ vorm?: string; tekst?: string; y: number; kleur: string; hoogte?: number }>;
  bouw: (clipId: string, tekst: { titel: string; onder: string }) => Op[];
}

export const SJABLONEN: Sjabloon[] = [
  {
    id: "titelkaart",
    label: "Titelkaart",
    hint: "Donkere band met een grote titel en een regel eronder",
    voorbeeld: [
      { vorm: "balk", y: 0.5, kleur: "#0f172a", hoogte: 0.42 },
      { tekst: "Titel", y: 0.44, kleur: "#ffffff" },
      { tekst: "ondertitel", y: 0.58, kleur: "#cbd5e1" },
    ],
    bouw: (clipId, t) => [
      { op: "add_vorm", clipId, vormId: "markeer-balk", breedte: 1, x: 0.5, y: 0.5, stijl: { vulling: "#0f172a" } },
      {
        op: "add_text", clipId, text: t.titel, x: 0.5, y: 0.44,
        style: { fontFamily: lettertypeStack("grotesk"), fontSize: 118, fontWeight: 800, color: "#ffffff", letterSpacing: -1 },
      },
      {
        op: "add_text", clipId, text: t.onder, x: 0.5, y: 0.58,
        style: { fontFamily: lettertypeStack("systeem"), fontSize: 52, fontWeight: 400, color: "#cbd5e1" },
      },
    ],
  },
  {
    id: "naambalk",
    label: "Naambalk",
    hint: "Balkje linksonder met naam en functie",
    voorbeeld: [
      { vorm: "balk", y: 0.8, kleur: "#2563eb", hoogte: 0.18 },
      { tekst: "Naam", y: 0.77, kleur: "#ffffff" },
      { tekst: "functie", y: 0.86, kleur: "#dbeafe" },
    ],
    bouw: (clipId, t) => [
      { op: "add_vorm", clipId, vormId: "markeer-balk", breedte: 0.44, x: 0.29, y: 0.81, stijl: { vulling: "#2563eb" } },
      {
        op: "add_text", clipId, text: t.titel, x: 0.29, y: 0.775,
        style: { fontFamily: lettertypeStack("grotesk"), fontSize: 54, fontWeight: 700, color: "#ffffff", align: "center" },
      },
      {
        op: "add_text", clipId, text: t.onder, x: 0.29, y: 0.845,
        style: { fontFamily: lettertypeStack("systeem"), fontSize: 34, fontWeight: 400, color: "#dbeafe", align: "center" },
      },
    ],
  },
  {
    id: "aandacht",
    label: "Aandachtsblok",
    hint: "Gekleurd vlak rechts met een korte boodschap",
    voorbeeld: [
      { vorm: "vlak", y: 0.5, kleur: "#facc15", hoogte: 0.5 },
      { tekst: "Let op", y: 0.46, kleur: "#0f172a" },
    ],
    bouw: (clipId, t) => [
      { op: "add_vorm", clipId, vormId: "rechthoek-rond", breedte: 0.34, x: 0.75, y: 0.5, stijl: { vulling: "#facc15" } },
      {
        op: "add_text", clipId, text: t.titel, x: 0.75, y: 0.44,
        style: { fontFamily: lettertypeStack("grotesk"), fontSize: 62, fontWeight: 800, color: "#0f172a" },
      },
      {
        op: "add_text", clipId, text: t.onder, x: 0.75, y: 0.56,
        style: { fontFamily: lettertypeStack("systeem"), fontSize: 36, fontWeight: 500, color: "#334155" },
      },
    ],
  },
  {
    id: "leesbaar",
    label: "Leesbaar maken",
    hint: "Verloop onderin plus ondertiteling — tekst blijft leesbaar op druk beeld",
    voorbeeld: [
      { vorm: "verloop", y: 0.78, kleur: "#000000", hoogte: 0.44 },
      { tekst: "ondertiteling", y: 0.85, kleur: "#ffffff" },
    ],
    bouw: (clipId, t) => [
      { op: "add_vorm", clipId, vormId: "verloop-omhoog", breedte: 1, x: 0.5, y: 0.79, stijl: { vulling: "#000000" } },
      {
        op: "add_text", clipId, text: t.onder || t.titel, x: 0.5, y: 0.85,
        style: { fontFamily: lettertypeStack("systeem"), fontSize: 56, fontWeight: 700, color: "#ffffff", lineHeight: 1.2 },
      },
    ],
  },
  {
    id: "cijfer",
    label: "Cijfer uitlichten",
    hint: "Groot getal met een kleine toelichting eronder",
    voorbeeld: [
      { vorm: "cirkel", y: 0.45, kleur: "#22c55e", hoogte: 0.42 },
      { tekst: "87%", y: 0.45, kleur: "#ffffff" },
      { tekst: "toelichting", y: 0.72, kleur: "#f8fafc" },
    ],
    bouw: (clipId, t) => [
      { op: "add_vorm", clipId, vormId: "cirkel", breedte: 0.3, x: 0.5, y: 0.45, stijl: { vulling: "#22c55e" } },
      {
        op: "add_text", clipId, text: t.titel, x: 0.5, y: 0.45,
        style: { fontFamily: lettertypeStack("grotesk"), fontSize: 110, fontWeight: 800, color: "#ffffff" },
      },
      {
        op: "add_text", clipId, text: t.onder, x: 0.5, y: 0.72,
        style: {
          fontFamily: lettertypeStack("systeem"), fontSize: 44, fontWeight: 600,
          color: "#f8fafc", shadow: { color: "#000000aa", blur: 18, x: 0, y: 3 },
        },
      },
    ],
  },
  {
    id: "aanwijzen",
    label: "Aanwijzen",
    hint: "Pijl met een labeltje ernaast, om iets in beeld te benoemen",
    voorbeeld: [
      { vorm: "pijl", y: 0.5, kleur: "#ef4444", hoogte: 0.2 },
      { tekst: "label", y: 0.5, kleur: "#ffffff" },
    ],
    bouw: (clipId, t) => [
      { op: "add_vorm", clipId, vormId: "pijl-rechts", breedte: 0.16, x: 0.36, y: 0.5, stijl: { vulling: "#ef4444" } },
      {
        op: "add_text", clipId, text: t.titel, x: 0.2, y: 0.5,
        style: {
          fontFamily: lettertypeStack("grotesk"), fontSize: 52, fontWeight: 700,
          color: "#ffffff", background: "#ef4444ee",
        },
      },
    ],
  },
];

export function vindSjabloon(id: string): Sjabloon | undefined {
  return SJABLONEN.find((s) => s.id === id);
}
