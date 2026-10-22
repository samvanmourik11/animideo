import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import mammoth from "mammoth";
import { uploadNaarOpslag } from "@/lib/creaties/wachtrij";

export const runtime = "nodejs";

const BEELDEN: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BEELD = 10 * 1024 * 1024;
// Claude leest pdf's tot 32 MB per verzoek; we houden ruim marge voor de rest van het gesprek.
const MAX_PDF = 20 * 1024 * 1024;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** Een filmscript van 120 pagina's is ~200.000 tekens; meer past niet fijn in het gesprek. */
const MAX_TEKENS = 250_000;

export interface Bijlage {
  soort: "beeld" | "document";
  url: string;
  naam: string;
  /** Alleen bij beelden: de creatie in de bibliotheek, bruikbaar als voorbeeld. */
  id?: string;
}

// Een bestand voor in de chat van de Regisseur. Een foto wordt een gewone creatie in de
// bibliotheek (dan kan de Regisseur hem als voorbeeld gebruiken); een pdf alleen opslag.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const bestand = form?.get("bestand");
  if (!(bestand instanceof File)) return NextResponse.json({ error: "Geen bestand ontvangen" }, { status: 400 });
  const naam = (bestand.name || "bestand").slice(0, 120);
  const buf = Buffer.from(await bestand.arrayBuffer());

  try {
    if (BEELDEN[bestand.type]) {
      if (bestand.size > MAX_BEELD) return NextResponse.json({ error: "Foto's mogen maximaal 10 MB zijn." }, { status: 400 });
      const f = String(form?.get("formaat") ?? "");
      const url = await uploadNaarOpslag(user.id, buf, BEELDEN[bestand.type], bestand.type);
      const { data, error } = await createServiceClient()
        .from("creaties")
        .insert({
          user_id: user.id, soort: "beeld", status: "klaar", maker: "upload", prompt: naam,
          invoer: { formaat: ["1:1", "9:16", "16:9"].includes(f) ? f : "1:1" }, url, credits: 0, klaar_op: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message);
      return NextResponse.json({ bijlage: { soort: "beeld", url, naam, id: data.id } satisfies Bijlage });
    }
    if (bestand.type === "application/pdf") {
      if (bestand.size > MAX_PDF) return NextResponse.json({ error: "Pdf's mogen maximaal 20 MB zijn." }, { status: 400 });
      const url = await uploadNaarOpslag(user.id, buf, "pdf", "application/pdf");
      return NextResponse.json({ bijlage: { soort: "document", url, naam } satisfies Bijlage });
    }
    // Een eigen script (filmstudio): Word of platte tekst (ook Fountain, het tekstformaat voor
    // scripts). We bewaren de tekst als .txt; de Regisseur leest hem als document.
    const isTekst = bestand.type.startsWith("text/") || /\.(txt|fountain|md)$/i.test(naam);
    if (bestand.type === DOCX || /\.docx$/i.test(naam) || isTekst) {
      if (bestand.size > MAX_PDF) return NextResponse.json({ error: "Bestanden mogen maximaal 20 MB zijn." }, { status: 400 });
      const tekst = isTekst ? buf.toString("utf8") : (await mammoth.extractRawText({ buffer: buf })).value;
      if (!tekst.trim()) return NextResponse.json({ error: "Er staat geen tekst in dit bestand." }, { status: 400 });
      if (tekst.length > MAX_TEKENS) return NextResponse.json({ error: "Dit script is te lang (meer dan ±150 pagina's). Upload het in delen." }, { status: 400 });
      const url = await uploadNaarOpslag(user.id, Buffer.from(tekst, "utf8"), "txt", "text/plain; charset=utf-8");
      return NextResponse.json({ bijlage: { soort: "document", url, naam } satisfies Bijlage });
    }
    return NextResponse.json({ error: "Dit soort bestand kan nog niet. Gebruik een foto (JPG, PNG, WebP), een pdf, een Word-bestand of een tekstbestand." }, { status: 400 });
  } catch (e) {
    console.error("[regisseur/bijlage]", e);
    return NextResponse.json({ error: "Uploaden mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
