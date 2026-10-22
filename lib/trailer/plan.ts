// De trailer uitschrijven: de AI krijgt het regelboek van het genre letterlijk mee en
// levert een tijdlijn (shots, zwart, tekstkaarten, titel) met de gesproken zinnen. Wij
// controleren en schalen die daarna, want de AI telt slecht op. Alleen op de server.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { openai } from "@/lib/openai";
import {
  CLIP_SEC,
  TRAILER_LENGTES,
  tijdlijnDuur,
  type Clip,
  type Deel,
  type Element,
  type GenreId,
  type Personage,
  type Regel,
  type TrailerLengte,
  type TrailerPlan,
  type VoTaal,
  type Wezen,
} from "./types";

export interface TrailerVraag {
  titel: string;
  verhaal: string;
  /** Wat de klant over de personages zei; de AI maakt er een filmisch uiterlijk van. */
  personages: { naam: string; omschrijving: string }[];
  genre: GenreId;
  sec: TrailerLengte;
  taal: VoTaal;
}

const DELEN: Deel[] = ["opening", "wereld", "escalatie", "adem", "klap", "titel"];
// Een shot nooit langer dan de clip: in de proef rekte de AI shots op tot 5,36 s uit een
// clip van 5 s, waarna het laatste beeld bevroor (en de starttijd negatief werd).
const GRENZEN: Record<Element["soort"], [number, number]> = {
  shot: [0.4, CLIP_SEC],
  zwart: [0.2, 3],
  tekst: [1.2, 3],
  titel: [2.5, 6],
};

export async function regelboek(genre: GenreId): Promise<string> {
  return readFile(path.join(process.cwd(), "lib/trailer/regels", `${genre}.md`), "utf8");
}

function tekst(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function getal(v: unknown, [min, max]: [number, number], standaard: number): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : standaard;
}

function regel(v: unknown, namen: string[]): Regel | undefined {
  const o = (v ?? null) as { wie?: unknown; tekst?: unknown } | null;
  const t = tekst(o?.tekst, 200);
  if (!t) return undefined;
  const wie = tekst(o?.wie, 40);
  return { wie: namen.find((n) => n.toLowerCase() === wie.toLowerCase()) ?? "verteller", tekst: t };
}

/**
 * Controleert een plan (van de AI of zoals de klant het aanpaste) en zet de lengte op de
 * gekozen duur: alleen de shots worden langer of korter, zwart en tekst blijven staan.
 */
