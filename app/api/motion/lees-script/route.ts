import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { canUseMotion } from "@/lib/studio/access";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

// Leest de tekst uit een script dat de klant als bestand aanlevert (Word, PDF of tekst), zodat
// hij het niet hoeft over te tikken. De tekst komt in het invulveld; daar kan hij hem nalopen.
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
  if (bestand.size > MAX_BYTES) return NextResponse.json({ error: "Maximaal 8 MB" }, { status: 400 });
  const naam = bestand.name.toLowerCase();
  const buf = Buffer.from(await bestand.arrayBuffer());

  try {
    let tekst: string;
    if (naam.endsWith(".docx")) tekst = (await mammoth.extractRawText({ buffer: buf })).value;
    else if (naam.endsWith(".pdf")) {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const uit = await extractText(pdf, { mergePages: true });
      tekst = Array.isArray(uit.text) ? uit.text.join("\n") : uit.text;
    } else if (/\.(txt|md|rtf)$/.test(naam) || bestand.type.startsWith("text/")) tekst = buf.toString("utf8");
    else return NextResponse.json({ error: "Kies een Word-bestand (.docx), een PDF of een tekstbestand." }, { status: 400 });

    // Regels behouden (scenes staan vaak op een eigen regel), dubbele witregels en spaties niet.
    tekst = tekst.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (tekst.length < 20) return NextResponse.json({ error: "We vonden geen tekst in dit bestand. Is het een scan? Plak de tekst dan zelf in het veld." }, { status: 400 });
    // Tien minuten spreektekst is ±9.500 tekens; met regieaanwijzingen erbij wat meer.
    return NextResponse.json({ tekst: tekst.slice(0, 16000), ingekort: tekst.length > 16000 });
  } catch (e) {
    console.error("[motion/lees-script]", e);
    return NextResponse.json({ error: "Dit bestand konden we niet lezen. Plak de tekst zelf in het veld." }, { status: 400 });
  }
}
