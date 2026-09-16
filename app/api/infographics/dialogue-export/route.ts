import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { storyCanvasSize } from "@/lib/infographics/canvas-size";
import { STORY_FPS } from "@/lib/infographics/story-layout";
import type { DialogueSpec } from "@/lib/infographics/dialogue-schema";
import { renderMusicBed } from "@/lib/music/bed";
import {
  beginEindFade, montagePlan, overgangOffsets, segmentAudioFilter, segmentVideoFilter, zachteLassen, SCENE_OVERGANG,
} from "@/lib/infographics/dialoog-montage";

export const runtime = "nodejs";
export const maxDuration = 800;

// Elke clip bevat precies één gesproken regel. We knippen hem vanaf het gemeten
// moment waarop de mond opengaat en precies zo lang als de zin duurt — zo begint
// de stem op de mondbeweging en praat er niemand door nadat het geluid stopt.
//
// Hoe de clips in elkaar overlopen (een korte overvloeier binnen een scène, een
// langere over een stil moment tussen scènes, een fade aan begin en eind) staat in
// dialoog-montage.ts. Alles gaat door één filtergraph, dus geen stream-copy.

function runFfmpeg(args: string[], limietMs = 700_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = (ffmpegPath as unknown as string) || "ffmpeg";
    const proc = spawn(bin, ["-hide_banner", "-loglevel", "error", ...args]);
    let err = "";
    const t = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("ffmpeg duurde te lang")); }, limietMs);
    proc.stderr.on("data", (d) => { err += d.toString(); });
    proc.on("error", (e) => { clearTimeout(t); reject(e); });
    proc.on("close", (code) => { clearTimeout(t); code === 0 ? resolve() : reject(new Error("ffmpeg: " + err.slice(-800))); });
  });
}

function probeDuur(file: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn((ffmpegPath as unknown as string) || "ffmpeg", ["-hide_banner", "-i", file, "-f", "null", "-"]);
    let s = "";
    proc.stderr.on("data", (c) => { s += c.toString(); });
    proc.on("close", () => {
      const m = s.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      resolve(m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0);
    });
    proc.on("error", () => resolve(0));
  });
}

async function download(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch { return false; }
}

const ENC = (fps: number) => [
  "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
  "-r", String(fps), "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "192k",
];

// Tussenbestanden worden nog een keer opnieuw gecodeerd. Een lange video liep met drie
// volle veryfast-rondes in full-HD over de tijdslimiet van Vercel. Ultrafast was snel
// maar maakte de bestanden zo groot dat /tmp (~500 MB) volliep. Superfast op de maat
// van de clips (720p, zie TUSSENMAAT) is sneller én kleiner; pas de laatste ronde
// schaalt naar de eindmaat, en de clips zelf zijn niet groter, dus er gaat niets verloren.
const ENC_TUSSEN = (fps: number) => [
  "-c:v", "libx264", "-preset", "superfast", "-crf", "18", "-pix_fmt", "yuv420p",
  "-r", String(fps), "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "192k",
];

/** Tijd sinds de start en vrije ruimte in /tmp, voor het serverlog. */
async function stand(begin: number, map: string): Promise<string> {
  const vrij = await statfs(map).then((f) => `${Math.round((f.bavail * f.bsize) / 1048576)} MB vrij`).catch(() => "vrije ruimte onbekend");
  return `na ${Math.round((Date.now() - begin) / 1000)}s, ${vrij}`;
}

/** Voert taken uit met hoogstens `max` tegelijk, in de volgorde van de lijst. */
async function metMaximaal<T, R>(items: T[], max: number, taak: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const uit = new Array<R>(items.length);
  let volgende = 0;
  await Promise.all(Array.from({ length: Math.min(max, items.length) }, async () => {
    while (volgende < items.length) {
      const i = volgende++;
      uit[i] = await taak(items[i], i);
    }
  }));
  return uit;
}

