// ── Slepen vanuit een paneel naar het beeld ──────────────────────────────────
//
// Wat je in de zijbalk ziet kun je oppakken en op de plek in het beeld laten
// vallen waar je het wilt hebben. Dat scheelt de omweg "klik, en sleep hem
// daarna op zijn plek", en het is de manier waarop iedereen een ontwerpprogramma
// verwacht te bedienen.
//
// De lading gaat als JSON door de drag-and-drop van de browser heen. Bewust een
// eigen type erbij: zo weet het canvas zeker dat het om iets van ons gaat en
// niet om een bestand of een stuk tekst van buiten.

import type { DiagramMeta, TextStyle } from "./timeline";
import type { VormStijl } from "./shapes-svg";

export const SLEEP_TYPE = "application/x-animideo-element";

export type SleepLading =
  | { soort: "vorm"; vormId: string; stijl?: Partial<VormStijl>; label: string }
  | { soort: "beeld"; src: string; label: string; breedte?: number }
  | { soort: "diagram"; diagram: DiagramMeta }
  | { soort: "tekst"; tekst: string; stijl?: Partial<TextStyle> };

/** Zet de lading op het sleep-event; te gebruiken in onDragStart. */
export function pakOp(e: React.DragEvent, lading: SleepLading) {
  e.dataTransfer.setData(SLEEP_TYPE, JSON.stringify(lading));
  // Ook als platte tekst, anders weigert Firefox de sleep te starten.
  e.dataTransfer.setData("text/plain", lading.soort);
  e.dataTransfer.effectAllowed = "copy";
}

/** Leest de lading terug; geeft null als er iets anders wordt losgelaten. */
export function leesLading(e: React.DragEvent): SleepLading | null {
  const ruw = e.dataTransfer.getData(SLEEP_TYPE);
  if (!ruw) return null;
  try {
    const l = JSON.parse(ruw) as SleepLading;
    return l && typeof l === "object" && "soort" in l ? l : null;
  } catch {
    return null;
  }
}

/** Zit dit sleep-event over ons canvas met iets wat we kunnen plaatsen? */
export function isOnzeSleep(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(SLEEP_TYPE);
}
