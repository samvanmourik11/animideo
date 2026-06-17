import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

// Upscalen verscherpt een bestaand beeld zonder het te veranderen.
// Clarity Upscaler met lage creativity = zo dicht mogelijk bij het origineel.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig, log opnieuw in" }, { status: 401 });

  const { projectId, nodeId } = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    nodeId?: string;
  };
  if (!projectId || !nodeId) {
    return NextResponse.json({ error: "projectId en nodeId zijn verplicht" }, { status: 400 });
  }

  const { data: src } = await supabase
    .from("playground_nodes")
    .select("id, user_id, project_id, image_url, meta")
    .eq("id", nodeId)
    .single();
  if (!src || src.user_id !== user.id || src.project_id !== projectId) {
    return NextResponse.json({ error: "Beeld niet gevonden" }, { status: 404 });
  }
  if (!src.image_url) {
    return NextResponse.json({ error: "Node heeft geen afbeelding" }, { status: 400 });
  }

  const credit = await deductCredits(user.id, CREDIT_COSTS.UPSCALE, "Playground: upscalen");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.UPSCALE },
      { status: 402 }
    );
  }

  const userId = user.id;
  async function refund() {
    try {
      await addCredits(userId, CREDIT_COSTS.UPSCALE, "Refund: playground upscale mislukt");
    } catch {}
  }

  try {
    const result = await fal.subscribe("fal-ai/clarity-upscaler", {
      input: {
        image_url: src.image_url,
        upscale_factor: 2,
        creativity: 0.35,
        resemblance: 1.5,
        prompt: "masterpiece, best quality, highres",
      },
    });

    const tempUrl = (result.data as { image?: { url: string } }).image?.url;
    if (!tempUrl) throw new Error("Geen upscaled afbeelding ontvangen");

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
        parent_id: nodeId,
        kind: "image",
        prompt: "Upscaled (2x)",
        image_url: urlData.publicUrl,
        meta: { ...(src.meta ?? {}), upscaled: true, is_ingredient: false },
      })
      .select()
      .single();
    if (nodeErr || !node) throw new Error(nodeErr?.message ?? "Node opslaan mislukt");

    return NextResponse.json({ node });
  } catch (err: unknown) {
    await refund();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[playground/upscale] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
