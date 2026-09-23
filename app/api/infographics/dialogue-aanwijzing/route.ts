import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@/lib/openai";
import { bewerkBeeld } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { beeldAlsDataUrl } from "@/lib/infographics/beeld-inline";
import {
  aanwijzingContext, aanwijzingVraag, isIndelingsAanwijzing, leesOpDeGrond, leesControle, leesKader,
  scherpereInstructie, AANWIJZING_SCHEMA, AANWIJZING_SYSTEEM,
} from "@/lib/infographics/beeld-aanwijzing";
import { controleerAanwijzing } from "@/lib/infographics/aanwijzing-controle";
import { zetOpDeGrond } from "@/lib/infographics/schets-bewerking";
import { deductCredits, addCredits } from "@/lib/credits";
import { DIALOOG_CREDITS } from "@/lib/infographics/dialoog-credits";
import type { DialogueSpec } from "@/lib/infographics/dialogue-schema";

export const runtime = "nodejs";
export const maxDuration = 240;

interface Body {
  spec?: DialogueSpec;
  si?: number;
  li?: number;
  aanwijzing?: string;
}

// Een aanwijzing op één storyboardbeeld begrijpen met de rest van het storyboard erbij,
// en een kleine correctie meteen als bewerking van dat beeld uitvoeren. Zie
// beeld-aanwijzing.ts. Een grote wijziging gaat terug naar de pagina, die het shot
// opnieuw tekent met de precieze instructie.
//
// Het begrijpen kost geen credits (een kijkvraag, net als de beeldcontrole); de
// bewerking kost wat een beeld kost.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Body;
    const spec = body.spec;
    const si = typeof body.si === "number" ? body.si : -1;
    const li = typeof body.li === "number" ? body.li : -1;
    const aanwijzing = (body.aanwijzing ?? "").trim().slice(0, 500);
    const regel = spec?.scenes?.[si]?.lines?.[li];
    if (!spec || !regel || !aanwijzing) {
      return NextResponse.json({ error: "Geen shot of aanwijzing opgegeven" }, { status: 400 });
    }

    const doel = (regel.shotImageUrl ?? "").trim();
    // Zonder beeld valt er niets te vergelijken of te bewerken: dan tekent de pagina
    // het shot met de aanwijzing zoals die er staat.
    if (!doel) return NextResponse.json({ klein: false, begrepen: null, instructie: aanwijzing });

    // De beelden halen we zelf op en sturen ze verkleind mee. Met alleen de links moest
    // OpenAI tot negen beelden zelf downloaden, en één trage download liet de hele
    // aanwijzing mislukken ("Unable to download content … before the timeout").
    const context = aanwijzingContext(spec, si, li);
    const [doelBeeld, ...contextBeelden] = await Promise.all([
      beeldAlsDataUrl(doel, { maxZijde: 1024 }),
      ...context.map((c) => beeldAlsDataUrl(c.url, { maxZijde: 512 })),
    ]);
    if (!doelBeeld) {
      return NextResponse.json({ error: "Het beeld kon niet worden opgehaald. Probeer het zo nog eens." }, { status: 502 });
    }
    const vergelijking = context.flatMap((c, i) => {
      const beeld = contextBeelden[i];
      return beeld
        ? [
            { type: "text" as const, text: `Ter vergelijking, ${c.label}:` },
            { type: "image_url" as const, image_url: { url: beeld, detail: "low" as const } },
          ]
        : [];
    });
    const overgeslagen = contextBeelden.filter((b) => !b).length;
    if (overgeslagen) console.warn(`[dialogue-aanwijzing] ${overgeslagen} vergelijkingsbeeld(en) niet opgehaald, zonder verder`);

    const antwoord = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: 600,
      messages: [
        { role: "system", content: AANWIJZING_SYSTEEM },
        {
          role: "user",
          content: [
            { type: "text", text: `${aanwijzingVraag(spec, si, li, aanwijzing)}\nHIER HET DOELBEELD:` },
            { type: "image_url", image_url: { url: doelBeeld, detail: "high" } },
            ...vergelijking,
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "aanwijzing", strict: true, schema: AANWIJZING_SCHEMA as unknown as Record<string, unknown> },
      },
    });

    let uitleg: {
      begrepen?: unknown; instructie?: unknown; klein?: unknown; opDeGrond?: unknown; controle?: unknown; kader?: unknown;
    };
    try {
      uitleg = JSON.parse(antwoord.choices[0]?.message?.content ?? "{}");
    } catch {
      uitleg = {};
    }
    const begrepen = typeof uitleg.begrepen === "string" && uitleg.begrepen.trim() ? uitleg.begrepen.trim() : null;
    const instructie = typeof uitleg.instructie === "string" && uitleg.instructie.trim() ? uitleg.instructie.trim() : aanwijzing;
    const opDeGrond = leesOpDeGrond(uitleg.opDeGrond);
    const controle = leesControle(uitleg.controle);
    // Een kader hoort bij een ander camerastandpunt, en dat kan een bewerking niet:
    // dat is altijd opnieuw tekenen (zie leesKader).
    const kader = leesKader(uitleg.kader);
    // Een zwevend voorwerp rechtzetten is een ingreep op één plek in het beeld: het
    // goedgekeurde shot blijft staan, ook als het model het als grote wijziging zag.
    // Verplaatsen, groter maken, iemand erbij: dat lukt een bewerking niet (zie
    // isIndelingsAanwijzing). Dan het beeld opnieuw tekenen met de aanwijzing erin.
    const indeling = isIndelingsAanwijzing(aanwijzing, instructie) || !!kader;
    const klein = (uitleg.klein === true && !indeling) || !!opDeGrond;
    console.log(
      `[dialogue-aanwijzing] scène ${si + 1} shot ${li + 1}: "${aanwijzing}" → ` +
        `${opDeGrond ? `schets (${opDeGrond} op de grond)` : klein ? "bewerken" : `opnieuw tekenen${indeling ? " (indeling)" : ""}`}: ${instructie}`,
    );

    if (!klein) return NextResponse.json({ klein: false, begrepen, instructie, controle, kader });

    const credit = await deductCredits(user.id, DIALOOG_CREDITS.LOS_BEELD, "Storyboardbeeld aanpassen");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: DIALOOG_CREDITS.LOS_BEELD },
        { status: 402 },
      );
    }
    try {
      // "De deur moet tot de grond reiken" werd acht keer begrepen en acht keer niet
      // uitgevoerd: een bewerking in woorden verlengt niets. Dan eerst de schets (zie
      // schets-bewerking.ts); vindt die het voorwerp niet, dan gewoon bewerken.
      const geschetst = opDeGrond
        ? await zetOpDeGrond({ bronUrl: doel, voorwerp: opDeGrond, instructie, format: spec.format }).catch((e) => {
            console.error("[dialogue-aanwijzing] schets mislukt, gewone bewerking:", e);
            return null;
          })
        : null;
      // Alleen een castblad van de echte karakters (zie DialogueSpec.castSheetVan).
      const castblad = spec.castSheetVan === "portret" ? (spec.castSheetUrl ?? "").trim() : "";
      const bewerk = async (opdracht: string) =>
        (await bewerkBeeld({
          bronUrl: doel,
          instructie: opdracht,
          referentieUrls: [castblad].filter(Boolean),
          referentieUitleg: castblad
            ? "The second image is the character line-up sheet: it shows exactly how the characters look. Use it only for " +
              "their appearance; do not copy its layout, background or poses."
            : undefined,
          format: spec.format,
        })).imageUrl;

      let nieuwUrl = geschetst ?? (await bewerk(instructie));
      // Klaar zijn is niet hetzelfde als gelukt. Zonder deze controle meldde de app
      // "aangepast" bij een beeld waarin niets veranderd was — precies het punt waar de
      // knop zijn vertrouwen verloor. Eén herkansing met de fout erbij, en lukt het dan
      // nog niet, dan gaat het shot naar het opnieuw tekenen in plaats van dat we een
      // onveranderd beeld als klaar verkopen.
      let uitslag = controle ? await controleerAanwijzing(nieuwUrl, controle) : { ja: null, waarom: "" };
      if (controle && uitslag.ja === false) {
        console.warn(`[dialogue-aanwijzing] bewerking deed het niet: ${uitslag.waarom || "geen verschil te zien"}; herkansing`);
        const tweede = await bewerk(scherpereInstructie(instructie, controle, uitslag.waarom)).catch((e) => {
          console.error("[dialogue-aanwijzing] herkansing mislukt:", e);
          return null;
        });
        if (tweede) {
          const tweedeUitslag = await controleerAanwijzing(tweede, controle);
          if (tweedeUitslag.ja !== false) {
            nieuwUrl = tweede;
            uitslag = tweedeUitslag;
          }
        }
      }
      if (controle && uitslag.ja === false) {
        // Niets opgeleverd, dus ook niets in rekening brengen; de pagina tekent het
        // shot nu opnieuw met dezelfde instructie en controlevraag.
        await addCredits(user.id, DIALOOG_CREDITS.LOS_BEELD, "Refund: bewerking deed de aanpassing niet").catch(() => {});
        console.warn(`[dialogue-aanwijzing] bewerken lukte twee keer niet; shot gaat naar opnieuw tekenen`);
        return NextResponse.json({ klein: false, begrepen, instructie, controle, kader, bewerkingMislukt: true });
      }
      const shotImageUrl = await persistFalAssetSoft(supabase, user.id, nieuwUrl, "image");
      return NextResponse.json({ klein: true, begrepen, instructie, controle, kader, shotImageUrl, gelukt: uitslag.ja ?? null });
    } catch (e) {
      await addCredits(user.id, DIALOOG_CREDITS.LOS_BEELD, "Refund: storyboardbeeld aanpassen").catch(() => {});
      throw e;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-aanwijzing failed:", msg);
    return NextResponse.json({ error: "Aanwijzing verwerken mislukt", detail: msg }, { status: 500 });
  }
}
