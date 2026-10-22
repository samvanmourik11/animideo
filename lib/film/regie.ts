// DE REGIE van een filmscène: één rij in de bibliotheek (maker 'film-scene') die vanzelf
// door drie stappen loopt, zoals de trailer:
//
//   beelden  — per shot dat (opnieuw) moet een filmbeeld, met de portretten van de cast als
//              voorbeeld; tegelijk de dialoogzinnen en de verteller ingesproken
//   clips    — stille shots gaan bewegen (Kling 2.5), dialoogshots krijgen lipsync (Kling
//              AI Avatar) met de zin van dat personage
//   monteren — de scène achter elkaar (lib/film/montage.ts) en ter keuring in de film
//
// Alleen wat veranderd is, wordt opnieuw gemaakt: na feedback blijven goede shots staan.
// En de film zelf (maker 'film'): alle goedgekeurde scènes aan elkaar.

import { after } from "next/server";
import { fal } from "@/lib/fal";
import { zetKostenContext } from "@/lib/provider-kosten";
import { createServiceClient } from "@/lib/supabase/service";
import { videoModel } from "@/lib/video-modellen";
import { musicTrackUrl, MUSIC_TRACKS } from "@/lib/music/library";
import { LIPSYNC_MODEL } from "@/lib/lipsync";
import { MAX_TEGELIJK, WachtrijFout, falReden, markeerMislukt, uploadNaarOpslag } from "@/lib/creaties/wachtrij";
import { betaal, betaalTerug } from "@/lib/team/team";
import type { Creatie } from "@/lib/creaties/types";
import { TRAILERSTEM } from "@/lib/trailer/regie";
import { leesFilm, wijzigFilm } from "./opslag";
import { knipStilteWeg, monteerFilm, monteerScene } from "./montage";
import { sceneCredits, teMaken, vingerafdruk, type Film, type Scene, type SceneStap, type Shot } from "./types";

fal.config({ credentials: process.env.FAL_KEY });

const BEELD = "fal-ai/nano-banana-pro";
const BEELD_MET_VOORBEELD = "fal-ai/nano-banana-pro/edit";
const STEM_MODEL = "fal-ai/elevenlabs/tts/eleven-v3";
const VIDEOMODEL = "kling-2-5";
const TIJDSLIMIET_MS = 90 * 60 * 1000;
const VASTGELOPEN_MS = 6 * 60 * 1000;

const STANDAARD_LOOK =
  "Photorealistic cinematic film still, anamorphic lens, shallow depth of field, natural motivated lighting, filmic colour grade, subtle film grain. No text, no logos, no watermark.";

interface Voortgang {
  stap: SceneStap;
  sinds: string;
  /** De shots die deze keer gemaakt worden. */
  opnieuw: string[];
  /** Per shot "endpoint|verzoek". */
  beelden: Record<string, string>;
  /** Per dialoogshot het stemverzoek. */
  stemmen: Record<string, string>;
  verteller?: string;
  beeldUrls?: Record<string, string>;
  clips?: Record<string, string>;
}

interface SceneInvoer {
  filmId: string;
  nummer: number;
  formaat: string;
  voortgang: Voortgang;
}
const rij = (c: Creatie) => c.invoer as unknown as SceneInvoer;

const splits = (s: string): [string, string] => {
  const i = s.lastIndexOf("|");
  return [s.slice(0, i), s.slice(i + 1)];
};

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

