import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { VisualStyle } from "@/lib/types";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const styleModifiers: Record<VisualStyle, string> = {
  "Flat Illustration": "flat vector illustration, clean minimal 2D design, geometric shapes, bold colors, modern graphic style",
  "3D Render":         "photorealistic 3D render, CGI, Octane render, studio lighting, high detail",
  "Realistic":         "photorealistic photograph, professional photography, high resolution, sharp focus",
  "Whiteboard":        "whiteboard animation style, black marker drawing on white background, hand-drawn sketch, clean lines",
  "Cinematic":         "cinematic film still, dramatic lighting, shallow depth of field, movie quality",
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Credits check
    const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Afbeelding genereren");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
        { status: 402 }
      );
    }

    const { projectId, sceneId, imagePrompt, visualStyle } = await req.json();
    const style = (visualStyle as VisualStyle) ?? "Flat Illustration";

    // Trim prompt to DALL-E 3's 4000-character limit
    const basePrompt = imagePrompt.slice(0, 3600);
    const fullPrompt = `${basePrompt}. Style: ${styleModifiers[style]}. No text overlays, no watermarks.`;

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: fullPrompt,
      n: 1,
      size: "1792x1024",
      quality: "standard",
      response_format: "url",
    });

    const tempUrl = response.data?.[0]?.url;
    if (!tempUrl) return NextResponse.json({ error: "No image returned from DALL-E" }, { status: 500 });

    // Download image and store in Supabase (DALL-E URLs expire after 1 hour)
    const imgResponse = await fetch(tempUrl);
    if (!imgResponse.ok) {
      return NextResponse.json({ error: `Failed to download generated image (HTTP ${imgResponse.status})` }, { status: 500 });
    }
    const imgBuffer = await imgResponse.arrayBuffer();
    const fileName = `${user.id}/${projectId}/${sceneId}-image.png`;

    const { error: uploadError } = await supabase.storage
      .from("scene-assets")
      .upload(fileName, imgBuffer, { contentType: "image/png", upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(fileName);

    return NextResponse.json({ imageUrl: urlData.publicUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-image] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
