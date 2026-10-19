// De verborgen opdrachten achter het receptenboek (lib/creaties/recepten.ts). Alleen op
// de server gebruiken: dit is het werk dat een effect goed maakt, dat hoort niet in de
// browser van iedereen die de pagina opent.
//
// Bij gezichten staat er steeds bij dat de identiteit gelijk moet blijven: zonder die
// zin tekende het model een willekeurig ander gezicht in de stijl.

import { CREDIT_COSTS } from "@/lib/credit-costs";
import { videoModel } from "@/lib/video-modellen";
import { recept, EFFECT_MODEL } from "./recepten";
import type { Opdracht } from "./makers";

const ZELFDE_PERSOON =
  "Keep the person's face, identity, age, skin tone and hairstyle exactly recognizable as the person in the reference photo.";

// Beeldrecepten: wat er van de foto gemaakt moet worden. {tekst} = het extra veld van de klant.
const BEELD: Record<string, (tekst: string) => string> = {
  productfoto: (t) =>
    `Professional e-commerce studio product photograph of the exact product from the reference photo. Keep the product's shape, colors, label and logo exactly the same. Clean ${t || "soft neutral light-grey"} background, soft diffused studio lighting, subtle realistic shadow, sharp focus, high-end commercial look.`,
  "product-sfeer": (t) =>
    `Realistic lifestyle photograph of the exact product from the reference photo, placed naturally ${t || "on a table in a bright, modern Dutch living room"}. Keep the product's shape, colors, label and logo exactly the same. Natural daylight, shallow depth of field, editorial advertising quality.`,
  billboard: () =>
    "A large roadside billboard along a Dutch highway (the A2) displaying exactly the image from the reference photo as the advertisement. Flat green polder landscape, cloudy Dutch sky, a few cars passing. Photorealistic, the advert is clearly visible and undistorted.",
  abri: () =>
    "An illuminated advertising poster inside a city bus shelter in a Dutch city at dusk, showing exactly the image from the reference photo as the poster. Wet street reflections, bicycles parked nearby, photorealistic.",
  profielfoto: () =>
    `Professional corporate headshot of the person from the reference photo. ${ZELFDE_PERSOON} Neat business-casual clothing, soft studio lighting, plain soft-grey background, looking at the camera with a friendly confident expression, shoulders visible, LinkedIn quality.`,
  vermeer: () =>
    `Oil painting in the style of Johannes Vermeer's 'Girl with a Pearl Earring': the person from the reference photo looking over the shoulder, blue and yellow turban, large pearl earring, dark background, soft light from the left, visible craquelure of an old masterpiece. ${ZELFDE_PERSOON}`,
  rembrandt: () =>
    `Oil painting portrait in the style of Rembrandt van Rijn: the person from the reference photo in 17th-century Dutch clothing with a white collar, dramatic chiaroscuro lighting, warm dark brown background, visible brush strokes. ${ZELFDE_PERSOON}`,
  "van-gogh": () =>
    "Repaint the reference photo as an oil painting in the style of Vincent van Gogh: thick impasto brush strokes, swirling expressive lines, vivid yellows and blues. Keep the composition and the subject recognizable.",
  "delfts-blauw": () =>
    "Turn the reference photo into a hand-painted Delft Blue (Delfts blauw) ceramic tile: cobalt-blue paint on glossy white glazed earthenware, traditional decorative corner ornaments, slight crackle in the glaze. Keep the subject recognizable. Show the full square tile.",
  koningsdag: () =>
    `Photorealistic photo of the person from the reference photo celebrating King's Day (Koningsdag) on a boat in the Amsterdam canals, wearing orange clothes and an orange crown, orange flags, cheerful crowd, sunny day, canal houses in the background. ${ZELFDE_PERSOON}`,
  elfstedentocht: () =>
    `Photorealistic photo of the person from the reference photo ice skating in the Elfstedentocht on a frozen Frisian canal, wearing a knitted hat with frost on it, pollard willows along the ice, crowds cheering on the bank, cold winter morning light. ${ZELFDE_PERSOON}`,
  pakjesavond: () =>
    `Warm cozy photo of the person or people from the reference photo on a Dutch Sinterklaas evening (pakjesavond): sitting by a fireplace with many wrapped presents, chocolate letters and pepernoten on the table, soft warm lamp light. ${ZELFDE_PERSOON}`,
  actiefiguur: (t) =>
    `A collectible action figure of the person from the reference photo, inside a blister-pack toy box with a clear plastic window, the figure standing in the box with accessories next to it${t ? `: ${t}` : ""}. Bold printed packaging with a name label. Product photo, studio lighting. ${ZELFDE_PERSOON}`,
  knuffel: () =>
    "Turn the subject from the reference photo into a soft, fluffy plush toy with stitched seams and button-like details, sitting on a bed. Keep its recognizable colors and features. Cute, cozy product photo.",
  // De eerste versie gaf gewoon de foto terug: het model hield de realistische look aan.
  // Daarom expliciet "geen foto" en de render-stijl benoemd.
  game: () =>
    `Completely restyle the image as a stylized 3D video game render, NOT a photograph: the person from the reference photo as a playable hero character with slightly exaggerated proportions, smooth stylized 3D shading, vibrant saturated colors, standing in a colorful fantasy game world with glowing collectibles, a health bar and score in the corner like an in-game screenshot. ${ZELFDE_PERSOON}`,
  tekenfilm: () =>
    `The person from the reference photo as a cheerful 3D animated movie character with big expressive eyes and soft stylized features, in a bright friendly scene. ${ZELFDE_PERSOON}`,
  outfit: (t) =>
    `The same photo of the same person, but wearing ${t}. Keep the pose, background, lighting and the person's face exactly the same. ${ZELFDE_PERSOON}`,
  "jaren-80": () =>
    `A faded 1985 school portrait photo of the person from the reference photo: 1980s hairstyle and clothing, laser blue background, soft focus, slightly washed-out film colors and scratches. ${ZELFDE_PERSOON}`,
  "huisdier-mens": () =>
    "Imagine the pet from the reference photo as a human being: a realistic portrait of a person whose hair color, expression and personality clearly match the pet. Place the original pet next to them. Natural photo.",
};

