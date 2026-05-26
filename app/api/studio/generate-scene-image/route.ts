import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Scene, VisualStyle } from "@/lib/types";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import { generateImageWithStyle } from "@/lib/image-gen";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Studio scene image");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
      { status: 402 }
    );
  }

  const userId = user.id;
  async function refund() {
    try { await addCredits(userId, CREDIT_COSTS.IMAGE_GENERATION, "Refund: studio scene image"); } catch {}
  }

  try {
    const { projectId, sceneId, clientScenes } = await req.json() as {
      projectId: string;
      sceneId: string;
      clientScenes?: Scene[];
    };
    if (!projectId || !sceneId) {
      await refund();
      return NextResponse.json({ error: "projectId en sceneId zijn verplicht" }, { status: 400 });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("scenes, format, style_reference_url, character_reference_urls, main_character_id, supporting_character_id, visual_style")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();
    if (!project) {
      await refund();
      return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
    }

    const charIds = [project.main_character_id, project.supporting_character_id].filter(Boolean) as string[];
    let charImageUrls: string[] = [];
    if (charIds.length > 0) {
      const { data: chars } = await supabase
        .from("characters")
        .select("id, image_url")
        .in("id", charIds)
        .eq("user_id", userId);
      const byId = new Map((chars ?? []).map(c => [c.id, c.image_url as string | null]));
      charImageUrls = [
        project.main_character_id        ? byId.get(project.main_character_id)        : null,
        project.supporting_character_id  ? byId.get(project.supporting_character_id)  : null,
      ].filter((u): u is string => !!u);
    }

    // Trust client scenes (carries any unsaved prompt edits) but fall back to DB
    const scenes: Scene[] = clientScenes && clientScenes.length > 0
      ? clientScenes
      : (project.scenes ?? []) as Scene[];
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) {
      await refund();
      return NextResponse.json({ error: "Scene niet gevonden" }, { status: 404 });
    }
    if (!scene.image_prompt?.trim()) {
      await refund();
      return NextResponse.json({ error: "Scene heeft geen image prompt" }, { status: 400 });
    }

    // Character refs (hoofdpersoon + bijfiguur) en de studio-specifieke
    // style_reference + character_reference_urls als ingredients. Het
    // image-gen helper voegt de algemene pack-refs er nog vooraan aan toe.
    const characterRefs: string[] = [
      ...charImageUrls,
      ...(project.character_reference_urls ?? []),
    ];
    const ingredientRefs: string[] = [
      ...(project.style_reference_url ? [project.style_reference_url] : []),
    ];

    const aspectRatio: "16:9" | "9:16" = project.format === "9:16" ? "9:16" : "16:9";

    let tempUrl: string;
    try {
      const out = await generateImageWithStyle({
        prompt: scene.image_prompt,
        format: aspectRatio,
        visualStyle: (project.visual_style as VisualStyle | null) ?? null,
        characterUrls: characterRefs,
        ingredientUrls: ingredientRefs,
      });
      tempUrl = out.imageUrl;
    } catch (e) {
      await refund();
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const imgResponse = await fetch(tempUrl);
    if (!imgResponse.ok) {
      await refund();
      return NextResponse.json({ error: `Download mislukt (HTTP ${imgResponse.status})` }, { status: 500 });
    }

    const imgBuffer = await imgResponse.arrayBuffer();
    const fileName = `${userId}/${projectId}/${sceneId}-image.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("scene-assets")
      .upload(fileName, imgBuffer, { contentType: "image/jpeg", upsert: true });
    if (uploadError) {
      await refund();
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(fileName);
    const cacheBustedUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const updatedScenes = scenes.map(s =>
      s.id === sceneId ? { ...s, image_url: cacheBustedUrl } : s
    );

    const { error: dbErr } = await supabase
      .from("projects")
      .update({ scenes: updatedScenes })
      .eq("id", projectId)
      .eq("user_id", userId);
    if (dbErr) {
      console.error("[studio/generate-scene-image] DB update failed:", dbErr.message);
      return NextResponse.json(
        { error: `Beeld gegenereerd maar opslaan mislukt: ${dbErr.message}`, imageUrl: cacheBustedUrl },
        { status: 500 }
      );
    }

    return NextResponse.json({
      imageUrl:    cacheBustedUrl,
      scenes:      updatedScenes,
      refsUsed:    characterRefs.length + ingredientRefs.length,
    });
  } catch (err: unknown) {
    await refund();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[studio/generate-scene-image] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
