import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { canUseMotion } from "@/lib/studio/access";
import { uploadNaarOpslag } from "@/lib/creaties/wachtrij";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;
const TOEGESTAAN = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];

// Een logo of een voorbeeldbeeld voor de Motion graphics-studio. Gratis: er draait geen AI.
// Elk beeld gaat eerst door de beeldbewerker: zo weten we zeker dat het een echt beeld is,
// staat een telefoonfoto rechtop, en wordt een SVG-logo een PNG (een SVG kan code bevatten
// en hoort niet onbewerkt op een openbaar adres).
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
  const logo = form.get("soort") === "logo";
  if (!(bestand instanceof File)) return NextResponse.json({ error: "Geen bestand ontvangen" }, { status: 400 });
  const mime = (bestand.type || "").split(";")[0];
  if (!TOEGESTAAN.includes(mime) || (mime === "image/svg+xml" && !logo)) {
    return NextResponse.json({ error: logo ? "Kies een PNG, JPG, WebP of SVG." : "Kies een JPG, PNG of WebP." }, { status: 400 });
  }
  if (bestand.size > MAX_BYTES) return NextResponse.json({ error: "Maximaal 12 MB" }, { status: 400 });

  try {
    const ruw = Buffer.from(await bestand.arrayBuffer());
    const beeld = sharp(ruw, { density: 300 }).rotate().resize({ width: logo ? 1600 : 2400, height: logo ? 1600 : 2400, fit: "inside", withoutEnlargement: true });
    // Een logo houdt zijn doorzichtige achtergrond (PNG); een foto wordt een compacte JPG.
    const meta = await sharp(ruw).metadata();
    const png = logo || meta.hasAlpha;
    const data = png ? await beeld.png().toBuffer() : await beeld.jpeg({ quality: 88 }).toBuffer();
    const url = await uploadNaarOpslag(user.id, data, png ? "png" : "jpg", png ? "image/png" : "image/jpeg");
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[motion/upload]", e);
    return NextResponse.json({ error: "Dit bestand konden we niet als beeld lezen. Probeer een JPG of PNG." }, { status: 400 });
  }
}
