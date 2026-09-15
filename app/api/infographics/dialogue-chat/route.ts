import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import type { DialogueSetup } from "@/lib/infographics/dialogue-setup";
import { isKader, kaderPast } from "@/lib/infographics/verhaal-kaders";
import { isLichtsoort } from "@/lib/infographics/verhaal-licht";
import { openai } from "@/lib/openai";
import { momentProblemen, zonderVerkeerdeTaal } from "@/lib/infographics/momentcontrole";
import { vasteZinnen, redactieFout } from "@/lib/infographics/verhaalredactie";
import { buildVerhaalRedactieSysteem } from "@/lib/infographics/dialogue-chat-tools";
import { createClient } from "@/lib/supabase/server";
import {
  DRAAIBOEK_TOOL, HERZIE_DRAAIBOEK_TOOL, buildChatSysteem, buildSamenhangSysteem,
  buildUitbreidSysteem, buildAanscherpSysteem, ILLUSTREER_TOOL, buildIllustreerSysteem,
  buildMomentSysteem, toonDraaiboek,
  type BibliotheekItem, type VastgesteldeOpzet,
} from "@/lib/infographics/dialogue-chat-tools";
import {
  leesDeel, ordenDelen, vertellerBeeld, verhaallijnBlok, voegGelijkePlekSamen, zorgVoorVerteller, zorgVoorCitaten, kaalTekst,
  zorgVoorMomenten, vertellerZinnenBijVerteller,
  scenesPerDeel, deelLabel,
  normaliseerVerhaallijn, type VerhaalDeel,
} from "@/lib/infographics/verhaallijn";
import { STORY_VOICES, kiesVertellerStem } from "@/lib/infographics/story-voices";
import { MUSIC_CATEGORIES, MUSIC_TRACKS, musicTrackUrl, type MusicCategory } from "@/lib/music/library";
import { STORY_STYLE_PRESETS, DEFAULT_STORY_STYLE } from "@/lib/infographics/story-style";
import {
  MAX_CAST,
  CAST_POSITIONS,
  VIDEO_MIN_SEC,
  VIDEO_MAX_SEC,
  VIDEO_STANDAARD_SEC,
  VERTELLER_ID,
  zonderHerhaling,
  SECONDEN_PER_REGEL,
  ACTIE_MIN_SEC,
  ACTIE_MAX_SEC,
  ACTIE_STANDAARD_SEC,
  planVoorLengte,
  type DialogueSpec,
  type DialogueCastMember,
  type DialogueScene,
  type DialogueLine,
  type CastPosition,
} from "@/lib/infographics/dialogue-schema";

export const runtime = "nodejs";
export const maxDuration = 120;

// De gespreksassistent van de dialoogmodus. De gebruiker beschrijft in eigen
// woorden wat hij wil; de assistent vraagt door tot hij genoeg weet en levert dan
// in één keer een compleet plan dat de wizard invult.
//
// Het model kiest de cast uit de échte personagebibliotheek. Dat kan het alleen
// betrouwbaar als we zijn keuze daarna VALIDEREN: een verzonnen of verkeerd
// overgetypt id zou anders een spec opleveren waar geen portret bij hoort, en dan
// klapt het renderen pas veel later om een reden die niemand terug kan vinden.

interface Bericht {
  role: "user" | "assistant";
  content: string;
}

interface Body {
  messages?: Bericht[];
  /** Door de gebruiker vooraf gekozen videolengte in seconden. */
  targetSeconds?: number;
  /**
   * De opzet zoals de gebruiker hem heeft vastgesteld (zie dialogue-setup.ts).
   *
   * Is hij er, dan hoeft het model niets meer te vragen of te kiezen: het
   * schrijft alleen nog de scènes. Alle keuzes die de gebruiker maakte
   * overschrijven daarna wat het model er alsnog van bakte — anders zou een
   * opzet die je zelf hebt bijgesteld stilzwijgend genegeerd worden.
   */
  setup?: DialogueSetup | null;
}

// Vorm zoals het model hem aanlevert (nog ongevalideerd).
interface RuwPlan {
  toelichting?: string;
  title?: string;
  format?: string;
  language?: string;
  tone?: string;
  targetSeconds?: number;
  styleId?: string;
  illustrationBrief?: string;
  muziekCategorie?: string;
  kern?: string;
  wending?: string;
  cast?: {
    id?: string; characterId?: string; name?: string; role?: string; leeftijd?: string; wil?: string; spraak?: string;
    kleding?: string; appearance?: string; voice?: string; position?: string;
    /** Alleen uit de opzet: het portret van een personage dat niet in de bibliotheek staat. */
    portraitUrl?: string; nieuw?: boolean | null; bibliotheekId?: string | null; soort?: string | null;
  }[];
  scenes?: RuweScene[];
}

/** Ruwe scène zoals het model hem aanlevert, vóór validatie. */
interface RuweScene {
  deel?: number;
  setting?: string;
  licht?: string;
  lines?: RuweRegel[];
}

/**
 * Vertaalt hoe het model naar een personage verwijst naar het cast-id in de spec.
 *
 * Het model wisselt hier willekeurig in: soms "char-1" zoals gevraagd, soms de
 * UUID uit de personagebibliotheek, soms gewoon de naam. Alleen op "char-1"
 * controleren liet in zo'n run ALLE regels wegvallen, met "geen bruikbaar gesprek"
 * als enige signaal — een fout die je pas na een mislukte generatie zou zien.
 */
function maakVertaler(cast: DialogueCastMember[]): (ruw?: string) => string | null {
  const tabel = new Map<string, string>();
  for (const c of cast) {
    tabel.set(c.id.toLowerCase(), c.id);
    tabel.set(c.characterId.toLowerCase(), c.id);
    tabel.set(c.name.toLowerCase(), c.id);
  }
  // De VERTELLER hoort bij geen enkel personage maar is wel een geldige spreker
  // boven een actiebeeld.
  tabel.set(VERTELLER_ID, VERTELLER_ID);
  return (ruw?: string) => tabel.get((ruw ?? "").trim().toLowerCase()) ?? null;
}

/** Ruwe regel zoals het model hem aanlevert, vóór validatie. */
interface RuweRegel {
  kind?: string;
  kader?: string;
  characterId?: string;
  text?: string;
  emotion?: string;
  actie?: string;
  seconden?: number;
  verband?: string;
}

/** Een nummer uit de gevraagde categorie; valt terug op zakelijk als de AI iets onbekends noemt. */
function kiesMuziek(categorie?: string): string | null {
  const geldig = MUSIC_CATEGORIES.some((c) => c.id === categorie);
  const cat = (geldig ? categorie : "zakelijk") as MusicCategory;
  const opties = MUSIC_TRACKS.filter((t) => t.category === cat);
  const keuze = opties[Math.floor(Math.random() * opties.length)] ?? MUSIC_TRACKS[0];
  return keuze ? musicTrackUrl(keuze.slug) : null;
}

const STEMMEN = new Set(STORY_VOICES.map((v) => v.id));
const STIJLEN = new Set(STORY_STYLE_PRESETS.map((s) => s.id));
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Lengte van een actiebeeld binnen de grenzen die Seedance zinnig aankan. */
const begrensSeconden = (n: unknown) =>
  clamp(Math.round(typeof n === "number" && Number.isFinite(n) ? n : ACTIE_STANDAARD_SEC), ACTIE_MIN_SEC, ACTIE_MAX_SEC);

/**
 * Leest scènes zoals een model ze teruggeeft en maakt er geldige scènes van.
 *
 * Dit stond op DRIE plekken, elk met een eigen kopie van dezelfde code, en elke
 * kopie liet net iets anders vallen: eerst het camerakader, toen het licht. Een
 * verhaal dat ná al het camerawerk gemaakt werd, kwam terug met bij elke regel
 * "geen kader". Met één functie hoeft een nieuw veld ook maar op één plek bewaard
 * te worden.
 *
 * `vorige` is het draaiboek vóór deze stap. Wat het model weglaat (omgeving,
 * licht, deel) valt terug op de scène op dezelfde plek daarin.
 */
