import type { InfographicFormat } from "@/lib/types";

export interface BuildStoryPromptArgs {
  topic: string;
  rawText: string;
  format: InfographicFormat;
  mode: "story" | "report";
  brand?: { name?: string | null; toneOfVoice?: string | null } | null;
  language?: string;
  // Gewenste videolengte in seconden plus het daaruit afgeleide aantal scenes en
  // de richtlengte (woorden) van de voice-over per scene. Hoe langer de video,
  // hoe meer scenes en hoe uitgebreider de narratie per scene.
  targetSeconds?: number;
  sceneCount?: number;
  wordsPerScene?: number;
}

// Vertaalt het richtaantal woorden per scene naar een leesbare zin-hint voor de
// prompt, zodat de AI de voice-over op de juiste lengte schrijft.
function sentenceHint(words: number): string {
  if (words <= 18) return "1 à 2 korte zinnen";
  if (words <= 32) return "2 à 3 zinnen";
  return "3 à 4 zinnen";
}

// Bouwt de prompt voor de storytelling-infographic. De AI is hier geen
// datavisualisatie-designer maar een VERHAALREGISSEUR: ze schrijft een boog en
// regisseert per scene een gesproken voice-over, een korte beeldtekst en een
// illustratie-briefing. Puur (geen side effects) zodat de route dun blijft.
export function buildStoryPrompt(args: BuildStoryPromptArgs): { system: string; user: string } {
  const lang = args.language || "Nederlands";
  const brandLine = args.brand?.name
    ? `Het merk is "${args.brand.name}"${args.brand.toneOfVoice ? ` (tone of voice: ${args.brand.toneOfVoice})` : ""}. Laat de toon hierop aansluiten.`
    : "";

  const modeLine =
    args.mode === "report"
      ? "MODUS: RAPPORT. Houd het zakelijk en feitelijk, maar nog steeds als doorlopend verhaal met een kop, opbouw en conclusie. Cijfers spelen een hoofdrol."
      : "MODUS: VERHAAL. Vertel het als een meeslepend verhaal. Cijfers ondersteunen het verhaal, ze zijn niet het doel. Open met een herkenbare situatie of spanning.";

  const targetSeconds = args.targetSeconds ?? 60;
  const sceneCount = args.sceneCount ?? 6;
  const wordsPerScene = args.wordsPerScene ?? 20;
  const voiceHint = sentenceHint(wordsPerScene);
  const lengthLine = `GEWENSTE VIDEOLENGTE: ongeveer ${targetSeconds} seconden gesproken video. Schrijf daarom PRECIES ${sceneCount} scenes en houd elke voice-over rond de ${wordsPerScene} woorden, zodat de som ongeveer op deze lengte uitkomt. Een langere video betekent MEER scenes en iets uitgebreidere narratie per scene, nooit herhaling, opvulling of verzonnen feiten.`;

  const system = `Je bent een verhaalregisseur en scriptschrijver voor geanimeerde explainer-infographics, in de stijl van studio's als Yum Yum Videos. Je output is UITSLUITEND een gestructureerde JSON-spec die later wordt gerenderd: per scene een platte illustratie (door een beeldmodel) met daarover heen typografie en cijfers. Je tekent zelf geen pixels en schrijft geen opmaak.

DENK ALS EEN VERHAAL, NIET ALS EEN DASHBOARD:
- Bouw een duidelijke boog over PRECIES ${sceneCount} scenes: open met een hook of herkenbare situatie, bouw daarna stap voor stap context en cijfers op, werk toe naar een kerninzicht of climax, en sluit af met een conclusie of call-to-action. Verdeel de boog evenwichtig over alle ${sceneCount} scenes.
- ÉÉN idee per scene. Geen opsommingen van losse cijfers op één scherm.
- Elke scene volgt logisch en emotioneel uit de vorige. Het moet voelen als één doorlopende voice-over.

${lengthLine}

${modeLine}

PER SCENE LEVER JE:
- "voiceover": de gesproken narratie in ${lang}, ${voiceHint} (rond de ${wordsPerScene} woorden), natuurlijk en vloeiend (dit is wat een stem inspreekt).
- "headline": de korte tekst die IN beeld verschijnt. Puntig, max ~6 woorden. Mag een fragment of kernwoord uit de voice-over zijn, niet de hele zin.
- "emphasis": precies één woord uit de headline dat de accentkleur krijgt (het belangrijkste woord), of null.
- "bigNumber": een hard getal uit de brontekst als dat de scene versterkt (bijv. "5.500€", "170", "9,6 mln"), anders null. VERZIN NOOIT cijfers; gebruik alleen wat letterlijk in de bron staat.
- "numberLabel": een kort label bij dat getal (bijv. "subsidie", "soorten"), of null.
- "illustration": een ENGELSE briefing voor de platte vector-illustratie van deze scene. Beschrijf concrete objecten, omgeving en eventuele karakters die het verhaal tonen (bijv. "a worried family looking at a high energy bill in their living room"). Houd het beeldend en filmisch. GEEN tekst, cijfers of UI in het beeld. Laat ruimte voor een kop.

HARDE REGELS:
- Gebruik alleen feiten en cijfers die letterlijk in de brontekst staan.
- Alle zichtbare teksten (voiceover, headline, numberLabel) in ${lang}. De "illustration" is altijd in het Engels.
- Varieer de scenes visueel: niet 5 keer hetzelfde beeld. Wissel close-ups, omgevingen en perspectieven af, zoals een goede explainer-video.
${brandLine ? `- ${brandLine}` : ""}`;

  const user = `ONDERWERP / TITEL:
${args.topic || "(leid een passende titel af uit de brontekst)"}

FORMAAT: ${args.format} (${args.format === "9:16" ? "staand, social" : "liggend, presentatie"})

BRONTEKST / DATA (haal hier het verhaal en de cijfers uit, verzin niets):
"""
${args.rawText.slice(0, 8000)}
"""

Schrijf nu de storytelling-infographic als JSON volgens het schema.`;

  return { system, user };
}
