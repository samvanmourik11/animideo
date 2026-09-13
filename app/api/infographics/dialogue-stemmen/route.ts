// ALLE STEMMEN VOORAF, PER STEM IN ÉÉN OPNAME.
//
// Elke zin werd los ingesproken, bij het maken van zijn eigen clip. ElevenLabs v3
// kiest bij elke aanroep net een andere klemtoon, toonhoogte en vaart, dus klonk oma
// van zin tot zin als een iets andere oma. Hier spreekt elke stem al zijn zinnen in
// één keer in, in verhaalvolgorde, en knippen we de opname daarna in zinnen (zie
// stemknippen.ts). De clips krijgen die stukken mee in plaats van zelf in te spreken.
//
// Mislukt een opname, dan is dat geen ramp: die zinnen staan dan in "mislukt" en
// spreken bij het maken van hun clip gewoon los in, zoals voorheen.
import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { spawn } from "node:child_process";
import { writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import { kiesStem, TAALCODE } from "@/lib/infographics/dialogue-stem";
import { opnameTekst, opnamesPerStem, zinTijden, stiltesUitLog, knipPunten } from "@/lib/infographics/stemknippen";
import { VERTELLER_ID, type DialogueCastMember } from "@/lib/infographics/dialogue-schema";

fal.config({ credentials: process.env.FAL_KEY });

export const runtime = "nodejs";
export const maxDuration = 300;

interface StemRegel {
  /** Waarmee de pagina de stem terugvindt bij zijn regel. */
  sleutel?: string;
  characterId?: string;
  text?: string;
}

interface Body {
  regels?: StemRegel[];
  cast?: DialogueCastMember[];
  narratorVoice?: string | null;
  language?: string | null;
}

function ffmpeg(args: string[]): Promise<{ code: number; log: string }> {
  return new Promise((resolve) => {
    const proc = spawn((ffmpegPath as unknown as string) || "ffmpeg", ["-hide_banner", ...args]);
    let log = "";
    proc.stderr.on("data", (c) => { log += c.toString(); });
    proc.on("close", (code) => resolve({ code: code ?? 1, log }));
    proc.on("error", () => resolve({ code: 1, log }));
  });
}

function duurUitLog(log: string): number {
  const m = log.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
}

export async function POST(req: NextRequest) {
  const tijdelijk: string[] = [];
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;

    const body = (await req.json()) as Body;
    const cast = Array.isArray(body.cast) ? body.cast : [];
    const regels = (Array.isArray(body.regels) ? body.regels : [])
      .map((r) => ({
        sleutel: String(r?.sleutel ?? ""),
        characterId: String(r?.characterId ?? ""),
        tekst: String(r?.text ?? "").trim(),
      }))
      .filter((r) => r.sleutel && r.tekst)
      .slice(0, 300);

    // Alleen zinnen van de verteller of van iemand uit de cast; de rest laten we aan
    // het inspreken per regel, dat dezelfde fout netjes meldt.
    const metStem = regels.flatMap((r) => {
      if (r.characterId === VERTELLER_ID) return [{ ...r, stem: kiesStem(body.narratorVoice) }];
      const lid = cast.find((c) => c.id === r.characterId);
      return lid ? [{ ...r, stem: kiesStem(lid.voice) }] : [];
    });
    if (metStem.length === 0) return NextResponse.json({ stemmen: {}, mislukt: regels.map((r) => r.sleutel) });

    // Hetzelfde tarief als per regel: één stem-credit per zin. ElevenLabs rekent per
    // teken, dus in één opname kost het ons niets meer.
    const kosten = metStem.length * CREDIT_COSTS.VOICE;
    const credit = await deductCredits(userId, kosten, "Dialoog: stemmen inspreken");
    if (!credit.success) {
      return NextResponse.json({ error: "insufficient_credits", credits: credit.credits, required: kosten }, { status: 402 });
    }

    const taalCode = TAALCODE[body.language ?? "Nederlands"] ?? "nl";
    const stemmen: Record<string, { audioUrl: string; audioDuration: number }> = {};
    const mislukt = new Set(regels.filter((r) => !metStem.some((m) => m.sleutel === r.sleutel)).map((r) => r.sleutel));

    const groepen = opnamesPerStem(metStem);

    async function neemOp(groep: (typeof groepen)[number]) {
      const tts = await fal.subscribe("fal-ai/elevenlabs/tts/eleven-v3", {
        input: {
          text: opnameTekst(groep.regels.map((r) => r.tekst)),
          voice: groep.stem,
          language_code: taalCode,
          stability: 0.5,
          timestamps: true,
        } as never,
      });
      const data = tts.data as { audio?: { url?: string }; timestamps?: unknown };
      if (!data.audio?.url) throw new Error("geen audio ontvangen");
      const tijden = zinTijden(data.timestamps, groep.regels.length);
      if (!tijden) throw new Error("zinnen niet terug te vinden in de opname");

      const heel = join(tmpdir(), `stem-${randomUUID()}.mp3`);
      tijdelijk.push(heel);
      await writeFile(heel, Buffer.from(await (await fetch(data.audio.url)).arrayBuffer()));
      // -35 dB en 0,15 s: in de proefopname vielen de pauzes tussen zinnen daar
      // ruim binnen (ongeveer een seconde), en een komma-pauze er meestal buiten.
      const meting = await ffmpeg(["-i", heel, "-af", "silencedetect=noise=-35dB:d=0.15", "-f", "null", "-"]);
      const punten = knipPunten(tijden, stiltesUitLog(meting.log), duurUitLog(meting.log));

      for (const [i, r] of groep.regels.entries()) {
        const stuk = join(tmpdir(), `zin-${randomUUID()}.mp3`);
        tijdelijk.push(stuk);
        const knip = await ffmpeg([
          "-loglevel", "error", "-i", heel,
          "-ss", punten[i].start.toFixed(3), "-to", punten[i].eind.toFixed(3),
          "-c:a", "libmp3lame", "-b:a", "128k", "-y", stuk,
        ]);
        if (knip.code !== 0) { mislukt.add(r.sleutel); continue; }
        const pad = `${userId}/dialogue/${randomUUID()}.mp3`;
        const { error } = await supabase.storage.from("audio").upload(pad, await readFile(stuk), { contentType: "audio/mpeg", upsert: true });
        if (error) { mislukt.add(r.sleutel); continue; }
        stemmen[r.sleutel] = {
          audioUrl: supabase.storage.from("audio").getPublicUrl(pad).data.publicUrl,
          audioDuration: Math.max(0.1, punten[i].eind - punten[i].start),
        };
      }
    }

    // Drie opnames tegelijk: elke stem is een eigen opname, en na elkaar zou het
    // bij een lange video onnodig lang duren.
    let volgende = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, groepen.length) }, async () => {
        while (volgende < groepen.length) {
          const groep = groepen[volgende++];
          try {
            await neemOp(groep);
          } catch (e) {
            console.error(`[dialogue-stemmen] opname voor stem ${groep.stem} mislukt:`, e);
            for (const r of groep.regels) if (!stemmen[r.sleutel]) mislukt.add(r.sleutel);
          }
        }
      }),
    );

    // Wat niet gelukt is, is ook niet afgerekend: die zinnen spreken straks per regel
    // in en betalen daar hun eigen stem-credit.
    const terug = metStem.filter((r) => mislukt.has(r.sleutel)).length * CREDIT_COSTS.VOICE;
    if (terug > 0) await addCredits(userId, terug, "Refund: stemmen inspreken");

    console.log(`[dialogue-stemmen] ${Object.keys(stemmen).length} zinnen in ${groepen.length} opnames, ${mislukt.size} mislukt`);
    return NextResponse.json({ stemmen, mislukt: [...mislukt] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-stemmen failed:", msg);
    return NextResponse.json({ error: "Stemmen inspreken mislukt", detail: msg }, { status: 500 });
  } finally {
    for (const f of tijdelijk) await rm(f, { force: true }).catch(() => {});
  }
}