// Video-effecten: wat er in vijf seconden moet gebeuren met de foto als begin.
const VIDEO: Record<string, string> = {
  smelten:
    "The person slowly melts into a glossy liquid puddle, their body and clothes stretching and dripping down to the ground until only a shiny puddle remains. Static camera, realistic, smooth.",
  verdwijnen:
    "The person's body suddenly vanishes and their empty clothes collapse and fall flat onto the ground. Static camera, realistic, surprising.",
  "bullet-time":
    "Time freezes completely: everything stops mid-motion while the camera smoothly orbits 180 degrees around the subject in bullet-time style. Cinematic.",
  "uitzoomen-ruimte":
    "The camera rapidly pulls straight up and away from the scene, rising above the rooftops, through the clouds, until the curved Earth is visible from space. One continuous smooth move.",
  confetti:
    "A sudden explosion of colorful confetti and streamers bursts into the frame, the subject reacts happily, festive celebration. Camera slightly pushes in.",
  "tot-leven":
    "The portrait slowly comes to life: subtle breathing, the eyes blink naturally, a slight smile appears, hair moves gently. Keep the original style and framing.",
  "product-draai":
    "The product slowly rotates 360 degrees on a turntable in a clean minimal studio with soft lighting. The product's shape, colors and label stay exactly the same.",
};

/** Bouwt de opdracht voor een recept. Gooit met een Nederlandse melding bij foute invoer. */
export function receptOpdracht(ruw: Record<string, unknown>): Opdracht {
  const r = recept(ruw.receptId);
  if (!r) throw new Error("Dit effect bestaat niet (meer).");

  const fotoUrl = typeof ruw.fotoUrl === "string" ? ruw.fotoUrl.trim() : "";
  if (!/^https:\/\//.test(fotoUrl)) throw new Error("Kies eerst een foto.");
  const tekst = typeof ruw.tekst === "string" ? ruw.tekst.trim().slice(0, 300) : "";
  if (r.tekst?.verplicht && !tekst) throw new Error(`Vul eerst in: ${r.tekst.label.toLowerCase()}`);
  if (r.gezicht && ruw.toestemming !== true) {
    throw new Error("Bevestig eerst dat je toestemming hebt van wie er op de foto staat.");
  }
  const formaat = ["1:1", "9:16", "16:9"].includes(ruw.formaat as string) ? (ruw.formaat as string) : "1:1";
  const invoer = { receptId: r.id, fotoUrl, tekst, formaat, toestemming: ruw.toestemming === true };

  if (r.soort === "video") {
    const model = videoModel(EFFECT_MODEL);
    return {
      soort: "video",
      endpoint: model.slug,
      falInvoer: model.invoer({ image_url: fotoUrl, prompt: VIDEO[r.id] }),
      credits: model.credits,
      prompt: r.naam,
      invoer,
    };
  }

  const pro = r.credits === CREDIT_COSTS.IMAGE_GENERATION_PRO;
  return {
    soort: "beeld",
    endpoint: pro ? "fal-ai/nano-banana-pro/edit" : "fal-ai/nano-banana/edit",
    falInvoer: {
      prompt: BEELD[r.id](tekst),
      image_urls: [fotoUrl],
      num_images: 1,
      output_format: "jpeg",
      ...(pro ? { resolution: "2K" } : {}),
    },
    credits: r.credits,
    prompt: tekst ? `${r.naam}: ${tekst}` : r.naam,
    invoer,
  };
}

/** Voor de test: elk recept heeft een opdracht. */
export function heeftOpdracht(id: string, soort: "beeld" | "video"): boolean {
  return soort === "video" ? !!VIDEO[id] : !!BEELD[id];
}
