import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { VisualStyle } from "@/lib/types";

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

    const { imageBase64, mimeType, style, sceneNumber, totalScenes } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: "Geen afbeelding meegegeven" }, { status: 400 });

    const styleDesc = styleDescriptions[style as VisualStyle] ?? styleDescriptions["2D Cartoon"];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a creative director analyzing photos to create animated video scenes in ${styleDesc} style. Always respond with valid JSON.`,
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
              text: `Analyze this photo (scene ${sceneNumber} of ${totalScenes}) and return a JSON object with exactly these three fields:

{
  "transformPrompt": "A detailed AI image transformation prompt. Start with the ${styleDesc} art style description, then describe how to redraw the specific people/objects/setting in this photo in that style. Max 350 characters. No text overlays.",
  "voiceoverText": "2-3 engaging sentences narrating what is shown in this scene, as if presenting this to a video audience. Natural, conversational tone. Match the language of what you observe.",
  "motionPrompt": "A specific camera movement for a 5-second video clip of this scene. E.g. 'Slow zoom in toward the center of the scene' or 'Gentle pan from left to right across the group'. One sentence."
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
      voiceoverText:   parsed.voiceoverText   ?? "",
      motionPrompt:    parsed.motionPrompt    ?? "",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[analyze-photo]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
