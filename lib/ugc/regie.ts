// DE REGIE van een UGC-video: één rij in de bibliotheek (maker 'ugc') die vanzelf door
// drie stappen loopt, op dezelfde manier als de reclame (lib/reclame/regie.ts):
//
//   voorbereiden — per stukje een beeld (creator met product, of een B-roll-close-up)
//                  en tegelijk de stem van de creator
//   video        — praatstukjes: lipsync op beeld + stem; B-roll: het beeld beweegt
//   monteren     — alles achter elkaar, met meelopende ondertitels (lib/ugc/montage.ts)
//
// Elke overgang is een voorwaardelijke update op de huidige stap: twee schermen die
// tegelijk de stand opvragen, starten een stap nooit twee keer (dan betalen wij dubbel).

import { after } from "next/server";
import { fal } from "@/lib/fal";
import { zetKostenContext } from "@/lib/provider-kosten";
import { createServiceClient } from "@/lib/supabase/service";
import { videoModel } from "@/lib/video-modellen";
import { LIPSYNC_MODEL } from "@/lib/lipsync";
import { MAX_TEGELIJK, WachtrijFout, falReden, markeerMislukt, uploadNaarOpslag } from "@/lib/creaties/wachtrij";
import { betaal, betaalTerug } from "@/lib/team/team";
import { eigenKopie } from "@/lib/reclame/regie";
import type { Creatie } from "@/lib/creaties/types";
import { controleerUgcScript, type UgcOnderwerp } from "./script";
import { vasteCreator } from "./creators";
import { monteerUgc } from "./montage";
import { isBibliotheekStem } from "@/lib/stem/bibliotheek";
import { UGC_BROLL_MODEL, UGC_LENGTES, isUgcStem, ugcCredits, type Creator, type UgcLengte, type UgcScript, type UgcStap } from "./types";

fal.config({ credentials: process.env.FAL_KEY });

const BEELD_MODEL = "fal-ai/nano-banana-pro/edit";
const BEELD_ZONDER_FOTO = "fal-ai/nano-banana-pro";
const STEM_MODEL = "fal-ai/elevenlabs/tts/eleven-v3";

// Lipsync duurt ~2 minuten per clip; met een wachtrij bij fal ruim binnen 45 minuten.
const TIJDSLIMIET_MS = 45 * 60 * 1000;
const VASTGELOPEN_MS = 4 * 60 * 1000;

export interface UgcInvoer {
  onderwerp: UgcOnderwerp;
  /** Productfoto op onze opslag; leeg bij een dienst zonder foto. */
  fotoUrl: string | null;
  creator: Pick<Creator, "id" | "naam" | "portretUrl" | "stem" | "persona">;
  sec: UgcLengte;
  broll: boolean;
  script: UgcScript;
}

interface Voortgang {
  stap: UgcStap;
  sinds: string;
  beelden: string[];
  stemmen: string[];
  /** Na stap 1: de echte adressen van de stemmen, nodig voor lipsync én montage. */
  audio?: string[];
  videos?: string[];
}

type RijInvoer = UgcInvoer & { voortgang?: Voortgang };
const rij = (c: Creatie) => c.invoer as unknown as RijInvoer;

