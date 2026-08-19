// ── Invarianten van het Timeline Document ────────────────────────────────────
//
// EditorCore is straks de enige plek die het document muteert; UI én AI-chat
// gaan er allebei doorheen. Deze module beantwoordt twee vragen:
//
//   1. checkInvariants(doc) — klopt dit document?
//   2. normalize(doc)       — maak er, zonder inhoud te verliezen, een kloppend
//                             document van, en vertel wat er gerepareerd is.
//
// De scheiding is bewust. Een AI-op die een regel schendt hoort geweigerd te
// worden (het document blijft onaangeroerd), maar een bestaand klantproject dat
// al jaren op de tijdlijn staat mag nóóit weigeren te laden. Vandaar: hard
// weigeren bij mutaties, stil repareren bij het inlezen.
//
// Tijd blijft in SECONDEN staan (de compositor, de UI en de render rekenen er
// allemaal mee), maar elke waarde ligt op het frame-raster. Dat vangt de
// klassieke afrondingsdrift die je met floats krijgt, zonder het hele schema om
// te bouwen naar frames.

import type { Clip, TimelineDoc, Track } from "../timeline";

/** Een clip korter dan dit is in de praktijk een ongeluk (sleep-artefact). */
export const MIN_CLIP_FRAMES = 3;

export interface Violation {
  /** Machineleesbaar, zodat de AI-laag er een nette fout van kan maken. */
  code:
    | "duplicate_id"
    | "negative_start"
    | "too_short"
    | "off_grid"
    | "trim_out_of_bounds"
    | "overlap"
    | "gap";
  message: string;
  trackId?: string;
  clipId?: string;
}

/** Rond een tijd af op het dichtstbijzijnde frame. */
export function snapToFrame(seconds: number, fps: number): number {
  const f = fps > 0 ? fps : 30;
  return Math.round(seconds * f) / f;
}

/** Ligt deze tijd al op het frame-raster? Met marge voor float-representatie. */
export function onGrid(seconds: number, fps: number): boolean {
  return Math.abs(seconds - snapToFrame(seconds, fps)) < 1e-6;
}

/** De minimale clipduur in seconden bij deze fps. */
export function minDuration(fps: number): number {
  return MIN_CLIP_FRAMES / (fps > 0 ? fps : 30);
}

/**
 * Hoeveel bron een clip heeft. Alleen bekend voor video met `naturalDuration`;
 * bij audio en afbeeldingen weten we het (nog) niet en controleren we niets —
 * liever geen controle dan een controle op een verzonnen grens.
 */
function sourceLimit(clip: Clip): number | null {
  if (clip.type === "video" && typeof clip.naturalDuration === "number" && clip.naturalDuration > 0) {
    return clip.naturalDuration;
  }
  return null;
}

/** Het spoor dat de video draagt: het eerste videospoor van het document. */
export function mainVideoTrack(doc: TimelineDoc): Track | undefined {
  return doc.tracks.find((t) => t.kind === "video");
}

/**
 * Alle schendingen in dit document, in leesvolgorde. Leeg = geldig.
 *
 * `overlap` en `gap` zitten hier bewust in, ook al repareert normalize() ze
 * niet: het zijn dingen die de gebruiker met de muis kán maken en die de AI
 * niet zelf mag veroorzaken. Zie de opmerking bovenaan dit bestand.
 */
