import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import { generateImageWithStyle } from "@/lib/image-gen";
import type { VisualStyle } from "@/lib/types";

// Instructie-bewerken: neemt een bestaand beeld plus een instructie
// ("maak het paard wit") en regenereert dat beeld met de wijziging — rest
// blijft staan. Stijl-pack van het project gaat als anker mee zodat de
// bewerking dezelfde look behoudt.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig, log opnieuw in" }, { status: 401 });

  const { projectId, parentNodeId, instruction, label } = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    parentNodeId?: string;
    instruction?: string;
    label?: string;
  };
  if (!projectId || !parentNodeId || !instruction || instruction.trim().length < 2) {
    return NextResponse.json(
      { error: "projectId, parentNodeId en instruction zijn verplicht" },
      { status: 400 }
    );
  }

  // Haal de bron-node op en controleer eigendom.
  const { data: parent } = await supabase
    .from("playground_nodes")
    .select("id, user_id, project_id, image_url, meta")
    .eq("id", parentNodeId)
    .single();
  if (!parent || parent.user_id !== user.id || parent.project_id !== projectId) {
    return NextResponse.json({ error: "Bron-beeld niet gevonden" }, { status: 404 });
  }
  if (!parent.image_url) {
    return NextResponse.json({ error: "Bron-node heeft geen afbeelding" }, { status: 400 });
  }

  const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Playground: beeld bewerken");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
      { status: 402 }
    );
  }

  const userId = user.id;
  async function refund() {
    try {
      await addCredits(userId, CREDIT_COSTS.IMAGE_GENERATION, "Refund: playground bewerken mislukt");
    } catch {}
  }

  try {
    const parentFormat = parent.meta?.format === "9:16" ? "9:16" : "16:9";

    // Project-niveau stijl + character ophalen zodat een bewerking dezelfde
    // look behoudt als de originele generatie.
    const { data: project } = await supabase
      .from("projects")
      .select("visual_style, character_reference_urls")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();

    const { imageUrl: tempUrl, usedModel } = await generateImageWithStyle({
      prompt: instruction.trim(),
      format: parentFormat,
      visualStyle: (project?.visual_style as VisualStyle | null) ?? null,
      characterUrls: project?.character_reference_urls as string[] | null,
      // Het te bewerken beeld is de bron — als ingredient meegeven.
      ingredientUrls: [parent.image_url],
    });

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
        parent_id: parentNodeId,
        kind: "image",
        prompt: typeof label === "string" && label.trim() ? label.trim() : instruction.trim(),
        image_url: urlData.publicUrl,
        meta: { model: usedModel, format: parent.meta?.format ?? null },
      })
      .select()
      .single();
    if (nodeErr || !node) throw new Error(nodeErr?.message ?? "Node opslaan mislukt");

    return NextResponse.json({ node });
  } catch (err: unknown) {
    await refund();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[playground/edit] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
