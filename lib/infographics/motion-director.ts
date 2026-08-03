// Proactieve bewegings-regisseur: kijkt naar het ÉCHTE scène-beeld + leest de
// voice-over/context, en bedenkt VOORAF de beste subtiele, in-beeld-blijvende
// beweging voor deze specifieke scène. De output gaat als stuur-instructie naar het
// image-to-video model (buildMotionPrompt). Zo wordt de beweging bewust geregisseerd
// i.p.v. blind gegenereerd — daarna controleert het "kritische oog" (motion-critic)
// het resultaat en animeert bij fouten opnieuw.

import { openai } from "@/lib/openai";

export async function planMotion(opts: {
  imageUrl: string;
  voiceover?: string | null;
  illustration?: string | null;
  title?: string | null;
  steer?: string | null; // optionele wens van de gebruiker
}): Promise<string | null> {
  const context = [
    opts.title ? `Verhaal: ${opts.title}` : "",
    opts.voiceover ? `Voice-over van deze scène: "${opts.voiceover}"` : "",
    opts.illustration ? `Bedoeld beeld: ${opts.illustration}` : "",
    opts.steer?.trim() ? `Wens van de gebruiker (verwerk deze): ${opts.steer.trim()}` : "",
  ].filter(Boolean).join("\n");

  const instruction = `Je bent een animatie-regisseur. Kijk GOED naar deze scène-illustratie en bedenk de BESTE subtiele beweging om 'm als korte (5s) animatie tot leven te brengen, passend bij de voice-over en context.
${context}

HARDE REGELS:
- Iedereen en alles blijft VOLLEDIG in beeld — NIEMAND loopt, stapt, glijdt of beweegt naar of over de randen; niets verlaat het beeld aan de zijkant, boven of onder.
- Alleen kleine, natuurlijke in-place beweging (een gebaar, lichte gewichtsverplaatsing, ademen, knipperen, een hand of voorwerp dat iets beweegt, zacht wapperend haar/kleding).
- Niets vervormt of morpht; geen nieuwe elementen erbij; de camera staat vast.
- Beweeg alleen wat logisch bij dít specifieke beeld past.

Beschrijf CONCREET welke elementen HOE bewegen (welke persoon/object → welke kleine beweging), in 1 tot 3 korte ENGELSE zinnen die als instructie voor een image-to-video model werken. Geef UITSLUITEND die instructie terug — geen uitleg, geen opsomming van de regels.`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 220,
      temperature: 0.4,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: opts.imageUrl, detail: "low" } },
          { type: "text", text: instruction },
        ],
      }],
    });
    const plan = res.choices[0]?.message?.content?.trim();
    return plan || null;
  } catch (e) {
    console.error("[motion-director] planning mislukt:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
