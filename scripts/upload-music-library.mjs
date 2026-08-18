// Zet de gecureerde achtergrondmuziek in de publieke `music`-bucket.
//
// De bronbestanden zijn rechtenvrije YouTube-downloads (verschillende bitrates,
// verschillend hard, en sommige beginnen met seconden digitale stilte). Ze gaan
// hier één keer door ffmpeg:
//   1. stilte aan begin en eind eraf — anders begint de video zonder muziek
//      (gemeten: tot 4 seconden niets bij een deel van de nummers);
//   2. loudnorm zodat elk nummer even hard onder de voice-over zit — anders moet
//      de klant per nummer aan de volumeslider draaien;
//   3. 128 kb/s stereo, want een muziekbed staat toch op 12–20% en dat scheelt de
//      helft aan laadtijd bij het previewen.
//
// Idempotent: upsert, dus opnieuw draaien overschrijft gewoon.
//
// Usage: node scripts/upload-music-library.mjs [map-met-bronbestanden]
//        (default: ~/Downloads)

import { createClient } from "@supabase/supabase-js";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { promisify } from "node:util";

const run = promisify(execFile);

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE env vars in .env.local");

const supabase = createClient(url, key, { auth: { persistSession: false } });

const srcDir = process.argv[2] ?? join(homedir(), "Downloads");

// slug (= naam in de bucket en in lib/music/library.ts) → bronbestand.
// De YouTube-titels zijn zoektermen, geen namen; de slug is wat de klant ziet.
const TRACKS = [
  ["motiverend-corporate",         "Background Royalty Free Music for YouTube Videos - Motivational Upbeat Corporate Positive Business.mp3"],
  ["corporate-uplifting",          "Royalty Free Music - Corporate Uplifting Inspiration  Background Business Upbeat Motivational.mp3"],
  ["inspirerend-corporate-simpel", "Royalty Free Music - Inspirational Corporate Background Instrumental Real Estate Simple for Videos.mp3"],
  ["inspirational",                "Royalty Free Music - Inspirational [Free Download].mp3"],
  ["upbeat-corporate-vlog",        "Royalty Free Music - Upbeat Corporate  Background Positive Business Motivational Stock Podcast VLOG.mp3"],
  ["upbeat-inspiratie-business",   "Royalty Free Music - Upbeat Inspiration  Background Positive Business Instrumental Motivational.mp3"],
  ["uplifting-corporate",          "Royalty Free Music - Uplifting Corporate  Background Positive Upbeat Motivational Happy Real Estate.mp3"],
  ["vrolijk-positief-motiverend",  "Background Music For Videos VLOG YouTube  Upbeat Happy Positive Motivational Joyful [FREE DOWNLOAD].mp3"],
  ["happy-ukelele",                "Background Royalty Free Music for YouTube Videos - Happy Ukulele  Background Positive Joyful Upbeat.mp3"],
  ["episch-inspirerend",           "Background Music For Videos VLOG YouTube -  Epic Cinematic Inspiring Motivational [FREE DOWNLOAD].mp3"],
  ["orkest-motivatie",             "Background Royalty Free Music for Video - Epic Cinematic Inspiring  Motivation Orchestra Background.mp3"],
  ["epische-motivatie",            "Background Royalty Free Music for Videos - Epic Motivation  Cinematic Dramatic Emotional Orchestral.mp3"],
  ["episch-avontuur",              "Background Royalty Free Music for Videos Epic Inspirational Cinematic Dramatic Emotional Adventure.mp3"],
  ["epic-adventures-orkest",       "Royalty Free Background Music for YouTube Videos - Epic Adventures  Cinematic Soundtrack Orchestral.mp3"],
  ["episch-dramatisch",            "Royalty Free Music - Epic Inspiring Dramatic Cinematic Emotional Background  FREE DOWNLOAD.mp3"],
  ["filmisch-orkest",              "[FREE DOWNLOAD] Background Music For Videos VLOG YouTube - Epic Cinematic Orchestral Inspiring Film.mp3"],
  ["drama-romantisch",             "Background Instrumental Royalty Free Music for YouTube Videos - Drama Sad Emotional Romantic Triste.mp3"],
  ["piano-drama",                  "Background Royalty Free Music - Sad Inspiring  Drama Emotional Instrumental Piano Romantic Triste.mp3"],
  ["hybrid-action-trailer",        "Background Royalty Free Music - Hybrid Action Trailer  Epic Cinematic Dramatic Powerful Intense.mp3"],
  ["epic-action-trailer",          "Background Royalty Free Music for Videos - Epic Action Trailer  Hybrid Cinematic Intense Powerful.mp3"],
  ["intense-trailer-intro",        "Intense Background Royalty Free Music for Videos - Trailer Action Dramatic Cinematic Intro.mp3"],
  ["dramatische-trailer",          "Royalty Free Music - Action Dramatic Trailer  Hybrid Cinematic Epic Powerful Intense Background.mp3"],
  ["dramatic-hybrid-trailer",      "Royalty Free Music - Dramatic Trailer  Epic Cinematic Action Hybrid Emotional Exciting Intense.mp3"],
  ["extreme-metal-actie",          "[FREE DOWNLOAD] Background Music For Videos VLOG YouTube - Energetic Action Powerful Extreme Metal.mp3"],
  ["dubstep-sport",                "Background Instrumental Music for YouTube Videos  Dubstep Powerful Extreme Sport  FREE DOWNLOAD.mp3"],
  ["house-party-commercial",       "Background Instrumental Royalty Free Music for YouTube Video  Fashion House EDM Party Commercial Ads.mp3"],
  ["electro-lifestyle",            "Background Instrumental Royalty Free Music for YouTube Video  Fashion House Electro Lifestyle Ads.mp3"],
];

