import { openai } from "@/lib/openai";
import { NL_REGIE_REGEL } from "@/lib/infographics/nl-beeldkennis";

// Art-direction-pass ná het script. Waar het script de illustratie-briefings als
// bijproduct maakt (vaak generiek/random, losse iconen), begrijpt deze stap het
// HELE verhaal + de bron en bepaalt bewust wat elke scene toont — en vooral wat
// NIET. Zo matchen de beelden echt met de voice-over en hangen ze samen als set.
//
// Fail-open: bij een fout of scene-aantal-mismatch geven we null terug en houdt de
// route de oorspronkelijke briefings aan.

export interface ArtDirectScene {
  voiceover: string;
}
/** Eén terugkerend personage, met een uiterlijk dat in élke scène gelijk blijft. */
export interface ArtDirectCastMember {
  name: string;       // "Johan"
  role: string;       // "de taxateur"
  appearance: string; // "man, midden 40, kort blond haar, grijs colbert over groen overhemd"
}

export interface ArtDirectResult {
  bible: { setting: string; motifs: string; avoid: string };
  /** De vaste cast van dit verhaal (0-4 personen). */
  cast: ArtDirectCastMember[];
  illustrations: string[]; // exact één per scene, in dezelfde volgorde
  /** Per scene: welke castleden erin voorkomen (namen uit `cast`). */
  sceneCast: string[][];
  /** Per scene: de exacte woorden die in beeld mogen staan (vaak leeg). */
  sceneLabels: string[][];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const ART_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["visualBible", "cast", "scenes"],
  properties: {
    visualBible: {
      type: "object",
      additionalProperties: false,
      required: ["setting", "motifs", "avoid"],
      properties: {
        setting: { type: "string" },
        motifs: { type: "string" },
        avoid: { type: "string" },
      },
    },
    // De cast is losgetrokken uit de visual bible en gestructureerd, omdat hij
    // woordelijk in élke beeld-prompt terechtkomt: één vrije tekstregel is te
    // vaag om een gezicht mee vast te houden.
    cast: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "role", "appearance"],
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          appearance: { type: "string" },
        },
      },
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["illustration", "cast", "kernbeeld", "labels"],
        properties: {
          illustration: { type: "string" },
          cast: { type: "array", items: { type: "string" } },
          // Dwingt de regisseur het verband expliciet te maken. Zonder dit veld
          // schrijft hij een beeld dat "ergens over het onderwerp" gaat in plaats
          // van over déze zin — precies waarom de beelden random aanvoelden.
          kernbeeld: { type: "string" },
          // De exacte woorden die in beeld mogen staan. Leeg = geen tekst.
          labels: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

// In de overheidsmodus regisseer je geen scènes maar diagrammen. Die twee
// instructies sluiten elkaar uit — een briefing die om "een echte menselijke
// scène op een plek" vraagt, levert precies het beeld op dat deze stijl níét is.
const SYSTEM_OVERHEID = `Je bent een senior art director voor uitleganimaties in de stijl van de Rijksoverheid: vlakke motion graphics, geen getekende scènes. Je krijgt het BRONMATERIAAL over het onderwerp én het volledige script (per scene de gesproken voice-over). Jij bepaalt per scene wat de kijker ziet.

DE BEELDTAAL VAN DEZE STIJL:
- Elk beeld is een DIAGRAM op een leeg, egaal lichtgrijs vlak. Er is geen plek: geen kamer, geen straat, geen landschap, geen horizon, geen vloer.
- Je bouwt met concrete objecten en iconen op groot formaat (een koffer, een stapel munten, een gebouw, een document, een fabriek) en met witte geometrische panelen: afgeronde kaarten, een rij of raster van gelijke vlakken, of één grote witte boogvorm achter het onderwerp.
- Verhoudingen en verbanden toon je grafisch: een sliert munten als stromend lint, een stapel die in tweeën splitst, pijlen of stromen tussen panelen, twee helften naast elkaar om te vergelijken.
- Mensen zijn vlakke uitgeknipte figuren die op het lege vlak staan, zonder iets eronder. Vaak zie je alleen handen en onderarmen die vanaf de rand het beeld binnenkomen om iets vast te houden of aan te wijzen.
- Rustig, symmetrisch en ruim opgezet, met veel lege ruimte. Eén idee per beeld.

WERKWIJZE:
1. Begrijp het onderwerp echt en bepaal de kern, de bedragen en de verbanden die uitgelegd moeten worden.
2. Stel een korte "visual bible" op:
   - setting: laat dit leeg of beschrijf hooguit "leeg lichtgrijs vlak" — deze stijl heeft geen omgeving.
   - motifs: 1 à 2 terugkerende grafische motieven die specifiek bij DIT onderwerp passen (bijv. de muntenstroom, de koffer, de boogvorm).
   - avoid: wat je in dit verhaal juist NIET wilt zien.
3. De cast blijft in deze stijl LEEG: de figuren zijn algemene, uitwisselbare uitknipsels en geen personages die de kijker moet herkennen. Geef dus een lege lijst terug en laat "cast" per scene ook leeg.
4. Schrijf per scene ÉÉN Engelse briefing die de compositie beschrijft: welke objecten, iconen, panelen en figuren er staan, hoe groot, en hoe ze zich tot elkaar verhouden. Sluit aan op de vorige scene, zodat het één doorlopende uitleg blijft.
   HET BEELD IS ÉÉN OP ÉÉN MET DE ZIN. Wat de voice-over van díé scene noemt, zie je: noemt de zin twee geldstromen, dan staan die twee stromen in beeld; noemt hij een verhouding of een verdeling, dan zie je die verdeling; noemt hij een instantie of een document, dan staat dat object er groot in. Een kijker die het geluid uitzet moet aan het beeld nog kunnen zien waar deze zin over ging. Een beeld dat "ergens over het onderwerp" gaat in plaats van over déze zin is fout.
5. Vul per scene "kernbeeld" in: één korte Nederlandse zin in de vorm "je hoort X → je ziet Y". Klopt dat verband niet, dan herschrijf je je eigen briefing.
6. Vul per scene "labels": de exacte woorden die IN het beeld komen te staan, in dezelfde taal als de voice-over. In deze stijl hóórt korte tekst erbij en maakt hij de uitleg duidelijker: zet de categorie bij een stapel, de naam bij een gebouw, het jaartal bij een balk. Maximaal drie labels van één of twee woorden, correct gespeld, geen afkortingen en geen hele zinnen. Noem dezelfde woorden letterlijk in je Engelse briefing, tussen aanhalingstekens. Voegt tekst niets toe, dan een lege lijst.
7. Laat "cast" per scene leeg.

WAT JE NIET DOET (cruciaal — hier gaat het meestal mis):
- GEEN omgevingen of locaties beschrijven. Zodra er "in a living room", "on a street" of "with a landscape behind them" staat, is het beeld fout.
- Een beeld dat vooral uit vlakken met woorden bestaat. Dit is een tekening, geen dia: in élke scene staat minstens één concreet, herkenbaar getekend object, icoon of figuur, groot in beeld en met detail (een koffer met handvat en sloten, een bakstenen rijtjeshuis, een stapel munten, een document met een omgevouwen hoek, iemand die iets vasthoudt). Een paneel is de achtergrond van zo'n tekening en nooit een doos met alleen een woord erin. Dek in gedachten de labels af: is er dan nog te zien waar de scene over gaat? Zo nee, herschrijf je briefing.
- Tekst in het beeld die NIET in "labels" staat. De labels zijn de enige woorden die er mogen staan; verzin er in je briefing geen opschriften, koppen of zinnen bij.
- GEEN fotorealisme, geen diepte, geen schaduwen, geen perspectief: alles is plat en van voren gezien.
- GEEN drukke verzameling losse icoontjes zonder verband: de elementen die je noemt hebben altijd een duidelijke onderlinge relatie.
- GEEN cliché-symbolen voor abstracte begrippen: geen handdruk voor vertrouwen of een akkoord, geen gloeilamp voor een idee, geen tandwielen voor een proces, geen vinkjes, doelwitten of stijgende pijlen als versiering. Zoek in plaats daarvan het concrete ding waar het in deze zin écht over gaat: gaat het over vertrouwen in plaats van controle, laat dan zien wat er wegvalt (een stapel formulieren die verdwijnt, een slagboom die omhoog gaat) of wat ervoor in de plaats komt.
- Verzin geen bedragen of feiten die niet uit de bron of de voice-over volgen.

Antwoord met UITSLUITEND de JSON: de visual bible, een lege cast, en exact evenveel briefings als er scenes zijn, in dezelfde volgorde als het script.`;

const SYSTEM = `Je bent een senior art director en visuele verhalenverteller voor platte-vector explainer-video's (stijl: Yum Yum Videos / Cognitive). Je krijgt het BRONMATERIAAL over het onderwerp én het volledige script (per scene de gesproken voice-over). Jij regisseert de BEELDEN: per scene bepaal je wat de kijker letterlijk ziet, zodat het beeld precies matcht met wat de verteller op dat moment zegt. Er komt géén tekst in beeld, dus het beeld moet het in zijn eentje dragen naast de stem.

WERKWIJZE:
1. Begrijp het onderwerp echt, als een mens die het materiaal gelezen heeft. Bepaal de kern, de hoofdrolspelers en de context.
2. Stel eerst een korte "visual bible" op die het hele verhaal consistent maakt:
   - setting: de wereld/omgeving waarin dit speelt.
   - motifs: 1 à 2 terugkerende visuele motieven die specifiek bij DIT onderwerp passen.
   - avoid: wat je in dit verhaal juist NIET wilt zien.
3. Stel de CAST samen: de personen die in meerdere scenes terugkomen. Dit is het belangrijkste onderdeel — de kijker moet in elke scene zien wie wie is.
   - Maximaal 4 personen. In de cast hoort iedereen die in TWEE of meer scenes voorkomt — ook rollen zonder naam in de brontekst. De klant, de huiseigenaar of het stel dat je in scene 1 introduceert en in scene 4 terugziet, is hetzelfde personage en hoort er dus in; geef die dan zelf een korte aanduiding ("de klant", "het echtpaar"). Juist bij die naamloze rollen gaat het mis: de kijker ziet elke scene een ander mens en snapt niet meer wie wie is.
   - Alleen echte figuranten (voorbijgangers, mensen op de achtergrond) blijven buiten de cast. Gaat het verhaal nergens over herkenbare personen (bijv. een kaart of een gebouw), dan is de cast leeg.
   - "name": een korte naam of aanduiding die je in élke briefing gebruikt. Staat er een naam in de brontekst of de voice-over (bijv. "Johan"), gebruik die dan letterlijk.
   - "role": wie diegene IS in dit verhaal ("de taxateur", "de huiseigenaar"). Die rol verandert nooit.
   - "appearance": een concreet, natekenbaar uiterlijk dat in ELKE scene identiek blijft. Noem geslacht, leeftijd bij benadering, haarkleur en -lengte, lichaamsbouw, en kleding MET kleuren ("man, midden 40, kort blond haar, stevig postuur, grijs colbert over een groen overhemd, donkere broek"). Geen vage beschrijvingen als "vriendelijke man" — daar kan een tekenaar niets mee.
   - Maak de castleden onderling duidelijk verschillend: verschillende haarkleur, leeftijd én kledingkleur, zodat je ze nooit door elkaar haalt.
4. Schrijf per scene ÉÉN concrete Engelse illustratie-briefing: een echte, letterlijke scène (wie, wat, waar, welke handeling) die de betekenis van de voice-over van die scene toont — specifiek voor DIT onderwerp, menselijk en helder. Sluit aan op de vorige scene zodat het één verhaal blijft.
   HET BEELD IS ÉÉN OP ÉÉN MET DE ZIN. Neem de concrete dingen die in de voice-over van díé scene genoemd worden letterlijk over in het beeld: gaat de zin over een taxatierapport, dan ligt dat rapport in beeld; over een keuze tussen twee dingen, dan zie je die twee naast elkaar; over een bedrag of verhouding, dan zie je die verhouding. Een kijker die het geluid uitzet moet aan het beeld nog kunnen zien waar deze zin over ging. Beelden die "ergens over het onderwerp" gaan in plaats van over déze zin voelen willekeurig en zijn fout.
5. Benoem in ELKE briefing expliciet de PLEK waar het speelt, als eerste of tweede element: de omgeving is geen decor maar de helft van het beeld. Beschrijf wat je rondom en achter het onderwerp ziet (ruimte, straat, landschap, kaart, gebouw, horizon, tijd van de dag) en laat die omgeving het hele beeld vullen. Varieer de plekken over de scenes, maar houd ze binnen dezelfde wereld uit je visual bible.

6. Vul per scene "kernbeeld" in: één korte Nederlandse zin in de vorm "je hoort X → je ziet Y". Dit is geen bijzaak maar de toets op je eigen werk: staat er iets in Y dat niet uit X volgt, of noemt X iets concreets dat niet in Y staat, dan is je briefing fout en herschrijf je hem.
7. Vul per scene "labels": de exacte woorden die IN het beeld mogen staan, in dezelfde taal als de voice-over. Gebruik ze alleen waar ze het beeld echt duidelijker maken — de naam bij een gebouw, de categorie bij een stapel, het jaartal bij een balk. Maximaal drie labels van één of twee woorden, correct gespeld en zonder afkortingen. Geen tekst nodig? Dan een lege lijst. Noem dezelfde woorden ook letterlijk in je Engelse briefing, tussen aanhalingstekens.
8. Zet bij elke scene in "cast" de namen van de castleden die erin voorkomen (exact zoals in de castlijst, of een lege lijst als er niemand uit de cast in beeld is). Noem diezelfde personen in de Engelse briefing bij naam én met hun twee meest herkenbare kenmerken, bijvoorbeeld: "JOHAN (the appraiser, mid-40s, short blond hair, grey blazer over a green shirt) shows a report to ...". Zonder die herhaling tekent het beeldmodel elke scene een andere man.

WAT JE NIET DOET (cruciaal — hier gaat het meestal mis):
- Personen uit de cast van uiterlijk of rol laten wisselen tussen scenes. De taxateur is in scene 5 dezelfde man als in scene 1, met dezelfde kleding.
- Nieuwe hoofdpersonen introduceren die niet in de cast staan. Figuranten op de achtergrond mogen wel variëren.
- GEEN tekst, letters, cijfers, labels of UI in het beeld.
- GEEN cliché-stockmetaforen (gloeilamp = idee, handdruk = deal, tandwielen = proces, zwevende vinkjes, groeipijlen) — tenzij dat letterlijk het onderwerp is.
- GEEN "icoon-soep": geen scène volgeplempt met losse symbolen, denkwolkjes vol icoontjes of ongerelateerde beeldmerken.
- Teken abstracte begrippen NIET letterlijk (bijv. "innovatie", "data", "groei"): vind een concrete menselijke of echte scène die het overbrengt.
- Verzin geen objecten of feiten die niet uit de bron of de voice-over volgen; spreek de voice-over nooit tegen.
- NOOIT een leeg, wit of egaal vlak als achtergrond, en nooit een uitgeknipt onderwerp dat in het niets zweeft ("on a white background", "isolated on a plain background", "floating"). Er is altijd een plek te zien, van rand tot rand.
- Houd elke scène wél rustig: één duidelijk brandpunt, en een omgeving die je in één oogopslag herkent zonder dat het druk wordt. Rustig is niet hetzelfde als leeg.

Antwoord met UITSLUITEND de JSON: de visual bible + exact evenveel illustration-briefings als er scenes zijn, in dezelfde volgorde als het script.`;

// ---------------------------------------------------------------------------
// DE AANSLUITINGSCONTROLE
//
// De regisseur schrijft alle briefings in één keer en kijkt daarbij vooral naar
// het verhaal als geheel. Het gevolg: beelden die kloppen bij het ONDERWERP maar
// niet bij de ZIN die op dat moment klinkt — precies waarom ze willekeurig
// aanvoelen. Deze tweede pass legt elke briefing naast zijn eigen voice-over en
// herschrijft alleen wat niet aansluit. Puur tekst, dus goedkoop.
//
// Fail-open: gaat dit mis, dan houden we de oorspronkelijke briefings aan.
// ---------------------------------------------------------------------------

const KEUR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scenes"],
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sluitAan", "illustration"],
        properties: {
          sluitAan: { type: "boolean" },
          // Bij sluitAan=false: de herschreven briefing. Anders een lege string.
          illustration: { type: "string" },
        },
      },
    },
  },
} as const;

