import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { referentieVan, type DialogueCastMember } from "@/lib/infographics/dialogue-schema";
import { uiterlijkUitBlad } from "@/lib/infographics/uiterlijk-uit-blad";

interface Beschrijving { appearance: string; kleding: string | null }

/**
 * Zorgt dat `appearance` en `kleding` beschrijven wat er op die ene tekening staat.
 *
 * Tekst en plaatje moeten hetzelfde zeggen. Zei de tekst "a small green dragon" terwijl de
 * tekening een trui liet zien, dan koos het beeldmodel per shot. Draait op de server bij
 * elk beeld, zodat het ook klopt als het tabblad van de gebruiker ouder is. Per tekening
 * één keer gemaakt en bewaard.
 */
export async function zorgVoorBeschrijving<T extends DialogueCastMember>(
  supabase: SupabaseClient,
  userId: string,
  lid: T,
): Promise<T> {
  const tekening = referentieVan(lid);
  if (!tekening || lid.beschrevenVan === tekening) return lid;
  const pad = `${userId}/dialogue/beschrijving/${createHash("sha1").update(tekening).digest("hex").slice(0, 24)}.json`;
  try {
    let vast: Beschrijving | null = null;
    const { data } = await supabase.storage.from("scene-assets").download(pad);
    if (data) vast = JSON.parse(await data.text()) as Beschrijving;
    if (!vast) {
      vast = await uiterlijkUitBlad(lid, tekening);
      if (!vast) return lid;
      await supabase.storage.from("scene-assets").upload(pad, JSON.stringify(vast), { contentType: "application/json", upsert: true });
    }
    return { ...lid, appearance: vast.appearance, kleding: vast.kleding, beschrevenVan: tekening };
  } catch (e) {
    console.warn(`[personage-blad] ${lid.name}: ${e instanceof Error ? e.message : e}`);
    return lid;
  }
}