export async function POST(req: NextRequest) {
  let dir: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

    const { spec } = (await req.json()) as { spec?: DialogueSpec };
    if (!spec || !Array.isArray(spec.scenes) || spec.scenes.length === 0) {
      return NextResponse.json({ error: "Geen dialoog om te exporteren" }, { status: 400 });
    }

    const begin = Date.now();
    const { width: W, height: H } = storyCanvasSize(spec.format);
    const fps = STORY_FPS;
    const werkmap = await mkdtemp(path.join(tmpdir(), "dialogue-"));
    dir = werkmap;

    // ---------- 1. Welke regels er in de video komen ----------
    // Eerst de lijst, dan pas de segmenten: of een regel een stille kop of staart
    // krijgt, hangt af van de regel ervoor en erna (zie montagePlan).
    type Kandidaat = { scene: number; clip: string; stem: string | null; spraak: number; start: number; isActie: boolean };
    const regels: { si: number; regel: DialogueSpec["scenes"][number]["lines"][number]; n: number }[] = [];
    for (const [si, scene] of spec.scenes.entries()) {
      for (const regel of scene.lines) {
        if (!regel.videoUrl) continue;
        if (regel.kind !== "actie" && !regel.audioUrl) continue;
        regels.push({ si, regel, n: regels.length });
      }
    }
    // Ophalen en meten tegelijk: één voor één kostte het bij een lange video al een
    // flink deel van de tijdslimiet.
    const gevonden = await metMaximaal(regels, 8, async ({ si, regel, n }): Promise<Kandidaat | null> => {
      const isActie = regel.kind === "actie";
      const metStem = !!regel.audioUrl;
      const clip = path.join(werkmap, `c${n}.mp4`);
      const stem = path.join(werkmap, `a${n}.mp3`);
      if (!(await download(regel.videoUrl as string, clip))) return null;
      const clipDuur = await probeDuur(clip);

      // Een actiebeeld ZONDER voice-over: de muziek draagt het.
      if (!metStem) {
        const duur = Math.max(1, Math.min(regel.seconden ?? 4, clipDuur || (regel.seconden ?? 4)));
        return { scene: si, clip, stem: null, spraak: duur, start: 0, isActie };
      }

      if (!(await download(regel.audioUrl as string, stem))) return null;
      // De echte audiolengte meten in plaats van audioDuration uit de spec
      // vertrouwen: die is een schatting en een te lage waarde kapt de zin af.
      const stemDuur = (await probeDuur(stem)) || regel.audioDuration || 4;
      // Nooit voorbij het einde van de clip beginnen.
      // Bij een voice-over hoeft er niets op een mond te vallen: begin op nul.
      const start = isActie ? 0 : Math.max(0, Math.min(regel.mouthStart ?? 0, Math.max(0, clipDuur - stemDuur)));
      return { scene: si, clip, stem, spraak: stemDuur, start, isActie };
    });
    const kandidaten = gevonden.filter((k): k is Kandidaat => k !== null);
    console.log(`[dialogue-export] ${kandidaten.length} fragmenten opgehaald ${await stand(begin, werkmap)}`);

    if (kandidaten.length === 0) {
      return NextResponse.json({ error: "Nog geen clips gegenereerd om te exporteren" }, { status: 400 });
    }

    // ---------- 2. Per regel een segment op maat ----------
    const plan = montagePlan(kandidaten.map((k) => ({ scene: k.scene, spraak: k.spraak })));
    // De clips komen als 720p uit Seedance; groter rekenen tot aan de laatste stap kost
    // alleen tijd en schijfruimte.
    const TW = Math.round((W * 2) / 3 / 2) * 2, TH = Math.round((H * 2) / 3 / 2) * 2;
    const schaal = `scale=${TW}:${TH}:force_original_aspect_ratio=increase,crop=${TW}:${TH},fps=${fps},setsar=1,format=yuv420p`;
    const segmenten = await metMaximaal(kandidaten, 2, async (k, i) => {
      const p = plan[i];
      const seg = path.join(werkmap, `s${String(i).padStart(3, "0")}.mp4`);
      // Het beeld is de zachte las langer dan het geluid: dat stuk overlapt straks de
      // volgende zin van de scène. Daarom per spoor afkappen in plaats van met -t.
      const beeldDur = p.duur + p.las;
      const afBeeld = `trim=duration=${beeldDur.toFixed(3)},setpts=PTS-STARTPTS`;
      const afGeluid = `atrim=duration=${p.duur.toFixed(3)}`;
      // Bij een gesproken regel blijft het laatste beeld staan in de stilte erna; bij
      // een actiebeeld loopt de beweging door. Zie segmentVideoFilter.
      const beeldFilter = `${segmentVideoFilter(schaal, p, !k.isActie, fps)},${afBeeld}`;
      if (!k.stem) {
        // Alle segmenten moeten dezelfde parameters hebben voordat ze aan elkaar
        // kunnen, dus ook een stil actiebeeld krijgt een (stil) audiospoor.
        await runFfmpeg([
          "-i", k.clip, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
          "-filter_complex", `[0:v]${beeldFilter}[v];[1:a]${afGeluid}[a]`,
          "-map", "[v]", "-map", "[a]", ...ENC_TUSSEN(fps), "-y", seg,
        ]);
      } else {
        await runFfmpeg([
          "-ss", k.start.toFixed(3), "-i", k.clip, "-i", k.stem,
          "-filter_complex", `[0:v]${beeldFilter}[v];[1:a]${segmentAudioFilter(p)},${afGeluid}[a]`,
          "-map", "[v]", "-map", "[a]", ...ENC_TUSSEN(fps), "-y", seg,
        ]);
      }
      // De bronclip is niet meer nodig; /tmp op Vercel is maar ~500 MB.
      await rm(k.clip, { force: true });
      if (k.stem) await rm(k.stem, { force: true });
      return { file: seg, dur: p.duur, beeldDur, scene: k.scene };
    });
    console.log(`[dialogue-export] ${segmenten.length} segmenten klaar ${await stand(begin, werkmap)}`);

    // ---------- 3. Per scène aan elkaar ----------
    //
    // Binnen één scène een korte overvloeier van beeld tot beeld. Harde lassen gaven
    // geflikker sinds elke zin een eigen storyboardbeeld heeft (zie dialoog-montage.ts).
    // Het geluid gaat gewoon achter elkaar: de overvloeier ligt over het extra stuk
    // beeld van de vorige zin (dat doorloopt), dus beeld en stem blijven gelijk.
    // Beeld en geluid per scène als losse bestanden: de laatste stap leest ze zo in, dus
    // er hoeft niets tussendoor samengevoegd (en dubbel op schijf gezet) te worden.
    const groepen: { beeld: string; geluid: string; dur: number }[] = [];
    for (let i = 0; i < segmenten.length; ) {
      const scene = segmenten[i].scene;
      const groep: typeof segmenten = [];
      while (i < segmenten.length && segmenten[i].scene === scene) groep.push(segmenten[i++]);

      if (groep.length === 1) {
        groepen.push({ beeld: groep[0].file, geluid: groep[0].file, dur: groep[0].dur });
        continue;
      }
      // Alle segmenten zijn met dezelfde ENC()-parameters gemaakt. Toch via de
      // concat-FILTER en niet de demuxer: die laatste struikelt over kleine
      // verschillen in tijdbasis.
      const nr = String(groepen.length).padStart(3, "0");
      const alleenBeeld = path.join(werkmap, `g${nr}-beeld.mp4`);
      const alleenGeluid = path.join(werkmap, `g${nr}-geluid.m4a`);
      const invoerGroep = groep.flatMap((g) => ["-i", g.file]);
      const lassen = zachteLassen(groep.map((g) => g.beeldDur));
      // Beeld en geluid in aparte stappen. In één filtergraph met de concat van het
      // geluid sloeg ffmpeg 6 de overvloeiers over: gemeten ging het beeld in 0,04 s van
      // 16% naar 81% nieuw, een harde las. Los vloeide hetzelfde beeld netjes over.
      await runFfmpeg([
        ...invoerGroep, "-filter_complex", lassen.filter,
        "-map", `[${lassen.label}]`, "-an", ...ENC_TUSSEN(fps), "-y", alleenBeeld,
      ]);
      await runFfmpeg([
        ...invoerGroep, "-filter_complex", `${groep.map((_, j) => `[${j}:a]`).join("")}concat=n=${groep.length}:v=0:a=1[a]`,
        "-map", "[a]", "-vn", ...ENC(fps), "-y", alleenGeluid,
      ]);
      await Promise.all(groep.map((g) => rm(g.file, { force: true })));
      groepen.push({ beeld: alleenBeeld, geluid: alleenGeluid, dur: groep.reduce((a, g) => a + g.dur, 0) });
    }

    console.log(`[dialogue-export] ${groepen.length} scènes klaar ${await stand(begin, werkmap)}`);

    // ---------- 4. Scènes in elkaar laten overvloeien ----------
    // Elke overvloeier valt op de stille staart van de ene scène en de stille kop van
    // de volgende; de stemmen raken elkaar dus nooit.
    const samen = path.join(werkmap, "samen.mp4");
    const { offsets, totaal } = overgangOffsets(groepen.map((g) => g.dur));
    // Eerst alle beeldbestanden, dan alle geluidsbestanden: geluid van scène i is invoer N+i.
    const N = groepen.length;
    const invoer = [...groepen.map((g) => g.beeld), ...groepen.map((g) => g.geluid)].flatMap((f) => ["-i", f]);
    const delen: string[] = [];
    let vLabel = "0:v", aLabel = `${N}:a`;
    for (let i = 1; i < N; i++) {
      const vUit = `v${i}`, aUit = `a${i}`;
      delen.push(`[${vLabel}][${i}:v]xfade=transition=fade:duration=${SCENE_OVERGANG}:offset=${offsets[i - 1].toFixed(3)}[${vUit}]`);
      delen.push(`[${aLabel}][${N + i}:a]acrossfade=d=${SCENE_OVERGANG}:c1=tri:c2=tri[${aUit}]`);
      vLabel = vUit; aLabel = aUit;
    }
    delen.push(`[${vLabel}]scale=${W}:${H}:flags=lanczos,setsar=1,${beginEindFade(totaal)}[veind]`);
    await runFfmpeg([
      ...invoer, "-filter_complex", delen.join(";"),
      "-map", "[veind]", "-map", N > 1 ? `[${aLabel}]` : `${N}:a`,
      ...ENC(fps), "-movflags", "+faststart", "-y", samen,
    ]);
    await Promise.all(groepen.flatMap((g) => [g.beeld, g.geluid]).map((f) => rm(f, { force: true })));

    // ---------- 5. Muziekbed met ducking ----------
    // Actiebeelden hebben geen stem. Met een muziekbed dat overal even zacht staat
    // vallen die momenten dood: je ziet iets gebeuren en hoort vrijwel niets.
    //
    // Daarom duckt de muziek zichzelf: sidechaincompress gebruikt het spraakspoor
    // als stuursignaal, dus onder een gesproken zin zakt de muziek weg en op een
    // actiebeeld komt hij vanzelf naar voren. Gemeten op een testmix levert dat
    // ~8,5 dB meer muziek op de stille stukken op, terwijl de dialoogsegmenten
    // exact even luid blijven. Dat gaat automatisch mee met elk draaiboek, zonder
    // dat we per segment tijdstippen hoeven bij te houden. Ook de stille momenten
    // rond een scènewissel krijgen zo muziek, zodat de overgang niet stilvalt.
    let eind = samen;
    if (spec.musicUrl) {
      const bron = path.join(dir, "muziek-bron.mp3");
      const muziek = path.join(dir, "muziek.wav");
      // Het gekozen nummer is 1,5–8,5 minuut lang en de video meestal korter of
      // (bij een lang draaiboek) juist langer. renderMusicBed zet het op exact de
      // videolengte: doorlussen of afkappen, met een uitfade.
      const bedKlaar = (await download(spec.musicUrl, bron))
        ? await renderMusicBed(bron, await probeDuur(samen), muziek).then(() => true).catch(() => false)
        : false;
      if (bedKlaar) {
        // Basisniveau van de muziek als er NIET gepraat wordt. Bewust hoger dan de
        // oude vaste 0,12: dat was afgestemd op "altijd onder spraak".
        const basis = typeof spec.musicVolume === "number" ? spec.musicVolume : 0.45;
        const metMuziek = path.join(dir, "eind.mp4");
        // duration=first houdt de mix op de videolengte; het bed is daar al op
        // gezet, dus er valt niets meer af te kappen.
        await runFfmpeg([
          "-i", samen, "-i", muziek,
          "-filter_complex",
          // De spraak wordt twee keer gebruikt: als stuursignaal én in de mix zelf.
          `[0:a]asplit=2[spraak][stuur];` +
          `[1:a]aresample=44100,volume=${basis.toFixed(3)}[m];` +
          `[m][stuur]sidechaincompress=threshold=0.03:ratio=12:attack=20:release=400[gedempt];` +
          `[spraak][gedempt]amix=inputs=2:duration=first:normalize=0[a]`,
          "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
          "-movflags", "+faststart", "-y", metMuziek,
        ]);
        eind = metMuziek;
      }
    }

    console.log(`[dialogue-export] montage klaar ${await stand(begin, werkmap)}`);

    // ---------- 6. Opslaan ----------
    const bytes = await readFile(eind);
    const pad = `${user.id}/dialogue/dialoog-${Date.now()}.mp4`;
    const { error: upErr } = await supabase.storage.from("scene-assets").upload(pad, bytes, { contentType: "video/mp4", upsert: true });
    if (upErr) throw new Error(`Upload mislukt: ${upErr.message}`);
    const bestandsnaam = `${(spec.title || "dialoog").replace(/\s+/g, "-")}.mp4`;
    const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(pad, { download: bestandsnaam });

    await rm(dir, { recursive: true, force: true });
    dir = null;

    return NextResponse.json({ url: urlData.publicUrl, segments: segmenten.length });
  } catch (err: unknown) {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-export failed:", msg);
    return NextResponse.json({ error: "Video exporteren mislukt", detail: msg }, { status: 500 });
  }
}
