// DE OPZET UITWERKEN — goedkope tekstcalls die van een idee of een uitgewerkt
// verhaal een compleet ingevuld voorstel maken: de VERHAALLIJN, titel, kern,
// wending, toon, tekenstijl, beeldregie en een rolverdeling uit de eigen
// personagebibliotheek.
//
// Waarom een aparte route en niet gewoon het draaiboek: een draaiboek is duur en
// staat vast zodra het er is. Dit voorstel is goedkoop, leesbaar in tien seconden
// en volledig aanpasbaar. Je regisseert dus vóór het schrijven in plaats van
// achteraf te corrigeren op een script dat er al omheen geschreven is.
//
// Twee soorten invoer, twee soorten werk (zie verhaallijn.ts): een IDEE wordt een
// verhaal met vijf vaste delen; een UITGEWERKT VERHAAL wordt moment voor moment
// overgenomen, zonder er iets bij te verzinnen.
//
// Wat de gebruiker zelf al invulde is heilig; zie mergeCast in lib/dialogue-setup.
import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { openai } from "@/lib/openai";
import {
  bibliotheekVoorwerpTekst, koppelVoorwerpen, leesBibliotheekVoorwerp, tabelOntbreekt, type BibliotheekVoorwerp,
} from "@/lib/infographics/voorwerp-bibliotheek";
import { generateImageWithStyle } from "@/lib/image-gen";
import { DIALOOG_CREDITS } from "@/lib/infographics/dialoog-credits";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { illustratieContext } from "@/lib/infographics/dialogue-staging";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import { createClient } from "@/lib/supabase/server";
import { MAX_CAST, MAX_PER_SCENE, type DialogueCastMember } from "@/lib/infographics/dialogue-schema";
import { mergeCast, hernoemIds, type DialogueSetup, type VastCastLid } from "@/lib/infographics/dialogue-setup";
import {
  FASEN,
  MAX_DELEN,
  isUitgewerktVerhaal,
  isVerhaalModus,
  normaliseerVerhaallijn,
  ontbrekendeNamen,
  ontbrekendeRollen,
  verhaalProblemen,
  type VerhaalDeel,
  type VerhaalModus,
} from "@/lib/infographics/verhaallijn";
import { STORY_STYLE_PRESETS, DEFAULT_STORY_STYLE, buildIllustrationPrompt } from "@/lib/infographics/story-style";
import { STORY_VOICES } from "@/lib/infographics/story-voices";
import type { Character } from "@/lib/types";

export const runtime = "nodejs";
// Meerdere tekstcalls achter elkaar (voorstel, casting, redactie of aanvullen)
// passen niet betrouwbaar in een minuut.
export const maxDuration = 300;

// Een uitgewerkt verhaal uit ChatGPT, met de lijsten van personages, voorwerpen en
// plekken erbij, is al gauw 10.000 tekens. Op 8000 vielen de laatste momenten er
// ongemerkt af.
const MAX_VERHAAL_TEKENS = 24000;

interface Body {
  topic?: string;
  text?: string;
  targetSeconds?: number;
  format?: "16:9" | "9:16";
  language?: string;
  /** Personages die de gebruiker zelf al vastlegde. Die liggen vast. */
  vasteCast?: VastCastLid[];
  /** Weglaten = zelf bepalen aan de hand van de tekst. */
  modus?: VerhaalModus;
}

type BibliotheekRij = Pick<Character, "id" | "name" | "description" | "gender" | "age_range" | "image_url">;

// Een VERZONNEN verhaal: precies vijf delen met een vaste fase.
const VERHAALLIJN_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["fase", "wat", "plek", "wie", "verteller"],
    properties: {
      fase: { type: "string", enum: [...FASEN] },
      wat: { type: "string" },
      plek: { type: "string" },
      wie: { type: "array", items: { type: "string" } },
      verteller: { type: "string" },
    },
  },
} as const;

// Een GEVOLGD verhaal: zoveel momenten als de tekst heeft, elk met een eigen naam.
// Bewust zonder fase: met "begin, probleem, tegenslag" in het schema gaat het model
// een tegenslag zoeken, ook in een verhaal waar er geen is.
const MOMENTEN_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["titel", "wat", "plek", "wie", "verteller", "citaten"],
    properties: {
      titel: { type: "string" },
      wat: { type: "string" },
      plek: { type: "string" },
      wie: { type: "array", items: { type: "string" } },
      verteller: { type: "string" },
      // De zinnen die de gebruiker zelf schreef. Die komen er later letterlijk in,
      // bij de juiste persoon; zie zorgVoorCitaten.
      citaten: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["wie", "tekst"],
          properties: { wie: { type: "string" }, tekst: { type: "string" } },
        },
      },
    },
  },
} as const;

// De VOLGORDE van de velden is hier niet willekeurig: het model vult ze van boven
// naar beneden in. Eerst het verhaal, dan pas wat het "betekent" en wie erin
// speelt. Andersom verzon het eerst een kernboodschap en schreef het daarna een
// verhaaltje dat die boodschap netjes uitlegde — zonder dat er iets gebeurde.
function setupSchema(verhaallijn: typeof VERHAALLIJN_SCHEMA | typeof MOMENTEN_SCHEMA) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "topic", "verhaallijn", "kern", "wending", "cast", "tone", "angle", "styleId", "illustrationBrief", "voorwerpen", "keepTerms", "avoidTerms"],
    properties: {
      title: { type: "string" },
      topic: { type: "string" },
      verhaallijn,
      kern: { type: "string" },
      wending: { type: "string" },
      cast: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["characterId", "nieuw", "naam", "soort", "uiterlijk", "role", "wil", "spraak", "kleding", "leeftijd", "voice"],
          properties: {
            characterId: { type: "string" },
            nieuw: { type: "boolean" },
            soort: { type: "string", enum: ["mens", "dier", "fantasiewezen"] },
            uiterlijk: { type: "string" },
            naam: { type: "string" },
            role: { type: "string" },
            wil: { type: "string" },
            spraak: { type: "string" },
            kleding: { type: "string" },
            leeftijd: { type: "string" },
            voice: { type: "string" },
          },
        },
      },
      tone: { type: "string", enum: ["zakelijk", "speels", "energiek"] },
      angle: { type: "string" },
      styleId: { type: "string" },
      illustrationBrief: { type: "string" },
      voorwerpen: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["naam", "uiterlijk", "bibliotheekId", "zoekwoorden"],
          // bibliotheekId: het id uit de voorwerpenbibliotheek, of leeg voor een nieuw voorwerp.
          // zoekwoorden: andere woorden voor dit ding, in beide talen (zie DialogueVoorwerp).
          properties: {
            naam: { type: "string" }, uiterlijk: { type: "string" }, bibliotheekId: { type: "string" },
            zoekwoorden: { type: "array", items: { type: "string" } },
          },
        },
      },
      keepTerms: { type: "array", items: { type: "string" } },
      avoidTerms: { type: "array", items: { type: "string" } },
    },
  };
}

