// Het gereedschap van de dialoog-assistent: één functie die het complete plan
// oplevert. Alles wat de wizard nodig heeft zit erin — cast, beeldregie,
// instellingen én het volledige draaiboek — zodat één aanroep de hele tool vult.
//
// Bewust GEEN aparte tools voor "kies cast" en "schrijf script". Dat leidde in de
// Creator Studio tot half ingevulde toestanden waarin de gebruiker niet meer kon
// zien wat wel en niet besloten was. Hier geldt: de assistent praat tot hij genoeg
// weet, en levert dan in één keer een plan waar je op kunt reageren.

import { STORY_VOICES } from "./story-voices";
import { STORY_STYLE_PRESETS } from "./story-style";
import { CAST_POSITIONS, planVoorLengte, REGELS_PER_SCENE, VERTELLER_ID } from "./dialogue-schema";
import { KADERS, kaderKeuzelijst } from "./verhaal-kaders";
import { LICHTSOORTEN, lichtKeuzelijst } from "./verhaal-licht";
import { verhaallijnBlok, scenesPerDeel, FASEN, FASE_INFO, type VerhaalDeel, type VerhaalModus } from "./verhaallijn";

export const DRAAIBOEK_TOOL = {
  type: "function" as const,
  function: {
    name: "maak_draaiboek",
    description:
      "Roep dit aan zodra je genoeg weet om de video uit te werken. Levert het complete draaiboek " +
      "plus alle instellingen. Roep dit NIET aan als je nog een wezenlijke vraag hebt — stel die dan eerst.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: [
        "toelichting", "title", "format", "language", "tone", "targetSeconds",
        "styleId", "illustrationBrief", "muziekCategorie", "kern", "wending", "cast", "scenes",
      ],
      properties: {
        toelichting: {
          type: "string",
          description:
            "Twee of drie zinnen in het Nederlands waarin je uitlegt welke keuzes je maakte en waarom — " +
            "welke personages, welke stijl, welke toon. De gebruiker leest dit om je keuzes te kunnen corrigeren.",
        },
        title: { type: "string", description: "Titel van de video, in de taal van de video." },
        // Deze twee velden schrijven zelf niets, maar ze DWINGEN een keuze af
        // voordat er ook maar één zin staat. Zonder dat kwam er een reisverslag
        // uit: "Kijk, al die mooie kleuren!" — "Dit is echt geweldig!". Zinnen
        // zonder verlangen en zonder tegenslag, uitwisselbaar tussen personages.
        kern: {
          type: "string",
          description:
            "In ÉÉN Nederlandse zin: waar gaat dit verhaal onderhuids over? Niet de gebeurtenissen, maar de " +
            "menselijke gedachte eronder — wat iemand mist, hoopt, niet durft of wil bewijzen. Bijvoorbeeld: " +
            "\"oma is nooit teruggegaan naar het land waar ze opgroeide en geeft het via de wagen door aan haar " +
            "kleinkinderen\". Elke scène moet hier iets mee te maken hebben.\n\n" +
            "LET OP — dit veld wordt bijna altijd verkeerd ingevuld met een samenvatting van de plot. " +
            "FOUT: \"de kinderen ontdekken de magie van reizen met de wonderwagen\" (dat is wat er GEBEURT). " +
            "GOED: \"oma mist het land waar ze vandaan komt en durft er zelf niet meer heen\" (dat is wat " +
            "iemand VOELT). Staat er in jouw zin een gebeurtenis, dan is hij fout; er hoort een verlangen, " +
            "een gemis of een angst in te staan.",
        },
        wending: {
          type: "string",
          description:
            "In ÉÉN Nederlandse zin: wat loopt er anders dan verwacht? Iets kleins is genoeg — iemand durft " +
            "toch niet, het werkt niet meteen, ze vinden iets anders dan waarvoor ze kwamen, iemand blijkt te " +
            "weten wat de ander verzweeg.\n\n" +
            "Ook dit veld wordt bijna altijd verkeerd ingevuld met plot. " +
            "FOUT: \"de wagen brengt ze naar Suriname, waar ze versteld staan\" (dat was het plan al). " +
            "GOED: \"de wagen komt niet in beweging omdat Tyrell niet gelooft dat het kan\" of \"oma blijkt " +
            "zelf nooit te hebben durven gaan\". Er moet iets MISLOPEN of ANDERS blijken dan gedacht.",
        },
        format: { type: "string", enum: ["16:9", "9:16"] },
        language: { type: "string", description: 'Taal van de gesproken tekst, bijv. "Nederlands".' },
        tone: { type: "string", enum: ["zakelijk", "speels", "energiek"] },
        targetSeconds: { type: "integer", description: "Gewenste lengte in seconden, tussen 20 en 300. Neem de lengte over die de gebruiker heeft gekozen." },
        styleId: {
          type: "string",
          enum: STORY_STYLE_PRESETS.map((s) => s.id),
          description: STORY_STYLE_PRESETS.map((s) => `"${s.id}" = ${s.name}: ${s.tagline}`).join("; "),
        },
        muziekCategorie: {
          type: "string",
          enum: ["zakelijk", "vrolijk", "episch", "emotioneel", "actie", "elektronisch"],
          description:
            "Welke muziek past bij dit verhaal? \"zakelijk\" = neutraal en opbouwend; \"vrolijk\" = licht " +
            "en positief; \"episch\" = groots orkest; \"emotioneel\" = piano en ingetogen; \"actie\" = strak " +
            "en gespannen; \"elektronisch\" = modern en ritmisch. Kies wat bij de TOON van het verhaal " +
            "past — een ontroerend verhaal krijgt geen trailermuziek.",
        },
        illustrationBrief: {
          type: "string",
          description:
            "Regieaanwijzing voor ALLE beelden: kleuren, kleding, sfeer, omgeving. Beschrijf hoe het eruit " +
            "moet zien. Leeg laten mag als de gebruiker niets over de look zei.",
        },
        cast: {
          type: "array",
          description: "De personages die het gesprek voeren. Twee is de norm, drie is het maximum.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "characterId", "name", "role", "leeftijd", "wil", "spraak", "appearance", "voice", "position"],
            properties: {
              id: { type: "string", description: 'Verwijzing binnen dit draaiboek, bijv. "char-1".' },
              characterId: {
                type: "string",
                description: "Het exacte id uit de meegeleverde personagebibliotheek. Verzin er nooit een.",
              },
              name: { type: "string", description: "Naam zoals die in het gesprek gebruikt wordt." },
              role: { type: "string", description: 'Wie dit is in dit gesprek, bijv. "de expert".' },
              leeftijd: {
                type: "string",
                description:
                  "Leeftijd van dit personage in dit verhaal, kort: \"7 jaar\", \"een jaar of 40\", \"ongeveer 70\". " +
                  "Leid hem af uit de briefing en uit de beschrijving in de bibliotheek. Hier iets invullen is " +
                  "geen formaliteit: hierop wordt bepaald hoe GROOT iemand getekend wordt ten opzichte van de " +
                  "anderen. Ontbreekt het, dan wordt een kind van zeven zomaar even lang als een volwassene.",
              },
              wil: {
                type: "string",
                description:
                  "Wat wil dit personage in dit verhaal, in een halve zin? Twee personages die hetzelfde " +
                  "willen hebben geen gesprek maar een instemming. Geef ze dus verschillende verlangens: " +
                  "de een wil bewijzen dat het waar is, de ander durft eigenlijk niet; de een wil weg, de " +
                  "ander wil blijven.",
              },
              spraak: {
                type: "string",
                description:
                  "Hoe praat deze persoon, in een halve zin? Denk aan zinslengte, stopwoordje, of hij " +
                  "vraagt of beweert, druk of bedachtzaam. Je moet aan een regel kunnen zien wie hem zegt, " +
                  "ook zonder de naam erbij. Bijvoorbeeld: \"korte zinnen, stelt alles als vraag, " +
                  "onderbreekt\" tegenover \"praat langzaam, gebruikt beelden, denkt hardop\".",
              },
              appearance: {
                type: "string",
                description:
                  "KORT ENGELS uiterlijk, afgeleid uit de beschrijving in de bibliotheek: haar, kleding, " +
                  'leeftijd. Bijvoorbeeld "a man in his forties, bald, light grey blazer over a white shirt". ' +
                  "Hiermee houden we het personage herkenbaar over alle scènes heen, dus wees concreet over " +
                  "kleur en kledingstuk. Verzin niets wat niet in de beschrijving staat.",
              },
              voice: {
                type: "string",
                enum: STORY_VOICES.map((v) => v.id),
                description: STORY_VOICES.map((v) => `"${v.id}" = ${v.description}`).join("; ") +
                  ". Laat geslacht kloppen met het personage en geef verschillende personages verschillende stemmen. " +
                  "Is een personage een KIND, kies dan een jongens- of meisjesstem — een kind met een volwassen " +
                  "stem haalt een verhaal helemaal onderuit. Volwassenen krijgen nooit een kinderstem.",
              },
              position: {
                type: "string",
                enum: [...CAST_POSITIONS],
                description: "Plek in het kader. Bij twee personages: één links, één rechts.",
              },
            },
          },
        },
        scenes: {
          type: "array",
          description:
            "Het verhaal, verdeeld over scènes. Een scène is ÉÉN plek en ÉÉN moment met meerdere regels, " +
            "meestal drie tot zes. Een nieuwe zin is geen nieuwe scène: praten ze op dezelfde plek door, dan " +
            "blijft het dezelfde scène.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["deel", "setting", "licht", "lines"],
            properties: {
              deel: {
                type: "integer",
                description:
                  "Bij welk deel van de verhaallijn deze scène hoort: het nummer uit de verhaallijn (1 = het eerste " +
                  "deel). Is er geen verhaallijn meegegeven: 1 = begin, 2 = probleem, 3 = tegenslag, " +
                  "4 = omslag, 5 = slot. De nummers lopen op en slaan geen deel over.",
              },
              setting: {
                type: "string",
                description:
                  "ENGELSE beschrijving van alleen de OMGEVING, bijv. \"a modern office with a desk and a laptop\". " +
                  "Noem NOOIT personages, namen, houdingen of handelingen — dus niet \"Marc and Eva smiling and " +
                  "discussing\", maar alleen de plek waar ze staan. Wie er staat en hoe bepalen wij uit de cast. " +
                  "Beschrijf de plek CONCREET genoeg om te tekenen: het soort ruimte, wat er staat, en of het " +
                  "binnen of buiten is — een lege of vage omgeving levert een leeg beeld op. " +
                  "Speelt een scène op een plek die eerder in dit draaiboek al voorkwam, gebruik dan LETTERLIJK " +
                  "dezelfde beschrijving, woord voor woord. Zo blijft het dezelfde kamer en niet een kamer die " +
                  "erop lijkt. Nieuwe plek = nieuwe beschrijving. " +
                  // Het beeldmodel kent Paramaribo niet: "Neve Shalom Synagogue and the Mosque
                  // Keizerstraat" werd één kerk met een kruis én een Davidster.
                  "Een bekend gebouw beschrijf je zoals het eruitziet — vorm, kleur, materiaal en het symbool " +
                  "dat erbij hoort — want de tekenaar kent de naam niet. Twee gebouwen naast elkaar beschrijf je " +
                  "elk apart. Speelt de scène in of bij een voorwerp uit het verhaal (zoals een wagen), noem het " +
                  "dan bij zijn naam. Geen publiek, voorbijgangers of andere mensen in de beschrijving.",
              },
              licht: {
                type: "string",
                enum: [...LICHTSOORTEN],
                description:
                  "Het LICHT in deze scène. Dit bepaalt de sfeer en is net zo belangrijk als wat er gebeurt: " +
                  "een bos 's nachts hoort donker te zijn, een kerstavond bij de haard warm en van één kant " +
                  "verlicht. Kies bewust en wissel af over het verhaal heen — een verhaal waarin het van begin " +
                  "tot eind even helder is, voelt vlak.\n" + lichtKeuzelijst(),
              },
              lines: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["kind", "kader", "characterId", "text", "emotion"],
                  properties: {
                    kind: {
                      type: "string",
                      enum: ["dialoog", "actie"],
                      description:
                        '"dialoog" = je ziet de personages tegenover elkaar en één van hen zegt een zin. ' +
                        '"actie" = je ziet iets ANDERS dan die twee pratende poppetjes: onderweg, aangekomen, ' +
                        "iets ontdekt, of een beeld dat uitvergroot waar het over gaat. " +
                        "Een actiebeeld kan drie dingen doen: (1) alleen muziek — laat \"text\" leeg en vul " +
                        '"seconden" in; (2) een voice-over — vul "text" met de zin die eroverheen klinkt; ' +
                        "(3) het gesprek loopt door terwijl je een versterkend beeld ziet — ook gewoon " +
                        '"text" invullen. Vul bij een actie altijd "actie" in.',
                    },
                    actie: {
                      type: "string",
                      description:
                        "Alleen bij kind \"actie\". SCHRIJF DIT IN HET ENGELS, altijd — deze tekst gaat " +
                        "rechtstreeks naar een beeldmodel dat geen Nederlands verstaat, net als \"setting\". " +
                        'Bijvoorbeeld: "the two of them drive along a country road in a small car, seen from ' +
                        'the side" of "they dig into the sandy ground with shovels, dirt flying". ' +
                        "Beschrijf een zichtbare HANDELING, geen gesprek en geen gedachten. " +
                        "Bij kind \"dialoog\" laat je dit leeg.",
                    },
                    seconden: {
                      type: "integer",
                      description: 'Alleen bij kind "actie": hoe lang dit beeld duurt, tussen 2 en 6 seconden.',
                    },
                    // Stond wel bij de verplichte velden, maar ontbrak hier. Het model
                    // wist dus niet welke kaders er bestaan, en een verhaal kwam terug
                    // met bij alle eenentwintig regels hetzelfde standaardkader: geen
                    // enkel ander camerastandpunt, precies wat het camerawerk moest oplossen.
                    kader: {
                      type: "string",
                      enum: [...KADERS],
                      description:
                        "HOE dit shot in beeld komt. Kies bewust en wissel af — twee dezelfde kaders achter elkaar " +
                        "lezen als één lang shot. Een close-up kan maar met ÉÉN personage; in een totaalbeeld, van " +
                        "bovenaf, van achteren of een detail kan niemand zichtbaar praten, dus gebruik die voor de " +
                        "verteller of voor een beeld zonder tekst.\n" + kaderKeuzelijst(),
                    },
                    verband: {
                      type: "string",
                      description:
                        'Alleen bij kind "actie": ÉÉN korte Nederlandse zin over waar dit beeld uit voortkomt ' +
                        'en waar het naartoe leidt, bijvoorbeeld "ze besloten net erheen te gaan, hierna komen ' +
                        'ze aan". Kun je dat niet opschrijven, dan hoort dit beeld er niet — laat het dan weg.',
                    },
                    characterId: {
                      type: "string",
                      description:
                        'Bij "dialoog": het cast-id van wie er spreekt. Bij "actie": wie er praat over het ' +
                        'beeld. Gebruik daar "verteller" als het een VERTELLER moet zijn — een stem buiten ' +
                        "het verhaal, met een eigen klank, die kort duidt wat je ziet. Wil je juist dat het " +
                        "gesprek doorloopt terwijl je het beeld ziet, gebruik dan het cast-id van degene die " +
                        "aan het woord was.",
                    },
                    text: {
                      type: "string",
                      description:
                        "De gesproken zin van ongeveer twaalf woorden. Getallen, prijzen en percentages " +
                        "VOLUIT geschreven zoals ze uitgesproken worden, want dit gaat naar een stem: " +
                        'dus "zeventien procent" en niet "17%", "vierduizend euro" en niet "€4000". ' +
                        "Neem elk getal dat de gebruiker noemde EXACT over — schrijf zesenzeventig niet " +
                        "als zeventig en negenveertig niet als vijftig. Een verkeerd overgeschreven cijfer " +
                        "is een feitelijke fout in de video.",
                    },
                    emotion: { type: "string", description: 'Eén kort woord, bijv. "neutraal", "verrast".' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// HERZIEN van een bestaand draaiboek
//
// Cruciaal verschil met maak_draaiboek: hier bestaat er al iets. De assistent moet
// het huidige draaiboek KENNEN en alleen aanpassen wat gevraagd wordt. De eerste
// versie hergebruikte het gewone chatcomponent zonder de spec mee te sturen,
// waardoor "Marc moet afsluiten met het telefoonnummer" werd beantwoord met
// "waar moet het gesprek over gaan?" — de assistent begon simpelweg opnieuw.
// ---------------------------------------------------------------------------

const REGEL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "kader", "characterId", "text", "emotion"],
  properties: {
    kind: {
      type: "string",
      enum: ["dialoog", "actie"],
      description:
        '"dialoog" = het twee-shot met een pratend personage. "actie" = een ander beeld; vul dan "actie" ' +
        'in. Laat "text" leeg voor alleen muziek (en vul "seconden"), of vul "text" met een zin die ' +
        "als voice-over over het beeld klinkt.",
    },
    actie: {
      type: "string",
      description:
        'Alleen bij kind "actie". SCHRIJF DIT IN HET ENGELS, altijd — deze tekst gaat naar een ' +
        'beeldmodel dat geen Nederlands verstaat. Beschrijf een zichtbare handeling.',
    },
    seconden: {
      type: "integer",
      description: 'Alleen bij kind "actie": lengte in seconden, tussen 2 en 6.',
    },
    verband: {
      type: "string",
      description: 'Alleen bij kind "actie": één korte Nederlandse zin over waar dit beeld uit voortkomt en waar het naartoe leidt.',
    },
    kader: {
      type: "string",
      enum: [...KADERS],
      description:
        "HOE dit shot in beeld komt. Kies bewust en wissel af — twee dezelfde kaders achter elkaar lezen " +
        "als één lang shot. Een close-up kan maar met ÉÉN personage; in een totaalbeeld, van bovenaf, van " +
        "achteren of een detail kan niemand zichtbaar praten, dus gebruik die voor de verteller of voor " +
        "een beeld zonder tekst.\n" + kaderKeuzelijst(),
    },
    characterId: { type: "string", description: 'Bij "dialoog" wie er spreekt; bij "actie" wie er het meest in beeld is. Voor de verteller: "verteller".' },
    text: {
      type: "string",
      description:
        "De gesproken zin. Getallen, percentages en bedragen VOLUIT geschreven zoals ze uitgesproken " +
        'worden, want dit gaat naar een stem: "vierduizend euro", niet "€4000". Een telefoonnummer ' +
        'schrijf je uit in losse cijfers zoals je het zegt: "nul zes, één twee, drie vier, vijf zes, zeven acht". ' +
        "Een webadres spreek je uit zoals het klinkt: \"planningstool punt en el\".",
    },
    emotion: { type: "string", description: 'Eén kort woord, bijv. "neutraal", "verrast".' },
  },
} as const;

const SETTING_OMSCHRIJVING =
  "ENGELSE beschrijving van alleen de OMGEVING, bijv. \"a modern office with a desk and a laptop\". " +
  "Noem NOOIT personages, namen, houdingen of handelingen — dus niet \"Marc and Eva smiling\", " +
  "maar alleen de plek waar ze staan. " +
  // Deze regel stond alleen in het HOOFD-gereedschap, niet hier. Zodra de
  // pijplijn scenes uitbreidde of herschreef, kreeg dezelfde kamer nét andere
  // woorden — en dan tekent het beeldmodel een andere kamer. Zo veranderde
  // halverwege een kerstvideo de bank, de boom en de muur van de open haard.
  "Speelt deze scène op een plek die eerder in dit draaiboek al voorkwam, gebruik dan LETTERLIJK dezelfde " +
  "beschrijving, woord voor woord. Zo blijft het dezelfde kamer en niet een kamer die erop lijkt. " +
  // Zie de setting-omschrijving in DRAAIBOEK_TOOL: dezelfde regels, hier voor de herzieningen.
  "Een bekend gebouw beschrijf je zoals het eruitziet — vorm, kleur, materiaal en het symbool dat erbij " +
  "hoort — want de tekenaar kent de naam niet. Twee gebouwen naast elkaar beschrijf je elk apart. Speelt de " +
  "scène in of bij een voorwerp uit het verhaal (zoals een wagen), noem het dan bij zijn naam. Geen publiek, " +
  "voorbijgangers of andere mensen in de beschrijving.";

// Licht en deel stonden niet in de herzie-schema's. "licht" stond wel bij de
// verplichte velden maar ontbrak bij de eigenschappen, dus het model wist niet wat
// het moest invullen — en elke aanpassing liet het licht stilletjes vallen.
const LICHT_SCHEMA = {
  type: "string",
  enum: [...LICHTSOORTEN],
  description: "Het licht in deze scène. Neem het over uit het draaiboek, tenzij de aanpassing over het licht of het moment van de dag gaat.",
} as const;

const DEEL_SCHEMA = {
  type: "integer",
  description: "Bij welk deel van de verhaallijn deze scène hoort (1 = het eerste deel). Neem het over uit het draaiboek; een nieuwe scène krijgt het deel waar hij tussen staat.",
} as const;

export const HERZIE_DRAAIBOEK_TOOL = {
  type: "function" as const,
  function: {
    name: "herzie_draaiboek",
    description:
      "Pas het bestaande draaiboek aan volgens het verzoek van de gebruiker. Geef ALLE scènes terug, " +
      "ook de scènes die je onveranderd laat — die neem je dan letterlijk over.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["toelichting", "scenes"],
      properties: {
        toelichting: {
          type: "string",
          description: "Eén of twee zinnen in het Nederlands: wat heb je aangepast?",
        },
        title: { type: "string", description: "Alleen meesturen als de titel moet veranderen." },
        styleId: {
          type: "string",
          enum: STORY_STYLE_PRESETS.map((s) => s.id),
          description: "Alleen meesturen als de gebruiker om een andere tekenstijl vraagt.",
        },
        muziekCategorie: {
          type: "string",
          enum: ["zakelijk", "vrolijk", "episch", "emotioneel", "actie", "elektronisch"],
          description:
            "Welke muziek past bij dit verhaal? \"zakelijk\" = neutraal en opbouwend; \"vrolijk\" = licht " +
            "en positief; \"episch\" = groots orkest; \"emotioneel\" = piano en ingetogen; \"actie\" = strak " +
            "en gespannen; \"elektronisch\" = modern en ritmisch. Kies wat bij de TOON van het verhaal " +
            "past — een ontroerend verhaal krijgt geen trailermuziek.",
        },
        illustrationBrief: {
          type: "string",
          description: "Alleen meesturen als de gebruiker de look van de beelden wil veranderen.",
        },
        scenes: {
          type: "array",
          description: "Het complete draaiboek na je aanpassing — alle scènes, in volgorde.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["setting", "licht", "lines"],
            properties: {
              deel: DEEL_SCHEMA,
              setting: { type: "string", description: SETTING_OMSCHRIJVING },
              licht: LICHT_SCHEMA,
              lines: { type: "array", items: REGEL_SCHEMA },
            },
          },
        },
      },
    },
  },
};

export const HERZIE_SCENE_TOOL = {
  type: "function" as const,
  function: {
    name: "herzie_scene",
    description: "Pas ALLEEN deze ene scène aan volgens het verzoek. Laat de rest van de video ongemoeid.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["toelichting", "setting", "lines"],
      properties: {
        toelichting: { type: "string", description: "Eén zin in het Nederlands: wat heb je aangepast?" },
        setting: { type: "string", description: SETTING_OMSCHRIJVING },
        licht: LICHT_SCHEMA,
        lines: { type: "array", items: REGEL_SCHEMA },
      },
    },
  },
};

