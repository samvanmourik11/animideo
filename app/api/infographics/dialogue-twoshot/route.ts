import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImageWithStyle } from "@/lib/image-gen";
import { DIALOOG_CREDITS } from "@/lib/infographics/dialoog-credits";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { buildIllustrationPrompt } from "@/lib/infographics/story-style";
import {
  buildTwoShotBrief, illustratieContext, iederEenKeer, voorwerpRegie, wereldRegie, MODELBLAD_UITLEG, STIJL_VAST,
} from "@/lib/infographics/dialogue-staging";
import { isLichtsoort, type Lichtsoort } from "@/lib/infographics/verhaal-licht";
import { zonderTekst } from "@/lib/infographics/dialogue-beeldtekst";
import { beoordeelBeeld } from "@/lib/infographics/dialogue-verify";
import { MAX_CAST, type DialogueCastMember, type DialogueVoorwerp } from "@/lib/infographics/dialogue-schema";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
import type { InfographicFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  setting?: string;
  /** De hoeveelste scène dit is. Bepaalt het camerastandpunt (zie kaderVoorScene). */
  sceneIndex?: number;
  /** Het licht in deze scène (dag, nacht, kaarslicht…). Zie verhaal-licht.ts. */
  licht?: Lichtsoort | null;
  /** Hoe het gebied er in elk beeld uitziet. Zie DialogueScene.wereld. */
  wereld?: string | null;
  cast?: DialogueCastMember[];
  styleId?: string;
  format?: InfographicFormat;
  language?: string;
  seed?: number;
  // Vrije regieaanwijzing van de gebruiker, geldt voor elk beeld in de video.
  illustrationBrief?: string;
  castSheetUrl?: string;
  /**
   * Wat de gebruiker in het storyboard over dit beeld zei. Zie
   * DialogueScene.beeldAanwijzing.
   */
  aanwijzing?: string;
  /** Vaste voorwerpen die in deze scène voorkomen. Zie voorwerpenInScene. */
  voorwerpen?: DialogueVoorwerp[];
  /** Zitten ze bij het begin van de scène? Zie zitHouding. */
  zit?: boolean;
}

// Het beeld van de plek van één scène: de cast op die plek. In het storyboard is
// dit de controle of plek en personages kloppen, voordat de beelden per regel
// getekend worden (zie dialogue-line).
//
// Bewust GEEN Seedance-beweging hier: dit beeld komt zelf niet in de video.
/**
 * Is dit beeld onbruikbaar, of heeft het alleen een smetje?
 *
 * Een gesplitst beeld, een vreemde erbij of het castblad als voorwerp in de
 * scène zijn geen schoonheidsfoutjes: zulke beelden kun je niet in een video
 * zetten. Daar is een extra poging het waard; voor de rest niet.
 */
