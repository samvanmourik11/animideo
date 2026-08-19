// ── De edit-taal: operaties op het Timeline Document ─────────────────────────
//
// Eén commandolaag voor de muis én voor de AI-chat. Dat is het hele punt: wie
// de wijziging ook doet, het is hetzelfde op-object, dus dezelfde validatie,
// dezelfde ongedaan-maak-stap en dezelfde regel in de geschiedenis.
//
// Alles hier is puur: `applyOp` krijgt een document en geeft een nieuw document
// terug (of een fout). Geen React, geen Supabase, geen tijd, geen willekeur
// behalve het aanmaken van clip-id's — die kun je meegeven om een op exact te
// kunnen herhalen (replay van de geschiedenis moet hetzelfde document opleveren).
//
// Weigeren doen we alleen bij schendingen die deze op zélf veroorzaakt. Oude
// klantprojecten bevatten soms al een overlap uit de tijd dat de UI dat toestond;
// die mogen een nette bewerking niet blokkeren.

import type { Clip, TimelineDoc, Track, Transition } from "../timeline";
import {
  checkInvariants,
  mainVideoTrack,
  minDuration,
  snapToFrame,
  type Violation,
} from "./invariants";

export type Op =
  /** Clip achteraan een spoor plakken (assemblage). */
  | { op: "add_clip"; clip: Clip; trackId?: string }
  /** Clip weghalen; op het videospoor schuift de rest door (geen zwart gat). */
  | { op: "delete_clip"; clipId: string }
  /**
   * Materiaal weghalen aan één kant. `deltaSeconds` positief = korter maken,
   * negatief = terugzetten. Zo praat een editor erover ("de intro 2 seconden
   * korter"), en zo formuleert de AI het straks ook.
   */
  | { op: "trim_clip"; clipId: string; edge: "in" | "out"; deltaSeconds: number }
  /** Exacte lengte zetten ("maak deze scène 3 seconden"). */
  | { op: "set_duration"; clipId: string; duration: number }
  /** Clip in tweeën knippen op absolute tijd. */
  | { op: "split_clip"; clipId: string; at: number; newClipId?: string }
  /** Volgorde op het videospoor: zet clip vóór een andere clip (of achteraan). */
  | { op: "reorder_clip"; clipId: string; beforeClipId?: string | null }
  /** Vrije positie op overlay-, tekst- en audiosporen. */
  | { op: "move_clip"; clipId: string; start: number }
  /** Overgang op een clipgrens; `kind: null` haalt hem weg. */
  | { op: "set_transition"; clipId: string; edge: "in" | "out"; kind: "fade" | null; duration?: number };

export type OpKind = Op["op"];

export interface OpError {
  code: "not_found" | "invalid" | "would_break";
  message: string;
  violations?: Violation[];
}

export type OpResult =
  | { ok: true; doc: TimelineDoc; summary: string }
  | { ok: false; error: OpError };

const fout = (code: OpError["code"], message: string, violations?: Violation[]): OpResult => ({
  ok: false,
  error: { code, message, ...(violations?.length ? { violations } : {}) },
});

// ── Hulpjes ──────────────────────────────────────────────────────────────────

