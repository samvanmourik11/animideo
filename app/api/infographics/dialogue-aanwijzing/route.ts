import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@/lib/openai";
import { bewerkBeeld } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { beeldAlsDataUrl } from "@/lib/infographics/beeld-inline";
import {
  aanwijzingContext, aanwijzingVraag, AANWIJZING_SCHEMA, AANWIJZING_SYSTEEM,
} from "@/lib/infographics/beeld-aanwijzing";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import type { DialogueSpec } from "@/lib/infographics/dialogue-schema";

export const runtime = "nodejs";
export const maxDuration = 120;

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

    let uitleg: { begrepen?: unknown; instructie?: unknown; klein?: unknown };
    try {
      uitleg = JSON.parse(antwoord.choices[0]?.message?.content ?? "{}");
    } catch {
      uitleg = {};
    }
    const begrepen = typeof uitleg.begrepen === "string" && uitleg.begrepen.trim() ? uitleg.begrepen.trim() : null;
    const instructie = typeof uitleg.instructie === "string" && uitleg.instructie.trim() ? uitleg.instructie.trim() : aanwijzing;
    const klein = uitleg.klein === true;
    console.log(`[dialogue-aanwijzing] scène ${si + 1} shot ${li + 1}: "${aanwijzing}" → ${klein ? "bewerken" : "opnieuw tekenen"}: ${instructie}`);

    if (!klein) return NextResponse.json({ klein: false, begrepen, instructie });

    const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION_PRO, "Storyboardbeeld aanpassen");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION_PRO },
        { status: 402 },
      );
    }
    try {
      const castblad = (spec.castSheetUrl ?? "").trim();
      const bewerkt = await bewerkBeeld({
        // Het beeld is met Pro gemaakt; de bewerking houdt die kwaliteit.
        quality: "pro",
        bronUrl: doel,
        instructie,
        referentieUrls: [castblad],
        referentieUitleg:
          "The second image is the character line-up sheet: it shows exactly how the characters look. Use it only for " +
          "their appearance; do not copy its layout, background or poses.",
        format: spec.format,
      });
      const shotImageUrl = await persistFalAssetSoft(supabase, user.id, bewerkt.imageUrl, "image");
      return NextResponse.json({ klein: true, begrepen, instructie, shotImageUrl });
    } catch (e) {
      await addCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION_PRO, "Refund: storyboardbeeld aanpassen").catch(() => {});
      throw e;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-aanwijzing failed:", msg);
    return NextResponse.json({ error: "Aanwijzing verwerken mislukt", detail: msg }, { status: 500 });
  }
}
