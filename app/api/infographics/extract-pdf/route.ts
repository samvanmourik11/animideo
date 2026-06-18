import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHARS = 12000;
const MAX_BYTES = 20 * 1024 * 1024;

// Haalt de platte tekst uit een geuploade PDF zodat de gebruiker de cijfers en
// feiten als bron voor de infographic kan gebruiken. We vatten NIET samen: de
// spec-generator heeft juist de echte getallen nodig.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Geen PDF ontvangen" }, { status: 400 });
    }
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json({ error: "Alleen PDF-bestanden worden ondersteund" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "PDF is te groot (max 20 MB)" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buf });
    let text: string;
    try {
      const parsed = await parser.getText();
      text = (parsed.text ?? "").replace(/\s+/g, " ").trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `PDF parsen mislukt: ${msg}` }, { status: 400 });
    } finally {
      await parser.destroy().catch(() => {});
    }

    if (text.length < 30) {
      return NextResponse.json(
        { error: "Te weinig tekst gevonden in PDF (gescande PDF? probeer een tekst-PDF)" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      text: text.slice(0, MAX_CHARS),
      truncated: text.length > MAX_CHARS,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("infographics/extract-pdf failed:", msg);
    return NextResponse.json({ error: "PDF verwerken mislukt, probeer het opnieuw." }, { status: 500 });
  }
}
