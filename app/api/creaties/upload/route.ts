import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadNaarOpslag } from "@/lib/creaties/wachtrij";
import { FORMATEN } from "@/lib/creaties/makers";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const TOEGESTAAN: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function echtBeeld(b: Buffer, ext: string): boolean {
  if (ext === "jpg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ext === "png") return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP";
}

// Een eigen foto in de bibliotheek zetten, zodat je er net zo mee verder kunt als met
// een gemaakt beeld: er video van maken, de achtergrond weghalen, als voorbeeld gebruiken.
// Gratis: er draait geen AI.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Ongeldige upload" }, { status: 400 });
  }
  const bestand = form.get("bestand");
  if (!(bestand instanceof File)) return NextResponse.json({ error: "Geen bestand ontvangen" }, { status: 400 });
  const ext = TOEGESTAAN[bestand.type];
  if (!ext) return NextResponse.json({ error: "Alleen JPG, PNG of WebP" }, { status: 400 });
  if (bestand.size > MAX_BYTES) return NextResponse.json({ error: "Maximaal 10 MB" }, { status: 400 });

  // Een tekstbestand met de naam kapot.png heeft wel het juiste type, maar geen echte
  // beelddata. Kijk naar de eerste bytes, anders belandt een kapot beeld in de bibliotheek.
  const data = Buffer.from(await bestand.arrayBuffer());
  if (!echtBeeld(data, ext)) return NextResponse.json({ error: "Dit bestand is geen geldige foto. Kies een JPG, PNG of WebP." }, { status: 400 });

  // Het formaat meet de browser (die heeft het beeld al geladen); alleen voor de vorm
  // van de tegel in de bibliotheek.
  const f = String(form.get("formaat") ?? "");
  const formaat = (FORMATEN as readonly string[]).includes(f) ? f : "1:1";

  try {
    const url = await uploadNaarOpslag(user.id, data, ext, bestand.type);
    const { data: rij, error } = await createServiceClient()
      .from("creaties")
      .insert({
        user_id: user.id,
        soort: "beeld",
        status: "klaar",
        maker: "upload",
        prompt: bestand.name.slice(0, 200),
        invoer: { formaat },
        url,
        credits: 0,
        klaar_op: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ creatie: rij });
  } catch (e) {
    console.error("[creaties/upload]", e);
    return NextResponse.json({ error: "Uploaden mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
