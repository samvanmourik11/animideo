// VASTE TAKEN — de Regisseur die op een vast moment zelf aan het werk gaat ("elke maandag
// om 8 uur 3 Instagram-posts"). De cron (/api/cron/regie-taken, elke 5 minuten) start de
// taken die aan de beurt zijn als gewoon project, laat wachtende projecten doorlopen en
// mailt de gebruiker als er iets klaar is of op hem wacht.
//
// Er kijkt niemand mee, dus geen 'ja' per stap: elke uitvoering heeft een plafond aan
// credits (Sam, 23-10-2026). Wat erboven komt, wacht op de gebruiker.

import { createServiceClient } from "@/lib/supabase/service";

export type Ritme = "dag" | "week" | "maand";

export interface Taak {
  id: string;
  user_id: string;
  titel: string;
  opdracht: string;
  ritme: Ritme;
  weekdag: number | null;
  maanddag: number | null;
  uur: number;
  max_credits: number;
  actief: boolean;
  volgende_op: string;
  laatst_op: string | null;
  laatste_project: string | null;
}

export interface TaakRun {
  project_id: string;
  taak_id: string;
  user_id: string;
  max_credits: number;
  uitgegeven: number;
  gemeld: string | null;
}

const ZONE = "Europe/Amsterdam";
export const MAX_TAKEN = 10;
export const DAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

// ── Wanneer ──────────────────────────────────────────────────────────────

/** Datum en uur zoals een klok in Nederland ze op dit moment aanwijst. */
function nlDelen(t: number) {
  const d = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23", weekday: "short" })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  return { j: +d.year, m: +d.month, d: +d.day, u: +d.hour, min: +d.minute };
}

/** Een Nederlandse kloktijd → het echte moment (houdt rekening met zomer- en wintertijd). */
export function nlMoment(j: number, m: number, d: number, u: number): number {
  const gok = Date.UTC(j, m - 1, d, u);
  const verschil = (t: number) => {
    const n = nlDelen(t);
    return Date.UTC(n.j, n.m - 1, n.d, n.u, n.min) - t;
  };
  const eerst = gok - verschil(gok);
  // Vlak rond de omschakeling kan de eerste gok aan de verkeerde kant vallen.
  return gok - verschil(eerst);
}

/** Het eerstvolgende moment ná `na` waarop de taak moet draaien. */
export function volgendeKeer(t: Pick<Taak, "ritme" | "weekdag" | "maanddag" | "uur">, na: number): number {
  const vandaag = nlDelen(na);
  for (let i = 0; i < 70; i++) {
    // Rekenen op de kalenderdag in Nederland; het middaguur voorkomt gedoe met de omschakeling.
    const dag = new Date(Date.UTC(vandaag.j, vandaag.m - 1, vandaag.d + i, 12));
    const past =
      t.ritme === "dag" ||
      (t.ritme === "week" && dag.getUTCDay() === (t.weekdag ?? 1)) ||
      (t.ritme === "maand" && dag.getUTCDate() === (t.maanddag ?? 1));
    if (!past) continue;
    const moment = nlMoment(dag.getUTCFullYear(), dag.getUTCMonth() + 1, dag.getUTCDate(), t.uur);
    if (moment > na) return moment;
  }
  throw new Error("Geen volgende keer gevonden.");
}

export function ritmeTekst(t: Pick<Taak, "ritme" | "weekdag" | "maanddag" | "uur">): string {
  const uur = `${String(t.uur).padStart(2, "0")}:00`;
  if (t.ritme === "dag") return `elke dag om ${uur}`;
  if (t.ritme === "week") return `elke ${DAGEN[t.weekdag ?? 1]} om ${uur}`;
  return `elke maand op de ${t.maanddag ?? 1}e om ${uur}`;
}

