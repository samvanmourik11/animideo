import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { Scene } from "@/lib/types";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

type FalImageResult = { images?: { url: string }[] };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

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
      .select("scenes, format, style_reference_url, character_reference_urls, main_character_id, supporting_character_id")
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

    const refs: string[] = [
      ...(project.style_reference_url ? [project.style_reference_url] : []),
      ...charImageUrls,
      ...(project.character_reference_urls ?? []),
    ];

    const aspectRatio: "16:9" | "9:16" = project.format === "9:16" ? "9:16" : "16:9";

    let result;
    if (refs.length > 0) {
      result = await fal.subscribe("fal-ai/nano-banana-pro/edit", {
        input: {
          prompt:        scene.image_prompt.slice(0, 4000),
          image_urls:    refs,
          aspect_ratio:  aspectRatio,
          resolution:    "2K",
          num_images:    1,
          output_format: "jpeg",
        },
      });
    } else {
      result = await fal.subscribe("fal-ai/nano-banana-pro", {
        input: {
          prompt:        scene.image_prompt.slice(0, 4000),
          aspect_ratio:  aspectRatio,
          resolution:    "2K",
          num_images:    1,
          output_format: "jpeg",
        },
      });
    }

    const tempUrl = (result.data as FalImageResult).images?.[0]?.url;
    if (!tempUrl) {
      await refund();
      return NextResponse.json({ error: "Geen afbeelding ontvangen van Nano Banana Pro" }, { status: 500 });
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
      refsUsed:    refs.length,
    });
  } catch (err: unknown) {
    await refund();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[studio/generate-scene-image] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
