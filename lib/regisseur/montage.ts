// Algemene montage: losse clips (of stilstaande beelden) uit de bibliotheek aan elkaar,
// met optioneel een titel vooraf, een voice-over, muziek en een eindkaart. De Regisseur
// gebruikt dit om een korte film of reclame af te maken; het is een gewone creatie
// (maker 'montage'), dus het eindresultaat staat in de bibliotheek.
//
// Geen fal-wachtrij: de stem duurt een paar seconden en de montage een halve minuut, dus
// dat gebeurt direct na het antwoord (after()), net als de montage van de reclame.

import { vindStem } from "@/lib/stem/bibliotheek";
import { after } from "next/server";
import { tekstPng } from "@/lib/export/tekst-png";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fal } from "@/lib/fal";
import { createServiceClient } from "@/lib/supabase/service";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { musicTrackUrl, MUSIC_TRACKS, type MusicCategory } from "@/lib/music/library";
import { renderMusicBed } from "@/lib/music/bed";
import { MAX_TEGELIJK, WachtrijFout, markeerMislukt, uploadNaarOpslag } from "@/lib/creaties/wachtrij";
import { betaal, betaalTerug } from "@/lib/team/team";
import { UGC_STEMMEN } from "@/lib/ugc/types";
import type { Creatie } from "@/lib/creaties/types";
import { EINDMAKERS } from "@/lib/creaties/eindmakers";

fal.config({ credentials: process.env.FAL_KEY });

const run = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;
const VERTELLER = "YXgx21dvgkRwunWFpa5d"; // Jamie, diepe verteller
// Stilstaande beelden kosten nauwelijks geheugen, clips wel (zie DECODER): daarom twee grenzen.
// Wie eroverheen gaat krijgt een melding; nooit stil iets weglaten (Sterrenrijk, 04-11-2026:
// de laatste 10 beelden vielen ongemerkt weg).
export const MAX_STUKKEN = 60;
export const MAX_VIDEOCLIPS = 24;
// ElevenLabs v3 neemt per keer maar een beperkt stuk tekst; langer spreken we in delen in en
// plakken we aan elkaar. Daarboven een melding, nooit stil afkappen (Sterrenrijk, 04-11-2026:
// de tekst werd op 1200 tekens afgesneden en de stem stopte midden in een woord).
export const MAX_VOICEOVER = 6000;
const STEM_DEEL = 2400;
const VASTGELOPEN_MS = 8 * 60 * 1000;
// Kling-clips komen bijna in 1080x1920 binnen en de concat opent alle clips tegelijk. Met
// ffmpegs standaard (een decoder-thread per kern, elk met een eigen framebuffer) liep het
// geheugen op tot ~800 MB en ging de montage op de server af en toe onderuit (26-10-2026).
// Twee threads per clip: ~250 MB, en nauwelijks trager.
const DECODER = ["-threads", "2"];

export interface MontageInvoer {
  clipIds: string[];
  titel?: string;
  eindtekst?: string;
  voiceover?: string;
  stem?: string;
  // Een stijl ("episch" → eerste nummer van die stijl) of een nummer op slug/titel ("golden-boots").
  muziek?: MusicCategory | string | null;
}

function kiesNummer(muziek: string | null | undefined) {
  if (!muziek) return null;
  const k = muziek.trim().toLowerCase();
  return (
    MUSIC_TRACKS.find((t) => t.slug === k || t.title.toLowerCase() === k) ??
    MUSIC_TRACKS.find((t) => t.category === k) ??
    null
  );
}

/** Stemprijs is per begonnen 1.000 tekens (zie CREDIT_COSTS.VOICE). */
export function montageCredits(m: Pick<MontageInvoer, "voiceover">): number {
  const n = m.voiceover?.trim().length ?? 0;
  return n ? CREDIT_COSTS.VOICE * Math.ceil(n / 1000) : 0;
}

