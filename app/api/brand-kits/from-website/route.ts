// Maakt een brand kit uit een website-URL: haalt kleuren/fonts/tone op (gedeelde
// extractie) en slaat het als brand_kits-rij op. Gebruikt door de storytelling-
// infographic-tool om de huisstijl in één klik over te nemen. Het logo komt hier
// NIET vandaan — dat uploadt de gebruiker zelf (upload-logo-endpoint).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractBrandFromWebsite } from "@/lib/brand/extract-from-website";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { url } = (await req.json()) as { url?: string };
    if (!url || !url.trim()) return NextResponse.json({ error: "URL ontbreekt" }, { status: 400 });

    const brand = await extractBrandFromWebsite(url);

    let host = brand.sourceUrl;
    try { host = new URL(brand.sourceUrl).hostname.replace(/^www\./, ""); } catch {}

    const { data, error } = await supabase
      .from("brand_kits")
      .insert({
        user_id: user.id,
        name: brand.name || host || "Huisstijl",
        tone_of_voice: brand.toneOfVoice || null,
        colors: brand.colors ?? {},
        fonts: brand.fonts ?? {},
        logo_url: null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ brandKit: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("brand-kits/from-website failed:", msg);
    return NextResponse.json({ error: `Huisstijl ophalen mislukt: ${msg}` }, { status: 500 });
  }
}