function leesScenes(ruwe: RuweScene[], cast: DialogueCastMember[], vorige: DialogueScene[] = []): DialogueScene[] {
  const naarCastId = maakVertaler(cast);

  // Zinnen die in de vorige versie van de verteller waren, op tekst terug te vinden.
  const vanVerteller = new Map(
    vorige
      .flatMap((s) => s.lines)
      .filter((l) => l.characterId === VERTELLER_ID && kaalTekst(l.text))
      .map((l) => [kaalTekst(l.text), l] as const),
  );

  return ruwe
    .map((s, i): DialogueScene => {
      const oud = vorige[i];
      const setting = (s.setting ?? "").trim() || oud?.setting || "";
      const lines = (s.lines ?? [])
        .map((l): DialogueLine | null => {
          // Een vertellerzin blijft van de verteller. De samenhangcontrole gaf in een
          // proef alle acht vertellerzinnen terug in de mond van Tyrell en Lilly. Dat
          // is nu ook in het getoonde draaiboek opgelost, maar wie een zin uitspreekt
          // mag niet van een model afhangen: dan komt de stem uit de verkeerde mond.
          const eerderVerteld = vanVerteller.get(kaalTekst(l.text));
          if (eerderVerteld) return { ...eerderVerteld };

          // Bij een ACTIEBEELD betekent de spreker alleen wie er het meest in beeld
          // is. Het model schrijft daar soms "Tyrell en Lilly" of "de kinderen", en
          // dan viel het hele beeld weg — bij de Wonderwagen zo alle drie de regels
          // van de synagoge. Zonder tekst hoort het beeld dan bij het eerste
          // personage; mét tekst is er geen stem voor, dus vertelt de verteller het.
          // Een dialoogregel zonder bestaande spreker kan niet uitgesproken worden
          // en valt nog steeds weg.
          const cid = naarCastId(l.characterId) ??
            (l.kind === "actie" ? ((l.text ?? "").trim() ? VERTELLER_ID : cast[0]?.id ?? null) : null);
          if (!cid) return null;

          // Een actiebeeld heeft geen gesproken tekst maar een handeling; zonder
          // dit onderscheid zou de tekstcontrole hieronder het meteen weggooien.
          if (l.kind === "actie") {
            const actie = (l.actie ?? "").trim();
            const gesproken = (l.text ?? "").trim();
            if (!actie) {
              // Een actiebeeld zonder beschrijving maar MET een gesproken zin: die zin
              // mag niet verdwijnen omdat het beeld ontbreekt. Het is precies de
              // vertellerzin of letterlijke zin waar het verhaal op leunt.
              if (!gesproken) return null;
              if (cid === VERTELLER_ID) {
                return {
                  kind: "actie", characterId: VERTELLER_ID, kader: "totaal",
                  text: gesproken, emotion: (l.emotion ?? "").trim(),
                  actie: vertellerBeeld(gesproken, setting), seconden: begrensSeconden(l.seconden),
                  verband: (l.verband ?? "").trim() || null,
                };
              }
              return {
                kind: "dialoog", characterId: cid, kader: isKader(l.kader) ? l.kader : null,
                text: gesproken, emotion: (l.emotion ?? "").trim() || "neutraal",
              };
            }
            // Tekst bij een actiebeeld = voice-over: je ziet het beeld, je hoort
            // de stem eroverheen. Zonder dit werd die zin stilzwijgend gewist.
            return {
              kind: "actie", characterId: cid,
              kader: isKader(l.kader) ? l.kader : null,
              text: (l.text ?? "").trim(), emotion: (l.emotion ?? "").trim(),
              actie, seconden: begrensSeconden(l.seconden),
              verband: (l.verband ?? "").trim() || null,
            };
          }

          const text = (l.text ?? "").trim();
          if (!text) return null;
          // De VERTELLER kan niet in een twee-shot staan: daar zie je wie er praat,
          // en een stem uit het niets naast twee gesloten monden klopt niet. Zijn
          // regel werd daarom weggegooid — en dát was de tweede reden dat er bijna
          // nooit een verteller in de video zat. Nu maken we er een beeld van
          // waarin niemand praat, en klinkt zijn stem daaroverheen. Precies zoals
          // de sprookjeskanalen het doen.
          if (cid === VERTELLER_ID) {
            return {
              kind: "actie",
              characterId: VERTELLER_ID,
              kader: isKader(l.kader) && !kaderPast(l.kader, cast.length, true) ? l.kader : "totaal",
              text,
              emotion: (l.emotion ?? "").trim(),
              actie: (l.actie ?? "").trim() || vertellerBeeld(text, setting),
              seconden: begrensSeconden(l.seconden),
              verband: (l.verband ?? "").trim() || null,
            };
          }
          return {
            kind: "dialoog",
            characterId: cid,
            kader: isKader(l.kader) ? l.kader : null,
            text,
            emotion: (l.emotion ?? "").trim() || "neutraal",
          };
        })
        .filter((l): l is DialogueLine => l !== null);

      return {
        id: oud?.id ?? `scene-${i}`,
        setting,
        licht: isLichtsoort(s.licht) ? s.licht : oud?.licht ?? null,
        deel: leesDeel(s.deel) ?? oud?.deel ?? null,
        lines,
      };
    })
    .filter((s) => s.lines.length > 0);
}

/**
 * Eén regel in het log per stap: hoeveel er gesproken wordt, en door wie.
 *
 * Een draaiboek van de Wonderwagen kwam terug met zeven plekken waar alleen stille
 * vertellerbeelden stonden, en achteraf was niet te zien welke van de zes stappen
 * de zinnen had laten vallen. Hiermee wel.
 */
function telRegels(stap: string, scenes: DialogueScene[]): void {
  const alle = scenes.flatMap((s) => s.lines);
  const verteller = alle.filter((l) => l.characterId === VERTELLER_ID);
  const metTekst = (l: DialogueLine) => !!(l.text ?? "").trim();
  console.log(
    `[dialogue-chat] ${stap}: ${scenes.length} scènes, ${alle.length} regels — ` +
    `verteller ${verteller.filter(metTekst).length} met zin / ${verteller.filter((l) => !metTekst(l)).length} zonder, ` +
    `personages ${alle.filter((l) => l.characterId !== VERTELLER_ID && metTekst(l)).length} zinnen, ` +
    `stil ${alle.filter((l) => l.characterId !== VERTELLER_ID && !metTekst(l)).length}`
  );
}

/**
 * Het draaiboek langs de verhaallijn leggen: deelnummers op volgorde, zinnen op
 * dezelfde plek in één scène, een verteller waar de verhaallijn er een vraagt, en
 * elke letterlijke zin uit het verhaal van de gebruiker bij de juiste persoon.
 * Allemaal zonder model, dus het kan na elke stap opnieuw zonder iets te kosten.
 */
function langsVerhaal(
  scenes: DialogueScene[],
  verhaallijn: VerhaalDeel[] | null | undefined,
  cast: DialogueCastMember[],
): DialogueScene[] {
  const metAlleMomenten = vertellerZinnenBijVerteller(
    zorgVoorMomenten(voegGelijkePlekSamen(ordenDelen(scenes)), verhaallijn, cast),
    cast,
  );
  return zorgVoorCitaten(zorgVoorVerteller(metAlleMomenten, verhaallijn), verhaallijn, cast);
}

/**
 * Maakt van het ruwe plan een spec die gegarandeerd klopt: elk cast-lid bestaat
 * echt en heeft een portret, elke stem en stijl is geldig, en elke dialoogregel
 * verwijst naar een bestaand cast-lid. Wat niet klopt wordt gerepareerd of
 * weggelaten — nooit doorgelaten.
 */
