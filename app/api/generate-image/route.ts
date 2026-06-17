import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { VisualStyle } from "@/lib/types";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import { generateImageWithStyle } from "@/lib/image-gen";

// Wizard image generation route. Sinds de stijl-refactor draait dit altijd
// op Nano Banana Pro met de geüploade stijl-referenties — de oude
// Flux/DALL-E/Recraft/Seedream branches zijn weggehaald. De brand kit
// context blijft als tekst-aanvulling (kleuren, omgeving, do-nots) zodat
// huisstijl-projecten consistent blijven.

// Trage externe beeldgeneratie; zonder dit kapt Vercel na ~15s af (opaque 504).
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const authHeader = req.headers.get("authorization");
  let user = null;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data } = await supabase.auth.getUser(token);
    user = data.user;
  } else {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Afbeelding genereren");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
      { status: 402 }
    );
  }

  const userId = user.id;
  async function refund() {
    try {
      await addCredits(userId, CREDIT_COSTS.IMAGE_GENERATION, "Refund: afbeelding genereren mislukt");
    } catch {}
  }

  try {
    const { projectId, sceneId, imagePrompt, visualStyle, brandKitId, format } = await req.json();
    const style = (visualStyle as VisualStyle) ?? "Realistic";

    // Brand kit context: kleuren/omgeving/do-nots als tekstaanvulling.
    let brandContext = "";
    if (brandKitId) {
      const { data: kit } = await supabase
        .from("brand_kits")
        .select("*")
        .eq("id", brandKitId)
        .single();
      if (kit) {
        const parts: string[] = [];
        if (kit.description) parts.push(kit.description);
        if (kit.colors?.primary) parts.push(`primary color: ${kit.colors.primary}`);
        if (kit.colors?.secondary) parts.push(`secondary color: ${kit.colors.secondary}`);
        if (kit.colors?.accent) parts.push(`accent: ${kit.colors.accent}`);
        if (kit.colors?.background) parts.push(`background: ${kit.colors.background}`);
        if (kit.environment) parts.push(`setting: ${kit.environment}`);
        if (kit.do_nots) parts.push(`avoid: ${kit.do_nots}`);
        if (parts.length) brandContext = `Brand style: ${parts.join(", ")}.`;
      }
    }

    // Optioneel: project-niveau character references doorgeven indien
    // gezet (door studio of door playground-hoofdpersoon flow).
    let characterUrls: string[] = [];
    if (projectId) {
      const { data: project } = await supabase
        .from("projects")
        .select("character_reference_urls")
        .eq("id", projectId)
        .eq("user_id", userId)
        .single();
      if (project?.character_reference_urls) {
        characterUrls = project.character_reference_urls as string[];
      }
    }

    const { imageUrl: tempUrl } = await generateImageWithStyle({
      prompt: imagePrompt,
      format,
      visualStyle: style,
      extraContext: brandContext,
      characterUrls,
    });

    // Download en opslaan in Supabase (fal-URLs verlopen).
    const imgResponse = await fetch(tempUrl);
    if (!imgResponse.ok) throw new Error(`Afbeelding downloaden mislukt (HTTP ${imgResponse.status})`);
    const imgBuffer = await imgResponse.arrayBuffer();
    const fileName = `${userId}/${projectId}/${sceneId}-image.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("scene-assets")
      .upload(fileName, imgBuffer, { contentType: "image/jpeg", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(fileName);

    return NextResponse.json({ imageUrl: urlData.publicUrl });
  } catch (err: unknown) {
    await refund();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-image] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