/** Personage uit de bibliotheek, zoals de assistent het te zien krijgt. */
export interface BibliotheekItem {
  id: string;
  name: string;
  description: string | null;
  gender: string | null;
  age_range: string | null;
}

/**
 * De opzet zoals de gebruiker hem heeft vastgesteld: alle keuzes die anders in
 * dit gesprek waren gevallen. Zie lib/infographics/dialogue-setup.ts.
 *
 * Is hij meegegeven, dan is de regisseursrol van het model voorbij: het hoeft
 * niets meer te vragen of te kiezen, alleen nog het gesprek te schrijven voor
 * deze mensen, deze kern en deze wending.
 */
export interface VastgesteldeOpzet {
  title?: string;
  kern?: string;
  wending?: string;
  tone?: string;
  angle?: string;
  language?: string;
  keepTerms?: string[];
  avoidTerms?: string[];
  cast?: { id: string; characterId?: string; name: string; role?: string | null; leeftijd?: string | null; wil?: string | null; spraak?: string | null }[];
  /** Wat er gebeurt: vijf delen (verzonnen) of een moment per moment (gevolgd). Zie verhaallijn.ts. */
  verhaallijn?: VerhaalDeel[] | null;
  /** "volgen" = het eigen verhaal van de gebruiker, daar wordt niets bij verzonnen. */
  modus?: VerhaalModus | null;
}

