import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImageWithStyle } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { buildIllustrationPrompt } from "@/lib/infographics/story-style";
import { buildTwoShotBrief, illustratieContext } from "@/lib/infographics/dialogue-staging";
import { beoordeelBeeld } from "@/lib/infographics/dialogue-verify";
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
  castSheetUrl?: string;
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

    // Een afgekeurde poging is wél gemaakt en wordt dus wél afgerekend.
    let besteedExtra = 0;

    const brief = buildTwoShotBrief(setting, cast);
    const anker = (body.anchorTwoShotUrl ?? "").trim();
    const castblad = (body.castSheetUrl ?? "").trim();
    // Het castblad gaat als "merk-referentie" mee: dat is de enige categorie die
    // vooraan in de rij staat en het zwaarst weegt. Precies wat we willen — de
    // personages moeten hier exact van overgenomen worden, ook hun onderlinge
    // lengte, terwijl de omgeving per scène verschilt.
    const castbladInstructie = castblad
      ? " One reference image is a CHARACTER LINE-UP SHEET showing every character in this video standing " +
        "side by side, full body. That sheet defines exactly what these people look like AND how tall they " +
        "are relative to each other. Copy them from it precisely: the same faces, hair, clothing, colours, " +
        "body build and — this matters — the same height difference between them. Whoever is taller on the " +
        "sheet is taller here, by the same amount. Do not restyle or re-age anyone."
      : "";
    const ankerInstructie = anker
      ? " A reference image of these SAME two people from an earlier scene in this same video is provided. " +
        "Keep the characters identical to that image — same faces, hair, clothing, colours, drawing style, and " +
        "the same body heights relative to each other (whoever is taller there stays taller here, by the same " +
        "amount) — and keep them standing in the same left/right arrangement. ONLY the surroundings change to " +
        "the new location described above."
      : "";

    // Het twee-shot is het ANKER van de scène: elk bronbeeld erin is een bewerking
    // hiervan. Een fout hier plant zich dus voort over alle regels van die scène,
    // terwijl de controle tot nu toe pas op die bewerkingen stond. In een test
    // stonden de kinderen tot hun middel ín een rivier — precies het soort fout
    // dat één keer tegenhouden goedkoper is dan drie keer repareren.
    let twoShotUrl: string | null = null;
    let fouten: string[] = [];
    for (let poging = 1; poging <= 2 && twoShotUrl === null; poging++) {
      const result = await generateImageWithStyle({
        // true = met omgeving. Zonder dit kwam elk gesprek op een leeg wit vlak
        // terecht, want het standaardkader van de infographic-tool poetst de plek weg.
        prompt: buildIllustrationPrompt(brief, styleId, body.language ?? null, "omgeving"),
        format,
        visualStyle: null,
        // Bij een herkansing geen seed: dezelfde seed geeft grofweg hetzelfde
        // (foute) beeld terug en dan betalen we voor niets.
        seed: poging === 1 && typeof body.seed === "number" ? body.seed : undefined,
        // De portretten leveren de identiteit; de brief bepaalt houding en kader.
        // Zonder castblad blijven de portretten de identiteitsbron (oudere
        // projecten hebben er nog geen).
        characterUrls: castblad ? undefined : portretten,
        brandUrls: castblad ? [castblad] : undefined,
        // Het anker uit scène 1 houdt cast én look gelijk over alle scènes heen.
        ingredientUrls: anker ? [anker] : undefined,
        extraContext: [
          illustratieContext(body.illustrationBrief),
          castbladInstructie,
          ankerInstructie,
          fouten.length
            ? `The previous attempt was rejected for these mistakes — avoid them: ${fouten.join("; ")}.`
            : "",
        ].filter(Boolean).join(" ").trim() || undefined,
      });
      const kandidaat = await persistFalAssetSoft(supabase, user.id, result.imageUrl, "image");

      // Alleen de fysieke controle: er praat op een twee-shot nog niemand.
      const oordeel = await beoordeelBeeld(kandidaat, null, cast);
      fouten = oordeel.fouten;
      // Bij de laatste poging nemen we wat we hebben: een scène zonder anker
      // levert helemaal geen beelden op, en dat is erger dan een beeld met een smetje.
      if (fouten.length === 0 || poging === 2) twoShotUrl = kandidaat;
      else {
        console.warn(`[dialogue-twoshot] afgekeurd (poging ${poging}): ${fouten.join("; ")}`);
        besteedExtra += CREDIT_COSTS.IMAGE_GENERATION;
      }
    }

    if (besteedExtra > 0) {
      await deductCredits(user.id, besteedExtra, "Dialoog twee-shot (herkansing)");
    }

    return NextResponse.json({ twoShotUrl, beeldWaarschuwingen: fouten.length ? fouten : null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-twoshot failed:", msg);
    return NextResponse.json({ error: "Twee-shot maken mislukt", detail: msg }, { status: 500 });
  }
}