/** Een fal-link verloopt; wat we bij een volgende versie willen hergebruiken, bewaren we zelf. */
async function bewaar(userId: string, url: string, ext: string, mime: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download mislukt (HTTP ${res.status})`);
  return uploadNaarOpslag(userId, Buffer.from(await res.arrayBuffer()), ext, mime);
}

function vertellerStem(film: Film): string {
  return film.vertellerStem ?? TRAILERSTEM[film.taal];
}

export function beeldOpdracht(film: Film, scene: Scene, shot: Shot) {
  const ref = shot.inBeeld.map((n) => film.cast.find((c) => c.naam === n)).filter((c) => c?.portret).slice(0, 4) as { naam: string; uiterlijk: string; soort: string; portret: string }[];
  const cast = ref.map((c, j) => `${c.naam} is ${c.soort === "wezen" ? "the creature/object" : "the person"} from reference image ${j + 1} (${c.uiterlijk}); keep it exactly the same.`).join(" ");
  // Lipsync heeft een duidelijk gezicht nodig van wie er praat.
  const praat = shot.dialoog ? ` ${shot.dialoog.wie} is speaking: face clearly visible, turned towards the camera at a slight angle, mouth closed, medium close-up.` : "";
  return {
    endpoint: ref.length ? BEELD_MET_VOORBEELD : BEELD,
    input: {
      prompt: `${shot.beeld} Location and light: ${scene.plek}.${praat} ${cast} ${film.formaat === "9:16" ? "Vertical 9:16" : "Widescreen 16:9"} composition. ${film.stijl || STANDAARD_LOOK}`,
      ...(ref.length ? { image_urls: ref.map((c) => c.portret) } : {}),
      aspect_ratio: film.formaat,
      num_images: 1,
      output_format: "jpeg",
      resolution: "2K",
    },
  };
}

function stemOpdracht(film: Film, shot: Shot) {
  const lid = film.cast.find((c) => c.naam === shot.dialoog!.wie);
  // De lange pauze erachter beschermt het einde van de zin; die stilte knippen we weer weg.
  return { text: `${shot.dialoog!.tekst} [long pause]`, voice: lid?.stem, language_code: film.taal, stability: 0.5, similarity_boost: 0.8, speed: 1 };
}

export function vertellerOpdracht(film: Film, scene: Scene) {
  const zinnen = scene.shots.flatMap((s) => (s.verteller ? [s.verteller] : []));
  return zinnen.length ? { text: `${zinnen.join(" [long pause] ")} [long pause]`, voice: vertellerStem(film), language_code: film.taal, stability: 0.5, similarity_boost: 0.8, speed: 0.92 } : null;
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

async function zetSceneStatus(c: Creatie, f: (s: Scene) => void) {
  const r = rij(c);
  await wijzigFilm(c.user_id, r.filmId, (film) => {
    const s = film.scenes.find((x) => x.nummer === r.nummer);
    if (s && s.creatieId === c.id) f(s);
  }).catch((e) => console.error("[film] scène bijwerken mislukt:", e));
}

async function faal(c: Creatie, reden: string): Promise<Creatie> {
  const uit = (await markeerMislukt(c, reden)) ?? c;
  await zetSceneStatus(c, (s) => (s.status = "mislukt"));
  return uit;
}

export async function startScene(userId: string, ruw: Record<string, unknown>, ouderId?: string | null): Promise<Creatie> {
  const filmId = String(ruw.filmId ?? "");
  const nummer = Number(ruw.nummer);
  let film: Film;
  try {
    film = (await leesFilm(userId, filmId)).data;
  } catch (e) {
    throw new WachtrijFout(e instanceof Error ? e.message : String(e), 404);
  }
  const scene = film.scenes.find((s) => s.nummer === nummer);
  if (!scene) throw new WachtrijFout(`Scène ${nummer} bestaat nog niet. Schrijf hem eerst uit.`, 400);
  if (scene.status === "bezig") throw new WachtrijFout(`Scène ${nummer} wordt al gemaakt.`, 409);
  const zonderStem = scene.shots.find((s) => s.dialoog && !film.cast.find((c) => c.naam === s.dialoog!.wie)?.stem);
  if (zonderStem) throw new WachtrijFout(`${zonderStem.dialoog!.wie} heeft nog geen stem.`, 400);

  const db = createServiceClient();
  const { count } = await db.from("creaties").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "bezig");
  if ((count ?? 0) >= MAX_TEGELIJK) throw new WachtrijFout(`Je hebt al ${MAX_TEGELIJK} dingen in de maak. Wacht tot er één klaar is.`, 429);

  const opnieuw = teMaken(scene, film);
  const { ok, betaald, betalerId } = await betaal(userId, sceneCredits(scene, opnieuw), "Nieuwe app: filmscène");
  if (!ok) throw new WachtrijFout("Niet genoeg credits.", 402);

  const voortgang: Voortgang = { stap: "beelden", sinds: new Date().toISOString(), opnieuw: opnieuw.map((s) => s.id), beelden: {}, stemmen: {} };
  const { data: nieuw, error } = await db
    .from("creaties")
    .insert({
      user_id: userId,
      soort: "video",
      status: "bezig",
      maker: "film-scene",
      model: "film",
      prompt: `${film.titel} — scène ${nummer}: ${scene.titel}`,
      invoer: { filmId, nummer, formaat: film.formaat, voortgang },
      credits: betaald,
      fal_endpoint: "film",
      ouder_id: ouderId ?? null,
      ...(betalerId !== userId ? { betaald_door: betalerId } : {}),
    })
    .select("*")
    .single();
  if (error || !nieuw) {
    await betaalTerug({ user_id: userId, betaald_door: betalerId, credits: betaald }, "Terug: filmscène niet gestart");
    throw new WachtrijFout("Kon de opdracht niet opslaan. Probeer het opnieuw.", 500);
  }
  const c = nieuw as Creatie;
  await wijzigFilm(userId, filmId, (f) => {
    const s = f.scenes.find((x) => x.nummer === nummer)!;
    s.status = "bezig";
    s.creatieId = c.id;
  });

  try {
    zetKostenContext(userId, "Nieuwe app: filmscène");
    const vo = vertellerOpdracht(film, scene);
    const [beelden, stemmen, verteller] = await Promise.all([
      Promise.all(opnieuw.map(async (s) => {
        const b = beeldOpdracht(film, scene, s);
        return [s.id, `${b.endpoint}|${(await fal.queue.submit(b.endpoint, { input: b.input as never })).request_id}`] as const;
      })),
      Promise.all(opnieuw.filter((s) => s.dialoog).map(async (s) => [s.id, (await fal.queue.submit(STEM_MODEL, { input: stemOpdracht(film, s) as never })).request_id] as const)),
      vo ? fal.queue.submit(STEM_MODEL, { input: vo as never }).then((r) => r.request_id) : Promise.resolve(undefined),
    ]);
    return await werkBij(c, { ...voortgang, beelden: Object.fromEntries(beelden), stemmen: Object.fromEntries(stemmen), ...(verteller ? { verteller } : {}) });
  } catch (e) {
    const reden = falReden(e);
    console.error("[film] insturen mislukt:", reden);
    return faal(c, `Insturen mislukt: ${reden}`);
  }
}

export async function verversScene(c: Creatie): Promise<Creatie> {
  if (c.status !== "bezig") return c;
  const r = rij(c);
  const v = r.voortgang;
  if (!v) return faal(c, "De opdracht is niet goed aangekomen.");
  if (Date.now() - new Date(c.created_at).getTime() > TIJDSLIMIET_MS) return faal(c, "Het duurde te lang.");
  zetKostenContext(c.user_id, "Nieuwe app: filmscène");
  const vast = Date.now() - new Date(v.sinds).getTime() > VASTGELOPEN_MS;
  const model = videoModel(VIDEOMODEL);

  try {
    if (v.stap === "beelden") {
      const paren: [string, string][] = [
        ...Object.values(v.beelden).map(splits),
        ...Object.values(v.stemmen).map((id) => [STEM_MODEL, id] as [string, string]),
        ...(v.verteller ? [[STEM_MODEL, v.verteller] as [string, string]] : []),
      ];
      if (paren.length && !(await klaar(paren))) return c;
      const naar: Voortgang = { ...v, stap: "clips", sinds: new Date().toISOString() };
      const gewonnen = await claim(c, v, naar);
      if (!gewonnen) return c;
      const film = (await leesFilm(c.user_id, r.filmId)).data;
      const scene = film.scenes.find((s) => s.nummer === r.nummer)!;
      const beeldUrls: Record<string, string> = {};
      const clips: Record<string, string> = {};
      await Promise.all(
        v.opnieuw.map(async (id) => {
          const shot = scene.shots.find((s) => s.id === id);
          if (!shot) return;
          const beeld = await bewaar(c.user_id, await resultaat(...splits(v.beelden[id])), "jpg", "image/jpeg");
          beeldUrls[id] = beeld;
          if (shot.dialoog && v.stemmen[id]) {
            const ruw = await fetch(await resultaat(STEM_MODEL, v.stemmen[id]));
            const zin = await uploadNaarOpslag(c.user_id, await knipStilteWeg(Buffer.from(await ruw.arrayBuffer())), "mp3", "audio/mpeg");
            const { request_id } = await fal.queue.submit(LIPSYNC_MODEL, { input: { image_url: beeld, audio_url: zin } as never });
            clips[id] = `${LIPSYNC_MODEL}|${request_id}`;
          } else {
            const prompt = `${shot.beweging} Cinematic, smooth camera movement, realistic motion. Faces, costumes and creatures stay exactly the same. Keep the same location, lighting and colour grade as the image; do not reveal new surroundings. No text.`;
            const { request_id } = await fal.queue.submit(model.slug, { input: model.invoer({ image_url: beeld, prompt }) as never });
            clips[id] = `${model.slug}|${request_id}`;
          }
        }),
      );
      return await werkBij(gewonnen, { ...naar, beeldUrls, clips });
    }
    if (v.stap === "clips") {
      if (!v.clips) return vast ? faal(c, "De clips zijn niet goed aangekomen.") : c;
      const lijst = Object.values(v.clips).map(splits);
      if (lijst.length && !(await klaar(lijst))) return c;
      return await startMontage(c, v);
    }
    if (v.stap === "monteren" && vast) return await startMontage(c, v);
    return c;
  } catch (e) {
    const reden = falReden(e);
    if (/weigerde|geen resultaat|422|content/i.test(reden)) return faal(c, reden);
    console.error("[film] verder zetten mislukt, later opnieuw:", reden);
    return c;
  }
}

async function startMontage(c: Creatie, v: Voortgang): Promise<Creatie> {
  const naar: Voortgang = { ...v, stap: "monteren", sinds: new Date().toISOString() };
  const gewonnen = await claim(c, v, naar);
  if (!gewonnen) return c;
  const werk = () => voerSceneMontageUit(gewonnen, naar);
  try {
    after(werk);
  } catch {
    void werk();
  }
  return gewonnen;
}

/** Elke categorie heeft meerdere nummers; per scène een ander, zodat het niet steeds hetzelfde is. */
function muziekVoor(scene: Scene): string | null {
  if (!scene.muziek) return null;
  const nummers = MUSIC_TRACKS.filter((t) => t.category === scene.muziek);
  return nummers.length ? musicTrackUrl(nummers[scene.nummer % nummers.length].slug) : null;
}

async function voerSceneMontageUit(c: Creatie, v: Voortgang): Promise<void> {
  const r = rij(c);
  try {
    const film = (await leesFilm(c.user_id, r.filmId)).data;
    const scene = film.scenes.find((s) => s.nummer === r.nummer);
    if (!scene) throw new Error("De scène is uit het script gehaald.");
    const nieuw: Record<string, string> = {};
    await Promise.all(Object.entries(v.clips ?? {}).map(async ([id, s]) => (nieuw[id] = await bewaar(c.user_id, await resultaat(...splits(s)), "mp4", "video/mp4"))));
    const shots = scene.shots.map((s) => {
      const url = nieuw[s.id] ?? scene.gemaakt?.[s.id]?.clip;
      if (!url) throw new Error(`Shot ${s.id} ontbreekt; maak de scène opnieuw.`);
      return { url, praat: !!s.dialoog, duur: s.duur, verteller: !!s.verteller };
    });
    const verteller = v.verteller ? await resultaat(STEM_MODEL, v.verteller) : undefined;
    const mp4 = await monteerScene({ shots, verteller, muziek: muziekVoor(scene), formaat: film.formaat });
    const url = await uploadNaarOpslag(c.user_id, mp4, "mp4", "video/mp4");
    const { data } = await createServiceClient().from("creaties").update({ status: "klaar", url, klaar_op: new Date().toISOString() }).eq("id", c.id).eq("status", "bezig").select("id");
    if (!data?.length) return;
    await wijzigFilm(c.user_id, r.filmId, (f) => {
      const s = f.scenes.find((x) => x.nummer === r.nummer);
      if (!s || s.creatieId !== c.id) return;
      s.status = "ter_keuring";
      s.video = url;
      delete s.feedback;
      s.gemaakt = { ...(s.gemaakt ?? {}) };
      for (const shot of s.shots) {
        if (!nieuw[shot.id]) continue;
        s.gemaakt[shot.id] = { vingerafdruk: vingerafdruk(shot, f, s.plek), beeld: v.beeldUrls?.[shot.id], clip: nieuw[shot.id] };
      }
    });
  } catch (e) {
    const reden = falReden(e);
    console.error("[film] montage mislukt:", reden);
    await faal(c, `Montage mislukt: ${reden}`);
  }
}

// ── De hele film ─────────────────────────────────────────────────────────

export async function startFilm(userId: string, ruw: Record<string, unknown>): Promise<Creatie> {
  const filmId = String(ruw.filmId ?? "");
  let film: Film;
  try {
    film = (await leesFilm(userId, filmId)).data;
  } catch (e) {
    throw new WachtrijFout(e instanceof Error ? e.message : String(e), 404);
  }
  const klaarVoor = film.scenes.filter((s) => s.status === "goedgekeurd" && s.video).sort((a, b) => a.nummer - b.nummer);
  if (!klaarVoor.length) throw new WachtrijFout("Er is nog geen goedgekeurde scène.", 400);
  const { data: nieuw, error } = await createServiceClient()
    .from("creaties")
    .insert({ user_id: userId, soort: "video", status: "bezig", maker: "film", model: "film", prompt: `Film: ${film.titel}`, invoer: { filmId, formaat: film.formaat, scenes: klaarVoor.map((s) => s.nummer) }, credits: 0, fal_endpoint: "film" })
    .select("*")
    .single();
  if (error || !nieuw) throw new WachtrijFout("Kon de opdracht niet opslaan. Probeer het opnieuw.", 500);
  const c = nieuw as Creatie;
  const werk = async () => {
    try {
      const mp4 = await monteerFilm({ scenes: klaarVoor.map((s) => s.video!), titel: film.titel, formaat: film.formaat });
      const url = await uploadNaarOpslag(userId, mp4, "mp4", "video/mp4");
      await createServiceClient().from("creaties").update({ status: "klaar", url, klaar_op: new Date().toISOString() }).eq("id", c.id).eq("status", "bezig");
      await wijzigFilm(userId, filmId, (f) => void (f.eindCreatieId = c.id));
    } catch (e) {
      console.error("[film] eindmontage mislukt:", e);
      await markeerMislukt(c, `Montage mislukt: ${falReden(e)}`);
    }
  };
  try {
    after(werk);
  } catch {
    void werk();
  }
  return c;
}

export async function verversFilm(c: Creatie): Promise<Creatie> {
  if (c.status !== "bezig") return c;
  if (Date.now() - new Date(c.created_at).getTime() > 20 * 60 * 1000) return (await markeerMislukt(c, "De montage duurde te lang.")) ?? c;
  return c;
}
