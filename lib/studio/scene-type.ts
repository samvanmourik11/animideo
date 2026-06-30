// Wisselen tussen een "normale" AI-scène en een ontworpen opsommingsscène.
// Best-effort conversie: bij omzetten naar bullets leiden we titel + punten uit
// de voice-over af. De AI-prompt/beeld wordt bewaard (saved_*) zodat terugschakelen
// de oorspronkelijke prompt herstelt i.p.v. een generieke startprompt; alleen als
// er niets bewaard is, valt 'terug naar normaal' terug op een startprompt.

import type { Scene } from "@/lib/types";

const DEFAULT_MOTION =
  "Bring this still image to life with subtle, natural motion that fits its content: a slow push-in, pan or parallax.";

/** Normale AI-scène → ontworpen opsommingsscène (bullets). */
export function toBulletsScene(scene: Scene): Scene {
  const vo = (scene.voiceover_text || "").trim();
  const sentences = vo.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const title = (sentences[0] || "Belangrijkste punten").replace(/[.!?]+$/, "").slice(0, 48);
  const rest = sentences.length > 1 ? sentences.slice(1) : sentences;
  let bullets = rest.slice(0, 5).map((s) => ({ text: s.replace(/[.!?]+$/, "").slice(0, 60), icon: "check" }));
  if (bullets.length === 0) bullets = [{ text: "", icon: "check" }, { text: "", icon: "check" }, { text: "", icon: "check" }];
  return {
    ...scene,
    designed: { kind: "bullets", title, subtitle: undefined, bullets },
    // Bewaar de AI-inhoud zodat terugschakelen die exact herstelt. Houd een al
    // eerder bewaarde waarde aan als de huidige leeg is (dubbele conversie).
    saved_image_prompt: scene.image_prompt || scene.saved_image_prompt,
    saved_motion_prompt: scene.motion_prompt || scene.saved_motion_prompt,
    saved_image_url: scene.image_url ?? scene.saved_image_url ?? null,
    saved_video_url: scene.video_url ?? scene.saved_video_url ?? null,
    image_prompt: "",
    motion_prompt: "",
    image_url: null,
    video_url: null,
  };
}

/** Ontworpen scène → normale AI-scène. Herstelt de bewaarde AI-prompt/beeld;
 *  valt alleen terug op een startprompt als er niets bewaard is. */
export function toNormalScene(scene: Scene): Scene {
  const vo = (scene.voiceover_text || "").trim();
  const savedPrompt = (scene.saved_image_prompt || "").trim();
  const savedMotion = (scene.saved_motion_prompt || "").trim();
  return {
    ...scene,
    designed: null,
    image_prompt: savedPrompt
      || (vo ? `Een schilderachtige scène die past bij: ${vo} Geen tekst of letters in beeld.` : ""),
    motion_prompt: savedMotion || DEFAULT_MOTION,
    image_url: scene.saved_image_url ?? null,
    video_url: scene.saved_video_url ?? null,
    // Bewaar-velden weer leegmaken nu ze hersteld zijn.
    saved_image_prompt: undefined,
    saved_motion_prompt: undefined,
    saved_image_url: undefined,
    saved_video_url: undefined,
  };
}
