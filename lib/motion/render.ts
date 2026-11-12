// Van code naar video: de pagina openen in een onzichtbare browser, per beeld het tijdstip
// zetten en een foto maken, en die foto's met stem en muziek aan elkaar zetten.
//
// Twee gebruikers:
//   proef()      — een handvol beelden + de foutenlijst, voor de controleronde van Claude
//   maakStil()   — één hoofdstuk als video zonder geluid
//   monteer()    — de hoofdstukken achter elkaar, met stem en muziek
//   maakVideo()  — beide in één keer, voor een video van één hoofdstuk

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { launchBrowser, type Browser } from "@/lib/browser";
import { paginaHtml, type PaginaInvoer } from "./pagina";

const FFMPEG = (ffmpegPath as unknown as string) || "ffmpeg";
export const FPS = 25;
/** Zoveel tabbladen tekenen tegelijk; meer levert op een kleine server niets meer op. */
const TABS = process.env.VERCEL ? 2 : 4;

type Pagina = Awaited<ReturnType<Browser["newPage"]>>;

interface Stand {
  einde: number;
  scenes: [string, number][];
  fouten: string[];
}

async function open(browser: Browser, p: PaginaInvoer): Promise<{ pagina: Pagina; stand: Stand }> {
  const pagina = await browser.newPage({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: 1 });
  // De code komt van een taalmodel en de teksten van een klant: de pagina mag niets
  // ophalen of versturen, behalve het lettertype.
  await pagina.route("**/*", (route) => {
    const url = route.request().url();
    return /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url) || url.startsWith("data:") || url === "about:blank" ? route.continue() : route.abort();
  });
  await pagina.setContent(await paginaHtml(p), { waitUntil: "domcontentloaded", timeout: 30000 });
  await pagina.waitForFunction("window.READY === true", null, { timeout: 30000 });
  const stand = (await pagina.evaluate("({ einde: window.END, scenes: window.SCENES, fouten: window.FOUTEN })")) as Stand;
  return { pagina, stand };
}

/**
 * Is dit een fout waardoor de video niet klopt (kapotte code), of alleen een schoonheidsfout
 * (tekst net over de rand, een woord dat niet in de stem voorkomt)? Met de eerste soort
 * maken we geen video.
 */
export function ernstig(fout: string): boolean {
  return /geen geldige JavaScript|Fout in de code|Fout in teken|opbouwen|window\.VIDEO|bouwstenen|bestaat niet/.test(fout);
}

