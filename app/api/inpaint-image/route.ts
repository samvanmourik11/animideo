import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const authHeader = req.headers.get("authorization");
  let user = null;
  if (authHeader?.startsWith("Bearer ")) {
    const { data } = await supabase.auth.getUser(authHeader.slice(7));
    user = data.user;
  } else {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Inpainting");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
      { status: 402 }
    );
  }

  const userId = user.id;
  async function refund() {
    try { await addCredits(userId, CREDIT_COSTS.IMAGE_GENERATION, "Refund: inpainting mislukt"); } catch {}
  }

  try {
    const { sourceImageUrl, maskDataUrl, prompt, projectId, sceneId } = await req.json();
    if (!sourceImageUrl || !maskDataUrl || !prompt || !projectId || !sceneId) {
      await refund();
      return NextResponse.json(
        { error: "sourceImageUrl, maskDataUrl, prompt, projectId en sceneId zijn verplicht" },
        { status: 400 }
      );
    }

    // Mask is een base64 PNG data-URL vanuit de browser (Fabric.js canvas toDataURL).
    // Fal accepteert data URLs direct als image input.
    const result = await fal.subscribe("fal-ai/flux-pro/v1/fill", {
      input: {
        image_url:     sourceImageUrl,
        mask_url:      maskDataUrl,
        prompt:        prompt.slice(0, 2000),
        num_images:    1,
        output_format: "jpeg",
        safety_tolerance: "5",
      },
    });

    const tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
    if (!tempUrl) throw new Error("Geen afbeelding ontvangen van Flux Fill");

    const imgResponse = await fetch(tempUrl);
    if (!imgResponse.ok) throw new Error(`Download mislukt (HTTP ${imgResponse.status})`);

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
    console.error("[inpaint-image] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
