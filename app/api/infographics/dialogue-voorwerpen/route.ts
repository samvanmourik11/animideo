import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@/lib/openai";
import {
  koppelVoorwerpen, leesBibliotheekVoorwerp, tabelOntbreekt, voorwerpenZoekPrompt, zonderPersonagesEnPlekken, VOORWERPEN_ZOEKEN_SCHEMA,
  type BibliotheekVoorwerp,
} from "@/lib/infographics/voorwerp-bibliotheek";
import type { DialogueSpec } from "@/lib/infographics/dialogue-schema";

export const runtime = "nodejs";
export const maxDuration = 60;

// VOORWERPEN UIT HET DRAAIBOEK HALEN.
//
// De opzet had al de opdracht om voorwerpen te noemen, als één zin tussen tientallen
// andere, en koos voor een verhaal over een klaproos en een grote boom geen enkel
// voorwerp. Bovendien bestaan die dingen pas echt als het draaiboek geschreven is.
// Eén kleine vraag over het geschreven draaiboek doet het wél, net als de losse
// castingvraag voor papa en mama in de opzet.
//
// Geen credits: één GPT-4o-tekstaanroep, net als de andere denkstappen.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

    const { spec } = (await req.json().catch(() => ({}))) as { spec?: DialogueSpec };
    if (!spec || !Array.isArray(spec.scenes) || !Array.isArray(spec.cast)) {
      return NextResponse.json({ error: "Geen geldige dialoog-spec" }, { status: 400 });
    }

    const { data: rijen, error: leesFout } = await supabase
      .from("voorwerpen")
      .select("id, naam, uiterlijk, bladen")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(60);
    if (leesFout && !tabelOntbreekt(leesFout)) {
      console.warn(`[dialogue-voorwerpen] bibliotheek niet gelezen: ${leesFout.message}`);
    }
    const bibliotheek = (rijen ?? []).map(leesBibliotheekVoorwerp).filter((v): v is BibliotheekVoorwerp => !!v);

    const { systeem, vraag } = voorwerpenZoekPrompt(spec, bibliotheek);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      max_tokens: 1500,
      messages: [
        { role: "system", content: systeem },
        { role: "user", content: vraag },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "voorwerpen",
          strict: true,
          schema: VOORWERPEN_ZOEKEN_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });

    let ruw: { voorwerpen?: unknown };
    try {
      ruw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch {
      return NextResponse.json({ error: "Ongeldig antwoord van het model" }, { status: 500 });
    }

    const voorwerpen = zonderPersonagesEnPlekken(
      koppelVoorwerpen(
        (Array.isArray(ruw.voorwerpen) ? ruw.voorwerpen : []) as { naam?: unknown; uiterlijk?: unknown; bibliotheekId?: unknown }[],
        bibliotheek,
        spec.styleId,
      ),
      {
        castNamen: spec.cast.map((c) => c.name),
        plekken: [
          ...(spec.verhaallijn ?? []).flatMap((d) => [d.titel, d.plek]),
          ...spec.scenes.map((s) => s.gebied ?? ""),
        ].filter(Boolean),
      },
    );
    console.log(
      `[dialogue-voorwerpen] ${voorwerpen.length} gevonden: ` +
      voorwerpen.map((v) => `${v.naam}${v.bibliotheekId ? " (bibliotheek)" : ""}`).join(", "),
    );
    return NextResponse.json({ voorwerpen });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-voorwerpen failed:", msg);
    return NextResponse.json({ error: "Voorwerpen zoeken mislukt", detail: msg }, { status: 500 });
  }
}
