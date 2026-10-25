// DE REGIE van een reclame: één rij in de bibliotheek (maker 'reclame') die vanzelf door
// drie stappen loopt. Er is geen aparte tabel en geen achtergrondproces: net als de rest
// van de wachtrij gaat de reclame een stap verder telkens als iemand de stand opvraagt
// (de bibliotheek, de teller in het menu).
//
//   beelden  — drie reclamebeelden met het échte product (Nano Banana Pro)
//   clips    — die drie beelden bewegen (Kling 2.5), tegelijk spreekt Hugo de tekst in
//   monteren — alles aan elkaar met ffmpeg, op onze opslag, rij op 'klaar'
//
// Twee schermen die tegelijk de stand opvragen, mogen een stap niet twee keer starten
// (dan betalen wij dubbel bij fal). Daarom gaat elke overgang via een voorwaardelijke
// update op de huidige stap: alleen wie hem wint, stuurt de volgende opdrachten in.

import { after } from "next/server";
import { fal } from "@/lib/fal";
import { zetKostenContext } from "@/lib/provider-kosten";
import { createServiceClient } from "@/lib/supabase/service";
import { betaal, betaalTerug } from "@/lib/team/team";
import { videoModel } from "@/lib/video-modellen";
import { musicTrackUrl } from "@/lib/music/library";
import { MAX_TEGELIJK, WachtrijFout, falReden, markeerMislukt, uploadNaarOpslag } from "@/lib/creaties/wachtrij";
import type { Creatie } from "@/lib/creaties/types";
import { controleerPlan } from "./plan";
import { monteer } from "./montage";
import {
  AANTAL_SHOTS,
  RECLAME_CREDITS,
  RECLAME_FORMATEN,
  RECLAME_VIDEOMODEL,
  isStijl,
  type Plan,
  type Product,
  type ReclameFormaat,
  type ReclameStap,
  type StijlId,
} from "./types";

fal.config({ credentials: process.env.FAL_KEY });

const BEELD_MODEL = "fal-ai/nano-banana-pro/edit";
const STEM_MODEL = "fal-ai/elevenlabs/tts/eleven-v3";
/** Hugo V: de Nederlandse, verkopende stem die Sam in alle tools wil. */
const HUGO = "rbqBOMK4BPTMGvIB7N8w";

const MUZIEK: Record<StijlId, string> = {
  strak: "electro-lifestyle",
  lifestyle: "upbeat-corporate-vlog",
  speels: "house-party-commercial",
};

// Drie beelden, drie clips en een montage: ruim binnen 40 minuten, ook als fal druk is.
const TIJDSLIMIET_MS = 40 * 60 * 1000;
// Wie een stap won maar halverwege stierf (serverfunctie afgebroken), laat de rij
// hangen. Na deze tijd mag een volgende opvraging het overnemen.
const VASTGELOPEN_MS = 4 * 60 * 1000;

/** Wat de klant aanleverde: zo staat het in de rij, en zo start "Nog eens" hem opnieuw. */
export interface ReclameInvoer {
  product: Product;
  fotoUrl: string;
  stijl: StijlId;
  formaat: ReclameFormaat;
  plan: Plan;
}

interface Voortgang {
  stap: ReclameStap;
  /** Wanneer deze stap begon; om vastgelopen stappen te herkennen. */
  sinds: string;
  beelden: string[];
  clips?: string[];
  stem?: string;
}

type RijInvoer = ReclameInvoer & { voortgang?: Voortgang };

function rij(c: Creatie): RijInvoer {
  return c.invoer as unknown as RijInvoer;
}

