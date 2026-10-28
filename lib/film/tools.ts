// Het gereedschap van de Regisseur voor de filmstudio. Een film hoort bij het regieproject
// waarin hij gemaakt wordt; de Regisseur bouwt hem stap voor stap samen met de gebruiker op.
// Alleen op de server.

import type Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { MUSIC_CATEGORIES } from "@/lib/music/library";
import { vindStem } from "@/lib/stem/bibliotheek";
import type { Optie, Stap } from "@/lib/regisseur/tools";
import { filmVanProject, maakFilm, wijzigFilm } from "./opslag";
import { leesCast, leesScene } from "./script";
import { LEGE_FILM, sceneCredits, spreekSec, teMaken, vingerafdruk, type Film, type Scene } from "./types";

type Tool = Anthropic.Beta.BetaTool;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SHOT_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "Vast per shot binnen de scène (s1, s2…). Houd het id gelijk als je een shot alleen aanpast." },
    beeld: { type: "string", description: "Engels: één filmbeeld — compositie, lens, wie waar staat, wat er te zien is." },
    beweging: { type: "string", description: "Engels: camerabeweging + actie in 5 s (alleen bij shots zonder dialoog)." },
    in_beeld: { type: "array", items: { type: "string" }, description: "Namen uit de cast die in beeld zijn." },
    dialoog: { type: "object", properties: { wie: { type: "string" }, tekst: { type: "string" } }, description: "Iemand zegt iets in beeld (krijgt lipsync). Eén zin of een paar korte zinnen." },
    verteller: { type: "string", description: "Wat de verteller over dit shot zegt (loopt door over de volgende shots)." },
    duur: { type: "number", description: "Lengte van een stil shot, 1,5-4,2 s. Dialoogshots duren zo lang als de zin." },
  },
  required: ["id", "beeld"],
} as const;

export const FILM_TOOLS: Tool[] = [
  {
    name: "film_bekijk",
    description: "Bekijk de film van dit project (gratis): opzet, cast met stemmen en portretten, alle scènes met shots, status en wat de volgende versie van elke scène kost.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "film_opzet",
    description: "Leg de opzet van de film vast of pas hem aan (gratis): titel, logline, filmlook, taal en formaat. Maakt de film aan als die er nog niet is.",
    input_schema: {
      type: "object",
      properties: {
        titel: { type: "string" },
        logline: { type: "string", description: "Nederlands, één of twee zinnen: waar gaat de film over." },
        stijl: { type: "string", description: "Engels: de vaste filmlook voor elk beeld (kleur, licht, lens, tijdperk), bv. 'Photorealistic 1970s Dutch drama, warm faded colours, 35mm film grain'." },
        taal: { type: "string", enum: ["nl", "en"], description: "Taal van dialoog en verteller." },
        formaat: { type: "string", enum: ["16:9", "9:16"] },
        verteller_stem: { type: "string", description: "Stem-id van de verteller uit zoek_stemmen (als de film een verteller heeft)." },
      },
    },
  },
  {
    name: "film_cast",
    description:
      "Zet personages en terugkerende wezens/voorwerpen in de film (gratis). Elk personage dat praat heeft een vaste stem (stem-id uit zoek_stemmen) en iedereen heeft een portret: maak dat eerst met maak_beeld (neutrale achtergrond, gezicht goed zichtbaar) en geef het creatie-id mee. Wie je niet noemt, blijft staan.",
    input_schema: {
      type: "object",
      properties: {
        cast: {
          type: "array",
          items: {
            type: "object",
            properties: {
              naam: { type: "string" },
              soort: { type: "string", enum: ["personage", "wezen"] },
              rol: { type: "string", description: "Nederlands, één regel." },
              uiterlijk: { type: "string", description: "Engels: leeftijd en geslacht eerst, dan gezicht, haar, bouw, kostuum." },
              geslacht: { type: "string", enum: ["man", "vrouw"] },
              stem: { type: "string", description: "Stem-id uit zoek_stemmen." },
              portret: { type: "string", description: "Creatie-id (of https-adres) van het portret." },
            },
            required: ["naam"],
          },
        },
      },
      required: ["cast"],
    },
  },
  {
    name: "film_scene_schrijf",
    description: `Schrijf een scène uit of herschrijf hem na feedback (gratis). Shots van 1,5-4,2 s; dialoogshots tonen wie praat in een (medium) close-up en krijgen lipsync. Houd shot-id's gelijk voor shots die niet veranderen: die worden dan niet opnieuw gemaakt (en niet opnieuw betaald). Muziek: ${MUSIC_CATEGORIES.map((c) => c.id).join(", ")} of leeg.`,
    input_schema: {
      type: "object",
      properties: {
        nummer: { type: "integer" },
        titel: { type: "string" },
        samenvatting: { type: "string", description: "Nederlands: wat er gebeurt." },
        plek: { type: "string", description: "Engels: plek en licht voor alle shots van deze scène." },
        muziek: { type: "string" },
        shots: { type: "array", items: SHOT_SCHEMA, maxItems: 40 },
      },
      required: ["nummer", "titel", "plek", "shots"],
    },
  },
  {
    name: "film_scene_maak",
    description: "Maak een scène (of de nieuwe versie na feedback) als video: beelden, beweging, lipsync, stemmen en montage (kost credits; alleen gewijzigde shots worden opnieuw gemaakt). Duurt 5-10 min. Stuur hem daarna ter keuring met vraag_keuze soort 'scene'.",
    input_schema: { type: "object", properties: { nummer: { type: "integer" } }, required: ["nummer"] },
  },
  {
    name: "film_scene_keur",
    description: "Leg het oordeel van de gebruiker over een scène vast (gratis): goedgekeurd, of feedback met wat er anders moet.",
    input_schema: {
      type: "object",
      properties: { nummer: { type: "integer" }, oordeel: { type: "string", enum: ["goedgekeurd", "feedback"] }, feedback: { type: "string" } },
      required: ["nummer", "oordeel"],
    },
  },
  {
    name: "film_monteer",
    description: "Monteer alle goedgekeurde scènes, op volgorde, met titel en einde, tot de film (gratis, duurt een paar minuten).",
    input_schema: { type: "object", properties: {} },
  },
];