export function checkInvariants(doc: TimelineDoc): Violation[] {
  const out: Violation[] = [];
  const fps = doc.fps || 30;
  const min = minDuration(fps);
  const gezien = new Set<string>();
  const hoofdspoor = mainVideoTrack(doc);

  for (const track of doc.tracks) {
    const clips = [...track.clips].sort((a, b) => a.start - b.start);

    for (const clip of clips) {
      if (gezien.has(clip.id)) {
        out.push({ code: "duplicate_id", message: `Clip-id ${clip.id} komt meer dan één keer voor`, trackId: track.id, clipId: clip.id });
      }
      gezien.add(clip.id);

      if (clip.start < 0) {
        out.push({ code: "negative_start", message: `Clip ${clip.id} begint vóór het begin van de tijdlijn`, trackId: track.id, clipId: clip.id });
      }
      if (clip.duration < min - 1e-6) {
        out.push({ code: "too_short", message: `Clip ${clip.id} is korter dan ${MIN_CLIP_FRAMES} frames`, trackId: track.id, clipId: clip.id });
      }
      if (!onGrid(clip.start, fps) || !onGrid(clip.duration, fps)) {
        out.push({ code: "off_grid", message: `Clip ${clip.id} ligt niet op het frame-raster`, trackId: track.id, clipId: clip.id });
      }

      const limit = sourceLimit(clip);
      const trimIn = clip.trimIn ?? 0;
      if (trimIn < 0 || (limit !== null && trimIn + clip.duration > limit + 1e-6)) {
        out.push({ code: "trim_out_of_bounds", message: `Clip ${clip.id} wijst buiten zijn bronmateriaal`, trackId: track.id, clipId: clip.id });
      }
    }

    for (let i = 1; i < clips.length; i++) {
      const vorige = clips[i - 1];
      const huidige = clips[i];
      if (huidige.start < vorige.start + vorige.duration - 1e-6) {
        out.push({ code: "overlap", message: `Clip ${huidige.id} overlapt met ${vorige.id}`, trackId: track.id, clipId: huidige.id });
      }
    }

    // Alleen het hoofdvideospoor moet dicht zijn: een gat daar is zwart beeld,
    // en dat mag een niet-editor nooit overkomen. Op tekst-, overlay- en
    // audiosporen zijn gaten juist normaal.
    if (hoofdspoor && track.id === hoofdspoor.id && clips.length > 0) {
      if (clips[0].start > 1e-6) {
        out.push({ code: "gap", message: "De video begint niet op 0:00", trackId: track.id, clipId: clips[0].id });
      }
      for (let i = 1; i < clips.length; i++) {
        const eindVorige = clips[i - 1].start + clips[i - 1].duration;
        if (clips[i].start > eindVorige + 1e-6) {
          out.push({ code: "gap", message: `Zwart gat vóór clip ${clips[i].id}`, trackId: track.id, clipId: clips[i].id });
        }
      }
    }
  }

  return out;
}

export interface NormalizeResult {
  doc: TimelineDoc;
  /** Wat er is rechtgezet. Leeg = het document was al in orde. */
  repaired: Violation[];
}

/**
 * Maakt een document veilig bruikbaar zónder inhoud weg te gooien: tijden op
 * het frame-raster, geen negatieve starts, geen clips van bijna nul lengte, en
 * clips per spoor op volgorde.
 *
 * Overlappen en gaten laat normalize met opzet staan: die verplaatsen zou
 * betekenen dat het openen van een oud project de montage van de klant
 * verandert. Ze worden wel gemeld door checkInvariants.
 */
export function normalize(doc: TimelineDoc): NormalizeResult {
  const fps = doc.fps || 30;
  const min = minDuration(fps);
  const repaired: Violation[] = [];

  const tracks = doc.tracks.map((track) => {
    const clips = track.clips
      .map((clip) => {
        let next = clip;

        if (next.start < 0) {
          repaired.push({ code: "negative_start", message: `Clip ${next.id} naar 0:00 geschoven`, trackId: track.id, clipId: next.id });
          next = { ...next, start: 0 };
        }

        const start = snapToFrame(next.start, fps);
        const duration = Math.max(min, snapToFrame(next.duration, fps));
        if (start !== next.start || duration !== next.duration) {
          repaired.push({
            code: duration !== next.duration && next.duration < min ? "too_short" : "off_grid",
            message: `Clip ${next.id} op het frame-raster gezet`,
            trackId: track.id,
            clipId: next.id,
          });
          next = { ...next, start, duration };
        }

        const trimIn = next.trimIn ?? 0;
        if (trimIn < 0) {
          repaired.push({ code: "trim_out_of_bounds", message: `Bronpositie van clip ${next.id} teruggezet naar 0`, trackId: track.id, clipId: next.id });
          next = { ...next, trimIn: 0 };
        } else if (trimIn > 0 && !onGrid(trimIn, fps)) {
          next = { ...next, trimIn: snapToFrame(trimIn, fps) };
        }

        return next;
      })
      .sort((a, b) => a.start - b.start);

    return { ...track, clips };
  });

  return { doc: { ...doc, fps, tracks }, repaired };
}
