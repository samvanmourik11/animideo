// Wat de Regisseur aanlevert controleren: scènes, shots en de cast. Client-veilig.

import { isBibliotheekStem } from "@/lib/stem/bibliotheek";
import { EIGEN } from "@/lib/stem/types";
import { MUSIC_TRACKS } from "@/lib/music/library";
import type { CastLid, Film, Scene, Shot } from "./types";

const tekst = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function leesCast(ruw: unknown, bestaand: CastLid[]): CastLid[] {
  const lijst = (Array.isArray(ruw) ? ruw : []).slice(0, 12).map((x): CastLid | null => {
    const o = (x ?? {}) as Record<string, unknown>;
    const naam = tekst(o.naam, 40);
    if (!naam) return null;
    const oud = bestaand.find((c) => c.naam.toLowerCase() === naam.toLowerCase());
    const stem = tekst(o.stem, 80) || oud?.stem;
    // Eigen getrainde stemmen spreken via MiniMax; de film spreekt (nog) alleen via ElevenLabs.
    if (stem && String(stem).startsWith(EIGEN)) throw new Error(`Eigen stemmen kunnen nog niet in een film. Kies voor ${naam} een stem uit de bibliotheek.`);
    if (stem && !isBibliotheekStem(stem)) throw new Error(`Onbekende stem voor ${naam}: zoek er een met zoek_stemmen.`);
    return {
      naam,
      soort: o.soort === "wezen" ? "wezen" : "personage",
      rol: tekst(o.rol, 160) || oud?.rol || "",
      uiterlijk: tekst(o.uiterlijk, 600) || oud?.uiterlijk || "",
      ...(o.geslacht === "vrouw" || o.geslacht === "man" ? { geslacht: o.geslacht } : oud?.geslacht ? { geslacht: oud.geslacht } : {}),
      ...(stem ? { stem } : {}),
      ...(typeof o.portret === "string" && /^https:\/\//.test(o.portret) ? { portret: o.portret } : oud?.portret ? { portret: oud.portret } : {}),
    };
  }).filter((c): c is CastLid => !!c && !!c.uiterlijk);
  // Wie niet genoemd is, blijft staan.
  return [...bestaand.filter((b) => !lijst.some((c) => c.naam.toLowerCase() === b.naam.toLowerCase())), ...lijst];
}

export function leesScene(ruw: Record<string, unknown>, film: Film): Omit<Scene, "status"> {
  const nummer = Math.round(Number(ruw.nummer));
  if (!(nummer >= 1 && nummer <= 200)) throw new Error("Geef de scène een nummer (1, 2, 3…).");
  const namen = film.cast.map((c) => c.naam);
  const vind = (n: unknown) => namen.find((m) => m.toLowerCase() === String(n ?? "").trim().toLowerCase());
  const shots: Shot[] = (Array.isArray(ruw.shots) ? ruw.shots : []).slice(0, 40).map((x, i): Shot => {
    const o = (x ?? {}) as Record<string, unknown>;
    const d = (o.dialoog ?? null) as { wie?: unknown; tekst?: unknown } | null;
    const wie = d ? vind(d.wie) : undefined;
    if (d && tekst(d.tekst, 400) && !wie) throw new Error(`Shot ${i + 1}: "${String(d.wie)}" staat niet in de cast. Voeg het personage eerst toe met film_cast.`);
    if (wie && !film.cast.find((c) => c.naam === wie)?.stem) throw new Error(`${wie} heeft nog geen stem. Kies er een (zoek_stemmen) en zet hem met film_cast.`);
    const inBeeld = (Array.isArray(o.in_beeld) ? o.in_beeld : []).map(vind).filter((n): n is string => !!n);
    return {
      id: tekst(o.id, 20) || `s${i + 1}`,
      beeld: tekst(o.beeld, 700),
      beweging: tekst(o.beweging, 300),
      inBeeld: wie && !inBeeld.includes(wie) ? [wie, ...inBeeld] : inBeeld,
      ...(wie ? { dialoog: { wie, tekst: tekst(d!.tekst, 400) } } : {}),
      ...(tekst(o.verteller, 300) ? { verteller: tekst(o.verteller, 300) } : {}),
      duur: Math.min(4.2, Math.max(1.5, Number(o.duur) || 3)),
    };
  }).filter((s) => s.beeld);
  if (!shots.length) throw new Error("Een scène heeft minstens één shot nodig.");
  const ids = new Set<string>();
  for (const s of shots) {
    if (ids.has(s.id)) throw new Error(`Shot-id ${s.id} komt twee keer voor.`);
    ids.add(s.id);
  }
  const muziek = tekst(ruw.muziek, 40);
  return {
    nummer,
    titel: tekst(ruw.titel, 80) || `Scène ${nummer}`,
    samenvatting: tekst(ruw.samenvatting, 600),
    plek: tekst(ruw.plek, 400),
    ...(muziek && MUSIC_TRACKS.some((m) => m.category === muziek) ? { muziek } : {}),
    shots,
  };
}