const REDACTIE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["oordeel", "verhaallijn", "kern", "wending"],
  properties: {
    oordeel: { type: "string" },
    verhaallijn: VERHAALLIJN_SCHEMA,
    kern: { type: "string" },
    wending: { type: "string" },
  },
} as const;

// Eén voorbeeld van wat wél en niet een verhaal is. Bewust een ANDER onderwerp dan
// de kerstvideo die de aanleiding was: met kerst als voorbeeld schreef het model
// bij elk kerstverhaal het voorbeeld over.
const VERHAALLES = `WAT EEN VERHAAL IS — EN WAT NIET

Dit is GEEN verhaal:
  Noor vindt logeren bij opa eng. Opa zegt dat het gezellig wordt. Ze bakken pannenkoeken en Noor vindt het toch leuk.
Er zit niets in de weg, de oplossing komt meteen, en niemand hoeft iets te doen.

Dit WEL:
  begin — Noor pakt haar koffertje voor het eerste logeerpartijtje bij opa, en stopt stiekem haar nachtlampje in haar jaszak.
  probleem — Bij opa blijkt het lampje kapot in haar zak. Noor zegt niets, maar wil ineens naar huis "omdat ze buikpijn heeft".
  tegenslag — Opa probeert haar af te leiden met een spelletje. Noor verliest, wordt boos en gaat op de donkere trap zitten — precies de plek waar ze bang voor is.
  omslag — Noor pakt zelf opa's zaklamp van het nachtkastje en schijnt ermee de trap op. Boven blijkt opa óók een lampje aan te hebben: hij slaapt nooit in het donker. Noor laat hem haar kapotte lampje zien, en samen plakken ze het.
  slot — Noor slaapt met het geplakte lampje én opa's zaklamp. De volgende ochtend vraagt ze of ze volgend weekend weer mag komen.

Waarom dit werkt:
1. Iets zit in de weg, en de oplossing komt pas in de OMSLAG. Staat het antwoord al in het begin of het probleem, dan is er geen verhaal meer.
2. De tegenslag maakt het ERGER. Daar wordt nog niets opgelost.
3. Het belangrijkste moment gebeurt IN BEELD, tussen mensen die er zijn. Nooit via een telefoontje, een appje of "later hoorden ze dat".
4. Gaat het verhaal over iemand — papa, mama, oma, de juf — dan komt die persoon zelf in beeld en doet mee.
5. Eén concreet ding (het nachtlampje) komt terug en betekent in het slot iets anders dan aan het begin.
6. Twee of drie plekken voor het hele verhaal, en er wordt naar teruggekeerd.
7. De oplossing komt van de HOOFDPERSONEN zelf: ze durven iets, doen iets of zien iets in. Niet van toeval (een sneeuwstorm, een telefoontje, iets wat toevallig gebeurt) en niet van een volwassene die binnenloopt en het voor ze bedenkt. Noor pakt zelf de zaklamp.`;

// Het tegenovergestelde van VERHAALLES. Bij "Tyrell, Lilly en de Wonderwagen" gaf de
// gebruiker een compleet verhaal met een reis langs zeven plekken in Paramaribo;
// de verhaalles maakte er een verhaal met een verzonnen tegenslag van, en de hele
// reis werd één zin in het slot. Wie een verhaal bedenkt en er iets anders uit
// ziet komen, haakt af.
const VOLGLES = `JE VOLGT HET VERHAAL VAN DE GEBRUIKER
De gebruiker heeft zijn verhaal al geschreven. Jij bedenkt NIETS nieuws. Je knipt zijn verhaal op in momenten, in zijn volgorde, zodat er straks scènes van gemaakt kunnen worden. Wie een verhaal bedenkt en er iets anders uit ziet komen, raakt gefrustreerd — neem het dus over zoals het er staat.

- Elke gebeurtenis en elke plek uit de tekst wordt een eigen moment. Sla niets over, ook niet als het er veel zijn: bezoeken ze zeven plekken, dan zijn dat zeven momenten, en niet één moment "ze bezoeken de stad".
- Verzin geen tegenslag, geen ruzie, geen twijfel, geen probleem en geen andere afloop dan in de tekst staat.
- Elk moment speelt op de plek waar het in de tekst gebeurt. Staan ze volgens de tekst bij een fort, dan is de plek dat fort — niet de kamer waar het verhaal begon.
- Neem namen van plekken, gebouwen, voorwerpen en personen letterlijk over.
- Wie er volgens de tekst BIJ is, staat in "wie" — ook als die persoon alleen iets vertelt of uitlegt. Vertelt oma bij het fort over de geschiedenis, dan is oma bij het fort in beeld. In de eerste proef stond oma alleen thuis in beeld, terwijl ze in de tekst de hele reis meeging en overal uitleg gaf.
- Heeft de tekst meer dan ${MAX_DELEN} momenten, voeg dan kleine momenten die bij elkaar horen samen. Laat nooit een plek weg.`;

/**
 * Tekent een personage dat niet in de bibliotheek staat.
 *
 * Een verhaal over een prinses en draken kon niet gemaakt worden zolang elk
 * personage uit de bibliotheek moest komen. Het portret dat hier ontstaat is
 * precies wat een bibliotheekportret is: één personage, van voren, op een egale
 * achtergrond, in de tekenstijl van de video. Een credit, zoals een personage
 * tekenen in de bibliotheek. Mislukt het, dan krijg je hem terug.
 */
