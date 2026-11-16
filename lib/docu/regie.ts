// DE REGIE van een docu. De video zelf loopt door de motion-machine (lib/motion/regie.ts):
// stem → animatie → video, met maker 'docu'. Daar omheen doet dit bestand twee dingen:
//   - startDocu: de invoer van het scherm lezen (script, feiten, foto's) en de foto's met hun
//     vermelding in het script zetten, zodat de tekenaar weet welke foto waar hoort;
//   - voegPakketToe: als de video klaar is, het YouTube-pakket maken (titels, beschrijving,
//     thumbnail) en de Short starten als eigen rij in de bibliotheek.
// Alleen op de server.

import { isDocuStijl } from "./kanalen";
import type { Creatie } from "@/lib/creaties/types";
import { uploadNaarOpslag, WachtrijFout } from "@/lib/creaties/wachtrij";
import { startMotion } from "@/lib/motion/regie";
import { createServiceClient } from "@/lib/supabase/service";
import { canUseDocu } from "@/lib/studio/access";
import { scriptVan, type PaginaBasis } from "@/lib/motion/lang";
import { sceneTijden } from "@/lib/motion/animatie";
import { eigenOpslag } from "@/lib/motion/beelden";
import type { WhisperWord } from "@/lib/openai";
import { leesTaal, type MotionBeeld, type MotionInvoer, type MotionPlan, type MotionTaal } from "@/lib/motion/types";
import { maakPakket, maakThumbnail, schrijfShort } from "./extras";
import { DOCU_VERTELLERS, docuCredits, docuMuziek, fotoCredit, isDocuLengte, type DocuControle, type DocuExtras, type DocuFeit, type DocuFoto, type DocuInvoer } from "./types";

const kort = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

function leesFeiten(ruw: unknown): DocuFeit[] {
  return (Array.isArray(ruw) ? ruw : [])
    .map((f) => (f ?? {}) as Record<string, unknown>)
    .filter((f) => typeof f.url === "string" && /^https?:\/\//.test(f.url))
    .slice(0, 200)
    .map((f) => ({ id: kort(f.id, 8), feit: kort(f.feit, 300), bron: kort(f.bron, 120), url: kort(f.url, 500) }));
}

function leesControle(ruw: unknown): DocuControle {
  const c = (ruw ?? {}) as Record<string, unknown>;
  return {
    gecontroleerd: Math.max(0, Math.round(Number(c.gecontroleerd) || 0)),
    verbeterd: (Array.isArray(c.verbeterd) ? c.verbeterd : []).slice(0, 100).map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { scene: Math.round(Number(o.scene) || 0), was: kort(o.was, 600), nu: kort(o.nu, 600), reden: kort(o.reden, 400) };
    }),
  };
}

/** Alleen foto's op onze eigen opslag: de server haalt ze op, dus geen adressen van buiten. */
function leesFotos(ruw: unknown): DocuFoto[] {
  return (Array.isArray(ruw) ? ruw : [])
    .map((f) => (f ?? {}) as Record<string, unknown>)
    .filter((f) => eigenOpslag(f.url) && /^f\d{1,3}$/.test(String(f.id)) && Number.isInteger(f.scene))
    .slice(0, 120)
    .map((f) => ({
      id: String(f.id),
      url: f.url as string,
      scene: f.scene as number,
      wat: kort(f.wat, 160),
      maker: kort(f.maker, 60),
      licentie: kort(f.licentie, 40),
      bron: kort(f.bron, 300),
      w: Math.round(Number(f.w) || 1600),
      h: Math.round(Number(f.h) || 900),
    }));
}

