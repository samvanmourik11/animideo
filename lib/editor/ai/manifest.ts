// ── Wat de AI van de montage te zien krijgt ──────────────────────────────────
//
// Niet het ruwe Timeline Document (te groot, te veel ruis, en vol velden waar
// een taalmodel niets mee kan), maar een compacte samenvatting: per clip zijn
// id, waar hij staat, hoe lang hij duurt en waar hij over gaat.
//
// Dat laatste is ons voordeel op elke concurrent: de clips komen uit onze eigen
// pijplijn, dus de gesproken tekst en de beeld-prompt staan al in `clip.meta`
// (zie lib/editor/timeline.ts). Een concurrent moet de video analyseren om te
// weten wat erin gebeurt; wij hebben het gewoon.
//
// De id's zijn heilig: daarmee wijst het model een clip aan in een op. Vandaar
// dat ze letterlijk in het manifest staan en nergens worden afgekort.

import { computeDuration, type Clip, type TimelineDoc, type TrackKind } from "../timeline";

export interface ManifestClip {
  id: string;
  /** Menselijke naam: uit meta.label, anders het scènenummer, anders het type. */
  label: string;
  start: number;
  duration: number;
  kind: Clip["type"];
  /** Gesproken tekst of de tekst in beeld, ingekort. */
  tekst?: string;
  /** Waar het beeld over gaat (de generatie-prompt), ingekort. */
  beeld?: string;
}

export interface TimelineManifest {
  ratio: string;
  fps: number;
  totaal: number;
  sporen: { naam: string; kind: TrackKind; clips: ManifestClip[] }[];
}

const MAX_TEKST = 90;

function kort(waarde: string | undefined, max = MAX_TEKST): string | undefined {
  if (!waarde) return undefined;
  const schoon = waarde.replace(/\s+/g, " ").trim();
  if (!schoon) return undefined;
  return schoon.length <= max ? schoon : `${schoon.slice(0, max - 1)}…`;
}

function labelVoor(clip: Clip, index: number): string {
  const uitMeta = kort(clip.meta?.label, 40);
  if (uitMeta) return uitMeta;
  if (clip.meta?.sceneIndex) return `Scène ${clip.meta.sceneIndex}`;
  if (clip.type === "text") return kort(clip.text, 40) ?? "Tekst";
  return `Clip ${index + 1}`;
}

export function buildManifest(doc: TimelineDoc): TimelineManifest {
  return {
    ratio: doc.ratio,
    fps: doc.fps,
    totaal: computeDuration(doc),
    sporen: doc.tracks
      .filter((t) => t.clips.length > 0)
      .map((track) => ({
        naam: track.name,
        kind: track.kind,
        clips: [...track.clips]
          .sort((a, b) => a.start - b.start)
          .map((clip, i) => ({
            id: clip.id,
            label: labelVoor(clip, i),
            start: clip.start,
            duration: clip.duration,
            kind: clip.type,
            tekst: kort(clip.type === "text" ? clip.text : clip.meta?.transcript),
            beeld: kort(clip.meta?.genPrompt, 60),
          })),
      })),
  };
}

/** 74.5 → "1:14" */
export function tijdstip(seconden: number): string {
  const s = Math.max(0, Math.round(seconden));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Het manifest als platte tekst voor in de prompt. Bewust geen JSON: een tabel
 * is een stuk goedkoper in tokens en leest voor een model net zo goed.
 */
export function manifestAlsTekst(doc: TimelineDoc): string {
  const m = buildManifest(doc);
  const regels: string[] = [
    `Video ${m.ratio}, ${m.fps} fps, totale lengte ${tijdstip(m.totaal)} (${m.totaal.toFixed(1)}s)`,
  ];

  for (const spoor of m.sporen) {
    regels.push(`${spoor.naam.toUpperCase()} (${spoor.kind})`);
    for (const c of spoor.clips) {
      const stuk = [
        `  ${c.id}`,
        `${tijdstip(c.start)}-${tijdstip(c.start + c.duration)}`,
        `${c.duration.toFixed(1)}s`,
        c.label,
      ];
      if (c.tekst) stuk.push(`— "${c.tekst}"`);
      else if (c.beeld) stuk.push(`— beeld: ${c.beeld}`);
      regels.push(stuk.join("  "));
    }
  }

  if (m.sporen.length === 0) regels.push("(nog geen clips op de tijdlijn)");
  return regels.join("\n");
}

/**
 * Zoekt clips waarvan de gesproken tekst een zoekterm bevat. Hiermee kan de AI
 * "de scène waarin ze de prijs noemt" omzetten naar een clip-id vóór ze iets
 * verandert — het meest gevraagde dat er is volgens het marktonderzoek.
 */
export function zoekInTekst(doc: TimelineDoc, term: string): ManifestClip[] {
  const naald = term.toLowerCase().trim();
  if (!naald) return [];
  return buildManifest(doc)
    .sporen.flatMap((s) => s.clips)
    .filter((c) => `${c.tekst ?? ""} ${c.beeld ?? ""} ${c.label}`.toLowerCase().includes(naald));
}
