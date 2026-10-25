// DE REGIE van een nagemaakte trend: één rij in de bibliotheek (maker 'trend') die vanzelf
// door één of twee stappen loopt, net als een reclame (lib/reclame/regie.ts):
//
//   scene — het bewerkte beeld (Nano Banana Pro): jij in het decor/de kleding van de trend
//   video — dat beeld (of je foto) beweegt: Kling, de beweging uit de trendvideo, of playback
//
// Elke overgang gaat via een voorwaardelijke update op de huidige stap: twee schermen die
// tegelijk de stand opvragen, mogen de video niet twee keer laten maken (dan betalen wij dubbel).

import { fal } from "@/lib/fal";
import { zetKostenContext } from "@/lib/provider-kosten";
import { createServiceClient } from "@/lib/supabase/service";
import { betaal, betaalTerug } from "@/lib/team/team";
import { isAdminAccount } from "@/lib/studio/access";
import { MAX_TEGELIJK, WachtrijFout, falReden, markeerMislukt, uploadNaarOpslag } from "@/lib/creaties/wachtrij";
import type { Creatie } from "@/lib/creaties/types";
import { BEWEGING_MODEL, METHODE_INFO, trendCredits, type Trend } from "./types";
import { sceneStap, videoStap, type KlantInvoer } from "./opdracht";

fal.config({ credentials: process.env.FAL_KEY });

// Iemand in een trendvideo van 15 s zetten (Wan Replace) duurde in de proef 14 minuten;
// bij een drukke fal kan dat oplopen.
const TIJDSLIMIET_MS = 50 * 60 * 1000;
const VASTGELOPEN_MS = 4 * 60 * 1000;

interface Voortgang {
  stap: "scene" | "video";
  sinds: string;
  endpoint?: string;
  verzoek?: string;
  sceneUrl?: string;
}

interface TrendRij extends KlantInvoer {
  trendId: string;
  formaat: string;
  toestemming: boolean;
  voortgang?: Voortgang;
}

function rij(c: Creatie): TrendRij {
  return c.invoer as unknown as TrendRij;
}

export async function haalTrend(id: string): Promise<Trend | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createServiceClient().from("trends").select("*").eq("id", id).maybeSingle();
  return (data as Trend | null) ?? null;
}