function maakSpec(
  plan: RuwPlan,
  bibliotheek: { id: string; name: string; image_url: string | null; description?: string | null }[]
): { spec: DialogueSpec | null; probleem?: string } {
  const opId = new Map(bibliotheek.map((c) => [c.id, c]));

  const cast: DialogueCastMember[] = [];
  for (const [i, lid] of (plan.cast ?? []).slice(0, MAX_CAST).entries()) {
    const bron = opId.get((lid.characterId ?? "").trim());
    // Een personage dat de opzet zelf tekende staat niet in de bibliotheek, maar
    // heeft wel een portret. Dat komt alleen uit de opzet: een plan van het model
    // zelf heeft geen portretveld, dus een verzonnen id valt nog steeds af.
    const eigenPortret = lid.nieuw ? (lid.portraitUrl ?? "").trim() : "";
    if (!bron?.image_url && !eigenPortret) continue; // verzonnen id of personage zonder afbeelding
    const positie = (CAST_POSITIONS as readonly string[]).includes(lid.position ?? "")
      ? (lid.position as CastPosition)
      : i === 0 ? "left" : i === 1 ? "right" : "center";
    cast.push({
      id: (lid.id ?? "").trim() || `char-${i + 1}`,
      characterId: bron?.image_url ? bron.id : (lid.characterId ?? "").trim(),
      name: (lid.name ?? "").trim() || bron?.name || "Personage",
      role: (lid.role ?? "").trim(),
      leeftijd: (lid.leeftijd ?? "").trim() || null,
      // Verlangen en spraak gaan mee de spec in: elke latere stap die nog zinnen
      // schrijft heeft ze nodig, anders vervlakken de personages halverwege alsnog.
      wil: (lid.wil ?? "").trim() || null,
      spraak: (lid.spraak ?? "").trim() || null,
      kleding: (lid.kleding ?? "").trim() || null,
      voice: lid.voice && STEMMEN.has(lid.voice) ? lid.voice : STORY_VOICES[i % STORY_VOICES.length].id,
      portraitUrl: bron?.image_url || eigenPortret,
      position: positie,
      // Het uiterlijk is het tweede houvast waarmee prompts de juiste persoon
      // aanwijzen; valt het model dat weg, dan de bibliotheekbeschrijving.
      appearance: (lid.appearance ?? "").trim() || (bron?.description ?? "").trim().slice(0, 200) || null,
      nieuw: bron?.image_url ? null : true,
      bibliotheekId: lid.bibliotheekId ?? null,
      soort: (["mens", "dier", "fantasiewezen"] as const).find((s) => s === lid.soort) ?? null,
    });
  }
  if (cast.length < 2) {
    return { spec: null, probleem: "Ik kon geen twee bruikbare personages kiezen uit je bibliotheek." };
  }

  const scenes = leesScenes(plan.scenes ?? [], cast);

  if (scenes.length === 0) {
    return { spec: null, probleem: "Er kwam geen bruikbaar gesprek uit. Probeer het nog eens." };
  }

  const spec: DialogueSpec = {
    version: 1,
    title: (plan.title ?? "").trim() || "Naamloze dialoog",
    kern: (plan.kern ?? "").trim() || null,
    wending: (plan.wending ?? "").trim() || null,
    format: plan.format === "9:16" ? "9:16" : "16:9",
    cast,
    scenes,
    mode: "dialogue",
    language: (plan.language ?? "").trim() || "Nederlands",
    styleId: plan.styleId && STIJLEN.has(plan.styleId) ? plan.styleId : DEFAULT_STORY_STYLE,
    illustrationBrief: (plan.illustrationBrief ?? "").trim() || null,
    seed: Math.floor(Math.random() * 2_000_000),
    // Een stem die geen enkel personage al gebruikt, zodat de verteller herkenbaar
    // buiten het verhaal staat.
    narratorVoice: kiesVertellerStem(cast.map((c) => c.voice), (plan.language ?? "").trim() || null),
    // Meteen een passend nummer kiezen. Zonder dit blijft musicUrl leeg tot iemand
    // er zelf aan denkt, en dan vallen alle beelden zonder tekst stil — precies de
    // klacht die deze ronde moest oplossen.
    musicUrl: kiesMuziek(plan.muziekCategorie),
    musicVolume: 0.45,
  };
  return { spec };
}

/**
 * Herstelt cijfers die het model tóch als getal liet staan. De gesproken tekst gaat
 * naar ElevenLabs, en "88%" wordt daar onvoorspelbaar uitgesproken — soms als
 * "achtentachtig procent", soms als "acht acht". Meer prompten loste dit niet
 * betrouwbaar op (het lukte drie van de vier keer), dus controleren we het en
 * repareren alleen de regels die het misdoen. Eén goedkope aanroep, en alleen
 * wanneer het nodig is.
 */
async function schrijfGetallenVoluit(scenes: DialogueScene[], taal: string): Promise<void> {
  const teRepareren: { si: number; li: number; text: string }[] = [];
  scenes.forEach((s, si) =>
    s.lines.forEach((l, li) => {
      if (l.text && /[\d%€$]/.test(l.text)) teRepareren.push({ si, li, text: l.text });
    })
  );
  if (teRepareren.length === 0) return;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content:
            `Je krijgt gesproken zinnen in het ${taal}. Schrijf elk getal, percentage, bedrag en symbool ` +
            `VOLUIT zoals het uitgesproken wordt ("88%" wordt "achtentachtig procent", "€4000" wordt ` +
            `"vierduizend euro"). Verander verder NIETS aan de zin — geen woordkeuze, geen volgorde, ` +
            `geen interpunctie. Behoud de exacte waarde van elk getal. Antwoord met JSON: ` +
            `{"zinnen": ["...", "..."]} in dezelfde volgorde en met evenveel zinnen als je kreeg.`,
        },
        { role: "user", content: JSON.stringify({ zinnen: teRepareren.map((r) => r.text) }) },
      ],
      response_format: { type: "json_object" },
    });
    const uit = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { zinnen?: string[] };
    if (!Array.isArray(uit.zinnen) || uit.zinnen.length !== teRepareren.length) return;

    teRepareren.forEach((r, i) => {
      const nieuw = (uit.zinnen as string[])[i]?.trim();
      // Alleen overnemen als het echt geholpen heeft; anders liever het origineel.
      if (nieuw && !/[\d%€$]/.test(nieuw)) scenes[r.si].lines[r.li].text = nieuw;
    });
  } catch (e) {
    // Een mislukte reparatie mag het draaiboek niet tegenhouden.
    console.error("[dialogue-chat] getallen voluit schrijven mislukt:", e);
  }
}

/**
 * Haalt personages uit de scène-omschrijvingen. Een setting hoort alleen de PLEK
 * te beschrijven; staat er "Marc and Eva smiling and discussing" in, dan gaat dat
 * als beeldprompt naar het twee-shot en krijg je personages dubbel in beeld —
 * één keer uit de cast-referenties en één keer omdat de prompt erom vroeg.
 * Het model houdt zich hier niet altijd aan, dus we herstellen het.
 */
async function schoonSettings(scenes: DialogueScene[], cast: DialogueCastMember[]): Promise<void> {
  const namen = cast.map((c) => c.name).filter((n) => n.length > 2);
  const verdacht: { si: number; setting: string }[] = [];
  scenes.forEach((s, si) => {
    const lower = s.setting.toLowerCase();
    if (namen.some((n) => lower.includes(n.toLowerCase()))) verdacht.push({ si, setting: s.setting });
  });
  if (verdacht.length === 0) return;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content:
            "Je krijgt Engelse scène-omschrijvingen die per ongeluk personen en handelingen noemen. " +
            "Herschrijf elke omschrijving zodat ALLEEN de locatie overblijft — geen personen, geen namen, " +
            'geen handelingen. Dus "Marc and Eva smiling in a bright kitchen" wordt "a bright kitchen". ' +
            'Behoud de plek zo goed mogelijk. Antwoord met JSON: {"settings": ["...", "..."]} in dezelfde ' +
            "volgorde en met evenveel omschrijvingen als je kreeg.",
        },
        { role: "user", content: JSON.stringify({ settings: verdacht.map((v) => v.setting) }) },
      ],
      response_format: { type: "json_object" },
    });
    const uit = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { settings?: string[] };
    if (!Array.isArray(uit.settings) || uit.settings.length !== verdacht.length) return;
    verdacht.forEach((v, i) => {
      const nieuw = (uit.settings as string[])[i]?.trim();
      if (nieuw) scenes[v.si].setting = nieuw;
    });
  } catch (e) {
    console.error("[dialogue-chat] settings opschonen mislukt:", e);
  }
}

/**
 * Maakt van de los geschreven momenten één doorlopend verhaal.
 *
 * Het eigen verhaal van de gebruiker wordt moment voor moment geschreven, elk in een
 * eigen aanroep, zodat er geen moment wegvalt. Het nadeel voelde Sam meteen: "het is
 * zo aan elkaar geplakt". Lilly vroeg "Kunnen we echt overal naartoe?" terwijl oma
 * nog niets over de Wonderwagen had verteld, twee plekken na elkaar begonnen met
 * dezelfde uitroep, en niemand reageerde op een ander.
 *
 * De gewone samenhangcontrole mag hier niet: die verplaatst en schrapt scènes. Deze
 * redacteur mag alleen zinnen aanvullen en herschrijven, en wat hij teruggeeft wordt
 * per scène nagekeken (redactieFout): vaste zinnen letterlijk op hun plek, geen
 * Engelse zinnen, niet te veel erbij of eraf. Een scène die dat niet haalt blijft zoals
 * hij was.
 */
