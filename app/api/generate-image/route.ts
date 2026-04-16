import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { VisualStyle } from "@/lib/types";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Recraft v3 style mapping per visual style
const recraftStyles: Record<string, string> = {
  "Cinematic":      "realistic_image",
  "Realistic":      "realistic_image/natural_light",
  "Whiteboard":     "digital_illustration/hand_drawn_outline",
  "2D Cartoon":     "digital_illustration",
  "2D SaaS":        "vector_illustration",
  "Motion Graphic": "vector_illustration",
  "3D Pixar":       "digital_illustration/handmade_3d",
  "3D Animatie":    "realistic_image",
};

fal.config({ credentials: process.env.FAL_KEY });

console.log("[generate-image] FAL_KEY aanwezig:", !!process.env.FAL_KEY);

// Style prefix goes FIRST in the prompt so Flux weighs it most heavily.
// Each entry: [prefix for start of prompt] | [suffix for reinforcement at end]
const styleModifiers: Record<VisualStyle, { prefix: string; suffix: string }> = {
  "Cinematic": {
    prefix: "Cinematic film still, anamorphic widescreen, dramatic Hollywood color grading, moody atmospheric lighting, 35mm film,",
    suffix: "shallow depth of field, lens flare, film grain, professional movie cinematography. NOT an illustration, NOT a drawing.",
  },
  "Realistic": {
    prefix: "Photorealistic photograph, shot on Sony A7R5 DSLR, natural daylight, documentary photography,",
    suffix: "ultra-sharp focus, true-to-life colors, no CGI, no illustration, no digital art. Real photograph only.",
  },
  "Whiteboard": {
    prefix: "Whiteboard animation frame, RSA Animate style, pure white background, black hand-drawn marker lines,",
    suffix: "simple black ink sketch on white, NO color, NO shading, NO gradients, NO photorealism, NO photography. Black marker lines on white only.",
  },
  "2D Cartoon": {
    prefix: "2D cartoon animation frame, Kurzgesagt YouTube explainer style, bold black outlines, vibrant flat cel-shaded colors,",
    suffix: "clean vector cartoon illustration, friendly simple characters, NO photorealism, NO 3D depth, NO photography, NO gradients. Flat 2D animation only.",
  },
  "2D SaaS": {
    prefix: "Flat 2D tech product illustration, Stripe or Linear or Notion marketing style, soft pastel colors, clean minimal vector graphic,",
    suffix: "isometric or flat perspective, no black outlines, subtle drop shadows, modern startup aesthetic. NO photorealism, NO photography, NO 3D render.",
  },
  "Motion Graphic": {
    prefix: "Motion graphic design frame, Adobe After Effects MoGraph style, bold geometric shapes, high-contrast vector art,",
    suffix: "abstract graphic composition, NO human characters, NO photorealism, NO photography. Pure graphic design with shapes, lines and color only.",
  },
  "3D Pixar": {
    prefix: "3D Pixar animation movie still, Inside Out or Toy Story CGI frame, cartoon 3D render, exaggerated friendly character design,",
    suffix: "warm studio lighting, vibrant saturated colors, smooth subsurface scattering, NO photorealism, NOT live action, NOT photography. Pixar 3D animation only.",
  },
  "3D Animatie": {
    prefix: "Photorealistic 3D CGI visualization, Unreal Engine 5 quality render, physically based rendering, ray-traced global illumination,",
    suffix: "ultra-detailed materials and textures, architectural or product visualization quality, professional 3D render.",
  },
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Probeer eerst via Authorization header (Bearer token), dan via cookie
    const authHeader = req.headers.get("authorization");
    let user = null;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data } = await supabase.auth.getUser(token);
      user = data.user;
    } else {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    }

    if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

    // Credits check
    const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Afbeelding genereren");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
        { status: 402 }
      );
    }

    const { projectId, sceneId, imagePrompt, visualStyle, brandKitId, imageModel, format } = await req.json();
    const style = (visualStyle as VisualStyle) ?? "Cinematic";

    // Brand kit context ophalen
    let brandContext = "";
    if (brandKitId) {
      const { data: kit } = await supabase.from("brand_kits").select("*").eq("id", brandKitId).single();
      if (kit) {
        const parts: string[] = [];
        if (kit.description)        parts.push(kit.description);
        if (kit.colors?.primary)    parts.push(`primary color: ${kit.colors.primary}`);
        if (kit.colors?.secondary)  parts.push(`secondary color: ${kit.colors.secondary}`);
        if (kit.colors?.accent)     parts.push(`accent: ${kit.colors.accent}`);
        if (kit.colors?.background) parts.push(`background: ${kit.colors.background}`);
        if (kit.environment)        parts.push(`setting: ${kit.environment}`);
        if (kit.do_nots)            parts.push(`avoid: ${kit.do_nots}`);
        if (parts.length) brandContext = ` Brand style: ${parts.join(", ")}.`;
      }
    }

    const { prefix, suffix } = styleModifiers[style];
    const fullPrompt = `${prefix} ${imagePrompt.slice(0, 3400)}.${brandContext} ${suffix} No text overlays, no watermarks, no logos.`;

    const model = imageModel ?? "flux-schnell";
    let tempUrl: string | undefined;

    if (model === "dall-e-3") {
      // DALL·E 3 via OpenAI
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
      // Flux Pro Ultra via fal.ai
      const aspectRatio = format === "9:16" ? "9:16" : "16:9";
      const result = await fal.subscribe("fal-ai/flux-pro/v1.1-ultra", {
        input: {
          prompt: fullPrompt.slice(0, 2000),
          aspect_ratio: aspectRatio,
          num_images: 1,
          output_format: "jpeg",
        },
      });
      tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
      if (!tempUrl) return NextResponse.json({ error: "Geen afbeelding ontvangen van Flux Pro" }, { status: 500 });
    } else if (model === "recraft") {
      // Recraft v3 via fal.ai
      const imageSize = format === "9:16" ? "portrait_16_9" : "landscape_16_9";
      const recraftStyle = recraftStyles[style] ?? "digital_illustration";
      const result = await fal.subscribe("fal-ai/recraft-v3", {
        input: {
          prompt:     fullPrompt.slice(0, 2000),
          style:      recraftStyle,
          image_size: imageSize,
        },
      });
      tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
      if (!tempUrl) return NextResponse.json({ error: "Geen afbeelding ontvangen van Recraft" }, { status: 500 });
    } else {
      // Flux Schnell (standaard)
      const imageSize = format === "9:16" ? "portrait_16_9" : "landscape_16_9";
      const result = await fal.subscribe("fal-ai/flux/schnell", {
        input: {
          prompt: fullPrompt,
          image_size: imageSize,
          num_images: 1,
          output_format: "jpeg",
        },
      });
      tempUrl = (result.data as { images?: { url: string }[] }).images?.[0]?.url;
      if (!tempUrl) return NextResponse.json({ error: "Geen afbeelding ontvangen van Flux" }, { status: 500 });
    }

    // Download en opslaan in Supabase (fal URLs verlopen)
    const imgResponse = await fetch(tempUrl);
    if (!imgResponse.ok) {
      return NextResponse.json({ error: `Afbeelding downloaden mislukt (HTTP ${imgResponse.status})` }, { status: 500 });
    }
    const imgBuffer = await imgResponse.arrayBuffer();
    const fileName = `${user.id}/${projectId}/${sceneId}-image.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("scene-assets")
      .upload(fileName, imgBuffer, { contentType: "image/jpeg", upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(fileName);

    return NextResponse.json({ imageUrl: urlData.publicUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-image] Volledige fout:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
