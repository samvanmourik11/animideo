import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImageWithStyle, editIllustration, cleanupSceneIllustration, cleanupFlatGraphic } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { buildIllustrationPrompt, STYLE_MATCH_ANCHOR, brandPaletteHint, REFERENCE_PHOTO_GUIDANCE, castRefGuidance, castGuidance, CAST_SHEET_GUIDANCE } from "@/lib/infographics/story-style";
import { castRefsVanSpec, MAX_CAST_REFS, type StoryCastMember, type StoryCastRef } from "@/lib/infographics/story-schema";
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

    const plan = await planSceneChat({
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
      let rawUrl: string;
      if (plan.action === "edit" && source) {
        // Gerichte bewerking: compositie en stijl blijven, alleen de gevraagde
        // wijziging. De referentiefoto gaat als extra ingredient mee.
        // Ook een bewerking moet Nederlandse dingen Nederlands houden: "maak er
        // een rijbewijs bij" levert anders alsnog een Amerikaans pasje op.
        const kennis = nlBeeldkennis(body.language, plan.instruction, plan.labels.join(" "));
        const result = await editIllustration(
          source,
          kennis ? `${plan.instruction} ${kennis}` : plan.instruction,
          format,
          referencePhoto ? [referencePhoto] : null
        );
        rawUrl = result.imageUrl;
      } else {
        // Nieuw beeld vanaf de (herschreven) briefing, met dezelfde seed, anker,
        // personage en huisstijl als de rest van het verhaal.
        const anchor = body.anchorImageUrl?.trim() || null;
        const paletteHint = brandPaletteHint(body.brandColors?.primary, body.brandColors?.accent);
        const castSheet = body.castSheetUrl?.trim() || null;
        // De zelf gekozen personages, met de oude enkel-personage-velden als
        // terugval zodat een bestaand verhaal zijn mascotte houdt.
        const castRefs = castRefsVanSpec({
          castRefs: body.castRefs ?? null,
          characterUrl: body.characterUrl ?? null,
          characterRole: body.characterRole ?? null,
        }).slice(0, MAX_CAST_REFS);
        const extraContext = [
          nlBeeldkennis(body.language, plan.illustration, plan.labels.join(" ")),
          paletteHint,
          castGuidance(body.cast, body.castNames),
          castSheet ? CAST_SHEET_GUIDANCE : "",
          referencePhoto ? REFERENCE_PHOTO_GUIDANCE : "",
          castRefGuidance(castRefs),
          anchor ? STYLE_MATCH_ANCHOR : "",
        ].filter(Boolean).join(" ").trim() || undefined;
        // Portretten in het character-slot (identiteit), het anker en een
        // meegestuurde foto als ingredient (stijl resp. onderwerp).
        const ingredientUrls = [referencePhoto, anchor].filter((u): u is string => !!u);
        const result = await generateImageWithStyle({
          prompt: buildIllustrationPrompt(plan.illustration, body.styleId, body.language, kader, plan.labels),
          format,
          visualStyle: null,
          seed: typeof body.seed === "number" ? body.seed : undefined,
          brandUrls: castSheet ? [castSheet] : undefined,
          characterUrls: castRefs.length ? castRefs.map((r) => r.url) : undefined,
          ingredientUrls: ingredientUrls.length ? ingredientUrls : undefined,
          extraContext,
        });
        rawUrl = result.imageUrl;
        // Tweede pass: zwevende rommel wegvegen met behoud van de omgeving.
        try {
          rawUrl = body.mode === "overheid"
            ? (await cleanupFlatGraphic(rawUrl, format, plan.labels)).imageUrl
            : (await cleanupSceneIllustration(rawUrl, format, plan.labels)).imageUrl;
        } catch (e) {
          console.error("[scene-chat] cleanup mislukt, ruw beeld behouden:", e);
        }
      }

      // Tekst en merktekens controleren — ook na een bewerking, want een edit kan
      // een woord net zo goed verminken of een logo bijtekenen als een generatie.
      try {
        // Stuurde de gebruiker een logo of product mee, dan hoort dat merk in beeld
        // en mag de controle het niet weghalen.
        rawUrl = (await borgBeeldtekst(rawUrl, plan.labels, format, body.language, !!referencePhoto)).imageUrl;
      } catch (e) {
        console.error("[scene-chat] tekstcontrole mislukt:", e);
      }
      const imageUrl = await persistFalAssetSoft(supabase, user.id, rawUrl, "image");
      return NextResponse.json({
        action: plan.action,
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
