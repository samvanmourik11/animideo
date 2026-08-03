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
  // Merk-/eigennamen die NOOIT vertaald of verbasterd mogen worden (do-not-translate).
  keepTerms?: string[];
  // Merk-/eigennamen die NERGENS genoemd mogen worden (bron-anoniem).
  avoidTerms?: string[];
  // Verteltoon: "zakelijk" (default) | "speels" | "energiek".
  tone?: string;
  // Optionele invalshoek/hoek van waaruit het onderwerp benaderd wordt.
  angle?: string;
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
  const keepTerms = (args.keepTerms ?? []).map((t) => t.trim()).filter(Boolean);
  const keepLine = keepTerms.length
    ? `\n- Laat deze merk-/eigennamen EXACT ongewijzigd (nooit vertalen, verbuigen of fonetisch verbasteren), in zowel de voice-over als de headline: ${keepTerms.map((t) => `"${t}"`).join(", ")}.`
    : "";
  const avoidTerms = (args.avoidTerms ?? []).map((t) => t.trim()).filter(Boolean);
  const avoidLine = avoidTerms.length
    ? `\n- Noem deze namen/merken NERGENS (niet in de voice-over, niet in de headline): ${avoidTerms.map((t) => `"${t}"`).join(", ")}. Verwijs er hooguit omschrijvend naar (bijv. "een bedrijf in deze sector").`
    : "";
  const toneLine =
    args.tone === "speels" ? "\n- TOON: luchtig, speels en toegankelijk — vlot, met een glimlach, maar nog steeds helder."
    : args.tone === "energiek" ? "\n- TOON: energiek, enthousiast en overtuigend — korte, krachtige zinnen met vaart."
    : "";
  const angleLine = args.angle?.trim()
    ? `\n- GEWENSTE INVALSHOEK: benader het onderwerp bewust vanuit deze hoek: "${args.angle.trim()}".`
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
- "voiceover": de gesproken narratie in ${lang}, ${voiceHint} (rond de ${wordsPerScene} woorden), natuurlijk en vloeiend (dit is wat een stem inspreekt). Schrijf getallen, prijzen, percentages, data en afkortingen VOLUIT zoals ze uitgesproken worden (bijv. "tweehonderdvijftig euro", "negen komma zes miljoen", "vierentwintig uur per dag", "tachtig procent") — nooit als los cijfer of symbool, zodat de stem ze correct voorleest.
- "headline": een korte tekst die IN beeld verschijnt — ALLEEN als die echt iets toevoegt. Zet 'm bij een hook, een kernboodschap, een climax/conclusie of als anker bij een groot getal; laat 'm WEG (null) bij puur verbindende, rustige of overgangsscenes. Liever een paar krachtige headlines dan bij elke scene tekst. Puntig, max ~6 woorden, een fragment of kernwoord uit de voice-over (niet de hele zin) — anders null.
- "emphasis": precies één woord uit de headline dat de accentkleur krijgt (het belangrijkste woord), of null. Altijd null als "headline" null is.
- "bigNumber": een hard getal uit de brontekst als dat de scene versterkt (bijv. "5.500€", "170", "9,6 mln"), anders null. VERZIN NOOIT cijfers; gebruik alleen wat letterlijk in de bron staat.
- "numberLabel": een kort label bij dat getal (bijv. "subsidie", "soorten"), of null.
- "illustration": een ENGELSE briefing voor de platte vector-illustratie van deze scene. Beschrijf ÉÉN concrete, letterlijke scène (wie, wat, waar, welke handeling) die precies toont wat de voice-over van deze scene zegt — specifiek voor dit onderwerp (bijv. "a worried family looking at a high energy bill in their living room"). GEEN tekst, cijfers of UI in het beeld. GEEN cliché-stockmetaforen (gloeilamp = idee, handdruk, tandwielen, zwevende vinkjes) en GEEN losse icoontjes/denkwolkjes/symboolverzamelingen. Teken abstracte begrippen niet letterlijk; kies een echte menselijke scène. Houd het simpel: één brandpunt, en laat ruimte voor een kop.

HARDE REGELS:
- Gebruik alleen feiten en cijfers die letterlijk in de brontekst staan.
- Alle zichtbare teksten (voiceover, en headline/numberLabel indien aanwezig) in ${lang}. De "illustration" is altijd in het Engels.
- Varieer de scenes visueel: niet 5 keer hetzelfde beeld. Wissel close-ups, omgevingen en perspectieven af, zoals een goede explainer-video.
${brandLine ? `- ${brandLine}` : ""}${keepLine}${avoidLine}${toneLine}${angleLine}`;

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