async function redigeerEigenVerhaal(
  scenes: DialogueScene[],
  cast: DialogueCastMember[],
  taal: string,
  lijnTekst: string | undefined,
  lijn: VerhaalDeel[] | null | undefined,
  castTeksten: string[],
): Promise<DialogueScene[]> {
  const vast = vasteZinnen(lijn, cast);
  const naamVan = (id: string) => (id === VERTELLER_ID ? "verteller" : cast.find((c) => c.id === id)?.name ?? id);
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: 8000,
      tools: [HERZIE_DRAAIBOEK_TOOL],
      tool_choice: { type: "function", function: { name: HERZIE_DRAAIBOEK_TOOL.function.name } },
      messages: [
        {
          role: "system",
          content: buildVerhaalRedactieSysteem(
            toonDraaiboek(cast, scenes),
            taal,
            lijnTekst ?? "",
            vast.map((v) => `- ${naamVan(v.characterId)}: "${v.tekst}"`),
          ),
        },
        { role: "user", content: "Maak er één doorlopend verhaal van en geef het complete draaiboek terug." },
      ],
    });
    const call = completion.choices[0]?.message?.tool_calls?.[0];
    if (!call) return scenes;
    const uit = JSON.parse(call.function.arguments || "{}") as { scenes?: RuweScene[] };
    const ruwe = Array.isArray(uit.scenes) ? uit.scenes : [];
    if (ruwe.length !== scenes.length) {
      console.warn(`[dialogue-chat] verhaalredactie gaf ${ruwe.length} scènes in plaats van ${scenes.length}; origineel behouden`);
      return scenes;
    }
    // Plek, licht en deel horen bij de scène, niet bij de redacteur.
    const nieuw = leesScenes(
      ruwe.map((r, i) => ({ ...r, deel: scenes[i].deel ?? r.deel, setting: scenes[i].setting, licht: scenes[i].licht ?? r.licht })),
      cast,
      scenes,
    );
    if (nieuw.length !== scenes.length) return scenes;

    let herschreven = 0;
    const uitkomst = scenes.map((oud, i) => {
      const fout = redactieFout(oud, nieuw[i], vast, castTeksten, taal);
      if (fout) {
        console.warn(`[dialogue-chat] verhaalredactie scène ${i + 1} niet overgenomen: ${fout}`);
        return oud;
      }
      herschreven++;
      return { ...nieuw[i], id: oud.id, setting: oud.setting, licht: oud.licht, deel: oud.deel };
    });
    console.log(`[dialogue-chat] verhaalredactie: ${herschreven} van ${scenes.length} scènes overgenomen`);
    return uitkomst;
  } catch (e) {
    console.error("[dialogue-chat] verhaalredactie mislukt:", e);
    return scenes;
  }
}

/**
 * Laat elk beeld zien wat de zin eroverheen zegt.
 *
 * "Aan het einde van de dag stapten ze weer in de Wonderwagen" kreeg als beeld
 * "Tyrell and Lilly step out of the glowing Wonderwagen": precies het omgekeerde.
 * De vertellerzin komt uit de verhaallijn, het beeld schrijft het model er zelf bij,
 * en een vangnet dat een lege beschrijving opvult ("a calm establishing view")
 * weet al helemaal niet wat er gezegd wordt. Eén aanroep over het hele draaiboek,
 * en alleen de beelden die niet kloppen worden herschreven — de zinnen nooit.
 */
async function beeldBijZin(scenes: DialogueScene[]): Promise<void> {
  const paren = scenes
    .flatMap((s) => s.lines.map((l) => ({ l, plek: s.setting })))
    .filter(({ l }) => l.kind === "actie" && (l.text ?? "").trim() && (l.actie ?? "").trim());
  if (paren.length === 0) return;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 2500,
      messages: [
        {
          role: "system",
          content:
            "Je controleert een draaiboek voor een animatievideo. Bij elk beeld klinkt een zin, van de verteller " +
            "of van een personage. Het beeld moet laten zien wat die zin zegt: dezelfde handeling, dezelfde " +
            "richting (instappen is niet uitstappen, aankomen is niet vertrekken), op de plek van de scène en op " +
            "hetzelfde moment. Een beeld mag méér tonen dan de zin noemt, maar nooit iets anders of het " +
            "tegenovergestelde. Is het beeld een lege algemene omschrijving terwijl de zin een handeling noemt, " +
            "dan klopt het ook niet.\n\n" +
            "Geef ALLEEN de beelden die niet kloppen, met een nieuwe ENGELSE beschrijving die wél past: één zin, " +
            "op menselijke schaal, op de plek van de scène, en noem iedereen die in beeld is bij naam. " +
            'Antwoord met JSON: {"fouten": [{"nr": <nummer>, "waarom": "...", "actie": "..."}]}. ' +
            "Klopt alles, geef dan een lege lijst.",
        },
        {
          role: "user",
          content: JSON.stringify(paren.map((p, nr) => ({ nr, plek: p.plek, zin: p.l.text, beeld: p.l.actie }))),
        },
      ],
      response_format: { type: "json_object" },
    });
    const uit = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { fouten?: { nr?: unknown; waarom?: unknown; actie?: unknown }[] };
    let hersteld = 0;
    for (const f of Array.isArray(uit.fouten) ? uit.fouten : []) {
      const nr = typeof f.nr === "number" ? f.nr : -1;
      const actie = typeof f.actie === "string" ? f.actie.trim() : "";
      if (!paren[nr] || !actie) continue;
      console.log(`[dialogue-chat] beeld past niet bij "${paren[nr].l.text}": ${String(f.waarom ?? "")} → ${actie}`);
      paren[nr].l.actie = actie;
      hersteld++;
    }
    if (hersteld) console.log(`[dialogue-chat] ${hersteld} beeld(en) passend gemaakt bij hun zin`);
  } catch (e) {
    console.error("[dialogue-chat] beeld bij zin controleren mislukt:", e);
  }
}

/**
 * Loopt het draaiboek na op verhaallogica: volgt elk actiebeeld uit wat eraan
 * voorafgaat, sluit het gesprek erna erop aan, en zit er niets tussen dat niets
 * toevoegt?
 *
 * Dit is een aparte ronde omdat het model van voor naar achter schrijft en het
 * geheel pas achteraf overziet. Instructies vooraf hielpen maar beperkt: er bleven
 * actiebeelden tussen zinnen staan die er niets mee te maken hadden. Mislukt de
 * controle, dan houden we het origineel — een kapotte controle mag geen draaiboek
 * weggooien.
 */
async function controleerSamenhang(
  scenes: DialogueScene[],
  cast: DialogueCastMember[],
  taal: string,
  verhaallijn?: string,
  volg = false
): Promise<DialogueScene[]> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: 8000,
      tools: [HERZIE_DRAAIBOEK_TOOL],
      messages: [
        { role: "system", content: buildSamenhangSysteem(toonDraaiboek(cast, scenes), taal, verhaallijn, volg) },
        { role: "user", content: "Loop het draaiboek na en geef het terug zoals het moet worden." },
      ],
    });
    const call = completion.choices[0]?.message?.tool_calls?.[0];
    if (!call) return scenes;

    const uit = JSON.parse(call.function.arguments || "{}") as { scenes?: RuweScene[] };
    const ruwe = Array.isArray(uit.scenes) ? uit.scenes : [];
    if (ruwe.length === 0) return scenes;

    const nieuw = leesScenes(ruwe, cast, scenes);

    // VANGNET. Waren er actiebeelden en komen ze er geen enkele meer uit, dan is er
    // iets structureel misgegaan in plaats van dat er inhoudelijk iets is verbeterd.
    // Precies dat gebeurde toen deze controle actiebeelden als lege regels te zien
    // kreeg: ze verdwenen allemaal, zonder enig signaal. Liever het origineel dan
    // een draaiboek waar stilzwijgend een heel soort beeld uit gesloopt is.
    const hadActie = scenes.some((s) => s.lines.some((l) => l.kind === "actie"));
    const heeftActie = nieuw.some((s) => s.lines.some((l) => l.kind === "actie"));
    if (hadActie && !heeftActie) {
      console.warn("[dialogue-chat] samenhangcontrole liet alle actiebeelden vallen; origineel behouden");
      return scenes;
    }

    // De eindredactie mag bijschaven, niet halveren. Snoeit hij meer dan een
    // vijfde van de regels weg, dan heeft hij het verhaal ingekort in plaats van
    // verbeterd — en dat gaat rechtstreeks ten koste van de lengte die de
    // gebruiker heeft besteld.
    const voor = scenes.reduce((a, s) => a + s.lines.length, 0);
    const na = nieuw.reduce((a, s) => a + s.lines.length, 0);
    if (voor > 0 && na < voor * 0.8) {
      console.warn(`[dialogue-chat] samenhangcontrole kortte in van ${voor} naar ${na} regels; origineel behouden`);
      return scenes;
    }

    return nieuw.length > 0 ? nieuw : scenes;
  } catch (e) {
    console.error("[dialogue-chat] samenhangcontrole mislukt:", e);
    return scenes;
  }
}

/** Geschatte gesproken duur van een draaiboek, in seconden. */
function schatDuur(scenes: DialogueScene[]): number {
  return scenes.reduce((a, s) => a + s.lines.reduce((b, l) => {
    if (l.kind === "actie" && !(l.text ?? "").trim()) return b + (l.seconden ?? ACTIE_STANDAARD_SEC);
    return b + SECONDEN_PER_REGEL;
  }, 0), 0);
}