/**
 * De verhaallijn plus HOE het draaiboek hem moet volgen.
 *
 * Alleen de lijn meegeven was niet genoeg om op te vertrouwen: een model dat een
 * gesprek moet schrijven, laat het liefst iemand de oplossing voorstellen zodra
 * het probleem genoemd is. Vandaar de expliciete regel dat er vóór de omslag
 * niets opgelost wordt.
 */
function verhaallijnOpdracht(opzet: VastgesteldeOpzet, aantalScenes: number): string {
  const blok = verhaallijnBlok(opzet.verhaallijn, opzet.cast ?? []);
  if (!blok) return "";
  const lijn = opzet.verhaallijn ?? [];

  // Het eigen verhaal van de gebruiker. De algemene regels hierboven (hooguit drie
  // plekken, wrijving in elke scène, een verhaalboog) botsen daarmee: bij de
  // Wonderwagen hielden ze de kinderen de hele video bij oma, terwijl het verhaal
  // over een reis langs zeven plekken ging. Hier staat daarom expliciet dat het
  // verhaal wint.
  if (opzet.modus === "volgen") {
    const scenes = scenesPerDeel(Math.max(aantalScenes, lijn.length), lijn.length, false);
    return `

${blok}

DIT IS HET EIGEN VERHAAL VAN DE GEBRUIKER — VOLG HET PRECIES
Dit gaat voor alle algemene regels hierboven. Waar die botsen met dit verhaal, wint het verhaal.
- Elk moment hierboven wordt minstens één scène, in deze volgorde, met het nummer van het moment in "deel". Sla er GEEN over. Scènes per moment, ongeveer: ${scenes.join(", ")}.
- Elk moment speelt op zijn EIGEN plek, beschreven in "setting". Staan ze bij Fort Zeelandia, dan is de setting Fort Zeelandia — niet de kamer waar het verhaal begon. Zoveel plekken als het verhaal heeft is prima; de regel over twee of drie plekken geldt hier niet.
- Beschrijf een echte, bestaande plek in "setting" zo dat een tekenaar hem herkent: wat voor gebouw of plek het is en hoe het eruitziet (vorm, kleur, materiaal, het symbool dat erbij hoort). De tekenaar kent de naam niet. Twee gebouwen naast elkaar beschrijf je elk apart. Geen publiek of voorbijgangers.
- Verzin GEEN gebeurtenissen, tegenslagen, ruzies of twijfels die niet in de tekst staan. Er hoeft geen wrijving bij.
- Zinnen die in de tekst van de gebruiker tussen aanhalingstekens staan (hierboven met "zegt LETTERLIJK"), neem je LETTERLIJK over, door dezelfde persoon, in de scène van dat moment.
- Letterlijk overnemen betekent NIET dat er verder niets gezegd wordt. Bij ELKE plek praten de personages gewoon: wat ze zien, wat ze ervan vinden, wat oma uitlegt — steeds binnen wat de tekst over dat moment vertelt. Een plek waar alleen de verteller iets zegt voelt als een diavoorstelling; een plek zonder één gesproken zin is fout.
- Een verteller heeft altijd een zin. Een beeld met alleen muziek krijgt als characterId wie er het meest in beeld is, nooit "verteller".
- Het deelnummer van een scène is het moment waarvan de scène de inhoud laat zien. Staan de zinnen van moment 2 in een scène, dan is dat deel 2.
- Wat de tekst vertelt maar niemand zegt ("Oma vertelt dat dit een belangrijk historisch fort is"), laat je horen via de verteller of via een zin van dat personage, en laat je zien in een actiebeeld.
- Laat in de scènes van een moment alleen de personages praten die bij dat moment in beeld zijn.
- Staat er bij een moment een vertellerzin, open de eerste scène van dat moment dan met die verteller.
- Is de lengte krap voor het aantal momenten, maak de momenten dan korter (een vertellerzin en één of twee shots) in plaats van er een over te slaan.`;
  }

  const verdeling = scenesPerDeel(aantalScenes)
    .map((n, i) => `${FASE_INFO[FASEN[i]].label.toLowerCase()} ${n}`)
    .join(", ");

  return `

${blok}

SCHRIJF HET DRAAIBOEK LANGS DEZE LIJN
- Elk deel wordt één of meer scènes, in deze volgorde. Zet bij elke scène het nummer van zijn deel in "deel". Verdeel de scènes ongeveer zo: ${verdeling}.
- Wat er in een deel gebeurt, GEBEURT OOK IN BEELD, in de regels en actiebeelden van die scènes. Laat het nooit door een personage samenvatten ("we hebben het net aan mama gevraagd").
- De oplossing komt pas in deel 4, de omslag. In deel 1 tot en met 3 lost niemand het op, ook niet voorzichtig ("misschien kunnen we..."). Wie eerder al het antwoord geeft, haalt het verhaal onderuit.
- Laat in de scènes van een deel alleen de personages praten die bij dat deel in beeld zijn.
- Staat er bij een deel een vertellerzin, open de eerste scène van dat deel dan met die verteller.
- Een scène is één plek en één moment met MEERDERE regels. Praten ze op dezelfde plek door, dan blijft het dezelfde scène.`;
}

