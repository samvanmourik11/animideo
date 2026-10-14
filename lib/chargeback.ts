// Afhandeling van terugboekingen (chargebacks / SEPA-storno's).
//
// Eén klant die terugstort mag daarna niets meer kosten: het account gaat terug
// naar 'free' en alle incassosporen bij Mollie worden ingetrokken. Dat laatste
// is het belangrijkste deel — een geannuleerd abonnement zonder ingetrokken
// mandaat laat de mogelijkheid open dat er alsnog een incasso wordt aangemaakt.
//
// Alles hier is idempotent: Mollie roept dezelfde webhook meerdere keren aan.
// Alleen server-side gebruiken (service-client + MOLLIE_API_KEY).

import { createServiceClient } from "@/lib/supabase/service";

const MOLLIE_BASE = "https://api.mollie.com/v2";

/**
 * Credits die overblijven na een terugboeking. Bewust 0 en niet de 100 van het
 * gratis pakket: wie een incasso terugdraait, krijgt er geen verse gratis
 * bundel bovenop. Zet dit op 100 als een terugboeking wél op het normale
 * gratis pakket moet uitkomen.
 */
export const CHARGEBACK_CREDITS = 0;

interface MollieSubscription { id: string; status: string }
interface MollieMandate { id: string; status: string }

function apiKey(): string | null {
  const k = process.env.MOLLIE_API_KEY;
  if (!k || /x{4,}/.test(k)) return null;
  return k;
}

