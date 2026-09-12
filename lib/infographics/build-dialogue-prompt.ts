import type { InfographicFormat } from "@/lib/types";
import type { DialogueCastMember } from "./dialogue-schema";

export interface BuildDialoguePromptArgs {
  topic: string;
  rawText: string;
  format: InfographicFormat;
  // De cast die de GEBRUIKER heeft samengesteld uit zijn karakterbibliotheek.
  // De AI verzint dus geen personages meer; hij schrijft voor deze rollen.
  cast: DialogueCastMember[];
  language?: string;
  // Gewenste videolengte in seconden plus het daaruit afgeleide aantal
  // dialoogregels en scènes.
  targetSeconds?: number;
  lineCount?: number;
  sceneCount?: number;
  wordsPerLine?: number;
  // Merk-/eigennamen die NOOIT vertaald mogen worden (do-not-translate).
  keepTerms?: string[];
  // Merk-/eigennamen die NERGENS genoemd mogen worden (bron-anoniem).
  avoidTerms?: string[];
  // Verteltoon: "zakelijk" (default) | "speels" | "energiek".
  tone?: string;
  // Optionele invalshoek van waaruit het onderwerp benaderd wordt.
  angle?: string;
  /**
   * De kernboodschap en het omslagpunt uit de opzet.
   *
   * Deze twee stonden al in DialogueSpec maar bereikten de scenarist nooit: het
   * verhaal dwaalde af omdat niemand had gezegd waar het naartoe moest, en twee
   * personages waren het vanaf regel één met elkaar eens.
   */
  kern?: string | null;
  wending?: string | null;
}