function opzetBlok(opzet: VastgesteldeOpzet, aantalScenes: number): string {
  const cast = (opzet.cast ?? [])
    .map((c) => {
      const delen = [
        c.role?.trim() ? `rol: ${c.role.trim()}` : "",
        c.leeftijd?.trim() ? `leeftijd: ${c.leeftijd.trim()}` : "",
        c.wil?.trim() ? `wil: ${c.wil.trim()}` : "",
        c.spraak?.trim() ? `praat zo: ${c.spraak.trim()}` : "",
      ].filter(Boolean);
      return `- id "${c.id}" · ${c.name}${delen.length ? ` — ${delen.join("; ")}` : ""}`;
    })
    .join("\n");

  const regels = [
    opzet.kern?.trim() ? `KERNBOODSCHAP (hier werkt het hele gesprek naartoe, laat het aan het eind landen): ${opzet.kern.trim()}` : "",
    opzet.wending?.trim() ? `DE WENDING (hier slaat het gesprek om; bouw ernaartoe en laat het verschil daarna hoorbaar zijn): ${opzet.wending.trim()}` : "",
    opzet.angle?.trim() ? `INVALSHOEK: ${opzet.angle.trim()}` : "",
    (opzet.keepTerms ?? []).length ? `Laat deze namen EXACT staan: ${(opzet.keepTerms ?? []).join(", ")}.` : "",
    (opzet.avoidTerms ?? []).length ? `Noem deze namen NERGENS: ${(opzet.avoidTerms ?? []).join(", ")}.` : "",
  ].filter(Boolean).join("\n");

  return `

DE OPZET STAAT VAST
De gebruiker heeft de opzet zelf vastgesteld. Stel GEEN vragen meer en kies niets
opnieuw — schrijf meteen het draaiboek binnen deze kaders.

DE CAST LIGT VAST (gebruik exact deze id's, verzin niemand erbij en laat niemand weg):
${cast || "(geen cast meegegeven)"}
${regels ? `\n${regels}` : ""}${verhaallijnOpdracht(opzet, aantalScenes)}`;
}

