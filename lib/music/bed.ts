import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// Fades op het muziekbed. Kort genoeg om niet op te vallen bij een korte video,
// lang genoeg om het afkappen van een nummer halverwege niet te laten klinken
// als een kabel die eruit wordt getrokken.
const FADE_IN = 1.2;
const FADE_OUT = 2.5;

/**
 * Zet een nummer uit de bibliotheek op exact de lengte van de video.
 *
 * De bibliotheeknummers zijn 1,5–8,5 minuut; video's in de tools meestal 30–120
 * seconden. Zonder deze stap loopt het bed óf door tot het beeld al weg is (wat
 * ffmpeg dan hard afkapt, midden in een maat), óf valt het halverwege stil bij
 * een video die langer is dan het nummer.
 *
 * Korter nummer wordt doorgelust (-stream_loop), langer nummer afgekapt; in
 * beide gevallen met een in- en uitfade zodat het einde netjes wegsterft.
 * Levert een wav op: de mix erna is toch één keer opnieuw coderen, en zo hoeft
 * ffmpeg geen mp3 te decoderen die al gedecodeerd is geweest.
 */
export async function renderMusicBed(srcPath: string, seconds: number, outPath: string): Promise<string> {
  const dur = Math.max(1, seconds);
  const fadeIn = Math.min(FADE_IN, dur / 4);
  const fadeOut = Math.min(FADE_OUT, dur / 4);
  const filters = [
    "aresample=44100",
    `afade=t=in:st=0:d=${fadeIn.toFixed(2)}`,
    `afade=t=out:st=${Math.max(0, dur - fadeOut).toFixed(2)}:d=${fadeOut.toFixed(2)}`,
  ].join(",");

  await run(ffmpegPath as unknown as string, [
    // Altijd lussen: bij een nummer dat langer is dan de video wordt de tweede
    // ronde toch nooit bereikt, dus dit is veilig voor beide gevallen.
    "-stream_loop", "-1",
    "-i", srcPath,
    "-t", dur.toFixed(3),
    "-af", filters,
    "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le",
    "-y", outPath,
  ], { maxBuffer: 1024 * 1024 * 16 });

  return outPath;
}
