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

// Tekst die letterlijk in het beeld moet. Dubbele aanhalingstekens zouden de opdracht
// breken, en zonder "exactly as written" verbeterde het model Nederlandse woorden naar
// Engels of liet het letters weg.
function opschrift(t: string): string {
  return `the following Dutch text, spelled exactly as written and clearly legible: "${t.replace(/"/g, "'")}"`;
}

// Een gebouw of straat moet herkenbaar blijven: de klant laat het aan zíjn klant zien.
const ZELFDE_PLEK =
  "Keep the building, its architecture, windows, roof shape, street layout and camera angle exactly the same as in the reference photo. Photorealistic.";

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

  // ── Ronde 2 ──
  "webwinkel-foto": () =>
    "E-commerce product photo of exactly the product from the reference photo on a pure white background (#FFFFFF), centered, filling about 85% of the square frame, sharp focus, soft even studio lighting, a very subtle natural shadow underneath, no props, no text, no reflections of the photographer. Keep the product's shape, colors, label and logo exactly the same.",
  "product-model": (t) =>
    `Professional fashion/lifestyle photograph of a model ${t ? `(${t}) ` : ""}wearing or holding exactly the product from the reference photo. Keep the product's shape, colors, pattern, label and logo exactly the same; it is clearly visible and the hero of the image. Natural pose, flattering soft light, editorial quality, AI-generated fictional model.`,
  merch: (t) =>
    `Realistic product mockup photo of ${t} with exactly the design or logo from the reference image printed on it. Keep the design's shapes, colors and any text exactly the same, printed naturally following the material's folds and curvature. Clean, bright studio or lifestyle setting, commercial quality.`,
  "logo-3d": () =>
    "Turn the logo from the reference image into a premium 3D object: thick extruded shapes with glossy materials and soft bevels, keeping the exact shapes, proportions, colors and any letters of the logo. Floating slightly above a clean surface, soft studio lighting, subtle reflections, centered. Spell any text exactly as in the logo.",
  etalage: () =>
    "The product from the reference photo beautifully displayed in the shop window of a charming boutique in a Dutch shopping street at dusk, warm spotlights on the product, reflections of the street and bicycles in the glass. Keep the product's shape, colors, label and logo exactly the same. Photorealistic.",
  "oude-foto": () =>
    "Restore this old photograph: remove all scratches, tears, creases, dust, stains and fading, repair missing parts, sharpen naturally. Keep the composition, every person's face and identity, and the original character of the photo exactly the same. If it is black and white, keep it black and white.",
  inkleuren: () =>
    "Colorize this black-and-white photograph with natural, historically plausible colors: realistic skin tones, clothing, sky and surroundings. Keep everything else exactly the same: composition, faces, details and grain.",
  "schets-foto": () =>
    "Turn the sketch or drawing from the reference image into a realistic photograph of the same subject, keeping the composition, shapes, proportions and layout exactly as drawn. Natural lighting and realistic materials and textures.",
  "kamer-stijl": (t) =>
    `Redesign the interior of the room in the reference photo in ${t} style: new furniture, colors, textiles, lighting and decoration. Keep the walls, windows, doors, floor plan and camera angle exactly the same. Photorealistic interior design photography.`,
  "negen-poses": () =>
    `A 3x3 grid of nine different photos of the person from the reference photo: different poses, angles and expressions (smiling, laughing, profile, looking away, close-up, half body), same outfit and setting, consistent lighting, social-media photoshoot style, thin white lines between the photos. ${ZELFDE_PERSOON}`,
  klederdracht: () =>
    `Photorealistic portrait of the person from the reference photo wearing traditional Volendam costume (klederdracht): for a woman the white lace pointed cap and striped skirt with a coral necklace, for a man the black wide trousers, striped shirt and round cap. Standing at the historic harbor of Volendam with wooden boats behind them, soft daylight. ${ZELFDE_PERSOON}`,
  postzegel: () =>
    `A vintage Dutch postage stamp with a finely engraved monochrome portrait of the person from the reference photo, perforated edges, the word "NEDERLAND" and a value "1€" in classic typography, slightly aged paper, macro photo of the stamp. ${ZELFDE_PERSOON}`,
  "huisdier-koning": () =>
    "A regal 18th-century oil painting portrait of the pet from the reference photo as a king or queen: a gold crown, a red velvet ermine-trimmed royal mantle, a medal, sitting proudly on a throne, dark palace background, ornate golden frame. Keep the pet's breed, fur colors and markings exactly recognizable.",
  tachtig: () =>
    `Photorealistic portrait of the person from the reference photo aged to about 80 years old: natural wrinkles, grey or white hair, older skin, same face structure, eyes and expression, same clothing style and background. ${ZELFDE_PERSOON.replace("age, ", "")}`,
  stripheld: () =>
    `The person from the reference photo as the hero of a colorful comic book page: bold ink outlines, halftone dots, dynamic heroic pose, action background, one empty speech bubble. ${ZELFDE_PERSOON}`,
  tijdreis: (t) =>
    `An authentic photograph from the ${t} of the person from the reference photo: hairstyle, clothing, setting and the photo technique, colors and grain typical of that decade. ${ZELFDE_PERSOON.replace("age, ", "")}`,

  // ── Branches ──
  "zorg-vacature": (t) =>
    `A warm, professional square social media job advertisement for a Dutch healthcare organisation. A friendly caregiver in a light-blue uniform smiling while helping an elderly person in a bright, homely care setting, soft natural light. Bold headline at the top reading "Wij zoeken jou!" and below it ${opschrift(t)}. Clean modern layout with plenty of space, soft teal and white colors.`,
  "zorg-wachtkamer": (t) =>
    `A calm, friendly vertical poster for a Dutch GP waiting room. Soft pastel colors, a simple warm flat illustration that fits the message, lots of white space. The poster shows ${opschrift(t)} in a large, rounded, very readable font. No other text.`,
  "zorg-uitleg": (t) =>
    `A clear, friendly flat vector illustration for a Dutch patient information leaflet showing: ${t}. Simple shapes, soft pastel colors, diverse friendly people, step-by-step clarity, white background. No text or labels in the image.`,
  "zorg-portret": () =>
    `Professional warm team portrait of the person from the reference photo for a Dutch healthcare website: wearing a neat light-blue care uniform, softly blurred bright care home or clinic in the background, natural daylight, friendly approachable smile, shoulders visible. ${ZELFDE_PERSOON}`,
  "onderwijs-opendag": (t) =>
    `A cheerful vertical poster for a Dutch primary school open day. Playful bright colors, a happy illustration of children and a school building, balloons and bunting. Big headline "Open dag" and below it ${opschrift(t)}. Clean, readable layout.`,
  "onderwijs-les": (t) =>
    `A clear, colorful educational illustration for a Dutch classroom (children aged 8-12) explaining: ${t}. Friendly cartoon style, bright colors, simple shapes, arrows where useful to show the process. No text or labels in the image.`,
  "onderwijs-vacature": (t) =>
    `A friendly square social media job advertisement for a Dutch school. A smiling teacher in a bright, colorful classroom with children's drawings on the wall. Headline "Kom jij ons team versterken?" and below it ${opschrift(t)}. Clean modern layout, warm colors.`,
  "onderwijs-tijdreis": () =>
    `Turn the reference photo into an authentic black-and-white school class photo from 1955 on a Dutch schoolyard: 1950s clothing and hairstyles, slight film grain, soft focus and scratches of an old print. Keep every person's face, position and expression recognizable. ${ZELFDE_PERSOON}`,
  "gemeente-plan": (t) =>
    `A realistic architectural visualisation of exactly the same place as in the reference photo after a redesign: ${t}. Same camera angle and the same surrounding buildings, sunny day, people walking and cycling, Dutch public space design. Photorealistic, like an official municipality impression.`,
  "gemeente-campagne": (t) =>
    `A bold, eye-catching vertical campaign poster for a Dutch municipality. Strong flat graphic illustration that fits the message, two or three bright colors, modern government-campaign style. The poster shows ${opschrift(t)} as a large headline. No other text.`,
  "gemeente-nieuws": (t) =>
    `A realistic, neutral editorial photograph for a Dutch municipality news article about: ${t}. Recognizably Dutch setting, natural light, people only from behind or at a distance, no text, no logos.`,
  "horeca-gerecht": () =>
    "Professional restaurant menu photograph of exactly the dish from the reference photo: keep the same food, ingredients and plating. Styled on a beautiful plate on a rustic wooden table, soft side window light, shallow depth of field, appetizing, high-end food photography.",
  "horeca-sfeer": () =>
    `The venue from the reference photo on a warm summer evening at golden hour: the terrace full of happy guests, string lights glowing, drinks on the tables, lively but cosy atmosphere. ${ZELFDE_PLEK}`,
  "horeca-actie": (t) =>
    `An appetizing square social media post for a Dutch café or restaurant. A beautiful photo of drinks or food that fits the offer on a bar or table, warm evening light, cosy atmosphere. Bold headline overlay with ${opschrift(t)}. Modern, readable layout.`,
  "makelaar-inrichten": (t) =>
    `Virtually stage the empty room from the reference photo: furnish it in ${t || "a light, modern Scandinavian style with light wood and soft textiles"}. Keep the walls, floor, windows, doors, ceiling and camera angle exactly the same; only add furniture, rugs, plants and decoration. Bright natural light, real-estate photography.`,
  "makelaar-zonnig": () =>
    `The house from the reference photo on a perfect sunny day: clear blue sky with a few soft clouds, warm soft sunlight, neat tidy front garden, no cars or bins in front. ${ZELFDE_PLEK} Professional real-estate photography.`,
  "makelaar-avond": () =>
    `The house from the reference photo at dusk (blue hour): deep blue evening sky, warm glowing lights behind all windows, subtle garden lighting. ${ZELFDE_PLEK} Professional twilight real-estate photography.`,
  "makelaar-verkocht": (t) =>
    `The house from the reference photo as a festive square social media post for a Dutch real-estate agent: a big red diagonal banner with the text "VERKOCHT!"${t ? ` and a smaller line with ${opschrift(t)}` : ""}. Sunny day. ${ZELFDE_PLEK}`,
  "installateur-zonnepanelen": () =>
    `The house from the reference photo with neatly installed modern black solar panels on the sunny side of the roof, aligned in tidy rows, realistic size and reflections. ${ZELFDE_PLEK}`,
  "installateur-warmtepomp": () =>
    `The garden or facade from the reference photo with a modern white air-source heat pump outdoor unit neatly installed against the wall on a small base, pipes tidily finished. ${ZELFDE_PLEK}`,
  "installateur-laadpaal": () =>
    `The driveway or carport from the reference photo with a modern wall-mounted electric car charging station installed and a modern electric car parked and plugged in. ${ZELFDE_PLEK}`,
  "installateur-actie": (t) =>
    `A professional square social media post for a Dutch installation company: a friendly installer in work clothes working on a modern heat pump or solar installation, bright daylight. Bold headline overlay with ${opschrift(t)}. Clean, trustworthy layout in blue and white.`,
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
  "horeca-dampend":
    "The dish steams gently, a sauce is slowly poured over it, the camera slowly pushes in. Keep the food and plating exactly the same. Appetizing, warm restaurant light.",
  "makelaar-rondgang":
    "A slow, smooth, steady camera glide through the room, like a real-estate video walkthrough. Nothing in the room changes or moves. Bright natural light.",
  "dag-nacht":
    "Smooth timelapse from day to night: the sun sets, the sky turns orange and then deep blue, and the lights in the windows and street lamps switch on one by one. Static camera; the building and street stay exactly the same.",
  sneeuw:
    "Soft snowflakes start falling gently through the whole scene, a light layer of snow slowly appears on surfaces, peaceful winter atmosphere. Subtle natural motion; everything else stays the same.",
  superheld:
    "The person drops from the sky and lands in a powerful superhero landing on one knee and one fist, the ground cracks, dust and debris burst outward in slow motion, then they look up at the camera. Cinematic.",
  wind:
    "A strong cinematic gust of wind blows through the person's hair and clothes, they look into the distance, dramatic slow motion, subtle camera push-in.",
  "logo-video":
    "Cinematic logo reveal: particles of light swirl in from the darkness and assemble into exactly the logo from the image, a soft light sweep passes over it, subtle glow. Keep the logo's shapes, colors and text exactly the same at the end.",
  "product-draai":
    "The product slowly rotates 360 degrees on a turntable in a clean minimal studio with soft lighting. The product's shape, colors and label stay exactly the same.",
};

