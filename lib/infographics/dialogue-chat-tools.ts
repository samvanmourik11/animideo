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
import { CAST_POSITIONS, planVoorLengte, REGELS_PER_SCENE } from "./dialogue-schema";

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
        "styleId", "illustrationBrief", "muziekCategorie", "cast", "scenes",
      ],
      properties: {
        toelichting: {
          type: "string",
          description:
            "Twee of drie zinnen in het Nederlands waarin je uitlegt welke keuzes je maakte en waarom — " +
            "welke personages, welke stijl, welke toon. De gebruiker leest dit om je keuzes te kunnen corrigeren.",
        },
        title: { type: "string", description: "Titel van de video, in de taal van de video." },
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
            required: ["id", "characterId", "name", "role", "appearance", "voice", "position"],
            properties: {
              id: { type: "string", description: 'Verwijzing binnen dit draaiboek, bijv. "char-1".' },
              characterId: {
                type: "string",
                description: "Het exacte id uit de meegeleverde personagebibliotheek. Verzin er nooit een.",
              },
              name: { type: "string", description: "Naam zoals die in het gesprek gebruikt wordt." },
              role: { type: "string", description: 'Wie dit is in dit gesprek, bijv. "de expert".' },
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
                  ". Laat geslacht kloppen met het personage en geef verschillende personages verschillende stemmen.",
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
          description: "Het gesprek, verdeeld over scènes.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["setting", "lines"],
            properties: {
              setting: {
                type: "string",
                description:
                  "ENGELSE beschrijving van alleen de OMGEVING, bijv. \"a modern office with a desk and a laptop\". " +
                  "Noem NOOIT personages, namen, houdingen of handelingen — dus niet \"Marc and Eva smiling and " +
                  "discussing\", maar alleen de plek waar ze staan. Wie er staat en hoe bepalen wij uit de cast. " +
                  "Geef elke scène een andere omgeving.",
              },
              lines: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["kind", "characterId", "text", "emotion"],
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
  required: ["kind", "characterId", "text", "emotion"],
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
    characterId: { type: "string", description: 'Bij "dialoog" wie er spreekt; bij "actie" wie er het meest in beeld is.' },
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
  "maar alleen de plek waar ze staan.";

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
            required: ["setting", "lines"],
            properties: {
              setting: { type: "string", description: SETTING_OMSCHRIJVING },
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

export function buildChatSysteem(bibliotheek: BibliotheekItem[], gewensteLengte = 60): string {
  const { regels, scenes } = planVoorLengte(gewensteLengte);
  const lijst = bibliotheek
    .map((c) => {
      const kenmerken = [c.gender, c.age_range].filter(Boolean).join(", ");
      const omschrijving = (c.description ?? "").trim().replace(/\s+/g, " ").slice(0, 220);
      return `- id "${c.id}" · ${c.name}${kenmerken ? ` (${kenmerken})` : ""}${omschrijving ? ` — ${omschrijving}` : ""}`;
    })
    .join("\n");

  return `Je helpt een gebruiker een korte geanimeerde DIALOOG-video maken: twee (soms drie) personages die tegenover elkaar staan en samen een gesprek voeren. Er is geen verteller — de personages praten zelf.

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

RITME: AFWISSELEN MET ACTIEBEELDEN
Een video die alleen uit pratende mensen bestaat staat stil — dezelfde twee personen, dezelfde opstelling, alleen andere woorden. Zet er daarom ACTIEBEELDEN tussen: korte shots zonder tekst waarin je personages iets DOEN dat het verhaal vooruit brengt.

- Reken op ongeveer één actiebeeld per twee of drie gesproken regels, en begin of eindig gerust met een actiebeeld.
- WISSEL DE DRIE SMAKEN AF, dat is wat een video leuk maakt om naar te kijken:
  · het gesprek loopt DOOR bij een versterkend beeld — vul "text" met het cast-id van wie aan het woord was
  · een VERTELLER duidt kort wat je ziet — vul "text" en zet characterId op "verteller"
  · alleen MUZIEK — laat "text" leeg; gebruik dit alleen voor een moment dat zichzelf vertelt en waar woorden juist storen (iets wat wegvliegt, een omhelzing, een blik)
- VERDEEL ZE ONGEVEER GELIJK. Heb je zes actiebeelden, mik dan op twee waarbij het gesprek doorloopt, twee met een verteller en twee met alleen muziek. Ga niet alles op één manier doen — vijf keer achter elkaar dezelfde vertellerstem is net zo eentonig als vijf keer stilte.
- Kies per beeld wat er past. Legt een personage net iets uit en zie je dat vervolgens? Laat dan ZIJN stem doorlopen. Gaat er tijd voorbij of verschuift het verhaal? Dan een VERTELLER. Is het een moment waar woorden storen — iets wat wegvliegt, een omhelzing, een blik? Dan alleen MUZIEK.
- De verteller is een gast, geen presentator: hooguit een derde van de actiebeelden, en steeds één korte zin.
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

HET GESPREK DAT JE SCHRIJFT
- De personages spreken elkaar aan en wisselen elkaar af; nooit meer dan twee regels achter elkaar van dezelfde persoon.
- Eén regel is één natuurlijke gesproken zin van ongeveer twaalf woorden. Reken op VIER SECONDEN per regel en drie regels per scène. De gewenste lengte bepaalt dus hoeveel je er schrijft:
    30 seconden  →  ~8 regels over 3 scènes
    60 seconden  →  ~15 regels over 5 scènes
    120 seconden →  ~30 regels over 10 scènes
    180 seconden →  ~45 regels over 15 scènes
    300 seconden →  ~75 regels over 25 scènes
  Blijf daar dicht bij. Schrijf je er veel minder, dan wordt de video korter dan gevraagd; veel meer maakt hem onnodig duur.
- Bij een LANGE video (twee minuten of meer) is de valkuil dat het gesprek gaat rondjes draaien. Bouw dan echte hoofdstukken: elk stuk behandelt iets nieuws, met een eigen omgeving, en samen vormen ze een opbouw naar een slot.
- Een goede dialoog heeft een opening die nieuwsgierig maakt, een kern die iets uitlegt, en een duidelijke afsluiting.

Schrijf al je berichten aan de gebruiker in het Nederlands, kort en concreet.`;
}

/**
 * Het huidige draaiboek in leesbare vorm voor de assistent. Bewust geen ruwe JSON:
 * genummerde regels met namen erbij zijn compacter én maken verwijzingen als
 * "de laatste regel van Marc" voor het model eenduidig.
 */
export function toonDraaiboek(
  cast: { id: string; name: string; role: string; position: string }[],
  scenes: {
    setting: string;
    lines: { kind?: string; characterId: string; text: string; emotion: string; actie?: string | null; seconden?: number | null; verband?: string | null }[];
  }[],
  alleenScene?: number
): string {
  const naam = (id: string) => cast.find((c) => c.id === id)?.name ?? id;
  const castRegels = cast
    .map((c) => `- id "${c.id}" = ${c.name}${c.role ? ` (${c.role})` : ""}, staat ${c.position === "left" ? "links" : c.position === "right" ? "rechts" : "in het midden"}`)
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
          if (l.kind === "actie") {
            const verband = (l.verband ?? "").trim();
            return `  ${j + 1}. [ACTIEBEELD, ${l.seconden ?? 4}s, geen gesproken tekst] ${(l.actie ?? "").trim()}` +
              (verband ? `\n       verband: ${verband}` : "");
          }
          return `  ${j + 1}. ${naam(l.characterId)} [${l.characterId}] (${l.emotion}): ${l.text}`;
        })
        .join("\n");
      return `SCÈNE ${start + i + 1} — omgeving: ${s.setting}\n${regels}`;
    })
    .join("\n\n");

  return `DE CAST:\n${castRegels}\n\n${sceneRegels}`;
}

