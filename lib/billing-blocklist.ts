// ── Zwarte lijst voor afrekenen ──────────────────────────────────────────────
//
// `billing_blocked` op een profiel werkt pas als er een account is. Iemand die
// telkens een nieuw e-mailadres verzint, heeft dat niet — die staat gewoon weer
// bij de kassa. Daarom blokkeren we ook op wat níet meeverandert: de
// bankrekening waarmee betaald wordt.
//
// De rekening kennen we pas nadat Mollie de betaling heeft verwerkt. De
// controle zit daarom op twee plekken:
//   1. bij het starten van een checkout, op e-mailadres (voorkomt de meeste);
//   2. in de webhook, op rekeningnummer (vangt een nieuw adres alsnog af,
//      vóórdat er een account of abonnement van komt).
//
// Zie ook lib/chargeback.ts, dat hetzelfde doet voor een bestaand account.

import { createServiceClient } from "@/lib/supabase/service";

export type BlokkadeSoort = "email" | "iban" | "naam";

/**
 * Vergelijken doen we op één vaste schrijfwijze, anders glipt "NL90 INGB ..."
 * langs een lijst waar "nl90ingb..." in staat.
 */
export function normaliseer(soort: BlokkadeSoort, waarde: string): string {
  const kaal = waarde.trim().toLowerCase();
  return soort === "iban" ? kaal.replace(/\s+/g, "") : kaal;
}

export interface BlokkadeVraag {
  email?: string | null;
  iban?: string | null;
  naam?: string | null;
}

export interface Blokkade {
  soort: BlokkadeSoort;
  waarde: string;
  reden: string | null;
}

/**
 * Staat een van deze gegevens op de lijst? Geeft de gevonden regel terug, zodat
 * de aanroeper kan loggen wáárom er geblokkeerd is.
 *
 * Faalt de database, dan geven we `null` terug: liever een betaling te veel
 * doorlaten dan de kassa voor iedereen dichtgooien.
 */
export async function zoekBlokkade(vraag: BlokkadeVraag): Promise<Blokkade | null> {
  const paren: Array<[BlokkadeSoort, string]> = [];
  if (vraag.email) paren.push(["email", normaliseer("email", vraag.email)]);
  if (vraag.iban) paren.push(["iban", normaliseer("iban", vraag.iban)]);
  if (vraag.naam) paren.push(["naam", normaliseer("naam", vraag.naam)]);
  if (paren.length === 0) return null;

  try {
    const { data, error } = await createServiceClient()
      .from("billing_blocklist")
      .select("soort, waarde, reden")
      .in("waarde", paren.map(([, w]) => w));
    if (error || !data) return null;
    // Op waarde gefilterd in de query; hier nog op soort, zodat een e-mailadres
    // dat toevallig gelijk is aan een naam-regel niet meetelt.
    const raak = data.find((r) =>
      paren.some(([s, w]) => r.soort === s && r.waarde === w)
    );
    return raak ? { soort: raak.soort as BlokkadeSoort, waarde: raak.waarde, reden: raak.reden } : null;
  } catch {
    return null;
  }
}

/** Iets op de lijst zetten. Bestaat het al, dan gebeurt er niets. */
export async function blokkeer(soort: BlokkadeSoort, waarde: string, reden: string): Promise<void> {
  await createServiceClient()
    .from("billing_blocklist")
    .upsert(
      { soort, waarde: normaliseer(soort, waarde), reden },
      { onConflict: "soort,waarde", ignoreDuplicates: true }
    );
}

/**
 * Wat de klant te zien krijgt. Bewust zonder reden: die hoort in het logboek,
 * niet in beeld — het is geen onderhandeling.
 */
export const BLOKKADE_MELDING =
  "Afrekenen lukt niet met deze gegevens. Neem contact op via support@jouwanimatievideo.nl.";
