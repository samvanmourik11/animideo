import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { accountsVan } from "@/lib/social/zernio";
import { bedenkIdeeen } from "@/lib/social/kalender";
import { MAX_FOTOS, type Kanaal } from "@/lib/social/types";

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
  const b = (await req.json().catch(() => ({}))) as { briefing?: unknown; accounts?: unknown; modus?: unknown; start?: unknown; weken?: unknown; per_week?: unknown; fotos?: unknown; eindkaart?: unknown };
  const briefing = String(b.briefing ?? "").trim().slice(0, 3000);
  if (briefing.length < 10) return NextResponse.json({ error: "Vertel kort waar de posts over moeten gaan." }, { status: 400 });
  const weken = Math.min(6, Math.max(1, Math.round(Number(b.weken) || 4)));
  const perWeek = Math.min(7, Math.max(1, Math.round(Number(b.per_week) || 3)));
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(b.start)) ? String(b.start) : new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  // Alleen accounts die echt van deze gebruiker zijn, opnieuw opgehaald bij Zernio.
  const gekozen = new Set((Array.isArray(b.accounts) ? b.accounts : []).map(String));
  let kanalen: Kanaal[];
  try {
    kanalen = (await accountsVan(user.id)).filter((a) => gekozen.has(a.id)).map((a) => ({ platform: a.platform, accountId: a.id, naam: a.naam }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Accounts ophalen mislukt." }, { status: 500 });
  }
  if (!kanalen.length) return NextResponse.json({ error: "Kies minstens één gekoppeld account." }, { status: 400 });
  // Eigen foto's: creatie-ids uit de eigen bibliotheek, opnieuw opgezocht (nooit een adres uit de browser).
  const fotoIds = (Array.isArray(b.fotos) ? b.fotos : []).map(String).slice(0, MAX_FOTOS);
  const { data: fs } = fotoIds.length
    ? await createServiceClient().from("creaties").select("id, url, prompt").eq("user_id", user.id).eq("soort", "beeld").in("id", fotoIds)
    : { data: [] };
  const fotos = fotoIds.map((id) => (fs ?? []).find((f) => f.id === id)).filter((f) => f?.url).map((f) => ({ url: f!.url as string, naam: String(f!.prompt ?? "foto").slice(0, 80) }));
  const eindkaart = String(b.eindkaart ?? "").trim().slice(0, 40) || null;
  const { data, error } = await createServiceClient()
    .from("content_kalenders")
    .insert({ user_id: user.id, titel: briefing.slice(0, 60), briefing, kanalen, fotos, eindkaart, modus: b.modus === "plaatsen" ? "plaatsen" : "controleren", start_datum: start, weken, per_week: perWeek, status: "ideeen_maken" })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: "Opslaan mislukt." }, { status: 500 });
  after(() => bedenkIdeeen(data.id));
  return NextResponse.json({ id: data.id });
}
