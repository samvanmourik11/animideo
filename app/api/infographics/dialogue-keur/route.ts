import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { beoordeelBeeld } from "@/lib/infographics/dialogue-verify";
import { iedereenZichtbaar } from "@/lib/infographics/dialogue-staging";
import { zorgVoorBeschrijving } from "@/lib/infographics/personage-blad";
import { sceneCast, VERTELLER_ID, type DialogueSpec } from "@/lib/infographics/dialogue-schema";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Fouten waar een beeld écht op zakt: iemand ontbreekt of er staat iemand te veel. */
function telFout(fouten: string[]): boolean {
  return /ontbreekt\b(?!\s+(?:rode|gele|witte|blauwe|groene|zwarte)\b)|mensen in beeld|extra persoon|extra kind|extra volwassene|twee keer/i.test(fouten.join(" "));
}

// HET BORD NAKIJKEN.
//
// De controle tijdens het maken is niet stabiel: hetzelfde beeld kwam er de ene keer
// doorheen en werd de andere keer afgekeurd (gemeten 19-09-2026, 5 van de 20 beelden).
// Een tweede ronde over het afgemaakte bord vangt die 5. De pagina maakt de gezakte
// beelden daarna opnieuw; dat valt onder de credit per scène.
//
// Gratis: alleen kijkvragen, net als de beeldcontrole zelf.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

    const { spec } = (await req.json().catch(() => ({}))) as { spec?: DialogueSpec };
    if (!spec || !Array.isArray(spec.scenes)) return NextResponse.json({ error: "Geen dialoog-spec" }, { status: 400 });

    const cast = await Promise.all((spec.cast ?? []).map((c) => zorgVoorBeschrijving(supabase, user.id, c)));
    const taken: Promise<{ si: number; li: number; fouten: string[] } | null>[] = [];
    spec.scenes.forEach((scene, si) => {
      const inScene = sceneCast(scene, cast, spec.verhaallijn);
      scene.lines.forEach((regel, li) => {
        const beeld = (regel.shotImageUrl ?? "").trim();
        if (!beeld) return;
        const isActie = regel.kind === "actie" || regel.characterId === VERTELLER_ID;
        const spreker = inScene.find((c) => c.id === regel.characterId) ?? null;
        taken.push((async () => {
          try {
            const o = await beoordeelBeeld(
              beeld,
              isActie ? null : spreker,
              isActie ? inScene : inScene.filter((c) => c.id !== regel.characterId),
              { iedereenZichtbaar: iedereenZichtbaar(regel.kader) },
            );
            return telFout(o.fouten) ? { si, li, fouten: o.fouten } : null;
          } catch (e) {
            // Een mislukte kijkvraag mag geen goed beeld afkeuren.
            console.warn(`[dialogue-keur] s${si + 1}r${li + 1} niet gelukt:`, e instanceof Error ? e.message : e);
            return null;
          }
        })());
      });
    });
    const gezakt = (await Promise.all(taken)).filter((x): x is { si: number; li: number; fouten: string[] } => x !== null);
    console.log(`[dialogue-keur] ${gezakt.length} van de ${taken.length} beelden gezakt${gezakt.length ? ": " + gezakt.map((g) => `s${g.si + 1}r${g.li + 1}`).join(", ") : ""}`);
    return NextResponse.json({ gezakt });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-keur failed:", msg);
    return NextResponse.json({ error: "Nakijken mislukt", detail: msg }, { status: 500 });
  }
}
