import { randomUUID } from "node:crypto";
import { fal } from "@/lib/fal";
import { createServiceClient } from "@/lib/supabase/service";
import { betaal, betaalTerug } from "@/lib/team/team";
import { maakOpdracht, resultaatUrl } from "./makers";
import { receptOpdracht } from "./recepten-opdrachten";
import { startReclame, verversReclame } from "@/lib/reclame/regie";
import { startUgc, verversUgc } from "@/lib/ugc/regie";
import { startTrailer, verversTrailer } from "@/lib/trailer/regie";
import { startMontage, verversMontage } from "@/lib/regisseur/montage";
import { EIGEN } from "@/lib/stem/types";
import type { Creatie, CreatieSoort } from "./types";

fal.config({ credentials: process.env.FAL_KEY });

// DE WACHTRIJ van de nieuwe app.
//
// Tot nu toe wachtte elke tool zelf op zijn eigen fal-verzoek, en zat de klant zolang
// naar een draaiend rondje te kijken. Hier gaat alles op dezelfde manier: afschrijven,
// een rij met status 'bezig', het verzoek in de fal-wachtrij, en klaar. Wie het scherm
// open heeft, vraagt af en toe de stand op; dan wordt het resultaat binnengehaald,
// naar onze eigen opslag gekopieerd (fal-links verlopen) en de rij op 'klaar' gezet.
// Zo kan iemand meerdere dingen tegelijk laten maken en ondertussen doorklikken.

/** Zoveel dingen tegelijk in de maak per account; daarboven wachten tot er één klaar is. */
export const MAX_TEGELIJK = 4;

// Een verzoek dat na een half uur nog niet klaar is, komt niet meer: dan liever de
// credits terug en een nette melding dan een kaart die eeuwig blijft draaien.
const TIJDSLIMIET_MS = 30 * 60 * 1000;
// Een rij zonder fal-verzoek betekent dat het insturen halverwege is gestorven
// (bv. de serverfunctie werd afgebroken).
const ZONDER_VERZOEK_MS = 2 * 60 * 1000;

export class WachtrijFout extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function startCreatie(
  userId: string,
  maker: string,
  ruweInvoer: Record<string, unknown>,
  ouderId?: string | null,
): Promise<Creatie> {
  // Een reclame is geen enkele fal-opdracht maar een reeks stappen; die heeft zijn eigen regie.
  if (maker === "reclame") return startReclame(userId, ruweInvoer, ouderId);
  if (maker === "ugc") return startUgc(userId, ruweInvoer, ouderId);
  if (maker === "trailer") return startTrailer(userId, ruweInvoer, ouderId);
  if (maker === "montage") return startMontage(userId, ruweInvoer);

  let opdracht;
  try {
    ruweInvoer = await vulAanOpServer(userId, maker, ruweInvoer);
    // Recepten bouwen hun opdracht op de server (de verborgen opdrachten); de rest via het
    // client-veilige makers-register.
    opdracht = maker === "recept" ? receptOpdracht(ruweInvoer) : maakOpdracht(maker, ruweInvoer);
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
    throw new WachtrijFout(
      `Je hebt al ${MAX_TEGELIJK} dingen in de maak. Wacht tot er één klaar is.`,
      429,
    );
  }

  if (ouderId) {
    const { data: ouder } = await db
      .from("creaties")
      .select("id")
      .eq("id", ouderId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!ouder) ouderId = null;
  }

  // Wat er écht is afgeschreven, niet het tarief: de interne accounts schrijven niets af,
  // en zouden bij een mislukte poging anders credits "terug" krijgen die ze nooit betaalden.
  // In een team gaat het van de pot van de eigenaar (lib/team/team.ts).
  const { ok, betaald, betalerId } = await betaal(userId, opdracht.credits, `Nieuwe app: ${maker}`);
  if (!ok) {
    throw new WachtrijFout("Niet genoeg credits.", 402);
  }

  const { data: rij, error } = await db
    .from("creaties")
    .insert({
      user_id: userId,
      soort: opdracht.soort,
      status: "bezig",
      maker,
      model: opdracht.endpoint,
      prompt: opdracht.prompt,
      invoer: opdracht.invoer,
      credits: betaald,
      fal_endpoint: opdracht.endpoint,
      ouder_id: ouderId ?? null,
      // Alleen als het iemand anders is: zo werkt het insturen ook nog vóór migratie 101.
      ...(betalerId !== userId ? { betaald_door: betalerId } : {}),
    })
    .select("*")
    .single();
  if (error || !rij) {
    await betaalTerug({ user_id: userId, betaald_door: betalerId, credits: betaald }, `Terug: nieuwe app ${maker} niet gestart`);
    throw new WachtrijFout("Kon de opdracht niet opslaan. Probeer het opnieuw.", 500);
  }

  try {
    const { request_id } = await fal.queue.submit(opdracht.endpoint, {
      input: opdracht.falInvoer as never,
    });
    const { data: bijgewerkt } = await db
      .from("creaties")
      .update({ fal_request_id: request_id })
      .eq("id", rij.id)
      .select("*")
      .single();
    return (bijgewerkt ?? { ...rij, fal_request_id: request_id }) as Creatie;
  } catch (e) {
    const reden = falReden(e);
    console.error("[creaties] insturen mislukt:", reden);
    return (await markeerMislukt(rij as Creatie, `Insturen mislukt: ${reden}`)) ?? (rij as Creatie);
  }
}

