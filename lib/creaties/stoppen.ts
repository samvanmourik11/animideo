// Een creatie die nog in de maak is stoppen (Maxims testronde: een UGC-video van 4 tot 8
// minuten of een trend van 10 tot 20 minuten kon je alleen uitzitten).
//
// De credits (Sam, 26-10-2026):
// - Was het model nog niet begonnen (fal: nog in de wachtrij), dan altijd terug.
// - De eerste keer dat iemand stopt terwijl het model al bezig is: ook terug, met de
//   waarschuwing dat te laat stoppen voortaan credits kost. Dat onthouden we zonder eigen
//   kolom: een eerder gestopte creatie met invoer.gestopt = "gratis".
// - Daarna: het model heeft al voor ons gewerkt (en ons geld gekost), dus de credits blijven
//   verbruikt.
// Alleen op de server.

import { fal } from "@/lib/fal";
import { createServiceClient } from "@/lib/supabase/service";
import { betaalTerug } from "@/lib/team/team";
import { WachtrijFout } from "./wachtrij";
import type { Creatie } from "./types";

export type StopUitkomst = "nog-niet-begonnen" | "eerste-keer" | "verbruikt";

export const STOP_MELDING: Record<StopUitkomst, string> = {
  "nog-niet-begonnen": "Gestopt voordat het model begon. Je credits staan weer op je saldo.",
  "eerste-keer":
    "Gestopt. Je credits staan weer op je saldo. Let op: stop je voortaan terwijl het model al aan het maken is, dan kost dat wel credits, want het werk is dan al gedaan.",
  verbruikt: "Gestopt. Het model was al aan het maken, dus de credits zijn verbruikt.",
};

/** Bepaalt wat er met de credits gebeurt. Puur, zodat het te testen is. */
export function stopUitkomst(begonnen: boolean, alEensGratisGestopt: boolean): StopUitkomst {
  if (!begonnen) return "nog-niet-begonnen";
  return alEensGratisGestopt ? "verbruikt" : "eerste-keer";
}

/** Nog in de wachtrij van fal? Alleen dan is er echt nog niets gedaan. */
async function nogInWachtrij(c: Creatie): Promise<boolean> {
  if (!c.fal_request_id || !c.fal_endpoint) return false;
  try {
    const s = (await fal.queue.status(c.fal_endpoint, { requestId: c.fal_request_id })) as { status?: string };
    return s.status === "IN_QUEUE";
  } catch {
    return false;
  }
}

export async function stopCreatie(userId: string, id: string): Promise<{ creatie: Creatie; melding: string }> {
  const db = createServiceClient();
  const { data } = await db.from("creaties").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  const c = data as Creatie | null;
  if (!c) throw new WachtrijFout("Deze creatie bestaat niet (meer).", 404);
  if (c.status !== "bezig") throw new WachtrijFout("Deze creatie is al klaar of gestopt.", 400);

  const wachtrij = await nogInWachtrij(c);
  const { count } = await db
    .from("creaties")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("invoer->>gestopt", "gratis");
  const uitkomst = stopUitkomst(!wachtrij, (count ?? 0) > 0);

  // Bij fal afbreken scheelt ons kosten als het nog kan; lukt het niet, dan is dat geen fout.
  if (c.fal_request_id && c.fal_endpoint) {
    await fal.queue.cancel(c.fal_endpoint, { requestId: c.fal_request_id }).catch(() => {});
  }

  const terug = uitkomst !== "verbruikt";
  const gestopt = uitkomst === "eerste-keer" ? "gratis" : terug ? "terug" : "verbruikt";
  // Alleen de aanroep die de rij écht van 'bezig' naar 'mislukt' zet, boekt terug (twee
  // klikken tegelijk mogen niet twee keer terugboeken). Lopende stappen van een UGC-video of
  // trend kijken zelf naar 'bezig' en stoppen dan vanzelf.
  const { data: rij } = await db
    .from("creaties")
    .update({ status: "mislukt", foutmelding: STOP_MELDING[uitkomst], invoer: { ...c.invoer, gestopt } })
    .eq("id", c.id)
    .eq("status", "bezig")
    .select("*")
    .maybeSingle();
  if (!rij) throw new WachtrijFout("Deze creatie is net klaar of al gestopt.", 409);
  if (terug && c.credits > 0) {
    try {
      await betaalTerug(c, `Terug: ${c.maker} gestopt door gebruiker`);
    } catch (e) {
      console.error("[creaties] credits terugzetten na stoppen mislukt:", e);
    }
  }
  return { creatie: rij as Creatie, melding: STOP_MELDING[uitkomst] };
}
