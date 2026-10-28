// DE REGISSEUR IN DE CLAUDE-APP (Sam, 24-10-2026: "de MCP moet precies aanvoelen als de
// Regisseur in de app"). Niet Claude van de klant bedient onze losse gereedschappen, maar
// onze eigen Regisseur doet het werk: hetzelfde brein, dezelfde regels (script, storyboard,
// één bevestiging, vanzelf doorwerken). Claude geeft alleen door; het Animideo-scherm laat
// de Regisseur zien, met zijn keuzemenu's, bevestiging en resultaten.
//
// Precies dezelfde stappen als /api/regisseur en /api/regisseur/[id]: het werk loopt na het
// antwoord door (after()), het scherm vraagt de stand op.

import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { beantwoord, bevestig, controleerMaken, draai, maakInhoud, neemOver, nieuwBericht, type RegieProject } from "@/lib/regisseur/agent";
import { verversLopende } from "@/lib/creaties/wachtrij";
import type { Creatie } from "@/lib/creaties/types";
import { regels } from "@/lib/regisseur/weergave";

const MAG_BERICHT = ["klaar", "fout", "wacht_op_antwoord", "wacht_op_bevestiging"];

async function eigen(userId: string, id: unknown): Promise<RegieProject> {
  const { data } = await createServiceClient().from("regie_projecten").select("*").eq("id", String(id ?? "")).eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Dat Regisseur-project bestaat niet (meer).");
  return data as RegieProject;
}

/** Nieuw project, of een bericht in een bestaand project. Geeft het project-id terug. */
export async function stuurBericht(userId: string, tekst: string, projectId?: unknown): Promise<string> {
  const t = tekst.trim().slice(0, 4000);
  if (t.length < 2) throw new Error("Vertel de Regisseur wat je wilt maken.");
  if (projectId) {
    const p = await eigen(userId, projectId);
    // In de app betekent typen tijdens een bevestiging "nee, anders". Via Claude zegt de klant
    // juist "ja" in de chat: dat telt hier als Start.
    if (p.status === "wacht_op_bevestiging" && /^(ja|jep|jazeker|akkoord|start|ga je gang|doe maar|prima|ok(é|e)?)\b/i.test(t)) {
      if (!(await neemOver(p.id, ["wacht_op_bevestiging"]))) throw new Error("De Regisseur is nog bezig.");
      after(() => bevestig(p, true));
      return p.id;
    }
    if (!(await neemOver(p.id, MAG_BERICHT))) throw new Error("De Regisseur is nog bezig. Even geduld, het scherm ververst vanzelf.");
    after(() => nieuwBericht(p, t));
    return p.id;
  }
  const { inhoud } = await maakInhoud(userId, t);
  const { data, error } = await createServiceClient()
    .from("regie_projecten")
    .insert({ user_id: userId, titel: t.length > 60 ? `${t.slice(0, 57)}…` : t, berichten: [{ role: "user", content: inhoud }], galerij: [], status: "denkt" })
    .select("id")
    .single();
  if (error || !data) throw new Error("Project aanmaken mislukt.");
  after(() => draai(data.id));
  return data.id;
}

/** Een keuze uit het menu, of ja/nee op de bevestiging. */
export async function antwoord(userId: string, projectId: unknown, a: { actie?: unknown; tekst?: unknown; waarde?: unknown; ja?: unknown }): Promise<void> {
  const p = await eigen(userId, projectId);
  const tekst = typeof a.tekst === "string" ? a.tekst.trim().slice(0, 4000) : "";
  if (a.actie === "automatisch") {
    await createServiceClient().from("regie_projecten").update({ automatisch: a.ja === true }).eq("id", p.id);
    return;
  }
  if (a.actie === "bevestig") {
    if (!(await neemOver(p.id, ["wacht_op_bevestiging"]))) throw new Error("Er staat niets klaar om te bevestigen.");
    after(() => bevestig(p, a.ja === true, tekst || undefined));
    return;
  }
  if (!(await neemOver(p.id, ["wacht_op_antwoord"]))) throw new Error("Er staat geen vraag open.");
  const waarde = typeof a.waarde === "string" ? a.waarde.slice(0, 600) : undefined;
  after(() => beantwoord(p, tekst, [], waarde));
}

/** De stand voor het scherm (en voor Claude): gesprek, open vraag of bevestiging, resultaten. */
export async function stand(userId: string, projectId: unknown) {
  const p = await eigen(userId, projectId);
  // Wacht hij op video's: de wachtrij laten doorlopen en, als alles klaar is, verder.
  if (p.status === "wacht_op_maken") after(() => controleerMaken(p).then(() => undefined));
  const { data } = p.galerij.length ? await createServiceClient().from("creaties").select("*").in("id", p.galerij) : { data: [] };
  const galerij = (await verversLopende((data ?? []) as Creatie[]))
    .sort((a, b) => p.galerij.indexOf(b.id) - p.galerij.indexOf(a.id))
    .slice(0, 12)
    .map((c) => ({ id: c.id, status: c.status, soort: c.soort, url: c.status === "klaar" ? c.url : null, prompt: c.prompt ?? "", fout: c.status === "mislukt" ? c.foutmelding : null }));
  const w = p.wachtend;
  return {
    weergave: "regisseur",
    project_id: p.id,
    titel: p.titel,
    status: p.status,
    automatisch: p.automatisch,
    foutmelding: p.foutmelding,
    regels: regels(p.berichten, p.status === "wacht_op_antwoord").slice(-14),
    vraag: w?.soort === "antwoord" ? { vraag: w.vraag, opties: w.opties, meerdere: w.meerdere } : null,
    bevestiging:
      w?.soort === "bevestiging" ? { totaal: w.totaal, stappen: w.stappen.map((s) => ({ omschrijving: s.omschrijving, credits: s.credits, details: s.details })) }
      : w?.soort === "begroting" ? { totaal: w.totaal, stappen: w.posten }
      : null,
    galerij,
  };
}

/** Kort, voor Claude: wat er nu staat (de klant ziet het volledige scherm). */
export function samenvatting(s: Awaited<ReturnType<typeof stand>>): string {
  const laatste = [...s.regels].reverse().find((r) => r.wie === "regisseur")?.tekst ?? "";
  const status: Record<string, string> = {
    denkt: "De Regisseur is aan het werk.",
    wacht_op_antwoord: `De Regisseur stelt een vraag in het scherm: "${s.vraag?.vraag ?? ""}".`,
    wacht_op_bevestiging: `De Regisseur wil starten en vraagt akkoord in het scherm (${s.bevestiging?.totaal ?? 0} credits).`,
    wacht_op_maken: "Er wordt gemaakt; het scherm ververst vanzelf en de Regisseur gaat daarna zelf verder.",
    klaar: "De Regisseur is klaar met deze ronde.",
    fout: `Er ging iets mis: ${s.foutmelding ?? "onbekend"}.`,
  };
  return `${status[s.status] ?? s.status} (project_id ${s.project_id})${laatste ? `\nLaatste bericht van de Regisseur: ${laatste.slice(0, 1200)}` : ""}`;
}
