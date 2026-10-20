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
} from "./types";

export interface TrailerVraag {
  titel: string;
  verhaal: string;
  /** Wat de klant over de personages zei; de AI maakt er een filmisch uiterlijk van. */
  personages: { naam: string; omschrijving: string }[];
  genre: GenreId;
  sec: TrailerLengte;
}

const DELEN: Deel[] = ["opening", "wereld", "escalatie", "adem", "klap", "titel"];
const GRENZEN: Record<Element["soort"], [number, number]> = {
  shot: [0.4, 6],
  zwart: [0.2, 4.5],
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

  const maxClips = TRAILER_LENGTES.find((l) => l.sec === sec)!.clips;
  const clips: Clip[] = (Array.isArray(r.clips) ? r.clips : []).slice(0, maxClips).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      beeld: tekst(o.beeld, 600),
      beweging: tekst(o.beweging, 300),
      personages: (Array.isArray(o.personages) ? o.personages : []).map((n) => namen.find((m) => m.toLowerCase() === String(n).toLowerCase())).filter((n): n is string => !!n),
      uitleg: tekst(o.uitleg, 200),
    };
  }).filter((c) => c.beeld);
  if (clips.length < 4) throw new Error("De trailer heeft te weinig beelden. Laat hem opnieuw schrijven.");

  let tijdlijn: Element[] = (Array.isArray(r.tijdlijn) ? r.tijdlijn : []).slice(0, 80).flatMap((x): Element[] => {
    const o = (x ?? {}) as Record<string, unknown>;
    const deel = DELEN.includes(o.deel as Deel) ? (o.deel as Deel) : "wereld";
    const rg = regel(o.regel, namen);
    if (o.soort === "shot") {
      const clip = Math.round(Number(o.clip));
      if (!(clip >= 0 && clip < clips.length)) return [];
      const duur = getal(o.duur, GRENZEN.shot, 1.5);
      return [{ soort: "shot", deel, clip, duur, van: getal(o.van, [0, CLIP_SEC - duur], 0), ...(rg ? { regel: rg } : {}) }];
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

  return { titel: tekst(r.titel, 60) || "Zonder titel", personages, clips, tijdlijn };
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
- All spoken lines are in DUTCH (Nederlands), short and dramatic, like a real dubbed trailer. A line starts at the element it is attached to and keeps running over the next shots (that is intended).

Answer ONLY with JSON:
{
 "titel": "<film title>",
 "personages": [{"naam": "", "rol": "<Dutch, one line>", "uiterlijk": "<English: age, face, hair, build, costume, era>", "geslacht": "man|vrouw"}],
 "clips": [{"beeld": "<English, one cinematic frame: setting, composition, lens, light>", "beweging": "<English: camera move + action in 5 s>", "personages": ["<names in frame>"], "uitleg": "<Dutch, one line>"}],
 "tijdlijn": [
   {"soort": "shot", "deel": "opening|wereld|escalatie|adem|klap|titel", "clip": <index>, "van": <seconds>, "duur": <seconds>, "regel": {"wie": "verteller|<name>", "tekst": "<Dutch line>"} (optional)},
   {"soort": "zwart", "deel": "...", "duur": <seconds>, "stil": true|false},
   {"soort": "tekst", "deel": "...", "tekst": "<2-4 words, Dutch, capitals>", "duur": <seconds>},
   {"soort": "titel", "deel": "titel", "duur": <seconds>}
 ]
}
The timeline must add up to about ${v.sec} seconds, follow the four movements of the rulebook (incl. the silent "adem" before the "klap", the title card and the button line after it), and use every clip at least once.`,
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
    return controleerTrailerPlan(JSON.parse(resp.choices[0]?.message?.content ?? "{}"), v.sec);
  };
  try {
    return await vraag();
  } catch (e) {
    console.error("[trailer] eerste poging onbruikbaar:", e instanceof Error ? e.message : e);
    return vraag();
  }
}
