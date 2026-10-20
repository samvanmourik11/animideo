// De vaste AI-creators van de UGC-studio. Zo divers als Nederland: leeftijd, achtergrond,
// stijl. De portretten zijn één keer gemaakt met scripts/maak-ugc-creators.ts (door AI
// bedachte mensen, geen echte personen) en staan in creators.json. Client-veilig.

import portretten from "./creators.json";
import type { Creator } from "./types";

export interface CreatorBron extends Omit<Creator, "portretUrl"> {
  /** Engels, voor het portret: wie zien we. */
  uiterlijk: string;
}

export const CREATOR_BRONNEN: CreatorBron[] = [
  { id: "sanne", naam: "Sanne", omschrijving: "27 · lifestyle, enthousiast", stem: "kZQ3IGqYUStQ8u1Y62s6", persona: "Enthousiaste twintiger die graag nieuwe dingen deelt met haar volgers; spontaan en gezellig.", uiterlijk: "a 27-year-old Dutch woman with long wavy blond hair, light makeup, wearing a beige knit sweater" },
  { id: "lotte", naam: "Lotte", omschrijving: "23 · studente, spontaan", stem: "6e6TrJGLhrDGMKOy5x2i", persona: "Studente met weinig tijd en budget; praat snel en vrolijk, deelt handige tips.", uiterlijk: "a 23-year-old Dutch woman with shoulder-length copper red hair and freckles, wearing an oversized hoodie" },
  { id: "esther", naam: "Esther", omschrijving: "45 · moeder, praktisch", stem: "XCOm4Hr4NoqIsKeVFU2y", persona: "Drukke moeder van twee die alleen dingen aanraadt die echt tijd of gedoe schelen.", uiterlijk: "a 45-year-old Dutch woman with short dark brown hair, sporty and fit, wearing a navy zip-up jacket" },
  { id: "ria", naam: "Ria", omschrijving: "63 · warm, vertrouwd", stem: "tfweP7lGJyLeNV9dH1Rm", persona: "Hartelijke zestiger die vertelt als tegen een vriendin; rustig en betrouwbaar.", uiterlijk: "a 63-year-old Dutch woman with short silver-grey hair and glasses, wearing a soft blue cardigan" },
  { id: "chantal", naam: "Chantal", omschrijving: "35 · energiek, grappig", stem: "qpYcCnnbKrqp5HBM19ou", persona: "Vrolijke dertiger met humor; maakt het luchtig maar is wel duidelijk.", uiterlijk: "a 35-year-old Surinamese-Dutch woman with voluminous natural curly hair, gold hoop earrings, wearing a mustard top" },
  { id: "daan", naam: "Daan", omschrijving: "25 · sportief, direct", stem: "SFlhmoT9q6x81D3fl3dp", persona: "Sportieve twintiger; kort, direct en energiek, zegt meteen waar het op staat.", uiterlijk: "a 25-year-old Dutch man with short blond hair and a light stubble, athletic, wearing a grey sports t-shirt" },
  { id: "kevin", naam: "Kevin", omschrijving: "33 · vader, nuchter", stem: "YWWzyiP9IlB03CVK6QXN", persona: "Nuchtere jonge vader; casual, een beetje droog, overtuigd door gemak.", uiterlijk: "a 33-year-old Dutch man with a full brown beard and short hair, wearing a green flannel shirt" },
  { id: "mehmet", naam: "Mehmet", omschrijving: "29 · ondernemend, relaxed", stem: "MkRWZTk4OBui6Jb2lgK0", persona: "Relaxte ondernemer van eind twintig; ontspannen, eerlijk, slim met geld.", uiterlijk: "a 29-year-old Turkish-Dutch man with light olive skin, dark brown eyes, short wavy black hair styled up and a neat trimmed black beard, wearing a white t-shirt and denim jacket" },
  { id: "jeroen", naam: "Jeroen", omschrijving: "42 · zakelijk, betrouwbaar", stem: "yGnXd97Wft6RDkIaLXiR", persona: "Zakelijke veertiger met een eigen bedrijf; rustig, to the point, legt uit waarom iets werkt.", uiterlijk: "a 42-year-old Dutch man with short salt-and-pepper hair, clean shaven, wearing a light blue open-collar shirt" },
  { id: "henk", naam: "Henk", omschrijving: "61 · vakman, eerlijk", stem: "2GJZCZIWrWiGFDntCFaz", persona: "Ervaren vakman van zestig; eerlijk, geen poespas, vertrouwt op kwaliteit.", uiterlijk: "a 61-year-old Dutch man with a grey beard and weathered friendly face, wearing a dark work jacket" },
  { id: "jayden", naam: "Jayden", omschrijving: "21 · trendy, hyped", stem: "rbqBOMK4BPTMGvIB7N8w", persona: "Trendy twintiger die overal enthousiast over is; snel, hyped, praat zoals op TikTok.", uiterlijk: "a 21-year-old Dutch-Antillean man with short twists, wearing a black streetwear hoodie and a silver chain" },
];

export function portretPrompt(uiterlijk: string): string {
  return `Vertical photorealistic smartphone selfie-style portrait of ${uiterlijk}, looking straight into the front camera with a natural, friendly, slightly excited expression, mouth closed, as if about to talk to their followers. Framed from the chest up as seen from the phone's front camera; the phone itself is NOT visible, both hands relaxed or out of frame, at home in a bright modern Dutch living room, natural window light, authentic everyday UGC creator look, not a studio photo. No phone, no camera interface, no on-screen buttons or icons, no text.`;
}

const URLS = portretten as Record<string, string>;

/** Alleen creators met een gemaakt portret; zonder portret kan er niets mee. */
export const CREATORS: Creator[] = CREATOR_BRONNEN.filter((c) => URLS[c.id]).map(({ uiterlijk: _, ...c }) => ({ ...c, portretUrl: URLS[c.id] }));

export function vasteCreator(id: unknown): Creator | null {
  return CREATORS.find((c) => c.id === id) ?? null;
}
