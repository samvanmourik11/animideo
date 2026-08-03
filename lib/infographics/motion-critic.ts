// Automatische regie-controle voor geanimeerde scènes ("kritisch oog").
// Pakt frames uit een clip en laat een vision-model beoordelen of de BEWEGING
// klopt: geen vervorming/morphing en passend bij de voice-over + verhaalcontext.
// Wordt door scene-motion gebruikt om rare animaties automatisch te hergenereren.

import { spawn } from "node:child_process";
import { writeFile, rm, readFile, readdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { openai } from "@/lib/openai";

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath as unknown as string, args);
    p.on("close", () => resolve());
    p.on("error", () => resolve());
  });
}

// Haalt tot `max` gelijkmatig gespreide frames (base64-JPEG) uit een videoclip.
export async function extractFrames(videoUrl: string, max = 4): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), "motion-"));
  try {
    const inFile = join(dir, "in.mp4");
    const buf = Buffer.from(await (await fetch(videoUrl)).arrayBuffer());
    await writeFile(inFile, buf);
    // ~1 frame per seconde, verkleind zodat de vision-payload klein blijft.
    await runFfmpeg(["-hide_banner", "-loglevel", "error", "-i", inFile, "-vf", "fps=1,scale=400:-1", "-q:v", "5", join(dir, "f_%03d.jpg")]);
    const files = (await readdir(dir)).filter((f) => f.startsWith("f_") && f.endsWith(".jpg")).sort();
    if (files.length === 0) return [];
    const picked: string[] = [];
    const step = Math.max(1, Math.floor(files.length / max));
    for (let i = 0; i < files.length && picked.length < max; i += step) picked.push(files[i]);
    // Zorg dat het laatste frame erbij zit (eind van de beweging).
    if (picked[picked.length - 1] !== files[files.length - 1] && picked.length < max) picked.push(files[files.length - 1]);
    return await Promise.all(picked.map(async (f) => (await readFile(join(dir, f))).toString("base64")));
  } catch {
    return [];
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export interface MotionVerdict {
  ok: boolean;
  score: number;             // 0-10 kwaliteitsscore, om de beste poging te kiezen
  reason: string;
  betterSteer: string | null; // bijsturing voor een nieuwe poging (of null)
}

// Laat het kritische oog de beweging beoordelen tegen de voice-over + context.
export async function critiqueMotion(opts: {
  frames: string[];
  voiceover?: string | null;
  illustration?: string | null;
  title?: string | null;
  plan?: string | null; // vooraf bepaalde beweging waartegen we toetsen
}): Promise<MotionVerdict> {
  if (opts.frames.length === 0) return { ok: true, score: 10, reason: "geen frames om te beoordelen", betterSteer: null };

  const imageParts = opts.frames.map((b64) => ({
    type: "image_url" as const,
    image_url: { url: `data:image/jpeg;base64,${b64}`, detail: "low" as const },
  }));
  const context = [
    opts.title ? `Verhaal: ${opts.title}` : "",
    opts.voiceover ? `Voice-over van deze scène: "${opts.voiceover}"` : "",
    opts.illustration ? `Bedoeld beeld: ${opts.illustration}` : "",
    opts.plan ? `De beweging was VOORAF EXACT bepaald als: "${opts.plan}"` : "",
  ].filter(Boolean).join("\n");

  const instruction = `Dit zijn opeenvolgende frames (begin → eind) uit een korte geanimeerde clip van ÉÉN scène.
${context}

Beoordeel STRENG. Keur AF (ok=false) bij één van deze:
- glitches/AI-fouten: vervormde/morphende lichamen, gezichten of objecten; extra, verdwijnende of verdubbelde ledematen; onnatuurlijk verspringen;
- NIEUWE elementen die niet in het eerste frame staan (planten, objecten, tekst, extra personen);
- personen of objecten die (deels) UIT BEELD bewegen of naar de rand schuiven;
${opts.plan
  ? `- ELKE afwijking van de vooraf bepaalde beweging: iets beweegt dat stil had moeten blijven, of de beweging is groter/anders/heftiger dan bepaald.`
  : `- overdreven of onnatuurlijke beweging die niet bij de scène past.`}

Keur alleen GOED (ok=true) als de clip ${opts.plan ? "PRECIES de vooraf bepaalde beweging toont" : "een subtiele, kloppende beweging toont"}, volledig glitch-vrij is, en al het andere identiek en stil blijft. Bij twijfel: AFKEUREN.

Geef ook een kwaliteits-SCORE van 0 tot 10 (10 = precies de bepaalde beweging, subtiel en volledig glitch-vrij; 0 = ernstige glitches/vervorming of duidelijk fout). Zo kan de beste van meerdere pogingen gekozen worden.

Antwoord met JSON: {"ok": boolean, "score": <0-10>, "reason": "<korte reden in het Nederlands>", "betterSteer": "<kortere, nóg voorzichtiger NL-bijsturing die dichter bij de bepaalde beweging blijft, of null als ok=true>"}.`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 300,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [...imageParts, { type: "text", text: instruction }] }],
    });
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { ok?: boolean; score?: number; reason?: string; betterSteer?: string | null };
    const ok = parsed.ok !== false;
    const score = typeof parsed.score === "number" ? Math.max(0, Math.min(10, parsed.score)) : (ok ? 8 : 3);
    return { ok, score, reason: String(parsed.reason ?? ""), betterSteer: parsed.betterSteer ?? null };
  } catch (e) {
    // Faalt de beoordeling, dan niet blokkeren: bruikbaar houden (hoge score).
    console.error("[motion-critic] beoordeling mislukt:", e instanceof Error ? e.message : String(e));
    return { ok: true, score: 10, reason: "beoordeling niet gelukt", betterSteer: null };
  }
}
