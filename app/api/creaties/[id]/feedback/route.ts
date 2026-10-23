import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FeedbackFout, feedbackVan, geefFeedback } from "@/lib/creaties/feedback";

export const runtime = "nodejs";

async function gebruiker() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Of er al feedback is gegeven (dan tonen we die in plaats van het formulier).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  return NextResponse.json({ feedback: await feedbackVan(user.id, (await ctx.params).id) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { sterren?: unknown; tekst?: unknown };
  try {
    return NextResponse.json(await geefFeedback(user.id, (await ctx.params).id, b.sterren, b.tekst));
  } catch (e) {
    if (e instanceof FeedbackFout) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[feedback]", e);
    return NextResponse.json({ error: "Opslaan mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
