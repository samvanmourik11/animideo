import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { buildStoryPrompt } from "@/lib/infographics/build-story-prompt";
import { STORY_SPEC_SCHEMA, type StorySpec, type StoryScene } from "@/lib/infographics/story-schema";
import { generateImageWithStyle, cleanupIllustration } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { buildIllustrationPrompt, STYLE_MATCH_ANCHOR, brandPaletteHint } from "@/lib/infographics/story-style";
import { artDirectScenes } from "@/lib/infographics/art-direct";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
import type { InfographicFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  topic?: string;
  text?: string;
  mode?: "story" | "report";
  format?: InfographicFormat;
  // Gewenste videolengte in seconden. Stuurt het aantal scenes (hoe langer, hoe
  // meer scenes) en de voice-over-lengte per scene.
  targetSeconds?: number;
  // Huisstijlkleuren (hex) voor het "zachte" illustratie-palet. Leeg = vrij palet.
  brandColors?: { primary?: string; accent?: string };
}

// Gemiddeld spreektempo (woorden/sec) en richtlengte per scene (sec), waaruit we
// het aantal scenes en de woorden per scene afleiden. Eén bron van waarheid voor
// "hoe langer de video, hoe meer scenes".
const WORDS_PER_SEC = 2.6;
// Een scene duurt in de praktijk ~5-7 seconden; ~6s als richtwaarde. Daarmee
// klopt de getoonde schatting (bijv. 12 scenes ≈ 72s) met wat de video speelt.
const SECONDS_PER_SCENE = 6;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function planLength(targetSeconds: number) {
  const secs = clamp(Math.round(targetSeconds), 20, 240);
  const sceneCount = clamp(Math.round(secs / SECONDS_PER_SCENE), 3, 20);
  const wordsPerScene = clamp(Math.round((secs * WORDS_PER_SEC) / sceneCount), 12, 55);
  return { secs, sceneCount, wordsPerScene };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Body;
    const rawText = (body.text ?? "").trim();
    if (!rawText) return NextResponse.json({ error: "Geen brontekst opgegeven" }, { status: 400 });

    const format = (body.format === "9:16" ? "9:16" : "16:9") as InfographicFormat;
    const mode = body.mode === "report" ? "report" : "story";
    const { secs, sceneCount, wordsPerScene } = planLength(body.targetSeconds ?? 60);

    // Credits: 1 voor het script + 1 beeld-tarief per geplande scene. Vooraf
    // afgerekend zodat we niets genereren als het saldo te laag is.
    const cost = CREDIT_COSTS.SCRIPT_GENERATION + sceneCount * CREDIT_COSTS.IMAGE_GENERATION;
    const credit = await deductCredits(user.id, cost, `Story genereren (${sceneCount} scenes)`);
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: cost },
        { status: 402 }
      );
    }

    const { system, user: userPrompt } = buildStoryPrompt({
      topic: body.topic ?? "",
      rawText,
      format,
      mode,
      language: "Nederlands",
      targetSeconds: secs,
      sceneCount,
      wordsPerScene,
    });

    // 1. Script + scene-briefings via de LLM (gestructureerd).
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      // Lager dan voorheen (0.6): feitelijke content, minder creatieve elaboratie
      // en minder kans op verzonnen cijfers.
      temperature: 0.35,
      // Schaal de tokenruimte mee met het aantal scenes zodat lange video's niet
      // halverwege worden afgekapt (~350 tokens per scene + marge).
      max_tokens: clamp(sceneCount * 350 + 800, 4000, 16000),
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "story_spec", strict: true, schema: STORY_SPEC_SCHEMA as unknown as Record<string, unknown> },
      },
    });

    let spec: StorySpec;
    try {
      spec = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as StorySpec;
    } catch {
      return NextResponse.json({ error: "Ongeldige JSON van model" }, { status: 500 });
    }
    if (!Array.isArray(spec.scenes) || spec.scenes.length === 0) {
      return NextResponse.json({ error: "Geen scenes gegenereerd" }, { status: 500 });
    }
    spec.format = format;
    spec.mode = mode;

    // 2. Art-direction: de illustratie-briefings upgraden met begrip van het HELE
    // verhaal + de bron, zodat de beelden bewust matchen met de voice-over (en
    // niet generiek/random voelen). Mislukt dit, dan houden we de scriptbriefings.
    const art = await artDirectScenes({
      topic: body.topic ?? spec.title ?? "",
      rawText,
      scenes: spec.scenes.map((s) => ({ voiceover: s.voiceover, headline: s.headline, bigNumber: s.bigNumber, numberLabel: s.numberLabel })),
    });
    if (art) {
      spec.scenes = spec.scenes.map((s, i) => (art.illustrations[i] ? { ...s, illustration: art.illustrations[i] } : s));
    }

    // 3. Consistente look tussen scenes: vaste seed + een "anker"-beeld. We
    // genereren scene 0 eerst en gebruiken die als stijl-/character-referentie
    // voor alle overige scenes, zodat het hele verhaal als één set oogt. Lukt het
    // anker niet, dan vallen we terug op alleen de gedeelde seed.
    const seed = Math.floor(Math.random() * 2_000_000);
    // Zacht huisstijl-palet: geldt voor het anker én alle scenes, zodat de hele
    // set kleurtechnisch bij de huisstijl aansluit.
    const paletteHint = brandPaletteHint(body.brandColors?.primary, body.brandColors?.accent);

    const renderScene = async (scene: StoryScene, i: number, anchorUrl: string | null): Promise<StoryScene> => {
      try {
        const extraContext = [paletteHint, anchorUrl ? STYLE_MATCH_ANCHOR : ""].filter(Boolean).join(" ").trim() || undefined;
        const result = await generateImageWithStyle({
          prompt: buildIllustrationPrompt(scene.illustration),
          format,
          visualStyle: null,
          seed,
          ingredientUrls: anchorUrl ? [anchorUrl] : undefined,
          extraContext,
        });
        // Tweede pass: sfeer-decoratie (rook, wolken, hoekplanten, bubbels) van het
        // beeld vegen. Lukt dat niet, dan val terug op het ruwe beeld.
        let cleanUrl = result.imageUrl;
        try {
          cleanUrl = (await cleanupIllustration(result.imageUrl, format)).imageUrl;
        } catch (e) {
          console.error(`[generate-story] cleanup scene ${i} mislukt, ruw beeld behouden:`, e);
        }
        // Tijdelijke fal-URL meteen naar onze eigen bucket kopieren, zodat het
        // verhaal zijn beelden houdt nadat de fal-link verloopt.
        const imageUrl = await persistFalAssetSoft(supabase, user.id, cleanUrl, "image");
        return { ...scene, id: scene.id || `scene-${i}`, imageUrl };
      } catch (e) {
        console.error(`[generate-story] illustratie scene ${i} mislukt:`, e);
        return { ...scene, id: scene.id || `scene-${i}`, imageUrl: null };
      }
    }

    // Anker eerst (scene 0), daarna de rest parallel met het anker als referentie.
    const first = await renderScene(spec.scenes[0], 0, null);
    const anchorImageUrl = first.imageUrl ?? null;
    const rest = await Promise.all(
      spec.scenes.slice(1).map((scene, idx) => renderScene(scene, idx + 1, anchorImageUrl))
    );
    const scenes: StoryScene[] = [first, ...rest];

    return NextResponse.json({ spec: { ...spec, scenes, seed, anchorImageUrl } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generate-story failed:", msg);
    return NextResponse.json({ error: "Verhaal genereren mislukt", detail: msg }, { status: 500 });
  }
}
