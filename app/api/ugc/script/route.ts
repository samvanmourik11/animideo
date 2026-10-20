import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { schrijfUgcScript } from "@/lib/ugc/script";
import { leesCreator, leesOnderwerp } from "@/lib/ugc/regie";
import { UGC_LENGTES, type UgcLengte } from "@/lib/ugc/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// UGC-studio: het script schrijven. Gratis, zo vaak als de klant wil.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const onderwerp = leesOnderwerp(b.onderwerp, b.metProduct === true);
    const creator = await leesCreator(user.id, b.creator);
    const sec = (UGC_LENGTES.some((l) => l.sec === b.sec) ? b.sec : 15) as UgcLengte;
    const script = await schrijfUgcScript(onderwerp, { ...creator, omschrijving: "" }, sec, b.broll === true);
    return NextResponse.json({ script });
  } catch (e) {
    console.error("[ugc/script]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Script schrijven mislukt." }, { status: 400 });
  }
}