/**
 * Haalt de stand op van een creatie die nog bezig is, en rondt hem af als fal klaar is.
 * Een tijdelijke storing bij het opvragen laat de creatie gewoon 'bezig': de volgende
 * keer opnieuw proberen.
 */
export async function ververs(c: Creatie): Promise<Creatie> {
  if (c.status !== "bezig") return c;
  if (c.maker === "reclame") return verversReclame(c);
  if (c.maker === "ugc") return verversUgc(c);
  if (c.maker === "trailer") return verversTrailer(c);
  if (c.maker === "montage") return verversMontage(c);
  const leeftijd = Date.now() - new Date(c.created_at).getTime();

  if (!c.fal_request_id || !c.fal_endpoint) {
    if (leeftijd > ZONDER_VERZOEK_MS) {
      return (await markeerMislukt(c, "De opdracht is niet goed aangekomen.")) ?? c;
    }
    return c;
  }

  let status: string;
  try {
    const st = (await fal.queue.status(c.fal_endpoint, {
      requestId: c.fal_request_id,
      logs: false,
    })) as { status: string };
    status = st.status;
  } catch (e) {
    console.error("[creaties] status opvragen mislukt:", falReden(e));
    if (leeftijd > TIJDSLIMIET_MS) return (await markeerMislukt(c, "Het duurde te lang.")) ?? c;
    return c;
  }

  if (status === "IN_QUEUE" || status === "IN_PROGRESS") {
    if (leeftijd > TIJDSLIMIET_MS) return (await markeerMislukt(c, "Het duurde te lang.")) ?? c;
    return c;
  }

  try {
    const result = await fal.queue.result(c.fal_endpoint, { requestId: c.fal_request_id });
    const tijdelijk = resultaatUrl(c.soort, result.data);
    if (!tijdelijk) return (await markeerMislukt(c, "Er kwam geen resultaat terug.")) ?? c;
    let invoer = c.invoer;
    if (c.maker === "stem-kloon") {
      const voiceId = (result.data as { custom_voice_id?: string }).custom_voice_id;
      if (!voiceId) return (await markeerMislukt(c, "Het trainen van de stem lukte niet.")) ?? c;
      invoer = { ...c.invoer, voiceId };
      await houdKloonVast(voiceId);
    }
    const url = await bewaarBestand(c.user_id, tijdelijk, c.soort);
    const { data } = await createServiceClient()
      .from("creaties")
      .update({ status: "klaar", url, invoer, klaar_op: new Date().toISOString() })
      .eq("id", c.id)
      .eq("status", "bezig")
      .select("*")
      .maybeSingle();
    return (data as Creatie | null) ?? { ...c, status: "klaar", url };
  } catch (e) {
    // Een afgekeurde opdracht (bv. door het inhoudsfilter van het model) staat als
    // COMPLETED in de wachtrij; result() gooit dan met de reden in body.detail.
    return (await markeerMislukt(c, falReden(e))) ?? c;
  }
}

/**
 * Wat de browser niet mag opgeven, vullen we hier aan: het MiniMax-id van een eigen stem
 * (alleen van de gebruiker zelf) en de echte lengte van het geluid voor een pratende foto
 * (daar hangt de prijs van af).
 */
async function vulAanOpServer(userId: string, maker: string, ruw: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (maker === "voice-over" && String(ruw.stemId ?? "").startsWith(EIGEN)) {
    const id = String(ruw.stemId).slice(EIGEN.length);
    const { data } = await createServiceClient()
      .from("creaties")
      .select("invoer, status")
      .eq("id", id)
      .eq("user_id", userId)
      .eq("maker", "stem-kloon")
      .maybeSingle();
    const inv = (data?.invoer ?? {}) as { voiceId?: string; naam?: string };
    if (data?.status !== "klaar" || !inv.voiceId) throw new Error("Deze eigen stem is niet (meer) beschikbaar.");
    return { ...ruw, minimaxVoiceId: inv.voiceId, stemNaam: inv.naam ?? ruw.stemNaam };
  }
  if (maker === "pratende-foto") {
    const { minimaxVoiceId: _, ...rest } = ruw;
    return { ...rest, audioSec: await audioDuur(String(ruw.audioUrl ?? "")) };
  }
  // Nooit een voice-id uit de browser overnemen.
  const { minimaxVoiceId: _m, audioSec: _a, ...schoon } = ruw;
  return maker === "voice-over" || maker === "pratende-foto" ? schoon : ruw;
}

