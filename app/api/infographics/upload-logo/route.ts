// Uploadt een merklogo dat de gebruiker zelf kiest (i.p.v. het van de website te
// scrapen). Slaat het op in de scene-assets-bucket en geeft een stabiele publieke
// URL terug, die de story-tool als logoUrl gebruikt (rechtsboven in elke scene en
// in de export).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 5_000_000;
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
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
    if (!ext) {
      return NextResponse.json({ error: "Alleen PNG, JPG, WEBP of SVG als logo" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Logo is te groot (max 5 MB)" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length < 100) {
      return NextResponse.json({ error: "Logo lijkt leeg" }, { status: 400 });
    }

    const path = `${user.id}/brand/${Date.now()}-logo.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("scene-assets")
      .upload(path, bytes, { contentType: mime, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const logoUrl = supabase.storage.from("scene-assets").getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ logoUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("infographics/upload-logo failed:", msg);
    return NextResponse.json({ error: `Logo uploaden mislukt: ${msg}` }, { status: 500 });
  }
}
