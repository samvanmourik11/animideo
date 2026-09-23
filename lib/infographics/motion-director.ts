// Bewegings-regisseur: bepaalt VOORAF welke beweging deze scène krijgt. Dit plan
// is de "contract"-tekst waartegen het kritische oog het resultaat later toetst
// (motion-critic): alles wat NIET in dit plan staat — extra beweging, nieuwe
// elementen, glitches — mag worden afgekeurd.
//
// Twee lessen zitten hierin verwerkt:
//
// 1. Seedance gaat hallucineren zodra je 'm veel laat bewegen. De regels "niets
//    erbij, niets van buiten het kader, camera vast" blijven daarom hard.
// 2. Maar de opdracht "kies de kleinste beweging, bij twijfel bijna geen" leverde
//    beweging op die niets met de scène te maken had: iemand knipperde met de
//    ogen terwijl de voice-over over een gevelsteen ging. De regisseur kiest nu
//    eerst WAAR DE ZIN OVER GAAT en welk zichtbaar element die betekenis draagt,
//    en beweegt dán dát element. Klein blijft het, maar niet willekeurig.

import { openai } from "@/lib/openai";
import { beeldVoorKijkvraag } from "./beeld-inline";

export interface MotionPlan {
  /** Waar deze scène over gaat, in één korte Nederlandse zin (voor het log). */
  kern: string;
  /** Wat er beweegt en hoe: één concrete Engelse zin voor het videomodel. */
  beweging: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kern", "beweging"],
  properties: {
    kern: { type: "string" },
    beweging: { type: "string" },
  },
} as const;

const VEILIGHEID = [
  "- Noem UITSLUITEND elementen die op dit beeld al volledig zichtbaar zijn. Noem nooit een hand, arm, vinger, persoon of voorwerp dat je niet letterlijk ziet staan — het videomodel tekent alles wat je noemt er anders bij.",
  "- Er komt niets bij, niets komt van buiten het kader in beeld, niets vervormt of morpht, en de camera staat vast.",
  "- Iedereen blijft volledig in beeld en op zijn plek: niemand loopt weg, stapt uit beeld of verandert van houding in iets heel anders.",
  "- Tekst, cijfers en labels blijven haarscherp en onveranderd.",
].join("\n");

const VERHAAL_OPDRACHT = `Je bent animatie-regisseur. Je bepaalt welke beweging deze stilstaande illustratie krijgt in een clip van 5 seconden.

DE BEWEGING MOET BIJ DE ZIN HOREN. Ga zo te werk:
1. Lees de voice-over van deze scène en bepaal waar hij over gaat — wat is het ene ding dat de kijker moet begrijpen?
2. Zoek in het beeld het element dat die betekenis draagt: de persoon die het doet, het voorwerp waar het over gaat, de plek waar de aandacht heen moet.
3. Laat dát element bewegen, op de manier die bij de zin past. Gaat de zin over stilstaan en kijken, dan draait iemand zijn hoofd en kijkt omhoog. Gaat hij over uitleggen, dan gebaart de spreker met een hand die al zichtbaar is. Gaat hij over iets ontdekken, dan buigt iemand licht naar voren.
4. Is er niets in beeld dat bij de zin hoort en uit zichzelf kan bewegen, kies dan een rustige, kleine beweging van de hoofdpersoon (ademhaling, een lichte knik) en zeg erbij dat de rest volledig stil blijft.

HOUD HET KLEIN EN VEILIG:
${VEILIGHEID}
- Eén beweging per clip. Geen drukte in elke hoek, geen tweede beweging erbij.

Vul in:
- "kern": één korte Nederlandse zin over waar deze scène over gaat.
- "beweging": één concrete ENGELSE zin die precies zegt wát er beweegt, hoe klein, en dat al het andere volledig stil blijft.`;

const OVERHEID_OPDRACHT = `Je bent motion-graphics regisseur. Je bepaalt welke beweging deze vlakke uitleg-illustratie krijgt in een clip van 5 seconden.

DE BEWEGING IS DE UITLEG. Ga zo te werk:
1. Lees de voice-over en bepaal welke stap of welk verband hij uitlegt.
2. Zoek de elementen in het beeld die dat verband dragen.
3. Kies één grafische beweging die dat verband laat zien: een vlak dat inschuift, een rij die één voor één verschijnt, een balk die groeit, een sliert die langs zijn baan stroomt, een pijl die van het ene naar het andere element loopt.

HOUD HET SCHOON:
${VEILIGHEID.replace("- Er komt niets bij, niets komt van buiten het kader in beeld", "- Er komt niets NIEUWS bij; bestaande elementen mogen wel langs hun baan het beeld in of uit bewegen")}
- Eén duidelijke beweging, gelijkmatig en doelgericht.

Vul in:
- "kern": één korte Nederlandse zin over wat deze scène uitlegt.
- "beweging": één concrete ENGELSE zin die precies zegt wát er beweegt en hoe, en dat de rest stil blijft.`;

export async function planMotion(opts: {
  imageUrl: string;
  voiceover?: string | null;
  illustration?: string | null;
  title?: string | null;
  steer?: string | null;
  mode?: "story" | "report" | "overheid";
}): Promise<MotionPlan | null> {
  const context = [
    opts.title ? `Verhaal: ${opts.title}` : "",
    opts.voiceover ? `VOICE-OVER VAN DEZE SCÈNE: "${opts.voiceover}"` : "(deze scène heeft geen voice-over)",
    opts.illustration ? `Bedoeld beeld: ${opts.illustration}` : "",
    opts.steer?.trim() ? `Wens van de gebruiker (die weegt het zwaarst, maar houd hem veilig): ${opts.steer.trim()}` : "",
  ].filter(Boolean).join("\n");

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 300,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: [
            // Op "high": de regisseur moet kunnen zien wie waar staat en wat
            // iemand vasthoudt, anders kiest hij een beweging voor een element
            // dat er niet is. Zelf ophalen voorkomt download-timeouts.
            { type: "image_url", image_url: { url: await beeldVoorKijkvraag(opts.imageUrl), detail: "high" } },
            { type: "text", text: `${opts.mode === "overheid" ? OVERHEID_OPDRACHT : VERHAAL_OPDRACHT}\n\n${context}` },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "motion_plan", strict: true, schema: SCHEMA as unknown as Record<string, unknown> },
      },
    });
    const ruw = JSON.parse(res.choices[0]?.message?.content ?? "{}") as Partial<MotionPlan>;
    const beweging = (ruw.beweging ?? "").trim();
    if (!beweging) return null;
    return { kern: (ruw.kern ?? "").trim().slice(0, 200), beweging: beweging.slice(0, 600) };
  } catch (e) {
    console.error("[motion-director] planning mislukt:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
