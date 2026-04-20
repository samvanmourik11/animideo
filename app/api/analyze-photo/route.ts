import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { VisualStyle } from "@/lib/types";
import { deductCredits } from "@/lib/credits";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const styleDescriptions: Record<string, string> = {
  "Whiteboard":     "whiteboard animation (RSA Animate style, white background, black hand-drawn marker lines, simple sketch)",
  "2D Cartoon":     "2D cartoon animation (Kurzgesagt style, bold black outlines, vibrant flat cel-shaded colors, friendly characters)",
  "2D SaaS":        "flat 2D tech illustration (Stripe/Linear style, soft pastel colors, clean minimal vector graphic)",
  "Motion Graphic": "motion graphic design (bold geometric shapes, high-contrast vector art, abstract composition)",
  "3D Pixar":       "3D Pixar animation (Inside Out/Toy Story CGI, cartoon 3D render, exaggerated friendly characters, warm lighting)",
  "3D Animatie":    "photorealistic 3D CGI (Unreal Engine quality, physically based rendering, ultra-detailed materials)",
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
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const credit = await deductCredits(user.id, 1, "Foto analyseren");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: 1 },
        { status: 402 }
      );
    }

    const { imageBase64, mimeType, style, sceneNumber, totalScenes } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: "Geen afbeelding meegegeven" }, { status: 400 });

    const styleDesc = styleDescriptions[style as VisualStyle] ?? styleDescriptions["2D Cartoon"];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an award-winning cinematographer and creative director. You analyze photos and craft cinematic motion prompts that perfectly match the energy, emotion, and action in the scene. Always respond with valid JSON.`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType ?? "image/jpeg"};base64,${imageBase64}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: `Analyze this photo deeply (scene ${sceneNumber} of ${totalScenes}).

First, mentally identify: What is actually happening? What is the energy/mood? Who are the people and what are they doing? What story does this image tell?

Return a JSON object with exactly these two fields:

{
  "transformPrompt": "Detailed AI image-to-image transformation prompt for ${styleDesc} style. Describe the specific subjects (people, objects, setting) in this photo and how they should look in the target style. Be specific about colors, character design, and atmosphere. Max 350 characters. No text overlays.",
  "motionPrompt": "A rich, cinematic 2-3 sentence camera movement description for a 5-second video clip. IMPORTANT: Base the motion on what is ACTUALLY HAPPENING in the scene — if people are dancing, the camera should capture the dance; if it's a team meeting, capture the interaction; if someone is performing, follow their movement. Include: (1) camera movement type that MATCHES the scene energy (handheld for action, smooth dolly for calm, drone-like rise for reveal, etc.), (2) what the camera focuses on and how it moves through the scene, (3) what emotion this motion creates. Do NOT default to generic 'pan left to right' — be creative and specific to THIS scene."
}`,
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw);

    return NextResponse.json({
      transformPrompt: parsed.transformPrompt ?? "",
      motionPrompt:    parsed.motionPrompt    ?? "",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[analyze-photo]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
