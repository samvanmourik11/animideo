// WAT IS ER MIS MET DIT FRAGMENT?
//
// Achter de knop "opnieuw" in het videoscherm. Opnieuw maken zonder te weten wat er
// fout was, levert even vaak dezelfde fout op: het beeldmodel krijgt dezelfde
// opdracht en gokt opnieuw. Daarom kijkt hier eerst een visie-model naar het
// bronbeeld en drie momenten uit de clip, en zegt het wat er fout is, of de fout al
// in het beeld zit of pas in de beweging, en wat er anders moet. De gebruiker ziet
// daar niets van: alleen dat het fragment opnieuw laadt.
//
// Kost geen credits: het is één vraag aan het visie-model, in verhouding tot het
// opnieuw maken zelf verwaarloosbaar.
import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegPath from "ffmpeg-static";
import { openai } from "@/lib/openai";
import { beeldVoorKijkvraag } from "@/lib/infographics/beeld-inline";
import { createClient } from "@/lib/supabase/server";
import { leesDiagnose } from "@/lib/infographics/fragment-diagnose";
import { telMensen } from "@/lib/infographics/dialogue-verify";
import { uiterlijkVan, VERTELLER_ID, type DialogueCastMember, type DialogueLine } from "@/lib/infographics/dialogue-schema";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Body {
  regel?: DialogueLine;
  setting?: string;
  /** De mensen die in deze scène horen. */
  cast?: DialogueCastMember[];
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

/** Drie momenten uit de clip (begin, midden, eind), als data-URL voor het visie-model. */
async function framesUitClip(videoUrl: string, tijdelijk: string[]): Promise<string[]> {
  const pad = join(tmpdir(), `diagnose-${randomUUID()}.mp4`);
  tijdelijk.push(pad);
  const res = await fetch(videoUrl);
  if (!res.ok) return [];
  await writeFile(pad, Buffer.from(await res.arrayBuffer()));
  const meting = await ffmpeg(["-i", pad, "-f", "null", "-"]);
  const m = meting.log.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const duur = m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
  if (duur <= 0) return [];

  const uit: string[] = [];
  for (const deel of [0.15, 0.5, 0.85]) {
    const frame = join(tmpdir(), `diagnose-${randomUUID()}.jpg`);
    tijdelijk.push(frame);
    const knip = await ffmpeg([
      "-loglevel", "error", "-ss", (duur * deel).toFixed(3), "-i", pad,
      "-frames:v", "1", "-vf", "scale=768:-2", "-q:v", "4", "-y", frame,
    ]);
    if (knip.code === 0) uit.push(`data:image/jpeg;base64,${(await readFile(frame)).toString("base64")}`);
  }
  return uit;
}

const SYSTEEM =
  "Je bent regisseur van een geanimeerde kindervideo. De maker vindt het fragment hieronder niet goed en " +
  "wil het opnieuw. Zoek uit WAAROM.\n\n" +
  "Je krijgt het bronbeeld waar de clip uit gemaakt is, en (als die er is) drie momenten uit de clip van " +
  "begin tot eind. Let op:\n" +
  "- wie er in beeld is: niemand dubbel, niemand extra, niemand die ontbreekt\n" +
  "- of de plek, houding, kleding en schoenen kloppen, en of iedereen er hetzelfde uitziet als beschreven\n" +
  "- of de juiste persoon praat (mond open) en de anderen hun mond dicht houden\n" +
  "- of je ziet wat de zin of de beschrijving zegt\n" +
  "- of het natuurlijk beweegt: geen vervormde gezichten of handen, niemand of niets dat verschijnt of " +
  "verdwijnt, geen stilstaand beeld, geen rare camerasprongen\n" +
  "- verzonnen tekst in beeld\n\n" +
  "Beslis dan waar de fout zit:\n" +
  '- "beeld": de fout zit al in het BRONBEELD (verkeerde of dubbele personen, verkeerde plek, houding, ' +
  "kleding, voorwerpen). Dan moet er een nieuw beeld komen.\n" +
  '- "beweging": het bronbeeld is goed en het gaat mis in de CLIP (praten, bewegen, vervormen, camera).\n' +
  'Zie je niets duidelijk fout, kies dan "beweging" en maak de beweging levendiger en passender bij wat er ' +
  "gezegd of getoond wordt.\n\n" +
  // Wie te horen krijgt dat er iets mis is, gaat fouten zien: op een goed fragment
  // meldde deze controle een dubbele Tyrell die er niet was. De telling hieronder
  // is los gedaan, zonder te zeggen wie erin hoort, en die klopte wel.
  "Noem alleen fouten die je ZEKER ziet. Er staat een onafhankelijke telling van het aantal mensen bij: ga " +
  "daarvan uit. Klopt die telling met wat er verwacht wordt, dan is er niemand dubbel of extra.\n\n" +
  "De aanwijzingen schrijf je in het ENGELS, concreet en positief: zeg wat er moet gebeuren, niet alleen wat " +
  'niet mag ("Lilly appears once, standing on the right" in plaats van "no double Lilly").\n\n' +
  'Antwoord met JSON: {"fouten": ["..."], "opnieuw": "beeld"|"beweging", ' +
  '"beeldAanwijzing": "alleen bij beeld: wat het nieuwe bronbeeld anders moet doen", ' +
  '"bewegingAanwijzing": "hoe de nieuwe clip moet bewegen"}.';

export async function POST(req: NextRequest) {
  const tijdelijk: string[] = [];
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

    const body = (await req.json()) as Body;
    const regel = body.regel;
    if (!regel) return NextResponse.json({ error: "Geen regel" }, { status: 400 });
    const cast = Array.isArray(body.cast) ? body.cast : [];

    const frames = regel.videoUrl ? await framesUitClip(regel.videoUrl, tijdelijk).catch(() => []) : [];
    const beelden = [
      ...(regel.shotImageUrl ? [regel.shotImageUrl] : []),
      ...frames,
    ];
    if (beelden.length === 0) return NextResponse.json({ diagnose: leesDiagnose({}, false) });

    // Tellen zonder verwachting, los van de diagnose: het bronbeeld en het midden
    // van de clip. Zie telMensen.
    const middenFrame = frames[Math.floor(frames.length / 2)];
    const metWezens = cast.some((c) => !!c.soort && c.soort !== "mens");
    const [inBron, inClip] = await Promise.all([
      regel.shotImageUrl ? telMensen(regel.shotImageUrl, metWezens) : Promise.resolve(null),
      middenFrame ? telMensen(middenFrame, metWezens) : Promise.resolve(null),
    ]);
    const telling = [
      inBron !== null ? `bronbeeld ${inBron}` : "",
      inClip !== null ? `midden van de clip ${inClip}` : "",
    ].filter(Boolean).join(", ");

    const verteller = regel.characterId === VERTELLER_ID;
    const spreker = verteller ? null : cast.find((c) => c.id === regel.characterId);
    const zin = (regel.text ?? "").trim();
    const context = [
      `Plek: ${(body.setting ?? "").trim() || "onbekend"}`,
      `In beeld horen precies deze personen: ${cast.map((c) => `${c.name} (${uiterlijkVan(c)})`).join("; ") || "onbekend"}`,
      regel.kind === "actie"
        ? `Wat je hoort te zien: ${(regel.actie ?? "").trim()}. Niemand praat zichtbaar.` +
          (zin ? ` Eroverheen zegt ${verteller ? "de verteller" : spreker?.name ?? "iemand"}: "${zin}"` : "")
        : `${spreker?.name ?? "Een personage"} praat en zegt: "${zin}". De anderen luisteren met hun mond dicht.`,
      telling ? `Onafhankelijk geteld aantal mensen: ${telling} (verwacht: ${cast.length || "onbekend"}).` : "",
      regel.beeldWaarschuwingen?.length ? `De automatische controle zag eerder: ${regel.beeldWaarschuwingen.join("; ")}` : "",
      regel.shotImageUrl
        ? `Beeld 1 is het bronbeeld.${frames.length ? ` Beelden 2 tot en met ${frames.length + 1} zijn momenten uit de clip, van begin naar eind.` : " Er is nog geen clip."}`
        : "Er is geen bronbeeld; de beelden zijn momenten uit de clip.",
    ].filter(Boolean).join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEEM },
        {
          role: "user",
          content: [
            { type: "text", text: context },
            // Zelf opgehaald in plaats van alleen de link: zie beeld-inline.ts.
            ...(await Promise.all(beelden.map((u) => beeldVoorKijkvraag(u)))).map((url) => ({
              type: "image_url" as const,
              image_url: { url, detail: "high" as const },
            })),
          ],
        },
      ],
      response_format: { type: "json_object" },
    });
    const diagnose = leesDiagnose(JSON.parse(completion.choices[0]?.message?.content ?? "{}"), !!regel.shotImageUrl);
    console.log(`[dialogue-diagnose] ${diagnose.opnieuw}: ${diagnose.fouten.join("; ") || "niets duidelijk fout"}`);
    return NextResponse.json({ diagnose });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-diagnose failed:", msg);
    return NextResponse.json({ error: "Diagnose mislukt", detail: msg }, { status: 500 });
  } finally {
    for (const f of tijdelijk) await rm(f, { force: true }).catch(() => {});
  }
}
