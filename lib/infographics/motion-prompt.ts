// Bouwt de prompt voor de image-to-video (Seedance Lite) van een story-scene.
//
// FILOSOFIE: het beeld subtiel tot leven brengen volgens de LOGICA van het
// plaatje zelf. Het model kijkt naar wat er in deze specifieke scene staat en
// beweegt alleen wat daar logischerwijs zou bewegen, op een manier die bij dat
// element past. We verzinnen GEEN generieke sfeerbeweging (drijvende bladeren,
// wolken, rook) bij. Dat was de oude valkuil: een vast "leaves/clouds drift"-
// lijstje liet Seedance juist decoratie terugbrengen die we niet willen.
//
// Seedance kent geen negative_prompt, dus we sturen met een strikte positieve
// instructie + een vaste (locked) camera in de route. De gebruiker kan optioneel
// bijsturen wat er wel/niet mag bewegen.

const PRESERVE_RULE =
  "STRICT RULE — do not add, draw, invent, generate or duplicate ANYTHING that is not already in the source image. No new text, letters, words, numbers, labels, captions, charts, graphs, bars, icons, characters or objects. Above all, do NOT add any decorative elements such as leaves, plants, flowers, clouds, sky, smoke, steam, mist, bubbles, sparkles or floating shapes — if they are not in the source image, they must not appear. Do NOT redraw, restyle, warp or morph any existing text, numbers, chart bars or shapes — keep all of them perfectly still, sharp and identical to the source. Preserve every shape, color, line, position and the exact composition unchanged.";

const STYLE_RULE =
  "Flat 2D animated explainer-video style. Static locked camera, no camera movement, no zoom, no pan, no parallax. No 3D, no realism, no new lighting. Smooth, subtle, seamless loop.";

// Géén opsomming van bladeren/wolken/rook meer. We dwingen het model naar de
// interne logica van het beeld: alleen bewegen wat er realistisch zou bewegen.
const DEFAULT_MOTION =
  "Study what this specific image actually depicts and bring it gently to life with motion that follows the internal logic of the scene. Move ONLY the elements that would naturally move, and only in the way they realistically would: a person may breathe, blink or shift their weight a little; a hand or a held object may tilt or settle slightly; a poured or contained liquid may ripple; a wheel, gear or dial may turn slowly; a falling or floating object that is already shown may drift along its natural path. Everything else stays completely still. Keep every motion small, slow, smooth and natural — a calm living-illustration feel. Do not invent ambient motion or extra elements to animate.";

export function buildMotionPrompt(steer?: string): string {
  const extra = (steer || "").trim();
  // De vuistregel staat zowel voor- als achteraan, zodat hij het zwaarst weegt.
  const motion = extra
    ? `Apply motion to the existing illustration as follows: ${extra}. ${DEFAULT_MOTION}`
    : DEFAULT_MOTION;
  return `Animate ONLY the existing image. ${motion} ${STYLE_RULE} ${PRESERVE_RULE}`.slice(0, 2500);
}