async function audioDuur(url: string): Promise<number> {
  if (!/^https:\/\//.test(url)) return 0;
  const ff = (await import("ffmpeg-static")).default as unknown as string;
  const { execFile } = await import("node:child_process");
  const stderr: string = await new Promise((ok) => execFile(ff, ["-hide_banner", "-i", url], { maxBuffer: 1 << 22, timeout: 30000 }, (_e, _o, err) => ok(String(err))));
  const m = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0;
}

/** MiniMax wist een gekloonde stem die 7 dagen niet gebruikt is: meteen één keer gebruiken. */
async function houdKloonVast(voiceId: string) {
  try {
    await fal.subscribe("fal-ai/minimax/speech-02-hd", {
      input: { text: "Hallo.", voice_setting: { voice_id: voiceId }, language_boost: "Dutch", output_format: "url" } as never,
    });
  } catch (e) {
    console.error("[stem-kloon] vasthouden mislukt:", falReden(e));
  }
}

/** Ververst de lopende creaties uit een lijst, een paar tegelijk. */
export async function verversLopende(lijst: Creatie[]): Promise<Creatie[]> {
  const lopend = lijst.filter((c) => c.status === "bezig").slice(0, 8);
  if (lopend.length === 0) return lijst;
  const nieuw = new Map((await Promise.all(lopend.map(ververs))).map((c) => [c.id, c]));
  return lijst.map((c) => nieuw.get(c.id) ?? c);
}

// Alleen de aanroep die de rij écht van 'bezig' naar 'mislukt' zet, geeft de credits
// terug. Twee schermen die tegelijk de stand opvragen, mogen niet twee keer terugboeken.
export async function markeerMislukt(c: Creatie, reden: string): Promise<Creatie | null> {
  const { data } = await createServiceClient()
    .from("creaties")
    .update({ status: "mislukt", foutmelding: reden.slice(0, 500) })
    .eq("id", c.id)
    .eq("status", "bezig")
    .select("*")
    .maybeSingle();
  if (data && c.credits > 0) {
    try {
      await betaalTerug(c, `Terug: nieuwe app ${c.maker} mislukt`);
    } catch (e) {
      console.error("[creaties] credits terugzetten mislukt:", e);
    }
  }
  return data as Creatie | null;
}

const EXT: Record<CreatieSoort, string> = { beeld: "jpg", video: "mp4", audio: "mp3" };
const MIME: Record<CreatieSoort, string> = { beeld: "image/jpeg", video: "video/mp4", audio: "audio/mpeg" };
// Achtergrond-weg levert een PNG met doorzichtige achtergrond. Als .jpg opgeslagen werd
// die doorzichtigheid zwart; dus het bestandstype volgen dat het model teruggeeft.
const EXT_VOOR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

// De fal-link verloopt na een tijd; de bibliotheek moet het bestand blijven tonen.
// Lukt het kopiëren niet, dan liever de tijdelijke link dan helemaal niets.
async function bewaarBestand(userId: string, tijdelijk: string, soort: CreatieSoort): Promise<string> {
  try {
    const res = await fetch(tijdelijk);
    if (!res.ok) throw new Error(`Download mislukt (HTTP ${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    const ext = EXT_VOOR_MIME[mime] ?? EXT[soort];
    return await uploadNaarOpslag(userId, buf, ext, EXT_VOOR_MIME[mime] ? mime : MIME[soort]);
  } catch (e) {
    console.error("[creaties] bewaren mislukt, val terug op de tijdelijke link:", e);
    return tijdelijk;
  }
}

export async function uploadNaarOpslag(userId: string, buf: Buffer, ext: string, mime: string): Promise<string> {
  const db = createServiceClient();
  const pad = `${userId}/creaties/${randomUUID()}.${ext}`;
  const { error } = await db.storage.from("scene-assets").upload(pad, buf, { contentType: mime, upsert: true });
  if (error) throw new Error(error.message);
  return db.storage.from("scene-assets").getPublicUrl(pad).data.publicUrl;
}

export function falReden(err: unknown): string {
  const detail = (err as { body?: { detail?: { msg?: string }[] | string } }).body?.detail;
  const reden =
    (Array.isArray(detail) ? detail[0]?.msg : detail) || (err instanceof Error ? err.message : String(err));
  if (/content|safety|policy|nsfw/i.test(reden)) {
    return "Het model weigerde deze opdracht (inhoudsfilter). Probeer het anders te omschrijven.";
  }
  return reden || "Onbekende fout";
}
