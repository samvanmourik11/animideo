import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { OutroContact, Scene, DesignedSceneContent, BrandReferenceImage } from "@/lib/types";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
import { EXPLAINER_ICONS } from "@/lib/explainer/schema";
import { normalizeBrandAssets, buildBrandAssetBlock, slugify } from "@/lib/studio/brand-assets";
import type { CastRole } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
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

  let brandKit: { name: string; tone_of_voice: string | null; description: string | null; do_nots: string | null; brand_values: string[] | null; reference_images: BrandReferenceImage[] | null } | null = null;
  if (project.brand_kit_id) {
    const { data } = await supabase
      .from("brand_kits")
      .select("name, tone_of_voice, description, do_nots, brand_values, reference_images")
      .eq("id", project.brand_kit_id)
      .eq("user_id", user.id)
      .single();
    brandKit = data;
  }

  // Echte merk-assets (boot, werkkleding, locatie, product) → een blok voor de
  // scriptschrijver + de geldige id's om de scène-tags tegen te valideren.
  const brandAssets = normalizeBrandAssets(brandKit?.reference_images ?? null);
  const brandAssetBlock = buildBrandAssetBlock(brandAssets);
  const validAssetIds = new Set(brandAssetBlock.ids);

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
${hasStyle ? "- A STYLE REFERENCE image is provided. Every image_prompt MUST start with the Dutch phrase: \"Zelfde geschilderde illustratiestijl, kleurenpalet en sfeer als de referentieafbeelding.\"" : ""}
${hasCharacter ? `- For each RECURRING foreground character, refer to them BY a short name (the same name every time) so they become a selectable placeholder, e.g. "Sam zit achter de bar" or "een barman, Sam, zit achter de bar". Do NOT add phrases like "same character as the reference". BACKGROUND or one-off extras (a crowd, colleagues behind a desk) are described generically and get NO name. The setting, camera angle and composition come from the scene.` : ""}
- The image generator will combine these references with your prompt. To avoid every scene looking like the reference image, EACH scene must describe a DISTINCTLY DIFFERENT setting, location, camera angle and framing.
- For every image_prompt, EXPLICITLY specify (in this order):
  1. Setting / location (e.g., "in a sunlit kitchen", "on a busy office floor", "at a forest path during golden hour")
  2. Camera framing (e.g., "wide establishing shot", "close-up of the hands", "over-the-shoulder medium shot")
  3. Action and emotion of the subject (the character, if a person appears in this scene)
  4. Lighting and mood specific to this scene
- The ${sceneCount} scenes together should form a visual journey across DIFFERENT environments, not the same location every time. Vary indoor/outdoor, day/night, wide/close, calm/active.` : "";

  const visualStyle = project.visual_style ?? "Cinematic";
  const styleContext = `
