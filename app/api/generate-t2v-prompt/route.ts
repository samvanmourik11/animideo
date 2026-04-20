import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { idea, format, visualStyle = "Cinematic" } = await req.json() as { idea: string; format: string; visualStyle?: string };

  const aspectNote = format === "9:16"
    ? "vertical portrait format (9:16), good for mobile/TikTok/Reels"
    : "horizontal landscape format (16:9), cinematic widescreen";

  const styleGuides: Record<string, string> = {
    "Cinematic":      "Hollywood cinematic style: dramatic lighting, anamorphic lens feel, shallow depth of field, film grain, moody color grading",
    "Realistic":      "photorealistic documentary style: natural daylight, handheld camera feel, true-to-life colors, no CGI look",
    "3D Animatie":    "photorealistic 3D CGI render style: Unreal Engine quality, ray-traced lighting, physically based materials, ultra-detailed",
    "3D Pixar":       "Pixar 3D animation style: warm studio lighting, vibrant saturated colors, exaggerated friendly character design, smooth subsurface scattering",
    "2D Cartoon":     "2D animated cartoon style: bold flat colors, clean cel-shaded look, Kurzgesagt-inspired, expressive motion",
    "Motion Graphic": "motion graphic design style: bold geometric shapes, high-contrast colors, abstract graphic composition",
    "Whiteboard":     "whiteboard animation style: clean white background, hand-drawn black line art, RSA Animate inspired",
  };

  const styleInstruction = styleGuides[visualStyle] ?? styleGuides["Cinematic"];

  const systemPrompt = `You are an expert at writing text-to-video prompts for Kling AI.
Your task: take a user's idea and expand it into a single, detailed video prompt in a specific visual style.

VISUAL STYLE TO APPLY: ${visualStyle}
Style description: ${styleInstruction}
Weave this style naturally throughout every part of the prompt.

OUTPUT FORMAT: Return only the prompt text. No explanations, no labels, no markdown. Just the prompt.

STRUCTURE TO FOLLOW (weave naturally, do not use headers):
1. Subject + environment + lighting conditions — in the specified style
2. Camera movement (e.g. slow push-in, pan left, orbit, static wide shot)
3. Action or motion happening in the scene
4. Mood and color palette — matching the style

HARD RULES TO PREVENT AI ARTIFACTS — embed these naturally into the prompt:
- No text, letters, signs, logos, or typography visible anywhere in the frame
- Maximum one person in frame unless explicitly needed; never duplicate the same person
- Natural anatomy: correct number of hands, fingers, limbs — no floating or extra body parts
- Faces must be symmetrical and realistic — no melting or morphing features
- Motion must be smooth and physically plausible — no teleporting or stuttering
- Consistent lighting throughout — no sudden light source changes
- No split-screen, no collage, single continuous scene only

Video format: ${aspectNote}.
Keep the prompt between 80 and 120 words. Be specific and cinematic.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: idea },
    ],
    max_tokens: 300,
    temperature: 0.8,
  });

  const prompt = completion.choices[0].message.content?.trim() ?? "";
  return NextResponse.json({ prompt });
}
