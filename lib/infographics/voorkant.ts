import sharp from "sharp";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Het vooraanzicht uit een model sheet: het linker derde deel van het blad.
 *
 * Het blad tekent één personage drie keer op een rij (van voren, schuin, opzij; zie
 * dialogue-model-sheet). Het vooraanzicht is het ene plaatje dat per personage overal
 * meegaat. Voorheen gingen portret én blad én castblad mee, en die spraken elkaar tegen:
 * bij "de drie gouden sleutels" was de koning op het portret een man met halflang haar
 * en op het blad een man met krullenpruik en snor, en het beeldmodel koos per shot.
 */
export async function maakVoorkant(supabase: SupabaseClient, userId: string, bladUrl: string): Promise<string> {
  const res = await fetch(bladUrl);
  if (!res.ok) throw new Error(`Model sheet ophalen mislukt (HTTP ${res.status})`);
  const bron = Buffer.from(await res.arrayBuffer());
  const { width, height } = await sharp(bron).metadata();
  if (!width || !height) throw new Error("Model sheet onleesbaar");
  const png = await sharp(bron).extract({ left: 0, top: 0, width: Math.floor(width / 3), height }).png().toBuffer();
  const pad = `${userId}/dialogue/voorkant-${randomUUID()}.png`;
  const { error } = await supabase.storage.from("scene-assets").upload(pad, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Vooraanzicht opslaan mislukt: ${error.message}`);
  return supabase.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl;
}
