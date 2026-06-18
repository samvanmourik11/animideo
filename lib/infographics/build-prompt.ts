import type { InfographicFormat } from "@/lib/types";

export interface BuildPromptArgs {
  topic: string;
  rawText: string;
  format: InfographicFormat;
  brand?: {
    name?: string | null;
    toneOfVoice?: string | null;
    primary?: string | null;
    secondary?: string | null;
    accent?: string | null;
  } | null;
  language?: string;
}

/**
 * Bouwt de system- en user-prompt voor de infographic-spec generatie.
 * Puur (geen side effects) zodat het los getest kan worden en de route dun blijft.
 * De AI levert UITSLUITEND gestructureerde data; ze rendert nooit pixels.
 */
export function buildInfographicPrompt(args: BuildPromptArgs): {
  system: string;
  user: string;
} {
  const lang = args.language || "Nederlands";
  const brandColors = [
    args.brand?.primary ? `primary ${args.brand.primary}` : null,
    args.brand?.secondary ? `secondary ${args.brand.secondary}` : null,
    args.brand?.accent ? `accent ${args.brand.accent}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const brandLine = args.brand?.name
    ? `Het merk is "${args.brand.name}"${args.brand.toneOfVoice ? ` (tone of voice: ${args.brand.toneOfVoice})` : ""}.${
        brandColors ? ` Gebruik deze merkkleuren voor het thema: ${brandColors}.` : ""
      }`
    : "";

  const system = `Je bent een senior datavisualisatie-designer die zakelijke infographics ontwerpt.
Je output is UITSLUITEND een gestructureerde JSON-spec die later deterministisch in SVG wordt gerenderd. Je tekent zelf geen beelden en schrijft geen opmaak.

HARDE REGELS:
- Gebruik ALLEEN cijfers, percentages en feiten die letterlijk in de aangeleverde brontekst staan. Verzin NOOIT statistieken. Als er geen harde cijfers zijn, gebruik dan proces-, vergelijkings- of lijst-blocks in plaats van charts.
- Kies 3 tot 7 blocks die samen een logisch verhaal vertellen: open met een sterke kerncijfer-stat (de hook, dit is het hero-blok), onderbouw met een chart, daarna eventueel een proces/timeline of vergelijking, en sluit af met een bondige lijst of takeaway.
- Het stat-blok wordt gerenderd als een geïllustreerde "journey" met icoon-badges, niet als losse cijfers. Geef daarom ELK stat-item:
  - een passend "icon"-keyword (zie lijst onder) dat het cijfer visueel ondersteunt,
  - een korte "sub" met context van max ~40 tekens (bijv. "was 8.500", "+12% t.o.v. 2024", "van de klanten"). Laat "sub" leeg als er geen zinnige context is.
  Maak het stat-blok bij voorkeur rijk: 3 tot 6 kerncijfers die de belangrijkste cijfers uit de bron samenvatten.
- Houd teksten kort en zakelijk. Labels max ~40 tekens, lijstitems max ~90 tekens. Geen volzinnen in charts.
- Voor barChart/lineChart: 2 tot 8 datapunten met echte numerieke waarden. Voor pieChart: 2 tot 6 segmenten. Voor comparison: precies 2 kolommen en 2 tot 6 rijen. Voor process: 2 tot 6 stappen. Voor stat: 3 tot 6 kerngetallen (elk met icon en waar mogelijk sub).
- Kies een professioneel kleurthema met hoog contrast en goede leesbaarheid, levendig maar zakelijk. Eén hoofdkleur + accent, geen felle clownskleuren. Een lichte achtergrond werkt het beste voor deze stijl.
- Icon-keywords (voor stat-items én list-items), kies de meest passende of laat leeg: chart, growth, decline, check, clock, target, users, money, idea, warning, star, globe, document, shield, rocket.
- Alle zichtbare teksten in ${lang}.`;

  const user = `ONDERWERP / TITEL:
${args.topic || "(geen titel opgegeven, leid een passende titel af uit de brontekst)"}

FORMAAT: ${args.format} (${args.format === "9:16" ? "staand, social" : "liggend, presentatie"})
${brandLine ? `\n${brandLine}\n` : ""}
BRONTEKST / DATA (haal hier de cijfers en feiten uit, verzin niets):
"""
${args.rawText.slice(0, 8000)}
"""

Genereer nu de infographic-spec volgens het opgegeven schema.`;

  return { system, user };
}
