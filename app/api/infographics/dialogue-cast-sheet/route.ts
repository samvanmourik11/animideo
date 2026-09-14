import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImageWithStyle } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { buildIllustrationPrompt } from "@/lib/infographics/story-style";
import { illustratieContext } from "@/lib/infographics/dialogue-staging";
import { zonderTekst } from "@/lib/infographics/dialogue-beeldtekst";
import { deductCredits } from "@/lib/credits";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { uiterlijkVan, type DialogueCastMember } from "@/lib/infographics/dialogue-schema";

// HET CASTBLAD — één beeld waarop de hele cast naast elkaar staat.
//
// De personages bleven per scène net iets anders: een ander gezicht, en vooral
// een andere LENGTE — de ene keer stak Tyrell boven Lily uit, de volgende keer
// andersom. Dat is geen promptprobleem maar een informatieprobleem. De portretten
// uit de bibliotheek zijn borstbeelden: hoofd en schouders, allemaal even groot
// uitgesneden. Daar staat niets in over lichaamsbouw of lengte, dus verzint het
// beeldmodel dat bij élk beeld opnieuw — en dus elke keer anders.
//
// Dit blad legt het één keer vast: iedereen ten voeten uit, naast elkaar, op
// dezelfde grond, in de gekozen tekenstijl. Daarna is het de referentie voor elk
// twee-shot en elk bronbeeld, met de hoogste prioriteit die het beeldmodel kent.
// Eén beeld extra per video (1 credit), en het scheelt het herstellen van scènes
// die niet bij elkaar passen.

interface Body {
  cast?: DialogueCastMember[];
  styleId?: string;
  language?: string | null;
  illustrationBrief?: string | null;
  seed?: number;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Body;
    const cast = (body.cast ?? []).filter((c) => c.portraitUrl);
    if (cast.length < 2) {
      return NextResponse.json({ error: "Minstens twee personages met een afbeelding nodig" }, { status: 400 });
    }

    const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION_PRO, "Dialoog castblad");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION_PRO },
        { status: 402 }
      );
    }

    // De volgorde is die van de cast, zodat "de tweede van links" in latere
    // prompts naar dezelfde persoon verwijst.
    const wie = cast
      .map((c, i) => {
        const leeftijd = (c.leeftijd ?? "").trim();
        return `${i + 1}. ${c.name}${leeftijd ? ` (${leeftijd})` : ""}` +
          `${uiterlijkVan(c) ? ` — ${uiterlijkVan(c)}` : ""}`;
      })
      .join(" ");

    const brief =
      `A character line-up sheet for an animated film: ${cast.length} characters standing side by side in a row, ` +
      `facing the viewer, on a plain neutral background. From left to right: ${wie} ` +
      `Each character is shown FULL BODY from head to feet, standing upright on the same ground line, ` +
      `arms relaxed at their sides, neutral friendly expression. ` +
      // Dit is de hele reden dat dit blad bestaat: de onderlinge maat.
      // Zonder harde maten kwam een meisje van zes eruit als een tiener die boven
      // haar broertje uitstak. Een leeftijd alleen is te vaag; het model heeft een
      // verhouding nodig die het kan natekenen.
      `Their heights MUST match the age given in brackets after each name, drawn at the same scale as if ` +
      `photographed together: a young child reaches to about the waist or chest of an adult, a teenager to ` +
      `an adult's shoulder, and two children within a couple of years of each other are almost exactly the ` +
      `same height. Never draw a child as tall as an adult. ` +
      `Even spacing between them, nobody overlapping, everyone fully visible. ` +
      // De storytelling-versie van dit blad (buildCastSheetBrief) verbiedt tekst
      // al; hier ontbrak die regel. Gevolg: het model zette naamlabels onder de
      // figuren, en die labels reisden mee naar de scenes — in een kerstvideo
      // stonden er twee ingelijste portretkaartjes met onleesbare bijschriften
      // tussen de cadeaus onder de boom.
      `No text, no names, no labels, no numbers and no frames anywhere in the image.`;

    const result = await generateImageWithStyle({
      // Pro houdt personages en voorwerpen beter gelijk van beeld tot beeld.
      quality: "pro",
      prompt: buildIllustrationPrompt(brief, body.styleId ?? "flat-vector", body.language ?? null),
      format: "16:9",
      visualStyle: null,
      seed: typeof body.seed === "number" ? body.seed : undefined,
      // Model sheet gaat vóór het portret: het castblad tekent iedereen ten voeten
      // uit, en dan helpt het als de rest van het lichaam al ergens vastligt.
      characterUrls: cast.map((c) => c.modelSheetUrl || c.portraitUrl),
      extraContext: [
        illustratieContext(body.illustrationBrief),
        "The character reference images are head-and-shoulders portraits. Use them ONLY for each person's " +
          "face, hair, skin tone and clothing colours; invent the rest of their body yourself, in proportion " +
          "to their age. Do NOT copy the cropped portrait framing.",
      ].filter(Boolean).join(" ").trim() || undefined,
    });

    // Het blad is de zwaarst wegende referentie van de hele video: tekst die hier
    // blijft staan, komt in elke scene terug.
    const schoon = await zonderTekst(result.imageUrl, "16:9", body.language);
    const castSheetUrl = await persistFalAssetSoft(supabase, user.id, schoon, "image");
    return NextResponse.json({ castSheetUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-cast-sheet failed:", msg);
    return NextResponse.json({ error: "Castblad maken mislukt", detail: msg }, { status: 500 });
  }
}