/** Bouwt de opdracht voor een recept. Gooit met een Nederlandse melding bij foute invoer. */
export function receptOpdracht(ruw: Record<string, unknown>): Opdracht {
  const r = recept(ruw.receptId);
  if (!r) throw new Error("Dit effect bestaat niet (meer).");

  const tekst = typeof ruw.tekst === "string" ? ruw.tekst.trim().slice(0, 300) : "";
  if (r.tekst?.verplicht && !tekst) throw new Error(`Vul eerst in: ${r.tekst.label.toLowerCase()}`);

  // Sjablonen zonder foto (posters, vacature-posts): het beeld komt helemaal uit de tekst.
  // Altijd via Pro: het gewone model maakte van Nederlandse koppen te vaak onzinwoorden.
  if (r.zonderFoto) {
    const formaat = ["1:1", "9:16", "16:9"].includes(ruw.formaat as string) ? (ruw.formaat as string) : r.zonderFoto.formaat;
    const pro = r.credits === CREDIT_COSTS.IMAGE_GENERATION_PRO;
    return {
      soort: "beeld",
      endpoint: pro ? "fal-ai/nano-banana-pro" : "fal-ai/nano-banana",
      falInvoer: {
        prompt: BEELD[r.id](tekst),
        aspect_ratio: formaat,
        num_images: 1,
        output_format: "jpeg",
        ...(pro ? { resolution: "2K" } : {}),
      },
      credits: r.credits,
      prompt: `${r.naam}: ${tekst}`,
      invoer: { receptId: r.id, tekst, formaat },
    };
  }

  const fotoUrl = typeof ruw.fotoUrl === "string" ? ruw.fotoUrl.trim() : "";
  if (!/^https:\/\//.test(fotoUrl)) throw new Error("Kies eerst een foto.");
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
