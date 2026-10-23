// HET REGIEBOEK — wat de Regisseur weet over goed beeld, beweging, verhaal en montage.
// Twee delen: de basis hieronder (vaste kennis, met de hand bijgehouden) en de regels uit
// de leerronde die Sam heeft aangezet (tabel regieboek_regels, zie lib/regisseur/leren.ts).
//
// Fouten die steeds terugkomen lossen we op met een regel hier, niet met een controle
// achteraf op elke video (Sam, 13-09-2026).

import { createServiceClient } from "@/lib/supabase/service";

export const BASIS = `Regieboek (vaste regels; volg ze bij elk beeld en elke clip):

Beeld (maak_beeld):
- Schrijf de prompt als een fotograaf: onderwerp en wat het doet, omgeving, licht (richting, tijd van de dag), afstand en lens (close-up 85mm, medium 50mm, wide 24mm), compositie, stijl, kleuren (huisstijl als hex).
- Eén duidelijk onderwerp per beeld; hoogstens 2-3 personen, anders worden gezichten slordig.
- Handen: laat ze iets vasthouden of buiten beeld vallen; geen losse gebaren met gespreide vingers.
- Tekst in beeld alleen als het echt moet: kort, tussen aanhalingstekens, met "Dutch text" erbij. Nooit lange zinnen.
- Zelfde personage of product: elke keer dezelfde voorbeelden meegeven én dezelfde beschrijving (leeftijd, haar, kleding, kleur van het product).
- Beeld voor een video: het beeld is de beginstand van de beweging. Laat ruimte in beeld waar de beweging heen gaat, en zet alles wat moet bewegen er al in.

Beweging (maak_video):
- Eén kleine gebeurtenis per clip van 5 s. Beschrijf de camera apart van het onderwerp ("slow push-in; the woman looks up and smiles").
- Laat niets verschijnen dat niet al in het beeld staat (sneeuw, vuur, vallende voorwerpen, een landing): dat mislukt vanuit een foto. Maak dan eerst een beeld waarin het er al is.
- Rustig: geen snelle camerabewegingen, geen ingewikkelde handelingen, geen tekst die moet veranderen.
- Mensen en dieren in beweging: kling-2-5. Vallen, water, natuurkunde: hailuo-02. De rest: de standaard.

Verhaal en montage:
- Voice-over: reken op ±2,5 woorden per seconde; een clip van 5 s draagt hoogstens 12 woorden.
- Wissel wijd, medium en close-up af; begin met iets dat meteen opvalt.
- Eindig met merknaam en website op een eindkaart; nooit een vraag als laatste zin zonder antwoord.`;

let cache: { tekst: string; tot: number } | null = null;

/** Basis + de aangezette regels uit de leerronde. Vijf minuten bewaard: hij verandert zelden. */
export async function regieboekTekst(): Promise<string> {
  if (cache && cache.tot > Date.now()) return cache.tekst;
  const { data } = await createServiceClient().from("regieboek_regels").select("categorie, regel").eq("status", "actief").order("created_at");
  const geleerd = (data ?? []).map((r) => `- (${r.categorie}) ${r.regel}`).join("\n");
  const tekst = geleerd ? `${BASIS}\n\nGeleerd uit eerder werk (even belangrijk):\n${geleerd}` : BASIS;
  cache = { tekst, tot: Date.now() + 5 * 60 * 1000 };
  return tekst;
}

export function wisRegieboekCache() {
  cache = null;
}
