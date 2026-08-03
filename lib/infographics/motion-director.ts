// Bewegings-regisseur: bepaalt VOORAF exact welke (minimale) beweging deze scène
// moet krijgen. Dit plan is de "contract"-tekst waartegen het kritische oog het
// resultaat later toetst (motion-critic): alles wat NIET in dit plan staat — extra
// beweging, nieuwe elementen, glitches — mag worden afgekeurd.
//
// Les uit een eerdere poging: Seedance gaat hallucineren/overdrijven als je 'm veel
// laat bewegen. Daarom bepaalt de regisseur bewust de KLEINSTE, veiligste beweging.

import { openai } from "@/lib/openai";

export async function planMotion(opts: {
  imageUrl: string;
  voiceover?: string | null;
  illustration?: string | null;
  title?: string | null;
  steer?: string | null;
}): Promise<string | null> {
  const context = [
    opts.title ? `Verhaal: ${opts.title}` : "",
    opts.voiceover ? `Voice-over van deze scène: "${opts.voiceover}"` : "",
    opts.illustration ? `Bedoeld beeld: ${opts.illustration}` : "",
    opts.steer?.trim() ? `Wens van de gebruiker (verwerk, maar houd het minimaal): ${opts.steer.trim()}` : "",
  ].filter(Boolean).join("\n");

  const instruction = `Je bent een animatie-regisseur. Bepaal VOORAF exact welke beweging deze stilstaande illustratie krijgt als korte (5s) animatie.

${context}

BELANGRIJK — kies de KLEINSTE, VEILIGSTE beweging:
- Kies bij voorkeur ÉÉN heel subtiele in-place beweging (bijv. één persoon knikt licht, of een hand beweegt een klein stukje, of ogen knipperen). Bij twijfel: bijna geen beweging.
- Iedereen en alles blijft VOLLEDIG in beeld en op zijn plek — niemand loopt, stapt of beweegt naar de randen.
- Er komt NIETS bij (geen planten, objecten, tekst, personen); niets vervormt of morpht; camera staat vast.

Geef het als één korte, heel concrete ENGELSE zin die precies zegt WAT er beweegt en HOE klein, en dat al het andere volledig stil blijft. UITSLUITEND die zin, geen uitleg.`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 160,
      temperature: 0.3,
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
