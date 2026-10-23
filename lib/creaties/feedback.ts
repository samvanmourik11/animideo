// Feedback op eindresultaten, beloond met credits (Sam, 24-10-2026): de klant voelt inspraak,
// en de wekelijkse leerronde van het regieboek (lib/regisseur/leren.ts) leest alles mee.
//
// Grenzen tegen misbruik: alleen eindresultaten (geen losse beelden van 1 credit), één keer
// per creatie, een echte zin, en hoogstens BELONINGEN_PER_MAAND keer credits per pot.

import { createServiceClient } from "@/lib/supabase/service";
import { addCredits } from "@/lib/credits";
import { betalerVan } from "@/lib/team/team";
import { magFeedback } from "./eindmakers";

export const BELONING = 5;
export const BELONINGEN_PER_MAAND = 4;
export const MIN_TEKST = 15;
export class FeedbackFout extends Error {}

function begin(nu: number): string {
  const d = new Date(nu);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export async function geefFeedback(userId: string, creatieId: string, sterren: unknown, tekst: unknown, nu = Date.now()): Promise<{ beloond: number }> {
  const s = Math.round(Number(sterren));
  const t = String(tekst ?? "").replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!(s >= 1 && s <= 5)) throw new FeedbackFout("Kies 1 tot 5 sterren.");
  if (t.length < MIN_TEKST) throw new FeedbackFout("Schrijf in een korte zin wat je ervan vindt.");
  const db = createServiceClient();
  const { data: c } = await db.from("creaties").select("id, maker, status").eq("id", creatieId).eq("user_id", userId).maybeSingle();
  if (!c) throw new FeedbackFout("Deze video is niet gevonden.");
  if (!magFeedback(c)) throw new FeedbackFout("Feedback kan alleen op een klaar eindresultaat.");

  const pot = await betalerVan(userId);
  const { count } = await db.from("creatie_feedback").select("id", { count: "exact", head: true }).eq("beloond_aan", pot).gt("beloond", 0).gte("created_at", begin(nu));
  const beloond = (count ?? 0) < BELONINGEN_PER_MAAND ? BELONING : 0;

  // De unieke creatie_id maakt dubbel insturen (twee klikken) onmogelijk: alleen wie de rij
  // echt aanmaakt, krijgt de credits.
  const { error } = await db.from("creatie_feedback").insert({ creatie_id: creatieId, user_id: userId, beloond_aan: beloond ? pot : null, sterren: s, tekst: t, beloond });
  if (error) {
    if (error.code === "23505") throw new FeedbackFout("Je gaf al feedback op deze video. Dank je!");
    throw new Error(error.message);
  }
  if (beloond) await addCredits(pot, beloond, "Bedankt voor je feedback", { service: true });
  return { beloond };
}

export async function feedbackVan(userId: string, creatieId: string) {
  const { data } = await createServiceClient().from("creatie_feedback").select("sterren, tekst, beloond, created_at").eq("creatie_id", creatieId).eq("user_id", userId).maybeSingle();
  return data;
}