// Bouwt de prompt voor de dialoogmodus. De AI is hier scenarist voor een korte
// geanimeerde dialoog tussen personages die de gebruiker zelf heeft gekozen.
// Puur (geen side effects) zodat de route dun blijft.
export function buildDialoguePrompt(args: BuildDialoguePromptArgs): { system: string; user: string } {
  const lang = args.language || "Nederlands";
  const targetSeconds = args.targetSeconds ?? 60;
  const lineCount = args.lineCount ?? 14;
  const sceneCount = args.sceneCount ?? 5;
  const wordsPerLine = args.wordsPerLine ?? 12;

  // Rol, verlangen en spreekstijl per personage. Alleen naam en rol volstond niet:
  // zonder botsend verlangen schreef het model personages die het overal over eens
  // waren, en zonder eigen spraak waren hun regels onderling verwisselbaar.
  const castLijst = args.cast
    .map((c) => {
      const delen = [
        c.role?.trim() ? `rol: ${c.role.trim()}` : "",
        c.leeftijd?.trim() ? `leeftijd: ${c.leeftijd.trim()}` : "",
        c.wil?.trim() ? `wil: ${c.wil.trim()}` : "",
        c.spraak?.trim() ? `praat zo: ${c.spraak.trim()}` : "",
      ].filter(Boolean);
      return `- id "${c.id}": ${c.name}${delen.length ? ` — ${delen.join("; ")}` : ""}`;
    })
    .join("\n");

  const keepTerms = (args.keepTerms ?? []).map((t) => t.trim()).filter(Boolean);
  const keepLine = keepTerms.length
    ? `\n- Laat deze merk-/eigennamen EXACT ongewijzigd (nooit vertalen of verbasteren): ${keepTerms.map((t) => `"${t}"`).join(", ")}.`
    : "";
  const avoidTerms = (args.avoidTerms ?? []).map((t) => t.trim()).filter(Boolean);
  const avoidLine = avoidTerms.length
    ? `\n- Noem deze namen/merken NERGENS: ${avoidTerms.map((t) => `"${t}"`).join(", ")}. Verwijs er hooguit omschrijvend naar.`
    : "";
  const toneLine =
    args.tone === "speels" ? "\n- TOON: luchtig, speels en toegankelijk, met een glimlach maar helder."
    : args.tone === "energiek" ? "\n- TOON: energiek en overtuigend, korte krachtige zinnen met vaart."
    : "";
  const angleLine = args.angle?.trim()
    ? `\n- GEWENSTE INVALSHOEK: benader het onderwerp bewust vanuit deze hoek: "${args.angle.trim()}".`
    : "";
  const kernLine = args.kern?.trim()
    ? `\n- KERNBOODSCHAP: het hele gesprek werkt toe naar dit ene punt: "${args.kern.trim()}". Laat het aan het eind expliciet landen, maar begin er niet mee.`
    : "";
  const wendingLine = args.wending?.trim()
    ? `\n- DE WENDING: ergens in het midden slaat het gesprek om: "${args.wending.trim()}". Bouw daar naartoe en laat het verschil daarna merkbaar zijn in hoe de personages praten.`
    : "";
  const spraakLine = args.cast.some((c) => c.spraak?.trim() || c.wil?.trim())
    ? `\n- Houd je aan het verlangen en de spreekstijl per personage zoals hierboven beschreven. Iemand die kort en direct praat blijft dat het hele gesprek, en botsende verlangens mogen botsen: laat ze het oneens zijn voordat ze eruit komen.`
    : "";

  const system = `Je bent scenarist voor korte geanimeerde DIALOOG-video's in de stijl van moderne explainer-studio's. De personages praten ZELF met elkaar; er is GEEN verteller. Je output is UITSLUITEND een gestructureerde JSON-spec die daarna wordt gerenderd.

DE CAST STAAT VAST. Deze personages zijn al gekozen; je verzint er geen bij en laat er geen weg:
${castLijst}
Gebruik in "characterId" ALTIJD een van deze id's, exact zoals hierboven geschreven.

DIALOOG:
- Schrijf een natuurlijk gesprek dat het onderwerp uitlegt of naspeelt: vraag en antwoord, herkenning, een kleine wending, en een duidelijke afsluiting. Elke regel volgt logisch op de vorige.
- Verdeel het gesprek over PRECIES ${sceneCount} scènes en in totaal ongeveer ${lineCount} dialoogregels (samen ~${targetSeconds} seconden). Houd elke regel rond de ${wordsPerLine} woorden: één natuurlijke gesproken zin, niet meer.
- Laat de personages ELKAAR AANSPREKEN en om de beurt aan het woord: nooit meer dan twee regels achter elkaar van dezelfde persoon.
- Elke regel heeft: "characterId", "text" (de gesproken zin in ${lang}) en "emotion" (één kort woord, bijv. "neutraal", "blij", "verrast", "bezorgd").

SCÈNES EN DE "setting":
- Per scène lever je een ENGELSE "setting": alleen de OMGEVING waarin dit deel van het gesprek zich afspeelt, bijvoorbeeld "a modern office with a desk and a laptop" of "a bright kitchen with a counter".
- Beschrijf UITSLUITEND de plek. Noem GEEN personages, geen namen, geen houdingen en geen handelingen — wie er staat en hoe ze staan bepalen wij op basis van de cast.
- Geef elke scène een duidelijk ANDERE omgeving, zodat de video visueel afwisselt.
- GEEN tekst in beeld.

HARDE REGELS:
- Gebruik alleen feiten en cijfers die letterlijk in de brontekst staan. Verzin geen cijfers.
- Schrijf getallen, prijzen, percentages en data VOLUIT zoals ze uitgesproken worden (bijv. "tweehonderdvijftig euro", "tachtig procent"), nooit als los cijfer of symbool.
- Alle gesproken tekst in ${lang}. De "setting" is altijd in het Engels.${keepLine}${avoidLine}${toneLine}${angleLine}${kernLine}${wendingLine}${spraakLine}`;

  const user = `ONDERWERP / TITEL:
${args.topic || "(leid een passende titel af uit de brontekst)"}

FORMAAT: ${args.format} (${args.format === "9:16" ? "staand, social" : "liggend, presentatie"})

BRONTEKST / DATA (haal hier het verhaal en de cijfers uit, verzin niets):
"""
${args.rawText.slice(0, 8000)}
"""

Schrijf nu de dialoog als JSON volgens het schema.`;

  return { system, user };
}
