import { describe, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { renderTimeline } from "@/lib/editor/render-server";
import {
  createEmptyTimeline,
  TIMELINE_VERSION,
  type AudioClip,
  type TextClip,
  type TimelineDoc,
  type VideoClip,
} from "@/lib/editor/timeline";
import { DEFAULT_TEXT_STYLE } from "@/lib/editor/timeline";

// Rendermeting voor fase 0 van de AI-editor. Bewust GEEN onderdeel van
// `npm test` (die kijkt alleen naar lib/**/*.test.ts) — dit duurt minuten.
//
// Draaien met een lopende dev-server op :3000:
//   npx vitest run --config vitest.bench.config.mts
//
// De vraag die dit beantwoordt: hoe lang duurt één render per seconde video?
// De renderlus maakt één screenshot per frame (30/sec), en de exportroute
// draait in een Vercel-functie met een harde limiet van 300s. Daaruit volgt of
// renders naar een aparte worker moeten en of v1 een lengteplafond nodig heeft.

const APP_URL = process.env.BENCH_APP_URL ?? "http://localhost:3000";

// Echte assets uit onze eigen opslag: een gerenderde video en een muzieknummer.
// Met alleen kleurvlakken zou de meting te rooskleurig zijn — het decoderen en
// seeken van video is juist het dure deel.
const VIDEO_URL =
  "https://suuskaaobsbttahqcoct.supabase.co/storage/v1/object/public/scene-assets/e5f6f9ae-1bd7-424f-adc0-037b6fe9600d/story/story-video-1787049559854.mp4";
const MUSIC_URL =
  "https://suuskaaobsbttahqcoct.supabase.co/storage/v1/object/public/music/motiverend-corporate.mp3";

const CLIP_SEC = 5; // realistische scènelengte
const LENGTHS = (process.env.BENCH_LENGTHS ?? "15,30,60")
  .split(",")
  .map((n) => Number(n.trim()))
  .filter((n) => n > 0);

/** Timeline van `seconds` seconden: scènes van 5s, muziekbed en een titel. */
function buildDoc(seconds: number): TimelineDoc {
  const doc = createEmptyTimeline("16:9");
  doc.version = TIMELINE_VERSION;
  const video = doc.tracks.find((t) => t.kind === "video")!;
  const text = doc.tracks.find((t) => t.kind === "text")!;
  const audio = doc.tracks.find((t) => t.kind === "audio")!;

  for (let start = 0; start < seconds; start += CLIP_SEC) {
    const duration = Math.min(CLIP_SEC, seconds - start);
    video.clips.push({
      id: `clp_${start}`,
      type: "video",
      src: VIDEO_URL,
      start,
      duration,
      // Elke scène een ander stuk bron, zodat de browser echt moet seeken.
      trimIn: (start / CLIP_SEC) % 4,
      volume: 0,
    } satisfies VideoClip);
  }

  text.clips.push({
    id: "txt_titel",
    type: "text",
    text: "Benchmark",
    style: DEFAULT_TEXT_STYLE,
    start: 0,
    duration: Math.min(3, seconds),
  } satisfies TextClip);

  audio.clips.push({
    id: "aud_muziek",
    type: "audio",
    src: MUSIC_URL,
    start: 0,
    duration: seconds,
    volume: 0.18,
    loop: true,
  } satisfies AudioClip);

  return doc;
}

describe("editor-render benchmark", () => {
  it(`meet rendertijd voor ${LENGTHS.join("s / ")}s`, async () => {
    const rows: string[] = [];
    for (const seconds of LENGTHS) {
      const doc = buildDoc(seconds);
      const frames = seconds * doc.fps;
      const t0 = Date.now();
      const buf = await renderTimeline(doc, APP_URL);
      const elapsed = (Date.now() - t0) / 1000;

      const perSec = elapsed / seconds;
      const row =
        `${String(seconds).padStart(4)}s video | ${String(frames).padStart(5)} frames | ` +
        `${elapsed.toFixed(1).padStart(7)}s render | ${perSec.toFixed(2)}x realtime | ` +
        `${(buf.length / 1e6).toFixed(1)} MB | ${elapsed > 300 ? "OVER Vercel-limiet" : "binnen 300s"}`;
      rows.push(row);
      console.log(row);
    }
    await writeFile(
      "/tmp/editor-render-bench.txt",
      `${new Date().toISOString()}\n${rows.join("\n")}\n`,
      "utf8"
    );
  });
});