function onbruikbaar(fouten: string[]): boolean {
  const tekst = fouten.join(" ").toLowerCase();
  // Een ontbrekend of dubbel personage hoort erbij: wie hier ontbreekt, ontbreekt
  // ook in het storyboard dat de gebruiker moet beoordelen.
  return /verdeeld|panel|naast elkaar|onder elkaar|naad|twee tafere|extra |niet in de lijst|omstander|portret|kaartje|poster|ontbreekt|twee keer/.test(tekst);
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
    // Model sheet gaat vóór het portret: die toont het personage van meerdere
    // kanten, wat een scenebeeld met een eigen camerastandpunt nodig heeft.
    // Met meer personages in beeld liever het portret: een model sheet toont iemand
    // drie keer, en drie sheets plus het castblad zijn twaalf getekende figuren voor
    // een beeld waar er drie in horen. Dat is precies waar de dubbele Lilly vandaan komt.
    const portretten = cast
      .map((c) => (cast.length === 1 ? c.modelSheetUrl || c.portraitUrl : c.portraitUrl || c.modelSheetUrl))
      .filter((u): u is string => !!u);
    // Eén personage is genoeg. Dit heette het "twee-shot" omdat elke scene twee
    // pratende mensen naast elkaar toonde, maar sinds de camerakaders bestaat een
    // scene waarin één personage alleen in beeld is — een close-up, iemand alleen
    // in een bos. Die scenes kwamen op één portret uit en werden hier geweigerd,
    // waardoor zeven van de acht scenes stukliepen.
    if (portretten.length < 1) {
      return NextResponse.json({ error: "Minstens één personage met een afbeelding nodig" }, { status: 400 });
    }

    const format = (body.format === "9:16" ? "9:16" : "16:9") as InfographicFormat;
    const styleId = body.styleId ?? "flat-vector";

    // Het storyboard kost één credit per scène: dit plekbeeld plus de beelden van alle
    // zinnen, die daarna gratis meekomen. Zie dialoog-credits.ts.
    const credit = await deductCredits(user.id, DIALOOG_CREDITS.SCENE, "Dialoog: storyboard scène");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: DIALOOG_CREDITS.SCENE },
        { status: 402 }
      );
    }

    // Een afgekeurde poging maken we op eigen kosten opnieuw (DIALOOG_CREDITS.HERKANSING).
    let besteedExtra = 0;

    // GEEN eerder plekbeeld meer als voorbeeld: niet als anker, niet als "zelfde
    // plek" en niet voor het licht. Een beeld dat een eerder gemaakt beeld meekrijgt,
    // komt terug als kopie met een harde, overbelichte afwerking. In het bosverhaal
    // was het plekbeeld van scène 2 exact dat van scène 1, maar fel en overscherp,
    // en zo elke scène daarna. Zonder zo'n voorbeeld kwam dezelfde scène twee keer
    // zacht en natuurlijk terug, net als het eerste beeld. Wie er staat komt uit
    // portretten en castblad, de plek uit de omschrijving, het bos uit de wereld.
    const aanwijzing = (body.aanwijzing ?? "").trim().slice(0, 500);
    const brief = buildTwoShotBrief(
      setting,
      cast,
      typeof body.sceneIndex === "number" ? body.sceneIndex : 0,
      false,
      isLichtsoort(body.licht) ? body.licht : null,
      body.zit === true,
    );
    const voorwerpen = (Array.isArray(body.voorwerpen) ? body.voorwerpen : [])
      .filter((v) => typeof v?.naam === "string" && typeof v?.uiterlijk === "string")
      .slice(0, 2);
    const voorwerpBladen = voorwerpen.map((v) => (v.bladUrl ?? "").trim()).filter(Boolean);
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
        "sheet is taller here, by the same amount. Do not restyle or re-age anyone; their ages in the story " +
        "never change their heights. " +
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

    // Wie er in beeld mag staan. De cast is de cast; achtergrondfiguren maken van
    // de hoofdpersonen figuranten in hun eigen scene.
    const namen = cast.map((c) => c.name).join(" and ");
    const alleenDezeMensen =
      `This scene contains EXACTLY ${cast.length} ${cast.length === 1 ? "person" : "people"}: ${namen}. ` +
      `Do not add another person - no extra adults, no children, no bystanders, no background figures, ` +
      `not even partially visible or out of focus. Nobody from the reference images appears twice. ` +
      iederEenKeer(cast.map((c) => c.name));

    // Een fout in dit beeld zie je in het storyboard, en dat is precies waar hij
    // hoort op te vallen. In een test stonden de kinderen tot hun middel ín een
    // rivier — het soort fout dat één keer tegenhouden goedkoper is dan later repareren.
    let twoShotUrl: string | null = null;
    let fouten: string[] = [];
    let beste: { url: string; fouten: string[]; ernst: number } | null = null;
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
        // De voorwerpbladen staan bij het castblad: dezelfde soort referentie, iets
        // wat exact overgenomen moet worden.
        brandUrls: [castblad, ...voorwerpBladen].filter(Boolean),
        extraContext: [
          illustratieContext(body.illustrationBrief),
          castbladInstructie,
          cast.length === 1 && cast[0].modelSheetUrl ? MODELBLAD_UITLEG : "",
          alleenDezeMensen,
          // Hetzelfde bos in elk beeld, en dezelfde look: zie wereldRegie en STIJL_VAST.
          wereldRegie(body.wereld),
          STIJL_VAST,
          voorwerpRegie(voorwerpen),
          // Na de vaste regels, zodat de aanwijzing over DIT beeld gaat en niet
          // de personages of de tekenstijl kan omgooien.
          aanwijzing
            ? `The user looked at an earlier version of this scene and asked for this change (it may be written in Dutch): "${aanwijzing}". Apply it, but keep the characters, their looks and the drawing style exactly as described above.`
            : "",
          fouten.length
            ? `The previous attempt was rejected for these mistakes — avoid them: ${fouten.join("; ")}.`
            : "",
        ].filter(Boolean).join(" ").trim() || undefined,
      });
      const kandidaat = await persistFalAssetSoft(supabase, user.id, result.imageUrl, "image");

      // Alleen de fysieke controle: er praat op een twee-shot nog niemand.
      const oordeel = await beoordeelBeeld(kandidaat, null, cast, { iedereenZichtbaar: true });
      fouten = oordeel.fouten;
      const ernst = (onbruikbaar(fouten) ? 10 : 0) + fouten.length;
      if (!beste || ernst < beste.ernst) beste = { url: kandidaat, fouten, ernst };
      // Bij de laatste poging nemen we wat we hebben: een scène zonder beeld
      // levert helemaal geen storyboard op, en dat is erger dan een beeld met een smetje.
      // Wel het minst foute beeld, niet zomaar het laatste.
      const stop = fouten.length === 0
        || poging === MAX_POGINGEN
        || (poging === 2 && !onbruikbaar(fouten));
      if (stop) {
        const keuze = fouten.length === 0 ? { url: kandidaat, fouten } : beste;
        fouten = keuze.fouten;
        twoShotUrl = await zonderTekst(keuze.url, format, body.language);
      } else {
        console.warn(`[dialogue-twoshot] afgekeurd (poging ${poging}): ${fouten.join("; ")}`);
        besteedExtra += DIALOOG_CREDITS.HERKANSING;
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
