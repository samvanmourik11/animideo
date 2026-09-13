// EEN BLAD PER VAST VOORWERP — zoals het castblad voor de personages.
//
// De Wonderwagen zag er in één video uit als een fauteuil, een tram, een paars
// busje en een gele jeep met koffers. Een beschrijving in woorden laat het
// beeldmodel te veel ruimte: "a magical wagon" kan alles zijn. Eén keer tekenen en
// dát beeld meesturen naar elke scène waarin hij voorkomt, legt vast hoe hij
// eruitziet — dezelfde aanpak die de personages gelijk hield.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImageWithStyle } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { buildIllustrationPrompt } from "@/lib/infographics/story-style";
import { illustratieContext } from "@/lib/infographics/dialogue-staging";
import { zonderTekst } from "@/lib/infographics/dialogue-beeldtekst";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import type { DialogueVoorwerp } from "@/lib/infographics/dialogue-schema";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Body {
  voorwerp?: DialogueVoorwerp;
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
    const naam = (body.voorwerp?.naam ?? "").trim();
    const uiterlijk = (body.voorwerp?.uiterlijk ?? "").trim();
    if (!naam || !uiterlijk) {
      return NextResponse.json({ error: "Voorwerp zonder naam of beschrijving" }, { status: 400 });
    }

    const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Voorwerpblad");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
        { status: 402 },
      );
    }

    const brief =
      `A reference sheet for ONE object from an animated children's story: ${naam} — ${uiterlijk} ` +
      `Draw this single object TWICE side by side on a plain light neutral background: once from a front ` +
      `three-quarter view and once from the side. Both drawings show exactly the same object — the same shape, ` +
      `colours, materials and details. ` +
      // Het castblad leerde dat het model een blad graag als decor behandelt; hier
      // hoort alleen het voorwerp op, anders gaan mensen en achtergrond mee de scène in.
      `No people, no animals, no other objects and no scenery. ` +
      `No text, no names, no labels, no numbers and no frames anywhere in the image.`;

    const result = await generateImageWithStyle({
      prompt: buildIllustrationPrompt(brief, body.styleId ?? "flat-vector", body.language ?? null),
      format: "16:9",
      visualStyle: null,
      seed: typeof body.seed === "number" ? body.seed : undefined,
      extraContext: illustratieContext(body.illustrationBrief),
    });

    try {
      const schoon = await zonderTekst(result.imageUrl, "16:9", body.language);
      const bladUrl = await persistFalAssetSoft(supabase, user.id, schoon, "image");
      return NextResponse.json({ bladUrl });
    } catch (e) {
      // Het blad is gereedschap, geen bestelling: mislukt het opslaan, dan krijgt
      // de gebruiker zijn credit terug.
      await addCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Refund: voorwerpblad");
      throw e;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-voorwerp-blad failed:", msg);
    return NextResponse.json({ error: "Voorwerpblad maken mislukt", detail: msg }, { status: 500 });
  }
}
