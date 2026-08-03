// Uploadt een referentiefoto voor één scène (het échte product/logo/object dat de
// gebruiker in beeld wil). Slaat op in de publieke scene-assets-bucket en geeft een
// stabiele publieke URL terug, die scene-image als referentiefoto-ingredient gebruikt.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8_000_000;
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig, log opnieuw in" }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Geen bestand ontvangen" }, { status: 400 });
    }
    const mime = (file.type || "").split(";")[0];
    const ext = EXT_BY_MIME[mime];
    if (!ext) return NextResponse.json({ error: "Alleen PNG, JPG of WEBP" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Bestand te groot (max 8 MB)" }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length < 100) return NextResponse.json({ error: "Bestand lijkt leeg" }, { status: 400 });

    const path = `${user.id}/scene-ref/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("scene-assets")
      .upload(path, bytes, { contentType: mime, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const url = supabase.storage.from("scene-assets").getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("infographics/upload-scene-ref failed:", msg);
    return NextResponse.json({ error: `Uploaden mislukt: ${msg}` }, { status: 500 });
  }
}
