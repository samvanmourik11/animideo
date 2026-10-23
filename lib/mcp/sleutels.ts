// Persoonlijke sleutels voor de MCP-koppeling. Formaat "anm_" + 40 tekens; we bewaren alleen
// de sha256-hash, dus wie de database ziet, kan er niet mee inloggen.

import { createHash, randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

const MAX_SLEUTELS = 5;
const PREFIX = "anm_";

export function hash(sleutel: string): string {
  return createHash("sha256").update(sleutel).digest("hex");
}

export function nieuweSleutel(): string {
  return PREFIX + randomBytes(30).toString("base64url");
}

export async function maakSleutel(userId: string, naam: string): Promise<{ id: string; sleutel: string }> {
  const db = createServiceClient();
  const { count } = await db.from("api_sleutels").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("soort", "sleutel").is("ingetrokken_op", null);
  if ((count ?? 0) >= MAX_SLEUTELS) throw new Error(`Je hebt al ${MAX_SLEUTELS} sleutels. Trek er eerst een in.`);
  const sleutel = nieuweSleutel();
  const { data, error } = await db
    .from("api_sleutels")
    .insert({ user_id: userId, naam: naam.trim().slice(0, 60) || "Claude", hash: hash(sleutel), begin: `${sleutel.slice(0, 8)}…` })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Aanmaken mislukt.");
  return { id: data.id, sleutel };
}

export async function lijstSleutels(userId: string) {
  const { data } = await createServiceClient()
    .from("api_sleutels")
    .select("id, naam, begin, laatst_gebruikt, created_at, soort, client_id")
    .eq("user_id", userId)
    .is("ingetrokken_op", null)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function trekIn(userId: string, id: string): Promise<void> {
  await createServiceClient().from("api_sleutels").update({ ingetrokken_op: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
}

/** "Bearer anm_…" → de gebruiker, of null. Werkt laatst_gebruikt bij (hoogstens eens per minuut). */
export async function gebruikerVan(authorization: string | null): Promise<string | null> {
  const m = authorization?.match(/^Bearer\s+(anm_[A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  const db = createServiceClient();
  const { data } = await db.from("api_sleutels").select("id, user_id, laatst_gebruikt, verloopt_op").eq("hash", hash(m[1])).is("ingetrokken_op", null).maybeSingle();
  // Sleutels uit de Claude-app verlopen na een uur (dan haalt Claude zelf een nieuwe).
  if (!data || (data.verloopt_op && new Date(data.verloopt_op).getTime() < Date.now())) return null;
  if (!data.laatst_gebruikt || Date.now() - new Date(data.laatst_gebruikt).getTime() > 60_000) {
    await db.from("api_sleutels").update({ laatst_gebruikt: new Date().toISOString() }).eq("id", data.id);
  }
  return data.user_id;
}
