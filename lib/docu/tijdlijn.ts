// Tijdlijn van een docu (verbeterplan idee 14): elke scene is een vast beeld uit
// public/motion/docu.js met tekst en getallen (een Shot). Die keuzes staan als JSON in de code
// van elk hoofdstuk. De klant kan per scene een ander beeld kiezen, de tekst in beeld
// aanpassen of een andere foto nemen; de video wordt daarna opnieuw gemaakt zonder AI.
import { SJABLONEN, type Shot } from "./sjablonen";

const SLEUTEL = "window.VIDEO = docuVideo(";

export interface DocuSpec {
  scenes: Shot[];
  [k: string]: unknown;
}

export function leesSpec(code: string): DocuSpec | null {
  const i = code.lastIndexOf(SLEUTEL);
  if (i < 0) return null;
  try {
    return JSON.parse(code.slice(i + SLEUTEL.length).replace(/\);\s*$/, "")) as DocuSpec;
  } catch {
    return null;
  }
}

export function schrijfSpec(code: string, spec: DocuSpec): string {
  const i = code.lastIndexOf(SLEUTEL);
  return `${code.slice(0, i)}${SLEUTEL}${JSON.stringify(spec)});\n`;
}

export interface ShotWijziging {
  /** Welk hoofdstuk (0, 1, ...) en welke scene daarin (s1, s2, ...). */
  deel: number;
  id: string;
  sjabloon?: string;
  kop?: string;
  sub?: string;
  getal?: string;
  stempel?: string;
  items?: { a: string; b: string }[];
  /** Een foto-id (f1, f2, ...) of "" voor geen foto. */
  foto?: string;
}

const kort = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : undefined);

/** Controleert de wijzigingen van het scherm. Gooit met een melding voor de klant. */
export function leesWijzigingen(ruw: unknown, fotoIds: Set<string>): ShotWijziging[] {
  if (!Array.isArray(ruw) || !ruw.length) throw new Error("Er is niets veranderd in de tijdlijn.");
  if (ruw.length > 120) throw new Error("Te veel wijzigingen in één keer.");
  return ruw.map((w) => {
    const o = (w ?? {}) as Record<string, unknown>;
    const deel = typeof o.deel === "number" && Number.isInteger(o.deel) && o.deel >= 0 ? o.deel : -1;
    const id = typeof o.id === "string" && /^s\d{1,3}$/.test(o.id) ? o.id : "";
    if (deel < 0 || !id) throw new Error("Een scene in de tijdlijn kwam niet goed door.");
    const uit: ShotWijziging = { deel, id };
    if (o.sjabloon !== undefined) {
      if (!(SJABLONEN as readonly string[]).includes(String(o.sjabloon))) throw new Error("Onbekend beeld gekozen.");
      uit.sjabloon = String(o.sjabloon);
    }
    for (const [k, n] of [["kop", 60], ["sub", 120], ["getal", 20], ["stempel", 24]] as const) {
      const v = kort(o[k], n);
      if (v !== undefined) uit[k] = v;
    }
    if (Array.isArray(o.items)) uit.items = o.items.slice(0, 8).map((x) => ({ a: kort((x as { a?: unknown })?.a, 30) ?? "", b: kort((x as { b?: unknown })?.b, 60) ?? "" })).filter((x) => x.a || x.b);
    if (o.foto !== undefined) {
      const f = String(o.foto);
      if (f && !fotoIds.has(f)) throw new Error("Die foto hoort niet bij deze docu.");
      uit.foto = f;
    }
    if (uit.sjabloon === "foto" && uit.foto === "") throw new Error("Kies een foto voor een fotobeeld.");
    return uit;
  });
}

/** Past de wijzigingen toe op de shots van één hoofdstuk. `vermelding` geeft de bronregel van een foto. */
export function pasShotsAan(spec: DocuSpec, ws: ShotWijziging[], vermelding: (fotoId: string) => string): DocuSpec {
  return {
    ...spec,
    scenes: spec.scenes.map((sh) => {
      const w = ws.find((x) => x.id === sh.id);
      if (!w) return sh;
      const { deel: _deel, id: _id, ...rest } = w;
      void _deel; void _id;
      const nieuw = { ...sh, ...rest } as Shot;
      // Een fotobeeld heeft een foto en zijn bronvermelding; een ander beeld geen van beide.
      if (nieuw.sjabloon === "foto" && nieuw.foto) nieuw.vermelding = vermelding(nieuw.foto);
      else if (nieuw.sjabloon !== "foto") { delete nieuw.foto; delete nieuw.vermelding; }
      return nieuw;
    }),
  };
}