/** DELETE zonder response-parsing: Mollie geeft 204 bij het intrekken van een mandaat. */
async function mollieDelete(path: string, key: string): Promise<boolean> {
  const res = await fetch(`${MOLLIE_BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  // 404 = al weg; dat telt als geslaagd.
  return res.ok || res.status === 404;
}

async function mollieList<T>(path: string, key: string, embedded: string): Promise<T[]> {
  const res = await fetch(`${MOLLIE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return (json?._embedded?.[embedded] ?? []) as T[];
}

/**
 * Trekt alles in waarmee Mollie nog geld bij deze klant kan innen: alle lopende
 * abonnementen én alle geldige mandaten. Retourneert wat er is ingetrokken.
 */
export async function revokeMollieBilling(customerId: string): Promise<{
  canceledSubscriptions: string[];
  revokedMandates: string[];
}> {
  const key = apiKey();
  if (!key) return { canceledSubscriptions: [], revokedMandates: [] };

  const subs = await mollieList<MollieSubscription>(
    `/customers/${customerId}/subscriptions?limit=250`, key, "subscriptions"
  );
  const openSubs = subs.filter((s) => s.status === "active" || s.status === "pending");
  const canceledSubscriptions: string[] = [];
  for (const s of openSubs) {
    if (await mollieDelete(`/customers/${customerId}/subscriptions/${s.id}`, key)) {
      canceledSubscriptions.push(s.id);
    }
  }

  // Mandaat intrekken ná de abonnementen: een mandaat dat nog aan een lopend
  // abonnement hangt, laat Mollie niet altijd zonder meer los.
  const mandates = await mollieList<MollieMandate>(
    `/customers/${customerId}/mandates?limit=250`, key, "mandates"
  );
  const liveMandates = mandates.filter((m) => m.status === "valid" || m.status === "pending");
  const revokedMandates: string[] = [];
  for (const m of liveMandates) {
    if (await mollieDelete(`/customers/${customerId}/mandates/${m.id}`, key)) {
      revokedMandates.push(m.id);
    }
  }

  return { canceledSubscriptions, revokedMandates };
}

export interface ChargebackInput {
  /** Profiel-id, als de terugboeking bij een bestaand account hoort. */
  userId?: string | null;
  /** Mollie-klant; wordt anders van het profiel gelezen. */
  customerId?: string | null;
  /** De betaling die is teruggeboekt — tevens de idempotentiesleutel. */
  paymentId: string;
  /** Bedrag van de terugboeking, puur voor het auditspoor. */
  amount?: string | null;
  currency?: string | null;
  /** Gast-checkout die nog geen account had. */
  guestCheckoutId?: string | null;
}

export interface ChargebackResult {
  alreadyHandled: boolean;
  userId: string | null;
  canceledSubscriptions: string[];
  revokedMandates: string[];
}

/**
 * Handelt een terugboeking volledig af:
 *  1. abonnementen + mandaten bij Mollie intrekken (geen incasso's meer);
 *  2. het account terugzetten naar 'free' en op slot;
 *  3. gast-checkout markeren, zodat die niet alsnog geclaimd wordt;
 *  4. vastleggen in `chargebacks` + het creditlogboek.
 */
export async function handleChargeback(input: ChargebackInput): Promise<ChargebackResult> {
  const supabase = createServiceClient();
  const { paymentId, guestCheckoutId } = input;

  // Idempotentie: deze betaling al verwerkt? Dan niets opnieuw doen.
  const { data: bestaand } = await supabase
    .from("chargebacks")
    .select("id, user_id")
    .eq("mollie_payment_id", paymentId)
    .maybeSingle();
  if (bestaand) {
    return {
      alreadyHandled: true,
      userId: bestaand.user_id ?? null,
      canceledSubscriptions: [],
      revokedMandates: [],
    };
  }

  let userId = input.userId ?? null;
  let customerId = input.customerId ?? null;
  let huidigeCredits = 0;

  // Profiel opzoeken via userId, anders via het Mollie-klantnummer.
  const query = supabase.from("profiles").select("id, credits, mollie_customer_id");
  const { data: profiel } = userId
    ? await query.eq("id", userId).maybeSingle()
    : customerId
      ? await query.eq("mollie_customer_id", customerId).maybeSingle()
      : { data: null };

  if (profiel) {
    userId = profiel.id;
    customerId = customerId ?? profiel.mollie_customer_id;
    huidigeCredits = profiel.credits ?? 0;
  }

  // 1. Incassosporen intrekken.
  let canceledSubscriptions: string[] = [];
  let revokedMandates: string[] = [];
  if (customerId) {
    try {
      ({ canceledSubscriptions, revokedMandates } = await revokeMollieBilling(customerId));
    } catch (e) {
      // Mollie onbereikbaar mag de vergrendeling hieronder niet tegenhouden.
      console.error("[chargeback] intrekken bij Mollie mislukt:", e instanceof Error ? e.message : String(e));
    }
  }

  // 2. Account terug naar gratis en op slot.
  if (userId) {
    await supabase
      .from("profiles")
      .update({
        plan: "free",
        credits: CHARGEBACK_CREDITS,
        subscription_status: "chargeback",
        mollie_subscription_id: null,
        billing_blocked: true,
        billing_blocked_at: new Date().toISOString(),
        billing_blocked_reason: `Terugboeking van betaling ${paymentId}`,
      })
      .eq("id", userId);

    // Het saldo op nul zetten hoort ook in het logboek te staan.
    const verschil = CHARGEBACK_CREDITS - huidigeCredits;
    if (verschil !== 0) {
      await supabase.from("credit_transactions").insert({
        user_id: userId,
        amount: verschil,
        reason: `Terugboeking ${paymentId}: account teruggezet naar gratis`,
      });
    }
  }

  // 3. Gast-checkout blokkeren, zodat hij niet later alsnog geclaimd wordt.
  if (guestCheckoutId) {
    await supabase
      .from("pending_checkouts")
      .update({ status: "chargeback" })
      .eq("id", guestCheckoutId);
  }

  // 4. Auditspoor. De unieke index op mollie_payment_id vangt een gelijktijdige
  //    tweede webhook af; die insert faalt dan stil en dat is precies goed.
  await supabase.from("chargebacks").insert({
    user_id: userId,
    mollie_payment_id: paymentId,
    mollie_customer_id: customerId,
    amount: input.amount ? Number(input.amount) : null,
    currency: input.currency ?? "EUR",
    canceled_subscriptions: canceledSubscriptions,
    revoked_mandates: revokedMandates,
  });

  console.warn(
    `[chargeback] ${paymentId} verwerkt — user=${userId ?? "onbekend"}, ` +
    `abonnementen ingetrokken=${canceledSubscriptions.length}, mandaten ingetrokken=${revokedMandates.length}`
  );

  return { alreadyHandled: false, userId, canceledSubscriptions, revokedMandates };
}

/** Is dit account geblokkeerd na een terugboeking? */
export async function isBillingBlocked(userId: string): Promise<boolean> {
  const { data } = await createServiceClient()
    .from("profiles")
    .select("billing_blocked")
    .eq("id", userId)
    .maybeSingle();
  return data?.billing_blocked === true;
}

/**
 * Zelfde controle, maar op e-mailadres — voor de gast-checkouts, waar nog geen
 * sessie is. Zonder deze variant kan iemand na een terugboeking gewoon opnieuw
 * afrekenen met hetzelfde adres.
 */
export async function isBillingBlockedByEmail(email: string): Promise<boolean> {
  const { data } = await createServiceClient()
    .from("profiles")
    .select("billing_blocked")
    .ilike("email", email.trim())
    .eq("billing_blocked", true)
    .maybeSingle();
  return data?.billing_blocked === true;
}

/** Melding voor de klant wanneer een nieuwe betaalpoging geweigerd wordt. */
export const BILLING_BLOCKED_MESSAGE =
  "Er staat een teruggeboekte betaling open op dit account. " +
  "Neem contact op met support@jouwanimatievideo.nl om weer een abonnement af te sluiten.";