/** Leest wat de klant aanleverde. Gooit met een Nederlandse melding voor het scherm. */
export function leesKlantInvoer(t: Trend, ruw: Record<string, unknown>): KlantInvoer & { toestemming: boolean } {
  const fotos = (Array.isArray(ruw.fotos) ? ruw.fotos : [])
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter((u) => /^https:\/\//.test(u))
    .slice(0, t.velden.fotos.length);
  if (fotos.length < t.velden.fotos.length) {
    throw new Error(t.velden.fotos.length === 1 ? "Kies eerst een foto." : `Kies eerst ${t.velden.fotos.length} foto's.`);
  }
  const tekst = typeof ruw.tekst === "string" ? ruw.tekst.trim().slice(0, 300) : "";
  if (t.velden.tekst?.verplicht && !tekst) throw new Error(`Vul eerst in: ${t.velden.tekst.label.toLowerCase()}.`);
  // Regels vooraf in plaats van een controle achteraf: wie een gezicht gebruikt, bevestigt dat het mag.
  if (t.gezicht && fotos.length > 0 && ruw.toestemming !== true) {
    throw new Error("Bevestig eerst dat je toestemming hebt van wie er op de foto staat.");
  }
  return { fotos, tekst, toestemming: ruw.toestemming === true };
}

export async function startTrend(
  userId: string,
  ruw: Record<string, unknown>,
  ouderId?: string | null,
  opties?: { zonderSessie?: boolean },
): Promise<Creatie> {
  const t = await haalTrend(String(ruw.trendId ?? ""));
  if (!t) throw new WachtrijFout("Deze trend bestaat niet (meer).", 404);
  const db = createServiceClient();
  if (t.status !== "live") {
    // Sam probeert een voorstel uit vóór hij het live zet; klanten zien het niet.
    const { data } = await db.auth.admin.getUserById(userId);
    if (!isAdminAccount(data.user?.email)) throw new WachtrijFout("Deze trend is niet (meer) beschikbaar.", 404);
  }

  let klant: ReturnType<typeof leesKlantInvoer>;
  try {
    klant = leesKlantInvoer(t, ruw);
  } catch (e) {
    throw new WachtrijFout(e instanceof Error ? e.message : String(e), 400);
  }

  const { count } = await db.from("creaties").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "bezig");
  if ((count ?? 0) >= MAX_TEGELIJK) {
    throw new WachtrijFout(`Je hebt al ${MAX_TEGELIJK} dingen in de maak. Wacht tot er één klaar is.`, 429);
  }

  const credits = trendCredits(t);
  const { ok, betaald, betalerId } = await betaal(userId, credits, `Nieuwe app: trend ${t.titel}`, opties);
  if (!ok) throw new WachtrijFout("Niet genoeg credits.", 402);

  const scene = sceneStap(t, klant);
  const voortgang: Voortgang = { stap: scene ? "scene" : "video", sinds: new Date().toISOString() };
  const invoer: TrendRij = { trendId: t.id, ...klant, formaat: t.opdracht.formaat ?? "9:16", voortgang };
  const { data: nieuw, error } = await db
    .from("creaties")
    .insert({
      user_id: userId,
      soort: METHODE_INFO[t.methode].soort,
      status: "bezig",
      maker: "trend",
      model: "trend",
      prompt: `Trend: ${t.titel}${klant.tekst ? ` (${klant.tekst})` : ""}`,
      invoer,
      credits: betaald,
      fal_endpoint: "trend",
      ouder_id: ouderId ?? null,
      ...(betalerId !== userId ? { betaald_door: betalerId } : {}),
    })
    .select("*")
    .single();
  if (error || !nieuw) {
    await betaalTerug({ user_id: userId, betaald_door: betalerId, credits: betaald }, "Terug: trend niet gestart");
    throw new WachtrijFout("Kon de opdracht niet opslaan. Probeer het opnieuw.", 500);
  }

  try {
    const stap = scene ?? videoStap(t, klant, null)!;
    const { request_id } = await fal.queue.submit(stap.endpoint, { input: stap.invoer as never });
    return await zetVoortgang(nieuw as Creatie, { ...voortgang, endpoint: stap.endpoint, verzoek: request_id });
  } catch (e) {
    const reden = falReden(e);
    console.error("[trend] insturen mislukt:", reden);
    return (await markeerMislukt(nieuw as Creatie, `Insturen mislukt: ${reden}`)) ?? (nieuw as Creatie);
  }
}