/**
 * Vult het draaiboek aan tot de gevraagde lengte.
 *
 * Het model haalt de gevraagde lengte niet uit zichzelf: op een verzoek van vijf
 * minuten schreef het elf regels, goed voor drie kwart minuut. Het schrijft een
 * afgerond verhaaltje en stopt, hoe expliciet je de lengte ook opgeeft. Daarom
 * meten we en vragen we gericht om het ontbrekende deel, tot het klopt of tot we
 * er drie rondes over hebben gedaan — dan is doorgaan zinloos en duur.
 */
/** Hoogstens drie aanvulrondes; daarna is een iets te korte video beter dan doorpompen. */
const RONDES = 3;

async function brengOpLengte(
  scenes: DialogueScene[],
  cast: DialogueCastMember[],
  taal: string,
  doel: number,
  briefing?: string | null,
  kern?: string | null,
  wending?: string | null,
  verhaallijn?: string,
  volg = false
): Promise<DialogueScene[]> {
  let huidig = [...scenes];

  for (let ronde = 1; ronde <= RONDES; ronde++) {
    const duur = schatDuur(huidig);
    // Binnen 5% van het doel is klaar. Deze marge stond op 15%, maar dat kwam
    // neer op "een minuut" die 52 seconden werd — en dat verschil zie je wél.
    if (duur >= doel * 0.95) break;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.6,
        max_tokens: 12000,
        tools: [HERZIE_DRAAIBOEK_TOOL],
        // AFDWINGEN dat er scènes terugkomen. Zonder dit antwoordde het model
        // regelmatig met gewone tekst, viel de lus stil en bleef het draaiboek op
        // de helft van de bestelde lengte steken — wie op "1 minuut" klikte kreeg
        // dertig seconden.
        tool_choice: { type: "function", function: { name: HERZIE_DRAAIBOEK_TOOL.function.name } },
        messages: [
          { role: "system", content: buildUitbreidSysteem(toonDraaiboek(cast, huidig), taal, duur, doel, briefing, kern, wending, verhaallijn, volg) },
          { role: "user", content: "Geef het volledige draaiboek terug, met de nieuwe scènes op de juiste plek." },
        ],
      });
      const call = completion.choices[0]?.message?.tool_calls?.[0];
      if (!call) break;

      const uit = JSON.parse(call.function.arguments || "{}") as { scenes?: RuweScene[] };
      const nieuw = leesScenes(uit.scenes ?? [], cast, huidig);

      // HARDE ZEEF tegen een verhaal dat zichzelf overdoet: in een video van twee
      // minuten stond het hele verhaal er twee keer in. De prompt verbiedt dat al;
      // dit is de bewaking die niet van een model afhangt.
      const schoon = zonderHerhaling([], nieuw);
      if (schoon.length !== nieuw.length) {
        console.warn(`[dialogue-chat] ronde ${ronde}: herhaling weggegooid (${nieuw.length} → ${schoon.length} scènes)`);
      }

      // Het is een UITBREIDING: korter terugkrijgen betekent dat het model het
      // verhaal heeft ingekort in plaats van uitgewerkt. Dan liever het origineel,
      // want inkorten is precies wat we hier proberen te repareren.
      const nieuweDuur = schatDuur(schoon);
      if (nieuweDuur <= duur) {
        console.warn(`[dialogue-chat] ronde ${ronde}: kwam korter terug (${Math.round(duur)}s → ${Math.round(nieuweDuur)}s); origineel behouden`);
        break;
      }
      huidig = knipOpMaat(schoon, doel);
    } catch (e) {
      console.error("[dialogue-chat] op lengte brengen mislukt:", e);
      break;
    }
  }
  return huidig;
}

/**
 * Te lang geworden? Haal er muziekbeelden uit het MIDDEN uit.
 *
 * Bewust niet achteraan snoeien: daar staat het slot, en een video die vlak voor
 * het einde ophoudt is erger dan een video van tien seconden te lang. Muziek-
 * beelden zonder gesproken tekst zijn het minst dragend voor het verhaal, dus die
 * gaan als eerste. Blijft het dan nog te lang, dan laten we het zo — liever iets
 * over de tijd dan een verhaal met een gat erin.
 */
function knipOpMaat(scenes: DialogueScene[], doel: number): DialogueScene[] {
  if (schatDuur(scenes) <= doel * 1.1) return scenes;

  const uit = scenes.map((s) => ({ ...s, lines: [...s.lines] }));
  const eerste = Math.max(1, Math.floor(uit.length * 0.25));
  const laatste = Math.max(eerste, Math.floor(uit.length * 0.85));

  for (let i = laatste; i >= eerste && schatDuur(uit) > doel * 1.1; i--) {
    const scene = uit[i];
    if (!scene) continue;
    for (let j = scene.lines.length - 1; j >= 0 && schatDuur(uit) > doel * 1.1; j--) {
      const l = scene.lines[j];
      if (l.kind === "actie" && !(l.text ?? "").trim() && scene.lines.length > 1) {
        scene.lines.splice(j, 1);
      }
    }
  }
  return uit.filter((s) => s.lines.length > 0);
}

/**
 * Eindredactie op de gesproken zinnen: de flauwe eruit.
 *
 * Draait als LAATSTE, want elke stap hiervoor schrijft zelf ook zinnen. Raakt
 * bewust niets anders aan dan de tekst — hetzelfde aantal regels, dezelfde
 * sprekers, dezelfde actiebeelden. Klopt daar iets niet aan wat terugkomt, dan
 * houden we het origineel: een iets te braaf verhaal is beter dan een verhaal
 * waar de eindredacteur de helft uit gesloopt heeft.
 */
async function scherpDialoogAan(
  scenes: DialogueScene[],
  cast: DialogueCastMember[],
  taal: string,
  kern?: string | null,
  wending?: string | null,
  verhaallijn?: string
): Promise<DialogueScene[]> {
  const gesproken = scenes.reduce((a, s) => a + s.lines.filter((l) => (l.text ?? "").trim()).length, 0);
  if (gesproken === 0) return scenes;

  const naarCastId = maakVertaler(cast);
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      // Hoger dan de andere opruimstappen: dit is de enige stap die iets moet
      // BEDENKEN in plaats van controleren. Op 0.4 kwamen dezelfde brave zinnen terug.
      temperature: 0.9,
      max_tokens: 12000,
      tools: [HERZIE_DRAAIBOEK_TOOL],
      tool_choice: { type: "function", function: { name: HERZIE_DRAAIBOEK_TOOL.function.name } },
      messages: [
        { role: "system", content: buildAanscherpSysteem(toonDraaiboek(cast, scenes), taal, kern, wending, verhaallijn) },
        { role: "user", content: "Geef het volledige draaiboek terug met de aangescherpte zinnen." },
      ],
    });
    const call = completion.choices[0]?.message?.tool_calls?.[0];
    if (!call) return scenes;

    const uit = JSON.parse(call.function.arguments || "{}") as { scenes?: RuweScene[] };
    const ruwe = Array.isArray(uit.scenes) ? uit.scenes : [];
    if (ruwe.length !== scenes.length) {
      console.warn(`[dialogue-chat] eindredactie gaf ${ruwe.length} van ${scenes.length} scènes terug; origineel behouden`);
      return scenes;
    }

    // Alleen de TEKST overnemen, regel voor regel op zijn plek. Zo kan deze stap
    // per definitie geen actiebeeld laten sneuvelen, geen spreker omdraaien en
    // geen scène kwijtraken — de valkuilen waar eerdere modelstappen in liepen.
    const nieuw = scenes.map((scene, i) => {
      const bron = ruwe[i]?.lines ?? [];
      if (bron.length !== scene.lines.length) return scene;
      return {
        ...scene,
        lines: scene.lines.map((l, j) => {
          const nieuweTekst = (bron[j]?.text ?? "").trim();
          // Een regel zonder tekst houdt geen tekst, en een regel mét tekst
          // verliest hem niet: dat zou een stille dialoogregel opleveren.
          if (!(l.text ?? "").trim() || !nieuweTekst) return l;
          // De spreker moet dezelfde blijven; anders komt de stem uit de
          // verkeerde mond en is alle sprekercontrole voor niets geweest.
          if (naarCastId(bron[j]?.characterId) !== l.characterId) return l;
          return { ...l, text: nieuweTekst };
        }),
      };
    });

    const veranderd = nieuw.reduce(
      (a, s, i) => a + s.lines.filter((l, j) => l.text !== scenes[i].lines[j].text).length, 0
    );
    console.log(`[dialogue-chat] eindredactie: ${veranderd} van ${gesproken} zinnen herschreven`);
    return nieuw;
  } catch (e) {
    console.error("[dialogue-chat] eindredactie mislukt:", e);
    return scenes;
  }
}

