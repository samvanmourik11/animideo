import { openai } from "@/lib/openai";

// Art-direction-pass ná het script. Waar het script de illustratie-briefings als
// bijproduct maakt (vaak generiek/random, losse iconen), begrijpt deze stap het
// HELE verhaal + de bron en bepaalt bewust wat elke scene toont — en vooral wat
// NIET. Zo matchen de beelden echt met de voice-over en hangen ze samen als set.
//
// Fail-open: bij een fout of scene-aantal-mismatch geven we null terug en houdt de
// route de oorspronkelijke briefings aan.

export interface ArtDirectScene {
  voiceover: string;
  headline: string;
  bigNumber?: string | null;
  numberLabel?: string | null;
}
export interface ArtDirectResult {
  bible: { characters: string; setting: string; motifs: string; avoid: string };
  illustrations: string[]; // exact één per scene, in dezelfde volgorde
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const ART_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["visualBible", "scenes"],
  properties: {
    visualBible: {
      type: "object",
      additionalProperties: false,
      required: ["characters", "setting", "motifs", "avoid"],
      properties: {
        characters: { type: "string" },
        setting: { type: "string" },
        motifs: { type: "string" },
        avoid: { type: "string" },
      },
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["illustration"],
        properties: { illustration: { type: "string" } },
      },
    },
  },
} as const;

const SYSTEM = `Je bent een senior art director en visuele verhalenverteller voor platte-vector explainer-video's (stijl: Yum Yum Videos / Cognitive). Je krijgt het BRONMATERIAAL over het onderwerp én het volledige script (per scene de gesproken voice-over en de tekst die in beeld komt). Jij regisseert de BEELDEN: per scene bepaal je wat de kijker letterlijk ziet, zodat het beeld precies matcht met wat de verteller op dat moment zegt.

WERKWIJZE:
1. Begrijp het onderwerp echt, als een mens die het materiaal gelezen heeft. Bepaal de kern, de hoofdrolspelers en de context.
2. Stel eerst een korte "visual bible" op die het hele verhaal consistent maakt:
   - characters: wie/wat zie je terugkomen (leeftijd, rol, kleding). Houd ze consistent over scenes, maar laat ze per scene een ANDERE, passende handeling doen (niet steeds dezelfde pose).
   - setting: de wereld/omgeving waarin dit speelt.
   - motifs: 1 à 2 terugkerende visuele motieven die specifiek bij DIT onderwerp passen.
   - avoid: wat je in dit verhaal juist NIET wilt zien.
3. Schrijf per scene ÉÉN concrete Engelse illustratie-briefing: een echte, letterlijke scène (wie, wat, waar, welke handeling) die de betekenis van de voice-over van die scene toont — specifiek voor DIT onderwerp, menselijk en helder. Sluit aan op de vorige scene zodat het één verhaal blijft.

WAT JE NIET DOET (cruciaal — hier gaat het meestal mis):
- GEEN tekst, letters, cijfers, labels of UI in het beeld (typografie komt er los overheen).
- GEEN cliché-stockmetaforen (gloeilamp = idee, handdruk = deal, tandwielen = proces, zwevende vinkjes, groeipijlen) — tenzij dat letterlijk het onderwerp is.
- GEEN "icoon-soep": geen scène volgeplempt met losse symbolen, denkwolkjes vol icoontjes of ongerelateerde beeldmerken.
- Teken abstracte begrippen NIET letterlijk (bijv. "innovatie", "data", "groei"): vind een concrete menselijke of echte scène die het overbrengt.
- Verzin geen objecten of feiten die niet uit de bron of de voice-over volgen; spreek de voice-over nooit tegen.
- Houd elke scène simpel en rustig: één duidelijk brandpunt. Liever leeg en helder dan vol en druk.

Antwoord met UITSLUITEND de JSON: de visual bible + exact evenveel illustration-briefings als er scenes zijn, in dezelfde volgorde als het script.`;

export async function artDirectScenes(input: {
  topic: string;
  rawText: string;
  scenes: ArtDirectScene[];
}): Promise<ArtDirectResult | null> {
  const n = input.scenes.length;
  if (n === 0) return null;
  try {
    const sceneList = input.scenes
      .map((s, i) => {
        const num = s.bigNumber ? ` — getal in beeld: ${s.bigNumber}${s.numberLabel ? ` (${s.numberLabel})` : ""}` : "";
        return `Scene ${i + 1}:\n  Voice-over: ${s.voiceover}\n  Tekst in beeld: ${s.headline}${num}`;
      })
      .join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: clamp(n * 150 + 700, 2000, 12000),
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `ONDERWERP: ${input.topic || "(leid af uit het bronmateriaal)"}

BRONMATERIAAL:
"""
${input.rawText.slice(0, 9000)}
"""

SCRIPT (${n} scenes, in volgorde):
${sceneList}

Geef nu de visual bible en per scene een sterke, bewuste illustratie-briefing als JSON.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "art_direction", strict: true, schema: ART_SCHEMA as unknown as Record<string, unknown> },
      },
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      visualBible?: ArtDirectResult["bible"];
      scenes?: { illustration?: string }[];
    };
    if (!Array.isArray(parsed.scenes) || parsed.scenes.length !== n) return null;
    const illustrations = parsed.scenes.map((s) => (s.illustration ?? "").trim());
    if (illustrations.some((s) => s.length < 3)) return null;
    const bible = parsed.visualBible ?? { characters: "", setting: "", motifs: "", avoid: "" };
    return { bible, illustrations };
  } catch (e) {
    console.error("[art-direct] mislukt, originele briefings behouden:", e);
    return null;
  }
}
