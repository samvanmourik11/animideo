// Voortgang in de Academy: bekeken lessen (tabel academy_voortgang) en gedane opdrachten.
// Een opdracht vinkt zichzelf af als we zien dat de klant het echt maakte; zo hoeft hij niets
// bij te houden, en telt "even proberen" pas als het gelukt is. Alleen op de server.

import { createServiceClient } from "@/lib/supabase/service";
import { RECEPTEN } from "@/lib/creaties/recepten";
import { ALLE_LESSEN, type CheckId } from "./lessen";

export interface Voortgang {
  bekeken: Set<string>;
  /** Lessen waarvan de opdracht gedaan is (gezien of zelf afgevinkt). */
  gedaan: Set<string>;
}

const EFFECT_IDS = new Set(RECEPTEN.filter((r) => r.groep === "effect").map((r) => r.id));

/** Wat de klant gemaakt heeft, in één keer opgehaald (een handvol kleine tellingen). */
async function gemaakt(userId: string): Promise<Set<CheckId>> {
  const db = createServiceClient();
  const tel = async (q: PromiseLike<{ count: number | null }>) => ((await q).count ?? 0) > 0;
  const [creaties, regie, film, social, personage, huisstijl, profiel, team, claude] = await Promise.all([
    db.from("creaties").select("maker, invoer, deel_code, op_profiel").eq("user_id", userId).eq("status", "klaar").order("created_at", { ascending: false }).limit(1000),
    tel(db.from("regie_projecten").select("id", { count: "exact", head: true }).eq("user_id", userId)),
    tel(db.from("films").select("id", { count: "exact", head: true }).eq("user_id", userId)),
    tel(db.from("content_kalenders").select("id", { count: "exact", head: true }).eq("user_id", userId)),
    tel(db.from("characters").select("id", { count: "exact", head: true }).eq("user_id", userId)),
    tel(db.from("brand_kits").select("id", { count: "exact", head: true }).eq("user_id", userId)),
    tel(db.from("maker_profielen").select("user_id", { count: "exact", head: true }).eq("user_id", userId)),
    tel(db.from("team_leden").select("user_id", { count: "exact", head: true }).eq("user_id", userId)),
    tel(db.from("api_sleutels").select("id", { count: "exact", head: true }).eq("user_id", userId)),
  ]);
  const s = new Set<CheckId>();
  for (const c of (creaties.data ?? []) as { maker: string; invoer: Record<string, unknown> | null; deel_code: string | null; op_profiel: boolean }[]) {
    const m = c.maker;
    if (m === "beeld") s.add("beeld");
    if (["bewerk", "upscale", "achtergrond-weg", "gezicht", "belichting"].includes(m)) s.add("bewerk");
    if (m === "beeld-naar-video" || m === "tekst-naar-video") s.add("video");
    if (m === "recept") s.add(EFFECT_IDS.has(String(c.invoer?.receptId ?? "")) ? "effect" : "app");
    if (m === "reclame") s.add("reclame");
    if (m === "voice-over") s.add("voice-over");
    if (m === "pratende-foto") s.add("pratend");
    if (m === "storytelling") s.add("storytelling");
    if (m === "dialoog") s.add("dialoog");
    if (m === "ugc") s.add("ugc");
    if (m === "film" || m === "film-scene") s.add("film");
    if (m === "trend") s.add("trend");
    if (c.deel_code) s.add("gedeeld");
    if (c.op_profiel) s.add("profiel");
  }
  if (regie) s.add("regisseur");
  if (film) s.add("film");
  if (social) s.add("social");
  if (personage) s.add("personage");
  if (huisstijl) s.add("huisstijl");
  if (team) s.add("team");
  if (claude) s.add("claude");
  // Het profiel telt pas als er ook iets op staat; dat zagen we hierboven aan op_profiel.
  if (!profiel) s.delete("profiel");
  return s;
}

export async function voortgangVan(userId: string): Promise<Voortgang> {
  const [rijen, klaar] = await Promise.all([
    // Ontbreekt de tabel nog (migratie 117 niet gedraaid), dan gewoon zonder.
    createServiceClient().from("academy_voortgang").select("les, bekeken_op, afgevinkt_op").eq("user_id", userId).then((r) => r.data ?? []),
    gemaakt(userId),
  ]);
  const bekeken = new Set(rijen.filter((r) => r.bekeken_op).map((r) => r.les as string));
  const afgevinkt = new Set(rijen.filter((r) => r.afgevinkt_op).map((r) => r.les as string));
  const gedaan = new Set(ALLE_LESSEN.filter((l) => afgevinkt.has(l.slug) || (l.opdracht.check !== "geen" && klaar.has(l.opdracht.check))).map((l) => l.slug));
  return { bekeken, gedaan };
}

export async function markeer(userId: string, les: string, wat: "bekeken" | "afgevinkt"): Promise<void> {
  const db = createServiceClient();
  const nu = new Date().toISOString();
  const { data } = await db.from("academy_voortgang").select("les").eq("user_id", userId).eq("les", les).maybeSingle();
  const veld = wat === "bekeken" ? { bekeken_op: nu } : { afgevinkt_op: nu };
  if (data) await db.from("academy_voortgang").update(veld).eq("user_id", userId).eq("les", les);
  else await db.from("academy_voortgang").insert({ user_id: userId, les, ...veld });
}