/**
 * Zorgt dat een deel van de regels ILLUSTREERD wordt in plaats van als pratende
 * koppen in beeld te komen.
 *
 * De assistent schrijft uit zichzelf actiebeelden, maar de eindredactie en de
 * aanvullus laten ze sneuvelen: een draaiboek van achttien regels kwam uit op nul.
 * Dan staan twee mensen de hele video tegenover elkaar, en dat is precies wat een
 * video dood maakt.
 *
 * We zetten bestaande regels OM in plaats van scènes toe te voegen. De gesproken
 * tekst blijft exact staan — alleen zie je iets anders terwijl hij klinkt. Daardoor
 * verandert de lengte niet en hoeft er niets opnieuw ingesproken te worden.
 */
async function voegIllustratiesToe(
  scenes: DialogueScene[],
  cast: DialogueCastMember[],
  doelAandeel = 0.35
): Promise<DialogueScene[]> {
  const totaal = scenes.reduce((a, s) => a + s.lines.length, 0);
  if (totaal < 4) return scenes;
  const nu = scenes.reduce((a, s) => a + s.lines.filter((l) => l.kind === "actie").length, 0);
  const gewenst = Math.round(totaal * doelAandeel);
  const tekort = gewenst - nu;
  if (tekort <= 0) return scenes;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: 4000,
      tools: [ILLUSTREER_TOOL],
      // Afdwingen: een tekstantwoord is hier nooit bruikbaar, en juist dáár ging
      // het bij de aanvullus al twee keer mis.
      tool_choice: { type: "function", function: { name: ILLUSTREER_TOOL.function.name } },
      messages: [
        { role: "system", content: buildIllustreerSysteem(toonDraaiboek(cast, scenes), tekort) },
        { role: "user", content: `Wijs ${tekort} regels aan om te illustreren.` },
      ],
    });
    const call = completion.choices[0]?.message?.tool_calls?.[0];
    if (!call) return scenes;

    const uit = JSON.parse(call.function.arguments || "{}") as {
      regels?: { scene?: number; regel?: number; actie?: string }[];
    };
    const nieuw = structuredClone(scenes);
    let omgezet = 0;

    for (const r of uit.regels ?? []) {
      const si = (r.scene ?? 0) - 1;
      const li = (r.regel ?? 0) - 1;
      const actie = (r.actie ?? "").trim();
      const regel = nieuw[si]?.lines?.[li];
      // Alleen echte dialoogregels omzetten, en nooit meer dan gevraagd.
      if (!regel || !actie || regel.kind === "actie" || !regel.text.trim()) continue;
      if (omgezet >= tekort) break;
      regel.kind = "actie";
      regel.actie = actie;
      regel.verband = "de stem loopt door terwijl dit beeld toont waar het over gaat";
      omgezet++;
    }
    return omgezet > 0 ? nieuw : scenes;
  } catch (e) {
    console.error("[dialogue-chat] illustraties toevoegen mislukt:", e);
    return scenes;
  }
}

/**
 * Het gewone draaiboek: één aanroep die het hele plan schrijft, of een wedervraag stelt.
 * Levert óf een plan, óf een antwoord voor de gebruiker.
 */
async function vraagPlan(
  berichten: Bericht[],
  voorPrompt: BibliotheekItem[],
  gewensteLengte: number,
  opzetVoorPrompt: VastgesteldeOpzet | null,
): Promise<{ plan?: RuwPlan; reply: string }> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7,
    max_tokens: 8000,
    tools: [DRAAIBOEK_TOOL],
    messages: [
      { role: "system", content: buildChatSysteem(voorPrompt, gewensteLengte, opzetVoorPrompt) },
      ...berichten.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

  const keuze = completion.choices[0]?.message;
  let toolCall = keuze?.tool_calls?.[0];

  // Geen tool-aanroep betekent normaal: de assistent heeft een wedervraag. Maar
  // bij een uitgebreide briefing schreef hij in plaats daarvan een heel verhaal
  // uit — "### Keuzes", "### Draaiboek" — en dan blijft de gebruiker met lege
  // handen achter. Een échte vraag is kort en eindigt met een vraagteken; een
  // uitgeschreven plan niet. Ziet het er zo uit, dan vragen we het nog één keer
  // en dwingen we de functie-aanroep af.
  if (!toolCall) {
    const tekst = (keuze?.content ?? "").trim();
    const isVraag = tekst.includes("?") && tekst.length < 600;
    if (!isVraag && tekst.length > 0) {
      console.warn("[dialogue-chat] model beschreef zijn plan in plaats van het te maken; forceer de aanroep");
      const nogmaals = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.7,
        max_tokens: 8000,
        tools: [DRAAIBOEK_TOOL],
        tool_choice: { type: "function", function: { name: DRAAIBOEK_TOOL.function.name } },
        messages: [
          { role: "system", content: buildChatSysteem(voorPrompt, gewensteLengte, opzetVoorPrompt) },
          ...berichten.map((m) => ({ role: m.role, content: m.content })),
        ],
      });
      toolCall = nogmaals.choices[0]?.message?.tool_calls?.[0];
    }
  }

  if (!toolCall) {
    return { reply: keuze?.content?.trim() || "Kun je dat iets uitgebreider beschrijven?" };
  }
  try {
    return { plan: JSON.parse(toolCall.function.arguments || "{}") as RuwPlan, reply: "" };
  } catch {
    return { reply: "Ik kreeg mijn eigen plan niet rond. Kun je het nog eens proberen?" };
  }
}

/**
 * HET EIGEN VERHAAL VAN DE GEBRUIKER, moment voor moment geschreven.
 *
 * Eén aanroep die alle twaalf momenten van de Wonderwagen tegelijk uitschreef, voegde
 * er onderweg twee samen, liet de deelnummers verschuiven (de vraag "Kunnen we echt
 * overal naartoe?" viel vóór de onthulling van de wagen), en de verlengstap verzon
 * er een markt en een gids bij. Per moment een eigen, kleine aanroep kan dat niet:
 * de volgorde ligt vast, elk moment krijgt precies zijn eigen zinnen, en er is geen
 * ruimte om iets anders te gaan vertellen. Ze lopen tegelijk, dus het duurt niet langer.
 */
