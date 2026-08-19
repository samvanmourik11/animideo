// Waar komt een nieuw element terecht?
//
// Antwoord: over de clip waar de tijdbalk op staat. Dat is wat een editor
// verwacht — je zet de speelkop op het moment dat je wilt aankleden en plaatst
// het daar. Staat de tijdbalk in een gat of is de tijdlijn leeg, dan pakken we
// de eerste clip, zodat het plaatsen nooit stilletjes niets doet.

import type { EditorStore } from "./store";

export function huidigeClipId(store: EditorStore): string | null {
  const { doc, currentTime } = store.getState();
  const spoor = doc.tracks.find((t) => t.kind === "video");
  if (!spoor) return null;
  const onder = spoor.clips.find((c) => currentTime >= c.start && currentTime < c.start + c.duration);
  return onder?.id ?? spoor.clips[0]?.id ?? null;
}

/** Heeft dit project al beeld om iets overheen te leggen? */
export function heeftBeeld(store: EditorStore): boolean {
  return (store.getState().doc.tracks.find((t) => t.kind === "video")?.clips.length ?? 0) > 0;
}
