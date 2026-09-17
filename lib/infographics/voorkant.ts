import sharp from "sharp";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { geldigeVoorkant, type DialogueCastMember } from "@/lib/infographics/dialogue-schema";
import { uiterlijkUitBlad } from "@/lib/infographics/uiterlijk-uit-blad";

/**
 * Het vooraanzicht uit een model sheet: het linker derde deel van het blad.
 *
 * Het blad tekent één personage drie keer op een rij (van voren, schuin, opzij; zie
 * dialogue-model-sheet). Het vooraanzicht is het ene plaatje dat per personage overal
 * meegaat. Voorheen gingen portret én blad én castblad mee, en die spraken elkaar tegen:
 * bij "de drie gouden sleutels" was de koning op het portret een man met halflang haar
 * en op het blad een man met krullenpruik en snor, en het beeldmodel koos per shot.
 */
async function snijVoorkant(bladUrl: string): Promise<Buffer> {
  const res = await fetch(bladUrl);
  if (!res.ok) throw new Error(`Model sheet ophalen mislukt (HTTP ${res.status})`);
  const bron = Buffer.from(await res.arrayBuffer());
  const { width, height } = await sharp(bron).metadata();
  if (!width || !height) throw new Error("Model sheet onleesbaar");
  return sharp(bron).extract({ left: 0, top: 0, width: Math.floor(width / 3), height }).png().toBuffer();
}

interface Vastgelegd { voorkantUrl: string; appearance: string | null; kleding: string | null | undefined }

/**
 * Zorgt dat een personage een vooraanzicht en een beschrijving van dat plaatje heeft.
 *
 * Draait op de SERVER bij elk beeld, niet alleen als voorbereiding in de pagina: op
 * 17-09-2026 maakte Sam een storyboard in een tabblad dat nog van vóór de update was.
 * Er kwam geen vooraanzicht, en het draakje droeg in scène 4 een trui (blad) en was in
 * scène 5 bloot (portret). Per model sheet wordt het één keer gemaakt en bewaard, onder
 * een naam die van het blad is afgeleid; daarna is het een kleine download.
 */
export async function zorgVoorVoorkant<T extends DialogueCastMember>(
  supabase: SupabaseClient,
  userId: string,
  lid: T,
): Promise<T> {
  if (!lid.modelSheetUrl || geldigeVoorkant(lid)) return lid;
  const sleutel = createHash("sha1").update(lid.modelSheetUrl).digest("hex").slice(0, 24);
  const map = `${userId}/dialogue/voorkant`;
  try {
    let vast: Vastgelegd | null = null;
    const { data: bestaand } = await supabase.storage.from("scene-assets").download(`${map}/${sleutel}.json`);
    if (bestaand) vast = JSON.parse(await bestaand.text()) as Vastgelegd;

    if (!vast) {
      const png = await snijVoorkant(lid.modelSheetUrl);
      const pngPad = `${map}/${sleutel}.png`;
      const { error } = await supabase.storage.from("scene-assets").upload(pngPad, png, { contentType: "image/png", upsert: true });
      if (error) throw new Error(`Vooraanzicht opslaan mislukt: ${error.message}`);
      const voorkantUrl = supabase.storage.from("scene-assets").getPublicUrl(pngPad).data.publicUrl;
      const uiterlijk = await uiterlijkUitBlad(lid, voorkantUrl);
      vast = { voorkantUrl, appearance: uiterlijk?.appearance ?? null, kleding: uiterlijk ? uiterlijk.kleding : undefined };
      // Alleen met een beschrijving bewaren: anders proberen we die de volgende keer opnieuw.
      if (uiterlijk) {
        await supabase.storage.from("scene-assets").upload(`${map}/${sleutel}.json`, JSON.stringify(vast), { contentType: "application/json", upsert: true });
      }
    }
    return {
      ...lid,
      voorkantUrl: vast.voorkantUrl,
      voorkantVanBlad: lid.modelSheetUrl,
      ...(vast.appearance ? { appearance: vast.appearance } : {}),
      ...(vast.kleding !== undefined ? { kleding: vast.kleding } : {}),
    };
  } catch (e) {
    console.warn(`[voorkant] ${lid.name}: ${e instanceof Error ? e.message : e}`);
    return lid;
  }
}

/**
 * Het ene plaatje van een personage dat naar een beeld gaat. Nooit portret en blad door
 * elkaar: mislukt het vooraanzicht, dan het blad (dat klopt met het castblad), en alleen
 * zonder blad het portret.
 */
export function referentieVan(lid: Pick<DialogueCastMember, "voorkantUrl" | "voorkantVanBlad" | "modelSheetUrl" | "portraitUrl">): string {
  return geldigeVoorkant(lid) || lid.modelSheetUrl || lid.portraitUrl;
}