async function zetVoortgang(c: Creatie, voortgang: Voortgang): Promise<Creatie> {
  const invoer = { ...rij(c), voortgang };
  const { data } = await createServiceClient().from("creaties").update({ invoer }).eq("id", c.id).select("*").single();
  return (data as Creatie | null) ?? { ...c, invoer: invoer as unknown as Record<string, unknown> };
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

async function resultaatVan(endpoint: string, id: string): Promise<string> {
  const { data } = await fal.queue.result(endpoint, { requestId: id });
  const d = data as { images?: { url?: string }[]; image?: { url?: string }; video?: { url?: string } };
  const url = d.video?.url ?? d.images?.[0]?.url ?? d.image?.url;
  if (!url) throw new Error("Er kwam geen resultaat terug.");
  return url;
}

/**
 * Wan Replace levert de video zonder geluid. Zonder de muziek of het geluid van de trend
 * herkent niemand hem, dus zetten we het geluid van de originele trendvideo eronder.
 */
async function metGeluid(video: Buffer, geluid: string): Promise<Buffer> {
  const { mkdtemp, readFile, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const ff = (await import("ffmpeg-static")).default as unknown as string;
  const { execFile } = await import("node:child_process");
  const map = await mkdtemp(path.join(tmpdir(), "trend-"));
  try {
    await writeFile(path.join(map, "in.mp4"), video);
    const uit = path.join(map, "uit.mp4");
    await new Promise<void>((ok, fout) =>
      execFile(ff, ["-y", "-i", path.join(map, "in.mp4"), "-i", geluid, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", uit], { timeout: 120000 }, (e, _o, err) =>
        e ? fout(new Error(String(err).slice(-300))) : ok(),
      ),
    );
    return await readFile(uit);
  } finally {
    await rm(map, { recursive: true, force: true });
  }
}

async function rondAf(c: Creatie, tijdelijk: string, geluid?: string | null): Promise<Creatie> {
  let url = tijdelijk;
  try {
    const res = await fetch(tijdelijk);
    if (!res.ok) throw new Error(`Download mislukt (HTTP ${res.status})`);
    const video = c.soort === "video";
    let buf: Buffer = Buffer.from(await res.arrayBuffer());
    if (video && geluid) {
      try {
        buf = await metGeluid(buf, geluid);
      } catch (e) {
        // Liever zonder geluid dan helemaal niets.
        console.error("[trend] geluid eronder zetten mislukt:", e);
      }
    }
    url = await uploadNaarOpslag(c.user_id, buf, video ? "mp4" : "jpg", video ? "video/mp4" : "image/jpeg");
  } catch (e) {
    // Liever de tijdelijke link dan niets; die verloopt pas na dagen.
    console.error("[trend] bewaren mislukt, val terug op de tijdelijke link:", e);
  }
  const { data } = await createServiceClient()
    .from("creaties")
    .update({ status: "klaar", url, klaar_op: new Date().toISOString() })
    .eq("id", c.id)
    .eq("status", "bezig")
    .select("*")
    .maybeSingle();
  return (data as Creatie | null) ?? { ...c, status: "klaar", url };
}

/** Laat een trend een stap verder lopen als dat kan. Zelfde rol als ververs() in de wachtrij. */
export async function verversTrend(c: Creatie): Promise<Creatie> {
  if (c.status !== "bezig") return c;
  const r = rij(c);
  const v = r.voortgang;
  if (!v) return (await markeerMislukt(c, "De opdracht is niet goed aangekomen.")) ?? c;
  if (Date.now() - new Date(c.created_at).getTime() > TIJDSLIMIET_MS) return (await markeerMislukt(c, "Het duurde te lang.")) ?? c;
  zetKostenContext(c.user_id, "Nieuwe app: trend");
  const stapLeeftijd = Date.now() - new Date(v.sinds).getTime();

  try {
    if (!v.verzoek || !v.endpoint) {
      return stapLeeftijd > VASTGELOPEN_MS ? ((await markeerMislukt(c, "De opdracht is niet goed aangekomen.")) ?? c) : c;
    }
    const st = (await fal.queue.status(v.endpoint, { requestId: v.verzoek, logs: false })) as { status: string };
    if (st.status !== "COMPLETED") return c;
    const url = await resultaatVan(v.endpoint, v.verzoek);

    if (v.stap === "video") {
      const geluid = v.endpoint === BEWEGING_MODEL ? (await haalTrend(r.trendId))?.geluid : null;
      return await rondAf(c, url, geluid);
    }

    // De scène is klaar. Bij een beeldtrend is dat het eindresultaat; anders de video starten.
    const t = await haalTrend(r.trendId);
    if (!t) return (await markeerMislukt(c, "Deze trend bestaat niet meer.")) ?? c;
    const stap = videoStap(t, r, url);
    if (!stap) return await rondAf(c, url);
    const naar: Voortgang = { stap: "video", sinds: new Date().toISOString(), sceneUrl: url };
    const gewonnen = await claim(c, v, naar);
    if (!gewonnen) return c;
    const { request_id } = await fal.queue.submit(stap.endpoint, { input: stap.invoer as never });
    return await zetVoortgang(gewonnen, { ...naar, endpoint: stap.endpoint, verzoek: request_id });
  } catch (e) {
    // Een afgekeurde opdracht (inhoudsfilter) komt hier als fout uit result(). Een storing
    // bij het opvragen van de stand is tijdelijk: dan gewoon later opnieuw.
    const reden = falReden(e);
    if (/weigerde|geen resultaat|422|content|Insturen/i.test(reden)) return (await markeerMislukt(c, reden)) ?? c;
    console.error("[trend] verder zetten mislukt, later opnieuw:", reden);
    return c;
  }
}
