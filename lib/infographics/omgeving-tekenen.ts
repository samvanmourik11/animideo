// EEN PLEK VASTLEGGEN: tekenen én bewaren.
//
// Dezelfde weg als bij een voorwerp (zie voorwerp-tekenen.ts): de beelden worden
// getekend en daarna teruggeschreven naar de bibliotheek, zodat de volgende video in
// deze tekenstijl exact dezelfde plek krijgt.

import type { Omgeving, OmgevingVariant } from "./omgeving";
import { DEFAULT_STORY_STYLE } from "./story-style";

export interface OmgevingTekenContext {
  styleId?: string | null;
  format?: string | null;
  language?: string | null;
  illustrationBrief?: string | null;
  seed?: number | null;
  /** Id in de bibliotheek, als deze plek daar al staat. */
  bibliotheekId?: string | null;
  /** Dezelfde plek in een andere tekenstijl: alleen als voorbeeld voor vorm en kleur. */
  voorbeeldUrl?: string | null;
}

export type OmgevingUitkomst = { omgeving: Omgeving } | { fout: string; geenCredits: boolean };

/**
 * Een plek tekenen (drie varianten), de herkenningspunten eraf lezen en het geheel in de
 * bibliotheek zetten. Gooit nooit: een fout komt terug als uitkomst.
 */
export async function tekenOmgeving(
  naam: string,
  beschrijving: string,
  ctx: OmgevingTekenContext,
): Promise<OmgevingUitkomst> {
  try {
    const r = await fetch("/api/infographics/omgeving-tekenen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        naam,
        beschrijving,
        styleId: ctx.styleId ?? undefined,
        format: ctx.format ?? undefined,
        language: ctx.language ?? undefined,
        illustrationBrief: ctx.illustrationBrief ?? "",
        seed: ctx.seed ?? undefined,
        voorbeeldUrl: ctx.voorbeeldUrl ?? undefined,
      }),
    });
    const d = await r.json().catch(() => ({}));
    const varianten = (Array.isArray(d.varianten) ? d.varianten : []) as OmgevingVariant[];
    if (!r.ok || !varianten.length) {
      const geenCredits = d.error === "insufficient_credits";
      return {
        fout: geenCredits
          ? `Te weinig credits (nodig: ${d.required}, saldo: ${d.credits})`
          : d.detail || d.error || "De plek tekenen is mislukt",
        geenCredits,
      };
    }
    const styleId = ctx.styleId || DEFAULT_STORY_STYLE;
    const kenmerken = Array.isArray(d.kenmerken) ? (d.kenmerken as unknown[]).map(String) : [];

    // Terug naar de bibliotheek, zodat de volgende video dezelfde plek krijgt. Mislukt
    // dat (tabel nog niet aangemaakt), dan heeft deze video zijn beelden toch.
    let id = ctx.bibliotheekId ?? "";
    try {
      const bewaar = await fetch("/api/omgevingen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id || undefined,
          naam,
          beschrijving,
          kenmerken,
          styleId,
          nieuweVarianten: Object.fromEntries(varianten.map((v) => [v.soort, v.url])),
        }),
      });
      const bd = await bewaar.json().catch(() => ({}));
      if (bewaar.ok && bd.omgeving?.id) id = bd.omgeving.id as string;
    } catch {
      // Zonder bibliotheek werkt deze video gewoon door.
    }

    return { omgeving: { id, naam, beschrijving, kenmerken, varianten, styleId } };
  } catch (e) {
    return { fout: e instanceof Error ? e.message : String(e), geenCredits: false };
  }
}
