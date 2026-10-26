import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WachtrijFout } from "@/lib/creaties/wachtrij";
import { stopCreatie } from "@/lib/creaties/stoppen";

export const runtime = "nodejs";

// Een creatie stoppen die nog in de maak is (zie lib/creaties/stoppen.ts voor de credits).
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  try {
    return NextResponse.json(await stopCreatie(user.id, (await ctx.params).id));
  } catch (e) {
    if (e instanceof WachtrijFout) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[stop]", e);
    return NextResponse.json({ error: "Stoppen mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
