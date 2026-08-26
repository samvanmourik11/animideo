// Eén knop: klant blokkeren en stopzetten.
//
// Dit is precies wat er bij een terugboeking automatisch hoort te gebeuren
// (lib/chargeback.ts), maar dan met de hand aangezet — voor het geval je zelf
// ingrijpt vóór of ná een storno. Vier dingen, in deze volgorde:
//
//   1. Mollie: lopende abonnementen opzeggen én de mandaten intrekken. Alleen
//      opzeggen is niet genoeg: met een geldig mandaat start iemand zo weer een
//      nieuw abonnement zonder opnieuw te machtigen.
//   2. Het account op slot: terug naar gratis, afrekenen geblokkeerd.
//   3. Openstaande gast-checkouts blokkeren, zodat ze niet alsnog geclaimd
//      worden en er via die weg een account ontstaat.
//   4. E-mailadres en rekeningnummer op de zwarte lijst, zodat een nieuw
//      adres met dezelfde rekening ook niet meer langs de kassa komt.
//
// De betaling zelf blijft staan. Terugstorten is een beslissing van een mens en
// hoort in het Mollie-dashboard, niet achter een knop die per ongeluk twee keer
// ingedrukt kan worden.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revokeMollieBilling } from "@/lib/chargeback";
import { blokkeer } from "@/lib/billing-blocklist";

export const runtime = "nodejs";
export const maxDuration = 60;

export interface BlokkeerResultaat {
  ok: true;
  email: string | null;
  opgezegdeAbonnementen: string[];
  ingetrokkenMandaten: string[];
  accountGeblokkeerd: boolean;
  checkoutsGeblokkeerd: number;
  opZwarteLijst: string[];
  waarschuwingen: string[];
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profiel } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profiel?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    customerId?: string | null;
    email?: string | null;
    iban?: string | null;
    reden?: string | null;
  };
  const customerId = body.customerId?.trim() || null;
  const email = body.email?.trim().toLowerCase() || null;
  const iban = body.iban?.trim() || null;
  const reden = body.reden?.trim() || "Handmatig geblokkeerd vanuit het dashboard";

  if (!customerId && !email) {
    return NextResponse.json({ error: "Geef minstens een Mollie-klant of een e-mailadres" }, { status: 400 });
  }

  const service = createServiceClient();
  const waarschuwingen: string[] = [];
  let opgezegdeAbonnementen: string[] = [];
  let ingetrokkenMandaten: string[] = [];

  // 1. Mollie
  if (customerId) {
    try {
      const r = await revokeMollieBilling(customerId);
      opgezegdeAbonnementen = r.canceledSubscriptions;
      ingetrokkenMandaten = r.revokedMandates;
    } catch (e) {
      // Mollie onbereikbaar mag het vergrendelen hieronder niet tegenhouden:
      // liever een account op slot met een openstaand mandaat dan geen van beide.
      waarschuwingen.push(`Mollie: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    waarschuwingen.push("Geen Mollie-klant bekend; abonnement en mandaat zijn niet aangeraakt.");
  }

  // 2. Account
  let accountGeblokkeerd = false;
  const query = service.from("profiles").select("id,email,credits");
  const { data: profielen } = customerId
    ? await query.eq("mollie_customer_id", customerId)
    : await query.eq("email", email!);
  const doelen = profielen ?? [];
  // Ook een profiel dat alleen via e-mail te vinden is meenemen, als we op
  // klant-id zochten en niets vonden.
  if (doelen.length === 0 && email) {
    const { data: viaMail } = await service.from("profiles").select("id,email,credits").eq("email", email);
    doelen.push(...(viaMail ?? []));
  }
  for (const p of doelen) {
    const { error } = await service
      .from("profiles")
      .update({
        plan: "free",
        subscription_status: "canceled",
        mollie_subscription_id: null,
        billing_blocked: true,
        billing_blocked_at: new Date().toISOString(),
        billing_blocked_reason: reden,
      })
      .eq("id", p.id);
    if (error) waarschuwingen.push(`Account ${p.email}: ${error.message}`);
    else accountGeblokkeerd = true;
  }
  if (doelen.length === 0) waarschuwingen.push("Geen account gevonden; alleen Mollie en de zwarte lijst zijn bijgewerkt.");

  // 3. Gast-checkouts
  let checkoutsGeblokkeerd = 0;
  const mails = [...new Set([email, ...doelen.map((d) => d.email)].filter(Boolean))] as string[];
  if (mails.length > 0) {
    const { data: co } = await service
      .from("pending_checkouts")
      .update({ status: "blocked" })
      .in("email", mails)
      .neq("status", "blocked")
      .select("id");
    checkoutsGeblokkeerd = co?.length ?? 0;
  }

  // 4. Zwarte lijst
  const opZwarteLijst: string[] = [];
  for (const waarde of [...mails.map((m) => ["email", m] as const), ...(iban ? [["iban", iban] as const] : [])]) {
    const r = await blokkeer(waarde[0], waarde[1], reden);
    if (r.ok) opZwarteLijst.push(waarde[1]);
    else waarschuwingen.push(`Zwarte lijst (${waarde[1]}): ${r.fout}`);
  }

  const resultaat: BlokkeerResultaat = {
    ok: true,
    email: mails[0] ?? null,
    opgezegdeAbonnementen,
    ingetrokkenMandaten,
    accountGeblokkeerd,
    checkoutsGeblokkeerd,
    opZwarteLijst,
    waarschuwingen,
  };
  console.warn(
    `[admin/blokkeer] ${mails.join(", ") || customerId} — abonnementen=${opgezegdeAbonnementen.length}, ` +
    `mandaten=${ingetrokkenMandaten.length}, account=${accountGeblokkeerd}, checkouts=${checkoutsGeblokkeerd}`
  );
  return NextResponse.json(resultaat);
}
