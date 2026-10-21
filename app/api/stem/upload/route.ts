import { NextRequest, NextResponse } from "next/server";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { uploadNaarOpslag } from "@/lib/creaties/wachtrij";

export const runtime = "nodejs";
export const maxDuration = 60;

const run = promisify(execFile);
const MAX = 20 * 1024 * 1024;

// Een opname (ingesproken in de browser) of een geluidsbestand in de bibliotheek zetten,
// om je stem mee te trainen of een foto mee te laten praten. Alles wordt mp3: de opname
// uit de browser is webm, en dat nemen het kloonmodel en de lipsync niet aan.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const bestand = form?.get("bestand");
  if (!(bestand instanceof File)) return NextResponse.json({ error: "Geen bestand ontvangen" }, { status: 400 });
  if (!bestand.type.startsWith("audio/") && !bestand.type.startsWith("video/webm")) {
    return NextResponse.json({ error: "Alleen geluid: mp3, wav, m4a of een opname." }, { status: 400 });
  }
  if (bestand.size > MAX) return NextResponse.json({ error: "Maximaal 20 MB." }, { status: 400 });

  const map = await mkdtemp(path.join(tmpdir(), "stem-"));
  try {
    const bron = path.join(map, "in");
    const uit = path.join(map, "uit.mp3");
    await writeFile(bron, Buffer.from(await bestand.arrayBuffer()));
    await run(ffmpegPath as unknown as string, ["-hide_banner", "-loglevel", "error", "-i", bron, "-vn", "-ac", "1", "-ar", "44100", "-b:a", "160k", "-y", uit]);
    const { stderr } = await run(ffmpegPath as unknown as string, ["-hide_banner", "-i", uit]).catch((e: { stderr?: string }) => ({ stderr: e.stderr ?? "" }));
    const m = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
    const sec = m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0;
    const url = await uploadNaarOpslag(user.id, await readFile(uit), "mp3", "audio/mpeg");
    const { data, error } = await createServiceClient()
      .from("creaties")
      .insert({
        user_id: user.id, soort: "audio", status: "klaar", maker: "upload",
        prompt: (form?.get("naam")?.toString() || bestand.name || "Opname").slice(0, 120),
        invoer: { sec: Math.round(sec * 10) / 10 }, url, credits: 0, klaar_op: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ creatie: data, sec });
  } catch (e) {
    console.error("[stem/upload]", e);
    return NextResponse.json({ error: "Dit geluid kon niet worden gelezen. Probeer een mp3 of wav." }, { status: 400 });
  } finally {
    await rm(map, { recursive: true, force: true }).catch(() => {});
  }
}
