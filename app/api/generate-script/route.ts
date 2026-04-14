import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { Scene } from "@/lib/types";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Credits check
  const credit = await deductCredits(user.id, CREDIT_COSTS.SCRIPT_GENERATION, "Script genereren");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.SCRIPT_GENERATION },
      { status: 402 }
    );
  }

  const { projectId, title, goal, targetAudience, language, format, visualStyle } = await req.json();

  const VISUAL_RULES = `VISUAL RULES: No text, letters, words, signs or labels visible anywhere. No more than 2 human hands visible per person. No extra limbs, floating body parts, or distorted anatomy. Faces must be natural and symmetrical. No AI-looking artifacts. Consistent lighting throughout. Style must remain ${visualStyle} across all scenes. Colors and environment must match previous scenes for visual continuity.`;

  const MOTION_RULES = `MOTION RULES: Create strong, clearly visible movement — not subtle. The main subject must visibly move, travel, or transform during the clip. Camera must actively move (push in, pull back, pan, or orbit). Examples of good motion: a vehicle driving across the scene, a person walking forward, liquid flowing, machinery operating, camera flying through a landscape. Never produce a nearly static shot with only slight vibration or shimmer.`;

  const prompt = `You are an expert scriptwriter for animated explainer videos.

Create a video script for the following project:
- Title: ${title}
- Goal: ${goal}
- Target audience: ${targetAudience}
- Language: ${language}
- Video format: ${format}
- Visual style: ${visualStyle}

Generate between 4 and 8 scenes. Return ONLY a valid JSON array with no markdown, no code fences, no commentary.

Each element must have exactly these fields:
{
  "number": <integer starting at 1>,
  "duration": <integer seconds, typically 4-8>,
  "voiceover_text": "<narrator text for this scene in ${language}>",
  "image_prompt": "<detailed description of the static visual — what to generate with DALL-E in ${visualStyle} style>",
  "motion_prompt": "<description of how the image should animate — camera movement, subject motion, transitions>"
}

CRITICAL RULES for image_prompt:
- Each image_prompt must DIRECTLY and LITERALLY visualize exactly what the voiceover_text is saying — if the narrator says "a factory produces widgets", show a factory producing widgets, not an abstract concept
- Maintain STRICT visual consistency across all scenes: same color palette, same environment style, same character appearances if people appear
- Scenes must flow logically from one to the next like a coherent visual story
- NEVER describe abstract concepts — always translate them into concrete, filmable visuals (e.g. instead of "innovation", show "an engineer assembling a device in a bright workshop")
- image_prompt must be vivid, self-contained, specific — it will be sent directly to DALL-E 3 in ${visualStyle} style

Rules:
- voiceover_text should be natural, engaging narration — no stage directions
- motion_prompt should describe motion cinematically (e.g. "slow zoom in on the central figure", "pan left across the cityscape", "particles burst outward")
- Total duration should add up to 30-60 seconds
- Write voiceover_text in ${language}

MANDATORY STRUCTURE — your video MUST follow this arc:
1. OPENING scene: a strong hook that immediately grabs attention — bold visual, surprising perspective, or dynamic motion
2. MIDDLE scenes: build the story, explain the product/service/message with concrete visuals
3. CLOSING scene (ALWAYS the last scene): a professional branded outro with:
   - voiceover_text: a clear, compelling call-to-action (e.g. "Visit our website today", "Start your free trial", "Contact us now")
   - image_prompt: clean branded visual — a product logo area, sleek dark background with the company name "${title}" prominently centered, professional typography, subtle light rays or particles, NO actual text rendered (describe it as a clean minimalist brand card)
   - motion_prompt: slow elegant zoom out revealing the full brand visual, subtle particle drift or light bloom effect

Respond with only the JSON array, starting with [ and ending with ].`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 2000,
    temperature: 0.7,
  });

  const raw = completion.choices[0].message.content ?? "[]";

  let scenes: Scene[] = [];
  try {
    const parsed = JSON.parse(raw);
    scenes = parsed.map((s: Scene & { id?: string }, i: number) => ({
      id: `scene-${Date.now()}-${i}`,
      number: s.number ?? i + 1,
      duration: s.duration ?? 5,
      voiceover_text: s.voiceover_text ?? "",
      image_prompt: (s.image_prompt ?? "") + "\n\n" + VISUAL_RULES,
      motion_prompt: (s.motion_prompt ?? "") + "\n\n" + MOTION_RULES,
      image_url: null,
      video_url: null,
      canvas_json: null,
    }));
  } catch {
    return NextResponse.json({ error: "Failed to parse GPT-4 response", raw }, { status: 500 });
  }

  await supabase
    .from("projects")
    .update({ scenes, status: "ScriptReady", script_text: raw })
    .eq("id", projectId)
    .eq("user_id", user.id);

  return NextResponse.json({ scenes });
}