export const FILM_GRATIS = new Set(["film_bekijk", "film_opzet", "film_cast", "film_scene_schrijf", "film_scene_keur"]);
export const FILM_BETAALD = new Set(["film_scene_maak", "film_monteer"]);

async function portretUrl(userId: string, ref: unknown): Promise<string | undefined> {
  const r = String(ref ?? "").trim();
  if (!r) return undefined;
  if (/^https:\/\//.test(r)) return r;
  if (!UUID.test(r)) throw new Error(`Onbekend portret: ${r}`);
  const { data } = await createServiceClient().from("creaties").select("url, status").eq("id", r).eq("user_id", userId).maybeSingle();
  if (!data?.url || data.status !== "klaar") throw new Error(`Portret ${r} is er niet of nog niet klaar. Wacht er eerst op met wacht_op.`);
  return data.url as string;
}

function nodigProject(projectId?: string): string {
  if (!projectId) throw new Error("De filmstudio werkt alleen binnen een regieproject.");
  return projectId;
}

async function nodigFilm(userId: string, projectId?: string) {
  const rij = await filmVanProject(userId, nodigProject(projectId));
  if (!rij) throw new Error("Er is nog geen film in dit project. Leg eerst de opzet vast met film_opzet.");
  return rij;
}

/** Wat de Regisseur van de film te zien krijgt. */
function overzicht(film: Film) {
  return {
    titel: film.titel,
    logline: film.logline,
    stijl: film.stijl,
    taal: film.taal,
    formaat: film.formaat,
    verteller: film.vertellerStem ? (vindStem(film.vertellerStem)?.naam ?? film.vertellerStem) : "(standaard trailerstem)",
    cast: film.cast.map((c) => ({ ...c, stem: c.stem ? `${vindStem(c.stem)?.naam ?? "?"} (${c.stem})` : "(geen stem)", portret: c.portret ? "ja" : "NEE — maak er een" })),
    scenes: film.scenes.map((s) => ({
      nummer: s.nummer,
      titel: s.titel,
      status: s.status,
      samenvatting: s.samenvatting,
      plek: s.plek,
      muziek: s.muziek ?? "",
      shots: s.shots,
      ...(s.video ? { video: s.video } : {}),
      ...(s.feedback ? { feedback: s.feedback } : {}),
      volgende_versie: { nieuwe_shots: teMaken(s, film).length, credits: sceneCredits(s, teMaken(s, film)) },
      geschatte_lengte_sec: Math.round(s.shots.reduce((a, x) => a + (x.dialoog ? spreekSec(x.dialoog.tekst) : x.duur), 0)),
    })),
    eind_film: film.eindCreatieId ?? null,
  };
}

export async function filmGratis(userId: string, projectId: string | undefined, blok: Anthropic.Beta.BetaToolUseBlock): Promise<string> {
  const i = (blok.input ?? {}) as Record<string, unknown>;
  if (blok.name === "film_bekijk") {
    const rij = await filmVanProject(userId, nodigProject(projectId));
    return rij ? JSON.stringify(overzicht(rij.data)) : "Nog geen film in dit project. Leg de opzet vast met film_opzet.";
  }
  if (blok.name === "film_opzet") {
    const t = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
    const stem = t(i.verteller_stem, 80);
    if (stem && !vindStem(stem)) throw new Error("Onbekende verteller-stem: zoek er een met zoek_stemmen.");
    const pas = (f: Film): Film => ({
      ...f,
      ...(t(i.titel, 80) ? { titel: t(i.titel, 80)! } : {}),
      ...(t(i.logline, 600) ? { logline: t(i.logline, 600)! } : {}),
      ...(t(i.stijl, 600) ? { stijl: t(i.stijl, 600)! } : {}),
      ...(i.taal === "nl" || i.taal === "en" ? { taal: i.taal } : {}),
      ...(i.formaat === "16:9" || i.formaat === "9:16" ? { formaat: i.formaat } : {}),
      ...(stem ? { vertellerStem: vindStem(stem)!.id } : {}),
    });
    const rij = await filmVanProject(userId, nodigProject(projectId));
    if (!rij) {
      await maakFilm(userId, projectId!, pas(structuredClone(LEGE_FILM)));
      return "Film aangemaakt.";
    }
    await wijzigFilm(userId, rij.id, pas);
    return "Opzet bijgewerkt.";
  }
  if (blok.name === "film_cast") {
    const rij = await nodigFilm(userId, projectId);
    const ruw = await Promise.all(
      (Array.isArray(i.cast) ? i.cast : []).map(async (x) => {
        const o = (x ?? {}) as Record<string, unknown>;
        return { ...o, portret: o.portret ? await portretUrl(userId, o.portret) : undefined };
      }),
    );
    const film = await wijzigFilm(userId, rij.id, (f) => void (f.cast = leesCast(ruw, f.cast)));
    const zonder = film.cast.filter((c) => !c.portret).map((c) => c.naam);
    return `Cast bijgewerkt: ${film.cast.map((c) => c.naam).join(", ")}.${zonder.length ? ` Nog zonder portret: ${zonder.join(", ")}.` : ""}`;
  }
  if (blok.name === "film_scene_schrijf") {
    const rij = await nodigFilm(userId, projectId);
    let prijs = 0;
    let nieuw = 0;
    await wijzigFilm(userId, rij.id, (f) => {
      const s = leesScene(i, f);
      const oud = f.scenes.find((x) => x.nummer === s.nummer);
      if (oud?.status === "bezig") throw new Error(`Scène ${s.nummer} wordt nu gemaakt; wacht tot hij klaar is.`);
      const scene: Scene = { ...s, status: "concept", ...(oud?.gemaakt ? { gemaakt: oud.gemaakt } : {}), ...(oud?.video ? { video: oud.video } : {}), ...(oud?.creatieId ? { creatieId: oud.creatieId } : {}), ...(oud?.feedback ? { feedback: oud.feedback } : {}) };
      const opnieuw = teMaken(scene, f);
      // Niets veranderd aan een gemaakte scène: zijn status blijft (goedgekeurd blijft goedgekeurd).
      if (oud?.video && !opnieuw.length) scene.status = oud.status;
      else if (oud?.video) scene.status = "feedback";
      f.scenes = [...f.scenes.filter((x) => x.nummer !== s.nummer), scene].sort((a, b) => a.nummer - b.nummer);
      prijs = sceneCredits(scene, opnieuw);
      nieuw = opnieuw.length;
    });
    return `Scène opgeslagen. Maken kost ${prijs} credits (${nieuw} shot(s) nieuw te maken).`;
  }
  if (blok.name === "film_scene_keur") {
    const rij = await nodigFilm(userId, projectId);
    const nummer = Number(i.nummer);
    await wijzigFilm(userId, rij.id, (f) => {
      const s = f.scenes.find((x) => x.nummer === nummer);
      if (!s) throw new Error(`Scène ${nummer} bestaat niet.`);
      if (!s.video) throw new Error(`Scène ${nummer} is nog niet gemaakt.`);
      s.status = i.oordeel === "goedgekeurd" ? "goedgekeurd" : "feedback";
      if (s.status === "feedback") s.feedback = String(i.feedback ?? "").slice(0, 1000);
      else delete s.feedback;
    });
    return i.oordeel === "goedgekeurd" ? `Scène ${nummer} goedgekeurd.` : `Feedback bij scène ${nummer} opgeslagen. Herschrijf de shots die anders moeten (houd de rest gelijk) en maak hem opnieuw.`;
  }
  throw new Error(`Onbekend gereedschap: ${blok.name}`);
}

export async function filmBereidVoor(userId: string, projectId: string | undefined, blok: Anthropic.Beta.BetaToolUseBlock): Promise<Stap> {
  const i = (blok.input ?? {}) as Record<string, unknown>;
  const basis = { toolUseId: blok.id, naam: blok.name, input: i };
  const rij = await nodigFilm(userId, projectId);
  const film = rij.data;
  if (blok.name === "film_scene_maak") {
    const s = film.scenes.find((x) => x.nummer === Number(i.nummer));
    if (!s) throw new Error(`Scène ${String(i.nummer)} bestaat nog niet. Schrijf hem eerst met film_scene_schrijf.`);
    const opnieuw = teMaken(s, film);
    const portretten = [...new Set(s.shots.flatMap((x) => x.inBeeld))].map((n) => film.cast.find((c) => c.naam === n)?.portret).filter((u): u is string => !!u);
    return {
      ...basis,
      maker: "film-scene",
      invoer: { filmId: rij.id, nummer: s.nummer },
      credits: sceneCredits(s, opnieuw),
      omschrijving: `Scène ${s.nummer} "${s.titel}": ${s.shots.length} shots${opnieuw.length < s.shots.length ? ` (${opnieuw.length} nieuw, ${s.shots.length - opnieuw.length} blijven staan)` : ""}`,
      details: {
        beelden: portretten.slice(0, 4),
        regels: s.shots.map((x) => {
          const nieuw = opnieuw.some((o) => o.id === x.id) ? "" : " (blijft)";
          if (x.dialoog) return `🗣️ ${x.dialoog.wie}: "${x.dialoog.tekst}"${nieuw}`;
          return `🎬 ${x.beeld.slice(0, 100)}${x.verteller ? ` — 🎙️ "${x.verteller}"` : ""}${nieuw}`;
        }),
      },
    };
  }
  if (blok.name === "film_monteer") {
    const klaar = film.scenes.filter((s) => s.status === "goedgekeurd" && s.video);
    if (!klaar.length) throw new Error("Er is nog geen goedgekeurde scène.");
    const open = film.scenes.filter((s) => s.status !== "goedgekeurd").map((s) => s.nummer);
    return {
      ...basis,
      maker: "film",
      invoer: { filmId: rij.id },
      credits: 0,
      omschrijving: `De film "${film.titel}" monteren: ${klaar.length} goedgekeurde scène(s)${open.length ? ` (nog niet goedgekeurd en dus niet mee: ${open.join(", ")})` : ""}`,
    };
  }
  throw new Error(`Onbekend gereedschap: ${blok.name}`);
}

/** Het keuzemenu bij een scène ter keuring: de video, goedkeuren of aanpassen. */
export async function filmOpties(userId: string, projectId: string | undefined, input: Record<string, unknown>): Promise<Optie[]> {
  const rij = await nodigFilm(userId, projectId);
  const n = Number(input.scene_nummer);
  const s = rij.data.scenes.find((x) => x.nummer === n);
  if (!s?.video) throw new Error(`Scène ${n} heeft nog geen video.`);
  return [
    { label: "✅ Goedkeuren", waarde: `Scène ${n}: goedgekeurd`, video: s.video },
    { label: "✏️ Aanpassen", waarde: `Scène ${n}: ik wil iets aanpassen`, uitleg: "Of typ hieronder meteen wat er anders moet." },
  ];
}

export { vingerafdruk };