async function schrijfMomenten(opzet: DialogueSetup, gewensteLengte: number): Promise<RuweScene[]> {
  const lijn = opzet.verhaallijn ?? [];
  const taal = opzet.language || "Nederlands";
  const perMoment = scenesPerDeel(planVoorLengte(gewensteLengte).regels, lijn.length, false);
  const persoon = (characterId: string) => opzet.cast.find((c) => c.characterId === characterId);
  const naarCastId = maakVertaler(opzet.cast);
  // De beschrijvingen uit de opzet. Een moment kreeg ze letterlijk als gesproken
  // tekst: "Enthousiast en nieuwsgierig, stelt veel vragen" klonk uit Tyrells mond.
  const castTeksten = opzet.cast
    .flatMap((c) => [c.spraak, c.wil, c.role, c.appearance, c.kleding])
    .filter((t): t is string => !!t && t.trim().length > 0);
  const castBlok = opzet.cast
    .map((c) => `- id "${c.id}" = ${c.name}${c.role ? ` (${c.role})` : ""}${c.leeftijd ? `, ${c.leeftijd}` : ""}${c.spraak ? `; praat: ${c.spraak}` : ""}`)
    .join("\n");
  // Het overzicht zonder de letterlijke zinnen: met die zinnen erin schreef de
  // aanroep voor moment 1 de zinnen van moment 2 alvast op, en viel moment 2 daarna
  // als herhaling weg.
  const overzicht = lijn.map((d, i) => `${i + 1}. ${deelLabel(d, i)} — ${d.wat}`).join("\n");

  const perDeel = await Promise.all(
    lijn.map(async (d, i): Promise<RuweScene[]> => {
      const citaten = (d.citaten ?? [])
        .map((c) => { const p = persoon(c.wie); return p ? `- ${p.name} [${p.id}]: "${c.tekst}"` : ""; })
        .filter(Boolean);
      const inBeeld = d.wie.map((id) => persoon(id)).filter((p): p is NonNullable<typeof p> => !!p).map((p) => `${p.name} [${p.id}]`).join(", ");
      const aantalRegels = Math.max(perMoment[i] ?? 2, (d.verteller ? 1 : 0) + citaten.length + 1);

      // Mislukt een moment, dan blijft er in elk geval staan wat vastligt: de
      // vertellerzin en de letterlijke zinnen. Een moment dat stilletjes wegvalt is
      // precies wat de gebruiker niet mag overkomen.
      const noodScene: RuweScene = {
        deel: i + 1,
        setting: d.plek,
        lines: [
          ...(d.verteller || d.wat ? [{ kind: "dialoog", characterId: VERTELLER_ID, text: d.verteller || d.wat, emotion: "" }] : []),
          ...(d.citaten ?? []).flatMap((c) => { const p = persoon(c.wie); return p ? [{ kind: "dialoog", characterId: p.id, text: c.tekst, emotion: "neutraal" }] : []; }),
        ],
      };

      try {
        // Hooguit twee pogingen. De tweede alleen als het eerste antwoord aantoonbaar
        // fout is (Engelse zinnen, geen personage dat iets zegt), met die fouten
        // erbij. Klopt het meteen, dan kost dit niets extra.
        let feedback: string | null = null;
        for (let poging = 1; ; poging++) {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            temperature: 0.6,
            max_tokens: 2500,
            tools: [HERZIE_DRAAIBOEK_TOOL],
            tool_choice: { type: "function", function: { name: HERZIE_DRAAIBOEK_TOOL.function.name } },
            messages: [
              {
                role: "system",
                content: buildMomentSysteem({
                  bron: opzet.text, overzicht, castBlok, nummer: i + 1, totaal: lijn.length,
                  voorwerpen: (opzet.voorwerpen ?? []).map((v) => `- ${v.naam}: ${v.uiterlijk}`).join("\n"),
                  label: deelLabel(d, i), moment: d, inBeeld, citaten, aantalRegels, taal,
                }),
              },
              { role: "user", content: `Schrijf moment ${i + 1}: ${deelLabel(d, i)}.` },
              ...(feedback ? [{ role: "user" as const, content: feedback }] : []),
            ],
          });
          const call = completion.choices[0]?.message?.tool_calls?.[0];
          const uit = JSON.parse(call?.function.arguments || "{}") as { scenes?: RuweScene[] };
          const scenes = (uit.scenes ?? []).slice(0, 2).map((s) => ({ ...s, deel: i + 1 }));
          const ruw = scenes.flatMap((s) => s.lines ?? []);
          const onbekend = ruw.filter((l) => !naarCastId(l.characterId)).map((l) => `"${l.characterId ?? ""}"`);
          console.log(
            `[dialogue-chat] moment ${i + 1} (${deelLabel(d, i)}) poging ${poging}: ${scenes.length} scènes, ${ruw.length} regels, ` +
            `verteller ${ruw.filter((l) => (l.characterId ?? "").toLowerCase() === VERTELLER_ID).length}, ` +
            `actiebeeld zonder beschrijving ${ruw.filter((l) => l.kind === "actie" && !(l.actie ?? "").trim()).length}, ` +
            `onbekende spreker ${onbekend.length}${onbekend.length ? ` (${[...new Set(onbekend)].join(", ")})` : ""}`
          );
          const problemen = momentProblemen(ruw, taal, castTeksten);
          if (problemen.length && poging < 2) {
            console.warn(`[dialogue-chat] moment ${i + 1} opnieuw: ${problemen.join(" | ")}`);
            feedback =
              `Je vorige versie klopte niet:\n- ${problemen.join("\n- ")}\n` +
              `Schrijf moment ${i + 1} helemaal opnieuw, met deze punten opgelost en alle andere regels nog steeds gevolgd.`;
            continue;
          }
          if (problemen.length) console.warn(`[dialogue-chat] moment ${i + 1} blijft na poging 2: ${problemen.join(" | ")}`);
          const schoon = scenes.map((s) => ({ ...s, lines: zonderVerkeerdeTaal(s.lines ?? [], taal, castTeksten) }));
          return schoon.some((s) => s.lines.length) ? schoon : [noodScene];
        }
      } catch (e) {
        console.error(`[dialogue-chat] moment ${i + 1} schrijven mislukt:`, e);
        return noodScene.lines?.length ? [noodScene] : [];
      }
    }),
  );

  // Een moment bevat alleen zijn EIGEN letterlijke zinnen. Ziet het model er toch
  // een van een ander moment in staan, dan gaat die eruit; zorgVoorCitaten zet hem
  // daarna bij het goede moment.
  const citaatVan = lijn
    .flatMap((d, i) => (d.citaten ?? []).map((c) => ({ i, tekst: kaalTekst(c.tekst) })))
    .filter((c) => c.tekst.length >= 8);
  perDeel.forEach((scenes, i) => scenes.forEach((s) => {
    s.lines = (s.lines ?? []).filter((l) => !citaatVan.some((c) => c.i !== i && kaalTekst(l.text).includes(c.tekst)));
  }));

  // Momenten op dezelfde plek krijgen dezelfde omgeving, woord voor woord. De
  // aanroepen lopen tegelijk en zien elkaars beschrijving niet; zonder dit werd
  // oma's woonkamer in moment 1 en moment 2 twee verschillende kamers.
  const eersteOmgeving = new Map<string, string>();
  lijn.forEach((d, i) => {
    const plek = kaalTekst(d.plek);
    const eigen = perDeel[i]?.[0]?.setting?.trim();
    if (!plek || !eigen) return;
    const eerder = eersteOmgeving.get(plek);
    if (eerder) perDeel[i].forEach((s) => { s.setting = eerder; });
    else eersteOmgeving.set(plek, eigen);
  });

  return perDeel.flat();
}