function vind(doc: TimelineDoc, clipId: string): { track: Track; clip: Clip } | null {
  for (const track of doc.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

function vervangSpoor(doc: TimelineDoc, trackId: string, clips: Clip[]): TimelineDoc {
  return { ...doc, tracks: doc.tracks.map((t) => (t.id === trackId ? { ...t, clips } : t)) };
}

/**
 * Clips tegen elkaar aan zetten vanaf 0, in de volgorde waarin ze staan.
 *
 * Bewust GEEN sortering op starttijd hier: reorder_clip geeft de gewenste
 * volgorde al door, en sorteren zou die meteen weer ongedaan maken. Wie op
 * tijdsvolgorde wil pakken, sorteert er zelf eerst doorheen.
 */
function pak(clips: Clip[], fps: number): Clip[] {
  let cursor = 0;
  return clips.map((c) => {
    const geplaatst = { ...c, start: snapToFrame(cursor, fps) };
    cursor += c.duration;
    return geplaatst;
  });
}

/** Kopie op tijdsvolgorde — de volgorde zoals de kijker hem ziet. */
function opTijd(clips: Clip[]): Clip[] {
  return [...clips].sort((a, b) => a.start - b.start);
}

/** Is dit het spoor dat de video draagt? Daar geldt "nooit een gat". */
function isHoofdspoor(doc: TimelineDoc, track: Track): boolean {
  return mainVideoTrack(doc)?.id === track.id;
}

/** Bronlengte van een clip, voor zover bekend. */
function bronLimiet(clip: Clip): number | null {
  return clip.type === "video" && clip.naturalDuration ? clip.naturalDuration : null;
}

/**
 * Schendingen die er vóór deze op nog niet waren. Alleen díe blokkeren — anders
 * zou één oud project met een overlap elke verdere bewerking onmogelijk maken.
 */
function nieuweSchendingen(voor: TimelineDoc, na: TimelineDoc): Violation[] {
  const sleutel = (v: Violation) => `${v.code}|${v.clipId ?? ""}|${v.trackId ?? ""}`;
  const bekend = new Set(checkInvariants(voor).map(sleutel));
  return checkInvariants(na).filter((v) => !bekend.has(sleutel(v)));
}

function seconden(n: number): string {
  return `${n.toFixed(1).replace(".", ",")}s`;
}

// ── De ops ───────────────────────────────────────────────────────────────────

/**
 * Past één op toe. Geeft óf een nieuw document terug, óf een fout waarbij het
 * oorspronkelijke document gegarandeerd onaangeroerd blijft.
 */
export function applyOp(doc: TimelineDoc, op: Op): OpResult {
  const fps = doc.fps || 30;
  const min = minDuration(fps);

  const uitkomst = ((): OpResult => {
    switch (op.op) {
      case "add_clip": {
        const spoor =
          (op.trackId && doc.tracks.find((t) => t.id === op.trackId)) ||
          doc.tracks.find((t) => t.kind === (op.clip.type === "audio" ? "audio" : op.clip.type === "text" ? "text" : "video"));
        if (!spoor) return fout("not_found", "Geen spoor gevonden om deze clip op te plaatsen");
        if (vind(doc, op.clip.id)) return fout("invalid", `Er bestaat al een clip met id ${op.clip.id}`);

        const eind = spoor.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
        const clip: Clip = {
          ...op.clip,
          start: snapToFrame(eind, fps),
          duration: Math.max(min, snapToFrame(op.clip.duration, fps)),
        };
        return {
          ok: true,
          doc: vervangSpoor(doc, spoor.id, [...spoor.clips, clip]),
          summary: `Clip toegevoegd op ${seconden(clip.start)}`,
        };
      }

      case "delete_clip": {
        const gevonden = vind(doc, op.clipId);
        if (!gevonden) return fout("not_found", `Clip ${op.clipId} bestaat niet`);
        const over = gevonden.track.clips.filter((c) => c.id !== op.clipId);
        const clips = isHoofdspoor(doc, gevonden.track) ? pak(opTijd(over), fps) : over;
        return {
          ok: true,
          doc: vervangSpoor(doc, gevonden.track.id, clips),
          summary: `Clip van ${seconden(gevonden.clip.duration)} verwijderd`,
        };
      }

      case "trim_clip": {
        const gevonden = vind(doc, op.clipId);
        if (!gevonden) return fout("not_found", `Clip ${op.clipId} bestaat niet`);
        const { track, clip } = gevonden;
        const delta = snapToFrame(op.deltaSeconds, fps);
        if (delta === 0) return fout("invalid", "Een trim van 0 seconden doet niets");

        const nieuweDuur = snapToFrame(clip.duration - delta, fps);
        if (nieuweDuur < min) return fout("invalid", `Daar blijft niets van de clip over (minimaal ${seconden(min)})`);

        let bewerkt: Clip;
        if (op.edge === "in") {
          // Aan de voorkant snijden schuift óók de bronpositie mee, anders zie je
          // hetzelfde beeld alleen korter in plaats van later beginnen.
          const trimIn = snapToFrame((clip.trimIn ?? 0) + delta, fps);
          if (trimIn < 0) return fout("invalid", "Vóór het begin van het bronmateriaal kan niet");
          bewerkt = { ...clip, start: snapToFrame(clip.start + delta, fps), duration: nieuweDuur, trimIn };
        } else {
          const limiet = bronLimiet(clip);
          if (limiet !== null && (clip.trimIn ?? 0) + nieuweDuur > limiet + 1e-6) {
            return fout("invalid", "Langer dan het bronmateriaal kan niet");
          }
          bewerkt = { ...clip, duration: nieuweDuur };
        }

        const clips = track.clips.map((c) => (c.id === clip.id ? bewerkt : c));
        return {
          ok: true,
          doc: vervangSpoor(doc, track.id, isHoofdspoor(doc, track) ? pak(opTijd(clips), fps) : clips),
          summary: `Clip ${delta > 0 ? "ingekort" : "verlengd"} met ${seconden(Math.abs(delta))} aan de ${op.edge === "in" ? "voorkant" : "achterkant"}`,
        };
      }

      case "set_duration": {
        const gevonden = vind(doc, op.clipId);
        if (!gevonden) return fout("not_found", `Clip ${op.clipId} bestaat niet`);
        const duur = snapToFrame(op.duration, fps);
        if (duur < min) return fout("invalid", `Korter dan ${seconden(min)} kan niet`);
        const limiet = bronLimiet(gevonden.clip);
        if (limiet !== null && (gevonden.clip.trimIn ?? 0) + duur > limiet + 1e-6) {
          return fout("invalid", "Langer dan het bronmateriaal kan niet");
        }
        const clips = gevonden.track.clips.map((c) => (c.id === op.clipId ? { ...c, duration: duur } : c));
        return {
          ok: true,
          doc: vervangSpoor(doc, gevonden.track.id, isHoofdspoor(doc, gevonden.track) ? pak(opTijd(clips), fps) : clips),
          summary: `Clipduur op ${seconden(duur)} gezet`,
        };
      }

      case "split_clip": {
        const gevonden = vind(doc, op.clipId);
        if (!gevonden) return fout("not_found", `Clip ${op.clipId} bestaat niet`);
        const { track, clip } = gevonden;
        const lokaal = snapToFrame(op.at - clip.start, fps);
        if (lokaal < min || lokaal > clip.duration - min) {
          return fout("invalid", "Het knippunt ligt te dicht bij het begin of eind van de clip");
        }
        const tweedeId = op.newClipId ?? `${clip.id}-b`;
        if (vind(doc, tweedeId)) return fout("invalid", `Er bestaat al een clip met id ${tweedeId}`);

        const eerste: Clip = { ...clip, duration: lokaal };
        const tweede: Clip = {
          ...clip,
          id: tweedeId,
          start: snapToFrame(clip.start + lokaal, fps),
          duration: snapToFrame(clip.duration - lokaal, fps),
          ...(clip.type === "video" || clip.type === "audio"
            ? { trimIn: snapToFrame((clip.trimIn ?? 0) + lokaal, fps) }
            : {}),
        };
        const clips = track.clips.flatMap((c) => (c.id === clip.id ? [eerste, tweede] : [c]));
        return {
          ok: true,
          doc: vervangSpoor(doc, track.id, clips),
          summary: `Clip geknipt op ${seconden(op.at)}`,
        };
      }

      case "reorder_clip": {
        const gevonden = vind(doc, op.clipId);
        if (!gevonden) return fout("not_found", `Clip ${op.clipId} bestaat niet`);
        const { track, clip } = gevonden;
        const zonder = opTijd(track.clips).filter((c) => c.id !== clip.id);

        let index = zonder.length; // zonder doel: achteraan
        if (op.beforeClipId) {
          index = zonder.findIndex((c) => c.id === op.beforeClipId);
          if (index < 0) return fout("not_found", `Clip ${op.beforeClipId} bestaat niet`);
        }
        const opnieuw = [...zonder.slice(0, index), clip, ...zonder.slice(index)];
        return {
          ok: true,
          doc: vervangSpoor(doc, track.id, pak(opnieuw, fps)),
          summary: op.beforeClipId ? "Clip naar voren gehaald" : "Clip naar achteren gezet",
        };
      }

      case "move_clip": {
        const gevonden = vind(doc, op.clipId);
        if (!gevonden) return fout("not_found", `Clip ${op.clipId} bestaat niet`);
        if (isHoofdspoor(doc, gevonden.track)) {
          return fout("invalid", "Op het videospoor bepaalt de volgorde de plek; gebruik reorder_clip");
        }
        const start = Math.max(0, snapToFrame(op.start, fps));
        const clips = gevonden.track.clips.map((c) => (c.id === op.clipId ? { ...c, start } : c));
        return {
          ok: true,
          doc: vervangSpoor(doc, gevonden.track.id, clips),
          summary: `Clip verplaatst naar ${seconden(start)}`,
        };
      }

      case "set_transition": {
        const gevonden = vind(doc, op.clipId);
        if (!gevonden) return fout("not_found", `Clip ${op.clipId} bestaat niet`);
        const { track, clip } = gevonden;
        let overgang: Transition | undefined;
        if (op.kind) {
          // Een overgang mag nooit langer zijn dan de helft van de clip: anders
          // is de clip al aan het uitfaden voor hij goed en wel in beeld is.
          const duur = Math.min(op.duration ?? 0.5, clip.duration / 2);
          overgang = { kind: op.kind, duration: snapToFrame(Math.max(min, duur), fps) };
        }
        const veld = op.edge === "in" ? "transitionIn" : "transitionOut";
        const clips = track.clips.map((c) => (c.id === clip.id ? { ...c, [veld]: overgang } : c));
        return {
          ok: true,
          doc: vervangSpoor(doc, track.id, clips),
          summary: op.kind ? `Overgang aan de ${op.edge === "in" ? "voorkant" : "achterkant"} gezet` : "Overgang weggehaald",
        };
      }
    }
  })();

  if (!uitkomst.ok) return uitkomst;

  const kapot = nieuweSchendingen(doc, uitkomst.doc);
  if (kapot.length > 0) {
    return fout("would_break", `Deze bewerking zou de tijdlijn kapotmaken: ${kapot[0].message}`, kapot);
  }
  return uitkomst;
}

/**
 * Reeks ops achter elkaar. Stopt bij de eerste fout en geeft het document terug
 * zoals het vóór die fout was — half uitgevoerde AI-opdrachten leveren anders
 * een montage op die niemand heeft bedoeld.
 */
export function applyOps(
  doc: TimelineDoc,
  ops: Op[]
): { ok: true; doc: TimelineDoc; summaries: string[] } | { ok: false; error: OpError; appliedBefore: number } {
  let huidig = doc;
  const summaries: string[] = [];
  for (let i = 0; i < ops.length; i++) {
    const res = applyOp(huidig, ops[i]);
    if (!res.ok) return { ok: false, error: res.error, appliedBefore: i };
    huidig = res.doc;
    summaries.push(res.summary);
  }
  return { ok: true, doc: huidig, summaries };
}
