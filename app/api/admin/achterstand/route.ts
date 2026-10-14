import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminAccount } from "@/lib/studio/access";
import { openDossiers, zetReeks } from "@/lib/achterstand";

export const dynamic = "force-dynamic";

// Open terugboekingsdossiers + de knop om de mailreeks met de hand te stoppen.
// Zelfde dubbele slot als de rest van /admin.
async function magBeheren(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  return !!profile?.is_admin && isAdminAccount(user.email);
}

export async function GET() {
  if (!(await magBeheren())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ dossiers: await openDossiers() });
}

export async function POST(req: NextRequest) {
  if (!(await magBeheren())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { postId?: string; stoppen?: boolean };
  if (!body.postId || typeof body.stoppen !== "boolean") {
    return NextResponse.json({ error: "postId en stoppen zijn verplicht" }, { status: 400 });
  }
  const ok = await zetReeks(body.postId, body.stoppen);
  if (!ok) return NextResponse.json({ error: "Geen open dossier gevonden" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
