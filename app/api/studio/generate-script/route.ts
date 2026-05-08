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

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

  const credit = await deductCredits(user.id, CREDIT_COSTS.SCRIPT_GENERATION, "Studio script");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.SCRIPT_GENERATION },
      { status: 402 }
    );
  }

  const { projectId, targetScenes } = await req.json() as { projectId: string; targetScenes?: number };
  const sceneCount = Math.max(2, Math.min(12, targetScenes ?? 4));

  const { data: project } = await supabase
    .from("projects")
    .select("title, notes, language, format, style_reference_url, character_reference_urls")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });

  const idea = (project.notes ?? "").trim();
  if (!idea) return NextResponse.json({ error: "Geen idee gevonden in project" }, { status: 400 });

  const hasStyle = !!project.style_reference_url;
  const hasCharacter = (project.character_reference_urls?.length ?? 0) > 0;
  const characterCount = project.character_reference_urls?.length ?? 0;

  const anchorContext = (hasStyle || hasCharacter) ? `

ANCHOR CONTEXT (critical for image_prompt construction):
${hasStyle ? "- A STYLE REFERENCE image is provided. Every image_prompt MUST start with: \"Same painted illustration style, color palette and atmosphere as the reference image.\"" : ""}
${hasCharacter ? `- ${characterCount} CHARACTER REFERENCE image${characterCount > 1 ? "s are" : " is"} provided. Every image_prompt MUST explicitly mention: "Same character (and outfit) as the character reference image${characterCount > 1 ? "s" : ""}." Always describe the character's actions and emotions in this scene, but assume their face, body, hair, and clothing are already locked in by the reference.` : ""}
- The image generator (Nano Banana Pro) will receive these references alongside your prompt for every scene, so DO NOT re-describe the character's appearance or the visual style in detail. Focus your image_prompt on what HAPPENS in the scene: action, setting, framing, lighting, mood.` : "";

  const VISUAL_RULES = `VISUAL RULES: No text, letters, words, signs or labels visible anywhere. No more than 2 hands per person. No extra limbs or distorted anatomy. Faces natural and symmetrical. Lighting consistent with the previous scene unless the story explicitly shifts.`;

  const MOTION_RULES = `MOTION RULES: Base movement on the emotional tone of the voiceover_text. Calm explanation = slow gentle camera. Exciting reveal = dynamic push or zoom. Subtle parallax or drift is valid. Every motion must feel like a natural response to what the narrator is saying.`;

  const prompt = `You are an expert scriptwriter for premium animated story videos.

Create a video script for the following project:
- Title: ${project.title}
- Language: ${project.language}
- Video format: ${project.format}
- Idea / brief: ${idea}

Generate EXACTLY ${sceneCount} scenes. Return ONLY a valid JSON array with no markdown, no code fences, no commentary.

Each element must have exactly these fields:
{
  "number": <integer starting at 1>,
  "duration": <integer seconds, typically 4 to 8>,
  "voiceover_text": "<narrator text for this scene in ${project.language}>",
  "image_prompt": "<what HAPPENS in this scene, in English. Action, setting, framing, lighting, mood. Will be sent to Nano Banana Pro along with anchor reference images.>",
  "motion_prompt": "<how the image should animate, in English>"
}
${anchorContext}

CRITICAL RULES for image_prompt:
- Write image_prompts in ENGLISH (image generators perform best in English) even if voiceover_text is in ${project.language}.
- The voiceover_text is your PRIMARY source. The image must show what the narrator is saying at that moment.
- Maintain visual continuity scene to scene: same time of day evolves naturally, same locations recur if the story stays put.
- Each scene's image_prompt should be 1 to 3 sentences focused on THIS moment.
- NEVER describe abstract concepts. Translate them into concrete filmable visuals.

STORY ARC:
1. OPENING scene: a strong hook that immediately grabs attention.
2. MIDDLE scenes: develop the story or explain the message with concrete visuals.
3. CLOSING scene (last one): emotional payoff or call to action.

Voiceover rules:
- voiceover_text in ${project.language}, natural narration, no stage directions.
- Total duration should add up to roughly ${sceneCount * 5} to ${sceneCount * 7} seconds.

Respond with only the JSON array, starting with [ and ending with ].`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 4000,
    temperature: 0.7,
  });

  const raw = completion.choices[0].message.content ?? "[]";
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let scenes: Scene[] = [];
  try {
    const parsed = JSON.parse(cleaned);
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
    return NextResponse.json({ error: "Failed to parse GPT-4 response", raw: cleaned }, { status: 500 });
  }

  await supabase
    .from("projects")
    .update({ scenes, status: "ScriptReady", script_text: raw })
    .eq("id", projectId)
    .eq("user_id", user.id);

  return NextResponse.json({ scenes });
}