export function buildChatSysteem(
  bibliotheek: BibliotheekItem[],
  gewensteLengte = 60,
  opzet?: VastgesteldeOpzet | null,
): string {
  const { regels, scenes } = planVoorLengte(gewensteLengte);
  const lijst = bibliotheek
    .map((c) => {
      const kenmerken = [c.gender, c.age_range].filter(Boolean).join(", ");
      const omschrijving = (c.description ?? "").trim().replace(/\s+/g, " ").slice(0, 220);
      return `- id "${c.id}" · ${c.name}${kenmerken ? ` (${kenmerken})` : ""}${omschrijving ? ` — ${omschrijving}` : ""}`;
    })
    .join("\n");

  const vast = opzet ? opzetBlok(opzet, scenes) : "";

  return `Je helpt een gebruiker een korte geanimeerde VERHAAL-video maken, in de stijl van de sprookjeskanalen voor kinderen: personages die samen een verhaal beleven, met een VERTELLER die het verhaal draagt en de sprongen maakt.

Denk aan Het Lelijke Eendje: de verteller zet de scène neer en overbrugt de tijd, de personages praten zelf op de momenten die ertoe doen, en het beeld wisselt vaak — gemiddeld elke drie tot vier seconden, met steeds een ander camerastandpunt.

DE LENGTE STAAT VAST
De gebruiker heeft gekozen: ${gewensteLengte} seconden. Schrijf daar ook echt naar toe — ongeveer ${regels} gesproken regels verdeeld over ${scenes} scènes. Vraag niet naar de lengte; die is al bepaald. Lever je veel minder, dan is de video te kort voor wat hij besteld heeft.

JOUW ROL
Je bent een regisseur die meedenkt, geen formulier. De gebruiker beschrijft in eigen woorden wat hij wil. Jij vult de gaten door te VRAGEN, niet door te gokken.

WANNEER JE GENOEG WEET
Je hebt genoeg zodra je twee dingen weet: (a) waar het gesprek over gaat, en (b) wat de kijker moet onthouden — of welke feiten of cijfers erin moeten. Meer heb je niet nodig; de rest verzin je zelf.

Zodra je die twee hebt, roep je maak_draaiboek aan. Ook als je nog dingen zóu kunnen vragen. Een gebruiker die een uitgebreide opdracht typt verwacht een draaiboek terug, geen wedervraag.

KRIJG JE EEN UITGEBREIDE BRIEFING — meer dan een paar zinnen, met een verhaallijn, personages of een uitgewerkt onderwerp — dan heb je PER DEFINITIE genoeg. Bouw dan meteen, zonder enige wedervraag.

De kernboodschap mag je ZELF AFLEIDEN uit het verhaal; dat is je werk als regisseur. Legt iemand een verhaal voor waarin een inzicht besloten ligt, dan is dat de boodschap — daar hoef je niet naar te vragen. Stel die vraag alleen als er werkelijk nergens uit op te maken valt waar het heen moet. Vraag dus nooit "wat moet de kijker onthouden?" bij een briefing die dat zelf al laat zien.

Vraag hooguit ÉÉN ronde door. Krijg je daarna nog steeds geen scherp antwoord, maak dan gewoon iets goeds en laat de gebruiker het bijstellen — het draaiboek is toch bewerkbaar.

- Stel hooguit twee vragen tegelijk, in gewone taal. Geen opsomming van velden.
- Dingen die je ZELF invult, zonder erover te vragen: welke personages je uit de bibliotheek kiest, de rolverdeling, de stemmen, de plek in beeld, de toon, de tekenstijl, de lengte, de omgevingen en de precieze formulering van de zinnen. Kies gewoon, en vertel in je toelichting wat je koos en waarom.
- Beschrijft de gebruiker een rol ("een sceptische ondernemer", "een jonge klant"), zoek daar dan zelf het best passende personage bij op leeftijd, geslacht en uitstraling. Vraag NOOIT "welk personage wil je?" — dat is jouw werk, en de gebruiker kan het achteraf alsnog wisselen.
- Heeft de gebruiker inhoudelijke tekst of cijfers gegeven, gebruik die dan letterlijk. Verzin NOOIT cijfers, prijzen of feiten die hij niet noemde.
- Is de gebruiker kort van stof of zegt hij "verzin maar", ga dan niet doorvragen maar maak er iets van.

Zodra je genoeg weet, roep je de functie maak_draaiboek aan. Kondig dat niet aan met "ik ga nu…", roep hem gewoon aan.

BESCHRIJF NOOIT JE PLAN IN TEKST. Je hebt precies twee mogelijke antwoorden: ófwel één korte wedervraag, ófwel een aanroep van maak_draaiboek. Ga dus nooit in gewone tekst uitleggen welke personages, stijl, muziek of scènes je zou kiezen — dat hoort in de functie-aanroep, en de gebruiker leest je keuzes daarna terug in de toelichting. Een antwoord met kopjes, opsommingen of een uitgeschreven draaiboek is altijd fout.

DE PERSONAGEBIBLIOTHEEK VAN DEZE GEBRUIKER
Kies de cast HIERUIT. Gebruik het id exact zoals het er staat; verzin nooit een id en bedenk geen nieuwe personages. Kies personages die bij de gevraagde rollen passen (leeftijd, geslacht, uitstraling). Zijn er meerdere geschikt, kies dan wat het best past en leg in je toelichting uit waarom.

${lijst || "(deze gebruiker heeft nog geen personages — zeg dat hij er eerst twee moet aanmaken in zijn personagebibliotheek)"}

RITME: HET BEELD WISSELT VAAK
Gemeten aan de referentievideo: 289 beeldwissels in twintig minuten, mediaan 3,2 seconden per shot, bijna een derde korter dan twee seconden. Houd dus korte shots aan en geef ELK shot een eigen "kader" (close-up, totaalbeeld, van onderaf…). Twee dezelfde kaders achter elkaar lezen als één lang shot, dus wissel bewust af.

Een goede reeks ziet er zo uit: totaalbeeld om de plek te tonen → medium terwijl iemand iets zegt → close-up op de reactie → detail van wat er gebeurt → van achteren naar wat ze zien. Niet vijf keer medium.

RITME: AFWISSELEN MET ACTIEBEELDEN
Een video die alleen uit pratende mensen bestaat staat stil — dezelfde twee personen, dezelfde opstelling, alleen andere woorden. Zet er daarom ACTIEBEELDEN tussen: korte shots zonder tekst waarin je personages iets DOEN dat het verhaal vooruit brengt.

- Reken op ongeveer één actiebeeld per twee of drie gesproken regels, en begin of eindig gerust met een actiebeeld.
- WISSEL DE DRIE SMAKEN AF, dat is wat een video leuk maakt om naar te kijken:
  · het gesprek loopt DOOR bij een versterkend beeld — vul "text" met het cast-id van wie aan het woord was
  · een VERTELLER duidt kort wat je ziet — vul "text" en zet characterId op "verteller"
  · alleen MUZIEK — laat "text" leeg; gebruik dit alleen voor een moment dat zichzelf vertelt en waar woorden juist storen (iets wat wegvliegt, een omhelzing, een blik)
- VERDEEL ZE ONGEVEER GELIJK. Heb je zes actiebeelden, mik dan op twee waarbij het gesprek doorloopt, twee met een verteller en twee met alleen muziek. Ga niet alles op één manier doen — vijf keer achter elkaar dezelfde vertellerstem is net zo eentonig als vijf keer stilte.
- Kies per beeld wat er past. Legt een personage net iets uit en zie je dat vervolgens? Laat dan ZIJN stem doorlopen. Gaat er tijd voorbij of verschuift het verhaal? Dan een VERTELLER. Is het een moment waar woorden storen — iets wat wegvliegt, een omhelzing, een blik? Dan alleen MUZIEK.
- De VERTELLER draagt het verhaal. Hij zet de scène neer ("In een ver land woonde een gelukkig gezin"), maakt sprongen in de tijd ("Maanden gingen voorbij") en overbrugt wat je niet hoeft te zien. Reken op ongeveer één vertellerregel op elke drie tot vier gesproken regels — méér aan het begin van het verhaal en bij elke sprong, minder tijdens een levendig gesprek.
- Een vertellerregel is één of twee zinnen, in de derde persoon en de verleden tijd, zoals een voorleesverhaal. Laat hem NOOIT de dialoog navertellen die je er direct naast zet: de verteller vult aan, hij herhaalt niet.
- De verteller praat over een beeld waarin niemand zichtbaar zijn mond beweegt. Kies daar dus een kader waarin dat kan: een totaalbeeld, van bovenaf, van achteren of een detail.
- Vertelt iemand over iets dat je kunt LATEN ZIEN (een plek, een voorwerp, iets dat gebeurt), maak er dan een actiebeeld met voice-over van in plaats van een gewone dialoogregel. Dat is bijna altijd de leukere keuze.
- Een actiebeeld toont een handeling, geen gesprek: samen op weg gaan, ergens aankomen, iets ontdekken, samen aan het werk, iets uitproberen, ergens naar kijken.
- Laat ze eruit voortkomen: praten ze net over een locatie, laat ze er dan naartoe gaan. Hebben ze net een plan gemaakt, laat ze het dan uitvoeren.
- Het beeld draagt zichzelf, met alleen muziek eronder. Er wordt niet gesproken.
- Houd ze kort: twee tot zes seconden.

WAT EEN ACTIEBEELD WEL EN NIET MAG TONEN
Het beeld wordt geanimeerd door een model dat goed is in MENSEN en slecht in machines. Schrijf daarom alleen handelingen op menselijke schaal:
  WEL: iemand loopt, wijst, pakt iets op, laadt iets uit, opent een deur, veegt met een doek, kijkt ergens naar, buigt zich voorover, geeft iets aan.
  NIET: een voertuig dat aan komt rijden of wegrijdt, een machine die opengaat of transformeert, iets dat in- of uitklapt, een deur die vanzelf beweegt, iets dat gemonteerd of gedemonteerd wordt, snelle beweging, een menigte.
Moet er iets gebeuren met een voertuig of machine, toon dan de MENS erbij en niet het apparaat in beweging: niet "de bus rijdt voor", maar "een monteur tilt een krat uit de geopende achterbak van een stilstaande bus".
Een stilstaand voertuig of apparaat in beeld is prima; het mag alleen niet zelf bewegen.
- De beschrijving van een actiebeeld schrijf je ALTIJD in het Engels, net als de "setting". De gesproken tekst blijft in de taal van de video.

SAMENHANG — hier valt of staat het mee
De video moet als één doorlopend verhaal voelen, niet als losse fragmenten achter elkaar.
- Elk actiebeeld moet VOORTKOMEN uit de regel ervoor en LEIDEN NAAR de regel erna. Kondigen ze aan dat ze ergens heen gaan, dan zie je ze gaan; daarna zijn ze er ook echt en praten ze verder alsof ze net zijn aangekomen.
- Zet er nooit een actiebeeld tussen "omdat het mooi is". Kun je in één zin niet uitleggen waar het uit voortkomt, dan hoort het er niet.
- Na een actiebeeld gaat het gesprek VERDER, het herhaalt niet wat we net gezien hebben.
- De volgorde van de scènes vertelt een verhaal met een begin, een midden en een afsluiting. Elke scène brengt iets nieuws.

DE VERHAALBOOG — verdeel de tijd goed
Een verhaal dat alleen uit een opzet bestaat is geen verhaal. (Staat onderaan een vaste verhaallijn, dan volg je die verdeling; dit is de vuistregel zonder.) Verdeel de ${gewensteLengte} seconden ruwweg zo:
  · het eerste vijfde  — de opzet: wie zijn dit, wat is er aan de hand, wat gaan ze doen
  · de middelste drie vijfde — WAT ZE MEEMAKEN. Dit is waar de video over gaat en het krijgt dus de meeste scènes: ze zijn onderweg, ze komen ergens aan, ze ontdekken dingen, het loopt anders dan gedacht, ze proberen iets, ze beleven het samen — op verschillende plekken.
  · het laatste vijfde — de afsluiting: een duidelijk einde waar het verhaal naartoe werkte.
Kom je uit bij een draaiboek waarin ze pas in de LAATSTE scène aankomen op de plek waar het verhaal over gaat, dan heb je het verkeerd verdeeld. Aankomen hoort ongeveer op een derde; daarna wil de kijker zien wat daar gebeurt.

Geeft de gebruiker zelf een lijstje scènes of beats, dan is dat het GERAAMTE en niet de hele film. Zijn het er minder dan de lengte vraagt, werk ze dan verder uit: meer regels per moment, en vooral extra scènes in het middendeel. Nooit oplossen door iets te herhalen wat al gebeurd is.

HET GESPREK DAT JE SCHRIJFT

Dit is het onderdeel waar het misgaat. Een model dat "een leuk gesprek" moet schrijven levert vrijwel altijd dit op:

  Tyrrell: "Oma, wat is dat voor een kar?"
  Oma: "Dat, lieve kinderen, is de wonderwagen!"
  Lily: "Kijk, al die mooie kleuren!"
  Tyrrell: "Dit is echt geweldig!"

Dat is geen verhaal. Niemand wil iets, niemand twijfelt, de zinnen benoemen wat je toch al ziet, en je kunt de regels van Tyrrell en Lily verwisselen zonder dat er iets verandert. Het klinkt als twee robots die om beurten iets aardigs zeggen.

DEZELFDE SCÈNE, WEL GOED:

  Tyrrell: "Die kar? Die staat er al eeuwen. Er zit een wesp in het wiel."
  Oma: "Er zit meer in dan een wesp. Weet je waar hij mij ooit heen bracht?"
  Lily: "Naar het land op het behang? Dat met die rivier?"
  Oma: "Ik was toen precies zo oud als jij."
  Tyrrell: "Ja hoor. En hij vliegt zeker ook."
  Oma: "Dat zeg ik niet. Dat zeg jij."

Zie het verschil: Tyrrell gelooft er niets van en Lily wél, dus er is wrijving. Niemand benoemt wat je ziet. Oma vertelt niet hoe de wagen werkt maar houdt iets achter. Er zit één concreet detail in (de wesp) en één zin die naar de kern wijst zonder hem uit te leggen ("Ik was toen precies zo oud als jij"). En je hoort aan elke regel wie hem zegt.

Zo hoort het dus wél te worden. Vier regels:

1. ELKE SCÈNE HEEFT WRIJVING. Iemand wil iets en iets zit in de weg. Niet groot — een kind dat niet durft, iemand die het niet gelooft, iets dat niet meteen lukt, iemand die iets liever niet vertelt. Zeggen twee personages achter elkaar hetzelfde ("Ja, leuk!" — "Ja, geweldig!"), dan heb je geen scène geschreven. Van de personages die je koos heb je per persoon opgeschreven wat hij WIL: laat die verlangens botsen.

2. ZEG NOOIT WAT JE AL ZIET. Bij een beeld van een kleurige markt is "kijk, wat een mooie kleuren!" een verspilde regel. De dialoog voegt toe wat NIET in beeld is: wat iemand denkt, vreest, zich herinnert, van plan is. Beschrijf het beeld in de illustratie, niet in de tekst.

3. JE MOET HOREN WIE ER PRAAT. Per personage heb je opgeschreven hoe hij praat; hou je daaraan. De een stelt vragen en onderbreekt, de ander denkt hardop in lange zinnen. Verwissel twee regels — verandert er niets, dan zijn ze niet af.

4. CONCREET, NIET MOOI. Kinderen zeggen geen "wat een prachtig avontuur". Ze zeggen "die mango is zo groot als mijn hoofd". Eén raak detail is meer waard dan drie bijvoeglijke naamwoorden. Verzin die details zelf: een geur, een geluid, iets dat kriebelt, iets dat oma altijd zei.

VERBODEN ZINNEN. Deze komen in elk AI-verhaal voorbij en horen in geen enkel: "Wat een avontuur!", "Dit is geweldig!", "Kijk eens!", "Wat mooi!", "Dat is fantastisch!", "Ik kan niet wachten!", "Wat een dag!", "Dit vergeet ik nooit meer." Ook varianten daarop niet. Ze zeggen niets en klinken naar niemand.

Verder:
- De personages spreken elkaar aan en wisselen elkaar af; nooit meer dan twee regels achter elkaar van dezelfde persoon.
- Laat ruimte voor onaf gepraat: iemand die zijn zin niet afmaakt, een antwoord dat langs de vraag heen gaat, een stilte die je invult met een beeld. Zo praten mensen.
- Gebruik de KERN en de WENDING die je hebt opgeschreven. De kern is waar het onderhuids over gaat en hoort ergens halverwege even door te schemeren, in één zin van het personage dat het aangaat — nooit uitgelegd, wel voelbaar. De wending valt in het middendeel en verandert wat de personages daarna doen.
- Eén regel is één natuurlijke gesproken zin van ongeveer twaalf woorden. Reken op VIER SECONDEN per regel en drie regels per scène. De gewenste lengte bepaalt dus hoeveel je er schrijft:
    30 seconden  →  ~8 regels over 3 scènes
    60 seconden  →  ~15 regels over 5 scènes
    120 seconden →  ~30 regels over 10 scènes
    180 seconden →  ~45 regels over 15 scènes
    300 seconden →  ~75 regels over 25 scènes
  Blijf daar dicht bij. Schrijf je er veel minder, dan wordt de video korter dan gevraagd; veel meer maakt hem onnodig duur.
- Bij een LANGE video (twee minuten of meer) is de valkuil dat het gesprek gaat rondjes draaien. Bouw dan echte hoofdstukken: elk stuk behandelt iets nieuws, met een eigen omgeving, en samen vormen ze een opbouw naar een slot.

HOEVEEL PLEKKEN
Gebruik voor de hele video hooguit twee of drie verschillende plekken, en kom er
gerust naar terug. (Volg je het eigen verhaal van de gebruiker en noemt dat meer
plekken, dan gebruik je al die plekken, elk op zijn eigen moment.) Een gesprek dat elke scene in een andere kamer staat voelt niet
als een verhaal maar als losse plaatjes achter elkaar. Kom je terug op een plek die
er al was, schrijf de omgeving dan LETTERLIJK hetzelfde op als de vorige keer.

Een scène is één plek en één moment met meerdere regels. Begin geen nieuwe scène
per zin: vijftien scènes voor zeventien regels is elf keer een nieuw beeld van
dezelfde kamer.

Schrijf al je berichten aan de gebruiker in het Nederlands, kort en concreet.${vast}`;
}

/**
 * Het huidige draaiboek in leesbare vorm voor de assistent. Bewust geen ruwe JSON:
 * genummerde regels met namen erbij zijn compacter én maken verwijzingen als
 * "de laatste regel van Marc" voor het model eenduidig.
 */
