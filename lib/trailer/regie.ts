// DE REGIE van een trailer: één rij in de bibliotheek (maker 'trailer') die vanzelf door
// vier stappen loopt, op dezelfde manier als de reclame en de UGC-video:
//
//   personages — één portret per personage: het gezicht dat in elk shot terugkomt
//   beelden    — per clip een filmbeeld, met de portretten als voorbeeld
//   clips      — die beelden bewegen (Kling 2.5); de stemmen zijn dan al klaar
//   monteren   — volgens de tijdlijn (lib/trailer/montage.ts)
//
// Elke overgang via een voorwaardelijke update op de huidige stap: twee schermen die
// tegelijk de stand opvragen, starten een stap nooit twee keer.

import { after } from "next/server";
import { fal } from "@/lib/fal";
import { zetKostenContext } from "@/lib/provider-kosten";
import { createServiceClient } from "@/lib/supabase/service";
import { videoModel } from "@/lib/video-modellen";
import { musicTrackUrl } from "@/lib/music/library";
import { MAX_TEGELIJK, WachtrijFout, falReden, markeerMislukt, uploadNaarOpslag } from "@/lib/creaties/wachtrij";
import { betaal, betaalTerug } from "@/lib/team/team";
import type { Creatie } from "@/lib/creaties/types";
import { controleerTrailerPlan } from "./plan";
import { monteerTrailer } from "./montage";
import { GENRES, TRAILER_LENGTES, TRAILER_VIDEOMODEL, trailerCredits, type GenreId, type TrailerLengte, type TrailerPlan, type TrailerStap } from "./types";

fal.config({ credentials: process.env.FAL_KEY });

const BEELD = "fal-ai/nano-banana-pro";
const BEELD_MET_VOORBEELD = "fal-ai/nano-banana-pro/edit";
const STEM_MODEL = "fal-ai/elevenlabs/tts/eleven-v3";
const TIJDSLIMIET_MS = 60 * 60 * 1000;
const VASTGELOPEN_MS = 5 * 60 * 1000;

/** De verteller: een diepe, kalme stem, zoals in echte trailers. */
const VERTELLER = "YXgx21dvgkRwunWFpa5d"; // Jamie
const MANNEN = ["2GJZCZIWrWiGFDntCFaz", "yGnXd97Wft6RDkIaLXiR", "0qLmDzgqulxcvv0yf3kg"]; // Bram, Pepijn, Remko
const VROUWEN = ["XCOm4Hr4NoqIsKeVFU2y", "7qdUFMklKPaaAVMsBTBt", "qpYcCnnbKrqp5HBM19ou"]; // Linda, Roos, Mia

const MUZIEK: Record<GenreId, string> = { fantasy: "episch-inspirerend" };

const FILMLOOK: Record<GenreId, string> = {
  fantasy:
    "Photorealistic cinematic film still from a big-budget epic fantasy series, anamorphic lens, shallow depth of field, dramatic natural lighting, cool desaturated blues and greys with warm firelight accents, subtle film grain. No text, no logos, no watermark.",
};

export interface TrailerInvoer {
  genre: GenreId;
  sec: TrailerLengte;
  plan: TrailerPlan;
}

interface Voortgang {
  stap: TrailerStap;
  sinds: string;
  portretten: string[];
  portretUrls?: string[];
  beelden?: string[];
  clips?: string[];
  /** Per element-index met een zin: het stemverzoek. */
  stemmen: { i: number; id: string }[];
}

type RijInvoer = TrailerInvoer & { voortgang?: Voortgang };
const rij = (c: Creatie) => c.invoer as unknown as RijInvoer;

/** Welke stem bij wie hoort: de verteller vast, de personages op volgorde per geslacht. */
export function stemVoor(wie: string, plan: Pick<TrailerPlan, "personages">): string {
  const p = plan.personages.find((x) => x.naam === wie);
  if (!p) return VERTELLER;
  const zelfde = plan.personages.filter((x) => x.geslacht === p.geslacht);
  const lijst = p.geslacht === "vrouw" ? VROUWEN : MANNEN;
  return lijst[zelfde.indexOf(p) % lijst.length];
}

function portretOpdracht(plan: TrailerPlan, genre: GenreId, i: number) {
  const p = plan.personages[i];
  return {
    prompt: `Character reference portrait for a film: ${p.uiterlijk}. Three-quarter view, head and shoulders, neutral expression, plain dark background, even soft key light so the face, hair and costume are clearly visible. ${FILMLOOK[genre]}`,
    aspect_ratio: "1:1",
    num_images: 1,
    output_format: "jpeg",
    resolution: "2K",
  };
}