async function tekenPersonage(
  lid: DialogueCastMember,
  styleId: string,
  language: string,
  brief: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  // Voorbereiding voor het storyboard, dus gratis (dialoog-credits.ts).
  const credit = await deductCredits(userId, DIALOOG_CREDITS.VOORBEREIDING, `Personage tekenen: ${lid.name}`);
  if (!credit.success) return null;
  try {
    const beschrijving = [
      `${lid.name}${lid.leeftijd ? `, ${lid.leeftijd}` : ""}.`,
      (lid.appearance ?? "").trim(),
      (lid.kleding ?? "").trim() ? `Wearing: ${(lid.kleding ?? "").trim()}.` : "",
    ].filter(Boolean).join(" ");
    const opdracht =
      `A character portrait for an animated children's story. ${beschrijving} ` +
      `One single character, seen from the front from head to knees, standing, with a friendly neutral ` +
      `expression, on a plain light neutral background. No other characters, no text, no frames.`;
    const { imageUrl } = await generateImageWithStyle({
      prompt: buildIllustrationPrompt(opdracht, styleId, language),
      format: "9:16",
      visualStyle: null,
      extraContext: illustratieContext(brief),
    });
    return await persistFalAssetSoft(supabase, userId, imageUrl, "image");
  } catch (e) {
    console.error(`[dialogue-setup] personage ${lid.name} tekenen mislukt:`, e);
    if (DIALOOG_CREDITS.VOORBEREIDING > 0) {
      await addCredits(userId, DIALOOG_CREDITS.VOORBEREIDING, "Refund: personage tekenen").catch(() => {});
    }
    return null;
  }
}

function bibliotheekTekst(bibliotheek: Pick<Character, "id" | "name" | "description" | "gender" | "age_range">[]): string {
  return bibliotheek.length
    ? bibliotheek
        .map((c) => `- id "${c.id}": ${c.name}${c.gender ? `, ${c.gender}` : ""}${c.age_range ? `, ${c.age_range}` : ""}${c.description ? ` — ${c.description}` : ""}`)
        .join("\n")
    : "(de gebruiker heeft nog geen personages met een afbeelding)";
}

function castTekstVoor(cast: DialogueCastMember[]): string {
  return cast
    .map((c) => `- id "${c.characterId}": ${c.name}${c.role ? ` — ${c.role}` : ""}${c.wil ? `; wil: ${c.wil}` : ""}`)
    .join("\n");
}

// Welk soort stem bij een rol hoort. De stem kiezen we zelf in plaats van het
// model: dat gaf eerder dubbele stemmen, die mergeCast dan leeggooit, waarna de
// knop "schrijf het draaiboek" geblokkeerd bleef tot je zelf een stem koos.
const STEMSOORT: Record<string, RegExp> = {
  Papa: /mannenstem/i,
  Opa: /mannenstem/i,
  Mama: /vrouwenstem/i,
  Oma: /vrouwenstem/i,
};

/**
 * Wie het verhaal nodig heeft maar door niemand gespeeld wordt, alsnog casten.
 *
 * De opzet-call kreeg de opdracht om bij ontbrekende ouders een passende
 * volwassene "Papa" te laten spelen, en deed dat twee proeven op rij niet: zonder
 * personage dat letterlijk zo heet koos hij oma. De redactie schreef de ouders
 * daarna netjes uit het verhaal — precies de klacht over de kerstvideo ("ze gaan
 * niet naar hun ouders"). Eén kleine call met één vraag, "wie speelt papa?", doet
 * het wél. Hij draait alleen als er echt een rol ontbreekt.
 */