function tekst(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Het product zoals de klant het op het scherm heeft aangepast, opgeschoond. */
export function leesProduct(ruw: unknown): Product {
  const p = (ruw ?? {}) as Record<string, unknown>;
  const kleur = tekst(p.kleur, 7);
  const product: Product = {
    naam: tekst(p.naam, 80),
    merk: tekst(p.merk, 60),
    omschrijving: tekst(p.omschrijving, 600),
    voordelen: (Array.isArray(p.voordelen) ? p.voordelen : []).map((v) => tekst(v, 80)).filter(Boolean).slice(0, 3),
    prijs: tekst(p.prijs, 30),
    kleur: /^#[0-9a-f]{6}$/i.test(kleur) ? kleur.toLowerCase() : "#1c72ed",
    website: tekst(p.website, 60).replace(/^https?:\/\//, "").replace(/\/$/, ""),
    fotos: [],
  };
  if (!product.naam) throw new Error("Vul eerst de naam van het product in.");
  return product;
}

/** Leest en controleert de invoer van het maakscherm. Gooit met een melding voor op het scherm. */
export function leesReclameInvoer(ruw: Record<string, unknown>): ReclameInvoer {
  const product = leesProduct(ruw.product);
  const fotoUrl = tekst(ruw.fotoUrl, 2000);
  if (!/^https:\/\//.test(fotoUrl)) throw new Error("Kies eerst een productfoto.");
  if (!isStijl(ruw.stijl)) throw new Error("Kies eerst een stijl.");
  const formaat = RECLAME_FORMATEN.some((f) => f.id === ruw.formaat) ? (ruw.formaat as ReclameFormaat) : "9:16";
  return { product, fotoUrl, stijl: ruw.stijl, formaat, plan: controleerPlan(ruw.plan) };
}

function beeldOpdracht(r: ReclameInvoer, i: number) {
  return {
    prompt: `${r.plan.shots[i].beeld} The product is exactly the product from the reference photo: keep its shape, proportions, colors, label, text and logo identical and clearly visible. Photorealistic high-end advertising photography. Do not add any text, captions or watermarks.`,
    image_urls: [r.fotoUrl],
    aspect_ratio: r.formaat,
    num_images: 1,
    output_format: "jpeg",
  };
}

// Een foto van de webwinkel kan elk moment verdwijnen of hotlinken blokkeren; de
// modellen moeten hem drie keer kunnen ophalen. Dus eerst naar onze eigen opslag.
export async function eigenKopie(userId: string, url: string): Promise<string> {
  if (url.includes(".supabase.co/storage/")) return url;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AnimideoBot/1.0)" } });
  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!res.ok || !mime.startsWith("image/")) {
    throw new WachtrijFout("We konden deze productfoto niet ophalen. Upload hem zelf.", 400);
  }
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return uploadNaarOpslag(userId, Buffer.from(await res.arrayBuffer()), ext, mime);
}

export async function startReclame(
  userId: string,
  ruw: Record<string, unknown>,
  ouderId?: string | null,
): Promise<Creatie> {
  let invoer: ReclameInvoer;
  try {
    invoer = leesReclameInvoer(ruw);
  } catch (e) {
    throw new WachtrijFout(e instanceof Error ? e.message : String(e), 400);
  }

  const db = createServiceClient();
  const { count } = await db
    .from("creaties")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "bezig");
  if ((count ?? 0) >= MAX_TEGELIJK) {
    throw new WachtrijFout(`Je hebt al ${MAX_TEGELIJK} dingen in de maak. Wacht tot er één klaar is.`, 429);
  }

  invoer.fotoUrl = await eigenKopie(userId, invoer.fotoUrl);

  const { ok, betaald, betalerId } = await betaal(userId, RECLAME_CREDITS, "Nieuwe app: reclame");
  if (!ok) throw new WachtrijFout("Niet genoeg credits.", 402);

  const voortgang: Voortgang = { stap: "beelden", sinds: new Date().toISOString(), beelden: [] };
  const { data: rij, error } = await db
    .from("creaties")
    .insert({
      user_id: userId,
      soort: "video",
      status: "bezig",
      maker: "reclame",
      model: "reclame",
      prompt: `Reclame: ${invoer.product.naam}`,
      invoer: { ...invoer, voortgang },
      credits: betaald,
      fal_endpoint: "reclame",
      ouder_id: ouderId ?? null,
      ...(betalerId !== userId ? { betaald_door: betalerId } : {}),
    })
    .select("*")
    .single();
  if (error || !rij) {
    await betaalTerug({ user_id: userId, betaald_door: betalerId, credits: betaald }, "Terug: reclame niet gestart");
    throw new WachtrijFout("Kon de opdracht niet opslaan. Probeer het opnieuw.", 500);
  }

  try {
    const ids = await Promise.all(
      invoer.plan.shots.map(async (_, i) => {
        const { request_id } = await fal.queue.submit(BEELD_MODEL, { input: beeldOpdracht(invoer, i) as never });
        return request_id;
      }),
    );
    return await werkVoortgangBij(rij as Creatie, { ...voortgang, beelden: ids });
  } catch (e) {
    const reden = falReden(e);
    console.error("[reclame] beelden insturen mislukt:", reden);
    return (await markeerMislukt(rij as Creatie, `Insturen mislukt: ${reden}`)) ?? (rij as Creatie);
  }
}