export function controleerTrailerPlan(ruw: unknown, sec: TrailerLengte): TrailerPlan {
  const r = (ruw ?? {}) as Record<string, unknown>;
  const personages: Personage[] = (Array.isArray(r.personages) ? r.personages : []).slice(0, 4).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      naam: tekst(o.naam, 40),
      rol: tekst(o.rol, 120),
      uiterlijk: tekst(o.uiterlijk, 500),
      geslacht: (o.geslacht === "vrouw" ? "vrouw" : "man") as Personage["geslacht"],
    };
  }).filter((p) => p.naam && p.uiterlijk);
  const namen = personages.map((p) => p.naam);
  const taal: VoTaal | undefined = r.taal === "nl" ? "nl" : r.taal === "en" ? "en" : undefined;
  // Eén verteller: in de proef sprak elk personage met een andere stem, en dat klonk
  // rommelig. Oude plannen (zonder taal) houden hun stemmen per personage.
  const sprekers = taal ? [] : namen;
  const wezens: Wezen[] = (Array.isArray(r.wezens) ? r.wezens : []).slice(0, 2).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return { naam: tekst(o.naam, 40), uiterlijk: tekst(o.uiterlijk, 400) };
  }).filter((w) => w.naam && w.uiterlijk && !namen.some((n) => n.toLowerCase() === w.naam.toLowerCase()));
  const inBeeld = [...namen, ...wezens.map((w) => w.naam)];

  const maxClips = TRAILER_LENGTES.find((l) => l.sec === sec)!.clips;
  const clips: Clip[] = (Array.isArray(r.clips) ? r.clips : []).slice(0, maxClips).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      beeld: tekst(o.beeld, 600),
      beweging: tekst(o.beweging, 300),
      personages: (Array.isArray(o.personages) ? o.personages : []).map((n) => inBeeld.find((m) => m.toLowerCase() === String(n).toLowerCase())).filter((n): n is string => !!n),
      uitleg: tekst(o.uitleg, 200),
    };
  }).filter((c) => c.beeld);
  if (clips.length < 4) throw new Error("De trailer heeft te weinig beelden. Laat hem opnieuw schrijven.");

  let tijdlijn: Element[] = (Array.isArray(r.tijdlijn) ? r.tijdlijn : []).slice(0, 80).flatMap((x): Element[] => {
    const o = (x ?? {}) as Record<string, unknown>;
    const deel = DELEN.includes(o.deel as Deel) ? (o.deel as Deel) : "wereld";
    const rg = regel(o.regel, sprekers);
    if (o.soort === "shot") {
      const clip = Math.round(Number(o.clip));
      if (!(clip >= 0 && clip < clips.length)) return [];
      const duur = getal(o.duur, GRENZEN.shot, 1.5);
      return [{ soort: "shot", deel, clip, duur, van: Math.min(CLIP_SEC - duur, getal(o.van, [0, CLIP_SEC], 0)), ...(rg ? { regel: rg } : {}) }];
    }
    if (o.soort === "tekst") {
      const t = tekst(o.tekst, 40);
      return t ? [{ soort: "tekst", deel, tekst: t, duur: getal(o.duur, GRENZEN.tekst, 2), ...(rg ? { regel: rg } : {}) }] : [];
    }
    if (o.soort === "titel") return [{ soort: "titel", deel, duur: getal(o.duur, GRENZEN.titel, 4), ...(rg ? { regel: rg } : {}) }];
    return [{ soort: "zwart", deel, duur: getal(o.duur, GRENZEN.zwart, 0.5), stil: o.stil === true || deel === "adem", ...(rg ? { regel: rg } : {}) }];
  });
  // Regelboek §2: in de escalatie harde knippen, geen zwart tussen de snelle shots. De AI
  // deed dat in de proef toch; de tijd gaat naar het shot ervoor.
  tijdlijn = tijdlijn.reduce<Element[]>((uit, e) => {
    const vorige = uit[uit.length - 1];
    if (e.soort === "zwart" && !e.stil && e.deel === "escalatie" && vorige?.soort === "shot") {
      uit[uit.length - 1] = { ...vorige, duur: Math.min(GRENZEN.shot[1], vorige.duur + e.duur) };
      return uit;
    }
    uit.push(e);
    return uit;
  }, []);
  if (tijdlijn.filter((e) => e.soort === "shot").length < 8) throw new Error("De trailer is te kort uitgeschreven. Laat hem opnieuw schrijven.");
  if (!tijdlijn.some((e) => e.soort === "titel")) tijdlijn.push({ soort: "titel", deel: "titel", duur: 4 });
  tijdlijn = beperkZwart(tijdlijn, sec);

  // Op lengte brengen via de shots. Twee rondes: wat tegen een grens aanloopt, schuift
  // de rest naar de andere shots.
  for (let ronde = 0; ronde < 2; ronde++) {
    const vast = tijdlijn.filter((e) => e.soort !== "shot").reduce((s, e) => s + e.duur, 0);
    const shots = tijdlijnDuur(tijdlijn) - vast;
    const factor = (sec - vast) / Math.max(1, shots);
    if (Math.abs(factor - 1) < 0.03) break;
    tijdlijn = tijdlijn.map((e) => {
      if (e.soort !== "shot") return e;
      const duur = Math.round(getal(e.duur * factor, GRENZEN.shot, e.duur) * 100) / 100;
      return { ...e, duur, van: Math.round(Math.min(e.van, Math.max(0, CLIP_SEC - duur)) * 100) / 100 };
    });
  }

  return { titel: tekst(r.titel, 60) || "Zonder titel", ...(taal ? { taal } : {}), personages, ...(wezens.length ? { wezens } : {}), clips, tijdlijn: spreidHerhalingen(tijdlijn) };
}

