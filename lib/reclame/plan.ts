// Het script van een reclame: drie shots, wat Hugo zegt en de regel op de eindkaart.
// Alleen op de server. Gratis voor de klant (tekst-AI kost ons ~2 cent), zodat hij net
// zo vaak een nieuw script kan laten schrijven als hij wil vóór hij betaalt.

import { openai } from "@/lib/openai";
import { AANTAL_SHOTS, STIJLEN, type Plan, type Product, type StijlId } from "./types";

const STIJL_REGIE: Record<StijlId, string> = {
  strak:
    "Premium studio look: clean seamless backgrounds, soft diffused light, elegant reflections, slow controlled camera moves (slow push-in, gentle orbit). Calm and luxurious.",
  lifestyle:
    "Real life: the product being used naturally by people in recognizable everyday Dutch settings (bright home, street with bikes, office, park). Natural daylight, warm and authentic, handheld-feeling camera.",
  speels:
    "Bold and playful social media look: saturated colors, colored backdrops, dynamic angles, fast energetic camera moves, fun props. Eye-catching in the first second.",
};

// Hugo spreekt zo'n 2,4 woorden per seconde; drie clips van 5 seconden plus de eindkaart
// laten ruimte voor ±16 seconden tekst. Langer en de stem loopt over de eindkaart heen.
const MAX_WOORDEN = 38;

function opschonen(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Controleert wat de AI (of de klant) als plan aanlevert. Gooit bij een onbruikbaar plan. */
export function controleerPlan(ruw: unknown): Plan {
  const p = (ruw ?? {}) as { shots?: unknown; voiceover?: unknown; eindtekst?: unknown };
  const shots = (Array.isArray(p.shots) ? p.shots : []).slice(0, AANTAL_SHOTS).map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    return {
      uitleg: opschonen(o.uitleg, 200),
      beeld: opschonen(o.beeld, 600),
      beweging: opschonen(o.beweging, 300),
      tekst: opschonen(o.tekst, 40),
    };
  });
  if (shots.length !== AANTAL_SHOTS || shots.some((s) => !s.beeld)) {
    throw new Error("Het script is niet compleet. Laat een nieuw script schrijven.");
  }
  const voiceover = opschonen(p.voiceover, 400);
  if (!voiceover) throw new Error("Vul eerst de voice-over in.");
  if (voiceover.split(" ").length > MAX_WOORDEN + 6) {
    throw new Error(`De voice-over is te lang voor een reclame van 15 seconden. Houd het onder de ${MAX_WOORDEN} woorden.`);
  }
  return { shots, voiceover, eindtekst: opschonen(p.eindtekst, 40) };
}

// Eén op de zoveel keer laat de AI een veld weg (in de proef: de voice-over). Dan
// gewoon nog een keer vragen in plaats van de klant een foutmelding te geven.
export async function schrijfPlan(product: Product, stijl: StijlId): Promise<Plan> {
  try {
    return await schrijfPlanEenKeer(product, stijl);
  } catch {
    return schrijfPlanEenKeer(product, stijl);
  }
}

async function schrijfPlanEenKeer(product: Product, stijl: StijlId): Promise<Plan> {
  const s = STIJLEN.find((x) => x.id === stijl)!;
  const resp = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1200,
    temperature: 0.9,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an award-winning creative director making short video ads for Dutch small businesses. You write a ${AANTAL_SHOTS}-shot ad of about 15 seconds (each shot 5 seconds), followed by an end card. The customer's REAL product photo is used as a reference in every shot, so the product must be clearly visible in every shot and must never be redesigned.

Structure:
1. HOOK — stop the scroll in the first second: a surprising, visually striking moment with the product.
2. BENEFIT — show what the product does for the user, matching the main benefit.
3. HERO — the product beautifully presented, the "I want that" shot, leading into the end card.

Visual style for all shots: ${STIJL_REGIE[stijl]}

Rules:
- "uitleg": one short Dutch sentence for the customer describing what we see and what happens in this shot, in plain everyday Dutch.
- "beeld": an English description of the still frame for an image model (setting, composition, light, people if any). Refer to the product as "the product". 1-3 sentences. No text, logos or captions in the image.
- "beweging": an English description of what moves in 5 seconds (camera move + one simple action). Keep it physically simple; the product keeps its exact shape.
- "tekst": Dutch on-screen text, max 5 words, punchy. Shot 3 may be the product name.
- "voiceover": Dutch, spoken by an enthusiastic Dutch male voice, max ${MAX_WOORDEN} words, natural spoken Dutch (no English marketing words unless the brand uses them), ends with a call to action that mentions the website. Do NOT invent prices, discounts or claims that are not in the product info.
- "eindtekst": Dutch call to action for the end card, max 5 words (e.g. "Bestel nu online").
Answer ONLY with JSON: {"shots":[{"uitleg":"","beeld":"","beweging":"","tekst":""},…],"voiceover":"","eindtekst":""}`,
      },
      {
        role: "user",
        content: `Product: ${product.naam}
Merk: ${product.merk}
Omschrijving: ${product.omschrijving}
Voordelen: ${product.voordelen.join("; ") || "(niet opgegeven)"}
Prijs: ${product.prijs || "(niet noemen)"}
Website: ${product.website || "(geen)"}
Gekozen stijl: ${s.naam}`,
      },
    ],
  });
  let ruw: unknown;
  try {
    ruw = JSON.parse(resp.choices[0]?.message?.content ?? "{}");
  } catch {
    throw new Error("Het script kwam niet goed terug. Probeer het opnieuw.");
  }
  try {
    return controleerPlan(ruw);
  } catch (e) {
    console.error("[reclame/plan] onbruikbaar script:", JSON.stringify(ruw).slice(0, 1500));
    throw e;
  }
}
