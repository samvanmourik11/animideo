import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// De beeldmodellen (Nano Banana, Seedance) leveren tijdelijke fal.media-URLs op
// die na verloop van tijd verdwijnen. Deze helper kopieert zo'n tijdelijke URL
// naar onze eigen publieke `scene-assets`-bucket en geeft de permanente URL
// terug, zodat een opgeslagen verhaal zijn beelden blijft houden.
//
// Voice gaat al via de `audio`-bucket (zie scene-voice); dit dekt beeld en video.

type Kind = "image" | "video";

const EXT: Record<Kind, string> = { image: "jpg", video: "mp4" };
const MIME: Record<Kind, string> = { image: "image/jpeg", video: "video/mp4" };

// Kopieert één tijdelijke media-URL naar storage. Faalt de download/upload, dan
// gooien we, zodat de aanroeper kan beslissen (bij batch-generatie vangen we het
// per scene op i.p.v. de hele generatie te laten klappen).
export async function persistFalAsset(
  supabase: SupabaseClient,
  userId: string,
  tempUrl: string,
  kind: Kind,
): Promise<string> {
  const res = await fetch(tempUrl);
  if (!res.ok) throw new Error(`Download mislukt (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());

  const path = `${userId}/story/${randomUUID()}.${EXT[kind]}`;
  const { error } = await supabase.storage
    .from("scene-assets")
    .upload(path, buf, { contentType: MIME[kind], upsert: true });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("scene-assets").getPublicUrl(path);
  return data.publicUrl;
}

// Zachte variant: lukt het persisten niet, val dan terug op de tijdelijke URL
// i.p.v. te falen. Handig waar een verlopen link minder erg is dan geen beeld.
export async function persistFalAssetSoft(
  supabase: SupabaseClient,
  userId: string,
  tempUrl: string,
  kind: Kind,
): Promise<string> {
  try {
    return await persistFalAsset(supabase, userId, tempUrl, kind);
  } catch (e) {
    console.error(`[persist-asset] ${kind} persist mislukt, val terug op temp-URL:`, e);
    return tempUrl;
  }
}