async function keurAansluiting(
  scenes: { voiceover: string; illustration: string }[],
  overheid: boolean
): Promise<string[] | null> {
  try {
    const lijst = scenes
      .map((s, i) => `Scene ${i + 1}:\n  ZIN (dit hoort de kijker): "${s.voiceover}"\n  BEELD (dit ziet de kijker): ${s.illustration}`)
      .join("\n\n");

    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: clamp(scenes.length * 200 + 600, 2000, 12000),
      messages: [
        {
          role: "system",
          content:
            `Je controleert of het beeld van elke scene één op één aansluit op de zin die op dat moment klinkt. ` +
            `Zet "sluitAan" op false zodra een van deze dingen speelt: het beeld toont iets anders dan de zin zegt; ` +
            `de zin noemt iets concreets (een document, een bedrag, een verhouding, een keuze, een plek, een handeling) ` +
            `dat niet in het beeld terugkomt; het beeld gaat over het onderwerp in het algemeen in plaats van over deze zin; ` +
            `het beeld herhaalt een eerdere scene zonder dat de zin dat vraagt; ` +
            `of het beeld bestaat vooral uit lege vlakken, dozen en pijlen met woorden erin in plaats van uit een echte ` +
            `tekening — dek de tekst in gedachten af, en blijft er dan niets herkenbaars over, dan keur je af.\n` +
            `Herschrijf in dat geval de briefing volledig in het ENGELS, zodat een kijker met het geluid uit nog kan zien ` +
            `waar deze zin over ging. Blijf daarbij binnen de beeldtaal van de video: ` +
            (overheid
              ? `een vlak DIAGRAM op een leeg lichtgrijs vlak — objecten, iconen, witte panelen en uitgeknipte figuren, nooit een omgeving of locatie.`
              : `één concrete, letterlijke scène met mensen op een plek die het hele beeld vult.`) +
            `\nSluit een beeld wél aan, dan zet je "sluitAan" op true en laat je "illustration" leeg (""). Verbeter niets wat al klopt.`,
        },
        { role: "user", content: `${lijst}\n\nBeoordeel elke scene.` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "aansluiting", strict: true, schema: KEUR_SCHEMA as unknown as Record<string, unknown> },
      },
    });

    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as {
      scenes?: { sluitAan?: boolean; illustration?: string }[];
    };
    if (!Array.isArray(parsed.scenes) || parsed.scenes.length !== scenes.length) return null;
    return scenes.map((s, i) => {
      const oordeel = parsed.scenes![i];
      const nieuweBriefing = (oordeel?.illustration ?? "").trim();
      // Alleen vervangen als er echt is afgekeurd én er iets bruikbaars staat.
      return oordeel?.sluitAan === false && nieuweBriefing.length > 20 ? nieuweBriefing : s.illustration;
    });
  } catch (e) {
    console.error("[art-direct] aansluitingscontrole mislukt, briefings ongewijzigd:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// DE OVERHEIDSSTIJL REGISSEERT GEEN BEELD MAAR EEN OPBOUW.
//
// In deze modus wordt er geen plaatje gegenereerd: de app tekent de scene zelf
// als SVG (zie overheid-scene.ts) en animeert hem op de voice-over. De regisseur
// levert dus geen Engelse beeldbriefing maar een layout — welk sjabloon, welke
// iconen, welke labels. Dat is meteen de reden dat er in deze modus geen
// spelfouten en geen AI-glitches meer kunnen ontstaan.
// ---------------------------------------------------------------------------

const OVERHEID_LAYOUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scenes"],
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["template", "titel", "buiten", "elementen"],
        properties: {
          template: { type: "string", enum: ["centraal", "rij", "stroom", "vergelijking", "groei", "tafereel"] },
          titel: { type: ["string", "null"] },
          buiten: { type: "boolean" },
          elementen: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["icoon", "label", "waarde", "vlak", "x", "houdt"],
              properties: {
                icoon: { type: "string" },
                label: { type: "string" },
                waarde: { type: ["number", "null"] },
                // Alleen voor "tafereel": waar het element staat en of het iets vasthoudt.
                vlak: { type: ["string", "null"], enum: ["achter", "midden", "voor", null] },
                x: { type: ["number", "null"] },
                houdt: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  },
} as const;

function overheidSysteem(iconen: string[]): string {
  return `Je bent art director van een uitleganimatie in de stijl van de Rijksoverheid. De beelden worden NIET getekend door een AI maar door de app zelf opgebouwd uit vaste bouwstenen. Jij bepaalt per scene welke bouwstenen dat zijn.

JE KIEST PER SCENE EEN SJABLOON:
- "centraal": één onderwerp groot in beeld, met een witte boog erachter. Voor een introductie, een kernbegrip of een conclusie.
- "rij": twee tot vier gelijkwaardige dingen naast elkaar in witte panelen. Voor een opsomming ("zorg, onderwijs en sociale zekerheid").
- "stroom": een bron links, met een pijl naar één of twee doelen rechts. Voor "van A naar B", een aanvraag, een geldstroom.
- "vergelijking": twee dingen naast elkaar. Voor oud tegenover nieuw, voor tegenover na, streng tegenover soepel.
- "groei": staven met getallen die groeien. ALLEEN als de voice-over echte cijfers noemt die je met elkaar kunt vergelijken.
- "tafereel": een echte SCÈNE in plaats van kaartjes. Alles staat op één grondvlak, op ware verhouding: een mens is klein naast een gebouw, en een document dat iemand vasthoudt is groot genoeg om te zien. Dit is het rijkste sjabloon en het dichtst bij een echte tekening. Gebruik het voor de opening, voor kernmomenten en overal waar iets gebeurt.

BIJ "tafereel" VUL JE PER ELEMENT OOK IN:
- "vlak": "achter" (omgeving: gebouwen, bomen — kleiner en hoger in beeld), "midden" (het onderwerp en de mensen) of "voor" (dichtbij, bijvoorbeeld een hand die vanaf de rand het beeld in komt). Zet het onderwerp van de scene als EERSTE element; dat wordt automatisch het grootst getekend.
- "x": waar het staat, van 0 (linkerrand) tot 1 (rechterrand). Zet dingen niet allemaal op dezelfde plek en laat ze niet overlappen: een figuur op 0,3 en een gebouw op 0,7 leest rustig.
- "houdt": laat een figuur iets VASTHOUDEN door hier het asset in te vullen ("document", "pasje", "koffer", "munt"). Dat is het verschil tussen een opsomming en een handeling: "een taxateur mét een rapport" in plaats van "een taxateur, en een rapport".
- "buiten" (per scene): true als het buiten speelt. Dan komt er lucht met wolken en een grasvlak in plaats van een leeg vlak.
Gaat de scene over geld (munt, stapel, schatkist, koffer), dan loopt er vanzelf een lint met munten achterlangs.

PER ELEMENT KIES JE:
- "icoon": EXACT één sleutel uit deze lijst (de haakjes zeggen waar het icoon voor staat; gebruik alleen de sleutel ervóór): ${iconen.join(", ")}. Kies het icoon dat het dichtst bij het onderwerp ligt; twijfel je, neem dan "vlak".
- "label": het woord dat eronder komt te staan, in de taal van de voice-over. Eén of twee woorden, met een hoofdletter, correct gespeld, geen zin. HEEL BELANGRIJK: gebruik een woord dat LETTERLIJK in de voice-over van die scene voorkomt. De app laat het element namelijk verschijnen op het moment dat de stem dat woord uitspreekt; staat het woord er niet in, dan valt de timing terug op een schatting.
- "waarde": alleen bij het sjabloon "groei" een getal (de verhouding van de staaf, 0-100). Anders null.

REGELS:
- Twee tot vier elementen per scene, nooit meer. Bij "centraal" precies één, bij "vergelijking" precies twee.
- Elk element hoort bij iets dat de voice-over van díé scene noemt. Een kijker die het geluid uitzet moet aan de beelden nog kunnen volgen waar het over ging.
- Varieer de sjablonen over de video: niet vijf keer "rij" achter elkaar. Gebruik "tafereel" voor minstens een derde van de scenes — een video die alleen uit kaartjes bestaat leest als een presentatie, niet als een animatie.
- Verzin geen cijfers die niet in de bron staan.
- Titel: alleen als hij echt iets toevoegt (een hoofdstuktitel of kernvraag), anders null. Niet dezelfde tekst als de labels.

Antwoord met UITSLUITEND de JSON, met exact evenveel scenes als het script, in dezelfde volgorde.`;
}

export interface OverheidRegieScene {
  template: "centraal" | "rij" | "stroom" | "vergelijking" | "groei" | "tafereel";
  titel: string | null;
  buiten?: boolean;
  elementen: {
    icoon: string;
    label: string;
    waarde: number | null;
    vlak?: "achter" | "midden" | "voor" | null;
    x?: number | null;
    houdt?: string | null;
  }[];
}

/**
 * Regisseert de scenes van de overheidsmodus als layouts. Fail-open: bij een
 * fout geven we null terug en valt de route terug op een eenvoudige opbouw.
 */
export async function regisseerOverheidScenes(input: {
  topic: string;
  rawText: string;
  scenes: ArtDirectScene[];
  iconen: string[];
  /** Dezelfde sleutels, met uitleg waarvoor ze staan. */
  icoonUitleg?: string[];
}): Promise<OverheidRegieScene[] | null> {
  const n = input.scenes.length;
  if (n === 0) return null;
  try {
    const sceneLijst = input.scenes.map((s, i) => `Scene ${i + 1}:\n  Voice-over: ${s.voiceover}`).join("\n\n");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      max_tokens: clamp(n * 200 + 700, 2000, 12000),
      messages: [
        { role: "system", content: overheidSysteem(input.icoonUitleg ?? input.iconen) },
        {
          role: "user",
          content: `ONDERWERP: ${input.topic || "(leid af uit het bronmateriaal)"}

BRONMATERIAAL:
"""
${input.rawText.slice(0, 9000)}
"""

SCRIPT (${n} scenes, in volgorde):
${sceneLijst}

Geef nu per scene de opbouw als JSON.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "overheid_layouts", strict: true, schema: OVERHEID_LAYOUT_SCHEMA as unknown as Record<string, unknown> },
      },
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { scenes?: OverheidRegieScene[] };
    if (!Array.isArray(parsed.scenes) || parsed.scenes.length !== n) return null;
    const geldig = new Set(input.iconen);
    return parsed.scenes.map((sc) => ({
      template: sc.template,
      titel: (sc.titel ?? "").trim() || null,
      buiten: sc.buiten === true,
      elementen: (Array.isArray(sc.elementen) ? sc.elementen : [])
        .map((el) => ({
          // Een verzonnen icoonsleutel zou een leeg vak opleveren; die vangen we
          // af met de neutrale vorm in plaats van de scene te laten mislukken.
          icoon: geldig.has(el?.icoon) ? el.icoon : "vlak",
          label: (el?.label ?? "").trim().slice(0, 28),
          waarde: typeof el?.waarde === "number" ? el.waarde : null,
          vlak: el?.vlak === "achter" || el?.vlak === "voor" || el?.vlak === "midden" ? el.vlak : null,
          x: typeof el?.x === "number" ? Math.max(0.05, Math.min(0.95, el.x)) : null,
          houdt: el?.houdt && geldig.has(el.houdt) ? el.houdt : null,
        }))
        .filter((el) => el.label.length > 0 || el.icoon !== "vlak")
        .slice(0, 4),
    }));
  } catch (e) {
    console.error("[art-direct] overheidsregie mislukt:", e);
    return null;
  }
}

export async function artDirectScenes(input: {
  topic: string;
  rawText: string;
  scenes: ArtDirectScene[];
  /** Rol van het vaste personage, als er een gekozen is. */
  characterRole?: string | null;
  /** Beeldmodus: "overheid" regisseert diagrammen i.p.v. scènes. */
  mode?: "story" | "report" | "overheid";
  /** Taal van de video; bepaalt of de Nederlandse beeldkennis meegaat. */
  language?: string | null;
}): Promise<ArtDirectResult | null> {
  const n = input.scenes.length;
  if (n === 0) return null;
  try {
    const sceneList = input.scenes
      .map((s, i) => `Scene ${i + 1}:\n  Voice-over: ${s.voiceover}`)
      .join("\n\n");

    // De regie moet weten dat er een vast personage is, anders bedenkt hij per
    // scène nieuwe mensen en verschuift de rol alsnog — de referentie-afbeelding
    // repareert dan wel het gezicht, maar niet wie diegene is.
    const rol = input.mode === "overheid" ? "" : (input.characterRole ?? "").trim();
    const rolRegel = rol
      ? `\n\nVAST PERSONAGE: elke scène draait om dezelfde persoon, in dezelfde rol: ${rol}. ` +
        `Benoem hem/haar in de illustratie-briefings als "${rol}" en geef die rol in elke scène ` +
        `dezelfde functie, kleding en verhouding tot de anderen. Verzin geen ander hoofdpersoon.`
      : "";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: clamp(n * 150 + 700, 2000, 12000),
      messages: [
        {
          role: "system",
          content: [
            input.mode === "overheid" ? SYSTEM_OVERHEID : SYSTEM,
            (input.language ?? "Nederlands") === "Nederlands" ? `\n\n${NL_REGIE_REGEL}` : "",
          ].join(""),
        },
        {
          role: "user",
          content: `ONDERWERP: ${input.topic || "(leid af uit het bronmateriaal)"}

BRONMATERIAAL:
"""
${input.rawText.slice(0, 9000)}
"""

SCRIPT (${n} scenes, in volgorde):
${sceneList}${rolRegel}

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
      cast?: Partial<ArtDirectCastMember>[];
      scenes?: { illustration?: string; cast?: string[]; kernbeeld?: string; labels?: string[] }[];
    };
    if (!Array.isArray(parsed.scenes) || parsed.scenes.length !== n) return null;
    const illustrations = parsed.scenes.map((s) => (s.illustration ?? "").trim());
    if (illustrations.some((s) => s.length < 3)) return null;
    const bible = parsed.visualBible ?? { setting: "", motifs: "", avoid: "" };
    // Castleden zonder naam of uiterlijk zijn waardeloos als referentie; die
    // gooien we weg in plaats van ze half door de prompts te slepen.
    const cast: ArtDirectCastMember[] = input.mode === "overheid" ? [] : (parsed.cast ?? [])
      .map((c) => ({ name: (c.name ?? "").trim(), role: (c.role ?? "").trim(), appearance: (c.appearance ?? "").trim() }))
      .filter((c) => c.name.length > 0 && c.appearance.length > 2)
      .slice(0, 4);
    const namen = new Set(cast.map((c) => c.name));
    const sceneCast = parsed.scenes.map((s) => (Array.isArray(s.cast) ? s.cast.filter((naam) => namen.has(naam)) : []));
    // Labels: maximaal drie korte woorden per scene. Lange "labels" zijn in de
    // praktijk hele zinnen die het beeldmodel als letterbrij tekent.
    const sceneLabels = parsed.scenes.map((s) =>
      (Array.isArray(s.labels) ? s.labels : [])
        .map((l) => (l ?? "").trim())
        .filter((l) => l.length > 0 && l.length <= 24)
        .slice(0, 3)
    );
    const gekeurd = await keurAansluiting(
      illustrations.map((b, i) => ({ voiceover: input.scenes[i]?.voiceover ?? "", illustration: b })),
      input.mode === "overheid"
    );
    return { bible, cast, illustrations: gekeurd ?? illustrations, sceneCast, sceneLabels };
  } catch (e) {
    console.error("[art-direct] mislukt, originele briefings behouden:", e);
    return null;
  }
}
