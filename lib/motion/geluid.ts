// Een geüpload muziekbestand (mp3, wav, m4a) omzetten naar een schone mp3 (Muziek 2.0). Los
// van render.ts, zodat de uploadroute niet de hele browser-render meesleept.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const FFMPEG = (ffmpegPath as unknown as string) || "ffmpeg";

/** Gooit als het geen geluid is; zo weten we dat er echt muziek op onze opslag komt. */
export async function naarMp3(bron: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "muziek-"));
  try {
    const inPad = path.join(dir, "in"), uit = path.join(dir, "uit.mp3");
    await writeFile(inPad, bron);
    await new Promise<void>((ok, mis) => {
      const p = spawn(FFMPEG, ["-y", "-i", inPad, "-vn", "-t", "900", "-ac", "2", "-ar", "44100", "-b:a", "192k", uit]);
      let err = "";
      p.stderr.on("data", (d) => { err += d; });
      p.on("error", mis);
      p.on("close", (code) => (code === 0 ? ok() : mis(new Error("ffmpeg faalde: " + err.slice(-300)))));
    });
    return await readFile(uit);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
