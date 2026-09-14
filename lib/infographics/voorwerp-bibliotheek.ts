// DE VOORWERPENBIBLIOTHEEK — voorwerpen die in élke video hetzelfde zijn, zoals de
// personages in de personagebibliotheek.
//
// Binnen één video hield een getekend blad de Wonderwagen al gelijk, maar na die
// video was hij weg: een nieuw verhaal met de Wonderwagen verzon hem opnieuw. Hier
// bewaart de gebruiker hem, met per tekenstijl het blad. Een blad in de ene stijl
// past niet in een video in een andere stijl (een zachte 3D-wagen tussen platte
// tekeningen), dus daar dient het alleen als voorbeeld voor vorm en kleuren.

import type { DialogueSpec, DialogueVoorwerp } from "./dialogue-schema";

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

/**
 * Voorwerpen die in een draaiboek gevonden zijn, erbij zetten zonder te verliezen wat
 * er al stond: een bestaand voorwerp kan al een getekend blad hebben, of door de
 * gebruiker aangepast zijn.
 */
export function voegVoorwerpenSamen(bestaand: DialogueVoorwerp[], gevonden: DialogueVoorwerp[]): DialogueVoorwerp[] {
  const uit = [...bestaand];
  const staatErAl = (v: DialogueVoorwerp) =>
    uit.some((x) => (!!v.bibliotheekId && x.bibliotheekId === v.bibliotheekId) || naamSleutel(x.naam) === naamSleutel(v.naam));
  for (const v of gevonden) {
    if (uit.length >= MAX_VOORWERPEN) break;
    if (!staatErAl(v)) uit.push(v);
  }
  return uit;
}

export const VOORWERPEN_ZOEKEN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["voorwerpen"],
  properties: {
    voorwerpen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["naam", "uiterlijk", "bibliotheekId"],
        properties: {
          naam: { type: "string" },
          uiterlijk: { type: "string" },
          bibliotheekId: { type: "string" },
        },
      },
    },
  },
} as const;

const ZOEK_SYSTEEM = `Je leest het draaiboek van een getekende animatievideo en zoekt de VOORWERPEN die in elk beeld precies hetzelfde getekend moeten worden. Elk beeld wordt los getekend: een voorwerp dat niet vastligt, ziet er in elk shot anders uit.

WAT TELT ALS VOORWERP
- Een ding dat een rol speelt in het verhaal: waar de personages naar kijken, over praten, mee spelen, in rijden of dat ze vinden. De bloem die ze bestuderen, een kaart, een knuffel, een wagen.
- Een ding dat in meer dan één shot of scène terugkomt, zoals de grote boom waar ze onder staan.
- Hooguit vier, de belangrijkste eerst. Een verhaal dat om een bloem draait, heeft die bloem als voorwerp.

WAT NIET TELT
Personages en dieren die meespelen, kleding, de hele plek (het bos, de kamer, de stad) en achtergronddingen die niemand noemt of bekijkt.

PER VOORWERP
- "naam": zoals het in het verhaal heet, in de taal van het verhaal ("klaproos", "de grote eik", "Wonderwagen").
- "uiterlijk": één ENGELSE zin die precies beschrijft hoe het eruitziet, zodat een tekenaar het elke keer hetzelfde tekent: wat voor ding het is, de hoofdkleur, twee opvallende details en hoe groot het is naast de personages. Voorbeeld van de vorm (niet van de inhoud): "an old brass lantern with a round glass window and a curled handle, about the size of a child's head". Natuurgetrouw en passend bij wat het verhaal zegt; nooit alleen vage woorden als "magical" of "colourful".
- "bibliotheekId": staat het voorwerp in DE VOORWERPENBIBLIOTHEEK (hetzelfde ding, ook als het verhaal het iets anders noemt), gebruik dan dat id en neem naam en uiterlijk letterlijk uit de bibliotheek over. Anders leeg.
- Staan er VOORWERPEN DIE AL VASTLIGGEN, geef die ook terug, ongewijzigd.`;

/** De vraag om de voorwerpen uit een geschreven draaiboek te halen. */
export function voorwerpenZoekPrompt(
  spec: Pick<DialogueSpec, "title" | "scenes" | "cast" | "voorwerpen">,
  bibliotheek: Pick<BibliotheekVoorwerp, "id" | "naam" | "uiterlijk">[],
): { systeem: string; vraag: string } {
  const naam = (id: string) => spec.cast.find((c) => c.id === id)?.name ?? "de verteller";
  const vast = (spec.voorwerpen ?? [])
    .filter((v) => v.naam.trim() && v.uiterlijk.trim())
    .map((v) => `- ${v.naam}${v.bibliotheekId ? ` (bibliotheek-id "${v.bibliotheekId}")` : ""}: ${v.uiterlijk}`)
    .join("\n");
  const draaiboek = spec.scenes
    .map((s, si) => {
      const regels = s.lines
        .map((l) => {
          const wat = (l.actie ?? "").trim() ? ` [beeld: ${(l.actie ?? "").trim()}]` : "";
          const zin = (l.text ?? "").trim() ? ` ${naam(l.characterId)}: "${l.text.trim()}"` : "";
          return wat || zin ? `  -${wat}${zin}` : null;
        })
        .filter(Boolean)
        .join("\n");
      return `SCÈNE ${si + 1} — plek: ${s.setting}\n${regels}`;
    })
    .join("\n\n");

  const vraag =
    `TITEL: ${spec.title}\n\n` +
    `DE VOORWERPENBIBLIOTHEEK:\n${bibliotheekVoorwerpTekst(bibliotheek)}\n\n` +
    (vast ? `VOORWERPEN DIE AL VASTLIGGEN:\n${vast}\n\n` : "") +
    `DRAAIBOEK:\n${draaiboek}\n\n` +
    `Geef nu de voorwerpen als JSON.`;
  return { systeem: ZOEK_SYSTEEM, vraag };
}

/** Ontbreekt de tabel nog (migratie niet gedraaid)? Dan werkt de rest gewoon zonder. */
export function tabelOntbreekt(fout: { code?: string; message?: string } | null | undefined): boolean {
  if (!fout) return false;
  return fout.code === "42P01" || fout.code === "PGRST205" || /does not exist|could not find the table/i.test(fout.message ?? "");
}
