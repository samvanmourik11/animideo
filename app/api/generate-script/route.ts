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

  const { projectId, title, goal, targetAudience, language, format, visualStyle, brandKitId, advanced } = await req.json();

  // Haal brand kit op als die geselecteerd is
  let brandContext = "";
  if (brandKitId) {
    const { data: kit } = await supabase.from("brand_kits").select("*").eq("id", brandKitId).single();
    if (kit) {
      const parts: string[] = [];
      if (kit.description)   parts.push(`Visual style: ${kit.description}`);
      if (kit.colors?.primary)    parts.push(`Primary color: ${kit.colors.primary}`);
      if (kit.colors?.secondary)  parts.push(`Secondary color: ${kit.colors.secondary}`);
      if (kit.colors?.accent)     parts.push(`Accent color: ${kit.colors.accent}`);
      if (kit.colors?.background) parts.push(`Background color: ${kit.colors.background}`);
      if (kit.fonts?.primary)  parts.push(`Typography: ${kit.fonts.primary}`);
      if (kit.environment)     parts.push(`Recurring environment: ${kit.environment}`);
      if (kit.brand_values?.length) parts.push(`Brand values: ${kit.brand_values.join(", ")}`);
      if (kit.do_nots)         parts.push(`NEVER show: ${kit.do_nots}`);
      if (parts.length) brandContext = `\n\nBRAND STYLE GUIDE (apply to ALL scenes):\n${parts.join("\n")}`;
    }
  }

  // Bouw geavanceerde context op uit ingevulde velden (lege velden worden overgeslagen)
  let advancedContext = "";
  if (advanced) {
    const lines: string[] = [];
    if (advanced.hook?.trim())            lines.push(`OPENING HOOK: Start the video with this exact concept: "${advanced.hook}"`);
    if (advanced.keyMessage?.trim())      lines.push(`KEY MESSAGE: The single most important takeaway must be: "${advanced.keyMessage}"`);
    if (advanced.cta?.trim())             lines.push(`CALL-TO-ACTION: The final scene must end with: "${advanced.cta}"`);
    if (advanced.tone?.trim())            lines.push(`TONE & STYLE: The overall tone must be: ${advanced.tone}`);
    if (advanced.durationPreference?.trim()) lines.push(`DURATION: Aim for ${advanced.durationPreference}`);
    if (advanced.mainCharacter?.trim())   lines.push(`RECURRING CHARACTER: A consistent character appears throughout: ${advanced.mainCharacter}. Keep their appearance identical in every scene.`);
    if (advanced.environment?.trim())     lines.push(`RECURRING ENVIRONMENT: All scenes take place in or near: ${advanced.environment}`);
    if (advanced.colorMood?.trim())       lines.push(`COLOR MOOD: The visual color palette should feel: ${advanced.colorMood}`);
    if (advanced.productDetails?.trim())  lines.push(`PRODUCT/SERVICE DETAILS: ${advanced.productDetails}`);
    const benefits = [advanced.keyBenefit1, advanced.keyBenefit2, advanced.keyBenefit3].filter((b) => b?.trim());
    if (benefits.length)                  lines.push(`KEY BENEFITS TO HIGHLIGHT (dedicate a scene to each): ${benefits.map((b, i) => `${i + 1}. ${b}`).join(" | ")}`);
    if (advanced.avoidContent?.trim())    lines.push(`NEVER INCLUDE: ${advanced.avoidContent}`);
    if (advanced.extraNotes?.trim())      lines.push(`ADDITIONAL INSTRUCTIONS: ${advanced.extraNotes}`);
    if (lines.length) advancedContext = `\n\nADVANCED CREATIVE BRIEF (follow these instructions precisely):\n${lines.join("\n")}`;
  }

  const VISUAL_RULES = `VISUAL RULES: No text, letters, words, signs or labels visible anywhere. No more than 2 human hands visible per person. No extra limbs, floating body parts, or distorted anatomy. Faces must be natural and symmetrical. No AI-looking artifacts. Consistent lighting throughout. Style must remain ${visualStyle} across all scenes. Colors and environment must match previous scenes for visual continuity.`;

  const MOTION_RULES = `MOTION RULES: Base the movement on the emotional tone and content of the voiceover_text for this scene. Let the scene breathe — don't force drama. A calm explanation warrants slow, gentle camera movement. An exciting reveal warrants a dynamic push or zoom. Two people meeting could show them reaching toward each other. A product being used shows it in action. Avoid arbitrary movement — every motion must feel like a natural response to what the narrator is saying. A subtle parallax or drift is perfectly valid when the moment calls for it.`;

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
  "motion_prompt": "<description of how the image should animate — derived from the voiceover_text context. What movement fits this moment? Could be subtle or dynamic depending on the scene.>"
}

CRITICAL RULES for image_prompt:
- The voiceover_text is your PRIMARY source — the image must show exactly what the narrator is saying at that moment. If the narrator says "dogs make parks cleaner", show dogs in a clean park, not an abstract concept.
- Start building the image_prompt from the voiceover_text: what does the viewer need to SEE to understand what is being SAID?
- Maintain STRICT visual consistency across all scenes: same color palette, same environment style, same character appearances if people appear
- Scenes must flow logically from one to the next like a coherent visual story
- NEVER describe abstract concepts — always translate them into concrete, filmable visuals (e.g. instead of "innovation", show "an engineer assembling a device in a bright workshop")
- image_prompt must be vivid, self-contained, specific — it will be sent directly to an image generator in ${visualStyle} style

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

Respond with only the JSON array, starting with [ and ending with ].${brandContext}${advancedContext}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 4000,
    temperature: 0.7,
  });

  const raw = completion.choices[0].message.content ?? "[]";

  // Strip markdown code fences if GPT-4o wraps the JSON
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
