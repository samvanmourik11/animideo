// DE VOORWERPENBIBLIOTHEEK — voorwerpen die in élke video hetzelfde zijn, zoals de
// personages in de personagebibliotheek.
//
// Binnen één video hield een getekend blad de Wonderwagen al gelijk, maar na die
// video was hij weg: een nieuw verhaal met de Wonderwagen verzon hem opnieuw. Hier
// bewaart de gebruiker hem, met per tekenstijl het blad. Een blad in de ene stijl
// past niet in een video in een andere stijl (een zachte 3D-wagen tussen platte
// tekeningen), dus daar dient het alleen als voorbeeld voor vorm en kleuren.

import type { DialogueVoorwerp } from "./dialogue-schema";

export interface BibliotheekVoorwerp {
  id: string;
  naam: string;
  /** Engels, gaat rechtstreeks naar het beeldmodel. */
  uiterlijk: string;
  /** Per tekenstijl (styleId) het getekende blad. */
  bladen: Record<string, string>;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Meer vaste voorwerpen per video maakt elk beeld een optelsom van voorwerpen. */
export const MAX_VOORWERPEN = 4;
export const MAX_NAAM = 80;
export const MAX_UITERLIJK = 700;

/** Een rij uit de database, zonder aan te nemen dat hij klopt. */
export function leesBibliotheekVoorwerp(rij: unknown): BibliotheekVoorwerp | null {
  const r = rij as Partial<BibliotheekVoorwerp> | null;
  if (!r || typeof r.id !== "string" || typeof r.naam !== "string" || typeof r.uiterlijk !== "string") return null;
  const bladen: Record<string, string> = {};
  if (r.bladen && typeof r.bladen === "object") {
    for (const [stijl, url] of Object.entries(r.bladen)) {
      if (typeof url === "string" && /^https:\/\//.test(url)) bladen[stijl] = url;
    }
  }
  return {
    id: r.id,
    naam: r.naam,
    uiterlijk: r.uiterlijk,
    bladen,
    created_at: typeof r.created_at === "string" ? r.created_at : null,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
  };
}

/** Het blad in precies deze tekenstijl, als dat er is. */
export function bladVoorStijl(v: Pick<BibliotheekVoorwerp, "bladen">, styleId?: string | null): string | null {
  const url = styleId ? v.bladen?.[styleId] : undefined;
  return typeof url === "string" && url ? url : null;
}

/** Een blad uit een andere tekenstijl: alleen bruikbaar als voorbeeld voor de vorm. */
export function bladUitAndereStijl(v: Pick<BibliotheekVoorwerp, "bladen">, styleId?: string | null): string | null {
  const gevonden = Object.entries(v.bladen ?? {}).find(([stijl, url]) => stijl !== styleId && !!url);
  return gevonden?.[1] ?? null;
}

/** Een bibliotheekvoorwerp klaar voor deze video. */
export function naarDialoogVoorwerp(v: BibliotheekVoorwerp, styleId?: string | null): DialogueVoorwerp {
  const blad = bladVoorStijl(v, styleId);
  return {
    naam: v.naam,
    uiterlijk: v.uiterlijk,
    bladUrl: blad,
    bibliotheekId: v.id,
    voorbeeldUrl: blad ? null : bladUitAndereStijl(v, styleId),
  };
}

/** De bibliotheek als lijst voor een opdracht aan het taalmodel. */
export function bibliotheekVoorwerpTekst(lijst: Pick<BibliotheekVoorwerp, "id" | "naam" | "uiterlijk">[]): string {
  return lijst.length
    ? lijst.map((v) => `- id "${v.id}": ${v.naam} — ${v.uiterlijk}`).join("\n")
    : "(de gebruiker heeft nog geen voorwerpen in zijn bibliotheek)";
}

const naamSleutel = (naam: string) => naam.trim().toLowerCase().replace(/^(?:de|het|een|the|an?)\s+/, "");

/**
 * De voorwerpen die het taalmodel voorstelde, gekoppeld aan de bibliotheek.
 *
 * Een voorwerp uit de bibliotheek krijgt de naam, de beschrijving en het blad uit de
 * bibliotheek, ook als het model iets anders opschreef: anders was de Wonderwagen
 * in de volgende video toch weer een "magical colourful wagon". Vergeet het model
 * het id maar noemt het dezelfde naam, dan hoort hij er ook bij. Wat niet in de
 * bibliotheek staat, is nieuw en wordt voor deze video getekend.
 */
export function koppelVoorwerpen(
  voorstel: { naam?: unknown; uiterlijk?: unknown; bibliotheekId?: unknown }[],
  bibliotheek: BibliotheekVoorwerp[],
  styleId?: string | null,
): DialogueVoorwerp[] {
  const opId = new Map(bibliotheek.map((v) => [v.id, v]));
  const gezien = new Set<string>();
  const uit: DialogueVoorwerp[] = [];
  for (const ruw of voorstel) {
    const id = String(ruw.bibliotheekId ?? "").trim();
    const voorgesteldeNaam = String(ruw.naam ?? "").trim();
    const bieb = (id ? opId.get(id) : undefined)
      ?? (voorgesteldeNaam ? bibliotheek.find((v) => naamSleutel(v.naam) === naamSleutel(voorgesteldeNaam)) : undefined);
    const naam = (bieb?.naam ?? voorgesteldeNaam).trim();
    const uiterlijk = (bieb?.uiterlijk ?? String(ruw.uiterlijk ?? "")).trim();
    if (!naam || !uiterlijk) continue;
    const sleutel = bieb ? `id:${bieb.id}` : `naam:${naamSleutel(naam)}`;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push(bieb
      ? naarDialoogVoorwerp(bieb, styleId)
      : { naam, uiterlijk, bladUrl: null, bibliotheekId: null, voorbeeldUrl: null });
    if (uit.length >= MAX_VOORWERPEN) break;
  }
  return uit;
}

/** Ontbreekt de tabel nog (migratie niet gedraaid)? Dan werkt de rest gewoon zonder. */
export function tabelOntbreekt(fout: { code?: string; message?: string } | null | undefined): boolean {
  if (!fout) return false;
  return fout.code === "42P01" || fout.code === "PGRST205" || /does not exist|could not find the table/i.test(fout.message ?? "");
}
