import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canUseDocu } from "@/lib/studio/access";
import { leesKanalen } from "@/lib/docu/kanalen";

export const runtime = "nodejs";

// De kanaalprofielen van de docu-studio (lib/docu/kanalen.ts):
//   GET            — de bewaarde profielen
//   PUT {kanalen}  — de hele lijst bewaren
async function wie() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { fout: NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 }) };
  if (!canUseDocu(user.email)) return { fout: NextResponse.json({ error: "Deze studio is nog niet beschikbaar voor jouw account." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const w = await wie();
  if ("fout" in w) return w.fout;
  return NextResponse.json({ kanalen: leesKanalen(w.user.user_metadata?.docuKanalen) });
}

export async function PUT(req: NextRequest) {
  const w = await wie();
  if ("fout" in w) return w.fout;
  const body = (await req.json().catch(() => ({}))) as { kanalen?: unknown };
  const kanalen = leesKanalen(body.kanalen);
  // Via de service-client: de andere gebruikersgegevens blijven staan.
  const { error } = await createServiceClient().auth.admin.updateUserById(w.user.id, { user_metadata: { ...w.user.user_metadata, docuKanalen: kanalen } });
  if (error) return NextResponse.json({ error: "Bewaren mislukt. Probeer het opnieuw." }, { status: 500 });
  return NextResponse.json({ kanalen });
}