/** Zet bij elke scene met een foto in het beeld welke foto het is en wat de vermelding is. */
export function planMetFotos(plan: MotionPlan, fotos: DocuFoto[], taal: MotionTaal): MotionPlan {
  return {
    ...plan,
    scenes: plan.scenes.map((s, i) => {
      const hier = fotos.filter((f) => f.scene === i + 1);
      // "Nog eens" start met het plan uit de rij, waar de aanwijzingen al in staan.
      // Alleen een aanwijzing mét id telt: het script zelf schrijft ook "Archieffoto van ...",
      // en daarop stoppen liet in de tweede proef (14-11-2026) alle foto's uit de video.
      if (!hier.length || /^Archieffoto f\d+ /.test(s.beeld)) return s;
      const regels = hier.map((f) => `Archieffoto ${f.id} (${f.wat || "archieffoto"}), beeldvullend. Vermelding linksonder: "${fotoCredit(f, taal)}".`);
      return { ...s, beeld: `${regels.join(" ")} ${s.beeld}` };
    }),
  };
}

const alsBeelden = (fotos: DocuFoto[], taal: MotionTaal): MotionBeeld[] =>
  fotos.map((f) => ({ id: f.id, url: f.url, doel: "tonen", uitleg: `${f.wat} (${fotoCredit(f, taal)})`.slice(0, 240) }));

export async function startDocu(userId: string, ruw: Record<string, unknown>, ouderId?: string | null): Promise<Creatie> {
  // De studio staat nog niet open voor klanten: ook niet via een losse aanvraag.
  const { data: wie } = await createServiceClient().auth.admin.getUserById(userId);
  if (!canUseDocu(wie?.user?.email)) throw new WachtrijFout("Deze studio is nog niet beschikbaar voor jouw account.", 403);
  if (!isDocuLengte(ruw.lengte)) throw new WachtrijFout("Kies een lengte voor je documentaire.", 400);
  const lengte = ruw.lengte;
  const taal = leesTaal(ruw.taal);
  const short = ruw.short !== false;
  const fotos = leesFotos(ruw.fotos);
  const docu: DocuInvoer = {
    onderwerp: kort(ruw.onderwerp, 300),
    feiten: leesFeiten(ruw.feiten),
    controle: leesControle(ruw.controle),
    fotos,
    short,
  };
  if (!docu.feiten.length) throw new WachtrijFout("Er is nog geen onderzoek gedaan. Laat eerst het script schrijven.", 400);
  // Russell (de vaste Engelse verteller) staat niet in de stemmenbibliotheek; die zou
  // het lezen van de invoer anders terugzetten naar Hugo.
  const verteller = DOCU_VERTELLERS[taal];
  const eigenVerteller = !!verteller && ruw.stem === verteller.id;

  return startMotion(
    userId,
    // Een docu is altijd liggend, een verhaal, in de stijl "archief" (daar zijn de sjablonen in
    // public/motion/docu.js voor gemaakt), en heeft geen voorbeelden van de klant.
    // De grote woord-voor-woord-letters botsen in een liggende docu met de jaartallen en de
    // fotovermelding onderin; die zijn voor de Short.
    { ...ruw, ondertitels: ruw.ondertitels === "woord" ? "balk" : ruw.ondertitels, soort: "verhaal", formaat: "16:9", bedrijf: kort(ruw.kanaal, 40), stijl: isDocuStijl(ruw.stijl) ? ruw.stijl : "archief", beelden: [] },
    ouderId,
    {
      maker: "docu",
      credits: docuCredits(lengte, short),
      omschrijving: "Nieuwe app: docu",
      pas: (i: MotionInvoer) => ({
        ...i,
        ...(eigenVerteller ? { stem: verteller!.id } : {}),
        // De motion-studio kent alleen vrolijke en zakelijke muziek.
        muziek: docuMuziek(ruw.muziek),
        beelden: alsBeelden(fotos, taal),
        plan: planMetFotos(i.plan, fotos, taal),
      }),
      prompt: `Docu: ${kort((ruw.plan as { titel?: unknown } | undefined)?.titel, 80) || docu.onderwerp}`,
      extra: { docu },
    },
  );
}

/**
 * Het YouTube-pakket bij een docu waarvan de video net klaar is. Geeft de invoer terug met
 * docu.extras erin. Faalt nooit: wat misgaat, staat in extras.fout.
 */
