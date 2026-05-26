import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import { editImage } from "@/lib/image-gen";
import type { Scene } from "@/lib/types";

// "Google Flow"-stijl bewerking van één scene-beeld: client stuurt een korte
// instructie, server roept Nano Banana Pro edit aan met het huidige beeld
// als bron en eventuele character refs, en schrijft het resultaat terug op
// dezelfde scene. Werkt voor Studio én Wizard projecten omdat beide via
// `project.scenes` werken.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessie ongeldig, log opnieuw in" }, { status: 401 });
  }

  const { projectId, sceneId, instruction, clientScenes } = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    sceneId?: string;
    instruction?: string;
    clientScenes?: Scene[];
  };
  if (!projectId || !sceneId || !instruction || instruction.trim().length < 2) {
    return NextResponse.json(
      { error: "projectId, sceneId en instruction (min. 2 tekens) zijn verplicht" },
      { status: 400 }
    );
  }

  const { data: project } = await supabase
    .from("projects")
    .select("scenes, format, character_reference_urls, main_character_id, supporting_character_id, user_id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }

  // Trust client-side scene state (kan onopgeslagen prompt-edits bevatten)
  // maar val terug op DB als hij niet meekomt.
  const scenes = (clientScenes && clientScenes.length > 0
    ? clientScenes
    : ((project.scenes ?? []) as Scene[])) as Scene[];
  const scene = scenes.find((s) => s.id === sceneId);
  if (!scene) {
    return NextResponse.json({ error: "Scene niet gevonden" }, { status: 404 });
  }
  if (!scene.image_url) {
    return NextResponse.json({ error: "Scene heeft nog geen beeld om te bewerken" }, { status: 400 });
  }

  const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Beeld bewerken (Flow-stijl)");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
      { status: 402 }
    );
  }
  const userId = user.id;
  async function refund() {
    try {
      await addCredits(userId, CREDIT_COSTS.IMAGE_GENERATION, "Refund: bewerken mislukt");
    } catch {}
  }

  try {
    // Character refs uit project (hoofdpersoon + bijfiguur + ad-hoc URLs)
    // zodat een aanpassing die het personage raakt zijn identiteit behoudt.
    const charIds = [project.main_character_id, project.supporting_character_id].filter(Boolean) as string[];
    let charUrls: string[] = [];
    if (charIds.length > 0) {
      const { data: chars } = await supabase
        .from("characters")
        .select("id, image_url")
        .in("id", charIds)
        .eq("user_id", userId);
      charUrls = (chars ?? []).map((c) => c.image_url as string | null).filter((u): u is string => !!u);
    }
    const characterUrls = [...charUrls, ...((project.character_reference_urls ?? []) as string[])];

    const { imageUrl: tempUrl } = await editImage({
      sourceImageUrl: scene.image_url,
      instruction: instruction.trim(),
      format: project.format,
      characterUrls,
    });

    // fal-URL is tijdelijk, dus direct naar Supabase storage.
    const imgRes = await fetch(tempUrl);
    if (!imgRes.ok) {
      await refund();
      throw new Error(`Afbeelding download mislukt (HTTP ${imgRes.status})`);
    }
    const buffer = await imgRes.arrayBuffer();
    // Edit telt als een nieuwe versie — versiestamp in pad zodat de browser
    // niet aan de oude cache hangt, en we ook later varianten naast elkaar
    // kunnen houden.
    const fileName = `${userId}/${projectId}/${sceneId}-image.jpg`;
    const { error: uploadErr } = await supabase.storage
      .from("scene-assets")
      .upload(fileName, buffer, { contentType: "image/jpeg", upsert: true });
    if (uploadErr) {
      await refund();
      throw new Error(uploadErr.message);
    }
    const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(fileName);
    const cacheBustedUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    // Schrijf de nieuwe URL terug op de scene in project.scenes.
    const updatedScenes: Scene[] = scenes.map((s) =>
      s.id === sceneId ? { ...s, image_url: cacheBustedUrl } : s
    );
    const { error: dbErr } = await supabase
      .from("projects")
      .update({ scenes: updatedScenes })
      .eq("id", projectId)
      .eq("user_id", userId);
    if (dbErr) {
      // Beeld is geüpload, alleen de scene-pointer niet bijgewerkt. Client
      // kan het oplossen door scenes opnieuw te fetchen of zelf de URL te
      // herstellen. We geven hem alvast terug.
      return NextResponse.json(
        { error: `Bijwerken project mislukt: ${dbErr.message}`, imageUrl: cacheBustedUrl },
        { status: 500 }
      );
    }

    return NextResponse.json({ imageUrl: cacheBustedUrl, scenes: updatedScenes });
  } catch (err: unknown) {
    await refund();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[edit-scene-image] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