// ffmpeg meldt de duur alleen op stderr; -i zonder output geeft exit-code 1.
async function duration(file) {
  const out = await run(ffmpegPath, ["-i", file], { encoding: "utf8" }).catch((e) => e);
  const m = String(out.stderr ?? "").match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}

// De bucket bestaat mogelijk nog niet (zie supabase/migrations/037_music_bucket.sql).
const { data: buckets } = await supabase.storage.listBuckets();
if (!buckets?.some((b) => b.id === "music")) {
  const { error } = await supabase.storage.createBucket("music", { public: true });
  if (error) throw new Error(`Bucket 'music' aanmaken mislukt: ${error.message}`);
  console.log("Bucket 'music' aangemaakt (publiek).");
}

const work = mkdtempSync(join(tmpdir(), "music-"));
let ok = 0;
try {
  for (const [slug, filename] of TRACKS) {
    const src = join(srcDir, filename);
    if (!existsSync(src)) {
      console.log(`OVERGESLAGEN  ${slug} — bronbestand niet gevonden: ${filename}`);
      continue;
    }
    const out = join(work, `${slug}.mp3`);
    await run(ffmpegPath, [
      "-i", src,
      "-vn",                       // albumhoes eruit; die hoeft niet mee de bucket in
      "-map_metadata", "-1",
      // Stilte vooraan eraf, dan omgekeerd hetzelfde voor de staart, dan pas
      // loudnorm (die moet over het echte materiaal meten, niet over de stilte).
      "-af",
      "silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB:detection=peak," +
      "areverse,silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB:detection=peak,areverse," +
      "loudnorm=I=-19:TP=-1.5:LRA=11",
      "-ac", "2", "-ar", "44100", "-b:a", "128k",
      "-y", out,
    ]);

    const bytes = readFileSync(out);
    const { error } = await supabase.storage
      .from("music")
      .upload(`${slug}.mp3`, bytes, { contentType: "audio/mpeg", upsert: true, cacheControl: "31536000" });
    if (error) {
      console.log(`FOUT          ${slug} — ${error.message}`);
      continue;
    }
    ok++;
    const dur = Math.round(await duration(out));
    console.log(
      `${slug.padEnd(30)} ${String(dur).padStart(4)}s  ` +
      `${(statSync(src).size / 1e6).toFixed(1)}MB → ${(bytes.length / 1e6).toFixed(1)}MB`
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(`\n${ok}/${TRACKS.length} nummers in de bucket.`);
console.log("Controleer dat de duur hierboven overeenkomt met `duration` in lib/music/library.ts.");