async function werkVoortgangBij(c: Creatie, voortgang: Voortgang): Promise<Creatie> {
  const invoer = { ...rij(c), voortgang };
  const { data } = await createServiceClient()
    .from("creaties")
    .update({ invoer })
    .eq("id", c.id)
    .select("*")
    .single();
  return (data as Creatie | null) ?? { ...c, invoer };
}

/**
 * Neemt een stap over, maar alleen als de rij nog op `van` staat (en, bij het
 * overnemen van een vastgelopen stap, nog hetzelfde begintijdstip heeft). Geeft de
 * bijgewerkte rij terug, of null als een ander scherm hem al had.
 */
async function claim(c: Creatie, van: Voortgang, naar: Voortgang): Promise<Creatie | null> {
  const invoer = { ...rij(c), voortgang: naar };
  const { data } = await createServiceClient()
    .from("creaties")
    .update({ invoer })
    .eq("id", c.id)
    .eq("status", "bezig")
    .eq("invoer->voortgang->>stap", van.stap)
    .eq("invoer->voortgang->>sinds", van.sinds)
    .select("*")
    .maybeSingle();
  return data as Creatie | null;
}

type Stand = "bezig" | "klaar";

async function stand(endpoint: string, ids: string[]): Promise<Stand> {
  const lijst = await Promise.all(
    ids.map(async (id) => ((await fal.queue.status(endpoint, { requestId: id, logs: false })) as { status: string }).status),
  );
  return lijst.every((s) => s === "COMPLETED") ? "klaar" : "bezig";
}

async function resultaat(endpoint: string, id: string, pad: "image" | "video" | "audio"): Promise<string> {
  const { data } = await fal.queue.result(endpoint, { requestId: id });
  const d = data as { images?: { url?: string }[]; video?: { url?: string }; audio?: { url?: string } };
  const url = pad === "image" ? d.images?.[0]?.url : pad === "video" ? d.video?.url : d.audio?.url;
  if (!url) throw new Error("Er kwam geen resultaat terug.");
  return url;
}

