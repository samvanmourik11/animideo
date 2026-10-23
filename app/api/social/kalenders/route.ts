import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { bedenkIdeeen, KalenderFout, maakKalender } from "@/lib/social/kalender";

export const runtime = "nodejs";
// Het bedenken van de ideeën (Claude) loopt na het antwoord door, ~1-2 minuten.
export const maxDuration = 300;

async function gebruiker() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const db = createServiceClient();
  const { data } = await db.from("content_kalenders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  const { data: posts } = await db.from("content_posts").select("kalender_id, status").eq("user_id", user.id);
  const telling: Record<string, Record<string, number>> = {};
  for (const p of posts ?? []) (telling[p.kalender_id] ??= {})[p.status] = (telling[p.kalender_id][p.status] ?? 0) + 1;
  return NextResponse.json({ kalenders: (data ?? []).map((k) => ({ ...k, telling: telling[k.id] ?? {} })) });
}

// Nieuwe kalender: de opdracht, de kanalen en hoe vaak. De Regisseur bedenkt meteen de ideeën.
export async function POST(req: NextRequest) {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const id = await maakKalender(user.id, b);
    after(() => bedenkIdeeen(id));
    return NextResponse.json({ id });
  } catch (e) {
    console.error("[social/kalenders]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Dat lukte niet." }, { status: e instanceof KalenderFout ? 400 : 500 });
  }
}