export async function voegPakketToe(c: Creatie, invoer: Record<string, unknown>, v: { woorden: WhisperWord[]; basis: PaginaBasis }): Promise<Record<string, unknown>> {
  const r = invoer as unknown as MotionInvoer & { docu?: DocuInvoer; voortgang?: { gebruik?: { usd: number } } };
  const docu = r.docu;
  if (!docu) return invoer;
  const taal = leesTaal(r.taal);
  const extras: DocuExtras = {};
  const fouten: string[] = [];
  let usd = 0;
  // Het plan zoals de klant het goedkeurde, zonder de foto-aanwijzingen voor de tekenaar.
  const plan = r.plan;

  try {
    const leeg = await sceneTijden({ ...v.basis, fotos: {}, woorden: v.woorden, script: scriptVan(plan) });
    const starts = leeg.scenes.map(([, t]) => t);
    const pakket = await maakPakket({ plan, feiten: docu.feiten, fotos: docu.fotos, starts, taal, kanaal: r.bedrijf });
    usd += pakket.usd;
    extras.titels = pakket.titels;
    extras.beschrijving = pakket.beschrijving;
    try {
      const foto = docu.fotos.find((f) => f.id === pakket.thumbFoto);
      const buf = foto ? Buffer.from(await (await fetch(foto.url)).arrayBuffer()) : null;
      const jpg = await maakThumbnail({ foto: buf, kop: pakket.thumbKop || plan.titel, accent: pakket.thumbAccent, kanaal: r.bedrijf, kleur: r.kleur });
      extras.thumbnail = await uploadNaarOpslag(c.user_id, jpg, "jpg", "image/jpeg");
    } catch (e) {
      fouten.push(`Thumbnail: ${e instanceof Error ? e.message : String(e)}`);
    }
  } catch (e) {
    fouten.push(`Beschrijving: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (docu.short) {
    try {
      const s = await schrijfShort({ plan, fotos: docu.fotos, taal, kanaal: r.bedrijf });
      usd += s.usd;
      const fotos = docu.fotos.filter((f) => s.fotos.includes(f.id));
      const kind = await startMotion(
        c.user_id,
        {
          onderwerp: docu.onderwerp,
          // Geen merk linksboven in de Short, net als in de docu zelf.
          bedrijf: "",
          website: "",
          kleur: r.kleur,
          kleur2: r.kleur2,
          formaat: "9:16",
          lengte: 45,
          muziek: r.muziek,
          muziekUrl: r.muziekUrl,
          muziekVolume: r.muziekVolume,
          stijl: r.stijl,
          soort: "verhaal",
          taal,
          stem: r.stem,
          plan: s.plan,
          logo: "",
          font: r.font,
          beelden: [],
          // Een Short wordt vaak zonder geluid bekeken: dan de grote woord-voor-woord-letters.
          ondertitels: r.ondertitels && r.ondertitels !== "uit" ? "woord" : "uit",
          // Eén mail voor de docu is genoeg.
          mail: false,
        },
        c.id,
        {
          // De Short zit in de prijs van de docu.
          credits: 0,
          prompt: `Short: ${s.plan.titel || plan.titel}`,
          pas: (i) => ({ ...i, stem: r.stem, muziek: r.muziek, beelden: alsBeelden(fotos, taal).map((b) => ({ ...b, uitleg: `${b.uitleg}. Zet de vermelding klein in beeld zolang de foto te zien is.` })) }),
        },
      );
      extras.shortId = kind.id;
    } catch (e) {
      fouten.push(`Short: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (fouten.length) {
    console.error("[docu] pakket niet compleet:", fouten);
    extras.fout = fouten.join(" · ").slice(0, 600);
  }
  const voortgang = r.voortgang ? { ...r.voortgang, gebruik: { ...(r.voortgang.gebruik ?? { usd: 0, rondes: 0 }), usd: (r.voortgang.gebruik?.usd ?? 0) + usd } } : r.voortgang;
  return { ...invoer, voortgang, docu: { ...docu, extras } };
}
