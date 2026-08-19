import { openai } from "@/lib/openai";
import type { DialogueCastMember, CastPosition } from "./dialogue-schema";

// Controleren WIE er praat, in plaats van hopen dat het klopt.
//
// De dialoogmodus zet twee generatieve stappen achter elkaar: een beeldmodel maakt
// een bronbeeld waarin één persoon zijn mond opent, en een videomodel brengt dat in
// beweging. Beide kunnen de verkeerde persoon kiezen, en dan komt de vrouwenstem
// uit de man. Prompts alleen lossen dat niet op: het gaat niet vaak mis, maar wel
// vaak genoeg om onbruikbaar te zijn, en je ziet het pas als de video af is.
//
// Daarom kijkt een visie-model naar het bronbeeld en zegt het wie zijn mond open
// heeft. Klopt dat niet met wie er hoort te praten, dan maken we het beeld opnieuw
// vóórdat we geld aan de bewegende clip uitgeven. Het bronbeeld is de goedkope stap
// ($0,04) en bepaalt vrijwel volledig wat het videomodel daarna doet.

export type SprekerOordeel = "klopt" | "verkeerd" | "onduidelijk";

const PLEK_NL: Record<CastPosition, string> = {
  left: "links",
  right: "rechts",
  center: "in het midden",
};

/**
 * Vraagt een visie-model wie er op dit beeld praat, en vergelijkt dat met wie er
 * hoort te praten.
 *
 * Bewust "onduidelijk" als aparte uitkomst: bij een dichte mond of een onduidelijk
 * beeld is opnieuw genereren zonde van het geld, en is doorgaan verstandiger dan
 * blijven proberen. Alleen een HARDE tegenspraak leidt tot een nieuwe poging.
 */
export async function controleerSpreker(
  imageUrl: string,
  spreker: DialogueCastMember,
  luisteraars: DialogueCastMember[]
): Promise<SprekerOordeel> {
  const iedereen = [spreker, ...luisteraars];
  const opsomming = iedereen
    .map((c) => `- ${PLEK_NL[c.position]}: ${(c.appearance ?? "").trim() || c.name}`)
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            "Je kijkt naar een illustratie van een gesprek en bepaalt wie er aan het woord is. " +
            "De spreker herken je aan een duidelijk GEOPENDE mond; wie luistert heeft de mond dicht. " +
            'Antwoord met JSON: {"spreker": "links" | "rechts" | "midden" | "onduidelijk"}. ' +
            'Gebruik "onduidelijk" als geen enkele mond duidelijk open is, of als er meer dan één ' +
            "mond open staat.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `In dit beeld staan deze personen:\n${opsomming}\n\nWie heeft zijn of haar mond open?`,
            },
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const antwoord = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { spreker?: string };
    const gezien = (antwoord.spreker ?? "").trim().toLowerCase();
    if (!gezien || gezien === "onduidelijk") return "onduidelijk";

    const verwacht = spreker.position === "left" ? "links" : spreker.position === "right" ? "rechts" : "midden";
    return gezien === verwacht ? "klopt" : "verkeerd";
  } catch (e) {
    // Een mislukte controle mag de productie niet blokkeren; dan gaan we door op
    // vertrouwen, zoals het hiervoor altijd al ging.
    console.error("[dialogue-verify] controle mislukt:", e);
    return "onduidelijk";
  }
}

/**
 * Controleert de GEMAAKTE CLIP: staat halverwege de juiste mond open?
 *
 * Hiervoor deed een pixelmeting dit werk — verschil in helderheid binnen een klein
 * kader dat de mond moest raken. Dat kader bleek op de ogen en het haar te vallen,
 * dus die "controle" mat knipperen en gaf ruis terug. Nu kijkt hetzelfde visie-model
 * dat het bronbeeld beoordeelt naar een uitgesneden frame uit het midden van de clip.
 * Dat is dezelfde methode die in de test twee van de twee goed had, inclusief het
 * betrappen van de omgekeerde vraag.
 *
 * Het frame moet publiek opvraagbaar zijn; de aanroeper zet het daarom eerst in de
 * opslag.
 */
export async function controleerClipFrame(
  frameUrl: string,
  spreker: DialogueCastMember,
  luisteraars: DialogueCastMember[]
): Promise<SprekerOordeel> {
  return controleerSpreker(frameUrl, spreker, luisteraars);
}

// ---------------------------------------------------------------------------
// BEELDFOUTEN — wat het model tekent dat niet kán
//
// De sprekercontrole hierboven kijkt naar WIE er praat. Dat is niet de enige
// manier waarop een beeld mislukt: in een testvideo stonden twee personages tot
// hun middel ÍN een ultrasone reinigingstank, en op een beeldscherm stond
// verzonnen letterbrij. Zulke fouten zag niemand aankomen omdat er niets naar
// keek.
//
// Deze controle stelt dezelfde vraag als een mens die het beeld bekijkt: klopt
// dit? Ze hangt aan dezelfde aanroep als de sprekercontrole, dus hij kost bijna
// niets extra.
// ---------------------------------------------------------------------------

export interface BeeldOordeel {
  /** Alleen ingevuld als er een spreker te controleren viel. */
  spreker: SprekerOordeel;
  /** Korte omschrijvingen van wat er fysiek niet klopt; leeg = niets gevonden. */
  fouten: string[];
}