function beeldOpdracht(plan: TrailerPlan, genre: GenreId, i: number, portretten: string[]) {
  const c = plan.clips[i];
  const wie = c.personages.map((n) => plan.personages.findIndex((p) => p.naam === n)).filter((k) => k >= 0 && portretten[k]);
  const cast = wie
    .map((k, j) => `${plan.personages[k].naam} is the person from reference image ${j + 1} (${plan.personages[k].uiterlijk}); keep the face, hair and costume exactly the same.`)
    .join(" ");
  return {
    endpoint: wie.length ? BEELD_MET_VOORBEELD : BEELD,
    input: {
      prompt: `${c.beeld} ${cast} Widescreen 16:9 composition. ${FILMLOOK[genre]}`,
      ...(wie.length ? { image_urls: wie.map((k) => portretten[k]) } : {}),
      aspect_ratio: "16:9",
      num_images: 1,
      output_format: "jpeg",
      resolution: "2K",
    },
  };
}

export function leesTrailerInvoer(ruw: Record<string, unknown>): TrailerInvoer {
  const genre = GENRES.some((g) => g.id === ruw.genre) ? (ruw.genre as GenreId) : "fantasy";
  const sec = TRAILER_LENGTES.some((l) => l.sec === ruw.sec) ? (ruw.sec as TrailerLengte) : 60;
  return { genre, sec, plan: controleerTrailerPlan(ruw.plan, sec) };
}

export async function startTrailer(userId: string, ruw: Record<string, unknown>, ouderId?: string | null): Promise<Creatie> {
  let invoer: TrailerInvoer;
  try {
    invoer = leesTrailerInvoer(ruw);
  } catch (e) {
    throw new WachtrijFout(e instanceof Error ? e.message : String(e), 400);
  }
  const db = createServiceClient();
  const { count } = await db.from("creaties").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "bezig");
  if ((count ?? 0) >= MAX_TEGELIJK) throw new WachtrijFout(`Je hebt al ${MAX_TEGELIJK} dingen in de maak. Wacht tot er één klaar is.`, 429);

  const { ok, betaald, betalerId } = await betaal(userId, trailerCredits(invoer.plan), "Nieuwe app: trailer");
  if (!ok) throw new WachtrijFout("Niet genoeg credits.", 402);

  const zonderPersonages = invoer.plan.personages.length === 0;
  const voortgang: Voortgang = { stap: zonderPersonages ? "beelden" : "personages", sinds: new Date().toISOString(), portretten: [], stemmen: [] };
  const { data: nieuw, error } = await db
    .from("creaties")
    .insert({
      user_id: userId,
      soort: "video",
      status: "bezig",
      maker: "trailer",
      model: "trailer",
      prompt: `Trailer: ${invoer.plan.titel}`,
      invoer: { ...invoer, formaat: "16:9", voortgang },
      credits: betaald,
      fal_endpoint: "trailer",
      ouder_id: ouderId ?? null,
      ...(betalerId !== userId ? { betaald_door: betalerId } : {}),
    })
    .select("*")
    .single();
  if (error || !nieuw) {
    await betaalTerug({ user_id: userId, betaald_door: betalerId, credits: betaald }, "Terug: trailer niet gestart");
    throw new WachtrijFout("Kon de opdracht niet opslaan. Probeer het opnieuw.", 500);
  }

  try {
    // De stemmen hangen nergens van af: meteen insturen, dan zijn ze klaar als de clips komen.
    const stemmen = await Promise.all(
      invoer.plan.tijdlijn.flatMap((e, i) =>
        e.regel?.tekst
          ? [
              fal.queue
                .submit(STEM_MODEL, {
                  input: { text: e.regel.tekst, voice: stemVoor(e.regel.wie, invoer.plan), language_code: "nl", stability: 0.45, similarity_boost: 0.8, speed: 0.95 } as never,
                })
                .then((s) => ({ i, id: s.request_id })),
            ]
          : [],
      ),
    );
    if (zonderPersonages) {
      const beelden = await stuurBeelden(invoer, []);
      return await werkBij(nieuw as Creatie, { ...voortgang, stemmen, portretUrls: [], beelden });
    }
    const portretten = await Promise.all(
      invoer.plan.personages.map(async (_, i) => (await fal.queue.submit(BEELD, { input: portretOpdracht(invoer.plan, invoer.genre, i) as never })).request_id),
    );
    return await werkBij(nieuw as Creatie, { ...voortgang, stemmen, portretten });
  } catch (e) {
    const reden = falReden(e);
    console.error("[trailer] insturen mislukt:", reden);
    return (await markeerMislukt(nieuw as Creatie, `Insturen mislukt: ${reden}`)) ?? (nieuw as Creatie);
  }
}

