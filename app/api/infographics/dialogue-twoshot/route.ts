import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImageWithStyle } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { buildIllustrationPrompt } from "@/lib/infographics/story-style";
import { buildTwoShotBrief, illustratieContext } from "@/lib/infographics/dialogue-staging";
import { zonderTekst } from "@/lib/infographics/dialogue-beeldtekst";
import { beoordeelBeeld } from "@/lib/infographics/dialogue-verify";
import { MAX_CAST, type DialogueCastMember } from "@/lib/infographics/dialogue-schema";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
import type { InfographicFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  setting?: string;
  /** De hoeveelste scène dit is. Bepaalt het camerastandpunt (zie kaderVoorScene). */
  sceneIndex?: number;
  /**
   * Een eerder beeld van DEZELFDE plek. Speelt scène 5 weer in oma's woonkamer,
   * dan hoort dat dezelfde kamer te zijn — eerder werd het elke keer een andere
   * kamer met een andere bank en de open haard aan een andere muur.
   */
  locationRefUrl?: string;
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
/**
 * Is dit beeld onbruikbaar, of heeft het alleen een smetje?
 *
 * Een gesplitst beeld, een vreemde erbij of het castblad als voorwerp in de
 * scène zijn geen schoonheidsfoutjes: zulke beelden kun je niet in een video
 * zetten. Daar is een extra poging het waard; voor de rest niet.
 */
function onbruikbaar(fouten: string[]): boolean {
  const tekst = fouten.join(" ").toLowerCase();
  return /verdeeld|panel|naast elkaar|onder elkaar|naad|twee tafere|extra |niet in de lijst|omstander|portret|kaartje|poster/.test(tekst);
}

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

    const locatieRef = (body.locationRefUrl ?? "").trim();
    const brief = buildTwoShotBrief(
      setting,
      cast,
      typeof body.sceneIndex === "number" ? body.sceneIndex : 0,
      !!locatieRef,
    );
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
        "sheet is taller here, by the same amount. Do not restyle or re-age anyone. " +
        // Zonder deze laatste zin neemt het model niet alleen de PERSONEN maar ook
        // de OPSTELLING van het blad over: in een kerstvideo leverde dat een beeld
        // op dat in twee panelen was gedeeld met een naad in het midden, en een
        // ander waarin de portretkaartjes van het blad als ingelijste voorwerpen
        // tussen de cadeaus onder de boom stonden. Het blad zegt WIE, niet HOE.
        "The sheet tells you WHO these people are, nothing else. Do NOT copy its layout: this is a single " +
        "scene in one location, never a split screen, never side-by-side panels, never a row of portraits, " +
        "and never a plain studio background. Do not draw the sheet itself, or any framed portrait, card or " +
        "poster of these characters, as an object inside the scene."
      : "";
    const locatieInstructie = locatieRef
      ? " One reference image shows THIS SAME LOCATION earlier in the video. The room, furniture, walls, " +
        "floor, colours and decorations must match it exactly — same sofa, same tree, same fireplace, in the " +
        "same places. Only the camera position and the characters' poses differ."
      : "";
    const ankerInstructie = anker
      ? " A reference image of these SAME two people from an earlier scene in this same video is provided. " +
        "Keep the characters identical to that image — same faces, hair, clothing, colours, drawing style, and " +
        "the same body heights relative to each other (whoever is taller there stays taller here, by the same " +
        "amount) — and keep them standing in the same left/right arrangement. ONLY the surroundings change to " +
        "the new location described above."
      : "";

    // Wie er in beeld mag staan. De cast is de cast; achtergrondfiguren maken van
    // de hoofdpersonen figuranten in hun eigen scene.
    const namen = cast.map((c) => c.name).join(" and ");
    const alleenDezeMensen =
      `This scene contains EXACTLY ${cast.length} ${cast.length === 1 ? "person" : "people"}: ${namen}. ` +
      `Do not add another person - no extra adults, no children, no bystanders, no background figures, ` +
      `not even partially visible or out of focus. Nobody from the reference images appears twice.`;

    // Het twee-shot is het ANKER van de scène: elk bronbeeld erin is een bewerking
    // hiervan. Een fout hier plant zich dus voort over alle regels van die scène,
    // terwijl de controle tot nu toe pas op die bewerkingen stond. In een test
    // stonden de kinderen tot hun middel ín een rivier — precies het soort fout
    // dat één keer tegenhouden goedkoper is dan drie keer repareren.
    let twoShotUrl: string | null = null;
    let fouten: string[] = [];
    // Twee pogingen, en een derde als de tweede nog een ONBRUIKBAAR beeld gaf.
    // Een gesplitst beeld of een vreemde erbij is niet "een smetje" maar een
    // scène die je niet kunt gebruiken; die accepteren omdat de teller op is,
    // verpest de hele video. Kleine fouten nemen we na twee pogingen wel.
    const MAX_POGINGEN = 3;
    for (let poging = 1; poging <= MAX_POGINGEN && twoShotUrl === null; poging++) {
      const result = await generateImageWithStyle({
        // true = met omgeving. Zonder dit kwam elk gesprek op een leeg wit vlak
        // terecht, want het standaardkader van de infographic-tool poetst de plek weg.
        prompt: buildIllustrationPrompt(brief, styleId, body.language ?? null, "omgeving"),
        format,
        visualStyle: null,
        // Bij een herkansing geen seed: dezelfde seed geeft grofweg hetzelfde
        // (foute) beeld terug en dan betalen we voor niets.
        seed: poging === 1 && typeof body.seed === "number" ? body.seed : undefined,
        // De portretten gaan ALTIJD mee, ook als er een castblad is. Het castblad
        // toont iedereen ten voeten uit en is daardoor zwak op het gezicht: het
        // haar van een personage veranderde per scène van volume en vorm. Het
        // portret is juist een close-up van precies dat. Ze vullen elkaar aan —
        // castblad voor lengte en kleding, portret voor gezicht en haar — en er
        // is ruimte voor allebei in het referentiebudget.
        characterUrls: portretten,
        brandUrls: castblad ? [castblad] : undefined,
        // Het anker uit scène 1 houdt cast én look gelijk over alle scènes heen.
        // Het anker houdt de personages gelijk, de locatiereferentie de kamer.
        ingredientUrls: [locatieRef, anker].filter(Boolean),
        extraContext: [
          illustratieContext(body.illustrationBrief),
          castbladInstructie,
          ankerInstructie,
          locatieInstructie,
          alleenDezeMensen,
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
      const stop = fouten.length === 0
        || poging === MAX_POGINGEN
        || (poging === 2 && !onbruikbaar(fouten));
      if (stop) twoShotUrl = await zonderTekst(kandidaat, format, body.language);
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