/**
 * Beoordeelt een bronbeeld in één aanroep op twee dingen: praat de juiste
 * persoon, en staat er iets in dat fysiek onmogelijk is?
 *
 * `spreker` mag null zijn — bij een actiebeeld praat er niemand en is alleen de
 * tweede vraag van belang.
 */
export async function beoordeelBeeld(
  imageUrl: string,
  spreker: DialogueCastMember | null,
  anderen: DialogueCastMember[]
): Promise<BeeldOordeel> {
  const iedereen = [...(spreker ? [spreker] : []), ...anderen];
  const opsomming = iedereen
    .map((c) => `- ${PLEK_NL[c.position]}: ${(c.appearance ?? "").trim() || c.name}`)
    .join("\n");

  const sprekerVraag = spreker
    ? `\n\nVRAAG 1 — WIE PRAAT ER?\nDe spreker herken je aan een duidelijk GEOPENDE mond; wie luistert heeft de mond dicht.`
    : "";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "Je beoordeelt een illustratie voor een animatievideo.\n\n" +
            (spreker
              ? 'Antwoord met JSON: {"spreker": "links"|"rechts"|"midden"|"onduidelijk", "fouten": ["...", "..."]}.\n\n'
              : 'Antwoord met JSON: {"fouten": ["...", "..."]}.\n\n') +
            "Zet in \"fouten\" alleen dingen die ECHT NIET KUNNEN, elk in een paar woorden:\n" +
            "- een persoon die in of onder een object, tank, bak of water staat in plaats van ernaast\n" +
            "- ontbrekende, dubbele of vergroeide ledematen, handen of vingers\n" +
            "- een voorwerp dat zweeft of dat onmogelijk vastgehouden wordt\n" +
            "- een voorwerp met een volstrekt verkeerd formaat ten opzichte van de mensen\n" +
            "- onleesbare of verzonnen tekst op een scherm, bord, etiket of document\n\n" +
            "Wees streng op deze punten maar zeur niet: stijlkeuzes, vlakke kleuren, ontbrekende " +
            "schaduwen, vereenvoudigde vormen en een lege achtergrond zijn GEEN fouten — dit is met " +
            "opzet een illustratie en geen foto. Klopt alles, geef dan een lege lijst.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `In dit beeld staan deze personen:\n${opsomming}${sprekerVraag}\n\nBeoordeel het beeld.`,
            },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const antwoord = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      spreker?: string;
      fouten?: string[];
    };
    const fouten = Array.isArray(antwoord.fouten)
      ? antwoord.fouten.map((f) => String(f).trim()).filter(Boolean).slice(0, 5)
      : [];

    if (!spreker) return { spreker: "onduidelijk", fouten };

    const gezien = (antwoord.spreker ?? "").trim().toLowerCase();
    const verwacht = spreker.position === "left" ? "links" : spreker.position === "right" ? "rechts" : "midden";
    const oordeel: SprekerOordeel =
      !gezien || gezien === "onduidelijk" ? "onduidelijk" : gezien === verwacht ? "klopt" : "verkeerd";
    return { spreker: oordeel, fouten };
  } catch (e) {
    // Een mislukte controle mag de productie niet blokkeren.
    console.error("[dialogue-verify] beeldbeoordeling mislukt:", e);
    return { spreker: "onduidelijk", fouten: [] };
  }
}

/**
 * Beoordeelt de BEWEGING door meerdere frames uit dezelfde clip naast elkaar te
 * leggen.
 *
 * Dit is wat een controle op één beeld principieel niet kan. In een testvideo
 * vouwde een bus zichzelf op en reed daarna een gebouw binnen; elk frame apart
 * zag er prima uit, alleen de overgang ertussen was onmogelijk. Alleen door
 * frames te VERGELIJKEN komt zoiets boven water.
 */
export async function beoordeelBeweging(frameUrls: string[], beschrijving: string): Promise<string[]> {
  if (frameUrls.length < 2) return [];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "Je krijgt frames uit ÉÉN doorlopende animatieclip, in chronologische volgorde. " +
            "Beoordeel of het één samenhangende opname kan zijn.\n\n" +
            'Antwoord met JSON: {"fouten": ["...", "..."]}, elk in een paar woorden.\n\n' +
            "Meld alleen wat tussen de frames ECHT NIET KAN:\n" +
            "- een object dat van vorm verandert, opvouwt, uitklapt of in iets anders verandert\n" +
            "- een voertuig of voorwerp dat verspringt, door iets heen gaat of plots ergens anders staat\n" +
            "- een persoon die van lichaamsbouw, kleding, haar of gezicht verandert\n" +
            "- ledematen die versmelten, verdwijnen, uitrekken of erbij komen\n" +
            "- iets dat uit het niets verschijnt of oplost\n\n" +
            "Normale beweging is GEEN fout: lopen, gebaren, pratende monden, hoofden die draaien, " +
            "een langzame camerabeweging, licht wisselende kijkhoek. Verschillen in fijne details " +
            "tussen frames horen bij animatie. Klopt het, geef dan een lege lijst.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `De clip hoort dit te tonen: ${beschrijving || "een gesprek tussen twee mensen"}.` },
            ...frameUrls.map((url) => ({
              type: "image_url" as const,
              image_url: { url, detail: "low" as const },
            })),
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const antwoord = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { fouten?: string[] };
    return Array.isArray(antwoord.fouten)
      ? antwoord.fouten.map((f) => String(f).trim()).filter(Boolean).slice(0, 5)
      : [];
  } catch (e) {
    console.error("[dialogue-verify] bewegingsbeoordeling mislukt:", e);
    return [];
  }
}
