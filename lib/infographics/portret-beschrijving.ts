import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DialogueCastMember } from "@/lib/infographics/dialogue-schema";
import { uiterlijkUitBlad } from "@/lib/infographics/uiterlijk-uit-blad";

interface Beschrijving { appearance: string; kleding: string | null }

/**
 * Beschrijft een personage zoals het op zijn PORTRET staat (het karakter in Mijn karakters)
 * en zet die tekst in `appearance` en `kleding`.
 *
 * De tekst uit de opzet ("a small green dragon with tiny wings", "an older king with gray
 * hair") laat te veel open, en de beeldregels zeggen "dragons wear nothing unless
 * described". Wat de tekst niet vastlegt, verzon het beeldmodel per shot. Nu zeggen
 * plaatje en tekst hetzelfde.
 *
 * Draait op de server bij elk beeld, zodat het niet uitmaakt of het tabblad van de
 * gebruiker de nieuwste versie heeft (zo liep het op 17-09-2026 mis). Per portret één
 * keer gemaakt en bewaard onder een naam die van het portret is afgeleid.
 */
export async function zorgVoorBeschrijving<T extends DialogueCastMember>(
  supabase: SupabaseClient,
  userId: string,
  lid: T,
): Promise<T> {
  if (!lid.portraitUrl || lid.beschrevenVan === lid.portraitUrl) return lid;
  const pad = `${userId}/dialogue/beschrijving/${createHash("sha1").update(lid.portraitUrl).digest("hex").slice(0, 24)}.json`;
  try {
    let vast: Beschrijving | null = null;
    const { data } = await supabase.storage.from("scene-assets").download(pad);
    if (data) vast = JSON.parse(await data.text()) as Beschrijving;
    if (!vast) {
      vast = await uiterlijkUitBlad(lid, lid.portraitUrl);
      if (!vast) return lid;
      await supabase.storage.from("scene-assets").upload(pad, JSON.stringify(vast), { contentType: "application/json", upsert: true });
    }
    return { ...lid, appearance: vast.appearance, kleding: vast.kleding, beschrevenVan: lid.portraitUrl };
  } catch (e) {
    console.warn(`[portret-beschrijving] ${lid.name}: ${e instanceof Error ? e.message : e}`);
    return lid;
  }
}