export function datumTekst(iso: string): string {
  return new Intl.DateTimeFormat("nl-NL", { timeZone: ZONE, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

// ── Vastleggen ───────────────────────────────────────────────────────────

/** Controleert wat Claude of het scherm aanlevert en maakt er een geldige taak van. */
export function schoonTaak(i: Record<string, unknown>): Pick<Taak, "titel" | "opdracht" | "ritme" | "weekdag" | "maanddag" | "uur" | "max_credits"> {
  const ritme = (["dag", "week", "maand"] as const).find((r) => r === i.ritme);
  if (!ritme) throw new Error("Kies een ritme: dag, week of maand.");
  const getal = (x: unknown, min: number, max: number, std: number) => {
    const n = Math.round(Number(x));
    return Number.isFinite(n) && n >= min && n <= max ? n : std;
  };
  const titel = String(i.titel ?? "").trim().slice(0, 80);
  const opdracht = String(i.opdracht ?? "").trim().slice(0, 4000);
  if (!titel || opdracht.length < 10) throw new Error("Geef de taak een titel en een volledige opdracht.");
  const max = Math.round(Number(i.max_credits));
  if (!Number.isFinite(max) || max < 1 || max > 500) throw new Error("Het maximum moet tussen 1 en 500 credits liggen.");
  return {
    titel,
    opdracht,
    ritme,
    weekdag: ritme === "week" ? getal(i.weekdag, 0, 6, 1) : null,
    maanddag: ritme === "maand" ? getal(i.maanddag, 1, 28, 1) : null,
    uur: getal(i.uur, 0, 23, 8),
    max_credits: max,
  };
}

export async function maakTaak(userId: string, invoer: Record<string, unknown>, bronProject?: string): Promise<Taak> {
  const t = schoonTaak(invoer);
  const db = createServiceClient();
  const { count } = await db.from("regie_taken").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) >= MAX_TAKEN) throw new Error(`Je hebt al ${MAX_TAKEN} vaste taken. Haal er eerst een weg.`);
  const { data, error } = await db
    .from("regie_taken")
    .insert({ ...t, user_id: userId, bron_project: bronProject ?? null, volgende_op: new Date(volgendeKeer(t, Date.now())).toISOString() })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Opslaan mislukt.");
  return data as Taak;
}

// ── Uitvoeren ────────────────────────────────────────────────────────────

/** De eerste beurt van een uitvoering: de opdracht plus hoe hij zich moet gedragen. */
export function startTekst(t: Taak, nu = Date.now()): string {
  return `Vaste taak "${t.titel}" (${ritmeTekst(t)}), uitvoering van ${datumTekst(new Date(nu).toISOString())}.

Er kijkt nu niemand mee. Stel dus geen vragen en kies zelf, op basis van je geheugen over deze gebruiker en de opdracht. Je mag tot ${t.max_credits} credits uitgeven zonder te vragen; kost het meer, dan wordt de gebruiker gevraagd. Maak iets nieuws (niet hetzelfde als vorige keer: kijk met mijn_werk wat er al is). Sluit af met een korte samenvatting voor de gebruiker, die een mail krijgt met de link.

De opdracht:
${t.opdracht}`;
}

/**
 * Start een uitvoering: een nieuw project, alvast overgenomen (status 'denkt'). Geeft
 * het project-id terug; de aanroeper laat de Regisseur daarna draaien.
 */
export async function startUitvoering(t: Taak): Promise<string> {
  const db = createServiceClient();
  const titel = `🔁 ${t.titel}`;
  const { data, error } = await db
    .from("regie_projecten")
    .insert({ user_id: t.user_id, titel: titel.length > 60 ? `${titel.slice(0, 57)}…` : titel, berichten: [{ role: "user", content: startTekst(t) }], galerij: [], status: "denkt" })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Project aanmaken mislukt.");
  await db.from("regie_taak_runs").insert({ project_id: data.id, taak_id: t.id, user_id: t.user_id, max_credits: t.max_credits });
  await db.from("regie_taken").update({ laatst_op: new Date().toISOString(), laatste_project: data.id }).eq("id", t.id);
  return data.id;
}

/**
 * Neemt een taak die aan de beurt is over door zijn volgende moment alvast op te schuiven.
 * Alleen de aanroep die dat echt doet, mag hem starten: twee cron-rondes die elkaar
 * overlappen, maken zo nooit twee projecten.
 */
export async function claimTaak(t: Taak, nu = Date.now()): Promise<boolean> {
  const { data } = await createServiceClient()
    .from("regie_taken")
    .update({ volgende_op: new Date(volgendeKeer(t, nu)).toISOString() })
    .eq("id", t.id)
    .eq("volgende_op", t.volgende_op)
    .eq("actief", true)
    .select("id");
  return !!data?.length;
}

export async function taakRun(projectId: string): Promise<TaakRun | null> {
  const { data } = await createServiceClient().from("regie_taak_runs").select("*").eq("project_id", projectId).maybeSingle();
  return (data as TaakRun | null) ?? null;
}

/** Past dit binnen het plafond? Zo ja, dan meteen als uitgegeven boeken. */
export async function binnenBudget(run: TaakRun, credits: number): Promise<boolean> {
  if (run.uitgegeven + credits > run.max_credits) return false;
  const { data } = await createServiceClient()
    .from("regie_taak_runs")
    .update({ uitgegeven: run.uitgegeven + credits })
    .eq("project_id", run.project_id)
    .eq("uitgegeven", run.uitgegeven)
    .select("project_id");
  return !!data?.length;
}

// ── Mail ─────────────────────────────────────────────────────────────────

const AFZENDER = "Animideo <noreply@jouwanimatievideo.nl>";

function ontsnap(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export type Melding = "klaar" | "wacht" | "fout";

export function meldingVoor(status: string): Melding | null {
  if (status === "klaar") return "klaar";
  if (status === "wacht_op_antwoord" || status === "wacht_op_bevestiging") return "wacht";
  if (status === "fout") return "fout";
  return null;
}

export function mailTekst(m: Melding, titel: string, link: string, samenvatting = ""): { onderwerp: string; tekst: string; knop: string } {
  if (m === "klaar")
    return { onderwerp: `Klaar: ${titel}`, tekst: samenvatting || `Je vaste taak "${titel}" is uitgevoerd. Het resultaat staat in je bibliotheek.`, knop: "Bekijk het resultaat" };
  if (m === "wacht")
    return {
      onderwerp: `Even jouw akkoord: ${titel}`,
      tekst: `Je vaste taak "${titel}" staat klaar, maar de Regisseur wacht op jou: hij heeft een vraag, of het kost meer credits dan het maximum dat je instelde.`,
      knop: "Bekijk en beslis",
    };
  return { onderwerp: `Niet gelukt: ${titel}`, tekst: `Je vaste taak "${titel}" liep vast. Open het project om te zien wat er misging en probeer het opnieuw.`, knop: "Open het project" };
}

export async function mailMelding(aan: string, m: Melding, titel: string, link: string, samenvatting = ""): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "RESEND_API_KEY ontbreekt";
  const { onderwerp, tekst, knop } = mailTekst(m, titel, link, samenvatting);
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
<h2 style="margin:0 0 12px">${ontsnap(onderwerp)}</h2>
<p style="white-space:pre-wrap">${ontsnap(tekst)}</p>
<p style="margin:24px 0"><a href="${link}" style="background:#1c72ed;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${knop}</a></p>
<p style="font-size:13px;color:#64748b">Je vaste taken beheer je in Animideo onder Regisseur → Vaste taken.</p></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: AFZENDER, to: [aan], subject: onderwerp, text: `${tekst}\n\n${knop}: ${link}`, html }),
  });
  if (res.ok) return null;
  return `Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
}
