import { NextRequest, NextResponse, after } from "next/server";
import { isAdminAccount } from "@/lib/studio/access";
import { gebruiker } from "@/lib/delen/route-hulp";
import { createServiceClient } from "@/lib/supabase/service";
import { BASIS, wisRegieboekCache } from "@/lib/regisseur/regieboek";
import { CATEGORIEEN, leerronde } from "@/lib/regisseur/leren";

export const runtime = "nodejs";
// "Nu een leerronde" laat Claude ~1-2 minuten beelden bekijken (na het antwoord).
export const maxDuration = 300;

// Alleen Sam (beheer): het regieboek van de Regisseur en de voorstellen uit de leerronde.
async function beheerder() {
  const user = await gebruiker();
  return user && isAdminAccount(user.email) ? user : null;
}

async function lijst() {
  const { data } = await createServiceClient().from("regieboek_regels").select("*").order("created_at", { ascending: false }).limit(200);
  return data ?? [];
}

export async function GET() {
  if (!(await beheerder())) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  return NextResponse.json({ basis: BASIS, regels: await lijst() });
}

export async function POST(req: NextRequest) {
  if (!(await beheerder())) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { actie?: unknown; id?: unknown; regel?: unknown; categorie?: unknown };
  const db = createServiceClient();
  if (b.actie === "leerronde") {
    after(() => leerronde().then((r) => console.log("[regieboek] leerronde:", r)).catch((e) => console.error("[regieboek] leerronde mislukt:", e)));
    return NextResponse.json({ ok: true });
  }
  if (b.actie === "nieuw") {
    const regel = String(b.regel ?? "").trim().slice(0, 600);
    const categorie = CATEGORIEEN.includes(b.categorie as never) ? String(b.categorie) : "beeld";
    if (regel.length < 10) return NextResponse.json({ error: "Schrijf de regel iets uitgebreider." }, { status: 400 });
    await db.from("regieboek_regels").insert({ regel, categorie, status: "actief", bron: "handmatig", beoordeeld_op: new Date().toISOString() });
  } else if (typeof b.id === "string" && ["actief", "afgewezen", "voorstel"].includes(String(b.actie))) {
    const regel = typeof b.regel === "string" && b.regel.trim().length >= 10 ? { regel: b.regel.trim().slice(0, 600) } : {};
    await db.from("regieboek_regels").update({ status: b.actie, beoordeeld_op: new Date().toISOString(), ...regel }).eq("id", b.id);
  } else {
    return NextResponse.json({ error: "Onbekende actie." }, { status: 400 });
  }
  wisRegieboekCache();
  return NextResponse.json({ regels: await lijst() });
}
