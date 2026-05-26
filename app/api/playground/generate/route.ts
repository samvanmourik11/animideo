import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import { generateImageWithStyle } from "@/lib/image-gen";
import type { VisualStyle } from "@/lib/types";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig, log opnieuw in" }, { status: 401 });

  const { projectId, prompt, format, ingredientUrls } = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    prompt?: string;
    format?: string;
    ingredientUrls?: string[];
  };
  if (!projectId || !prompt || prompt.trim().length < 2) {
    return NextResponse.json({ error: "projectId en prompt zijn verplicht" }, { status: 400 });
  }

  // Controleer dat dit playground-project van de ingelogde gebruiker is.
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, mode, visual_style, character_reference_urls")
    .eq("id", projectId)
    .single();
  if (!project || project.user_id !== user.id || project.mode !== "playground") {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }

  const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Playground: beeld genereren");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
      { status: 402 }
    );
  }

  const userId = user.id;
  async function refund() {
    try {
      await addCredits(userId, CREDIT_COSTS.IMAGE_GENERATION, "Refund: playground genereren mislukt");
    } catch {}
  }

  try {
    const aspectRatio = format === "9:16" ? "9:16" : "16:9";
    const cleanIngredients = Array.isArray(ingredientUrls)
      ? ingredientUrls.filter((u): u is string => typeof u === "string" && u.length > 0)
      : [];

    const { imageUrl: tempUrl, usedModel, refsUsed } = await generateImageWithStyle({
      prompt: prompt.trim(),
      format: aspectRatio,
      visualStyle: (project.visual_style as VisualStyle | null) ?? null,
      characterUrls: project.character_reference_urls as string[] | null,
      ingredientUrls: cleanIngredients,
    });

    // fal-URLs verlopen, dus direct opslaan in Supabase storage.
    const imgRes = await fetch(tempUrl);
    if (!imgRes.ok) throw new Error(`Afbeelding downloaden mislukt (HTTP ${imgRes.status})`);
    const buffer = await imgRes.arrayBuffer();

    const assetId = crypto.randomUUID();
    const fileName = `${userId}/${projectId}/playground/${assetId}.jpg`;
    const { error: uploadErr } = await supabase.storage
      .from("scene-assets")
      .upload(fileName, buffer, { contentType: "image/jpeg", upsert: true });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(fileName);

    const { data: node, error: nodeErr } = await supabase
      .from("playground_nodes")
      .insert({
        project_id: projectId,
        user_id: userId,
        parent_id: null,
        kind: "image",
        prompt: prompt.trim(),
        image_url: urlData.publicUrl,
        meta: { model: usedModel, format: aspectRatio, ingredients: refsUsed },
      })
      .select()
      .single();
    if (nodeErr || !node) throw new Error(nodeErr?.message ?? "Node opslaan mislukt");

    return NextResponse.json({ node });
  } catch (err: unknown) {
    await refund();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[playground/generate] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
