// Genereert (of hervangt) het AI-anker-portret voor één cast-rol en slaat het op
// in project.cast[role].anchorUrl, zodat het in elke scène consistent hergebruikt
// wordt. Aangeroepen wanneer de gebruiker een rol op "AI" zet zonder bestaand anker.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import { generateImageWithStyle } from "@/lib/image-gen";
import type { CastRole, VisualStyle } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, roleId } = await req.json() as { projectId?: string; roleId?: string };
  if (!projectId || !roleId) return NextResponse.json({ error: "projectId en roleId vereist" }, { status: 400 });

  const { data: project } = await supabase
    .from("projects")
    .select("cast_roles, format, visual_style")
    .eq("id", projectId).eq("user_id", user.id).single();
  if (!project) return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });

  const cast = (Array.isArray((project as { cast_roles?: unknown }).cast_roles) ? (project as { cast_roles: CastRole[] }).cast_roles : []) as CastRole[];
  const role = cast.find(r => r.id === roleId);
  if (!role) return NextResponse.json({ error: "Rol niet gevonden" }, { status: 404 });

  const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Cast-anker genereren");
  if (!credit.success) {
    return NextResponse.json({ error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION }, { status: 402 });
  }

  try {
    const portraitPrompt = `Portret van één personage op een effen, neutrale achtergrond. ${role.appearance}. Gecentreerd, hoofd en bovenlichaam in beeld, kijkend naar de camera. Strak, geen andere mensen, geen tekst, geen logo's.`;
    const { imageUrl: tempUrl } = await generateImageWithStyle({
      prompt: portraitPrompt,
      format: project.format === "9:16" ? "9:16" : "16:9",
      visualStyle: (project.visual_style as VisualStyle | null) ?? null,
    });
    const resp = await fetch(tempUrl);
    if (!resp.ok) { await addCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Refund: cast-anker"); return NextResponse.json({ error: `Download mislukt (${resp.status})` }, { status: 500 }); }
    const path = `${user.id}/${projectId}/cast-${roleId}-${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from("scene-assets").upload(path, await resp.arrayBuffer(), { contentType: "image/jpeg", upsert: true });
    if (upErr) { await addCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Refund: cast-anker"); return NextResponse.json({ error: upErr.message }, { status: 500 }); }
    const url = supabase.storage.from("scene-assets").getPublicUrl(path).data.publicUrl;

    const updatedCast = cast.map(r => r.id === roleId ? { ...r, anchorUrl: url, characterId: null } : r);
    await supabase.from("projects").update({ cast_roles: updatedCast }).eq("id", projectId).eq("user_id", user.id);

    return NextResponse.json({ anchorUrl: url, cast_roles: updatedCast });
  } catch (e) {
    await addCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Refund: cast-anker");
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