function tekst(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Het onderwerp zoals de klant het invulde, opgeschoond. Ook gebruikt door de scriptroute. */
export function leesOnderwerp(ruw: unknown, metProduct: boolean): UgcOnderwerp {
  const o = (ruw ?? {}) as Record<string, unknown>;
  const onderwerp: UgcOnderwerp = {
    naam: tekst(o.naam, 80),
    omschrijving: tekst(o.omschrijving, 600),
    voordelen: (Array.isArray(o.voordelen) ? o.voordelen : []).map((v) => tekst(v, 80)).filter(Boolean).slice(0, 3),
    website: tekst(o.website, 60).replace(/^https?:\/\//, "").replace(/\/$/, ""),
    metProduct,
  };
  if (!onderwerp.naam) throw new Error("Vul eerst in waar de video over gaat.");
  return onderwerp;
}

/**
 * De creator: een vaste uit de set, of een eigen (een creatie met maker 'ugc-creator'
 * van deze gebruiker). Nooit een willekeurig portret-adres uit de browser: dan zou
 * iemand elk gezicht van internet kunnen laten praten.
 */
export async function leesCreator(userId: string, ruw: unknown): Promise<UgcInvoer["creator"]> {
  const id = typeof ruw === "string" ? ruw : (ruw as { id?: unknown })?.id;
  const vast = vasteCreator(id);
  if (vast) return { id: vast.id, naam: vast.naam, portretUrl: vast.portretUrl, stem: vast.stem, persona: vast.persona };
  if (typeof id !== "string") throw new Error("Kies eerst een creator.");
  const { data } = await createServiceClient()
    .from("creaties")
    .select("id, url, invoer, status")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("maker", "ugc-creator")
    .maybeSingle();
  if (!data || data.status !== "klaar" || !data.url) throw new Error("Deze creator is niet (meer) beschikbaar.");
  const inv = data.invoer as { naam?: string; beschrijving?: string; stem?: string };
  return {
    id: data.id,
    naam: inv.naam || "Creator",
    portretUrl: data.url,
    stem: isUgcStem(inv.stem) || isBibliotheekStem(inv.stem) ? inv.stem : "kZQ3IGqYUStQ8u1Y62s6",
    persona: inv.beschrijving || "Gewone, eerlijke gebruiker.",
  };
}

function beeldOpdracht(r: UgcInvoer, i: number) {
  const s = r.script.stukjes[i];
  const echt = "Photorealistic, vertical 9:16 smartphone video still, natural light, authentic UGC look, no text, no captions, no phone interface.";
  if (s.soort === "broll") {
    return r.fotoUrl
      ? { endpoint: BEELD_MODEL, input: { prompt: `${s.beeld} The product is exactly the product from the reference photo: same shape, colors, label and logo. ${echt}`, image_urls: [r.fotoUrl] } }
      : { endpoint: BEELD_ZONDER_FOTO, input: { prompt: `${s.beeld} ${echt}` } };
  }
  const product = r.fotoUrl ? " The product they hold or show is exactly the product from the second reference image: same shape, colors, label and logo." : "";
  return {
    endpoint: BEELD_MODEL,
    input: {
      prompt: `The person from the first reference image, filmed as a vertical selfie with the phone's front camera, looking into the camera, mouth closed, about to speak. ${s.beeld}${product} The mouth stays completely free: not eating, not drinking, nothing near the face; any product is held at chest height so the whole face is visible. Keep the person's face, hair, age and skin tone exactly the same as in the first reference image. ${echt}`,
      image_urls: r.fotoUrl ? [r.creator.portretUrl, r.fotoUrl] : [r.creator.portretUrl],
    },
  };
}

export async function startUgc(userId: string, ruw: Record<string, unknown>, ouderId?: string | null): Promise<Creatie> {
  let invoer: UgcInvoer;
  try {
    const sec = UGC_LENGTES.some((l) => l.sec === ruw.sec) ? (ruw.sec as UgcLengte) : 15;
    const broll = ruw.broll === true;
    const foto = tekst(ruw.fotoUrl, 2000);
    invoer = {
      onderwerp: leesOnderwerp(ruw.onderwerp, /^https:\/\//.test(foto)),
      fotoUrl: /^https:\/\//.test(foto) ? foto : null,
      // Een andere stem dan de vaste van de creator mag (de Regisseur laat de gebruiker kiezen).
      creator: { ...(await leesCreator(userId, ruw.creator)), ...(isUgcStem(ruw.stem) || isBibliotheekStem(ruw.stem) ? { stem: ruw.stem } : {}) },
      sec,
      broll,
      script: controleerUgcScript(ruw.script, broll),
    };
  } catch (e) {
    throw new WachtrijFout(e instanceof Error ? e.message : String(e), 400);
  }

  const db = createServiceClient();
  const { count } = await db.from("creaties").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "bezig");
  if ((count ?? 0) >= MAX_TEGELIJK) {
    throw new WachtrijFout(`Je hebt al ${MAX_TEGELIJK} dingen in de maak. Wacht tot er één klaar is.`, 429);
  }
  if (invoer.fotoUrl) invoer.fotoUrl = await eigenKopie(userId, invoer.fotoUrl);

  const { ok, betaald, betalerId } = await betaal(userId, ugcCredits(invoer.script), "Nieuwe app: UGC-video");
  if (!ok) throw new WachtrijFout("Niet genoeg credits.", 402);

  const voortgang: Voortgang = { stap: "voorbereiden", sinds: new Date().toISOString(), beelden: [], stemmen: [] };
  const { data: nieuw, error } = await db
    .from("creaties")
    .insert({
      user_id: userId,
      soort: "video",
      status: "bezig",
      maker: "ugc",
      model: "ugc",
      prompt: `UGC: ${invoer.onderwerp.naam} (${invoer.creator.naam})`,
      invoer: { ...invoer, formaat: "9:16", voortgang },
      credits: betaald,
      fal_endpoint: "ugc",
      ouder_id: ouderId ?? null,
      ...(betalerId !== userId ? { betaald_door: betalerId } : {}),
    })
    .select("*")
    .single();
  if (error || !nieuw) {
    await betaalTerug({ user_id: userId, betaald_door: betalerId, credits: betaald }, "Terug: UGC-video niet gestart");
    throw new WachtrijFout("Kon de opdracht niet opslaan. Probeer het opnieuw.", 500);
  }

  try {
    const [beelden, stemmen] = await Promise.all([
      Promise.all(
        invoer.script.stukjes.map(async (_, i) => {
          const b = beeldOpdracht(invoer, i);
          const { request_id } = await fal.queue.submit(b.endpoint, {
            input: { ...b.input, aspect_ratio: "9:16", num_images: 1, output_format: "jpeg" } as never,
          });
          return `${b.endpoint}|${request_id}`;
        }),
      ),
      Promise.all(
        invoer.script.stukjes.map(async (s) => {
          const { request_id } = await fal.queue.submit(STEM_MODEL, {
            input: { text: s.tekst, voice: invoer.creator.stem, language_code: "nl", stability: 0.5, similarity_boost: 0.75, speed: 1 } as never,
          });
          return request_id;
        }),
      ),
    ]);
    return await werkBij(nieuw as Creatie, { ...voortgang, beelden, stemmen });
  } catch (e) {
    const reden = falReden(e);
    console.error("[ugc] insturen mislukt:", reden);
    return (await markeerMislukt(nieuw as Creatie, `Insturen mislukt: ${reden}`)) ?? (nieuw as Creatie);
  }
}

async function werkBij(c: Creatie, voortgang: Voortgang): Promise<Creatie> {
  const invoer = { ...rij(c), voortgang };
  const { data } = await createServiceClient().from("creaties").update({ invoer }).eq("id", c.id).select("*").single();
  return (data as Creatie | null) ?? { ...c, invoer };
}

async function claim(c: Creatie, van: Voortgang, naar: Voortgang): Promise<Creatie | null> {
  const { data } = await createServiceClient()
    .from("creaties")
    .update({ invoer: { ...rij(c), voortgang: naar } })
    .eq("id", c.id)
    .eq("status", "bezig")
    .eq("invoer->voortgang->>stap", van.stap)
    .eq("invoer->voortgang->>sinds", van.sinds)
    .select("*")
    .maybeSingle();
  return data as Creatie | null;
}

/** Beelden staan als "endpoint|request_id": een B-roll zonder productfoto gaat via een ander model. */
function splits(sleutel: string): [string, string] {
  const i = sleutel.lastIndexOf("|");
  return [sleutel.slice(0, i), sleutel.slice(i + 1)];
}

async function allesKlaar(paren: [string, string][]): Promise<boolean> {
  const st = await Promise.all(
    paren.map(async ([e, id]) => ((await fal.queue.status(e, { requestId: id, logs: false })) as { status: string }).status),
  );
  return st.every((s) => s === "COMPLETED");
}

async function resultaat(endpoint: string, id: string): Promise<string> {
  const { data } = await fal.queue.result(endpoint, { requestId: id });
  const d = data as { images?: { url?: string }[]; video?: { url?: string }; audio?: { url?: string } };
  const url = d.images?.[0]?.url ?? d.video?.url ?? d.audio?.url;
  if (!url) throw new Error("Er kwam geen resultaat terug.");
  return url;
}

function videoEndpoint(r: UgcInvoer, i: number): string {
  return r.script.stukjes[i].soort === "broll" ? videoModel(UGC_BROLL_MODEL).slug : LIPSYNC_MODEL;
}

export async function verversUgc(c: Creatie): Promise<Creatie> {
  if (c.status !== "bezig") return c;
  const r = rij(c);
  const v = r.voortgang;
  if (!v) return (await markeerMislukt(c, "De opdracht is niet goed aangekomen.")) ?? c;
  if (Date.now() - new Date(c.created_at).getTime() > TIJDSLIMIET_MS) return (await markeerMislukt(c, "Het duurde te lang.")) ?? c;
  zetKostenContext(c.user_id, "Nieuwe app: UGC-video");
  const vast = Date.now() - new Date(v.sinds).getTime() > VASTGELOPEN_MS;

  try {
    if (v.stap === "voorbereiden") {
      if (v.beelden.length === 0) return vast ? ((await markeerMislukt(c, "De opdracht is niet goed aangekomen.")) ?? c) : c;
      const paren: [string, string][] = [...v.beelden.map(splits), ...v.stemmen.map((id) => [STEM_MODEL, id] as [string, string])];
      if (!(await allesKlaar(paren))) return c;
      const naar: Voortgang = { ...v, stap: "video", sinds: new Date().toISOString(), videos: [] };
      const gewonnen = await claim(c, v, naar);
      return gewonnen ? await startVideos(gewonnen, naar) : c;
    }
    if (v.stap === "video") {
      if (!v.videos?.length) return vast ? ((await markeerMislukt(c, "De video's zijn niet goed aangekomen.")) ?? c) : c;
      if (!(await allesKlaar(v.videos.map((id, i) => [videoEndpoint(r, i), id])))) return c;
      return await startMontage(c, v);
    }
    if (v.stap === "monteren" && vast) return await startMontage(c, v);
    return c;
  } catch (e) {
    const reden = falReden(e);
    if (/weigerde|geen resultaat|422|content|recogni/i.test(reden)) return (await markeerMislukt(c, reden)) ?? c;
    console.error("[ugc] verder zetten mislukt, later opnieuw:", reden);
    return c;
  }
}

async function startVideos(c: Creatie, v: Voortgang): Promise<Creatie> {
  const r = rij(c);
  const [beelden, audio] = await Promise.all([
    Promise.all(v.beelden.map((s) => resultaat(...splits(s)))),
    Promise.all(v.stemmen.map((id) => resultaat(STEM_MODEL, id))),
  ]);
  const model = videoModel(UGC_BROLL_MODEL);
  const videos = await Promise.all(
    r.script.stukjes.map(async (s, i) => {
      const input =
        s.soort === "broll"
          ? model.invoer({ image_url: beelden[i], prompt: `${s.beeld} Subtle handheld phone camera movement. The product keeps exactly the same shape, colors and label. No text.` })
          : // Zonder aanwijzing maakte het model soms wilde handgebaren; een UGC-creator praat rustig in de camera.
            { image_url: beelden[i], audio_url: audio[i], prompt: "Talking naturally to the front camera like a social media creator, subtle head movement, natural blinking, relaxed." };
      const { request_id } = await fal.queue.submit(videoEndpoint(r, i), { input: input as never });
      return request_id;
    }),
  );
  return werkBij(c, { ...v, audio, videos });
}

async function startMontage(c: Creatie, v: Voortgang): Promise<Creatie> {
  const naar: Voortgang = { ...v, stap: "monteren", sinds: new Date().toISOString() };
  const gewonnen = await claim(c, v, naar);
  if (!gewonnen) return c;
  const werk = () => voerMontageUit(gewonnen, naar);
  try {
    after(werk);
  } catch {
    void werk();
  }
  return gewonnen;
}

async function voerMontageUit(c: Creatie, v: Voortgang): Promise<void> {
  const r = rij(c);
  try {
    const clips = await Promise.all((v.videos ?? []).map((id, i) => resultaat(videoEndpoint(r, i), id)));
    const mp4 = await monteerUgc({ clips, audio: v.audio ?? [], teksten: r.script.stukjes.map((s) => s.tekst) });
    const url = await uploadNaarOpslag(c.user_id, mp4, "mp4", "video/mp4");
    await createServiceClient()
      .from("creaties")
      .update({ status: "klaar", url, klaar_op: new Date().toISOString() })
      .eq("id", c.id)
      .eq("status", "bezig");
  } catch (e) {
    const reden = falReden(e);
    console.error("[ugc] montage mislukt:", reden);
    await markeerMislukt(c, `Montage mislukt: ${reden}`);
  }
}
