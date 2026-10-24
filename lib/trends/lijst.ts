// Trends ophalen voor de studio. Via de service-client (de tabel heeft geen leesregels:
// de verborgen opdracht mag niet naar de browser) en daarna altijd door publiek().

import { createServiceClient } from "@/lib/supabase/service";
import { PUBLIEKE_KOLOMMEN, isVers, publiek, type PubliekeTrend, type Trend } from "./types";

/** De live trends: eerst wat nu viral is (heetste eerst), dan de klassiekers. */
export async function liveTrends(): Promise<{ nu: PubliekeTrend[]; klassiekers: PubliekeTrend[] }> {
  const { data } = await createServiceClient().from("trends").select(PUBLIEKE_KOLOMMEN).eq("status", "live").limit(200);
  const alle = ((data ?? []) as unknown as Trend[]).map(publiek);
  const opVolgorde = (a: PubliekeTrend, b: PubliekeTrend) => b.hotness - a.hotness || (b.live_op ?? "").localeCompare(a.live_op ?? "");
  return {
    nu: alle.filter((t) => isVers(t)).sort(opVolgorde),
    klassiekers: alle.filter((t) => !isVers(t)).sort(opVolgorde),
  };
}

/** Eén trend; een voorstel alleen voor beheer (Sam probeert hem uit). */
export async function trendVoor(id: string, beheer: boolean): Promise<PubliekeTrend | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createServiceClient().from("trends").select(PUBLIEKE_KOLOMMEN).eq("id", id).maybeSingle();
  const t = data as unknown as Trend | null;
  if (!t || (t.status !== "live" && !beheer)) return null;
  return publiek(t);
}

/** Voor beheer: wat nog gekeurd moet worden, zoals de klant het straks ziet. */
export async function teKeuren(): Promise<PubliekeTrend[]> {
  const { data } = await createServiceClient().from("trends").select(PUBLIEKE_KOLOMMEN).eq("status", "voorstel").order("hotness", { ascending: false }).limit(60);
  return ((data ?? []) as unknown as Trend[]).map(publiek);
}
