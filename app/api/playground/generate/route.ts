import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

// Model voor het genereren van een nieuw beeld vanuit tekst.
// Nano Banana Pro = Gemini image (zelfde model dat Google Flow gebruikt),
// dezelfde slug als de bestaande admin-testroute /api/test-nano-banana.
const GENERATE_MODEL = "fal-ai/nano-banana-pro";
// Met ingrediënten (referentiebeelden) erbij gebruiken we de edit-variant,
// die meerdere image_urls als referentie accepteert voor consistentie.
const GENERATE_WITH_REFS_MODEL = "fal-ai/nano-banana-pro/edit";

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
    .select("id, user_id, mode")
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
    const refs = Array.isArray(ingredientUrls)
      ? ingredientUrls.filter((u): u is string => typeof u === "string" && u.length > 0).slice(0, 8)
      : [];
    const usedModel = refs.length ? GENERATE_WITH_REFS_MODEL : GENERATE_MODEL;

    const result = await fal.subscribe(usedModel, {
      input: {
        prompt: prompt.trim().slice(0, 4000),
        ...(refs.length ? { image_urls: refs } : {}),
        aspect_ratio: aspectRatio,
        resolution: "2K",
        num_images: 1,
        output_format: "jpeg",
      },
    });

    const tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
    if (!tempUrl) throw new Error("Geen afbeelding ontvangen");

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
        meta: { model: usedModel, format: aspectRatio, ingredients: refs },
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