/** Laat een reclame een stap verder lopen als dat kan. Zelfde rol als ververs() in de wachtrij. */
export async function verversReclame(c: Creatie): Promise<Creatie> {
  if (c.status !== "bezig") return c;
  const invoer = rij(c);
  const v = invoer.voortgang;
  const leeftijd = Date.now() - new Date(c.created_at).getTime();
  if (!v) return (await markeerMislukt(c, "De opdracht is niet goed aangekomen.")) ?? c;
  if (leeftijd > TIJDSLIMIET_MS) return (await markeerMislukt(c, "Het duurde te lang.")) ?? c;

  // De volgende opdrachten bij fal komen niet uit een betaalde klik van dit verzoek;
  // zonder deze regel staan ze naamloos in het kostenlogboek.
  zetKostenContext(c.user_id, "Nieuwe app: reclame");
  const stapLeeftijd = Date.now() - new Date(v.sinds).getTime();

  try {
    if (v.stap === "beelden") {
      if (v.beelden.length < AANTAL_SHOTS) {
        return stapLeeftijd > VASTGELOPEN_MS ? ((await markeerMislukt(c, "De opdracht is niet goed aangekomen.")) ?? c) : c;
      }
      if ((await stand(BEELD_MODEL, v.beelden)) !== "klaar") return c;
      const naar: Voortgang = { ...v, stap: "clips", sinds: new Date().toISOString(), clips: [] };
      const gewonnen = await claim(c, v, naar);
      if (!gewonnen) return c;
      return await startClips(gewonnen, naar);
    }

    if (v.stap === "clips") {
      if (!v.clips?.length || !v.stem) {
        return stapLeeftijd > VASTGELOPEN_MS ? ((await markeerMislukt(c, "De clips zijn niet goed aangekomen.")) ?? c) : c;
      }
      const model = videoModel(RECLAME_VIDEOMODEL);
      if ((await stand(model.slug, v.clips)) !== "klaar") return c;
      if ((await stand(STEM_MODEL, [v.stem])) !== "klaar") return c;
      return await startMontage(c, v);
    }

    if (v.stap === "monteren" && stapLeeftijd > VASTGELOPEN_MS) {
      return await startMontage(c, v);
    }
    return c;
  } catch (e) {
    // Een afgekeurde opdracht (inhoudsfilter) komt hier als fout uit result(). Een
    // storing bij het opvragen van de stand is tijdelijk: dan gewoon later opnieuw.
    const reden = falReden(e);
    if (/weigerde|geen resultaat|422|content/i.test(reden)) return (await markeerMislukt(c, reden)) ?? c;
    console.error("[reclame] verder zetten mislukt, later opnieuw:", reden);
    return c;
  }
}

async function startClips(c: Creatie, v: Voortgang): Promise<Creatie> {
  const r = rij(c);
  const model = videoModel(RECLAME_VIDEOMODEL);
  const beelden = await Promise.all(v.beelden.map((id) => resultaat(BEELD_MODEL, id, "image")));
  const [clips, stem] = await Promise.all([
    Promise.all(
      beelden.map(async (url, i) => {
        const prompt = `${r.plan.shots[i].beweging || "Slow cinematic push-in."} The product keeps exactly the same shape, colors, label and logo. No text appears.`;
        const { request_id } = await fal.queue.submit(model.slug, { input: model.invoer({ image_url: url, prompt }) as never });
        return request_id;
      }),
    ),
    fal.queue
      .submit(STEM_MODEL, {
        input: { text: r.plan.voiceover, voice: HUGO, language_code: "nl", stability: 0.5, similarity_boost: 0.75, speed: 1 } as never,
      })
      .then((s) => s.request_id),
  ]);
  return werkVoortgangBij(c, { ...v, clips, stem });
}

async function startMontage(c: Creatie, v: Voortgang): Promise<Creatie> {
  const naar: Voortgang = { ...v, stap: "monteren", sinds: new Date().toISOString() };
  const gewonnen = await claim(c, v, naar);
  if (!gewonnen) return c;
  // De montage duurt een halve minuut; die laten we na het antwoord doorlopen, zodat de
  // bibliotheek niet zo lang op een antwoord wacht. Lukt after() niet (geen verzoek om
  // ons heen), dan gewoon los starten.
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
    const model = videoModel(RECLAME_VIDEOMODEL);
    const [clips, stem] = await Promise.all([
      Promise.all((v.clips ?? []).map((id) => resultaat(model.slug, id, "video"))),
      resultaat(STEM_MODEL, v.stem!, "audio"),
    ]);
    const mp4 = await monteer({
      formaat: r.formaat,
      clips,
      stem,
      muziek: musicTrackUrl(MUZIEK[r.stijl]),
      teksten: r.plan.shots.map((s) => s.tekst),
      naam: r.product.naam,
      eindtekst: r.plan.eindtekst,
      website: r.product.website,
      kleur: r.product.kleur,
    });
    const url = await uploadNaarOpslag(c.user_id, mp4, "mp4", "video/mp4");
    await createServiceClient()
      .from("creaties")
      .update({ status: "klaar", url, klaar_op: new Date().toISOString() })
      .eq("id", c.id)
      .eq("status", "bezig");
  } catch (e) {
    const reden = falReden(e);
    console.error("[reclame] montage mislukt:", reden);
    await markeerMislukt(c, `Montage mislukt: ${reden}`);
  }
}