async function casteerRollen(
  rollen: string[],
  bibliotheek: BibliotheekRij[],
  cast: DialogueCastMember[],
  briefing: string,
  language: string,
): Promise<DialogueCastMember[]> {
  const bezet = new Set(cast.map((c) => c.characterId));
  const vrij = bibliotheek.filter((c) => !bezet.has(c.id) && c.image_url);
  const teCasten = rollen.slice(0, Math.max(0, MAX_CAST - cast.length));
  if (!vrij.length || !teCasten.length) return cast;

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["keuzes"],
    properties: {
      keuzes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["rol", "characterId", "leeftijd", "wil", "spraak", "kleding"],
          properties: {
            rol: { type: "string", enum: teCasten },
            characterId: { type: "string" },
            leeftijd: { type: "string" },
            wil: { type: "string" },
            spraak: { type: "string" },
            kleding: { type: "string" },
          },
        },
      },
    },
  };

  const system = `Je bent castingdirecteur van een geanimeerd verhaal. Deze rollen spelen in het verhaal een rol, maar nog niemand speelt ze: ${teCasten.join(", ")}.

Kies voor ELKE rol één personage uit de bibliotheek hieronder. Een acteur hoeft niet zo te heten als zijn rol.

HOE JE KIEST
- De juiste leeftijd: ouders zijn volwassenen, grootouders zijn ouder.
- Het juiste geslacht voor de rol.
- Familie lijkt op elkaar: kies ouders en grootouders met een uiterlijk dat past bij de kinderen hieronder (huidskleur, haar).
- Nooit twee rollen door hetzelfde personage.

DE CAST TOT NU TOE:
${cast.map((c) => `- ${c.name}${c.leeftijd ? `, ${c.leeftijd}` : ""}${c.appearance ? ` — ${c.appearance.slice(0, 200)}` : ""}`).join("\n")}

DE BIBLIOTHEEK (gebruik alleen deze id's):
${bibliotheekTekst(vrij)}

Geef per rol ook "leeftijd" ("ongeveer 40"), "wil" (wat deze persoon in dit verhaal wil, in een halve zin, en ANDERS dan wat de anderen willen) en "spraak" (hoe deze persoon praat, in een halve zin). In het ${language}. Geef ook "kleding": wat deze persoon draagt van top tot teen, in één ENGELSE zin — bovenstuk, broek, rok of jurk, en schoenen ("lilac cardigan, dark trousers, brown shoes"). Iedereen draagt schoenen.

Antwoord uitsluitend met JSON volgens het schema.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.3,
      max_tokens: 800,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `HET VERHAAL:\n"""\n${briefing.slice(0, 4000)}\n"""` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "casting", strict: true, schema },
      },
    });
    const ruw = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
      keuzes?: { rol: string; characterId: string; leeftijd: string; wil: string; spraak: string; kleding?: string }[];
    };

    const vlaams = /vlaams/i.test(language);
    const gebruikteStemmen = new Set(cast.map((c) => c.voice).filter(Boolean));
    const gekozen = new Set<string>();
    const nieuw: DialogueCastMember[] = [];

    for (const k of ruw.keuzes ?? []) {
      const rij = vrij.find((c) => c.id === k.characterId);
      if (!rij?.image_url || gekozen.has(rij.id) || !teCasten.includes(k.rol)) continue;
      gekozen.add(rij.id);

      const soort = STEMSOORT[k.rol] ?? /vrouwenstem|mannenstem/i;
      const vrijeStem = (v: { id: string; description: string }) => soort.test(v.description) && !gebruikteStemmen.has(v.id);
      const stem =
        STORY_VOICES.find((v) => vrijeStem(v) && /vlaams/i.test(v.description) === vlaams) ??
        STORY_VOICES.find(vrijeStem);
      if (stem) gebruikteStemmen.add(stem.id);

      nieuw.push({
        id: `char-${cast.length + nieuw.length + 1}`,
        characterId: rij.id,
        name: k.rol,
        role: k.rol.toLowerCase(),
        leeftijd: (k.leeftijd ?? "").trim() || rij.age_range || null,
        wil: (k.wil ?? "").trim() || null,
        spraak: (k.spraak ?? "").trim() || null,
        kleding: (k.kleding ?? "").trim() || null,
        voice: stem?.id ?? "",
        portraitUrl: rij.image_url,
        position: "left",
        appearance: rij.description ?? null,
      });
      console.log(`[dialogue-setup] gecast: ${k.rol} → ${rij.name}`);
    }

    // Door mergeCast, zodat id's en plekken in beeld weer netjes op volgorde staan.
    return nieuw.length ? mergeCast([], [...cast, ...nieuw]) : cast;
  } catch (e) {
    console.error("[dialogue-setup] casting mislukt:", e);
    return cast;
  }
}

/**
 * Tweede lezing van een VERZONNEN verhaal, door een strenge eindredacteur.
 *
 * De eerste call doet twintig dingen tegelijk (titel, stijl, stemmen, cast) en
 * dan wint het makkelijkste verhaal: iedereen is het eens en het probleem lost
 * zichzelf op. Deze call doet één ding: het verhaal lezen alsof het een
 * voorleesboek is, en repareren wat niet werkt.
 *
 * NOOIT bij een gevolgd verhaal: deze redacteur is gebouwd om tegenslagen te
 * verzinnen, en dat is precies wat daar niet mag.
 *
 * Mislukt hij, dan houden we het eerste voorstel. Een redactie die stuk gaat mag
 * de opzet niet tegenhouden.
 */
async function redigeerVerhaal(
  voorstel: { kern: string; wending: string; verhaallijn: VerhaalDeel[] },
  cast: DialogueCastMember[],
  briefing: string,
  language: string,
): Promise<{ kern: string; wending: string; verhaallijn: VerhaalDeel[] } | null> {
  const problemen = verhaalProblemen(voorstel.verhaallijn, cast);

  const system = `Je bent eindredacteur van voorleesverhalen die tot korte animatievideo's worden gemaakt. Je krijgt een verhaallijn in vijf delen en maakt er een beter verhaal van. Je bent streng: de meeste eerste versies zijn te braaf.

${VERHAALLES}

DE CAST (gebruik in "wie" alleen deze id's, hooguit ${MAX_PER_SCENE} per deel):
${castTekstVoor(cast)}

HOE JE WERKT
Loop de punten hierboven langs. Klopt een punt niet, herschrijf dan de delen die het nodig hebben — verzin gerust een tegenslag, een voorwerp of een misverstand erbij. Klopt het wel, laat die delen dan staan.
- Blijf binnen wat de gebruiker wilde: dezelfde situatie, dezelfde personages, dezelfde feiten en namen.
- Iedereen in de cast speelt in minstens één deel mee.
- Noem in "wat" alleen mensen die in de cast staan. Je kunt niemand toevoegen, en wie er niet in staat kan niet getekend worden.
- "wat" zijn twee of drie gewone zinnen in het ${language} over wat er GEBEURT. Geen dialoog.
- "plek" is kort en tekenbaar. Kom terug op plekken die er al waren.
- "verteller" is één zin in de derde persoon en de verleden tijd, zoals een voorleesboek. Verplicht bij het begin; verder alleen bij een sprong in tijd of plek, anders leeg.
- "kern": in één zin wat iemand VOELT (een verlangen, gemis of angst), niet wat er gebeurt.
- "wending": in één zin wat er anders loopt dan verwacht.
- "oordeel": twee zinnen in het Nederlands over wat er mis was en wat je veranderde.

Antwoord uitsluitend met JSON volgens het schema.`;

  const userPrompt = `WAT DE GEBRUIKER WILDE:
"""
${briefing.slice(0, 4000)}
"""

HET EERSTE VOORSTEL:
${JSON.stringify({ kern: voorstel.kern, wending: voorstel.wending, verhaallijn: voorstel.verhaallijn }, null, 2)}
${problemen.length ? `\nDIT MOET JE OPLOSSEN — het is aantoonbaar mis en mag in jouw versie niet meer voorkomen:\n${problemen.map((p) => `- ${p}`).join("\n")}\n` : ""}
Geef de verbeterde verhaallijn als JSON.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.7,
      max_tokens: 2500,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "verhaal_redactie", strict: true, schema: REDACTIE_SCHEMA as unknown as Record<string, unknown> },
      },
    });
    const ruw = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
    const verhaallijn = normaliseerVerhaallijn(ruw.verhaallijn, cast.map((c) => c.characterId));
    if (!verhaallijn.length) return null;

    console.log(`[dialogue-setup] verhaalredactie: ${String(ruw.oordeel ?? "").trim()}`);
    const over = verhaalProblemen(verhaallijn, cast);
    if (over.length) console.warn(`[dialogue-setup] na redactie nog: ${over.join(" | ")}`);

    return {
      kern: String(ruw.kern ?? "").trim() || voorstel.kern,
      wending: String(ruw.wending ?? "").trim() || voorstel.wending,
      verhaallijn,
    };
  } catch (e) {
    console.error("[dialogue-setup] verhaalredactie mislukt:", e);
    return null;
  }
}

