// Het UGC-script: wat de creator zegt, in stukjes, en wat we per stukje zien. Gratis
// voor de klant (tekst-AI), zodat hij net zo vaak een nieuw script laat schrijven als
// hij wil. Alleen op de server.

import { openai } from "@/lib/openai";
import { UGC_LENGTES, WOORDEN_PER_SEC, type Creator, type UgcLengte, type UgcScript, type UgcStukje } from "./types";

export interface UgcOnderwerp {
  /** Product of dienst, in een paar woorden ("Barista Pro 3000", "Schoonmaakdienst Glans"). */
  naam: string;
  omschrijving: string;
  voordelen: string[];
  website: string;
  /** Is er een productfoto? Dan houdt de creator het product vast; anders gaat het over een dienst. */
  metProduct: boolean;
}

// Langer dan dit per praatstukje en het voelt niet meer als een snelle TikTok-cut; en het
// lipsync-model rekent per begonnen 5 seconden.
const MAX_WOORDEN_PRAAT = 20;
const MAX_WOORDEN_BROLL = 11;

function schoon(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Controleert een script (van de AI of zoals de klant het aanpaste). Gooit bij onbruikbaar. */
export function controleerUgcScript(ruw: unknown, broll: boolean): UgcScript {
  const lijst = Array.isArray((ruw as { stukjes?: unknown })?.stukjes) ? (ruw as { stukjes: unknown[] }).stukjes : [];
  const stukjes: UgcStukje[] = lijst.slice(0, 8).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      soort: o.soort === "broll" && broll ? "broll" : "praat",
      tekst: schoon(o.tekst, 220),
      uitleg: schoon(o.uitleg, 200),
      beeld: schoon(o.beeld, 500),
    };
  });
  if (stukjes.length < 2 || stukjes.some((s) => !s.tekst || !s.beeld)) {
    throw new Error("Het script is niet compleet. Laat een nieuw script schrijven.");
  }
  if (stukjes[0].soort !== "praat") stukjes[0].soort = "praat";
  for (const s of stukjes) {
    const woorden = s.tekst.split(" ").length;
    const max = s.soort === "broll" ? MAX_WOORDEN_BROLL : MAX_WOORDEN_PRAAT;
    if (woorden > max + 4) {
      throw new Error(`Een stukje is te lang ("${s.tekst.slice(0, 30)}…"). Houd elk stukje onder de ${max} woorden.`);
    }
  }
  return { stukjes };
}

export async function schrijfUgcScript(o: UgcOnderwerp, creator: Creator, sec: UgcLengte, broll: boolean): Promise<UgcScript> {
  const lengte = UGC_LENGTES.find((l) => l.sec === sec)!;
  const woorden = Math.round(sec * WOORDEN_PER_SEC);
  const vraag = async () => {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1500,
      temperature: 0.9,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You write authentic Dutch UGC (user-generated content) videos for TikTok and Instagram Reels: a real-looking person films themselves with their phone and talks about a ${o.metProduct ? "product they use" : "service they used"}. It must feel like an honest recommendation from a normal person, NOT like an ad.

The creator: ${creator.naam}. ${creator.persona}

Write exactly ${lengte.stukjes} pieces ("stukjes"), about ${woorden} spoken words in total (${sec} seconds).
Structure: piece 1 is a scroll-stopping HOOK (a surprising statement, a relatable problem, or "ik moet jullie iets laten zien"). Then a personal experience and the benefits. The last piece is a natural call to action that mentions the website if there is one.

Each piece:
- "soort": "praat" (the creator talks into the camera)${broll ? ` or "broll" (a close-up of the ${o.metProduct ? "product being used" : "service in action"}, while the creator's voice continues). Use "broll" for about one in three pieces, never for the first piece` : ` — always "praat"`}.
- "tekst": what the creator SAYS, in natural spoken Dutch (spreektaal, "ik", short sentences, no marketing language, no English buzzwords). Max ${MAX_WOORDEN_PRAAT} words for "praat", max ${MAX_WOORDEN_BROLL} for "broll".
- "uitleg": one short sentence in plain Dutch for the customer: what we see.
- "beeld": English description of the frame for an image model. For "praat": where the creator is and what they do (they are TALKING, so never eating, drinking or holding something near their mouth; a product is shown at chest height) (a casual everyday Dutch setting that fits the topic${o.metProduct ? ", holding or showing the product naturally" : ""}), filmed as a vertical selfie from the phone's front camera. For "broll": a close-up of ${o.metProduct ? "the product in use" : "the service being done"}, natural light, handheld phone look. Refer to the product as "the product".
Do NOT invent prices, discounts or claims that are not in the information. Answer ONLY with JSON: {"stukjes":[{"soort":"praat","tekst":"","uitleg":"","beeld":""},…]}`,
        },
        {
          role: "user",
          content: `${o.metProduct ? "Product" : "Dienst"}: ${o.naam}
Omschrijving: ${o.omschrijving || "(geen)"}
Voordelen: ${o.voordelen.join("; ") || "(niet opgegeven)"}
Website: ${o.website || "(geen)"}`,
        },
      ],
    });
    return controleerUgcScript(JSON.parse(resp.choices[0]?.message?.content ?? "{}"), broll);
  };
  // Net als bij de reclame laat de AI soms een veld weg; dan gewoon nog een keer.
  try {
    return await vraag();
  } catch {
    return vraag();
  }
}
