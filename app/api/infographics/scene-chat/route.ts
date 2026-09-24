import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImageWithStyle, editIllustration, cleanupSceneIllustration, cleanupFlatGraphic } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { beeldAlsDataUrl } from "@/lib/infographics/beeld-inline";
import { isIndelingsAanwijzing, scherpereInstructie } from "@/lib/infographics/beeld-aanwijzing";
import { controleerAanwijzing } from "@/lib/infographics/aanwijzing-controle";
import { visualStyleVan, buildIllustrationPrompt, STYLE_MATCH_ANCHOR, brandPaletteHint, REFERENCE_PHOTO_GUIDANCE, castRefGuidance, castGuidance, CAST_SHEET_GUIDANCE, GEEN_CAST_IN_SCENE } from "@/lib/infographics/story-style";
import { castRefsVanSpec, castRefsVoorScene, MAX_CAST_REFS, type StoryCastMember, type StoryCastRef, type StoryVoorwerp, type StoryOmgeving } from "@/lib/infographics/story-schema";
import { voorwerpRegie } from "@/lib/infographics/dialogue-staging";
import { omgevingRegie } from "@/lib/infographics/omgeving";
import { planSceneChat, planLayoutChat } from "@/lib/infographics/scene-chat";
import { ICOON_SLEUTELS, icoonKeuzelijst, type OverheidLayout } from "@/lib/infographics/overheid-scene";
import { borgBeeldtekst } from "@/lib/infographics/tekst-controle";
import { nlBeeldkennis } from "@/lib/infographics/nl-beeldkennis";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import type { InfographicFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// De beeld-chat van één scene. De gebruiker typt in gewone taal wat er anders
// moet en stuurt daar eventueel een foto bij (het échte logo, product of object).
// Deze route bepaalt wat die wens betekent — het beeld bijwerken, het beeld
// opnieuw tekenen, of niets — en voert dat meteen uit.
//
// Credits worden pas afgetrokken als er daadwerkelijk een beeld gemaakt wordt, en
// teruggestort als dat alsnog misgaat. Een vraag die niet over het beeld gaat
// kost dus niets.
interface Body {
  message?: string;
  // Bij dit bericht meegestuurde referentiefoto (al geüpload, publieke URL).
  photoUrl?: string | null;
  // Huidige staat van de scene.
  illustration?: string;
  // Woorden die nu in beeld staan; de chat mag ze aanpassen.
  labels?: string[] | null;
  sourceImageUrl?: string | null;
  // Eerder aan deze scene gehangen referentiefoto (blijft gelden bij regeneratie).
  referencePhotoUrl?: string | null;
  // Eerdere beurten, oudste eerst — context voor "en nu iets groter".
  history?: { role?: string; text?: string }[];
  format?: InfographicFormat;
  // Beeldmodus van het verhaal: "overheid" tekent diagrammen op een leeg vlak.
  mode?: "story" | "report" | "overheid";
  // Huidige opbouw van een zelfgetekende scene (overheidsmodus).
  layout?: OverheidLayout | null;
  voiceover?: string | null;
  // Consistentie met de rest van het verhaal.
  seed?: number | null;
  anchorImageUrl?: string | null;
  styleId?: string;
  language?: string;
  brandColors?: { primary?: string; accent?: string };
  characterUrl?: string | null;
  characterRole?: string | null;
  // De vaste cast van het verhaal + het castblad. Zonder deze twee tekent een
  // regeneratie via de chat weer een andere hoofdpersoon dan de rest van de video.
  cast?: StoryCastMember[] | null;
  castNames?: string[] | null;
  castSheetUrl?: string | null;
  // Beelden van de scenes eromheen, zodat "zoals in het vorige beeld" te volgen
  // is. De pagina stuurt er hooguit een paar mee.
  contextImages?: { label?: string; url?: string }[] | null;
  // De vaste voorwerpen en de plek van DEZE scene (de pagina filtert al).
  voorwerpen?: StoryVoorwerp[] | null;
  omgeving?: StoryOmgeving | null;
  // De zelf gekozen personages van dit verhaal (portret + rol). Alleen de mensen
  // die in DEZE scene staan gaan mee; de pagina filtert daar al op.
  castRefs?: StoryCastRef[] | null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Body;
    const message = (body.message ?? "").trim();
    if (!message) return NextResponse.json({ error: "Geen bericht" }, { status: 400 });

    const format = (body.format === "9:16" ? "9:16" : "16:9") as InfographicFormat;
    const kader = body.mode === "overheid" ? ("overheid" as const) : ("verhaal" as const);
    const source = body.sourceImageUrl?.trim() || null;
    const photo = body.photoUrl?.trim() || null;
    // Een nieuw meegestuurde foto is vanaf nu dé referentie van deze scene; is er
    // geen, dan geldt de foto die er al aan hing.
    const referencePhoto = photo || body.referencePhotoUrl?.trim() || null;

    // Zelfgetekende scene: dan is de wens een wijziging in de opbouw, niet in een
    // beeld. Geen beeldmodel, dus ook geen credits — en niets dat kan vervormen.
    if (body.layout) {
      const uitkomst = await planLayoutChat({
        message,
        layout: body.layout,
        voiceover: (body.voiceover ?? "").trim(),
        iconen: ICOON_SLEUTELS,
        icoonUitleg: icoonKeuzelijst(),
        history: (body.history ?? [])
          .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), text: (m.text ?? "").trim() }))
          .filter((m) => m.text.length > 0),
      });
      return NextResponse.json({
        action: uitkomst.layout ? "layout" : "none",
        reply: uitkomst.reply,
        layout: uitkomst.layout,
      });
    }

    // Het castblad houdt vast wie wie is; nodig in beide paden.
    const castSheet = body.castSheetUrl?.trim() || null;

    // De beelden zelf ophalen en verkleind meesturen: met alleen links moet OpenAI
    // ze zelf downloaden, en één trage download liet in de dialoogtool de hele
    // aanwijzing mislukken.
    const contextLijst = (body.contextImages ?? [])
      .map((c) => ({ label: (c?.label ?? "").trim(), url: (c?.url ?? "").trim() }))
      .filter((c) => c.url && c.url !== source)
      .slice(0, 4);
    if (castSheet) contextLijst.push({ label: "het castblad: zo horen de personages eruit te zien", url: castSheet });
    const [doelBeeld, ...contextIngeladen] = await Promise.all([
      source ? beeldAlsDataUrl(source, { maxZijde: 1024 }) : Promise.resolve(null),
      ...contextLijst.map((c) => beeldAlsDataUrl(c.url, { maxZijde: 512 })),
    ]);
    const contextBeelden = contextLijst
      .map((c, i) => ({ label: c.label || "een ander beeld uit deze video", beeld: contextIngeladen[i] }))
      .filter((c): c is { label: string; beeld: string } => !!c.beeld);

    const plan = await planSceneChat({
      doelBeeld,
      contextBeelden,
      message,
      brief: body.illustration ?? "",
      hasImage: !!source,
      hasPhoto: !!photo,
      mode: body.mode,
      labels: body.labels ?? [],
      cast: (body.cast ?? []).map((c) => ({ name: c.name, role: c.role, appearance: c.appearance })),
      history: (body.history ?? [])
        .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), text: (m.text ?? "").trim() }))
        .filter((m) => m.text.length > 0),
    });

    // Verplaatsen, groter/kleiner, iemand erbij of weg: dat kan een bewerking van
    // een bestaand plaatje niet (gemeten in de dialoogtool op 19-09-2026, commit
    // 63f88bc). Zulke wensen gaan naar het opnieuw tekenen, ook als de planner ze
    // klein noemt.
    if (plan.action === "edit" && isIndelingsAanwijzing(message, plan.instruction)) {
      plan.action = "regenerate";
      if (!plan.illustration) plan.illustration = [body.illustration ?? "", plan.instruction].filter(Boolean).join(" ");
    }

    // Geen beeldhandeling: alleen antwoorden, geen credits.
    if (plan.action === "none") {
      return NextResponse.json({ action: "none", reply: plan.reply });
    }

    const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Story scene-beeld (chat)");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
        { status: 402 }
      );
    }

    try {
      // Eén beeldpoging, in het pad dat bij de wens hoort. `scherper` is leeg bij
      // de eerste poging en bevat bij een herkansing wat er nog niet klopte.
      const maakBeeld = async (scherper: string): Promise<string> => {
        let rawUrl: string;
        if (plan.action === "edit" && source) {
          // Gerichte bewerking: compositie en stijl blijven, alleen de gevraagde
          // wijziging. De referentiefoto gaat als extra ingredient mee.
          // Ook een bewerking moet Nederlandse dingen Nederlands houden: "maak er
          // een rijbewijs bij" levert anders alsnog een Amerikaans pasje op.
          const kennis = nlBeeldkennis(body.language, plan.instruction, plan.labels.join(" "));
          const result = await editIllustration(
            source,
            [scherper || plan.instruction, kennis].filter(Boolean).join(" "),
            format,
            // Het castblad erbij: zonder een referentie van wie wie is, verandert een
            // bewerking geregeld een gezicht of een kledingstuk (zelfde reden als in
            // de dialoogtool, zie dialogue-aanwijzing).
            [referencePhoto, castSheet].filter((u): u is string => !!u),
            body.styleId,
            body.language
          );
          rawUrl = result.imageUrl;
        } else {
          // Nieuw beeld vanaf de (herschreven) briefing, met dezelfde seed, anker,
          // personage en huisstijl als de rest van het verhaal.
          const anchor = body.anchorImageUrl?.trim() || null;
          const paletteHint = brandPaletteHint(body.brandColors?.primary, body.brandColors?.accent);
          // De zelf gekozen personages, met de oude enkel-personage-velden als
          // terugval zodat een bestaand verhaal zijn mascotte houdt.
          const castRefs = castRefsVanSpec({
            castRefs: body.castRefs ?? null,
            characterUrl: body.characterUrl ?? null,
            characterRole: body.characterRole ?? null,
          }).slice(0, MAX_CAST_REFS);
          // Hoort de vaste cast in DEZE scene? Zelfde regel als bij het eerste
          // beeld (zie generate-story): het castblad ging ook hier onvoorwaardelijk
          // mee, dus één scene opnieuw laten tekenen haalde de Romeinen zo weer
          // terug in een scene over het heden. De pagina stuurt `castNames` mee;
          // is die leeg terwijl het verhaal wél een cast heeft, dan hoort hier
          // niemand van de cast in beeld.
          const castNamenHier = (body.castNames ?? []).filter(Boolean);
          const verhaalHeeftCast = (body.cast ?? []).length > 0 || castRefs.length > 0;
          const castInDezeScene = !verhaalHeeftCast || castNamenHier.length > 0;
          const refsHier = castInDezeScene ? castRefsVoorScene(castRefs, castNamenHier) : [];
          const bladHier = castInDezeScene ? castSheet : null;
          const extraContext = [
            nlBeeldkennis(body.language, plan.illustration, plan.labels.join(" ")),
            paletteHint,
            castInDezeScene ? castGuidance(body.cast, castNamenHier) : GEEN_CAST_IN_SCENE,
            bladHier ? CAST_SHEET_GUIDANCE : "",
            referencePhoto ? REFERENCE_PHOTO_GUIDANCE : "",
            castInDezeScene ? castRefGuidance(refsHier) : "",
            // Dezelfde regels als bij het eerste beeld: zonder deze twee komt een
            // opnieuw getekende scene terug op een ander kantoor.
            voorwerpRegie(
              (body.voorwerpen ?? []).map((v) => ({ naam: v.naam, uiterlijk: v.uiterlijk, bladUrl: v.bladUrl ?? null })),
              body.voiceover
            ),
            body.omgeving
              ? omgevingRegie({ beschrijving: body.omgeving.beschrijving, kenmerken: body.omgeving.kenmerken ?? [] })
              : "",
            anchor ? STYLE_MATCH_ANCHOR : "",
          ].filter(Boolean).join(" ").trim() || undefined;
          // Portretten in het character-slot (identiteit), het anker en een
          // meegestuurde foto als ingredient (stijl resp. onderwerp).
          const ingredientUrls = [referencePhoto, anchor].filter((u): u is string => !!u);
          const result = await generateImageWithStyle({
            prompt: [buildIllustrationPrompt(plan.illustration, body.styleId, body.language, kader, plan.labels), scherper].filter(Boolean).join(" "),
            format,
            // Zelfde stijlpack als bij het eerste beeld; anders valt een
            // bijgestuurd beeld terug naar een tekening (zie story-style.ts).
            visualStyle: visualStyleVan(body.styleId),
            seed: typeof body.seed === "number" ? body.seed : undefined,
            brandUrls: [
              (body.omgeving?.varianten ?? []).find((v) => v.url)?.url ?? "",
              bladHier ?? "",
              ...(body.voorwerpen ?? []).map((v) => v.bladUrl ?? ""),
            ].filter((u): u is string => !!u).slice(0, 3) || undefined,
            characterUrls: refsHier.length ? refsHier.map((r) => r.url) : undefined,
            ingredientUrls: ingredientUrls.length ? ingredientUrls : undefined,
            extraContext,
          });
          rawUrl = result.imageUrl;
          // Tweede pass: zwevende rommel wegvegen met behoud van de omgeving.
          try {
            rawUrl = body.mode === "overheid"
              ? (await cleanupFlatGraphic(rawUrl, format, plan.labels)).imageUrl
              : (await cleanupSceneIllustration(rawUrl, format, plan.labels, body.styleId)).imageUrl;
          } catch (e) {
            console.error("[scene-chat] cleanup mislukt, ruw beeld behouden:", e);
          }
        }

        // Tekst en merktekens controleren — ook na een bewerking, want een edit kan
        // een woord net zo goed verminken of een logo bijtekenen als een generatie.
        try {
          // Stuurde de gebruiker een logo of product mee, dan hoort dat merk in beeld
          // en mag de controle het niet weghalen.
          rawUrl = (await borgBeeldtekst(rawUrl, plan.labels, format, body.language, !!referencePhoto, body.styleId)).imageUrl;
        } catch (e) {
          console.error("[scene-chat] tekstcontrole mislukt:", e);
        }
        return rawUrl;
      };

      // IS DE WENS ÉCHT UITGEVOERD?
      //
      // Deze controle stond eerst alleen in de bewerk-tak. Een klant die om een
      // tekstballon of een tekst op een scherm vroeg, ging juist naar het opnieuw
      // tekenen (dat pad hoort bij "erbij zetten"), en daar keek niemand mee:
      // hij kreeg 13 keer een vinkje en 13 keer een credit van de rekening,
      // terwijl het scherm leeg bleef (gemeten 24-09-2026). Nu geldt de controle
      // voor beide paden, en pas ná de tekstcontrole — die kan de gevraagde tekst
      // er namelijk zelf weer uit halen.
      let rawUrl = await maakBeeld("");
      if (plan.controle) {
        const uitslag = await controleerAanwijzing(rawUrl, plan.controle).catch(() => null);
        if (uitslag && uitslag.ja === false) {
          const tweede = await maakBeeld(
            scherpereInstructie(plan.action === "edit" ? plan.instruction : plan.illustration, plan.controle, uitslag.waarom ?? "")
          ).catch(() => null);
          const naTweede = tweede ? await controleerAanwijzing(tweede, plan.controle).catch(() => null) : null;
          if (tweede && naTweede?.ja !== false) {
            rawUrl = tweede;
          } else {
            // Twee keer niet gelukt: credit terug en eerlijk zijn. Het oude beeld
            // blijft staan; een half gelukte aanpassing is erger dan geen.
            await addCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Refund: aanpassing lukte niet").catch(() => {});
            return NextResponse.json({
              action: "none",
              gelukt: false,
              reply: `Dit is twee keer geprobeerd, maar het staat er nog niet${uitslag.waarom ? ` (te zien was: ${uitslag.waarom})` : ""}. Probeer het anders te zeggen, of vraag om het beeld opnieuw te tekenen. Je credit is teruggestort.`,
            });
          }
        }
      }

      const imageUrl = await persistFalAssetSoft(supabase, user.id, rawUrl, "image");
      return NextResponse.json({
        action: plan.action,
        gelukt: true,
        reply: plan.reply,
        imageUrl,
        // Bij een regeneratie is de briefing herschreven; die moet de client
        // bewaren, anders valt een volgende regeneratie terug op de oude scène.
        illustration: plan.action === "regenerate" ? plan.illustration : undefined,
        labels: plan.labels,
        referencePhotoUrl: referencePhoto,
      });
    } catch (e) {
      // Beeld mislukt ná het afboeken: credits terug, anders betaalt de gebruiker
      // voor niets.
      await addCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Refund: scene-beeld (chat) mislukt").catch(() => {});
      throw e;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("scene-chat failed:", msg);
    return NextResponse.json({ error: "Beeld bijwerken mislukt", detail: msg }, { status: 500 });
  }
}