VISUAL STYLE: Every image_prompt must reflect "${visualStyle}" as the rendering style. Append a short style descriptor that fits this style to each image_prompt.`;

  const characterContext = (() => {
    // Personages zijn een hulpmiddel voor VISUELE consistentie, GEEN verplicht
    // verhaalstramien. Zonder gekozen personages verzinnen we dus géén standaard
    // "hoofdpersoon met een probleem"; de scriptvorm volgt de briefing.
    if (!mainChar && !supportChar) {
      return `\n\nPERSONAGES: er zijn geen vaste personages gekozen. Verzin GEEN standaard hoofdpersoon-met-een-probleem en open NIET met "Dit is [naam]...". Laat de SCRIPTVORM (zie hieronder) het script bepalen. Mensen in beeld mag alleen als de gekozen vorm daar baat bij heeft; houd diezelfde persoon dan visueel consistent en forceer geen tweede personage.`;
    }
    const lines: string[] = [];
    if (mainChar) lines.push(`HOOFDPERSONAGE (vast, voor visuele consistentie): ${charLabel(mainChar)}${mainChar.description ? ` — ${mainChar.description}` : ""}`);
    if (supportChar) lines.push(`TWEEDE PERSONAGE (vast, voor visuele consistentie): ${charLabel(supportChar)}${supportChar.description ? ` — ${supportChar.description}` : ""}`);
    lines.push(`Deze personages zijn gekozen voor VISUELE consistentie tussen scenes. Gebruik ze waar ze passen, maar ze dwingen GEEN vast verhaalstramien af: kies nog steeds de scriptvorm die het beste bij de briefing past, en open niet standaard met "Dit is [naam]...". Vermeld in elke image_prompt met een persoon of het het hoofdpersonage of het tweede personage is, met kerneigenschappen (geslacht, leeftijdsindicatie, kledingkleur) voor consistentie.`);
    return `\n\nPERSONAGES:\n${lines.join("\n")}`;
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

FINAL SCENE — DESIGNED CALL-TO-ACTION (LAST scene of ${sceneCount}):
The final scene MUST be a DESIGNED call-to-action scene in the house style (a clean on-brand graphic, NOT an AI illustration).
Set "scene_type": "cta" and provide a "cta" object: { "headline": "<short, warm CTA headline in ${project.language}>", "subheading": "<optional one-line supporting sentence>" }.
${outroParts.length > 0 ? `The contact details and logo are added AUTOMATICALLY from the brand settings — do NOT repeat them in the headline/subheading:\n${outroParts.map(p => `  - ${p}`).join("\n")}` : "The logo is added automatically from the brand settings."}
- voiceover_text: a short, warm call-to-action in ${project.language}${outro.company_name ? ` that mentions ${outro.company_name}` : ""}${outro.tagline ? ` and reinforces the tagline "${outro.tagline}"` : ""}. Under 12 seconds of speech.
- Leave image_prompt and motion_prompt EMPTY for this scene (it is rendered as a graphic, not generated).
- duration: 4 to 6 seconds.` : "";

  const designedContext = `

DESIGNED SCENES (non-AI, on-brand graphic scenes):
Besides AI-illustrated scenes you may mark a scene as a DESIGNED scene: a clean on-brand graphic in the house style (solid brand-colour background, REAL text and icons) instead of an AI illustration. Use them ONLY where they genuinely improve comprehension — never force them.

- "presentation": use when the voiceover ENUMERATES or SUMMARISES discrete points — a list of features, benefits, services, steps, options, or a recap. Do NOT use it for narrative, emotional or single-subject moments (those stay AI-illustrated). Typically 0 to 2 per video, only where an on-screen list adds real clarity.
  Provide "scene_type": "presentation" and a "presentation" object:
    { "heading": "<short scene title>", "subheading": "<optional one-liner>", "bullets": [ { "text": "<concise point, max ~6 words>", "icon": "<icon keyword>" } ] }
  Use 3 to 5 bullets. The voiceover_text still narrates these points naturally. Leave image_prompt and motion_prompt EMPTY for designed scenes.

- "cta": ${hasOutro ? "ONLY the final scene, as described under FINAL SCENE above." : "not applicable for this video (no contact details provided)."}

ICON KEYWORDS — for every bullet icon choose the single most semantically fitting keyword from THIS list only (no other words):
${EXPLAINER_ICONS.join(", ")}

So each scene element MAY optionally include "scene_type" ("ai" | "presentation"${hasOutro ? ' | "cta"' : ""}; default "ai") plus the matching "presentation"${hasOutro ? '/"cta"' : ""} object. Normal AI-illustrated scenes omit these fields and keep image_prompt as usual.`;

  const VISUAL_RULES = `BEELDREGELS: Nergens tekst, letters, woorden, borden of labels zichtbaar. Maximaal 2 handen per persoon. Geen extra ledematen of vervormde anatomie. Gezichten natuurlijk en symmetrisch. Belichting consistent met de vorige scène, tenzij het verhaal duidelijk wisselt.`;

  const MOTION_RULES = `BEWEGINGSREGELS: Baseer de beweging op de emotionele toon van de voice-over. Rustige uitleg = langzame, zachte camera. Spannende onthulling = dynamische push of zoom. Subtiele parallax of drift mag. Elke beweging moet een natuurlijke reactie zijn op wat de verteller zegt.`;

  const prompt = `You are an expert scriptwriter for premium animated brand, explainer and story videos. You write the script that best fits THIS brief, never a fixed template.

Create a video script for the following project:
- Title: ${project.title}
- Language: ${project.language}
- Video format: ${project.format}
- Visual style: ${visualStyle}
- Idea / brief: ${idea}
${characterContext}
${brandContext}${brandAssetBlock.text}
Generate EXACTLY ${sceneCount} scenes. Return ONLY a valid JSON OBJECT (no markdown, no code fences, no commentary) with this exact shape:
{
  "cast": [ ALL recurring on-screen people in this video (max 5), each: { "name": "<short name used in the image_prompts, e.g. Lisa>", "appearance": "<detailed, FIXED visual description in ${project.language}: gender, approximate age, hair (colour, length, style), build, and EXACT clothing (each garment + its colour), plus 1-2 distinguishing features>" }.${(mainChar || supportChar) ? ` ALWAYS include these chosen characters under these EXACT names: ${[mainChar?.name, supportChar?.name].filter(Boolean).join(", ")}.` : ""} Empty array [] only for product/process/abstract videos with no recurring person.],
  "scenes": [ exactly ${sceneCount} scene objects ]
}

Each scene object must have exactly these fields:
{
  "number": <integer starting at 1>,
  "duration": <integer seconds, 3 to 5 — each scene becomes a ~5s AI-animated clip, so NEVER make a scene longer than 5s (a longer scene freezes on its last frame and looks static). Short scenes keep the video lively.>,
  "voiceover_text": "<narrator text for this scene in ${project.language}>",
  "image_prompt": "<wat er in deze scène GEBEURT, in ${project.language}. Actie, setting, kadrering, belichting, sfeer. Gaat naar Nano Banana Pro samen met de referentiebeelden.>",
  "motion_prompt": "<hoe de afbeelding moet bewegen, in ${project.language}>"${brandAssetBlock.ids.length > 0 ? `,
  "brand_asset_ids": [<de id('s) uit ECHTE MERK-ASSETS die in DEZE scène voorkomen; gebruik telkens DEZELFDE id voor hetzelfde object zodat het identiek blijft; [] als er geen merk-asset in beeld is>]` : ""},
  "cast_names": [<de namen uit "cast" die in DEZE scène in beeld zijn; gebruik telkens DEZELFDE naam voor dezelfde persoon; [] als er geen persoon in beeld is>]
}

PACING (important for a lively, professional feel): a great explainer has MANY short scenes with frequent cuts, NOT a few long shots. Keep every scene 3-5 seconds. If an idea would need a longer shot, split it into two short consecutive scenes (a different angle/action each) instead of one long one. Frequent, snappy cuts make the video dynamic and pleasant to watch.

CHARACTER CONSISTENCY (critical): the people in "cast" are the SAME individuals throughout the whole video. In EVERY scene that shows a cast member, refer to them BY NAME and restate their FIXED appearance from "cast" (same face, hair, age, build, and the EXACT same clothing and colours). List that person's name in this scene's "cast_names". If two cast members appear together, describe BOTH with their fixed appearance. NEVER change a character's face, hair, age, build or clothing between scenes — only their setting, pose, action, expression and camera framing may change.
${anchorContext}${styleContext}${outroContext}${designedContext}

CRITICAL RULES for image_prompt:
- Write the image_prompts and motion_prompts in ${project.language} (so the user can read and tweak them). Nano Banana Pro handles ${project.language} well.
- The voiceover_text is your PRIMARY source. The image must show what the narrator is saying at that moment.
- Maintain visual continuity scene to scene: same time of day evolves naturally, same locations recur if the story stays put.
- Each scene's image_prompt should be 1 to 3 sentences focused on THIS moment.
- NEVER describe abstract concepts. Translate them into concrete filmable visuals.

SCRIPT STRUCTURE — follow this proven narrative arc for EVERY video. This is the fixed HOUSE FORMULA used in all our agency videos. Adapt the wording to the brief; NEVER copy the examples literally.

1. HOOK (scene 1): Grab attention by speaking DIRECTLY to the viewer (je/jij/jouw). Use ONE of:
   - a recognisable problem or frustration the target audience feels ("Veel <doelgroep> willen ..., maar missen ..." / "Gedurende ... komt ... nauwelijks aan bod."),
   - a surprising fact or did-you-know question ("Wist je dat ...?"),
   - or an aspirational / dream question ("Droom jij van ...?" / "Wat is jouw ...?").
   Build tension or desire. Do NOT introduce a named person with a problem.

2. THE BRAND AS THE ANSWER (next scene): Pivot to the company as the solution or answer to the hook ("Daarom is <brand> ontworpen." / "<brand> lost dat op met ..." / "Maar wat dan wel? <brand> ..." / "Bij <brand> begint ..."). State in ONE clear line what they do.

3. BODY — SHOW HOW IT WORKS (the middle scenes): The concrete substance, ONE idea per scene, in logical order. Choose the shape that best fits the brief:
   - a step-by-step PROCESS or journey (e.g. ingredient -> rising -> shaping -> delivery -> result; or intake gesprek -> adviseur -> contract -> praktijkervaring),
   - an EDUCATIONAL enumeration / list (e.g. "Er zijn vijf ..." with numbered points) -> render this as a DESIGNED "presentation" scene (see DESIGNED SCENES below),
   - or the key FEATURES / proof points that make the brand trustworthy.
   Keep every scene concrete and filmable, never abstract.

4. BENEFIT / EMOTIONAL PAYOFF (near the end): Lift from features to the deeper value for the viewer — reassurance, freedom, confidence, connection ("Meer rust, meer zekerheid." / "Ervaar vrijheid, gemak en het echte vakantiegevoel." / "Begrijp je elkaars taal, dan ben je nog meer in verbinding.").

5. CTA / CLOSE (last scene): A short, warm call to action${hasOutro ? " (rendered as the DESIGNED \"cta\" scene)" : ""} with the website, ending on the brand name and a punchy tagline ("Ga naar <site>." / "Plan vrijblijvend een gesprek via ..." / "<brand>. <tagline>.").

WRITING RULES (house voice):
- Warm, direct, conversational ${project.language}. ALWAYS address the viewer as je/jij/jouw.
- Open with a rhetorical question or a relatable statement; vary it every single time.
- Natural spoken narration (voice-over): ONE short sentence per scene. Match the word count to the scene's duration at ~2.5 spoken words per second (≈150 words per minute): a 3s scene ≈ 7-8 words, a 4s scene ≈ 10 words, a 5s scene ≈ 12-13 words. NEVER exceed this — a too-long line forces the scene to stretch and breaks the pacing. Split a longer thought across two short consecutive scenes instead. No stage directions.
- Benefit-driven and concrete — translate every abstract idea into something filmable.
- End on the brand name + a short tagline + website/CTA.
- HARD RULE: never open with "Dit is <naam>, <naam> heeft moeite met..." or any variant that introduces a named person with a problem, UNLESS the brief explicitly asks for a personal story.

Voiceover rules:
- voiceover_text in ${project.language}, natural narration, no stage directions.
- Total duration should add up to roughly ${sceneCount * 3} to ${sceneCount * 5} seconds (scenes are short, 3-5s each).
- Word budget: the WHOLE voice-over should be about 2.5 words per second of total video (≈150 words per minute). For ${sceneCount} scenes that is roughly ${Math.round(sceneCount * 4 * 2.5)} words total — keep it tight and punchy, never wordy.

Respond with only the JSON object, starting with { and ending with }.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 4000,
    temperature: 0.7,
  });

  const raw = completion.choices[0].message.content ?? "[]";
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  const ICONSET = new Set<string>(EXPLAINER_ICONS as readonly string[]);
  const safeIcon = (x: unknown) => (typeof x === "string" && ICONSET.has(x) ? x : "check");

  type RawScene = {
    number?: number;
    duration?: number;
    voiceover_text?: string;
    image_prompt?: string;
    motion_prompt?: string;
    brand_asset_ids?: string[];
    cast_names?: string[];
    scene_type?: string;
    presentation?: { heading?: string; subheading?: string; bullets?: { text?: string; icon?: string }[] };
    cta?: { headline?: string; subheading?: string };
  };

  type CastMember = { name?: string; appearance?: string };
  type RawRoot = { cast?: CastMember[]; scenes?: RawScene[] };

  let scenes: Scene[] = [];
  let cast: { name: string; appearance: string }[] = [];
  let roles: CastRole[] = [];
  try {
    const root = JSON.parse(cleaned) as RawScene[] | RawRoot;
    const rawScenes: RawScene[] = Array.isArray(root) ? root : (root.scenes ?? []);
    if (!Array.isArray(root) && Array.isArray(root.cast)) {
      cast = root.cast
        .map(c => ({ name: (c?.name ?? "").trim(), appearance: (c?.appearance ?? "").trim() }))
        .filter(c => c.appearance.length > 0)
        .slice(0, 5);
    }

    // Gestructureerde cast: seed uit gekozen characters (gekoppeld) + GPT-rollen
    // (AI). Dedup op slug; gekozen characters winnen en houden hun characterId.
    const roleMap = new Map<string, CastRole>();
    const addRole = (name: string, appearance: string, characterId: string | null) => {
      const nm = (name || "").trim();
      if (!nm) return;
      const id = `role-${slugify(nm)}`;
      const existing = roleMap.get(id);
      if (existing) { if (characterId && !existing.characterId) existing.characterId = characterId; return; }
      roleMap.set(id, { id, name: nm, appearance: (appearance || nm).trim(), characterId, anchorUrl: null });
    };
    if (mainChar) addRole(mainChar.name, mainChar.description ?? charLabel(mainChar), mainChar.id);
    if (supportChar) addRole(supportChar.name, supportChar.description ?? charLabel(supportChar), supportChar.id);
    for (const c of cast) addRole(c.name, c.appearance, null);
    roles = [...roleMap.values()];
    const validRoleIds = new Set(roles.map(r => r.id));

    scenes = rawScenes.map((s, i) => {
      const type = s.scene_type === "presentation" || s.scene_type === "cta" ? s.scene_type : "ai";
      let designed: DesignedSceneContent | null = null;

      if (type === "presentation") {
        const bullets = (s.presentation?.bullets ?? [])
          .slice(0, 6)
          .map(b => ({ text: (b?.text ?? "").trim(), icon: safeIcon(b?.icon) }))
          .filter(b => b.text.length > 0);
        if (bullets.length > 0) {
          designed = {
            kind: "bullets",
            title: (s.presentation?.heading ?? "").trim(),
            subtitle: s.presentation?.subheading?.trim() || undefined,
            bullets,
          };
        }
      } else if (type === "cta" && hasOutro) {
        designed = {
          kind: "cta",
          title: (s.cta?.headline ?? outro.tagline ?? "Neem contact op").trim(),
          subtitle: s.cta?.subheading?.trim() || undefined,
        };
      }

      // Gevalideerde merk-asset-tags: alleen id's die echt in de kit bestaan.
      const brandAssetIds = Array.isArray(s.brand_asset_ids)
        ? [...new Set(s.brand_asset_ids.filter(id => typeof id === "string" && validAssetIds.has(id)))]
        : [];

      // Cast-tags voor deze scène (namen → role-ids), gevalideerd tegen de cast.
      // Het personage-consistentieblok wordt NIET hier gebakken: generate-scene-
      // image bouwt het per scène opnieuw op uit het TOEGEWEZEN character, zodat
      // een per-scène override echt verandert wie er getekend wordt.
      const castIds = Array.isArray(s.cast_names)
        ? [...new Set(s.cast_names.map(n => `role-${slugify((n ?? "").trim())}`).filter(id => validRoleIds.has(id)))]
        : [];

      // Zet elke cast-naam in de prompt om naar een generieke {selecteer personage}-
      // placeholder (invul-slot). De gebruiker kiest per scène welk character dat
      // wordt. Achtergrondfiguren (geen cast-rol) blijven gewone tekst.
      let promptBody = s.image_prompt ?? "";
      for (const rid of castIds) {
        const role = roles.find(r => r.id === rid);
        if (!role) continue;
        for (const variant of [role.name, role.name.split(/\s*[-–]\s*|\s+/)[0]]) {
          if (!variant) continue;
          const esc = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          promptBody = promptBody.replace(new RegExp(`(?<!\\{)\\b${esc}\\b(?!\\})`, "g"), "{selecteer personage}");
        }
      }

      return {
        id: `scene-${Date.now()}-${i}`,
        number: s.number ?? i + 1,
        duration: s.duration ?? 5,
        voiceover_text: s.voiceover_text ?? "",
        // Ontworpen scènes hebben geen AI-beeld/motion nodig.
        image_prompt: designed ? "" : promptBody + "\n\n" + VISUAL_RULES,
        motion_prompt: designed ? "" : (s.motion_prompt ?? "") + "\n\n" + MOTION_RULES,
        image_url: null,
        video_url: null,
        canvas_json: null,
        designed,
        ...(brandAssetIds.length > 0 ? { brand_asset_ids: brandAssetIds } : {}),
        ...(castIds.length > 0 ? { cast_ids: castIds } : {}),
      };
    });
  } catch {
    return NextResponse.json({ error: "Failed to parse GPT-4 response", raw: cleaned }, { status: 500 });
  }

  if (scenes.length === 0) {
    return NextResponse.json({ error: "Geen scènes ontvangen", raw: cleaned }, { status: 500 });
  }

  // Geen AI-anker-portretten meer: personages zijn nu invul-placeholders
  // ({selecteer personage}) die de gebruiker per scène aan een gemaakt character
  // koppelt. cast_roles bewaren we nog (back-compat), maar zonder ankers.
  const updatePayload: Record<string, unknown> = { scenes, status: "ScriptReady", script_text: raw, cast_roles: roles };

  await supabase
    .from("projects")
    .update(updatePayload)
    .eq("id", projectId)
    .eq("user_id", user.id);

  return NextResponse.json({ scenes, cast_roles: roles });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generate-script failed:", msg);
    return NextResponse.json(
      { error: "Script genereren mislukt, probeer het opnieuw.", detail: msg },
      { status: 500 }
    );
  }
}
