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
  /** Het castblad van deze video: voorbeeld voor de look, niet voor wat er getekend wordt. */
  castSheetUrl?: string;
  /** Portretten van de cast: voorbeeld voor de look als er nog geen castblad is. */
  portretUrls?: string[];
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

    // Een bosanemoon op een lege achtergrond werd een kleibloem van speelgoed: de stijl
    // Soft 3D noemt "clay-like" en "toy-like", en zonder omgeving is er niets dat zegt
    // hoe echt het moet. In het bos stak hij af als een plastic bloem. Het castblad
    // laat zien in welke wereld het voorwerp thuishoort.
    const castblad = (body.castSheetUrl ?? "").trim();
    // In de opzet en het draaiboek bestaat het castblad nog niet; dan laten de
    // portretten zien in welke look het voorwerp hoort.
    const portretten = castblad
      ? []
      : (Array.isArray(body.portretUrls) ? body.portretUrls : [])
          .filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u))
          .slice(0, 2);
    const voorbeeld = (body.voorwerp?.voorbeeldUrl ?? "").trim();
    const lookRegels = [
      castblad || portretten.length
        ? `${castblad ? "One reference image shows" : "The first reference images show"} the characters of this video. ` +
          "Use them ONLY for the look: the rendering style, materials, level of realism, shading and colours. Do not " +
          "draw any of these people — this image contains only the object."
        : "",
      voorbeeld
        ? "One reference image shows this same object drawn earlier in another style. Keep its shape, proportions, " +
          "colours and details exactly, but draw it in the style of this video."
        : "",
      "The object belongs in the same world as the characters: natural materials and believable proportions, drawn with " +
        "the same level of realism — never a clay, plasticine or plastic toy version of it.",
    ].filter(Boolean).join(" ");

    const result = await generateImageWithStyle({
      prompt: buildIllustrationPrompt(brief, body.styleId ?? "flat-vector", body.language ?? null),
      format: "16:9",
      visualStyle: null,
      seed: typeof body.seed === "number" ? body.seed : undefined,
      ingredientUrls: [castblad, ...portretten, voorbeeld].filter(Boolean),
      extraContext: [illustratieContext(body.illustrationBrief), lookRegels].filter(Boolean).join(" "),
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
