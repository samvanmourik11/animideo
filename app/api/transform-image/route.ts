import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
import { VisualStyle } from "@/lib/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

fal.config({ credentials: process.env.FAL_KEY });

const styleSuffix: Record<string, string> = {
  "Whiteboard":     "Pure white background, black hand-drawn marker lines only, RSA Animate style, NO color, NO photography.",
  "2D Cartoon":     "Kurzgesagt style, bold black outlines, vibrant flat cel-shaded colors, NO photorealism, NO photography.",
  "2D SaaS":        "Stripe/Linear style, soft pastel colors, clean minimal vector graphic, no black outlines, modern startup aesthetic.",
  "Motion Graphic": "Bold geometric shapes, high-contrast vector art, NO human characters, NO photorealism, pure graphic design.",
  "3D Pixar":       "Pixar CGI style, cartoon 3D render, warm studio lighting, vibrant colors, smooth subsurface scattering, NOT photography.",
  "3D Animatie":    "Photorealistic 3D CGI, Unreal Engine 5 quality, physically based rendering, ultra-detailed materials.",
};

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

    const { sourceImageUrl, transformPrompt, style, projectId, sceneId, format, imageModel } = await req.json();
    const suffix = styleSuffix[style as VisualStyle] ?? styleSuffix["2D Cartoon"];

    // Composition rules: keep the source image as the exact reference
    const compositionPrefix =
      "CRITICAL: preserve the EXACT composition of the source image — " +
      "every element stays in the same position (object top-left stays top-left), " +
      "same number of people/objects, same poses and facial expressions, " +
      "same camera angle and perspective, same light direction, " +
      "same foreground/background ratio. Do NOT add, remove, or reposition any element. " +
      "The source image is the strict reference; only the visual style changes.";

    const fullPrompt = `${compositionPrefix} ${transformPrompt} ${suffix} No text, no watermarks, no logos.`;

    const model = imageModel ?? "flux-schnell";
    let tempUrl: string | undefined;

    if (model === "dall-e-3") {
      // DALL·E 3 has no native image-to-image; use the transform prompt directly
      const size = format === "9:16" ? "1024x1792" : "1792x1024";
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: fullPrompt.slice(0, 4000),
        n: 1,
        size,
        quality: "standard",
      });
      tempUrl = response.data?.[0]?.url ?? undefined;
      if (!tempUrl) return NextResponse.json({ error: "Geen afbeelding ontvangen van DALL·E 3" }, { status: 500 });
    } else if (model === "flux-pro") {
      // Flux Pro Ultra with image-to-image via image_url + image_prompt_strength
      const aspectRatio = format === "9:16" ? "9:16" : "16:9";
      const result = await fal.subscribe("fal-ai/flux-pro/v1.1-ultra", {
        input: {
          prompt:                fullPrompt.slice(0, 2000),
          image_url:             sourceImageUrl,
          image_prompt_strength: 0.15,
          aspect_ratio:          aspectRatio,
          num_images:            1,
          output_format:         "jpeg",
        },
      });
      tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
      if (!tempUrl) return NextResponse.json({ error: "Geen afbeelding ontvangen van Flux Pro" }, { status: 500 });
    } else if (model === "controlnet") {
      // Flux Pro Canny ControlNet — bewaart structuur/compositie via edge detection
      const result = await fal.subscribe("fal-ai/flux-pro/v1/canny", {
        input: {
          control_image_url: sourceImageUrl,
          prompt:            fullPrompt.slice(0, 2000),
          num_images:        1,
          output_format:     "jpeg",
        },
      });
      tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
      if (!tempUrl) return NextResponse.json({ error: "Geen afbeelding ontvangen van ControlNet" }, { status: 500 });
    } else {
      // Flux Schnell image-to-image (standaard)
      const result = await fal.subscribe("fal-ai/flux/dev/image-to-image", {
        input: {
          image_url:           sourceImageUrl,
          prompt:              fullPrompt.slice(0, 500),
          strength:            0.85,
          num_inference_steps: 28,
          guidance_scale:      3.5,
          num_images:          1,
        },
      });
      tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
      if (!tempUrl) return NextResponse.json({ error: "Geen afbeelding ontvangen van fal.ai" }, { status: 500 });
    }

    // Download en opslaan in Supabase
    const imgResponse = await fetch(tempUrl);
    if (!imgResponse.ok) {
      return NextResponse.json({ error: `Download mislukt (HTTP ${imgResponse.status})` }, { status: 500 });
    }
    const imgBuffer = await imgResponse.arrayBuffer();
    const fileName = `${user.id}/${projectId}/${sceneId}-image.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("scene-assets")
      .upload(fileName, imgBuffer, { contentType: "image/jpeg", upsert: true });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(fileName);
    return NextResponse.json({ imageUrl: urlData.publicUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transform-image] Fout:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