/**
 * Een GEVOLGD verhaal aanvullen met de momenten die het model oversloeg.
 *
 * Welke dat zijn weten we zonder model: namen van plekken uit de tekst die nergens
 * in de verhaallijn staan. Dan is de vraag aan het model heel klein — "voeg deze
 * toe op de juiste plek, verander de rest niet" — en dat doet het betrouwbaar.
 */
async function vulVerhaalAan(
  lijn: VerhaalDeel[],
  ontbrekend: string[],
  cast: DialogueCastMember[],
  briefing: string,
  language: string,
): Promise<VerhaalDeel[] | null> {
  const system = `Je krijgt het verhaal van een gebruiker en een verhaallijn die ervan gemaakt is: één deel per moment, in de volgorde van het verhaal. Daarin ontbreekt iets. Deze namen uit het verhaal komen nergens in de verhaallijn voor: ${ontbrekend.join(", ")}.

Voeg de momenten waarin ze voorkomen toe, op de plek in de volgorde waar ze in het verhaal staan. Elke plek wordt een eigen moment. Verander de momenten die er al staan niet, en verzin niets wat niet in het verhaal staat.

DE CAST (gebruik in "wie" alleen deze id's, hooguit ${MAX_PER_SCENE} per moment):
${castTekstVoor(cast)}

Per moment: "titel" (twee tot vier woorden, bij voorkeur de plek), "wat" (wat er gebeurt, in het ${language}, dicht bij de tekst), "plek", "wie", "verteller" (één inleidende zin, of leeg) en "citaten" (elke zin die in dat moment tussen aanhalingstekens staat, letterlijk, met wie hem zegt — neem ze van bestaande momenten ongewijzigd over). Geef de VOLLEDIGE verhaallijn terug, hooguit ${MAX_DELEN} momenten. Antwoord uitsluitend met JSON.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      max_tokens: 5000,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `HET VERHAAL:\n"""\n${briefing.slice(0, MAX_VERHAAL_TEKENS)}\n"""\n\nDE HUIDIGE VERHAALLIJN:\n${JSON.stringify(lijn.map(({ fase: _fase, ...d }) => d), null, 2)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "verhaal_aanvullen",
          strict: true,
          schema: { type: "object", additionalProperties: false, required: ["verhaallijn"], properties: { verhaallijn: MOMENTEN_SCHEMA } },
        },
      },
    });
    const ruw = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
    const aangevuld = normaliseerVerhaallijn(ruw.verhaallijn, cast.map((c) => c.characterId));
    // Aanvullen mag nooit korter maken: dan is er iets weggevallen in plaats van bijgekomen.
    return aangevuld.length > lijn.length ? aangevuld : null;
  } catch (e) {
    console.error("[dialogue-setup] verhaal aanvullen mislukt:", e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

    const userId = user.id;
    const body = (await req.json()) as Body;
    const text = (body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "Beschrijf eerst waar de video over gaat" }, { status: 400 });

    const vasteCast = (Array.isArray(body.vasteCast) ? body.vasteCast : []).slice(0, MAX_CAST);
    const language = body.language ?? "Nederlands";
    const format = body.format === "9:16" ? "9:16" : "16:9";
    const targetSeconds = Math.max(20, Math.min(300, Math.round(body.targetSeconds ?? 60)));
    const modus: VerhaalModus = isVerhaalModus(body.modus)
      ? body.modus
      : isUitgewerktVerhaal(text) ? "volgen" : "verzinnen";
    const volg = modus === "volgen";

    // De bibliotheek meegeven zodat de assistent uit ÉCHTE personages kan kiezen.
    // Zonder deze lijst verzint hij namen die nergens een portret bij hebben, en
    // dan valt de rolverdeling in het voorstel meteen om.
    const { data: rijen } = await supabase
      .from("characters")
      .select("id, name, description, gender, age_range, image_url")
      .eq("user_id", user.id)
      .not("image_url", "is", null)
      .order("updated_at", { ascending: false })
      .limit(40);
    const bibliotheek = (rijen ?? []) as BibliotheekRij[];

    // De voorwerpenbibliotheek, om dezelfde reden: de Wonderwagen hoort in elke video
    // dezelfde te zijn. Bestaat de tabel nog niet, dan gewoon zonder.
    const { data: voorwerpRijen, error: voorwerpFout } = await supabase
      .from("voorwerpen")
      .select("id, naam, uiterlijk, bladen")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(60);
    if (voorwerpFout && !tabelOntbreekt(voorwerpFout)) {
      console.warn(`[dialogue-setup] voorwerpenbibliotheek niet gelezen: ${voorwerpFout.message}`);
    }
    const voorwerpBibliotheek = (voorwerpRijen ?? [])
      .map(leesBibliotheekVoorwerp)
      .filter((v): v is BibliotheekVoorwerp => !!v);

    const vastLijst = vasteCast.length
      ? vasteCast
          .map((c) => `- id "${c.characterId}": ${c.name}${c.role?.trim() ? ` — de gebruiker gaf deze rol: "${c.role.trim()}"` : " (nog geen rol gekozen)"}`)
          .join("\n")
      : "(de gebruiker heeft nog niemand gekozen; kies zelf wie het verhaal nodig heeft)";

    const stemLijst = STORY_VOICES.map((v) => `"${v.id}"`).join(", ");
    const stijlLijst = STORY_STYLE_PRESETS.map((s) => `"${s.id}" (${s.name})`).join(", ");

    const verhaalOpdracht = volg
      ? VOLGLES
      : `JE MAAKT ER EEN ECHT VERHAAL VAN
De gebruiker geeft meestal een onderwerp of een situatie, geen compleet verhaal. Jouw werk is daar een verhaal van te maken. Verzin gerust gebeurtenissen die de gebruiker niet noemde: een voorwerp, een misverstand, een geheim, een plek, iets wat misgaat. Blijf wel binnen zijn wereld en zijn bedoeling, en neem namen, feiten en cijfers die hij noemt letterlijk over.

${VERHAALLES}`;

    const verhaalVelden = volg
      ? `- "verhaallijn": één deel per moment uit de tekst, in de volgorde van de tekst. Per deel:
  - "titel": de naam van dit moment in twee tot vier woorden, bij voorkeur de plek ("Fort Zeelandia", "Oma onthult de wagen").
  - "wat": wat er in dit moment gebeurt, in twee of drie zinnen in ${language}, zo dicht mogelijk bij de tekst.
  - "plek": waar het gebeurt, zo concreet als de tekst het noemt.
  - "wie": de id's uit de cast van wie er in beeld is (een bibliotheek-id, of "nieuw-1", "nieuw-2" … voor een nieuw personage), hooguit ${MAX_PER_SCENE}.
  - "verteller": één zin die dit moment inleidt, uit of dicht bij de tekst, in de derde persoon en de verleden tijd. Verplicht bij het eerste moment en bij elke nieuwe plek; leeg als de personages het moment zelf dragen.
  - "citaten": ELKE zin die in dit moment in de tekst tussen aanhalingstekens staat, precies zoals hij er staat, met in "wie" het id van wie hem zegt. Let goed op wie dat is: "vraagt Lilly", "Oma knikt." gevolgd door haar zin, "zegt ze". Verzin geen zinnen; leeg als er in dit moment niemand iets zegt.
- "kern": in één zin waar het verhaal over gaat, afgeleid uit de tekst. Voeg niets toe.
- "wending": het verrassende moment dat in de tekst zelf staat (bijvoorbeeld iets dat onthuld wordt). Leeg als er geen is.`
      : `- "verhaallijn": precies vijf delen, in de volgorde begin, probleem, tegenslag, omslag, slot. Per deel:
  - "fase": welk deel het is.
  - "wat": twee of drie gewone zinnen in ${language} over wat er in dit deel GEBEURT. Geen dialoog, geen samenvatting van gevoelens — handelingen die je kunt laten zien.
  - "plek": waar het gebeurt, kort en tekenbaar ("de keuken bij papa").
  - "wie": de id's uit de cast van wie er in beeld is (een bibliotheek-id, of "nieuw-1", "nieuw-2" … voor een nieuw personage), hooguit ${MAX_PER_SCENE}.
  - "verteller": één zin in de derde persoon en de verleden tijd, zoals een voorleesboek ("Het was de laatste week voor kerst, en in huize De Vries werd het stil."). Verplicht bij het begin. Verder alleen bij een sprong in tijd of plek; anders leeg.
- "kern": in één zin wat er onderhuids speelt — wat iemand mist, hoopt, niet durft of wil bewijzen. Een gevoel, geen gebeurtenis.
- "wending": in één zin wat er anders loopt dan verwacht.`;

    const system = `Je bent schrijver en regisseur van korte geanimeerde VERHAAL-video's, in de stijl van de sprookjeskanalen voor kinderen: personages die samen iets beleven, met een verteller die het verhaal draagt. Je schrijft nu NOG GEEN dialoog. Je levert de OPZET: het verhaal zelf, en de keuzes waar de scenarist straks mee aan de slag gaat.

Je antwoordt uitsluitend met JSON volgens het schema.

${verhaalOpdracht}

DE PERSONAGEBIBLIOTHEEK van deze gebruiker:
${bibliotheekTekst(bibliotheek)}

DE VOORWERPENBIBLIOTHEEK van deze gebruiker:
${bibliotheekVoorwerpTekst(voorwerpBibliotheek)}

AL VASTGELEGD DOOR DE GEBRUIKER — deze personages liggen vast, met de rol die er staat. Neem ze over en verzin er geen vervanger voor:
${vastLijst}

WAT JE LEVERT, in deze volgorde:
- "title": korte werktitel in ${language}. Heeft de tekst zelf een titel, neem die dan over.
- "topic": één zin die zegt waar de video over gaat.
${verhaalVelden}
- "cast": ${MAX_CAST > 2 ? `twee tot ${MAX_CAST}` : "twee"} personages. Neem iedereen op die in de verhaallijn in beeld komt, en niemand anders.
  UIT DE BIBLIOTHEEK OF NIEUW. Past een personage uit de bibliotheek echt bij wie het in dit verhaal is — leeftijd, soort en uitstraling — gebruik dan zijn id, met "nieuw": false en "uiterlijk" leeg. Past er niemand (een prinses terwijl de bibliotheek alleen gewone kinderen heeft, een draak, een dier), maak dan een NIEUW personage: "nieuw": true, "characterId" "nieuw-1", "nieuw-2" enzovoort, en gebruik precies dat id ook in "wie" en "citaten" van de verhaallijn. Een nieuw personage wordt voor de gebruiker getekend. Een draak of dier wordt nooit door een mens gespeeld.
  Gaat het verhaal over mensen — ouders, opa, de juf — dan spelen die ZELF mee. Staan ze niet letterlijk zo in de bibliotheek, CAST ze dan: kies een personage van de juiste leeftijd met een uiterlijk dat past (ouders lijken op hun kinderen) en geef het in "naam" zijn rol in dit verhaal ("Papa"). Laat iemand waar het verhaal over gaat nooit weg omdat er niemand "Papa" heet; een acteur heet ook niet zoals zijn rol.
  Noem in "wat" alleen mensen die in de cast staan. Wie er niet in staat, kan niet getekend worden. Per personage:
  - "naam": hoe dit personage in het verhaal heet. Gebruikt de tekst een naam ("Lilly"), neem die dan precies zo over; speelt het een rol als "Papa", "Mama" of "Opa", schrijf dan die.
  - "role": wie diegene in dit verhaal is ("het broertje dat niets durft te zeggen").
  - "wil": wat diegene wil.${volg ? " Haal het uit de tekst; verzin geen tegenstelling die er niet in staat." : " Laat de verlangens BOTSEN — twee personages die hetzelfde willen hebben geen verhaal."}
  - "spraak": hoe diegene praat ("korte zinnen, stelt alles als vraag"). Maak ze onderling duidelijk verschillend.
  - "kleding": wat diegene draagt van top tot teen, in één ENGELSE zin: bovenstuk, broek/rok/jurk en schoenen ("orange T-shirt, blue denim shorts, white sneakers"). Neem over wat de beschrijving uit de bibliotheek noemt en vul de rest passend aan. Iedereen draagt schoenen, tenzij het verhaal iets anders zegt. Een dier of fantasiewezen draagt niets, tenzij het verhaal het zegt: laat "kleding" dan leeg.
  - "soort": "mens", "dier" of "fantasiewezen" (een draak, een elf).
  - "uiterlijk": ALLEEN bij een nieuw personage, één ENGELSE zin die precies beschrijft hoe het eruitziet: wat voor wezen, leeftijd, huid of schubben en kleur, haar, gezicht, lichaamsbouw en wat het herkenbaar maakt ("an eight-year-old princess with warm brown skin, long curly black hair and a small golden tiara", "a friendly young dragon, as tall as a horse, with emerald green scales, a cream belly and small rounded wings"). Geen kleding: die staat in "kleding". Leeg bij een personage uit de bibliotheek.
  - "leeftijd": leeftijd in dit verhaal ("7 jaar", "ongeveer 40"). Bepaalt hoe groot iemand getekend wordt.
  - "voice": kies uit ${stemLijst}. Geef nooit twee personages dezelfde stem. Een kind krijgt een kinderstem.
- "tone": "zakelijk", "speels" of "energiek", passend bij onderwerp en publiek.
- "angle": de invalshoek ("vanuit het kind dat moet kiezen"). Leeg als dat niet nodig is.
- "styleId": kies uit ${stijlLijst}.
- "illustrationBrief": regie die voor ELK beeld geldt — kleurgebruik, kleding, soort omgeving. Twee zinnen, in ${language}.
- "voorwerpen": voorwerpen die in het verhaal een hoofdrol spelen of in meer dan één moment terugkomen (een wagen, een kaart, een knuffel). "naam" zoals in het verhaal; "uiterlijk" is één ENGELSE zin die precies beschrijft hoe het eruitziet — vorm, grootte, kleuren, materiaal, bijzonderheden — zodat het in elk beeld hetzelfde getekend wordt. Begin met wat voor ding het is (bijv. "an old wooden covered wagon on four big red wheels"), noem de hoofdkleur, twee opvallende details en hoe groot het is naast de personages (bijv. "big enough for three people to sit inside"). Nooit alleen vage woorden als "magical" of "colorful": die kan een tekenaar op honderd manieren tekenen. Tel ook dingen mee waar de personages in meer dan één shot naar kijken of over praten, zoals de bloem die ze bestuderen of de grote boom waar ze onder staan. "bibliotheekId": staat het voorwerp in DE VOORWERPENBIBLIOTHEEK (hetzelfde ding, ook als het verhaal het iets anders noemt), gebruik dan dat id en neem naam en uiterlijk letterlijk uit de bibliotheek over. Anders leeg. "zoekwoorden": drie tot zes losse woorden waarmee het draaiboek en de beschrijvingen van de shots dit ding kunnen noemen, in het Nederlands én het Engels, zonder lidwoord ("boom", "eik", "tree", "oak"). Hooguit vier. Leeg als er geen zijn.
- "keepTerms": merk- en productnamen uit de brontekst die exact zo moeten blijven staan. Meestal leeg.
- "avoidTerms": namen die beter niet vallen. Meestal leeg.`;

    const userPrompt = `${volg ? "HET VERHAAL VAN DE GEBRUIKER — volg het precies" : "WAT DE GEBRUIKER WIL MAKEN"}:
"""
${text.slice(0, MAX_VERHAAL_TEKENS)}
"""

${body.topic?.trim() ? `OPGEGEVEN ONDERWERP: ${body.topic.trim()}\n` : ""}GEWENSTE LENGTE: ongeveer ${targetSeconds} seconden.
FORMAAT: ${format}.
TAAL VAN DE VIDEO: ${language}.

Geef nu de opzet als JSON.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: volg ? 0.3 : 0.8,
      // Een gevolgd verhaal kan twintig momenten hebben; met 3000 tokens werd de
      // lijst halverwege afgebroken.
      max_tokens: volg ? 10000 : 3000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "dialogue_setup",
          strict: true,
          schema: setupSchema(volg ? MOMENTEN_SCHEMA : VERHAALLIJN_SCHEMA) as unknown as Record<string, unknown>,
        },
      },
    });

    let ruw: Record<string, unknown>;
    try {
      ruw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch {
      return NextResponse.json({ error: "Ongeldig antwoord van het model" }, { status: 500 });
    }

    // Het voorstel omzetten naar echte castleden: alleen id's die in de
    // bibliotheek bestaan overleven, want een personage zonder portret kan
    // straks niet getekend worden.
    const opId = new Map(bibliotheek.map((c) => [c.id, c]));

    // Nieuwe personages krijgen hier hun vaste id. Het model gebruikte "nieuw-1" in
    // de cast én in de verhaallijn; die moeten straks allebei naar hetzelfde id wijzen.
    const idVertaling = new Map<string, string>();
    const geldigeStemmen = new Set(STORY_VOICES.map((v) => v.id));
    const voorstelCast: DialogueCastMember[] = (Array.isArray(ruw.cast) ? ruw.cast : [])
      .map((c, i): DialogueCastMember | null => {
        const p = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
        const veld = (k: string) => String(p[k] ?? "").trim();
        const modelId = veld("characterId");
        const naam = veld("naam");
        const rij = opId.get(modelId);

        // Een personage dat al vastligt (ook een eerder getekend) wordt niet
        // nóg eens getekend als het model het opnieuw als nieuw voorstelt.
        const vast = rij ? null : vasteCast.find(
          (v) => v.characterId === modelId || (naam && v.name.trim().toLowerCase() === naam.toLowerCase())
        );
        if (vast) {
          if (modelId) idVertaling.set(modelId, vast.characterId);
          return null;
        }

        const nieuw = !rij && (p.nieuw === true || /^nieuw/i.test(modelId)) && !!veld("uiterlijk");
        if (!rij && !nieuw) return null;
        const characterId = rij ? rij.id : `ai-${randomUUID()}`;
        if (!rij && modelId) idVertaling.set(modelId, characterId);
        const soort = (["mens", "dier", "fantasiewezen"] as const).find((s) => s === veld("soort")) ?? null;

        return {
          id: `char-${i + 1}`,
          characterId,
          // De naam in het verhaal ("Papa") wint van die in de bibliotheek
          // ("Ousmane"): de verteller en de andere personages spreken hem zo aan.
          name: naam || rij?.name || "Personage",
          role: veld("role"),
          leeftijd: veld("leeftijd") || rij?.age_range || null,
          wil: veld("wil") || null,
          spraak: veld("spraak") || null,
          kleding: veld("kleding") || null,
          voice: geldigeStemmen.has(veld("voice")) ? veld("voice") : "",
          portraitUrl: rij?.image_url ?? "",
          position: "left" as const,
          appearance: rij ? rij.description ?? null : veld("uiterlijk"),
          nieuw: rij ? null : true,
          soort,
        };
      })
      .filter((c): c is DialogueCastMember => c !== null);

    const styleId = STORY_STYLE_PRESETS.some((s) => s.id === ruw.styleId)
      ? String(ruw.styleId)
      : DEFAULT_STORY_STYLE;

    // Eerst tekenen, dan pas samenvoegen: mergeCast laat een voorstel zonder portret vallen.
    const teTekenen = voorstelCast.filter((c) => c.nieuw && !c.portraitUrl);
    if (teTekenen.length) {
      await Promise.all(
        teTekenen.map(async (c) => {
          c.portraitUrl = (await tekenPersonage(c, styleId, language, String(ruw.illustrationBrief ?? ""), userId, supabase)) ?? "";
        })
      );
      console.log(`[dialogue-setup] ${teTekenen.filter((c) => c.portraitUrl).length} van ${teTekenen.length} nieuwe personages getekend`);
    }

    let cast = mergeCast(vasteCast, voorstelCast.filter((c) => c.portraitUrl));
    const verhaalRuw = hernoemIds(ruw.verhaallijn, idVertaling);

    // Noemt de gebruiker of het verhaal papa, mama of oma, en speelt niemand die
    // rol, dan eerst casten. Dit moet VÓÓR de redactie: die kan geen personages
    // toevoegen en schrijft iemand zonder acteur anders uit het verhaal.
    const verhaalTekst = normaliseerVerhaallijn(verhaalRuw, cast.map((c) => c.characterId)).map((d) => d.wat).join(" ");
    const ontbrekend = ontbrekendeRollen(`${text} ${verhaalTekst}`, cast);
    if (ontbrekend.length) {
      cast = await casteerRollen(ontbrekend, bibliotheek, cast, text, language);
    }

    // Pas NA het casten: alleen wie er echt in staat mag in een deel van het
    // verhaal voorkomen.
    let verhaal = {
      kern: String(ruw.kern ?? "").trim(),
      wending: String(ruw.wending ?? "").trim(),
      verhaallijn: normaliseerVerhaallijn(verhaalRuw, cast.map((c) => c.characterId)),
    };

    if (verhaal.verhaallijn.length && cast.length) {
      if (volg) {
        // Een gevolgd verhaal wordt niet geredigeerd maar op VOLLEDIGHEID gecontroleerd.
        const weg = ontbrekendeNamen(text, verhaal.verhaallijn, cast.map((c) => c.name));
        if (weg.length) {
          console.log(`[dialogue-setup] ontbreekt in de verhaallijn: ${weg.join(", ")}`);
          const aangevuld = await vulVerhaalAan(verhaal.verhaallijn, weg, cast, text, language);
          if (aangevuld) verhaal = { ...verhaal, verhaallijn: aangevuld };
          const nogWeg = ontbrekendeNamen(text, verhaal.verhaallijn, cast.map((c) => c.name));
          if (nogWeg.length) console.warn(`[dialogue-setup] na aanvullen nog weg: ${nogWeg.join(", ")}`);
        }
        console.log(`[dialogue-setup] gevolgd verhaal: ${verhaal.verhaallijn.length} momenten`);
      } else {
        // De eerste redactieronde draait altijd. Een tweede alleen als de controle
        // daarna nog iets aantoonbaar fouts vindt: in de eerste proef liet de redactie
        // een omslag via de telefoon gewoon staan, terwijl hij expliciet genoemd was.
        for (let ronde = 1; ronde <= 2; ronde++) {
          const beter = await redigeerVerhaal(verhaal, cast, text, language);
          if (!beter) break;
          verhaal = beter;
          if (verhaalProblemen(verhaal.verhaallijn, cast).length === 0) break;
        }
      }
    }

    // Vaste voorwerpen. De Wonderwagen was onder het kleed een fauteuil, van binnen
    // een tram, bij het fort een busje en thuis een jeep: zonder vaste beschrijving
    // verzint het beeldmodel hem elke keer opnieuw. Ze stonden eerst als tekst
    // achter de beeldregie, maar die wordt aangekondigd als "hoe het eruitziet, niet
    // wat je tekent" en ging dus mee naar beelden waar de wagen niet eens in stond.
    // Nu een eigen lijst: elk voorwerp krijgt een blad, en gaat alleen mee naar de
    // scènes waarin het genoemd wordt. Zichtbaar in de opzet, dus aan te passen.
    // Een voorwerp uit de voorwerpenbibliotheek komt precies zo in de video, met zijn
    // blad in deze stijl; zie koppelVoorwerpen.
    const voorwerpen = koppelVoorwerpen(
      (Array.isArray(ruw.voorwerpen) ? ruw.voorwerpen : []) as { naam?: unknown; uiterlijk?: unknown; bibliotheekId?: unknown }[],
      voorwerpBibliotheek,
      styleId,
    );

    const setup: DialogueSetup = {
      title: String(ruw.title ?? "").trim() || "Naamloos verhaal",
      topic: String(ruw.topic ?? body.topic ?? "").trim(),
      text,
      kern: verhaal.kern,
      wending: verhaal.wending,
      verhaallijn: verhaal.verhaallijn,
      modus,
      tone: ["zakelijk", "speels", "energiek"].includes(String(ruw.tone)) ? String(ruw.tone) : "zakelijk",
      angle: String(ruw.angle ?? "").trim(),
      language,
      keepTerms: (Array.isArray(ruw.keepTerms) ? ruw.keepTerms : []).map(String).map((t) => t.trim()).filter(Boolean),
      avoidTerms: (Array.isArray(ruw.avoidTerms) ? ruw.avoidTerms : []).map(String).map((t) => t.trim()).filter(Boolean),
      format,
      styleId,
      illustrationBrief: String(ruw.illustrationBrief ?? "").trim(),
      voorwerpen,
      cast,
      targetSeconds,
    };

    return NextResponse.json({ setup });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-setup failed:", msg);
    return NextResponse.json({ error: "Opzet uitwerken mislukt", detail: msg }, { status: 500 });
  }
}
