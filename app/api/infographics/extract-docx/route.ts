// Haalt de tekst uit een Word-bestand (.docx). Nodig voor draaiboeken: die
// komen vrijwel altijd als Word-document binnen, met de shotlijst in een tabel.
//
// Mammoth zet het document om naar HTML in plaats van naar platte tekst, en dat
// is hier precies goed: uit de HTML kunnen we de tabel behouden als regels met
// een scheidingsteken, zodat de kolommen (beeld / voice-over / tekst in beeld)
// uit elkaar te houden blijven. Platte tekst plakt die kolommen aan elkaar —
// precies de soep waar de draaiboeklezer op stukloopt.
import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_CHARS = 30000;

/** HTML van mammoth terugbrengen tot tekst met tabelstructuur. */
export function htmlNaarTekst(html: string): string {
  return html
    // Cellen scheiden met een streepje, rijen met een nieuwe regel.
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, " | ")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "Geen bestand ontvangen" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Het bestand is te groot (max 20 MB)" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const { value } = await mammoth.convertToHtml({ buffer });
    const tekst = htmlNaarTekst(value);

    // Een oud .doc-bestand of een lege pagina levert niets op; dat willen we
    // zeggen in plaats van een leeg veld terug te geven.
    if (tekst.length < 30) {
      return NextResponse.json(
        { error: "Geen tekst gevonden. Is dit een oud .doc-bestand? Sla het op als .docx." },
        { status: 400 }
      );
    }

    return NextResponse.json({ text: tekst.slice(0, MAX_CHARS), truncated: tekst.length > MAX_CHARS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[extract-docx]", msg);
    return NextResponse.json({ error: "Het Word-bestand kon niet gelezen worden", detail: msg }, { status: 500 });
  }
}