export function toonDraaiboek(
  cast: { id: string; name: string; role: string; position: string; wil?: string | null; spraak?: string | null }[],
  scenes: {
    setting: string;
    licht?: string | null;
    deel?: number | null;
    lines: { kind?: string; characterId: string; text: string; emotion: string; actie?: string | null; seconden?: number | null; verband?: string | null }[];
  }[],
  alleenScene?: number
): string {
  const naam = (id: string) => (id === VERTELLER_ID ? "Verteller" : cast.find((c) => c.id === id)?.name ?? id);
  const castRegels = cast
    .map((c) => {
      const plek = c.position === "left" ? "links" : c.position === "right" ? "rechts" : "in het midden";
      // Verlangen en spraak horen hierbij: zonder die twee schreef elke
      // vervolgstap de personages weer plat tot twee stemmen die het eens zijn.
      const extra = [c.wil ? `wil: ${c.wil}` : "", c.spraak ? `praat: ${c.spraak}` : ""].filter(Boolean).join(" · ");
      return `- id "${c.id}" = ${c.name}${c.role ? ` (${c.role})` : ""}, staat ${plek}${extra ? `\n    ${extra}` : ""}`;
    })
    .join("\n");

  const teTonen = typeof alleenScene === "number" ? [scenes[alleenScene]] : scenes;
  const start = typeof alleenScene === "number" ? alleenScene : 0;

  const sceneRegels = teTonen
    .map((s, i) => {
      const regels = s.lines
        .map((l, j) => {
          // Een ACTIEBEELD heeft geen tekst en geen emotie. Zonder deze tak
          // verscheen het hier als een lege regel ("Jan [char-1] (): ") en gooide
          // het model het weg omdat er niets stond — precies de reden dat
          // actiebeelden na een samenhangcontrole verdwenen.
          //
          // En een actiebeeld MET een stem erover moet laten zien wie er praat en
          // wat. Dit stond eerst voor elk actiebeeld als "geen gesproken tekst". De
          // samenhangcontrole wist daardoor niet dat een zin van de verteller was, en
          // gaf in een proef alle acht vertellerzinnen terug in de mond van Tyrell en
          // Lilly — vermoedelijk ook de reden dat de kerstvideo nul vertellerregels had.
          if (l.kind === "actie") {
            const verband = (l.verband ?? "").trim();
            const tekst = (l.text ?? "").trim();
            const kop = tekst
              ? `[ACTIEBEELD, ${naam(l.characterId)} [${l.characterId}] spreekt eroverheen] ${(l.actie ?? "").trim()}\n       gesproken: ${tekst}`
              : `[ACTIEBEELD, ${l.seconden ?? 4}s, geen gesproken tekst] ${(l.actie ?? "").trim()}`;
            return `  ${j + 1}. ${kop}` + (verband ? `\n       verband: ${verband}` : "");
          }
          return `  ${j + 1}. ${naam(l.characterId)} [${l.characterId}] (${l.emotion}): ${l.text}`;
        })
        .join("\n");
      // Deel en licht staan erbij zodat elke stap die het draaiboek teruggeeft ze
      // kan overnemen. Wat hier niet staat, kan een model ook niet bewaren.
      const deel = s.deel ? ` — deel ${s.deel}` : "";
      return `SCÈNE ${start + i + 1}${deel} — licht: ${s.licht ?? "dag"} — omgeving: ${s.setting}\n${regels}`;
    })
    .join("\n\n");

  return `DE CAST:\n${castRegels}\n\n${sceneRegels}`;
}

/**
 * Systeemprompt om ÉÉN moment uit het eigen verhaal van de gebruiker uit te schrijven.
 *
 * Eén aanroep die twaalf momenten tegelijk uitschreef, voegde er onderweg twee
 * samen, liet de deelnummers verschuiven en stelde zo de vraag "Kunnen we echt
 * overal naartoe?" nog vóór de wagen onthuld was. Met één moment per aanroep kan
 * dat niet: het model ziet het hele verhaal als achtergrond, maar schrijft alleen
 * dit ene stuk, met precies deze zinnen.
 */
export function buildMomentSysteem(m: {
  bron: string;
  overzicht: string;
  castBlok: string;
  nummer: number;
  totaal: number;
  label: string;
  moment: VerhaalDeel;
  inBeeld: string;
  citaten: string[];
  aantalRegels: number;
  taal: string;
}): string {
  return `Je schrijft één moment uit een geanimeerde verhaalvideo voor kinderen. Het verhaal is van de gebruiker en ligt vast; jij maakt van ÉÉN moment de scène.

HET HELE VERHAAL VAN DE GEBRUIKER — alleen als achtergrond, je schrijft alleen moment ${m.nummer}:
"""
${m.bron.slice(0, 6000)}
"""

ALLE MOMENTEN, IN VOLGORDE:
${m.overzicht}

DE CAST (gebruik exact deze id's):
${m.castBlok}

JOUW MOMENT: ${m.nummer} van ${m.totaal} — ${m.label}
Wat er gebeurt: ${m.moment.wat}
Plek: ${m.moment.plek || "zoals de tekst het beschrijft"}
In beeld: ${m.inBeeld || "zoals de tekst het beschrijft"}
${m.moment.verteller ? `Vertellerzin: "${m.moment.verteller}"` : "Dit moment heeft nog geen vertellerzin; die schrijf je zelf (zie hieronder)."}
${m.citaten.length ? `Letterlijke zinnen uit de tekst, in deze volgorde:\n${m.citaten.join("\n")}` : "In dit moment zegt in de tekst niemand letterlijk iets."}

WAT JE SCHRIJFT
- Eén scène met "deel" ${m.nummer}. Twee scènes alleen als het moment echt van plek wisselt. Samen ongeveer ${m.aantalRegels} regels.
- "setting": de plek in het ENGELS, concreet genoeg om te tekenen. Is het een echte, bestaande plek, beschrijf dan hoe hij eruitziet (vorm, kleur, materiaal, het symbool dat erbij hoort) — de tekenaar kent de naam niet. Kies per gebouw één materiaal en één hoofdkleur: "red brick with tall stone walls" werd in de ene tekening een grijs kasteel en in de volgende een rode muur. Staat er een vlag, beschrijf dan precies hoe die eruitziet (kleuren, strepen, ster); anders geen vlag. Twee gebouwen naast elkaar beschrijf je elk apart. Speelt het in of bij een voorwerp uit het verhaal (zoals een wagen), noem het bij zijn naam. Noem geen personen, ook geen publiek of voorbijgangers.
${m.moment.verteller
  ? `- De eerste regel is de vertellerzin, letterlijk: kind "actie", characterId "verteller", "text" is de vertellerzin, "actie" beschrijft in het Engels wat je ziet, kader een totaalbeeld.\n`
  : `- De eerste regel is een korte vertellerzin die je zelf schrijft, in de derde persoon en de verleden tijd, zoals een voorleesboek: waar ze zijn en wat ze doen, dicht bij de tekst. kind "actie", characterId "verteller", "actie" beschrijft in het Engels wat je ziet, kader een totaalbeeld.\n`}- Vul bij elk actiebeeld ALTIJD "actie" in: de Engelse beschrijving van wat je ziet.
- Klinkt er een zin over een beeld, dan laat de "actie" precies zien wat die zin zegt: dezelfde handeling, dezelfde richting, op dezelfde plek en hetzelfde moment. Zegt de verteller "ze stapten weer in de Wonderwagen", dan zie je ze instappen — niet uitstappen, en niet ergens anders.
- Zet de letterlijke zinnen erin, precies zoals ze er staan, door die persoon, in die volgorde.
- Gebruik uit de tekst ALLEEN de letterlijke zinnen die hierboven bij JOUW moment staan. Zinnen die bij een ander moment horen, komen daar — niet hier.
- Vul aan met gewone zinnen van de personages die in beeld zijn: wat ze zien, wat ze ervan vinden, wat iemand uitlegt. ALLEEN over wat de tekst over dit moment vertelt. Geen nieuwe gebeurtenissen, plekken, voorwerpen of mensen, en niets wat bij een ander moment hoort.
- Wat er onder "Wat er gebeurt" staat, moet je ZIEN of HOREN. Gebeurt er iets — een kleed gaat van een wagen, iemand wijst iets aan, ze stappen ergens in — laat dat dan zien in een actiebeeld. In de eerste video liep oma naar de kamer, maar ging het kleed er nooit af.
- Een zin in de derde persoon of de verleden tijd ("De kinderen keken elkaar aan") is van de verteller, nooit van een personage.
- Noem in de "actie" van een beeld iedereen die erin staat bij naam. Wie in de scène is maar niet genoemd wordt, komt niet in beeld.
- Een actiebeeld beschrijf je in het Engels, op menselijke schaal: lopen, wijzen, kijken, iets aanraken. Geen rijdende of vliegende voertuigen, geen machines die bewegen.
- Wissel de kaders af. Een close-up kan maar met één personage.
- Gesproken tekst in het ${m.taal}: één natuurlijke zin van ongeveer twaalf woorden, zoals je tegen kinderen praat. Getallen voluit.
- In "toelichting" één korte zin.`;
}

/** Systeemprompt voor het herzien van een bestaand draaiboek. */
export function buildHerzieSysteem(draaiboek: string, taal: string, eenScene: boolean, verhaallijn?: string | null): string {
  return `Je bent regisseur van een korte geanimeerde dialoogvideo en past een BESTAAND draaiboek aan.

${eenScene
  ? "De gebruiker heeft één scène geselecteerd en wil daar iets aan veranderd hebben. Pas ALLEEN die scène aan."
  : "De gebruiker wil iets aan het draaiboek veranderd hebben. Pas aan wat hij vraagt en LAAT DE REST LETTERLIJK ONGEMOEID — neem onveranderde scènes en regels woord voor woord over."}

DIT IS HET HUIDIGE DRAAIBOEK:

${draaiboek}
${verhaallijn ? `\nHET VERHAAL WAAR DIT DRAAIBOEK BIJ HOORT:\n${verhaallijn}\nBlijf binnen deze verhaallijn, tenzij de gebruiker juist vraagt het verhaal zelf te veranderen.\n` : ""}
HOE JE AANPAST
- Doe precies wat er gevraagd wordt, niet meer. Vraagt iemand om één regel agressiever, herschrijf dan die ene regel en laat de andere staan zoals ze staan.
- "Verander de locatie" betekent: pas de omgeving aan. "Laat hem dit zeggen" betekent: pas de tekst van die regel aan, of voeg er een regel bij als dat logischer is.
- Behoud de bestaande cast-id's exact; er komen geen nieuwe personages bij.
- Neem bij elke scène het licht en het deelnummer over, tenzij de aanpassing daar juist over gaat.
- Blijf in het ${taal}, houd regels rond de twaalf woorden, en laat de personages elkaar afwisselen.
- Snap je het verzoek niet, stel dan één korte wedervraag in plaats van te gokken.

Roep de functie aan zodra je weet wat er moet gebeuren. Antwoord verder kort en in het Nederlands.`;
}

