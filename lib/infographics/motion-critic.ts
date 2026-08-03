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
  reason: string;
  betterSteer: string | null; // bijsturing voor een nieuwe poging (of null)
}

// Laat het kritische oog de beweging beoordelen tegen de voice-over + context.
export async function critiqueMotion(opts: {
  frames: string[];
  voiceover?: string | null;
  illustration?: string | null;
  title?: string | null;
}): Promise<MotionVerdict> {
  if (opts.frames.length === 0) return { ok: true, reason: "geen frames om te beoordelen", betterSteer: null };

  const imageParts = opts.frames.map((b64) => ({
    type: "image_url" as const,
    image_url: { url: `data:image/jpeg;base64,${b64}`, detail: "low" as const },
  }));
  const context = [
    opts.title ? `Verhaal: ${opts.title}` : "",
    opts.voiceover ? `Voice-over van deze scène: "${opts.voiceover}"` : "",
    opts.illustration ? `Bedoeld beeld: ${opts.illustration}` : "",
  ].filter(Boolean).join("\n");

  const instruction = `Dit zijn opeenvolgende frames (begin → eind) uit een korte geanimeerde clip van ÉÉN scène.
${context}

Beoordeel KRITISCH of de BEWEGING klopt. Keur AF (ok=false) als je één van deze ziet:
- personen of objecten die (deels) UIT BEELD lopen/bewegen, naar de rand schuiven of het kader verlaten — dit mag NOOIT;
- vervormde/morphende lichamen, gezichten of objecten; ledematen die verdwijnen, verdubbelen of onnatuurlijk verspringen;
- figuren die wegglijden of onnatuurlijk van houding/positie wisselen;
- beweging die NIET past bij de voice-over of de context van het verhaal.
Subtiele, natuurlijke in-place beweging die bij de tekst past én waarbij iedereen volledig in beeld blijft = GOEDGEKEURD (ok=true).

Antwoord met JSON: {"ok": boolean, "reason": "<korte reden in het Nederlands>", "betterSteer": "<concrete NL-bijsturing voor een nieuwe, voorzichtigere poging, of null als ok=true>"}.
Voorbeeld betterSteer bij afkeuring: "Alleen heel subtiele in-place beweging; iedereen blijft volledig in beeld en op zijn plek, niemand loopt weg, niets vervormt of verspringt".`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 300,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [...imageParts, { type: "text", text: instruction }] }],
    });
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { ok?: boolean; reason?: string; betterSteer?: string | null };
    return { ok: parsed.ok !== false, reason: String(parsed.reason ?? ""), betterSteer: parsed.betterSteer ?? null };
  } catch (e) {
    // Faalt de beoordeling, dan niet blokkeren: keur goed.
    console.error("[motion-critic] beoordeling mislukt:", e instanceof Error ? e.message : String(e));
    return { ok: true, reason: "beoordeling niet gelukt", betterSteer: null };
  }
}
