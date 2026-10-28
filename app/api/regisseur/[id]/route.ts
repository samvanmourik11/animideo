import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdminAccount } from "@/lib/studio/access";
import { verversLopende } from "@/lib/creaties/wachtrij";
import type { Creatie } from "@/lib/creaties/types";
import { beantwoord, bevestig, controleerMaken, neemOver, nieuwBericht, type BijlageInvoer, type RegieProject } from "@/lib/regisseur/agent";

export const runtime = "nodejs";
export const maxDuration = 800;

async function eigen(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, p: null };
  const { data } = await createServiceClient().from("regie_projecten").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  return { user, p: data as RegieProject | null };
}

// De stand van een project, met de galerij. Wacht de Regisseur op creaties, dan laat dit
// opvragen de wachtrij doorlopen en gaat hij vanzelf verder zodra alles klaar is.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { user, p } = await eigen(id);
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  if (!p) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  if (p.status === "wacht_op_maken") after(() => controleerMaken(p).then(() => undefined));
  const { data } = p.galerij.length
    ? await createServiceClient().from("creaties").select("*").in("id", p.galerij)
    : { data: [] };
  const galerij = (await verversLopende((data ?? []) as Creatie[])).sort((a, b) => p.galerij.indexOf(b.id) - p.galerij.indexOf(a.id));
  const { gebruik, ...rest } = p;
  // De credits van dit project ziet iedereen; de tekstkosten van Claude alleen beheer.
  const kosten = { besteed: gebruik?.besteed ?? 0, ...(gebruik?.budget !== undefined ? { budget: gebruik.budget } : {}) };
  return NextResponse.json({ project: { ...rest, kosten, ...(isAdminAccount(user.email) ? { gebruik } : {}) }, galerij });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { user, p } = await eigen(id);
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  if (!p) return NextResponse.json({ error: "Niet gevonden" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { actie?: string; tekst?: unknown; ja?: unknown; aan?: unknown; bijlagen?: unknown; waarde?: unknown };
  const waarde = typeof b.waarde === "string" ? b.waarde.slice(0, 600) : undefined;
  const bijlagen = (Array.isArray(b.bijlagen) ? b.bijlagen : []) as BijlageInvoer[];
  const tekst = typeof b.tekst === "string" ? b.tekst.trim().slice(0, 4000) : "";

  if (b.actie === "automatisch") {
    await createServiceClient().from("regie_projecten").update({ automatisch: b.aan === true }).eq("id", id);
    return NextResponse.json({ ok: true });
  }
  // Alleen als de Regisseur niet al bezig is: twee rondes tegelijk zouden het gesprek
  // door elkaar halen.
  const mag = ["klaar", "fout", "wacht_op_antwoord", "wacht_op_bevestiging"];
  if (b.actie === "bericht") {
    if (!tekst && !bijlagen.length) return NextResponse.json({ error: "Leeg bericht." }, { status: 400 });
    if (!(await neemOver(id, mag))) return NextResponse.json({ error: "De Regisseur is nog bezig. Even geduld." }, { status: 409 });
    after(() => nieuwBericht(p, tekst, bijlagen));
  } else if (b.actie === "antwoord") {
    if (!(await neemOver(id, ["wacht_op_antwoord"]))) return NextResponse.json({ error: "Er staat geen vraag open." }, { status: 409 });
    after(() => beantwoord(p, tekst, bijlagen, waarde));
  } else if (b.actie === "bevestig") {
    if (!(await neemOver(id, ["wacht_op_bevestiging"]))) return NextResponse.json({ error: "Er staat niets klaar om te bevestigen." }, { status: 409 });
    after(() => bevestig(p, b.ja === true, tekst || undefined));
  } else {
    return NextResponse.json({ error: "Onbekende actie." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
