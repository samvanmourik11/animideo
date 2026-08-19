import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImageWithStyle } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { buildIllustrationPrompt } from "@/lib/infographics/story-style";
import { buildTwoShotBrief, illustratieContext } from "@/lib/infographics/dialogue-staging";
import { MAX_CAST, type DialogueCastMember } from "@/lib/infographics/dialogue-schema";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
import type { InfographicFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  setting?: string;
  cast?: DialogueCastMember[];
  styleId?: string;
  format?: InfographicFormat;
  language?: string;
  seed?: number;
  // Vrije regieaanwijzing van de gebruiker, geldt voor elk beeld in de video.
  illustrationBrief?: string;
  // Het twee-shot van de EERSTE scène. Elke volgende scène wordt daar visueel aan
  // opgehangen: zelfde personages, zelfde tekenstijl, alleen een andere omgeving.
  // Zonder dit anker werd elke scène los gegenereerd en dreven cast en look uit
  // elkaar — de laatste scène had andere mensen in een andere kamer.
  anchorTwoShotUrl?: string;
}

// Het basis-twee-shot van één scène: de cast tegenover elkaar in de omgeving.
// Elke gesproken regel binnen die scène wordt later een BEWERKING van dit beeld,
// zodat de personages tussen regels niet verspringen. Vandaar dat dit een aparte
// stap is en niet per regel opnieuw gebeurt.
//
// Bewust GEEN Seedance-beweging hier: dit beeld is een startpunt voor de clips,
// geen shot dat zelf in de video komt.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Body;
    const setting = (body.setting ?? "").trim();
    if (!setting) return NextResponse.json({ error: "Geen omgeving opgegeven" }, { status: 400 });

    const cast = (Array.isArray(body.cast) ? body.cast : []).slice(0, MAX_CAST);
    const portretten = cast.map((c) => c.portraitUrl).filter((u): u is string => !!u);
    if (portretten.length < 2) {
      return NextResponse.json({ error: "Minstens twee personages met een afbeelding nodig" }, { status: 400 });
    }

    const format = (body.format === "9:16" ? "9:16" : "16:9") as InfographicFormat;
    const styleId = body.styleId ?? "flat-vector";

    const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Dialoog twee-shot");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
        { status: 402 }
      );
    }

    const brief = buildTwoShotBrief(setting, cast);
    const anker = (body.anchorTwoShotUrl ?? "").trim();
    const ankerInstructie = anker
      ? " A reference image of these SAME two people from an earlier scene in this same video is provided. " +
        "Keep the characters identical to that image — same faces, hair, clothing, colours, proportions and " +
        "drawing style — and keep them standing in the same left/right arrangement. ONLY the surroundings " +
        "change to the new location described above."
      : "";

    const result = await generateImageWithStyle({
      prompt: buildIllustrationPrompt(brief, styleId, body.language ?? null),
      format,
      visualStyle: null,
      seed: typeof body.seed === "number" ? body.seed : undefined,
      // De portretten leveren de identiteit; de brief bepaalt houding en kader.
      characterUrls: portretten,
      // Het anker uit scène 1 houdt cast én look gelijk over alle scènes heen.
      ingredientUrls: anker ? [anker] : undefined,
      extraContext: [illustratieContext(body.illustrationBrief), ankerInstructie]
        .filter(Boolean).join(" ").trim() || undefined,
    });
    const twoShotUrl = await persistFalAssetSoft(supabase, user.id, result.imageUrl, "image");

    return NextResponse.json({ twoShotUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-twoshot failed:", msg);
    return NextResponse.json({ error: "Twee-shot maken mislukt", detail: msg }, { status: 500 });
  }
}