/** Hoeveel van de trailer zwart mag zijn. De proef had 15 van de 60 s zwart (25%). */
const MAX_ZWART = 0.12;

/**
 * Zwart is een bewuste keuze (regelboek §1 en §2), maar met mate: de openingsstilte max 2 s,
 * een dip tussen delen max 0,8 s, de adem en de stilte na de titel max 3 s, en alles samen
 * hooguit 12%. De vrijgekomen tijd gaat daarna naar de shots.
 */
export function beperkZwart(t: Element[], sec: number): Element[] {
  let uit = t.map((e, i) => {
    if (e.soort !== "zwart") return e;
    const max = i === 0 ? 2 : e.stil ? 3 : 0.8;
    return { ...e, duur: Math.min(e.duur, max) };
  });
  const zwart = uit.reduce((s, e) => s + (e.soort === "zwart" ? e.duur : 0), 0);
  const ruimte = sec * MAX_ZWART;
  if (zwart > ruimte) {
    const f = ruimte / zwart;
    uit = uit.map((e) => (e.soort === "zwart" ? { ...e, duur: Math.max(GRENZEN.zwart[0], Math.round(e.duur * f * 100) / 100) } : e));
  }
  return uit;
}

/**
 * Een clip die vaker gebruikt wordt, laat elke keer een ander stuk zien: zo ver mogelijk
 * van de stukken die al in beeld waren. De montage zoomt herhalingen daarnaast anders in.
 */
export function spreidHerhalingen(t: Element[]): Element[] {
  const gebruikt = new Map<number, number[]>();
  return t.map((e) => {
    if (e.soort !== "shot") return e;
    const eerder = gebruikt.get(e.clip) ?? [];
    let van = e.van;
    if (eerder.length) {
      const ruimte = Math.max(0, CLIP_SEC - e.duur);
      let beste = van;
      let afstand = -1;
      const kandidaten = [...Array.from({ length: Math.floor(ruimte / 0.25) + 1 }, (_, j) => j * 0.25), ruimte];
      for (const k of kandidaten) {
        const d = Math.min(...eerder.map((x) => Math.abs(x - k)));
        if (d > afstand) [beste, afstand] = [k, d];
      }
      van = Math.round(beste * 100) / 100;
    }
    gebruikt.set(e.clip, [...eerder, van]);
    return { ...e, van, ...(eerder.length ? { herhaling: eerder.length } : {}) };
  });
}

