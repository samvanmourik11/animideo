import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WachtrijFout } from "@/lib/creaties/wachtrij";
import { monteerUgcOpnieuw } from "@/lib/ugc/regie";

export const runtime = "nodejs";
export const maxDuration = 300;

// Een mislukte UGC-video opnieuw monteren met de clips die al klaarstaan.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  try {
    return NextResponse.json({ creatie: await monteerUgcOpnieuw(user.id, (await ctx.params).id) });
  } catch (e) {
    if (e instanceof WachtrijFout) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[monteer-opnieuw]", e);
    return NextResponse.json({ error: "Opnieuw monteren mislukt. Probeer het later nog eens." }, { status: 500 });
  }
}
