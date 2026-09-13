// EEN MODEL SHEET PER PERSONAGE — hetzelfde personage van voren, schuin en opzij.
//
// Het castblad toont iedereen náást elkaar, ten voeten uit. Dat legt de onderlinge
// lengte vast, maar het gezicht staat er klein op en er is maar één hoek. Zodra een
// shot van opzij of van onderaf gevraagd wordt, moet het beeldmodel de andere kant
// van dat hoofd zelf verzinnen — en dan verzint het ook meteen ander haar. In een
// video van één minuut sprong Lily's haar van middenbruin naar bijna zwart naar
// lichtbruin met blonde strepen.
//
// Dit blad is wat animatiestudio's een model sheet noemen: één personage, meerdere
// hoeken, egale achtergrond. Het wordt één keer per personage gemaakt en gaat
// daarna als identiteitsreferentie mee naar elk shot waarin diegene voorkomt.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImageWithStyle } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { buildIllustrationPrompt } from "@/lib/infographics/story-style";
import { illustratieContext } from "@/lib/infographics/dialogue-staging";
import { zonderTekst } from "@/lib/infographics/dialogue-beeldtekst";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import { uiterlijkVan, type DialogueCastMember } from "@/lib/infographics/dialogue-schema";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Body {
  lid?: DialogueCastMember;
  styleId?: string;
  language?: string;
  illustrationBrief?: string;
  seed?: number;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Body;
    const lid = body.lid;
    if (!lid?.portraitUrl) {
      return NextResponse.json({ error: "Personage zonder afbeelding" }, { status: 400 });
    }

    const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Model sheet personage");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
        { status: 402 },
      );
    }

    const uiterlijk = uiterlijkVan(lid);
    const leeftijd = (lid.leeftijd ?? "").trim();

    const brief =
      `A character model sheet for an animated film: the SAME single character drawn THREE times in a row on a ` +
      `plain neutral background — from the FRONT, from a THREE-QUARTER angle, and from the SIDE in profile. ` +
      `The character is ${lid.name}${leeftijd ? `, ${leeftijd}` : ""}${uiterlijk ? `: ${uiterlijk}` : ""}. ` +
      // De hele reden van dit blad: het HAAR moet van alle kanten kloppen.
      `Their hair is the most important thing to get right: exactly the same colour, the same volume and the ` +
      `same curl or texture in all three views, so that the back and side of the head are unmistakable. ` +
      `Head to feet in each view, standing upright on the same ground line, arms relaxed, neutral expression, ` +
      `the same clothing in the same colours in all three. Even spacing, nobody overlapping. ` +
      // Wat hier ontbreekt, verzint elk later beeld zelf: zonder schoenen op het blad
      // liep Lilly de hele video op blote voeten, ook buiten.
      `Fully dressed from head to toe, including shoes on both feet. ` +
      `Only this ONE character appears — no other people. ` +
      `No text, no names, no labels, no numbers and no frames anywhere in the image.`;

    const result = await generateImageWithStyle({
      prompt: buildIllustrationPrompt(brief, body.styleId ?? "flat-vector", body.language ?? null),
      format: "16:9",
      visualStyle: null,
      seed: typeof body.seed === "number" ? body.seed : undefined,
      characterUrls: [lid.portraitUrl],
      extraContext: [
        illustratieContext(body.illustrationBrief),
        "The reference image is a head-and-shoulders portrait of this character. Use it for the face, hair, " +
          "skin tone and clothing colours; invent the rest of the body yourself, in proportion to their age. " +
          "Do NOT copy the cropped portrait framing and do NOT repeat the portrait as one of the three views.",
      ].filter(Boolean).join(" ").trim() || undefined,
    });

    try {
      const schoon = await zonderTekst(result.imageUrl, "16:9", body.language);
      const modelSheetUrl = await persistFalAssetSoft(supabase, user.id, schoon, "image");
      return NextResponse.json({ modelSheetUrl });
    } catch (e) {
      // Het blad is gereedschap, geen bestelling. Mislukt het opslaan, geef de
      // credit dan terug: de gebruiker heeft er niets voor gekregen.
      await addCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Refund: model sheet");
      throw e;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-model-sheet failed:", msg);
    return NextResponse.json({ error: "Model sheet maken mislukt", detail: msg }, { status: 500 });
  }
}