export async function schrijfTrailer(v: TrailerVraag): Promise<TrailerPlan> {
  const regels = await regelboek(v.genre);
  const clips = TRAILER_LENGTES.find((l) => l.sec === v.sec)!.clips;
  const vraag = async () => {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 4000,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a top Hollywood trailer editor. You cut a ${v.sec}-second trailer for a new ${v.genre} film, following this genre rulebook EXACTLY (it is in Dutch; it was measured from real trailers):

=== RULEBOOK ===
${regels}
=== END RULEBOOK ===

Production limits:
- We can generate exactly ${clips} source clips ("clips"), each ${CLIP_SEC} seconds of photorealistic cinematic footage from one still image. Shots in the timeline are CUT FROM these clips: a shot uses a clip and a start offset "van" (0-${CLIP_SEC}) and a duration. Reuse clips for several short shots in the escalation (different offsets), exactly like real trailers.
- Clips need simple, filmable moments: one setting, one action, no text, no logos. Characters must look the same everywhere, so describe characters only by name in a clip; their look comes from the character sheet.
- A creature or object that appears in more than one clip (a dragon, a sword, a crown) goes in "wezens" with an exact English description, and is named in each clip's "personages" list. Otherwise it looks different in every shot.
- Every clip's "beeld" names the location AND the light, matching the same world (cold, overcast, firelit). A close-up still says where we are; never a sunny green background in a cold world.
- Each character's "uiterlijk" starts with age and sex, e.g. "19-year-old young woman, ...".
- Keep the last 2 clips for the ending: the "klap" shot and the button shot after the title use clips that appear NOWHERE else in the trailer. Reuse other clips at most 2 times.
- Black: the opening silence at most 2 s, dips between movements 0.2-0.8 s, the "adem" 1.5-3 s. All black together at most 10% of the trailer.
- 2-4 text cards ("tekst") that together form one sentence, placed between movements.
- VOICE-OVER: ONE narrator speaks every line ("wie": "verteller") — the classic deep movie-trailer voice. Characters do not speak. Write ${v.taal === "en" ? "in ENGLISH" : "in DUTCH (Nederlands)"}: 6-10 short narrator phrases (2-10 words each) that together tell ONE story arc, like "In a world… / one girl… / will rise." Phrases are spoken slowly with pauses, so give each phrase room: the shots after a phrase (until the next phrase) must last at least 1 second per 2 words. A phrase starts on the element it is attached to and runs over the next shots.
- Text cards and the button line are in the same language as the narrator.

Answer ONLY with JSON:
{
 "titel": "<film title>",
 "taal": "${v.taal}",
 "personages": [{"naam": "", "rol": "<Dutch, one line>", "uiterlijk": "<English: age and sex first, then face, hair, build, costume, era>", "geslacht": "man|vrouw"}],
 "wezens": [{"naam": "<e.g. De draak>", "uiterlijk": "<English: species, shape, size, colours, texture, distinctive marks>"}],
 "clips": [{"beeld": "<English, one cinematic frame: setting, composition, lens, light>", "beweging": "<English: camera move + action in 5 s>", "personages": ["<names in frame>"], "uitleg": "<Dutch, one line>"}],
 "tijdlijn": [
   {"soort": "shot", "deel": "opening|wereld|escalatie|adem|klap|titel", "clip": <index>, "van": <seconds>, "duur": <seconds>, "regel": {"wie": "verteller|<name>", "tekst": "<Dutch line>"} (optional)},
   {"soort": "zwart", "deel": "...", "duur": <seconds>, "stil": true|false},
   {"soort": "tekst", "deel": "...", "tekst": "<2-4 words, Dutch, capitals>", "duur": <seconds>},
   {"soort": "titel", "deel": "titel", "duur": <seconds>}
 ]
}
The timeline must add up to about ${v.sec} seconds, follow the four movements of the rulebook (incl. the silent "adem" before the "klap", the title card and the button line after it), and use every clip at least once.
Before answering, check: shots never longer than ${CLIP_SEC} s; 2-4 text cards; black at most 10%; the last 2 clips only at the ending; every recurring creature in "wezens"; narrator phrases fit the story (he/she right), build one arc, and avoid clichés unless used on purpose ("In a world…").`,
        },
        {
          role: "user",
          content: `Titel (werktitel): ${v.titel || "(verzin er een)"}
Verhaal: ${v.verhaal}
Personages:
${v.personages.map((p) => `- ${p.naam}: ${p.omschrijving}`).join("\n") || "(verzin 1-3 personages die passen)"}`,
        },
      ],
    });
    return controleerTrailerPlan({ ...JSON.parse(resp.choices[0]?.message?.content ?? "{}"), taal: v.taal }, v.sec);
  };
  try {
    return await vraag();
  } catch (e) {
    console.error("[trailer] eerste poging onbruikbaar:", e instanceof Error ? e.message : e);
    return vraag();
  }
}