/** Knipt een lange tekst op zinsgrenzen in delen van hoogstens `max` tekens. */
export function stemDelen(tekst: string, max = STEM_DEEL): string[] {
  const zinnen = tekst.match(/[^.!?…]+[.!?…]+["'”’)]*\s*|[^.!?…]+$/g) ?? [tekst];
  const delen: string[] = [];
  let huidig = "";
  for (const z of zinnen) {
    if (huidig && (huidig + z).length > max) { delen.push(huidig.trim()); huidig = ""; }
    if (z.length > max) {
      // Eén reuzenzin zonder punt: op een spatie knippen.
      let rest = z;
      while (rest.length > max) {
        const knip = rest.lastIndexOf(" ", max) > 0 ? rest.lastIndexOf(" ", max) : max;
        delen.push(rest.slice(0, knip).trim());
        rest = rest.slice(knip);
      }
      huidig = rest;
    } else huidig += z;
  }
  if (huidig.trim()) delen.push(huidig.trim());
  return delen;
}

export function leesMontage(ruw: Record<string, unknown>): MontageInvoer {
  const clipIds = (Array.isArray(ruw.clipIds) ? ruw.clipIds : []).map(String).filter(Boolean);
  if (!clipIds.length) throw new Error("Kies eerst de clips die in de montage moeten.");
  if (clipIds.length > MAX_STUKKEN) throw new Error(`Een montage kan hoogstens ${MAX_STUKKEN} beelden en clips bevatten (nu ${clipIds.length}). Maak de video in delen of laat beelden weg.`);
  const t = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const vo = typeof ruw.voiceover === "string" ? ruw.voiceover.trim() : "";
  if (vo.length > MAX_VOICEOVER) throw new Error(`De voice-over is te lang (${vo.length} tekens, hoogstens ${MAX_VOICEOVER}, zo'n 6 minuten). Maak hem korter of maak de video in delen.`);
  const stem = t(ruw.stem, 40);
  const muziek = kiesNummer(typeof ruw.muziek === "string" ? ruw.muziek : null) ? String(ruw.muziek).trim() : null;
  return {
    clipIds,
    titel: t(ruw.titel, 60) || undefined,
    eindtekst: t(ruw.eindtekst, 60) || undefined,
    voiceover: vo || undefined,
    // Een stem op naam ("Hugo") of id, uit de UGC-set of de stemmenbibliotheek; onbekend = de verteller.
    stem: UGC_STEMMEN.find((s) => s.id === stem || s.naam.toLowerCase() === stem.toLowerCase())?.id ?? vindStem(stem)?.id ?? VERTELLER,
    muziek,
  };
}

export async function startMontage(userId: string, ruw: Record<string, unknown>): Promise<Creatie> {
  let m: MontageInvoer;
  try {
    m = leesMontage(ruw);
  } catch (e) {
    throw new WachtrijFout(e instanceof Error ? e.message : String(e), 400);
  }
  const db = createServiceClient();
  const { data: clips } = await db.from("creaties").select("id, soort, url, status, invoer, maker").eq("user_id", userId).in("id", m.clipIds);
  const opVolgorde = m.clipIds.map((id) => (clips ?? []).find((c) => c.id === id)).filter((c) => c && c.status === "klaar" && c.url);
  if (opVolgorde.length !== m.clipIds.length) throw new WachtrijFout("Niet alle clips zijn (al) klaar.", 400);
  const videos = opVolgorde.filter((c) => c!.soort === "video").length;
  if (videos > MAX_VIDEOCLIPS) throw new WachtrijFout(`Een montage kan hoogstens ${MAX_VIDEOCLIPS} bewegende clips bevatten (nu ${videos}); stilstaande beelden tellen niet mee. Maak de video in delen.`, 400);
  const { count } = await db.from("creaties").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "bezig");
  if ((count ?? 0) >= MAX_TEGELIJK) throw new WachtrijFout(`Je hebt al ${MAX_TEGELIJK} dingen in de maak.`, 429);

  const { ok, betaald, betalerId } = await betaal(userId, montageCredits(m), "Nieuwe app: montage");
  if (!ok) throw new WachtrijFout("Niet genoeg credits.", 402);
  const formaat = ((opVolgorde[0]!.invoer as { formaat?: string }).formaat as string) || "16:9";
  const { data: rij, error } = await db
    .from("creaties")
    .insert({
      user_id: userId,
      soort: "video",
      status: "bezig",
      maker: "montage",
      model: "montage",
      prompt: m.titel ? `Montage: ${m.titel}` : `Montage van ${m.clipIds.length} clips`,
      invoer: { ...m, formaat },
      credits: betaald,
      fal_endpoint: "montage",
      ...(betalerId !== userId ? { betaald_door: betalerId } : {}),
    })
    .select("*")
    .single();
  if (error || !rij) {
    await betaalTerug({ user_id: userId, betaald_door: betalerId, credits: betaald }, "Terug: montage niet gestart");
    throw new WachtrijFout("Kon de montage niet opslaan.", 500);
  }
  const werk = () => voerUit(rij as Creatie, opVolgorde.map((c) => ({ url: c!.url as string, soort: c!.soort as string, metGeluid: EINDMAKERS.has(c!.maker as string) })), m, formaat);
  try {
    after(werk);
  } catch {
    void werk();
  }
  return rij as Creatie;
}

/** Een montage die al te lang 'bezig' staat, is halverwege gestorven. */
export async function verversMontage(c: Creatie): Promise<Creatie> {
  if (c.status !== "bezig") return c;
  if (Date.now() - new Date(c.created_at).getTime() > VASTGELOPEN_MS) {
    return (await markeerMislukt(c, "De montage duurde te lang.")) ?? c;
  }
  return c;
}

async function duur(bestand: string): Promise<number> {
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", bestand], { maxBuffer: 1 << 22 }).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
  const m = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0;
}

async function heeftGeluid(bestand: string): Promise<boolean> {
  const { stderr } = await run(FFMPEG, ["-hide_banner", "-i", bestand], { maxBuffer: 1 << 22 }).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
  return /Stream #\d+:\d+.*: Audio:/.test(stderr);
}

async function download(url: string, doel: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download mislukt (HTTP ${res.status})`);
  await writeFile(doel, Buffer.from(await res.arrayBuffer()));
  return doel;
}

async function voerUit(c: Creatie, clips: { url: string; soort: string; metGeluid?: boolean }[], m: MontageInvoer, formaat: string) {
  const map = await mkdtemp(path.join(tmpdir(), "montage-"));
  try {
    const [W, H] = formaat === "9:16" ? [720, 1280] : formaat === "1:1" ? [720, 720] : [1280, 720];
    const bestanden = await Promise.all(clips.map((k, i) => download(k.url, path.join(map, `c${i}${k.soort === "video" ? ".mp4" : ".jpg"}`))));
    const duren = await Promise.all(bestanden.map((b, i) => (clips[i].soort === "video" ? duur(b) : Promise.resolve(3))));

    let stem: string | null = null;
    if (m.voiceover) {
      const delen = stemDelen(m.voiceover);
      const mp3s = await Promise.all(delen.map(async (tekst, i) => {
        const r = await fal.subscribe("fal-ai/elevenlabs/tts/eleven-v3", {
          input: { text: tekst, voice: m.stem, language_code: "nl", stability: 0.5, similarity_boost: 0.75, speed: 1 } as never,
        });
        const url = (r.data as { audio?: { url?: string } }).audio?.url;
        if (!url) throw new Error("De stem kwam niet terug.");
        return download(url, path.join(map, `stem${i}.mp3`));
      }));
      if (mp3s.length === 1) stem = mp3s[0];
      else {
        // Delen achter elkaar, met een korte adempauze ertussen.
        stem = path.join(map, "stem.wav");
        const inv = mp3s.flatMap((b) => ["-i", b]);
        const keten = mp3s.map((_, i) => `[${i}:a]aformat=channel_layouts=stereo,aresample=44100${i < mp3s.length - 1 ? ",apad=pad_dur=0.35" : ""}[s${i}]`).join(";");
        await run(FFMPEG, ["-hide_banner", "-loglevel", "error", ...inv, "-filter_complex", `${keten};${mp3s.map((_, i) => `[s${i}]`).join("")}concat=n=${mp3s.length}:v=0:a=1[a]`, "-map", "[a]", "-y", stem], { maxBuffer: 1 << 22 });
      }
    }
    const titelDuur = m.titel ? 2.5 : 0;
    const eindDuur = m.eindtekst ? 3 : 0;
    const clipsDuur = duren.reduce((s, d) => s + d, 0);
    const stemDuur = stem ? await duur(stem) : 0;
    const totaal = Math.max(titelDuur + clipsDuur + eindDuur, titelDuur + stemDuur + 0.8);

    const inputs: string[] = [];
    const f: string[] = [];
    const segs: string[] = [];
    // Titel- en eindkaart als plaatje (drawtext bestaat niet in de ffmpeg op de server, zie
    // lib/export/tekst-png.ts). De invoer komt achteraan, na clips en geluid; het nummer
    // vullen we pas in als dat bekend is.
    const kaarten: { label: string; png: string; d: number }[] = [];
    const kaart = async (tekst: string, d: number, label: string) => {
      const png = path.join(map, `${label}.png`);
      const grootte = Math.min(72, Math.floor((W * 0.86) / (tekst.length * 0.66)));
      await writeFile(png, tekstPng({ regels: [tekst.toUpperCase()], breedte: W, hoogte: H, grootte, lettertype: "Arvo", achtergrond: "black" }));
      kaarten.push({ label, png, d });
      f.push(`§${label}§`);
      segs.push(`[${label}]`);
    };
    if (m.titel) await kaart(m.titel, titelDuur, "titel");
    // Elke clip is precies één invoer, in volgorde: invoer i = clip i.
    bestanden.forEach((b, i) => {
      const k = i;
      if (clips[i].soort === "video") inputs.push(...DECODER, "-i", b);
      else inputs.push("-loop", "1", "-t", "3", "-i", b);
      f.push(`[${k}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1,format=yuv420p,trim=duration=${duren[i].toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
      segs.push(`[v${i}]`);
    });
    if (m.eindtekst) await kaart(m.eindtekst, eindDuur, "eind");
    f.push(`${segs.join("")}concat=n=${segs.length}:v=1:a=0,tpad=stop_mode=clone:stop_duration=10,trim=duration=${totaal.toFixed(2)}[v]`);

    const audio: string[] = [];
    // Afgemonteerde video's (met eigen stem) houden hun geluid; losse AI-clips niet. Zo kun je
    // stukken met voice-over aan elkaar zetten zonder dat de stem wegvalt (Sterrenrijk, 04-11-2026).
    const eigenGeluid = await Promise.all(bestanden.map((b, i) => (clips[i].metGeluid ? heeftGeluid(b) : Promise.resolve(false))));
    if (eigenGeluid.some(Boolean)) {
      const delen = bestanden.map((_, i) =>
        eigenGeluid[i]
          ? `[${i}:a]aformat=channel_layouts=stereo,aresample=44100,atrim=duration=${duren[i].toFixed(3)},apad=whole_dur=${duren[i].toFixed(3)},asetpts=PTS-STARTPTS[g${i}]`
          : `anullsrc=r=44100:cl=stereo,atrim=duration=${duren[i].toFixed(3)}[g${i}]`,
      );
      f.push(...delen);
      const voor = titelDuur ? `anullsrc=r=44100:cl=stereo,atrim=duration=${titelDuur}[gt];` : "";
      f.push(`${voor}${titelDuur ? "[gt]" : ""}${bestanden.map((_, i) => `[g${i}]`).join("")}concat=n=${bestanden.length + (titelDuur ? 1 : 0)}:v=0:a=1[clipgeluid]`);
      audio.push("[clipgeluid]");
    }
    const muziekZacht = !!stem || eigenGeluid.some(Boolean);
    let extra = bestanden.length;
    if (stem) {
      inputs.push("-i", stem);
      const ms = Math.round(titelDuur * 1000 + 300);
      f.push(`[${extra}:a]aformat=channel_layouts=stereo,aresample=44100,adelay=${ms}|${ms}[st]`);
      audio.push("[st]");
      extra++;
    }
    const track = kiesNummer(m.muziek);
    if (track) {
      const bed = await renderMusicBed(await download(musicTrackUrl(track.slug), path.join(map, "m.mp3")), totaal, path.join(map, "bed.wav"));
      inputs.push("-i", bed);
      f.push(`[${extra}:a]volume=${muziekZacht ? 0.22 : 0.6}[mu]`);
      audio.push("[mu]");
    }
    f.push(audio.length ? `${audio.join("")}amix=inputs=${audio.length}:duration=longest:normalize=0,apad[a]` : `anullsrc=r=44100:cl=stereo[a]`);
    for (const k of kaarten) {
      const nr = inputs.filter((x) => x === "-i").length;
      inputs.push("-loop", "1", "-framerate", "30", "-t", String(k.d), "-i", k.png);
      const filter = `[${nr}:v]fps=30,setsar=1,format=yuv420p,trim=duration=${k.d},fade=t=in:st=0:d=0.4,fade=t=out:st=${(k.d - 0.4).toFixed(2)}:d=0.4[${k.label}]`;
      f.splice(f.indexOf(`§${k.label}§`), 1, filter);
    }

    const uit = path.join(map, "montage.mp4");
    const args = ["-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex_threads", "2", "-filter_complex", f.join(";"), "-map", "[v]", "-map", "[a]", "-t", totaal.toFixed(2),
      "-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-y", uit];
    // Eén keer opnieuw: een server die net even vol zit, laat ffmpeg soms halverwege stoppen.
    await run(FFMPEG, args, { maxBuffer: 1 << 25 }).catch(() => run(FFMPEG, args, { maxBuffer: 1 << 25 })).catch((e: { stderr?: string; signal?: string; message?: string }) => {
      const reden = e.signal ? `gestopt (${e.signal}), waarschijnlijk geheugen vol` : (e.stderr ?? "").trim().split("\n").slice(-3).join(" ") || e.message;
      throw new Error(`ffmpeg: ${reden}`);
    });
    const url = await uploadNaarOpslag(c.user_id, await readFile(uit), "mp4", "video/mp4");
    await createServiceClient().from("creaties").update({ status: "klaar", url, klaar_op: new Date().toISOString() }).eq("id", c.id).eq("status", "bezig");
  } catch (e) {
    console.error("[montage] mislukt:", e);
    await markeerMislukt(c, `Montage mislukt: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
  } finally {
    await rm(map, { recursive: true, force: true }).catch(() => {});
  }
}
