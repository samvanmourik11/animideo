import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseMotion } from "@/lib/studio/access";
import { MAX_RIJEN, leesTabel, tabelTekst } from "@/lib/motion/cijfers";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;

// Leest cijfers uit Excel of CSV voor een data-video (lib/motion/cijfers.ts). Gratis.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  if (!canUseMotion(user.email)) return NextResponse.json({ error: "Deze studio is nog niet beschikbaar voor jouw account." }, { status: 403 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Ongeldige upload" }, { status: 400 });
  }
  const bestand = form.get("bestand");
  if (!(bestand instanceof File)) return NextResponse.json({ error: "Geen bestand ontvangen" }, { status: 400 });
  if (bestand.size > MAX_BYTES) return NextResponse.json({ error: "Maximaal 5 MB" }, { status: 400 });
  try {
    const rijen = await leesTabel(bestand.name, Buffer.from(await bestand.arrayBuffer()));
    return NextResponse.json({ tabel: tabelTekst(rijen), rijen: rijen.length - 1, ingekort: rijen.length > MAX_RIJEN });
  } catch (e) {
    const fout = e instanceof Error && /Excel|CSV|rijen|leeg/.test(e.message) ? e.message : "Dit bestand konden we niet lezen. Probeer een .xlsx of .csv.";
    return NextResponse.json({ error: fout }, { status: 400 });
  }
}
