// VOORWERPEN TEKENEN — vanuit de opzet, het draaiboek én het storyboard op één manier.
//
// Een voorwerp werd alleen getekend bij het maken van het storyboard. In de opzet en
// het draaiboek bleven de vakjes leeg, dus je keurde een klaproos en een grote boom
// goed zonder te zien hoe ze eruit gingen zien. Hier staat het tekenen op één plek,
// zodat de knop in het draaiboek en het storyboard hetzelfde doen en allebei het blad
// van een bibliotheekvoorwerp terugzetten in de bibliotheek.

import type { DialogueCastMember, DialogueVoorwerp } from "./dialogue-schema";

export interface TekenContext {
  styleId?: string | null;
  language?: string | null;
  illustrationBrief?: string | null;
  seed?: number | null;
  /** Het castblad, als dat er al is: voorbeeld voor de look. */
  castSheetUrl?: string | null;
  /** De cast: zonder castblad dienen de portretten als voorbeeld voor de look. */
  cast?: Pick<DialogueCastMember, "portraitUrl">[];
}

export type TekenUitkomst = { bladUrl: string } | { fout: string; geenCredits: boolean };

/** Herkent een voorwerp tijdens het tekenen: een andere naam of beschrijving is een ander voorwerp. */
export function voorwerpSleutel(v: Pick<DialogueVoorwerp, "naam" | "uiterlijk">): string {
  return `${v.naam.trim().toLowerCase()}|${v.uiterlijk.trim()}`;
}

/** Eén voorwerp tekenen. Gooit nooit: een fout komt terug als uitkomst. */
export async function tekenVoorwerp(v: DialogueVoorwerp, ctx: TekenContext): Promise<TekenUitkomst> {
  try {
    const r = await fetch("/api/infographics/dialogue-voorwerp-blad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voorwerp: v,
        styleId: ctx.styleId ?? undefined,
        language: ctx.language ?? undefined,
        illustrationBrief: ctx.illustrationBrief ?? "",
        seed: ctx.seed ?? undefined,
        castSheetUrl: ctx.castSheetUrl ?? undefined,
        portretUrls: (ctx.cast ?? []).map((c) => c.portraitUrl).filter(Boolean).slice(0, 2),
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.bladUrl) {
      const geenCredits = d.error === "insufficient_credits";
      return {
        fout: geenCredits ? `Te weinig credits (nodig: ${d.required}, saldo: ${d.credits})` : d.detail || d.error || "Tekenen mislukt",
        geenCredits,
      };
    }
    // Een bibliotheekvoorwerp in deze stijl: het blad terug naar de bibliotheek, zodat
    // de volgende video in deze stijl exact hetzelfde voorwerp krijgt. Mislukt dat,
    // dan heeft deze video zijn blad toch.
    if (v.bibliotheekId && ctx.styleId) {
      void fetch("/api/voorwerpen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: v.bibliotheekId, naam: v.naam, uiterlijk: v.uiterlijk, styleId: ctx.styleId, bladUrl: d.bladUrl }),
      }).catch(() => {});
    }
    return { bladUrl: d.bladUrl as string };
  } catch (e) {
    return { fout: e instanceof Error ? e.message : String(e), geenCredits: false };
  }
}
