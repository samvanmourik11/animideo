import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { controleerAanwijzing } from "@/lib/infographics/aanwijzing-controle";

export const runtime = "nodejs";
export const maxDuration = 60;

// Kijken of een aanwijzing echt is uitgevoerd op het opnieuw getekende beeld. De
// bewerkroute doet dit zelf (dialogue-aanwijzing); een shot dat opnieuw getekend
// wordt loopt via de pagina langs dialogue-line, en die komt hier langs.
//
// Kost geen credits: het is een kijkvraag.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { imageUrl?: string; vraag?: string };
  const imageUrl = (body.imageUrl ?? "").trim();
  const vraag = (body.vraag ?? "").trim().slice(0, 300);
  if (!imageUrl || !vraag) return NextResponse.json({ error: "Geen beeld of vraag opgegeven" }, { status: 400 });

  const uitslag = await controleerAanwijzing(imageUrl, vraag);
  return NextResponse.json(uitslag);
}
