// EEN PLEK TEKENEN: DRIE KEER DEZELFDE PLEK.
//
// Eerst het totaalbeeld. Daarvan lezen we af wat deze plek herkenbaar maakt (de
// kenmerken), en met dat beeld als referentie tekenen we de andere varianten: de plek
// van halverwege en een hoekje van dichtbij. Zo kan de camera in de video variëren
// zonder dat de plek verandert.
//
// De kenmerken worden van het BEELD afgelezen en niet uit de omschrijving overgenomen:
// wat de gebruiker intikte is een wens, wat er getekend staat is wat de rest van de
// video moet volgen. Dezelfde reden waarom het uiterlijk van een personage van zijn
// tekening wordt afgelezen (zie uiterlijk-uit-blad.ts).
import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImageWithStyle } from "@/lib/image-gen";
import { DIALOOG_CREDITS } from "@/lib/infographics/dialoog-credits";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { buildIllustrationPrompt } from "@/lib/infographics/story-style";
import { illustratieContext, STIJL_VAST } from "@/lib/infographics/dialogue-staging";
import { zonderTekst } from "@/lib/infographics/dialogue-beeldtekst";
import { kenmerkenUitBeeld, plekKlopt } from "@/lib/infographics/omgeving-controle";
import {
  omgevingBrief, OMGEVING_VARIANTEN, type OmgevingVariant, type OmgevingVariantSoort,
} from "@/lib/infographics/omgeving";
import { deductCredits, addCredits } from "@/lib/credits";
import type { InfographicFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  naam?: string;
  beschrijving?: string;
  /** Al bekende kenmerken (bij opnieuw tekenen van één variant). */
  kenmerken?: string[];
  /** Welke varianten getekend moeten worden; leeg = alle drie. */
  soorten?: OmgevingVariantSoort[];
  /** Het totaalbeeld dat er al is; dan hoeft dat niet opnieuw. */
  hoofdbeeldUrl?: string;
  styleId?: string;
  format?: InfographicFormat;
  language?: string;
  seed?: number;
  illustrationBrief?: string;
  /** Dezelfde plek in een andere tekenstijl: alleen als voorbeeld voor vorm en kleur. */
  voorbeeldUrl?: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Body;
    const naam = (body.naam ?? "").trim();
    const beschrijving = (body.beschrijving ?? "").trim();
    if (!beschrijving) return NextResponse.json({ error: "Geen omschrijving van de plek" }, { status: 400 });

    const styleId = body.styleId ?? "flat-vector";
    const format: InfographicFormat = body.format ?? "16:9";
    const gevraagd = (Array.isArray(body.soorten) && body.soorten.length
      ? body.soorten.filter((s): s is OmgevingVariantSoort => (OMGEVING_VARIANTEN as readonly string[]).includes(s))
      : [...OMGEVING_VARIANTEN]);

    // Voorbereiding voor het storyboard, dus gratis (dialoog-credits.ts).
    const credit = await deductCredits(user.id, DIALOOG_CREDITS.VOORBEREIDING, "Omgeving tekenen");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: DIALOOG_CREDITS.VOORBEREIDING },
        { status: 402 },
      );
    }

    try {
      let kenmerken = Array.isArray(body.kenmerken) ? body.kenmerken.map(String).filter(Boolean).slice(0, 6) : [];
      const varianten: OmgevingVariant[] = [];
      const voorbeeld = (body.voorbeeldUrl ?? "").trim();

      const teken = async (soort: OmgevingVariantSoort, referentie: string | null) => {
        const beeld = await generateImageWithStyle({
          prompt: buildIllustrationPrompt(
            omgevingBrief({ naam, beschrijving, kenmerken }, soort),
            styleId,
            body.language ?? null,
            "omgeving",
          ),
          format,
          visualStyle: null,
          // Zonder seed bij een herkansing: dezelfde seed geeft grofweg hetzelfde beeld.
          seed: typeof body.seed === "number" ? body.seed : undefined,
          // Het totaalbeeld is de bron van de andere varianten: dat moet exact
          // overgenomen worden, dus als "merk"-referentie en niet als personage.
          brandUrls: [referentie ?? "", !referentie ? voorbeeld : ""].filter(Boolean),
          extraContext: [
            illustratieContext(body.illustrationBrief),
            referentie
              ? "The reference image shows THIS SAME PLACE. Keep it identical: the same ground, sky, buildings, " +
                "trees, walls and objects, in the same colours and the same positions relative to each other. " +
                "Only the camera has moved. Do not add new landmarks and do not leave out the ones you can see."
              : voorbeeld
                ? "The reference image shows this same place drawn in a DIFFERENT art style. Take the layout, the " +
                  "shapes and the colours from it, but draw it fully in the art style of this video."
                : "",
            STIJL_VAST,
          ].filter(Boolean).join(" ").trim() || undefined,
        });
        // In de dialoogmodus hoort er geen tekst in beeld; wat het model erbij tekent is verhaspeld.
        return await zonderTekst(await persistFalAssetSoft(supabase, user.id, beeld.imageUrl, "image"), format, body.language);
      };

      // ---------- Het totaalbeeld: de bron voor de rest ----------
      let hoofd = (body.hoofdbeeldUrl ?? "").trim();
      if (!hoofd || gevraagd.includes("totaal")) {
        hoofd = await teken("totaal", null);
        varianten.push({ soort: "totaal", url: hoofd });
      }
      if (!kenmerken.length) {
        kenmerken = await kenmerkenUitBeeld(hoofd, beschrijving);
        console.log(`[omgeving-tekenen] "${naam}" kenmerken: ${kenmerken.join("; ") || "(geen)"}`);
      }

      // ---------- De andere varianten, met het totaalbeeld als referentie ----------
      for (const soort of gevraagd.filter((s) => s !== "totaal")) {
        let url = await teken(soort, hoofd);
        // Speelt dit beeld nog op dezelfde plek? Niet vragen of het lijkt — kijken welke
        // herkenningspunten erin staan. Komt er geen enkele terug, dan is het een andere
        // plek geworden en proberen we het één keer opnieuw.
        if (kenmerken.length) {
          const oordeel = await plekKlopt(url, kenmerken);
          if (oordeel && oordeel.gezien.length === 0) {
            console.warn(`[omgeving-tekenen] variant "${soort}" van "${naam}" herkende niets van de plek; opnieuw`);
            url = await teken(soort, hoofd);
          }
        }
        varianten.push({ soort, url });
      }

      return NextResponse.json({ varianten, kenmerken });
    } catch (e) {
      await addCredits(user.id, DIALOOG_CREDITS.VOORBEREIDING, "Refund: omgeving tekenen").catch(() => {});
      throw e;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("omgeving-tekenen failed:", msg);
    return NextResponse.json({ error: "De plek tekenen is mislukt", detail: msg }, { status: 500 });
  }
}
