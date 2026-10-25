// De gratis week: 7 dagen gratis met 200 credits, daarna het gekozen abonnement (Sam,
// 25-10-2026). Verifiëren gaat met een iDEAL-betaling van 1 tot 9 cent; die zet het
// incassomandaat klaar en storten we meteen terug. Eén gratis week per bankrekening en per
// e-mailadres, anders is het een eindeloze gratis app.

import { createHash, randomInt } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { mollieFetch } from "@/lib/mollie";

export const GRATIS_WEEK_CREDITS = 200;
export const GRATIS_WEEK_DAGEN = 7;

export const PAKKET_PRIJS: Record<string, string> = { starter: "49.00", pro: "99.00", agency: "249.00" };
export const PAKKET_NAAM: Record<string, string> = { starter: "Starter", pro: "Pro", agency: "Agency" };

/** Een willekeurig bedrag tussen €0,01 en €0,09: een vast bedrag leest als "kosten". */
export function verificatieBedrag(): string {
  return `0.0${randomInt(1, 10)}`;
}

/** Iban/rekening zonder spaties en hoofdletters, gehasht: we willen alleen herkennen, niet bewaren. */
export function rekeningHash(rekening: string | null | undefined): string | null {
  const r = rekening?.replace(/\s+/g, "").toUpperCase();
  return r ? createHash("sha256").update(`gratis-week:${r}`).digest("hex") : null;
}

export async function alGehad(email: string): Promise<boolean> {
  const { count } = await createServiceClient()
    .from("gratis_weken")
    .select("id", { count: "exact", head: true })
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .eq("status", "gestart");
  return !!count;
}

interface Betaling {
  id: string;
  status: string;
  customerId?: string;
  mandateId?: string;
  amount: { value: string };
  details?: { consumerAccount?: string };
  metadata?: { guestCheckoutId?: string; planId?: string };
}

/**
 * Webhook-tak. Mollie meldt dezelfde betaling vaker; alleen een rij met status 'open' wordt
 * verwerkt, dus het abonnement en de terugstorting gebeuren één keer.
 */
export async function verwerkGratisWeek(p: Betaling): Promise<void> {
  const db = createServiceClient();
  const checkoutId = p.metadata?.guestCheckoutId;
  if (!checkoutId) return;
  const { data: rij } = await db.from("gratis_weken").select("*").eq("checkout_id", checkoutId).maybeSingle();
  if (!rij || rij.status !== "open") return;

  if (p.status !== "paid") {
    if (["failed", "canceled", "expired"].includes(p.status)) {
      await db.from("gratis_weken").update({ status: "mislukt" }).eq("id", rij.id);
    }
    return;
  }

  // Eerst vastleggen dat we hem pakken, zodat een gelijktijdige tweede melding niets doet.
  const { data: geclaimd } = await db.from("gratis_weken").update({ status: "bezig" }).eq("id", rij.id).eq("status", "open").select("id");
  if (!geclaimd?.length) return;

  const hash = rekeningHash(p.details?.consumerAccount);
  let dubbel = false;
  if (hash) {
    const { count } = await db.from("gratis_weken").select("id", { count: "exact", head: true }).eq("rekening_hash", hash).eq("status", "gestart");
    dubbel = !!count;
  }

  // Het verificatiebedrag gaat altijd terug, ook als de week niet doorgaat.
  let terug: string | null = null;
  try {
    await mollieFetch(`/payments/${p.id}/refunds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: { currency: "EUR", value: p.amount.value }, description: "Animideo: verificatie teruggestort" }),
    });
    terug = new Date().toISOString();
  } catch (e) {
    console.error("[gratis-week] terugstorten mislukt:", e instanceof Error ? e.message : String(e));
  }

  if (dubbel) {
    await db.from("gratis_weken").update({ status: "dubbel", rekening_hash: hash, terugbetaald_op: terug }).eq("id", rij.id);
    await db.from("pending_checkouts").update({ status: "geweigerd" }).eq("id", checkoutId);
    return;
  }

  let mandateId = p.mandateId ?? null;
  if (!mandateId && p.customerId) {
    const m = await mollieFetch<{ _embedded?: { mandates?: { id: string; status: string }[] } }>(`/customers/${p.customerId}/mandates`).catch(() => null);
    mandateId = m?._embedded?.mandates?.find((x) => x.status === "valid" || x.status === "pending")?.id ?? null;
  }

  const plan = rij.plan as string;
  const start = new Date(Date.now() + GRATIS_WEEK_DAGEN * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let subscriptionId: string | null = null;
  try {
    const sub = await mollieFetch<{ id: string }>(`/customers/${p.customerId}/subscriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: { currency: "EUR", value: PAKKET_PRIJS[plan] },
        times: null,
        interval: "1 month",
        startDate: start,
        description: `Animideo ${PAKKET_NAAM[plan]}`,
        webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/mollie/webhook`,
        metadata: { planId: plan, guestCheckoutId: checkoutId, isGuest: true },
        ...(mandateId ? { mandateId } : {}),
      }),
    });
    subscriptionId = sub.id;
  } catch (e) {
    console.error("[gratis-week] abonnement aanmaken mislukt:", e instanceof Error ? e.message : String(e));
  }

  await db.from("pending_checkouts").update({ status: "paid", mollie_subscription_id: subscriptionId }).eq("id", checkoutId);
  await db.from("gratis_weken").update({ status: "gestart", rekening_hash: hash, terugbetaald_op: terug }).eq("id", rij.id);
}

/** Voor het koppelen na registratie: was deze checkout een gratis week? */
export async function isGratisWeek(checkoutId: string): Promise<boolean> {
  const { count } = await createServiceClient().from("gratis_weken").select("id", { count: "exact", head: true }).eq("checkout_id", checkoutId).eq("status", "gestart");
  return !!count;
}