/** Muziek bij de toon, voor een draaiboek dat niet uit de grote schrijfaanroep komt. */
const muziekBijToon = (toon?: string) => (toon === "zakelijk" ? "zakelijk" : toon === "energiek" ? "actie" : "vrolijk");

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

    const body = (await req.json()) as Body;
    const berichten = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      // Alleen de laatste beurten meesturen; een lang gesprek hoeft niet volledig mee.
      .slice(-20);
    if (berichten.length === 0) {
      return NextResponse.json({ error: "Geen bericht" }, { status: 400 });
    }

    const opzet = body.setup ?? null;
    const gewensteLengte = Math.max(
      VIDEO_MIN_SEC,
      Math.min(VIDEO_MAX_SEC, Math.round(opzet?.targetSeconds ?? body.targetSeconds ?? VIDEO_STANDAARD_SEC))
    );
    // Wat het model over de opzet moet weten: de vaste cast, de kern en de wending.
    const opzetVoorPrompt = opzet
      ? {
          title: opzet.title,
          kern: opzet.kern,
          wending: opzet.wending,
          tone: opzet.tone,
          angle: opzet.angle,
          language: opzet.language,
          keepTerms: opzet.keepTerms,
          avoidTerms: opzet.avoidTerms,
          cast: opzet.cast.map((c) => ({
            id: c.id, characterId: c.characterId, name: c.name, role: c.role, leeftijd: c.leeftijd, wil: c.wil, spraak: c.spraak,
          })),
          verhaallijn: opzet.verhaallijn ?? null,
          modus: opzet.modus ?? null,
        }
      : null;

    const { data: personages } = await supabase
      .from("characters")
      .select("id, name, description, gender, age_range, image_url")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    const bibliotheek = (personages ?? []).filter((c) => c.image_url);
    const voorPrompt: BibliotheekItem[] = bibliotheek.map((c) => ({
      id: c.id, name: c.name, description: c.description, gender: c.gender, age_range: c.age_range,
    }));

    // Het eigen verhaal van de gebruiker wordt moment voor moment geschreven; een
    // idee gaat door de gewone schrijfaanroep. Zie schrijfMomenten.
    const volgOpzet = opzet?.modus === "volgen" && (opzet.verhaallijn ?? []).length > 0 ? opzet : null;
    let plan: RuwPlan;
    if (volgOpzet) {
      plan = {
        toelichting:
          `Ik heb je verhaal moment voor moment uitgewerkt: ${(volgOpzet.verhaallijn ?? []).length} momenten, ` +
          "in jouw volgorde en met je eigen zinnen letterlijk erin.",
        muziekCategorie: muziekBijToon(volgOpzet.tone),
        scenes: await schrijfMomenten(volgOpzet, gewensteLengte),
      };
    } else {
      const uitkomst = await vraagPlan(berichten, voorPrompt, gewensteLengte, opzetVoorPrompt);
      if (!uitkomst.plan) return NextResponse.json({ reply: uitkomst.reply });
      plan = uitkomst.plan;
    }

    // De opzet wint van het model. Het model schrijft de scènes; wélke mensen
    // erin staan, waar het gesprek naartoe werkt en hoe het eruitziet heeft de
    // gebruiker al vastgesteld. Zonder deze regel zou een opzet die je zelf hebt
    // bijgesteld alsnog stilzwijgend overschreven worden door het voorstel.
    if (opzet) {
      plan = {
        ...plan,
        title: opzet.title || plan.title,
        kern: opzet.kern || plan.kern,
        wending: opzet.wending || plan.wending,
        tone: opzet.tone || plan.tone,
        language: opzet.language || plan.language,
        format: opzet.format || plan.format,
        styleId: opzet.styleId || plan.styleId,
        illustrationBrief: opzet.illustrationBrief || plan.illustrationBrief,
        targetSeconds: opzet.targetSeconds ?? plan.targetSeconds,
        cast: opzet.cast.map((c) => ({
          id: c.id,
          characterId: c.characterId,
          name: c.name,
          role: c.role,
          leeftijd: c.leeftijd ?? undefined,
          wil: c.wil ?? undefined,
          spraak: c.spraak ?? undefined,
          kleding: c.kleding ?? undefined,
          portraitUrl: c.portraitUrl,
          nieuw: c.nieuw ?? null,
          bibliotheekId: c.bibliotheekId ?? null,
          soort: c.soort ?? null,
          appearance: c.appearance ?? undefined,
          voice: c.voice,
          position: c.position,
        })),
      };
    }

    const { spec, probleem } = maakSpec(plan, bibliotheek);
    if (!spec) {
      return NextResponse.json({ reply: `${probleem} Kun je aangeven welke personages je wilt gebruiken?` });
    }

    telRegels("plan van het model", spec.scenes);

    // De verhaallijn uit de opzet reist mee in de spec, zodat een latere
    // aanpassing binnen hetzelfde verhaal blijft. Alleen personages die echt in de
    // cast staan mogen erin voorkomen.
    const verhaallijn = normaliseerVerhaallijn(opzet?.verhaallijn, spec.cast.map((c) => c.characterId));
    if (verhaallijn.length) spec.verhaallijn = verhaallijn;
    // Als tekst voor elke stap die hierna nog schrijft. Zonder de lijn erbij
    // "verbeterde" de eindredactie het verhaal weer terug tot een gesprek.
    const lijnTekst = verhaallijnBlok(spec.verhaallijn, spec.cast) || undefined;
    // Het eigen verhaal van de gebruiker: geen enkele stap hierna mag er iets bij
    // verzinnen of zijn zinnen "aanscherpen".
    const volg = opzet?.modus === "volgen" && verhaallijn.length > 0;
    spec.verhaalModus = opzet?.modus ?? null;
    const voorwerpen = (opzet?.voorwerpen ?? [])
      .filter((v) => v.naam?.trim() && v.uiterlijk?.trim())
      // Een voorwerp uit de bibliotheek houdt zijn blad: daarom is hij in elke video
      // hetzelfde. Hier stond bladUrl vast op null.
      .map((v) => ({
        naam: v.naam.trim(), uiterlijk: v.uiterlijk.trim(), bladUrl: v.bladUrl ?? null,
        bibliotheekId: v.bibliotheekId ?? null, voorbeeldUrl: v.voorbeeldUrl ?? null,
      }))
      .slice(0, 4);
    spec.voorwerpen = voorwerpen.length ? voorwerpen : null;

    // Ook het EERSTE plan kan zichzelf al herhalen; dan hoort de aanvullus dat
    // gat te vullen met iets nieuws in plaats van er nog een kopie bij te doen.
    spec.scenes = langsVerhaal(zonderHerhaling([], spec.scenes), spec.verhaallijn, spec.cast);
    telRegels("langs de verhaallijn", spec.scenes);

    // Twee opruimrondes die het model zelf niet betrouwbaar doet. Ze draaien alleen
    // als er echt iets mis is, dus meestal kosten ze niets.
    await Promise.all([
      schrijfGetallenVoluit(spec.scenes, spec.language ?? "Nederlands"),
      schoonSettings(spec.scenes, spec.cast),
    ]);

    // EERST de samenhang, DAARNA op lengte brengen.
    //
    // Andersom ging het mis: de aanvullus bracht het draaiboek keurig op lengte,
    // waarna de eindredactie alle scènes herschreef en er de helft uit snoeide.
    // Een gebruiker die op "1 minuut" klikte kreeg zo dertig seconden. Het laatste
    // woord over de lengte hoort bij de stap die over lengte gaat.
    // Niet bij het eigen verhaal van de gebruiker: dat is moment voor moment
    // geschreven, en de volgorde ligt vast. Deze controle mag scènes verplaatsen en
    // toevoegen, en dat is daar precies wat niet mag.
    if (!volg) spec.scenes = await controleerSamenhang(spec.scenes, spec.cast, spec.language ?? "Nederlands", lijnTekst, volg);
    telRegels("na samenhang", spec.scenes);
    // Ook niet bij het eigen verhaal: de verlengstap verzon er bij de Wonderwagen,
    // ondanks het verbod, een markt en een plaatselijke gids bij. De lengte volgt
    // daar uit het aantal regels per moment.
    if (!volg) spec.scenes = await brengOpLengte(
      spec.scenes,
      spec.cast,
      spec.language ?? "Nederlands",
      gewensteLengte,
      // De uitgebreidste beurt van de gebruiker is zijn briefing; korte
      // tussenzinnen ("ja, ga verder") zeggen niets over wat hij wil zien.
      berichten.filter((m) => m.role === "user").map((m) => m.content).sort((a, b) => b.length - a.length)[0],
      spec.kern,
      spec.wending,
      lijnTekst,
      volg
    );
    telRegels("na op lengte", spec.scenes);

    // ALS LAATSTE: zorgen dat er genoeg geïllustreerd wordt. Dit staat bewust
    // achteraan, want alle stappen hiervoor kunnen actiebeelden laten sneuvelen.
    spec.scenes = await voegIllustratiesToe(spec.scenes, spec.cast);
    telRegels("na illustraties", spec.scenes);

    // ALLERLAATST: de eindredactie over de gesproken zinnen. Hierna schrijft
    // niets meer, dus wat hier goed komt blijft goed.
    //
    // NIET bij het eigen verhaal van de gebruiker. Deze redacteur herschrijft
    // bewust de meeste zinnen en zoekt wrijving; bij de Wonderwagen zou hij "Kunnen
    // we echt overal naartoe?" vervangen door iemand die tegensputtert.
    if (!volg) {
      spec.scenes = await scherpDialoogAan(
        spec.scenes, spec.cast, spec.language ?? "Nederlands", spec.kern, spec.wending, lijnTekst
      );
    }

    // Het eigen verhaal van de gebruiker als één doorlopend verhaal. Hier, omdat
    // alle stappen die zinnen schrijven dan geweest zijn.
    if (volg) {
      const castTeksten = spec.cast
        .flatMap((c) => [c.spraak, c.wil, c.role, c.appearance, c.kleding])
        .filter((t): t is string => !!t && t.trim().length > 0);
      spec.scenes = await redigeerEigenVerhaal(
        spec.scenes, spec.cast, spec.language ?? "Nederlands", lijnTekst, spec.verhaallijn, castTeksten,
      );
      telRegels("na verhaalredactie", spec.scenes);
    }

    // Laatste zeef over het HELE draaiboek. Elke stap hierboven laat een model
    // scènes schrijven, en elk van die stappen kan herhalen. Twee keer hetzelfde
    // verhaal is het ergste wat er uit deze tool kan komen — de gebruiker betaalt
    // per beeld — dus dit staat er als vangnet achter, na alles.
    const voorZeef = spec.scenes.length;
    spec.scenes = zonderHerhaling([], spec.scenes);
    if (spec.scenes.length !== voorZeef) {
      console.warn(`[dialogue-chat] eindzeef: ${voorZeef} → ${spec.scenes.length} scènes`);
    }

    // Nog één keer langs de verhaallijn, want elke modelstap hierboven kan scènes
    // opgesplitst of de verteller eruit geschreven hebben. Daarna nieuwe id's: de
    // stappen hierboven hergebruikten id's op volgorde, en na een ingevoegde scène
    // konden er twee dezelfde ontstaan.
    spec.scenes = langsVerhaal(spec.scenes, spec.verhaallijn, spec.cast).map((s, i) => ({ ...s, id: `scene-${i}` }));
    // Pas hierna: langsVerhaal kan nog vertellerbeelden met een algemene
    // beschrijving hebben toegevoegd.
    await beeldBijZin(spec.scenes);
    telRegels("klaar", spec.scenes);

    // De gebruiker heeft de lengte gekozen; die is leidend, niet wat het model
    // ervan maakte. Hij hoort ook bij de spec, zodat een herziening dezelfde maat
    // aanhoudt in plaats van er stilletjes een andere video van te maken.
    const targetSeconds = gewensteLengte;
    spec.targetSeconds = targetSeconds;
    return NextResponse.json({
      reply: (plan.toelichting ?? "").trim() || "Ik heb het draaiboek uitgewerkt.",
      spec,
      targetSeconds,
      tone: ["zakelijk", "speels", "energiek"].includes(plan.tone ?? "") ? plan.tone : "zakelijk",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-chat failed:", msg);
    return NextResponse.json({ error: "Assistent kon niet antwoorden", detail: msg }, { status: 500 });
  }
}
