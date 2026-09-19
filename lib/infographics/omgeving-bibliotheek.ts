// DE OMGEVINGENBIBLIOTHEEK — de plekken van de gebruiker, bewaard tussen video's door.
//
// Net als bij de voorwerpen: per tekenstijl eigen beelden. Een plat getekend veld tussen
// zachte 3D-personages valt uit de toon, dus een plek die in een andere stijl is
// getekend wordt opnieuw getekend en dient alleen als voorbeeld voor de vorm en de
// kleuren. Zie voorwerp-bibliotheek.ts, waar dat al zo werkt.

import { OMGEVING_VARIANTEN, type Omgeving, type OmgevingVariant, type OmgevingVariantSoort } from "./omgeving";

export interface BibliotheekOmgeving {
  id: string;
  naam: string;
  /** Engels, gaat rechtstreeks naar het beeldmodel. */
  beschrijving: string;
  /** Afgelezen van het eerste getekende beeld; hiermee controleren we latere beelden. */
  kenmerken: string[];
  /** Per tekenstijl (styleId) per variant de URL. */
  varianten: Record<string, Partial<Record<OmgevingVariantSoort, string>>>;
  created_at?: string | null;
  updated_at?: string | null;
}

export const MAX_OMGEVING_NAAM = 80;
export const MAX_OMGEVING_BESCHRIJVING = 700;

const isBeeld = (u: unknown): u is string => typeof u === "string" && /^https:\/\//.test(u);

/** Een rij uit de database, zonder aan te nemen dat hij klopt. */
export function leesBibliotheekOmgeving(rij: unknown): BibliotheekOmgeving | null {
  const r = rij as Partial<BibliotheekOmgeving> | null;
  if (!r || typeof r.id !== "string" || typeof r.naam !== "string" || typeof r.beschrijving !== "string") return null;
  const varianten: BibliotheekOmgeving["varianten"] = {};
  if (r.varianten && typeof r.varianten === "object") {
    for (const [stijl, perSoort] of Object.entries(r.varianten)) {
      if (!perSoort || typeof perSoort !== "object") continue;
      const uit: Partial<Record<OmgevingVariantSoort, string>> = {};
      for (const soort of OMGEVING_VARIANTEN) {
        const url = (perSoort as Record<string, unknown>)[soort];
        if (isBeeld(url)) uit[soort] = url;
      }
      if (Object.keys(uit).length) varianten[stijl] = uit;
    }
  }
  return {
    id: r.id,
    naam: r.naam,
    beschrijving: r.beschrijving,
    kenmerken: Array.isArray(r.kenmerken) ? r.kenmerken.map(String).filter(Boolean).slice(0, 8) : [],
    varianten,
    created_at: typeof r.created_at === "string" ? r.created_at : null,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
  };
}

/** De varianten in precies deze tekenstijl, als losse lijst. */
export function variantenVoorStijl(b: Pick<BibliotheekOmgeving, "varianten">, styleId?: string | null): OmgevingVariant[] {
  const perSoort = styleId ? b.varianten?.[styleId] : undefined;
  if (!perSoort) return [];
  return OMGEVING_VARIANTEN.flatMap((soort) => {
    const url = perSoort[soort];
    return isBeeld(url) ? [{ soort, url }] : [];
  });
}

/** Een beeld uit een andere tekenstijl: alleen bruikbaar als voorbeeld voor de vorm. */
export function beeldUitAndereStijl(b: Pick<BibliotheekOmgeving, "varianten">, styleId?: string | null): string | null {
  for (const [stijl, perSoort] of Object.entries(b.varianten ?? {})) {
    if (stijl === styleId) continue;
    for (const soort of OMGEVING_VARIANTEN) {
      const url = perSoort?.[soort];
      if (isBeeld(url)) return url;
    }
  }
  return null;
}

/**
 * Een bibliotheekomgeving klaar voor deze video: alleen de beelden die bij deze
 * tekenstijl horen. De scène bewaart deze kopie, zodat een oude video niet verandert
 * als de bibliotheek later wordt aangepast — net als bij de voorwerpen.
 */
export function omgevingVoorStijl(b: BibliotheekOmgeving, styleId?: string | null): Omgeving {
  return {
    id: b.id,
    naam: b.naam,
    beschrijving: b.beschrijving,
    kenmerken: b.kenmerken,
    varianten: variantenVoorStijl(b, styleId),
    styleId: styleId ?? null,
  };
}

/** Is deze plek al in deze tekenstijl getekend? */
export function heeftStijl(b: Pick<BibliotheekOmgeving, "varianten">, styleId?: string | null): boolean {
  return variantenVoorStijl(b, styleId).length > 0;
}