/** Een fout in de schrijfwijze vinden we al zonder browser; dat scheelt een hele ronde. */
export function syntaxFout(code: string): string | null {
  try {
    // Alleen ontleden, niet uitvoeren.
    new Function(code);
    return null;
  } catch (e) {
    return `De code is geen geldige JavaScript: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export interface Proef {
  /** Wat er misging: fouten in de code en teksten die buiten beeld vallen. */
  fouten: string[];
  /** Verkleinde proefbeelden, met het tijdstip en de scene erbij. */
  beelden: { t: number; scene: string; jpg: Buffer }[];
  einde: number;
  scenes: [string, number][];
}

/** De tijdstippen waarop we proefbeelden nemen: per scene halverwege en vlak voor het eind. */
export function proefTijden(scenes: [string, number][], einde: number): { t: number; scene: string }[] {
  const uit: { t: number; scene: string }[] = [];
  scenes.forEach(([id, start], i) => {
    const eind = i + 1 < scenes.length ? scenes[i + 1][1] : einde - 0.3;
    const duur = Math.max(0.2, eind - start);
    // 0,3 s is de voorsprong van het beeld op de stem (D in de kern).
    const naar = (f: number) => +(start + 0.3 + duur * f).toFixed(2);
    // Het eind van een scene is het volste beeld: daar botsen teksten. Halverwege laat
    // zien of de opbouw klopt. Een heel korte scene krijgt één beeld.
    if (duur > 3.5 && id !== "eind") uit.push({ t: naar(0.5), scene: id });
    uit.push({ t: naar(id === "eind" ? 0.97 : 0.9), scene: id });
  });
  return uit;
}

export async function proef(p: PaginaInvoer): Promise<Proef> {
  const fout = syntaxFout(p.code);
  if (fout) return { fouten: [fout], beelden: [], einde: 0, scenes: [] };
  const browser = await launchBrowser();
  try {
    const { pagina, stand } = await open(browser, p);
    const fouten = new Set(stand.fouten);
    const beelden: Proef["beelden"] = [];
    // Is het opbouwen zelf al misgegaan, dan zeggen de beelden niets.
    if (!stand.scenes?.length || stand.fouten.some((f) => /opbouwen|window\.VIDEO|bouwstenen|Fout in de code/.test(f))) {
      return { fouten: [...fouten], beelden, einde: stand.einde ?? 0, scenes: stand.scenes ?? [] };
    }
    const breed = p.w >= p.h ? 960 : 540;
    for (const { t, scene } of proefTijden(stand.scenes, stand.einde)) {
      const gemeld = (await pagina.evaluate(`(window.render(${t}), window.controle().concat(window.FOUTEN))`)) as string[];
      gemeld.forEach((g) => fouten.add(/buiten beeld/.test(g) ? `Scene ${scene}, t=${t} s: ${g}` : g));
      const png = await pagina.screenshot({ type: "jpeg", quality: 90 });
      beelden.push({ t, scene, jpg: await sharp(png).resize({ width: breed }).jpeg({ quality: 72 }).toBuffer() });
    }
    // De hele tijdlijn één keer doorlopen (4 beelden per seconde, zonder foto's) vangt
    // fouten die alleen op een bepaald moment optreden.
    const rest = (await pagina.evaluate(
      `(() => { for (let t = 0; t < window.END; t += 0.25) window.render(t); return window.FOUTEN; })()`,
    )) as string[];
    rest.forEach((g) => fouten.add(g));
    return { fouten: [...fouten].slice(0, 30), beelden, einde: stand.einde, scenes: stand.scenes };
  } finally {
    await browser.close().catch(() => {});
  }
}

function ffmpeg(args: string[], invoer?: (stdin: NodeJS.WritableStream) => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: [invoer ? "pipe" : "ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr!.on("data", (d) => { err = (err + d.toString()).slice(-2000); });
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg faalde: " + err.slice(-500)))));
    if (invoer) {
      // Stopt ffmpeg voortijdig, dan breekt de pijp; de echte reden staat in stderr.
      proc.stdin!.on("error", () => {});
      invoer(proc.stdin!).then(() => proc.stdin!.end(), (e) => { proc.kill("SIGKILL"); reject(e); });
    }
  });
}

export interface StilUitkomst {
  mp4: Buffer;
  beelden: number;
  renderMs: number;
}

/**
 * Eén hoofdstuk beeld voor beeld naar een video zonder geluid. `beelden` legt het aantal
 * beelden vast (een hoofdstuk moet op het beeld af zo lang zijn als zijn stuk van de stem);
 * zonder duurt het zo lang als de pagina zelf aangeeft.
 */
export async function maakStil(p: PaginaInvoer, o: { beelden?: number; deadline?: number; compact?: boolean } = {}): Promise<StilUitkomst> {
  const start = Date.now();
  const dir = await mkdtemp(path.join(tmpdir(), "motion-"));
  const browser = await launchBrowser();
  try {
    const eerste = await open(browser, p);
    const kapot = eerste.stand.fouten.find(ernstig);
    if (kapot || !eerste.stand.scenes?.length) throw new Error(`De animatie bevat nog fouten: ${kapot ?? "geen scenes"}`);
    const totaal = o.beelden ?? Math.max(1, Math.round(eerste.stand.einde * FPS));
    const tabs = [eerste.pagina, ...(await Promise.all([...Array(TABS - 1)].map(async () => (await open(browser, p)).pagina)))];

    // De beelden gaan rechtstreeks de video in, niet eerst naar schijf: 1.500 beelden van
    // 1080p zijn honderden MB en de server heeft maar ~512 MB tijdelijke ruimte.
    const stil = path.join(dir, "stil.mp4");
    await ffmpeg(
      // Alle hoofdstukken met dezelfde instellingen, anders zijn ze niet zonder opnieuw
      // coderen aan elkaar te zetten. Een lange video iets compacter: tien minuten op
      // de kwaliteit van een korte video wordt een bestand van ruim 150 MB.
      ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", o.compact ? "22" : "18", "-pix_fmt", "yuv420p", "-video_track_timescale", "12800", "-movflags", "+faststart", stil],
      async (stdin) => {
        for (let f = 0; f < totaal; f += tabs.length) {
          if (o.deadline && Date.now() > o.deadline) throw new Error("De video is te lang om binnen de tijd te maken. Kies een kortere video.");
          // Elk tabblad tekent zijn eigen beeld; daarna in de goede volgorde de pijp in.
          const groep = await Promise.all(
            tabs.slice(0, Math.min(tabs.length, totaal - f)).map(async (tab, k) => {
              await tab.evaluate(`window.render(${(f + k) / FPS})`);
              return tab.screenshot({ type: "jpeg", quality: 92 });
            }),
          );
          for (const beeld of groep) {
            if (!stdin.write(beeld)) await new Promise<void>((ok) => stdin.once("drain", () => ok()));
          }
        }
      },
    );
    const naFouten = (await eerste.pagina.evaluate("window.FOUTEN")) as string[];
    if (naFouten.length) console.error("[motion] fouten tijdens het tekenen:", naFouten.slice(0, 3));
    return { mp4: await readFile(stil), beelden: totaal, renderMs: Date.now() - start };
  } finally {
    await browser.close().catch(() => {});
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Zet de hoofdstukken (video zonder geluid) achter elkaar en legt de stem en de muziek eronder. */
export async function monteer(delen: Buffer[], beelden: number, stem: Buffer, muziekUrl?: string): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "motion-"));
  try {
    let stil = path.join(dir, "d0.mp4");
    await Promise.all(delen.map((d, i) => writeFile(path.join(dir, `d${i}.mp4`), d)));
    if (delen.length > 1) {
      // Zonder opnieuw coderen: de hoofdstukken zijn met dezelfde instellingen gemaakt.
      await writeFile(path.join(dir, "lijst.txt"), delen.map((_, i) => `file 'd${i}.mp4'`).join("\n"));
      stil = path.join(dir, "stil.mp4");
      await ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", path.join(dir, "lijst.txt"), "-c", "copy", stil]);
    }
    // Stem 0,3 s na het eerste beeld (D in de kern). Muziek zacht eronder, met een
    // uitloop; "normalize=0" omdat amix anders de stem halveert zodra de muziek meedoet.
    const stemPad = path.join(dir, "stem.mp3");
    await writeFile(stemPad, stem);
    const uit = path.join(dir, "uit.mp4");
    const duur = (beelden / FPS).toFixed(2);
    if (muziekUrl) {
      await ffmpeg([
        "-y", "-i", stil, "-i", stemPad, "-stream_loop", "-1", "-i", muziekUrl,
        "-filter_complex",
        `[1:a]adelay=300:all=1,volume=1.0[s];[2:a]volume=0.13,afade=t=in:d=0.6,afade=t=out:st=${(beelden / FPS - 1.6).toFixed(2)}:d=1.6[m];[s][m]amix=inputs=2:normalize=0:duration=longest[a]`,
        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", duur, "-movflags", "+faststart", uit,
      ]);
    } else {
      await ffmpeg([
        "-y", "-i", stil, "-i", stemPad, "-filter_complex", "[1:a]adelay=300:all=1,apad[a]",
        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", duur, "-movflags", "+faststart", uit,
      ]);
    }
    return await readFile(uit);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Meerdere opnames van de stem (een lange video wordt in blokken ingesproken) tot één mp3. */
export async function voegStemSamen(blokken: Buffer[]): Promise<Buffer> {
  if (blokken.length === 1) return blokken[0];
  const dir = await mkdtemp(path.join(tmpdir(), "motion-"));
  try {
    await Promise.all(blokken.map((b, i) => writeFile(path.join(dir, `b${i}.mp3`), b)));
    const uit = path.join(dir, "stem.mp3");
    // Opnieuw coderen in plaats van plakken: geplakte mp3's geven een tik op de naad en
    // een totale duur die niet klopt, en op die duur liggen straks alle woordtijden.
    await ffmpeg([
      "-y", ...blokken.flatMap((_, i) => ["-i", path.join(dir, `b${i}.mp3`)]),
      "-filter_complex", `${blokken.map((_, i) => `[${i}:a]`).join("")}concat=n=${blokken.length}:v=0:a=1[a]`,
      "-map", "[a]", "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", uit,
    ]);
    return await readFile(uit);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export interface VideoInvoer extends PaginaInvoer {
  /** De voice-over (mp3). */
  stem: Buffer;
  /** Adres van de muziek, of leeg voor geen muziek. */
  muziekUrl?: string;
  /** Tot wanneer het af moet zijn (ms sinds 1970); daarna stoppen we met een nette melding. */
  deadline?: number;
}

/** Een video van één hoofdstuk, van code tot mp4. */
export async function maakVideo(v: VideoInvoer): Promise<{ mp4: Buffer; seconden: number; renderMs: number }> {
  const start = Date.now();
  const stil = await maakStil(v, { deadline: v.deadline });
  const mp4 = await monteer([stil.mp4], stil.beelden, v.stem, v.muziekUrl);
  return { mp4, seconden: stil.beelden / FPS, renderMs: Date.now() - start };
}