/** Systeemprompt voor het herzien van een bestaand draaiboek. */
export function buildHerzieSysteem(draaiboek: string, taal: string, eenScene: boolean): string {
  return `Je bent regisseur van een korte geanimeerde dialoogvideo en past een BESTAAND draaiboek aan.

${eenScene
  ? "De gebruiker heeft één scène geselecteerd en wil daar iets aan veranderd hebben. Pas ALLEEN die scène aan."
  : "De gebruiker wil iets aan het draaiboek veranderd hebben. Pas aan wat hij vraagt en LAAT DE REST LETTERLIJK ONGEMOEID — neem onveranderde scènes en regels woord voor woord over."}

DIT IS HET HUIDIGE DRAAIBOEK:

${draaiboek}

HOE JE AANPAST
- Doe precies wat er gevraagd wordt, niet meer. Vraagt iemand om één regel agressiever, herschrijf dan die ene regel en laat de andere staan zoals ze staan.
- "Verander de locatie" betekent: pas de omgeving aan. "Laat hem dit zeggen" betekent: pas de tekst van die regel aan, of voeg er een regel bij als dat logischer is.
- Behoud de bestaande cast-id's exact; er komen geen nieuwe personages bij.
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
export function buildSamenhangSysteem(draaiboek: string, taal: string): string {
  return `Je bent eindredacteur van een korte geanimeerde video en controleert of het draaiboek als één verhaal loopt.

DIT IS HET DRAAIBOEK:

${draaiboek}

WAAR JE OP LET
1. Volgt elk ACTIEBEELD logisch uit de regel ervoor? Een beeld van "ze rijden weg" hoort na een regel waarin ze besluiten te gaan, niet zomaar tussendoor.
2. Sluit de regel ná een actiebeeld erop aan? Als ze net zijn aangekomen, praten ze verder alsof ze er zijn — ze herhalen niet wat we al gezien hebben.
3. Staat er een actiebeeld dat niets toevoegt? Verwijder het.
4. Ontbreekt er een stap waardoor het verhaal springt? Bijvoorbeeld: ze besluiten te vertrekken en staan in de volgende regel al ergens anders zonder dat we ze hebben zien gaan. Voeg dan een kort actiebeeld toe.
5. Heeft het geheel een begin, een midden en een afsluiting?

HOE JE AANPAST
- Verander ZO WEINIG MOGELIJK. Klopt het al, geef het draaiboek dan letterlijk ongewijzigd terug.
- ACTIEBEELDEN ZIJN GEEN FOUT. Ze horen erbij en geven de video ritme. Neem elk actiebeeld ongewijzigd over met kind "actie", dezelfde Engelse beschrijving, dezelfde lengte en hetzelfde verband. Verwijder er alleen een als hij aantoonbaar nergens uit voortkomt, en maak er NOOIT een gesproken regel van.
- Herschrijf geen zinnen die prima zijn. Raak alleen aan wat de samenhang echt in de weg zit.
- Behoud de bestaande cast-id's, de taal (${taal}) en de volgorde van scènes, tenzij de volgorde juist het probleem is.
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
export function buildAanvulSysteem(
  draaiboek: string,
  taal: string,
  huidigeSeconden: number,
  doelSeconden: number
): string {
  const tekort = Math.max(0, doelSeconden - huidigeSeconden);
  const { regels } = planVoorLengte(tekort);
  const scenes = Math.max(1, Math.round(regels / REGELS_PER_SCENE));

  return `Je breidt een bestaand draaiboek voor een geanimeerde dialoogvideo uit.

DIT STAAT ER AL (samen ongeveer ${Math.round(huidigeSeconden)} seconden):

${draaiboek}

DE OPDRACHT
De video moet ${doelSeconden} seconden worden, dus er is nog ongeveer ${Math.round(tekort)} seconden nodig: ruwweg ${regels} regels over ${scenes} nieuwe scènes.

Geef ALLEEN DE NIEUWE SCÈNES terug — niet wat er al staat. Ze worden achter het bestaande draaiboek geplakt.

HOE JE UITBREIDT
- Het verhaal moet DOORLOPEN, niet opnieuw beginnen. Pak op waar de laatste scène eindigt.
- Breng echt iets nieuws: een volgende stap, een nieuwe vraag, een complicatie, een ander onderwerp. Herhaal niet wat al gezegd is en laat het gesprek geen rondjes draaien.
- Elke nieuwe scène speelt in een ANDERE omgeving dan de vorige.
- Loopt het verhaal in de laatste bestaande scène al naar een slot toe, verplaats dat slot dan naar jouw laatste scène: het einde hoort aan het eind.
- Wissel net als hiervoor dialoog af met actiebeelden, met en zonder voice-over.
- Gesproken tekst in het ${taal}; omgevingen en actiebeschrijvingen in het ENGELS.
- Gebruik dezelfde cast-id's; er komen geen personages bij.`;
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
