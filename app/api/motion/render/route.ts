import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canUseMotion } from "@/lib/studio/access";
import { browserKlaar, browserOpdracht } from "@/lib/motion/regie";
import type { Creatie } from "@/lib/creaties/types";

export const runtime = "nodejs";
// Stem en muziek onder een video van tien minuten zetten duurt even.
export const maxDuration = 300;

// De laatste stap van een motion graphics-video gebeurt in de browser van de klant
// (lib/motion/regie.ts, "De video maken in de browser van de klant"):
//   GET  ?id=...  — de opdracht: per hoofdstuk de pagina, en een uploadplek
//   POST {id, pad, beelden, renderSec} — de video staat op de opslag; maak hem af

async function eigenCreatie(id: unknown): Promise<{ c: Creatie } | { fout: NextResponse }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { fout: NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 }) };
  if (!canUseMotion(user.email)) return { fout: NextResponse.json({ error: "Deze studio is nog niet beschikbaar voor jouw account." }, { status: 403 }) };
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { fout: NextResponse.json({ error: "Onbekende video" }, { status: 400 }) };
  const { data } = await createServiceClient().from("creaties").select("*").eq("id", id).eq("user_id", user.id).eq("maker", "motion").maybeSingle();
  if (!data) return { fout: NextResponse.json({ error: "Onbekende video" }, { status: 404 }) };
  return { c: data as Creatie };
}

export async function GET(req: NextRequest) {
  const r = await eigenCreatie(req.nextUrl.searchParams.get("id"));
  if ("fout" in r) return r.fout;
  try {
    return NextResponse.json(await browserOpdracht(r.c));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; pad?: unknown; beelden?: unknown; renderSec?: unknown };
  const r = await eigenCreatie(body.id);
  if ("fout" in r) return r.fout;
  if (typeof body.pad !== "string" || typeof body.beelden !== "number") return NextResponse.json({ error: "Onvolledige melding" }, { status: 400 });
  try {
    const c = await browserKlaar(r.c, body.pad, body.beelden, typeof body.renderSec === "number" ? body.renderSec : 0);
    return NextResponse.json({ creatie: c });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}
