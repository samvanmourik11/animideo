import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import { VisualStyle } from "@/lib/types";
import { generateImageWithStyle } from "@/lib/image-gen";

// Photo wizard / "transform" route: een bronfoto omzetten naar de gekozen
// animatiestijl. Sinds de stijl-refactor draait dit op Nano Banana Pro edit
// (Gemini), met de stijl-referenties van het gekozen pack als anker en de
// bronfoto als compositie-referentie. De oude Flux/DALL-E/Recraft/Seedream/
// ControlNet branches zijn weggehaald — model wordt niet meer door de
// gebruiker gekozen.

// Trage externe beeldtransformatie; zonder dit kapt Vercel na ~15s af (opaque 504).
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
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

    const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Foto transformeren");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
        { status: 402 }
      );
    }

    const userId = user.id;
    async function refund() {
      try {
        await addCredits(userId, CREDIT_COSTS.IMAGE_GENERATION, "Refund: transformeren mislukt");
      } catch {}
    }

    const { sourceImageUrl, transformPrompt, style, projectId, sceneId, format } = await req.json();
    if (!sourceImageUrl) {
      await refund();
      return NextResponse.json({ error: "sourceImageUrl is verplicht" }, { status: 400 });
    }

    // Strikte compositie-instructie zodat de bronfoto qua opbouw één-op-één
    // wordt overgenomen — alleen de stijl verandert.
    const compositionPrefix =
      "CRITICAL: preserve the EXACT composition of the source image — " +
      "every element stays in the same position (object top-left stays top-left), " +
      "same number of people/objects, same poses and facial expressions, " +
      "same camera angle and perspective, same light direction. " +
      "Do NOT add, remove, or reposition any element. The source is the strict reference; " +
      "only the visual style changes.";

    try {
      const { imageUrl: tempUrl } = await generateImageWithStyle({
        prompt: `${compositionPrefix} ${transformPrompt ?? ""}`.trim(),
        format,
        visualStyle: style as VisualStyle,
        // Bronfoto als ingredient zodat hij naast de stijl-refs als sterke
        // referentie meegaat. Composition prompt prefereert deze als bron.
        ingredientUrls: [sourceImageUrl],
      });

      const imgResponse = await fetch(tempUrl);
      if (!imgResponse.ok) {
        await refund();
        return NextResponse.json(
          { error: `Download mislukt (HTTP ${imgResponse.status})` },
          { status: 500 }
        );
      }
      const imgBuffer = await imgResponse.arrayBuffer();
      const fileName = `${user.id}/${projectId}/${sceneId}-image.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("scene-assets")
        .upload(fileName, imgBuffer, { contentType: "image/jpeg", upsert: true });
      if (uploadError) {
        await refund();
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(fileName);
      return NextResponse.json({ imageUrl: urlData.publicUrl });
    } catch (genErr: unknown) {
      await refund();
      const message = genErr instanceof Error ? genErr.message : String(genErr);
      console.error("[transform-image] Generatie-fout:", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transform-image] Fout:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
