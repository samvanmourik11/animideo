// Eén keer toestemming per project (Sam, 24-10-2026): Claude schat het hele projectje,
// de klant zegt één keer ja (knop in de kaart of in de chat), en daarna lopen de betaalde
// stappen binnen dat budget zonder nieuwe vraag. Een budget geldt 24 uur.

import { createServiceClient } from "@/lib/supabase/service";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { VIDEO_MODELLEN, STANDAARD_VIDEO_MODEL } from "@/lib/video-modellen";
import { RECLAME_CREDITS } from "@/lib/reclame/types";
import { geschatteUgcCredits } from "@/lib/ugc/types";

export const GELDIG_MS = 24 * 60 * 60 * 1000;
/** Een schatting is een schatting: een klein beetje erover mag, zonder nieuwe vraag. */
export function speling(totaal: number): number {
  return Math.max(2, Math.ceil(totaal * 0.1));
}

export function prijslijst(): string {
  const video = VIDEO_MODELLEN.map((m) => `${m.id} ${m.credits}${m.id === STANDAARD_VIDEO_MODEL ? " (standaard)" : ""}`).join(", ");
  return [
    `beeld standaard ${CREDIT_COSTS.IMAGE_GENERATION}, beeld pro ${CREDIT_COSTS.IMAGE_GENERATION_PRO}`,
    `beweging per clip van 5 s: ${video}`,
    `voice-over ${CREDIT_COSTS.VOICE}; montage zonder voice-over 0, met voice-over ${CREDIT_COSTS.VOICE}`,
    `reclame (kant-en-klaar) ${RECLAME_CREDITS}; UGC-video ±${geschatteUgcCredits(15, false)} (15 s) / ±${geschatteUgcCredits(30, false)} (30 s)`,
    "apps/effecten: zie de prijs per app",
  ].join("; ");
}

export interface Post { wat: string; credits: number }

export async function stelVoor(userId: string, omschrijving: unknown, ruw: unknown) {
  const posten: Post[] = (Array.isArray(ruw) ? ruw : [])
    .map((p) => ({ wat: String((p as Post).wat ?? "").slice(0, 120), credits: Math.max(0, Math.round(Number((p as Post).credits) || 0)) }))
    .filter((p) => p.wat)
    .slice(0, 30);
  const totaal = posten.reduce((s, p) => s + p.credits, 0);
  if (!posten.length || totaal < 1) throw new Error("Geef de stappen met hun credits mee.");
  if (totaal > 2000) throw new Error("Dat budget is te groot; maak het project kleiner of splits het.");
  const { data, error } = await createServiceClient()
    .from("mcp_budgetten")
    .insert({ user_id: userId, omschrijving: String(omschrijving ?? "Project").slice(0, 200), posten, totaal })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Opslaan mislukt.");
  return { id: data.id as string, posten, totaal };
}

export async function keurGoed(userId: string, id: unknown) {
  const { data } = await createServiceClient()
    .from("mcp_budgetten")
    .update({ status: "actief", verloopt_op: new Date(Date.now() + GELDIG_MS).toISOString() })
    .eq("id", String(id ?? ""))
    .eq("user_id", userId)
    .in("status", ["voorstel", "actief"])
    .select("id, totaal, uitgegeven, omschrijving")
    .maybeSingle();
  if (!data) throw new Error("Dat budget bestaat niet (meer).");
  return data as { id: string; totaal: number; uitgegeven: number; omschrijving: string };
}

/**
 * Boekt credits af van een actief budget. Geeft de rest terug, of null als het niet past
 * (verlopen, onbekend, of meer dan het budget plus speling). Een paar pogingen voor het
 * geval twee stappen tegelijk afboeken.
 */
export async function gebruik(userId: string, id: unknown, credits: number): Promise<number | null> {
  const db = createServiceClient();
  for (let poging = 0; poging < 3; poging++) {
    const { data: b } = await db.from("mcp_budgetten").select("totaal, uitgegeven, status, verloopt_op").eq("id", String(id ?? "")).eq("user_id", userId).maybeSingle();
    if (!b || b.status !== "actief" || !b.verloopt_op || new Date(b.verloopt_op).getTime() < Date.now()) return null;
    if (b.uitgegeven + credits > b.totaal + speling(b.totaal)) return null;
    const { data } = await db.from("mcp_budgetten").update({ uitgegeven: b.uitgegeven + credits }).eq("id", String(id)).eq("uitgegeven", b.uitgegeven).select("id");
    if (data?.length) return b.totaal - b.uitgegeven - credits;
  }
  return null;
}