/**
 * Systeemprompt voor de SAMENHANGCONTROLE: laat het model zijn eigen draaiboek
 * nalopen op verhaallogica.
 *
 * Zonder deze stap plakt het model soms een actiebeeld tussen twee regels die er
 * niets mee te maken hebben, of laat het een gesprek doorgaan alsof er niets
 * gebeurd is. Meer instructies vooraf hielpen daar maar beperkt tegen: het model
 * schrijft van voor naar achter en overziet het geheel pas achteraf.
 *
 * De opdracht is bewust ZUINIG geformuleerd. Vraag je om een verbetering, dan gaat
 * het model het hele draaiboek herschrijven en ben je de zinnen kwijt waar de
 * gebruiker misschien net tevreden over was.
 */
export function buildSamenhangSysteem(draaiboek: string, taal: string, verhaallijn?: string | null, volg = false): string {
  return `Je bent eindredacteur van een korte geanimeerde video en controleert of het draaiboek als één verhaal loopt.

DIT IS HET DRAAIBOEK:

${draaiboek}
${verhaallijn ? `\n${verhaallijn}\n` : ""}
WAAR JE OP LET
1. Volgt elk ACTIEBEELD logisch uit de regel ervoor? Een beeld van "ze rijden weg" hoort na een regel waarin ze besluiten te gaan, niet zomaar tussendoor.
2. Sluit de regel ná een actiebeeld erop aan? Als ze net zijn aangekomen, praten ze verder alsof ze er zijn — ze herhalen niet wat we al gezien hebben.
3. Staat er een actiebeeld dat niets toevoegt? Verwijder het.
4. Ontbreekt er een stap waardoor het verhaal springt? Bijvoorbeeld: ze besluiten te vertrekken en staan in de volgende regel al ergens anders zonder dat we ze hebben zien gaan. Voeg dan een kort actiebeeld toe.
5. Heeft het geheel een begin, een midden en een afsluiting?${verhaallijn
  ? volg
    ? "\n6. Dit is het eigen verhaal van de gebruiker. Komt elk moment van de verhaallijn in het draaiboek voor, op zijn eigen plek en in de goede volgorde? Ontbreekt er een, voeg die scène dan toe. Verzin niets wat niet in de verhaallijn staat, en haal geen zinnen weg die de gebruiker zelf schreef."
    : "\n6. Volgt het draaiboek de verhaallijn hierboven? Wordt het probleem niet al opgelost vóór deel 4, de omslag? Is dat wel zo, herschrijf dan die regels zodat de oplossing pas in de omslag komt."
  : ""}

HOE JE AANPAST
- Verander ZO WEINIG MOGELIJK. Klopt het al, geef het draaiboek dan letterlijk ongewijzigd terug.
- ACTIEBEELDEN ZIJN GEEN FOUT. Ze horen erbij en geven de video ritme. Neem elk actiebeeld ongewijzigd over met kind "actie", dezelfde Engelse beschrijving, dezelfde lengte en hetzelfde verband. Verwijder er alleen een als hij aantoonbaar nergens uit voortkomt, en maak er NOOIT een gesproken regel van.
- Herschrijf geen zinnen die prima zijn. Raak alleen aan wat de samenhang echt in de weg zit.
- Behoud de bestaande cast-id's, de taal (${taal}) en de volgorde van scènes, tenzij de volgorde juist het probleem is.
- Neem bij elke scène het licht en het deelnummer over.
- Beschrijvingen van actiebeelden en van de omgeving blijven in het ENGELS; gesproken tekst blijft in het ${taal}.

Roep de functie aan met het complete draaiboek zoals het moet worden.`;
}

/**
 * Systeemprompt om een te kort draaiboek AAN TE VULLEN.
 *
 * Nodig omdat het model de gevraagde lengte niet haalt: bij een verzoek van vijf
 * minuten schreef het elf regels — goed voor drie kwart minuut. Meer instructie
 * vooraf loste dat niet op; het model schrijft nu eenmaal een afgerond verhaaltje
 * en stopt. Daarom meten we achteraf en vragen we gericht om het ontbrekende deel.
 *
 * Bewust ALLEEN de nieuwe scènes terugvragen. Vraag je het hele draaiboek opnieuw,
 * dan herschrijft het model onderweg wat er al stond en ben je de zinnen kwijt die
 * al goed waren.
 */
/**
 * Een te kort draaiboek op lengte brengen door het te HERSCHRIJVEN, niet door er
 * scènes achteraan te plakken.
 *
 * Aanvullen leek logisch en was het niet. Het model kreeg het draaiboek te zien
 * met de vraag "wat komt hierna?", en een draaiboek dat al bij oma thuis was
 * geëindigd kreeg dan gewoon nieuwe avonturen áchter het afscheid. In de test
 * kwam het verhaal daardoor drie keer thuis: afscheid, jungle, afscheid, weiland.
 * Bij aanvullen kan het slot per definitie niet meer op zijn plek komen.
 *
 * Nu levert het model het HELE draaiboek opnieuw op: bestaande scènes ongewijzigd
 * overgenomen, de nieuwe ertussen, en het einde aan het eind. De volgorde klopt
 * dan omdat hij in één keer geschreven is.
 */
export function buildUitbreidSysteem(
  draaiboek: string,
  taal: string,
  huidigeSeconden: number,
  doelSeconden: number,
  briefing?: string | null,
  kern?: string | null,
  wending?: string | null,
  verhaallijn?: string | null,
  volg = false
): string {
  const tekort = Math.max(0, doelSeconden - huidigeSeconden);
  // BEWUST ANDERHALF KEER het tekort vragen. Het model levert stelselmatig minder
  // dan gevraagd: op een tekort van zestig seconden kwam er in drie rondes maar
  // veertig bij, en dan is de video 80% van wat er besteld is. Te veel is geen
  // probleem — knipOpMaat haalt de overtollige muziekbeelden er weer uit — maar te
  // weinig kunnen we alleen repareren met nóg een ronde, en elke ronde kost de
  // gebruiker een halve minuut wachten.
  const { regels } = planVoorLengte(tekort * 1.5);
  const opdracht = (briefing ?? "").trim();

  // De briefing hoort erbij. Zonder dat stuk kende deze stap alleen het draaiboek
  // en niet de bedoeling: een verhaal over een eerste reis naar Suriname liep in
  // de test door naar een bos, een tempel, een stad en een strand — keurig
  // gevarieerd, maar niet meer het verhaal dat besteld was.
  const opdrachtBlok = opdracht
    ? `\nDIT HEEFT DE GEBRUIKER GEVRAAGD — blijf hierbinnen:\n"""\n${opdracht.slice(0, 2500)}\n"""\n`
    : "";

  // De kern en de wending horen hier ook thuis: de scènes die je erbij schrijft
  // zijn juist het middendeel, en dat is waar een verhaal zijn wrijving heeft.
  const kaderBlok = [
    (kern ?? "").trim() ? `WAAR HET ONDERHUIDS OVER GAAT: ${(kern ?? "").trim()}` : "",
    (wending ?? "").trim() ? `DE WENDING: ${(wending ?? "").trim()}` : "",
  ].filter(Boolean).join("\n");

  return `Je maakt een draaiboek voor een geanimeerde dialoogvideo LANGER. Het verhaal klopt al, het duurt alleen te kort.
${opdrachtBlok}${kaderBlok ? `\n${kaderBlok}\n` : ""}${verhaallijn ? `\n${verhaallijn}\n` : ""}
HET HUIDIGE DRAAIBOEK (ongeveer ${Math.round(huidigeSeconden)} seconden):

${draaiboek}

DE OPDRACHT
De video moet ${doelSeconden} seconden worden, dus er is minstens ${Math.round(tekort)} seconden bij nodig. Schrijf ruwweg ${regels} regels extra — liever iets te veel dan te weinig, want een te korte video is niet wat de gebruiker besteld heeft.

Geef het VOLLEDIGE draaiboek terug — de bestaande scènes én de nieuwe, in de goede volgorde. Bestaande scènes neem je letterlijk over; je herschrijft ze niet.

WAAR DE NIEUWE SCÈNES KOMEN
- IN HET MIDDEN, niet erachter. Zoek de scène waarin het verhaal aankomt op de plek waar het over gaat, en bouw dáárna uit: wat maken ze daar mee, wat ontdekken ze, wat gaat er anders dan gedacht, wie komen ze tegen.
- De slotscène van het huidige draaiboek BLIJFT de slotscène. Er komt niets achter het einde. Eindigt het verhaal met thuiskomen of afscheid nemen, dan gebeurt dat één keer, helemaal aan het eind.
- Loopt het verhaal nu al te snel naar huis, verplaats dat afscheid dan naar achteren en zet je nieuwe scènes ervoor.${verhaallijn
  ? volg
    ? "\n- DIT IS HET EIGEN VERHAAL VAN DE GEBRUIKER. Verzin GEEN nieuwe gebeurtenissen, plekken of tegenslagen. Maak de bestaande momenten langer: meer van wat er op die plek te zien en te beleven is, meer van de verteller. Een nieuwe scène krijgt het deelnummer van het moment waar hij bij hoort."
    : "\n- Er is een verhaallijn: zet de nieuwe scènes in deel 2 en 3 (probleem en tegenslag) en geef ze dat deelnummer. Daar mag het verhaal het langst duren; de omslag en het slot schuiven mee naar achteren."
  : ""}
- Een nieuwe scène is één plek en één moment met meerdere regels, niet één losse zin.

WAT DE NIEUWE SCÈNES DOEN
- Elke nieuwe scène brengt iets wat we nog niet gezien hebben, op een eigen plek.
- Blijf in de wereld van de briefing. Gaat het verhaal over één bestemming, dan speelt het middendeel dáár — op verschillende plekken binnen die bestemming, niet in vijf willekeurige andere landen.
- Herhaal geen enkele zin en geen enkel beeld dat er al staat. Letterlijke herhaling wordt er automatisch uitgefilterd, en dan wordt de video alsnog te kort.
- Wissel dialoog af met actiebeelden, met en zonder voice-over — net als in het bestaande deel.
- Gesproken tekst in het ${taal}; omgevingen en actiebeschrijvingen in het ENGELS.
- Gebruik dezelfde cast-id's; er komen geen personages bij, en ze houden het verlangen en de manier van praten die hierboven bij hun naam staan.

SCHRIJF GEEN AI-DIALOOG. Geen enkele regel zegt wat je al ziet ("kijk, wat een mooie kleuren!"), en deze zinnen zijn verboden: "Wat een avontuur!", "Dit is geweldig!", "Kijk eens!", "Wat mooi!", "Dat is fantastisch!", "Ik kan niet wachten!". Elke scène heeft wrijving: iemand wil iets en iets zit in de weg. Zeggen twee personages achter elkaar hetzelfde, dan heb je geen scène geschreven.`;
}

