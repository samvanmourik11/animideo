import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { buildStoryPrompt } from "@/lib/infographics/build-story-prompt";
import { STORY_SPEC_SCHEMA, type StorySpec, type StoryScene, type StoryCastMember } from "@/lib/infographics/story-schema";
import { generateImageWithStyle, cleanupSceneIllustration, cleanupFlatGraphic } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { buildIllustrationPrompt, STYLE_MATCH_ANCHOR, brandPaletteHint, characterGuidance, castGuidance, CAST_SHEET_GUIDANCE, buildCastSheetBrief } from "@/lib/infographics/story-style";
import { artDirectScenes, regisseerOverheidScenes } from "@/lib/infographics/art-direct";
import { ICOON_SLEUTELS, icoonKeuzelijst } from "@/lib/infographics/overheid-scene";
import { borgBeeldtekst } from "@/lib/infographics/tekst-controle";
import { nlBeeldkennis } from "@/lib/infographics/nl-beeldkennis";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
import { isAdminAccount } from "@/lib/studio/access";
import type { InfographicFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  topic?: string;
  text?: string;
  mode?: "story" | "report" | "overheid";
  format?: InfographicFormat;
  // Gewenste videolengte in seconden. Stuurt het aantal scenes (hoe langer, hoe
  // meer scenes) en de voice-over-lengte per scene.
  targetSeconds?: number;
  // Huisstijlkleuren (hex) voor het "zachte" illustratie-palet. Leeg = vrij palet.
  brandColors?: { primary?: string; accent?: string };
  // Gekozen tekenstijl (zie STORY_STYLE_PRESETS). Leeg = flat-vector.
  styleId?: string;
  // Taal van script + voice-over (mensleesbaar NL, bijv. "Engels"). Leeg = Nederlands.
  language?: string;
  // Merk-/eigennamen die niet vertaald mogen worden (do-not-translate).
  keepTerms?: string[];
  // Merk-/eigennamen die nergens genoemd mogen worden (bron-anoniem).
  avoidTerms?: string[];
  // Verteltoon + optionele invalshoek.
  tone?: string;
  angle?: string;
  // Vast personage/mascotte dat consistent moet terugkomen.
  characterUrl?: string;
  characterRole?: string | null;
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
    // De Overheidsstijl is nog in aanbouw en staat daarom alleen voor interne
    // accounts in het menu. Een verborgen optie is geen grendel — wie de aanroep
    // naspeelt zou hem alsnog krijgen — dus controleren we het hier ook.
    const gevraagdeModus = body.mode === "report" ? "report" : body.mode === "overheid" ? "overheid" : "story";
    const mode =
      gevraagdeModus === "overheid" && !isAdminAccount(user.email) ? "story" : gevraagdeModus;
    // De overheidsmodus tekent diagrammen op een leeg vlak in plaats van scènes op
    // een plek, en negeert daarmee de gekozen tekenstijl (zie OVERHEID_FRAMING).
    const kader = mode === "overheid" ? ("overheid" as const) : ("verhaal" as const);
    const styleId = body.styleId ?? "flat-vector";
    const language = body.language ?? "Nederlands";
    const keepTerms = Array.isArray(body.keepTerms) ? body.keepTerms : [];
    const characterUrl = body.characterUrl?.trim() || null;
    const { secs, sceneCount, wordsPerScene } = planLength(body.targetSeconds ?? 60);

    // Credits: 1 voor het script + 1 beeld-tarief per geplande scene. Vooraf
    // afgerekend zodat we niets genereren als het saldo te laag is.
    //
    // De overheidsmodus tekent zijn scenes zelf (SVG, geen beeldmodel) en kost
    // dus alleen het script. Dat scheelt de gebruiker een credit per scene.
    const isOverheid = body.mode === "overheid";
    const cost = CREDIT_COSTS.SCRIPT_GENERATION + (isOverheid ? 0 : sceneCount * CREDIT_COSTS.IMAGE_GENERATION);
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
      language,
      keepTerms,
      avoidTerms: Array.isArray(body.avoidTerms) ? body.avoidTerms : [],
      tone: body.tone,
      angle: body.angle,
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

    // 2a. OVERHEIDSMODUS — geen beeldmodel, maar een opbouw die de app zelf
    // tekent en animeert (zie lib/infographics/overheid-scene.ts). Hier eindigt
    // de route dus al: er valt niets te genereren, te schonen of te controleren.
    if (isOverheid) {
      const layouts = await regisseerOverheidScenes({
        topic: body.topic ?? spec.title ?? "",
        rawText,
        scenes: spec.scenes.map((s) => ({ voiceover: s.voiceover })),
        iconen: ICOON_SLEUTELS,
        icoonUitleg: icoonKeuzelijst(),
      });
      const scenes: StoryScene[] = spec.scenes.map((s, i) => ({
        ...s,
        id: s.id || `scene-${i}`,
        imageUrl: null,
        // Zonder regie een leeg maar geldig sjabloon: de scene blijft dan zichtbaar
        // (titel + achtergrond) in plaats van dat het verhaal stukloopt.
        layout: layouts?.[i] ?? { template: "centraal", titel: null, elementen: [{ icoon: "vlak", label: "" }] },
      }));
      return NextResponse.json({ spec: { ...spec, scenes, styleId, language, cast: [], castSheetUrl: null } });
    }

    // 2. Art-direction: de illustratie-briefings upgraden met begrip van het HELE
    // verhaal + de bron, zodat de beelden bewust matchen met de voice-over (en
    // niet generiek/random voelen). Mislukt dit, dan houden we de scriptbriefings.
    const art = await artDirectScenes({
      mode,
      language,
      topic: body.topic ?? spec.title ?? "",
      rawText,
      scenes: spec.scenes.map((s) => ({ voiceover: s.voiceover })),
      characterRole: characterUrl ? body.characterRole : null,
    });
    // De cast hoort bij het verhaal, niet bij één scene: hij gaat mee naar elke
    // beeld-prompt én wordt in de spec bewaard, zodat een latere regeneratie via
    // de chat dezelfde mensen tekent. Vóór deze stap werd de castbeschrijving
    // stilletjes weggegooid en verzon elke scene zijn eigen hoofdpersoon.
    const cast: StoryCastMember[] = art?.cast ?? [];
    if (art) {
      spec.scenes = spec.scenes.map((s, i) => ({
        ...s,
        illustration: art.illustrations[i] || s.illustration,
        castNames: art.sceneCast[i] ?? [],
        labels: art.sceneLabels[i] ?? [],
      }));
    }

    // 3. Consistente look tussen scenes: vaste seed + een "anker"-beeld. We
    // genereren scene 0 eerst en gebruiken die als stijl-/character-referentie
    // voor alle overige scenes, zodat het hele verhaal als één set oogt. Lukt het
    // anker niet, dan vallen we terug op alleen de gedeelde seed.
    const seed = Math.floor(Math.random() * 2_000_000);
    // Zacht huisstijl-palet: geldt voor het anker én alle scenes, zodat de hele
    // set kleurtechnisch bij de huisstijl aansluit.
    const paletteHint = brandPaletteHint(body.brandColors?.primary, body.brandColors?.accent);

    // HET CASTBLAD — één beeld waarop de hele cast naast elkaar staat, dat daarna
    // als zwaarst wegende referentie bij élke scene meegaat. Een tekstbeschrijving
    // houdt kleding en kleur wel vast, maar een gezicht en de onderlinge lengte
    // niet; dat is precies waarom dezelfde persoon per scene een ander mens leek.
    // Alleen zinvol vanaf twee terugkerende personen — bij één (of geen) doet de
    // tekstuele castbeschrijving het werk en besparen we de gebruiker een credit.
    let castSheetUrl: string | null = null;
    if (cast.length >= 2) {
      const castCredit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Story castblad");
      if (castCredit.success) {
        try {
          const sheet = await generateImageWithStyle({
            // Kader "vlak" (de standaard): dit is een referentieblad, geen scène.
            prompt: buildIllustrationPrompt(buildCastSheetBrief(cast), styleId, language),
            format,
            visualStyle: null,
            seed,
            ingredientUrls: characterUrl ? [characterUrl] : undefined,
            extraContext: [paletteHint, characterUrl ? characterGuidance(body.characterRole) : ""].filter(Boolean).join(" ").trim() || undefined,
          });
          castSheetUrl = await persistFalAssetSoft(supabase, user.id, sheet.imageUrl, "image");
        } catch (e) {
          // Zonder castblad valt het verhaal terug op de tekstuele cast: minder
          // strak, maar beter dan helemaal geen beelden.
          console.error("[generate-story] castblad mislukt, verder zonder:", e);
        }
      }
    }

    const renderScene = async (scene: StoryScene, i: number, anchorUrl: string | null): Promise<StoryScene> => {
      try {
        const extraContext = [
          // Het uiterlijk van Nederlandse dingen ligt vast; laat het beeldmodel er
          // geen Amerikaanse versie van maken.
          nlBeeldkennis(language, scene.illustration, scene.voiceover, (scene.labels ?? []).join(" ")),
          paletteHint,
          castGuidance(cast, scene.castNames),
          castSheetUrl ? CAST_SHEET_GUIDANCE : "",
          characterUrl ? characterGuidance(body.characterRole) : "",
          anchorUrl ? STYLE_MATCH_ANCHOR : "",
        ].filter(Boolean).join(" ").trim() || undefined;
        const ingredientUrls = [characterUrl, anchorUrl].filter((u): u is string => !!u);
        const result = await generateImageWithStyle({
          prompt: buildIllustrationPrompt(scene.illustration, styleId, language, kader, scene.labels),
          format,
          visualStyle: null,
          seed,
          // Het castblad krijgt de merk-slots: die staan vooraan in de rij
          // referenties en wegen het zwaarst — en identiteit is hier het doel.
          brandUrls: castSheetUrl ? [castSheetUrl] : undefined,
          ingredientUrls: ingredientUrls.length ? ingredientUrls : undefined,
          extraContext,
        });
        // Tweede pass: zwevende rommel en verzonnen tekst wegvegen, met behoud van
        // de omgeving. Lukt dat niet, dan val terug op het ruwe beeld.
        let cleanUrl = result.imageUrl;
        try {
          cleanUrl = mode === "overheid"
            ? (await cleanupFlatGraphic(result.imageUrl, format, scene.labels)).imageUrl
            : (await cleanupSceneIllustration(result.imageUrl, format, scene.labels)).imageUrl;
        } catch (e) {
          console.error(`[generate-story] cleanup scene ${i} mislukt, ruw beeld behouden:`, e);
        }
        // Controleren wat er écht in beeld staat. Dit liep eerst alleen als de
        // regie labels had opgegeven — en juist in Verhaal en Rapport zijn die er
        // niet, dus daar keek niemand mee. Zo haalde letterbrij als
        // "ENERGISVERSUIK" en een verzonnen logo het tot in de video. Geen
        // bedoelde tekst betekent niet "niet controleren", maar "alles eruit".
        try {
          cleanUrl = (await borgBeeldtekst(cleanUrl, scene.labels ?? [], format, language)).imageUrl;
        } catch (e) {
          console.error(`[generate-story] tekstcontrole scene ${i} mislukt:`, e);
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

    return NextResponse.json({ spec: { ...spec, scenes, seed, anchorImageUrl, styleId, language, cast, castSheetUrl, characterUrl, characterRole: body.characterRole?.trim() || null } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generate-story failed:", msg);
    return NextResponse.json({ error: "Verhaal genereren mislukt", detail: msg }, { status: 500 });
  }
}
