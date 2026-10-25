import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { controleerMaken, draai, type RegieProject } from "@/lib/regisseur/agent";
import { claimTaak, mailMelding, meldingVoor, startUitvoering, type Taak, type TaakRun } from "@/lib/regisseur/taken";

// Elke 5 minuten (Vercel Cron, zie vercel.json). Drie dingen:
//  1. vaste taken die aan de beurt zijn starten, elk als nieuw project;
//  2. uitvoeringen die op creaties wachten laten doorlopen — normaal doet het scherm dat
//     bij het opvragen, maar bij een vaste taak kijkt er niemand;
//  3. de gebruiker mailen als een uitvoering klaar is, vastloopt of op hem wacht.

export const dynamic = "force-dynamic";
// De Regisseur draait na het antwoord door (after()), soms een paar rondes achter elkaar.
export const maxDuration = 800;

const PER_KEER = 10;
/** Oudere uitvoeringen laten we met rust: wie daar nog op terugkomt, doet dat in het scherm. */
const VENSTER_MS = 3 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  // Vercel Cron stuurt `Authorization: Bearer $CRON_SECRET` mee.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createServiceClient();
  const nu = Date.now();

  // 3. Eerst melden (wat in een vorige ronde af kwam), dan pas nieuw werk starten.
  const { data: runs } = await db
    .from("regie_taak_runs")
    .select("*")
    .gte("created_at", new Date(nu - VENSTER_MS).toISOString());
  const lijst = (runs ?? []) as TaakRun[];
  const { data: projecten } = lijst.length
    ? await db.from("regie_projecten").select("*").in("id", lijst.map((r) => r.project_id))
    : { data: [] };
  const opId = new Map(((projecten ?? []) as RegieProject[]).map((p) => [p.id, p]));
  const gemaild: string[] = [];
  const doorlopen: RegieProject[] = [];
  for (const r of lijst) {
    const p = opId.get(r.project_id);
    if (!p) continue;
    if (p.status === "wacht_op_maken") doorlopen.push(p);
    const m = meldingVoor(p.status);
    if (!m || m === r.gemeld) continue;
    // Eerst vastleggen dat we melden: twee rondes tegelijk mogen niet twee mails sturen.
    const { data: ik } = await db.from("regie_taak_runs").update({ gemeld: m }).eq("project_id", r.project_id).or(r.gemeld ? `gemeld.eq.${r.gemeld}` : "gemeld.is.null").select("project_id");
    if (!ik?.length) continue;
    const { data: u } = await db.auth.admin.getUserById(r.user_id);
    if (!u.user?.email) continue;
    const link = `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://ai.animideo.com").replace(/\/$/, "")}/regisseur?project=${p.id}`;
    const fout = await mailMelding(u.user.email, m, p.titel.replace(/^🔁 /, ""), link, m === "klaar" ? laatsteTekst(p) : "");
    if (fout) console.error("[cron/regie-taken] mail mislukt:", fout);
    else gemaild.push(p.id);
  }

  // 1. Taken die aan de beurt zijn.
  const { data: taken } = await db
    .from("regie_taken")
    .select("*")
    .eq("actief", true)
    .lte("volgende_op", new Date(nu).toISOString())
    .order("volgende_op")
    .limit(PER_KEER);
  const gestart: string[] = [];
  for (const t of (taken ?? []) as Taak[]) {
    try {
      if (await claimTaak(t, nu)) gestart.push(await startUitvoering(t));
    } catch (e) {
      console.error("[cron/regie-taken] starten mislukt:", t.id, e);
    }
  }

  // 2 + het echte werk: na het antwoord, alles tegelijk.
  after(() =>
    Promise.all([
      ...gestart.map((id) => draai(id)),
      ...doorlopen.map((p) => controleerMaken(p)),
    ]).then(() => undefined),
  );
  return NextResponse.json({ gestart, doorlopen: doorlopen.length, gemaild });
}

/** De afsluitende samenvatting van de Regisseur, voor in de mail. */
function laatsteTekst(p: RegieProject): string {
  for (let i = p.berichten.length - 1; i >= 0; i--) {
    const b = p.berichten[i];
    if (b.role !== "assistant") continue;
    const tekst = typeof b.content === "string" ? b.content : b.content.map((x) => (x.type === "text" ? x.text : "")).join("\n");
    if (tekst.trim()) return tekst.replace(/\*\*/g, "").trim().slice(0, 1500);
  }
  return "";
}