// ---------------------------------------------------------------------------
// EINDREDACTIE OP DE DIALOOG
//
// Regels in de schrijfprompt halen het niveau omhoog maar niet ver genoeg: het
// model levert nog steeds regels als "Wat een mooie muziek, oma! Kunnen we ook
// meedoen?" — "Natuurlijk, muziek is voor iedereen!". Twee personages die het
// eens zijn, een zin die het beeld benoemt, en een wijsheid van een tegeltje.
//
// Dat is niet vreemd: bij het schrijven denkt het model aan honderd dingen
// tegelijk (lengte, actiebeelden, omgevingen, cast-id's) en dan wint de
// makkelijkste zin. Deze stap doet één ding: met een kritische blik langs de
// gesproken regels en de flauwe eruit schrijven. Dezelfde opzet als de
// beeldcontrole — eerst maken, dan beoordelen, dan repareren.
// ---------------------------------------------------------------------------

export function buildAanscherpSysteem(
  draaiboek: string,
  taal: string,
  kern?: string | null,
  wending?: string | null,
  verhaallijn?: string | null
): string {
  const kaderBlok = [
    (kern ?? "").trim() ? `WAAR HET ONDERHUIDS OVER GAAT: ${(kern ?? "").trim()}` : "",
    (wending ?? "").trim() ? `DE WENDING: ${(wending ?? "").trim()}` : "",
  ].filter(Boolean).join("\n");

  return `Je bent eindredacteur van een geanimeerde dialoogvideo. Het draaiboek staat er al. Jij herschrijft alleen de GESPROKEN ZINNEN die niet goed genoeg zijn.
${kaderBlok ? `\n${kaderBlok}\n` : ""}${verhaallijn ? `\n${verhaallijn}\n` : ""}
${draaiboek}

WAT JE NIET AANRAAKT
- De volgorde en het aantal scènes.
- De omgevingen (setting) — die laat je letterlijk staan.
- De actiebeelden: hun beschrijving, hun duur en of ze wel of geen gesproken tekst hebben. Staat er geen tekst bij, dan komt er ook geen tekst bij.
- Wie er praat. Een regel van Tyrrell blijft een regel van Tyrrell.
- Het aantal regels. Even veel terug als er in ging.

WAT JE WÉL DOET
Loop elke gesproken regel langs en vraag je vier dingen af. Is het antwoord op één ervan "ja", dan herschrijf je hem.

Reken erop dat dat voor de MEESTE regels geldt. Een draaiboek dat rechtstreeks uit een taalmodel komt bestaat grotendeels uit brave zinnen; laat je er meer dan een derde ongemoeid, dan heb je niet goed gekeken. Een regel blijft alleen staan als hij echt iets toevoegt dat je nergens anders hoort.

1. BENOEMT DEZE ZIN WAT JE AL ZIET? "Kijk, wat een mooie kleuren!" bij een beeld vol kleuren is een verspilde regel. Vervang hem door iets wat je NIET ziet: wat iemand denkt, vreest, zich herinnert of van plan is.
2. IS IEDEREEN HET EENS? Twee regels achter elkaar die hetzelfde vinden ("Wat leuk!" — "Ja, geweldig!") is geen gesprek. Laat er één tegensputteren, twijfelen, iets anders willen of ergens anders over beginnen.
3. KAN IEMAND ANDERS DIT OOK ZEGGEN? Kijk bij de cast wat dit personage wil en hoe hij praat. Een regel die net zo goed uit de mond van de ander kan komen, is niet af.
4. IS HET EEN TEGELTJESWIJSHEID OF EEN LEGE UITROEP? "Vriendschap kent geen grenzen", "Wat een avontuur!", "Dit is geweldig!", "Ik kan niet wachten!", "Wat mooi!" — allemaal weg. Zet er iets concreets voor in de plaats: een geur, een geluid, een maat, iets dat kriebelt, iets dat iemand vroeger zei.${verhaallijn ? "\n5. LOST IEMAND HET PROBLEEM TE VROEG OP? In de scènes van deel 1 tot en met 3 mag niemand de oplossing voorstellen of aankondigen, ook niet voorzichtig. Laat die persoon in plaats daarvan twijfelen, iets verzwijgen of het verkeerde proberen." : ""}

ZO ZIET HET VERSCHIL ERUIT

  FLAUW                                          AANGESCHERPT
  "Een geheim? Wat voor geheim, oma?"            "Weer zo'n verhaal van vroeger zeker."
  "Oh, ik hou van geheimen! Vertel ons!"         "Mag ik raden? Het zit in de schuur."
  "Als je maar gelooft in de magie!"             "Geloven hoeft niet. Vasthouden wel."
  "Kijk, Tyrrell! Ze maken prachtige dingen!"    "Die vrouw maakt er twintig op een dag."
  "Ja, oma. Het is echt magisch."                "Ik heb niks gezegd. Ik dacht het alleen."

Links wordt gezegd wat je al ziet, en iedereen is het met elkaar eens. Rechts sputtert er iemand tegen, houdt iemand iets achter, of staat er één concreet ding in dat je niet kon raden.

HOE DE NIEUWE ZINNEN KLINKEN
- Gesproken taal in het ${taal}, ongeveer twaalf woorden, één zin.
- Voor kinderen: woorden die een kind van vijf kent, en dingen die een kind zou zeggen. "Die mango is groter dan mijn hoofd" is goed. "Wat een prachtig exemplaar" niet.
- Eén raak detail is meer waard dan drie bijvoeglijke naamwoorden.
- Iemand mag zijn zin niet afmaken, of langs de vraag heen antwoorden. Zo praten mensen.
- Laat de kern ergens halverwege even doorschemeren in één zin, van het personage dat het aangaat. Nooit uitleggen, wel voelbaar maken.

Geef het VOLLEDIGE draaiboek terug met alle scènes, ook de scènes waarin je niets veranderd hebt.`;
}

// ---------------------------------------------------------------------------
// ILLUSTRATIES AFDWINGEN
//
// De assistent schrijft uit zichzelf best actiebeelden — gemeten 18 tot 33% van
// de regels — maar onderweg raken ze kwijt: de eindredactie herschrijft scènes en
// de aanvullus levert vooral dialoog. Het eindresultaat was een draaiboek met
// achttien regels en NUL actiebeelden: achttien keer twee mensen die tegenover
// elkaar staan.
//
// Deze stap draait als laatste en maakt er alsnog wat bij. Bewust door bestaande
// dialoogregels OM TE ZETTEN in plaats van nieuwe scènes toe te voegen: de
// gesproken tekst blijft exact staan, alleen zie je iets anders dan de pratende
// koppen. Dat is precies wat een video dynamisch maakt — de dialoog loopt door
// terwijl het beeld hem illustreert — en het verandert de lengte niet.
// ---------------------------------------------------------------------------

export const ILLUSTREER_TOOL = {
  type: "function" as const,
  function: {
    name: "illustreer_regels",
    description:
      "Wijs regels aan die beter als ILLUSTRATIE in beeld komen dan als pratende koppen. " +
      "De gesproken tekst blijft ongewijzigd; alleen wat je ziet verandert.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["regels"],
      properties: {
        regels: {
          type: "array",
          description: "De aan te wijzen regels. Kies er zoveel als gevraagd, niet meer.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["scene", "regel", "actie"],
            properties: {
              scene: { type: "integer", description: "Scènenummer zoals in het draaiboek (1 = eerste)." },
              regel: { type: "integer", description: "Regelnummer binnen die scène (1 = eerste)." },
              actie: {
                type: "string",
                description:
                  "ENGELSE beschrijving van wat je ZIET terwijl deze zin klinkt. Toon waar de zin OVER " +
                  'gaat, niet de spreker: bij "de juf tekent een ketting op het bord" zie je dat bord met ' +
                  "die ketting, niet twee mensen die praten. Alleen handelingen op menselijke schaal — " +
                  "geen voertuigen die rijden, geen machines die transformeren.",
              },
            },
          },
        },
      },
    },
  },
};

/** Systeemprompt om regels aan te wijzen die geïllustreerd moeten worden. */
export function buildIllustreerSysteem(draaiboek: string, aantal: number): string {
  return `Je bent regisseur van een korte geanimeerde dialoogvideo en maakt hem dynamischer.

DIT IS HET DRAAIBOEK:

${draaiboek}

HET PROBLEEM
Elke regel die hierboven niet als ACTIEBEELD staat, wordt in beeld gebracht als twee mensen die tegenover elkaar staan te praten. Een hele video zo is doods om naar te kijken.

JOUW OPDRACHT
Wijs ${aantal} regels aan die beter geïllustreerd kunnen worden. Bij zo'n regel blijft de stem gewoon doorlopen, maar zie je waar het over GAAT in plaats van de pratende personages.

HOE JE KIEST
- Kies regels die iets beschrijven dat je kunt LATEN ZIEN: een voorwerp, een plek, een handeling, iets dat gebeurt of iets dat iemand doet.
- Kies GEEN regels die een directe vraag of reactie tussen twee personages zijn — daar wil je juist gezichten zien.
- Spreid ze over het hele draaiboek in plaats van ze te clusteren; laat er nooit meer dan twee gewone dialoogregels tussen zitten.
- Vermijd de allereerste en de allerlaatste regel: daar wil je de personages zien.

WAT JE TERUGGEEFT
Per aangewezen regel het scènenummer, het regelnummer, en in het ENGELS wat er te zien is. Beschrijf het onderwerp van de zin, niet de spreker. Verzin niets wat niet uit de zin volgt.`;
}
