import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { OutroContact, Scene } from "@/lib/types";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const credit = await deductCredits(user.id, CREDIT_COSTS.SCRIPT_GENERATION, "Studio script");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.SCRIPT_GENERATION },
      { status: 402 }
    );
  }

  const { projectId, targetScenes } = await req.json() as { projectId: string; targetScenes?: number };
  const sceneCount = Math.max(2, Math.min(15, targetScenes ?? 5));

  const { data: project } = await supabase
    .from("projects")
    .select("title, notes, language, format, visual_style, style_reference_url, character_reference_urls, outro_logo_url, outro_contact, brand_kit_id, main_character_id, supporting_character_id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });

  const idea = (project.notes ?? "").trim();
  if (!idea) return NextResponse.json({ error: "Geen idee gevonden in project" }, { status: 400 });

  let brandKit: { name: string; tone_of_voice: string | null; description: string | null; do_nots: string | null; brand_values: string[] | null } | null = null;
  if (project.brand_kit_id) {
    const { data } = await supabase
      .from("brand_kits")
      .select("name, tone_of_voice, description, do_nots, brand_values")
      .eq("id", project.brand_kit_id)
      .eq("user_id", user.id)
      .single();
    brandKit = data;
  }

  type CharRow = { id: string; name: string; description: string | null; gender: string | null; age_range: string | null; image_url: string | null };
  let mainChar: CharRow | null = null;
  let supportChar: CharRow | null = null;
  const charIds = [project.main_character_id, project.supporting_character_id].filter(Boolean) as string[];
  if (charIds.length > 0) {
    const { data: chars } = await supabase
      .from("characters")
      .select("id, name, description, gender, age_range, image_url")
      .in("id", charIds)
      .eq("user_id", user.id);
    const byId = new Map((chars ?? []).map(c => [c.id, c as CharRow]));
    mainChar    = project.main_character_id        ? byId.get(project.main_character_id)        ?? null : null;
    supportChar = project.supporting_character_id  ? byId.get(project.supporting_character_id)  ?? null : null;
  }

  const charLabel = (c: CharRow) => `${c.name}${[c.gender, c.age_range].filter(Boolean).length ? ` (${[c.gender, c.age_range].filter(Boolean).join(", ")})` : ""}`;

  const hasStyle = !!project.style_reference_url;
  const characterCount = (mainChar ? 1 : 0) + (supportChar ? 1 : 0);
  const hasCharacter = characterCount > 0 || (project.character_reference_urls?.length ?? 0) > 0;

  const anchorContext = (hasStyle || hasCharacter) ? `

ANCHOR CONTEXT (critical for image_prompt construction):
${hasStyle ? "- A STYLE REFERENCE image is provided. Every image_prompt MUST start with: \"Same painted illustration style, color palette and atmosphere as the reference image.\"" : ""}
${hasCharacter ? `- ${characterCount} CHARACTER REFERENCE image${characterCount > 1 ? "s are" : " is"} provided. Every image_prompt MUST explicitly mention: "Same character (and outfit) as the character reference image${characterCount > 1 ? "s" : ""}." Use the reference ONLY for the character's face, body, hair, and clothing. The setting, location, camera angle and composition in the reference must NOT be copied.` : ""}
- The image generator will combine these references with your prompt. To avoid every scene looking like the reference image, EACH scene must describe a DISTINCTLY DIFFERENT setting, location, camera angle and framing.
- For every image_prompt, EXPLICITLY specify (in this order):
  1. Setting / location (e.g., "in a sunlit kitchen", "on a busy office floor", "at a forest path during golden hour")
  2. Camera framing (e.g., "wide establishing shot", "close-up of the hands", "over-the-shoulder medium shot")
  3. Action and emotion of the character
  4. Lighting and mood specific to this scene
- The ${sceneCount} scenes together should form a visual journey across DIFFERENT environments, not the same location every time. Vary indoor/outdoor, day/night, wide/close, calm/active.` : "";

  const visualStyle = project.visual_style ?? "Cinematic";
  const styleContext = `
VISUAL STYLE: Every image_prompt must reflect "${visualStyle}" as the rendering style. Append a short style descriptor that fits this style to each image_prompt.`;

  const characterContext = (() => {
    const lines: string[] = [];
    if (mainChar) {
      lines.push(`MAIN CHARACTER (eigenaar / hoofdpersoon): ${charLabel(mainChar)}${mainChar.description ? ` — ${mainChar.description}` : ""}`);
    } else if (supportChar) {
      lines.push(`MAIN CHARACTER: not specified — verzin een hoofdpersoon die DUIDELIJK contrasteert met de ${charLabel(supportChar)} (verschillende leeftijd, ander geslacht, andere uitstraling).`);
    } else {
      lines.push(`MAIN CHARACTER: not specified — verzin een passende hoofdpersoon voor dit verhaal.`);
    }

    if (supportChar) {
      lines.push(`SUPPORTING CHARACTER (klant / bijpersoon): ${charLabel(supportChar)}${supportChar.description ? ` — ${supportChar.description}` : ""}`);
    } else if (mainChar) {
      lines.push(`SUPPORTING CHARACTER: not specified — verzin een bijpersoon die DUIDELIJK contrasteert met ${charLabel(mainChar)} (verschillende leeftijd OF ander geslacht OF andere uitstraling). Nooit twee gelijke personen tegen elkaar.`);
    } else {
      lines.push(`SUPPORTING CHARACTER: not specified — verzin een bijpersoon die contrasteert met de hoofdpersoon (andere leeftijd, geslacht of look). Nooit twee gelijke personen tegen elkaar.`);
    }

    lines.push(`In elke image_prompt waarin een persoon voorkomt, MOET je expliciet vermelden of het de main character of de supporting character is, en hun kerneigenschappen herhalen (geslacht, leeftijdsindicatie, kledingkleur) zodat consistency bewaard blijft.`);
    return `\n\nCHARACTERS:\n${lines.join("\n")}`;
  })();

  const brandContext = brandKit ? `
BRAND CONTEXT:
- Brand: ${brandKit.name}${brandKit.description ? ` — ${brandKit.description}` : ""}
${brandKit.tone_of_voice ? `- Tone of voice: ${brandKit.tone_of_voice}` : ""}
${brandKit.brand_values && brandKit.brand_values.length > 0 ? `- Brand values: ${brandKit.brand_values.join(", ")}` : ""}
${brandKit.do_nots ? `- Do NOT: ${brandKit.do_nots}` : ""}
Apply this brand voice to the voiceover_text. Stay on-brand.` : "";

  const outro = (project.outro_contact ?? {}) as OutroContact;
  const outroParts: string[] = [];
  if (outro.company_name)  outroParts.push(`Company: ${outro.company_name}`);
  if (outro.tagline)       outroParts.push(`Tagline / CTA: ${outro.tagline}`);
  if (outro.website)       outroParts.push(`Website: ${outro.website}`);
  if (outro.email)         outroParts.push(`Email: ${outro.email}`);
  if (outro.phone)         outroParts.push(`Phone: ${outro.phone}`);
  if (outro.socials)       outroParts.push(`Socials: ${outro.socials}`);
  const hasOutro = outroParts.length > 0 || !!project.outro_logo_url;

  const outroContext = hasOutro ? `

OUTRO SCENE (LAST scene of ${sceneCount}):
The final scene MUST be a clean closing / call-to-action scene typical of explainer videos.
${outroParts.length > 0 ? `Contact details to feature:\n${outroParts.map(p => `  - ${p}`).join("\n")}` : ""}
${project.outro_logo_url ? "- A LOGO image is provided and will be composited in by the image generator." : ""}
- voiceover_text for the outro: a short, warm call-to-action in ${project.language} that mentions the company name${outro.tagline ? ` and reinforces the tagline "${outro.tagline}"` : ""}. Keep it under 12 seconds of speech.
- image_prompt for the outro: describe a calm, branded closing composition (e.g., the main character in a welcoming pose with empty space for the logo and contact text overlay, OR an abstract on-brand background with negative space). The image_prompt must end with: "Leave clean negative space in the lower-third for logo and contact details overlay. No text rendered in the image itself."
- duration: 5 to 7 seconds.` : "";

  const VISUAL_RULES = `VISUAL RULES: No text, letters, words, signs or labels visible anywhere. No more than 2 hands per person. No extra limbs or distorted anatomy. Faces natural and symmetrical. Lighting consistent with the previous scene unless the story explicitly shifts.`;

  const MOTION_RULES = `MOTION RULES: Base movement on the emotional tone of the voiceover_text. Calm explanation = slow gentle camera. Exciting reveal = dynamic push or zoom. Subtle parallax or drift is valid. Every motion must feel like a natural response to what the narrator is saying.`;

  const prompt = `You are an expert scriptwriter for premium animated story videos.

Create a video script for the following project:
- Title: ${project.title}
- Language: ${project.language}
- Video format: ${project.format}
- Visual style: ${visualStyle}
- Idea / brief: ${idea}
${characterContext}
${brandContext}
Generate EXACTLY ${sceneCount} scenes. Return ONLY a valid JSON array with no markdown, no code fences, no commentary.

Each element must have exactly these fields:
{
  "number": <integer starting at 1>,
  "duration": <integer seconds, typically 4 to 8>,
  "voiceover_text": "<narrator text for this scene in ${project.language}>",
  "image_prompt": "<what HAPPENS in this scene, in English. Action, setting, framing, lighting, mood. Will be sent to Nano Banana Pro along with anchor reference images.>",
  "motion_prompt": "<how the image should animate, in English>"
}
${anchorContext}${styleContext}${outroContext}

CRITICAL RULES for image_prompt:
- Write image_prompts in ENGLISH (image generators perform best in English) even if voiceover_text is in ${project.language}.
- The voiceover_text is your PRIMARY source. The image must show what the narrator is saying at that moment.
- Maintain visual continuity scene to scene: same time of day evolves naturally, same locations recur if the story stays put.
- Each scene's image_prompt should be 1 to 3 sentences focused on THIS moment.
- NEVER describe abstract concepts. Translate them into concrete filmable visuals.

STORY ARC:
1. OPENING scene: a strong hook that immediately grabs attention.
2. MIDDLE scenes: develop the story or explain the message with concrete visuals.
3. ${hasOutro ? "OUTRO scene (last): branded call-to-action with negative space for logo and contact." : "CLOSING scene (last): emotional payoff or call to action."}

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
