import type { InfographicFormat } from "@/lib/types";

export interface BuildStoryPromptArgs {
  topic: string;
  rawText: string;
  format: InfographicFormat;
  mode: "story" | "report" | "overheid";
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
// regisseert per scene een gesproken voice-over en een illustratie-briefing. Puur (geen side effects) zodat de route dun blijft.
export function buildStoryPrompt(args: BuildStoryPromptArgs): { system: string; user: string } {
  const lang = args.language || "Nederlands";
  // Vlaams is geen apart taalmodel maar een andere manier van Nederlands
  // schrijven. Zonder deze aanwijzingen levert "schrijf in het Vlaams" gewoon
  // Hollands Nederlands op met hooguit een enkel Vlaams woord erin — en juist de
  // woordkeuze bepaalt of een Vlaamse luisteraar het als eigen taal herkent.
  const vlaamsLine =
    lang === "Vlaams"
      ? `

VLAAMS (BELGISCH-NEDERLANDS) — DIT IS BELANGRIJK:
- Schrijf zoals men in Vlaanderen spreekt en schrijft, niet zoals in Nederland. Een Vlaamse luisteraar moet het meteen als eigen taal herkennen.
- Gebruik Vlaamse woordkeuze waar die natuurlijk is: "goesting" (zin), "seffens" (zo meteen), "curieus" (benieuwd), "content" (blij), "kuisen" (schoonmaken), "wenen" (huilen), "lopen/rijden" i.p.v. "fietsen" waar passend, "gsm" (mobiel), "auto" i.p.v. "wagen" alleen als dat natuurlijk klinkt, "beenhouwer" (slager), "living" (woonkamer), "verlof" (vakantie), "factuur" (rekening), "firma"/"bedrijf".
- Vermijd typisch Nederlandse woorden en uitdrukkingen: "leuk", "gezellig", "hartstikke", "prima", "joh", "even lekker", "tof" alleen als het echt past.
- Zinsbouw: rustiger en iets formeler dan Nederlands Nederlands, minder stellig, beleefder. Vlamingen gebruiken vaker "u" en omzichtiger formuleringen.
- Geen dialect en geen karikatuur: dit is verzorgd Belgisch-Nederlands (VRT-Nederlands), geen West-Vlaams of Antwerps toneelaccent.
- Cijfers voluit blijven schrijven zoals hieronder beschreven, in Vlaamse spreektaal ("tweeënzeventig", "honderd euro").`
      : "";
  const brandLine = args.brand?.name
    ? `Het merk is "${args.brand.name}"${args.brand.toneOfVoice ? ` (tone of voice: ${args.brand.toneOfVoice})` : ""}. Laat de toon hierop aansluiten.`
    : "";
  const keepTerms = (args.keepTerms ?? []).map((t) => t.trim()).filter(Boolean);
  const keepLine = keepTerms.length
    ? `\n- Laat deze merk-/eigennamen EXACT ongewijzigd (nooit vertalen, verbuigen of fonetisch verbasteren), in de voice-over: ${keepTerms.map((t) => `"${t}"`).join(", ")}.`
    : "";
  const avoidTerms = (args.avoidTerms ?? []).map((t) => t.trim()).filter(Boolean);
  const avoidLine = avoidTerms.length
    ? `\n- Noem deze namen/merken NERGENS (niet in de voice-over, nergens): ${avoidTerms.map((t) => `"${t}"`).join(", ")}. Verwijs er hooguit omschrijvend naar (bijv. "een bedrijf in deze sector").`
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
      ? "MODUS: RAPPORT. Houd het zakelijk en feitelijk, maar nog steeds als doorlopend verhaal met een opening, opbouw en conclusie. Cijfers spelen een hoofdrol."
      : args.mode === "overheid"
      ? "MODUS: UITLEG (OVERHEIDSSTIJL). Leg het onderwerp zakelijk en feitelijk uit, zoals een publieksvoorlichting: rustig, helder, zonder verkooptoon en zonder dramatiek. Bouw het op als een uitleg met een begin, een kern en een afsluiting; cijfers en verhoudingen spelen een hoofdrol."
      : "MODUS: VERHAAL. Vertel het als een meeslepend verhaal. Cijfers ondersteunen het verhaal, ze zijn niet het doel. Open met een herkenbare situatie of spanning.";

  const targetSeconds = args.targetSeconds ?? 60;
  const sceneCount = args.sceneCount ?? 6;
  const wordsPerScene = args.wordsPerScene ?? 20;
  const voiceHint = sentenceHint(wordsPerScene);
  const lengthLine = `GEWENSTE VIDEOLENGTE: ongeveer ${targetSeconds} seconden gesproken video. Schrijf daarom PRECIES ${sceneCount} scenes en houd elke voice-over rond de ${wordsPerScene} woorden, zodat de som ongeveer op deze lengte uitkomt. Een langere video betekent MEER scenes en iets uitgebreidere narratie per scene, nooit herhaling, opvulling of verzonnen feiten.`;

  // De illustratie-briefing verschilt fundamenteel per modus. In Verhaal en
  // Rapport is het beeld een échte scène op een plek; in de overheidsmodus is het
  // een diagram op een leeg vlak. Die twee sluiten elkaar uit — vandaar twee
  // aparte instructies in plaats van één met uitzonderingen.
  const illustratieRegel =
    args.mode === "overheid"
      ? `een ENGELSE briefing voor het beeld van deze scene. Het beeld is een DIAGRAM, geen scène: beschrijf welke objecten, iconen en vlakke figuren er op een leeg vlak staan, hoe groot ze zijn en hoe ze zich tot elkaar verhouden (naast elkaar, in een rij witte panelen, met een stroom of pijl ertussen). Noem GEEN plek en GEEN omgeving: geen kamer, straat, landschap of horizon. Mensen zijn losse uitgeknipte figuren, of alleen handen en onderarmen die het beeld binnenkomen om iets vast te houden of aan te wijzen. Kies concrete, herkenbare objecten die letterlijk uit de voice-over volgen (een koffer, een stapel munten, een gebouw, een document) en toon verhoudingen grafisch. GEEN tekst, cijfers of letters in het beeld. Houd het rustig en symmetrisch: één duidelijk idee per beeld, met veel lege ruimte eromheen, en een kalme rechterbovenhoek. Noem NOOIT een logo, merk of watermerk in je briefing.`
      : `een ENGELSE briefing voor de platte vector-illustratie van deze scene. Beschrijf ÉÉN concrete, letterlijke scène (wie, wat, waar, welke handeling) die precies toont wat de voice-over van deze scene zegt — specifiek voor dit onderwerp (bijv. "a worried family looking at a high energy bill in their living room"). GEEN tekst, cijfers of UI in het beeld. GEEN cliché-stockmetaforen (gloeilamp = idee, handdruk, tandwielen, zwevende vinkjes) en GEEN losse icoontjes/denkwolkjes/symboolverzamelingen. Teken abstracte begrippen niet letterlijk; kies een echte menselijke scène. Benoem altijd de PLEK erbij (waar speelt het, wat zie je eromheen en erachter): de omgeving wordt volledig getekend en vult het hele beeld — nooit een wit of leeg vlak, nooit een uitgeknipt onderwerp dat zweeft. Houd het wel rustig: één brandpunt, en een kalme rechterbovenhoek. Noem NOOIT een logo, merk, watermerk of beeldmerk in je briefing — het beeldmodel tekent er dan een verzonnen exemplaar bij, precies over het echte logo van de klant heen.`;

  const system = `Je bent een verhaalregisseur en scriptschrijver voor geanimeerde explainer-infographics, in de stijl van studio's als Yum Yum Videos. Je output is UITSLUITEND een gestructureerde JSON-spec die later wordt gerenderd: per scene een illustratie (door een beeldmodel) met daaronder de ingesproken voice-over. Er komt GEEN tekst in beeld — het beeld en de stem vertellen samen het verhaal. Je tekent zelf geen pixels en schrijft geen opmaak.

DENK ALS EEN VERHAAL, NIET ALS EEN DASHBOARD:
- Bouw een duidelijke boog over PRECIES ${sceneCount} scenes: open met een hook of herkenbare situatie, bouw daarna stap voor stap context en cijfers op, werk toe naar een kerninzicht of climax, en sluit af met een conclusie of call-to-action. Verdeel de boog evenwichtig over alle ${sceneCount} scenes.
- ÉÉN idee per scene. Geen opsommingen van losse cijfers op één scherm.
- Elke scene volgt logisch en emotioneel uit de vorige. Het moet voelen als één doorlopende voice-over.

${lengthLine}

${modeLine}

PER SCENE LEVER JE:
- "voiceover": de gesproken narratie in ${lang}, ${voiceHint} (rond de ${wordsPerScene} woorden), natuurlijk en vloeiend (dit is wat een stem inspreekt, en het enige wat de kijker hoort). Schrijf getallen, prijzen, percentages, data en afkortingen VOLUIT zoals ze uitgesproken worden (bijv. "tweehonderdvijftig euro", "negen komma zes miljoen", "vierentwintig uur per dag", "tachtig procent") — nooit als los cijfer of symbool, zodat de stem ze correct voorleest.
- "illustration": ${illustratieRegel}

HARDE REGELS:
- Gebruik alleen feiten en cijfers die letterlijk in de brontekst staan.
- De voice-over is in ${lang}. De "illustration" is altijd in het Engels.
- Er verschijnt geen tekst in beeld: cijfers en kernwoorden moeten dus in de voice-over zelf zitten, niet als losse kop worden "geparkeerd". Gebruik alleen cijfers die letterlijk in de bron staan.
- Varieer de scenes visueel: niet 5 keer hetzelfde beeld. ${args.mode === "overheid" ? "Wissel af tussen één groot object, een rij panelen naast elkaar, een stroom of vergelijking, en mensen of handen in beeld." : "Wissel close-ups, omgevingen en perspectieven af, zoals een goede explainer-video."}
${brandLine ? `- ${brandLine}` : ""}${keepLine}${avoidLine}${toneLine}${angleLine}${vlaamsLine}`;

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