async function stuurBeelden(r: TrailerInvoer, portretUrls: string[]): Promise<string[]> {
  return Promise.all(
    r.plan.clips.map(async (_, i) => {
      const b = beeldOpdracht(r.plan, r.genre, i, portretUrls);
      const { request_id } = await fal.queue.submit(b.endpoint, { input: b.input as never });
      return `${b.endpoint}|${request_id}`;
    }),
  );
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

function splits(s: string): [string, string] {
  const i = s.lastIndexOf("|");
  return [s.slice(0, i), s.slice(i + 1)];
}

async function klaar(paren: [string, string][]): Promise<boolean> {
  const st = await Promise.all(paren.map(async ([e, id]) => ((await fal.queue.status(e, { requestId: id, logs: false })) as { status: string }).status));
  return st.every((s) => s === "COMPLETED");
}

async function resultaat(endpoint: string, id: string): Promise<string> {
  const { data } = await fal.queue.result(endpoint, { requestId: id });
  const d = data as { images?: { url?: string }[]; video?: { url?: string }; audio?: { url?: string } };
  const url = d.images?.[0]?.url ?? d.video?.url ?? d.audio?.url;
  if (!url) throw new Error("Er kwam geen resultaat terug.");
  return url;
}

export async function verversTrailer(c: Creatie): Promise<Creatie> {
  if (c.status !== "bezig") return c;
  const r = rij(c);
  const v = r.voortgang;
  if (!v) return (await markeerMislukt(c, "De opdracht is niet goed aangekomen.")) ?? c;
  if (Date.now() - new Date(c.created_at).getTime() > TIJDSLIMIET_MS) return (await markeerMislukt(c, "Het duurde te lang.")) ?? c;
  zetKostenContext(c.user_id, "Nieuwe app: trailer");
  const vast = Date.now() - new Date(v.sinds).getTime() > VASTGELOPEN_MS;
  const model = videoModel(TRAILER_VIDEOMODEL);

  try {
    if (v.stap === "personages") {
      if (!v.portretten.length) return vast ? ((await markeerMislukt(c, "De opdracht is niet goed aangekomen.")) ?? c) : c;
      if (!(await klaar(v.portretten.map((id) => [BEELD, id])))) return c;
      const naar: Voortgang = { ...v, stap: "beelden", sinds: new Date().toISOString() };
      const gewonnen = await claim(c, v, naar);
      if (!gewonnen) return c;
      const portretUrls = await Promise.all(v.portretten.map((id) => resultaat(BEELD, id)));
      return await werkBij(gewonnen, { ...naar, portretUrls, beelden: await stuurBeelden(r, portretUrls) });
    }
    if (v.stap === "beelden") {
      if (!v.beelden?.length) return vast ? ((await markeerMislukt(c, "De beelden zijn niet goed aangekomen.")) ?? c) : c;
      if (!(await klaar(v.beelden.map(splits)))) return c;
      const naar: Voortgang = { ...v, stap: "clips", sinds: new Date().toISOString(), clips: [] };
      const gewonnen = await claim(c, v, naar);
      if (!gewonnen) return c;
      const urls = await Promise.all(v.beelden.map((s) => resultaat(...splits(s))));
      const clips = await Promise.all(
        urls.map(async (url, i) => {
          const prompt = `${r.plan.clips[i].beweging} Cinematic, smooth camera movement, realistic motion. Faces and costumes stay exactly the same. No text.`;
          return (await fal.queue.submit(model.slug, { input: model.invoer({ image_url: url, prompt }) as never })).request_id;
        }),
      );
      return await werkBij(gewonnen, { ...naar, clips });
    }
    if (v.stap === "clips") {
      if (!v.clips?.length) return vast ? ((await markeerMislukt(c, "De clips zijn niet goed aangekomen.")) ?? c) : c;
      const paren: [string, string][] = [...v.clips.map((id) => [model.slug, id] as [string, string]), ...v.stemmen.map((s) => [STEM_MODEL, s.id] as [string, string])];
      if (!(await klaar(paren))) return c;
      return await startMontage(c, v);
    }
    if (v.stap === "monteren" && vast) return await startMontage(c, v);
    return c;
  } catch (e) {
    const reden = falReden(e);
    if (/weigerde|geen resultaat|422|content/i.test(reden)) return (await markeerMislukt(c, reden)) ?? c;
    console.error("[trailer] verder zetten mislukt, later opnieuw:", reden);
    return c;
  }
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
  const model = videoModel(TRAILER_VIDEOMODEL);
  try {
    const [clips, stemmen] = await Promise.all([
      Promise.all((v.clips ?? []).map((id) => resultaat(model.slug, id))),
      Promise.all(v.stemmen.map(async (s) => [s.i, await resultaat(STEM_MODEL, s.id)] as [number, string])),
    ]);
    const mp4 = await monteerTrailer({
      tijdlijn: r.plan.tijdlijn,
      titel: r.plan.titel,
      clips,
      stemmen: new Map(stemmen),
      muziek: musicTrackUrl(MUZIEK[r.genre]),
    });
    const url = await uploadNaarOpslag(c.user_id, mp4, "mp4", "video/mp4");
    await createServiceClient().from("creaties").update({ status: "klaar", url, klaar_op: new Date().toISOString() }).eq("id", c.id).eq("status", "bezig");
  } catch (e) {
    const reden = falReden(e);
    console.error("[trailer] montage mislukt:", reden);
    await markeerMislukt(c, `Montage mislukt: ${reden}`);
  }
}
