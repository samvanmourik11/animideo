import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { docuTijdlijn, startTijdlijn } from "@/lib/motion/regie";
import { WachtrijFout } from "@/lib/creaties/wachtrij";

export const runtime = "nodejs";

// De tijdlijn van een klare docu (lib/docu/tijdlijn.ts):
//   GET  ?id=...               — de scenes per hoofdstuk, met hun vaste beeld en tekst
//   POST {id, wijzigingen}     — opnieuw maken met de gewijzigde keuzes (1 credit, geen AI)
async function gebruiker() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
const fout = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: e instanceof WachtrijFout ? e.status : 500 });

export async function GET(req: NextRequest) {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Onbekende docu" }, { status: 400 });
  try {
    return NextResponse.json(await docuTijdlijn(user.id, id));
  } catch (e) {
    return fout(e);
  }
}

export async function POST(req: NextRequest) {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; wijzigingen?: unknown };
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ error: "Onbekende docu" }, { status: 400 });
  try {
    return NextResponse.json({ creatie: await startTijdlijn(user.id, body.id, body.wijzigingen) });
  } catch (e) {
    return fout(e);
  }
}
