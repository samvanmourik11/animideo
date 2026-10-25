import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lijstSleutels, maakSleutel, trekIn } from "@/lib/mcp/sleutels";
import { magGebruiker } from "@/lib/plan-rechten-server";
import { upgradeTekst } from "@/lib/plan-rechten";

export const runtime = "nodejs";

async function gebruiker() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  return NextResponse.json({ sleutels: await lijstSleutels(user.id) });
}

// Nieuwe sleutel: alleen in dit antwoord staat hij voluit; daarna nooit meer.
export async function POST(req: NextRequest) {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  if (!(await magGebruiker(user.id, "apiSleutels"))) return NextResponse.json({ error: upgradeTekst("apiSleutels") }, { status: 403 });
  const { naam } = (await req.json().catch(() => ({}))) as { naam?: unknown };
  try {
    return NextResponse.json(await maakSleutel(user.id, String(naam ?? "")));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Aanmaken mislukt." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  await trekIn(user.id, req.nextUrl.searchParams.get("id") ?? "");
  return NextResponse.json({ ok: true });
}
