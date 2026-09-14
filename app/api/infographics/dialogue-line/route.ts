import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { spawn } from "node:child_process";
import { writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { generateImageWithStyle } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { kiesStem, TAALCODE } from "@/lib/infographics/dialogue-stem";
import {
  buildDialogueMotionPrompt, buildActionMotionPrompt, illustratieContext, buildShotPrompt,
  iederEenKeer, iedereenZichtbaar, voorwerpRegie, ZITTEN_REGEL, MODELBLAD_UITLEG,
} from "@/lib/infographics/dialogue-staging";
import { buildIllustrationPrompt } from "@/lib/infographics/story-style";
import {
  zonderHerhaling as kaderZonderHerhaling,
  bewegingVoorKader,
  isBeweging,
  type Kader,
  type Beweging,
} from "@/lib/infographics/verhaal-kaders";
import { isLichtsoort, type Lichtsoort } from "@/lib/infographics/verhaal-licht";
import { zonderTekst } from "@/lib/infographics/dialogue-beeldtekst";
import { beoordeelBeeld, beoordeelBeweging, type SprekerOordeel } from "@/lib/infographics/dialogue-verify";
import {
  sprekerHelft, ACTIE_MIN_SEC, ACTIE_MAX_SEC, ACTIE_STANDAARD_SEC, VERTELLER_ID,
  type DialogueCastMember, type DialogueVoorwerp, type ShotSoort,
} from "@/lib/infographics/dialogue-schema";
import { storyCanvasSize } from "@/lib/infographics/canvas-size";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import type { InfographicFormat } from "@/lib/types";

fal.config({ credentials: process.env.FAL_KEY });

export const runtime = "nodejs";
export const maxDuration = 300;

// Seedance i2v. LET OP: het /lite/-pad is bij fal afgevoerd en wordt doorgestuurd
// naar Seedance 1.0 Pro Fast; de prijs is daardoor resolutie-afhankelijk geworden
// (720p/5s ≈ $0,108). Zie de notitie bij VIDEO_GENERATION in credit-costs.ts.
const SEEDANCE = "fal-ai/bytedance/seedance/v1/lite/image-to-video";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Staat er iemand te veel, dubbel of te weinig in beeld? Dan is het beeld onbruikbaar. */
function mensenFout(fouten: string[]): boolean {
  return /extra persoon|extra kind|extra volwassene|twee keer|ontbreekt|niet in de lijst|omstander/i.test(fouten.join(" "));
}

function ffprobeDuur(file: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn((ffmpegPath as unknown as string) || "ffmpeg", ["-hide_banner", "-i", file, "-f", "null", "-"]);
    let s = "";
    proc.stderr.on("data", (c) => { s += c.toString(); });
    proc.on("close", () => {
      const m = s.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      resolve(m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0);
    });
    proc.on("error", () => resolve(0));
  });
}

/** Eén frame uit een clip halen, om door het visie-model te laten beoordelen. */
function snijFrame(video: string, seconde: number, uit: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn((ffmpegPath as unknown as string) || "ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-ss", Math.max(0, seconde).toFixed(3), "-i", video,
      "-frames:v", "1", "-q:v", "3", "-y", uit,
    ]);
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error("frame knippen mislukt"))));
  });
}

/** Gemiddelde helderheid per frame van een uitsnede — onze maat voor beweging. */
function helderheidPerFrame(video: string, crop: string): Promise<number[]> {
  return new Promise((resolve) => {
    const proc = spawn((ffmpegPath as unknown as string) || "ffmpeg", [
      "-hide_banner", "-i", video, "-vf", `crop=${crop},signalstats,metadata=print:file=-`, "-f", "null", "-",
    ]);
    let out = "";
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.on("close", () => resolve([...out.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => parseFloat(m[1]))));
    proc.on("error", () => resolve([]));
  });
}

/**
 * Het moment waarop de mond van de spreker opengaat. De export knipt de clip hier
 * af, zodat de stem precies op de mondbeweging begint in plaats van op frame nul —
 * Seedance laat het personage soms een halve seconde wachten voor hij begint.
 * Drempel uit de clip zelf afgeleid, want de absolute waarden verschillen per beeld.
 */
function mondOpening(activiteit: number[], fps: number): number {
  if (activiteit.length < 4 || fps <= 0) return 0;
  const gesorteerd = [...activiteit].sort((a, b) => a - b);
  const mediaan = gesorteerd[Math.floor(gesorteerd.length / 2)];
  const piek = gesorteerd[Math.floor(gesorteerd.length * 0.9)];
  const drempel = mediaan + (piek - mediaan) * 0.5;
  for (let i = 0; i < activiteit.length - 1; i++) {
    if (activiteit[i] > drempel && activiteit[i + 1] > drempel * 0.6) return i / fps;
  }
  return 0;
}

interface Body {
  /** "actie" = beeld zonder gesproken tekst. Afwezig = dialoog. */
  kind?: ShotSoort;
  /** Alleen bij een actiebeeld: wat er te zien is (Engels) en hoe lang. */
  actie?: string;
  seconden?: number;
  twoShotUrl?: string;
  castSheetUrl?: string;
  cast?: DialogueCastMember[];
  speakerId?: string;
  text?: string;
  emotion?: string;
  language?: string;
  format?: InfographicFormat;
  styleId?: string;
  seed?: number;
  speed?: number;
  /** Stem van de verteller; alleen gebruikt als speakerId "verteller" is. */
  narratorVoice?: string;
  /** Hoe dit shot in beeld komt (close-up, totaalbeeld…). Zie verhaal-kaders.ts. */
  kader?: Kader | null;
  /**
   * De omgeving van deze scene (Engels). Nodig sinds een shot met een eigen
   * camerastandpunt VANAF NUL wordt getekend in plaats van als bewerking van het
   * scenebeeld — dan moet de briefing zelf zeggen waar we zijn.
   */
  setting?: string;
  /** Het kader van het VORIGE shot, zodat we niet twee keer hetzelfde krijgen. */
  vorigKader?: Kader | null;
  /** Wat de camera doet tijdens de clip. Leeg = afleiden uit het kader. */
  beweging?: Beweging | null;
  /** De hoeveelste shot dit is; laat de camerabewegingen rouleren. */
  shotIndex?: number;
  /** Het licht in deze scène. Zie verhaal-licht.ts. */
  licht?: Lichtsoort | null;
  // --- Gericht opnieuw maken ---------------------------------------------
  // Een regel bestaat uit drie dingen die los kapot kunnen: de stem, het
  // bronbeeld en de beweging. Wie alleen de beweging wil overdoen hoort niet
  // opnieuw voor stem en beeld te betalen. Wat hier meekomt, wordt hergebruikt.
  /** Bestaande stem hergebruiken (tekst is niet veranderd). */
  hergebruikAudioUrl?: string;
  hergebruikAudioDuration?: number;
  /** Bestaand bronbeeld hergebruiken; alleen de clip wordt dan opnieuw gemaakt. */
  hergebruikShotImageUrl?: string;
  /** Extra aanwijzing voor ALLEEN dit bronbeeld, bijv. "zet ze bij het raam". */
  beeldInstructie?: string;
  /**
   * Aanwijzing van de gebruiker voor de BEWEGING van deze clip ("oma wijst naar de
   * wagen", "de camera zoomt langzaam in"). Geldt voor de clip, niet voor het beeld.
   */
  bewegingInstructie?: string;
  // Vrije regieaanwijzing van de gebruiker, geldt voor elk beeld in de video.
  illustrationBrief?: string;
  /** Vaste voorwerpen die in deze scène voorkomen. Zie voorwerpenInScene. */
  voorwerpen?: DialogueVoorwerp[];
  /** Zaten ze in het vorige actiebeeld van deze scène? Zie zitHouding. */
  zit?: boolean;
  /** Wat je in dit shot ziet, uit de beeldregie (Engels). Zie DialogueLine.beeld. */
  beeld?: string;
  /**
   * Alleen het beeld van deze regel, zonder stem en clip: voor het storyboard per
   * zin. De clip gebruikt dat beeld later via hergebruikShotImageUrl.
   */
  alleenBeeld?: boolean;
}

// Eén gesproken regel = één clip waarin precies dit personage praat en de anderen
// zichtbaar luisteren. Drie stappen: inspreken, bronbeeld met de juiste houdingen,
// en dat beeld tot leven brengen. Alles vooraf afgerekend; mislukt er iets, dan
// storten we het niet-gebruikte deel terug.
/** Gaat deze afkeuring over WIE er staat in plaats van over de compositie? */
function uiterlijkWeggedreven(fouten: string[]): boolean {
  const tekst = fouten.join(" ").toLowerCase();
  return /haar|kleding|kapsel|afwijkt|niet in de lijst|extra |omstander|persoon die niet/.test(tekst);
}

/**
 * Een stap terug naar een standpunt dat dichter bij het scenebeeld ligt.
 *
 * De volgorde is niet willekeurig: een close-up en een extreme close-up dwingen
 * het model een gezicht van dichtbij te verzinnen dat in het scenebeeld maar een
 * paar pixels groot was. Medium ligt daar het dichtst bij, en `null` betekent
 * "helemaal geen eigen standpunt" — dan wordt het weer een bewerking van het
 * scenebeeld en verandert er zo min mogelijk.
 */
function rustigerKader(huidig: Kader | null): Kader | null {
  switch (huidig) {
    case "extreme-close": return "close";
    case "close": return "medium";
    case "laag":
    case "hoog":
    case "van-achteren":
    case "detail":
    case "totaal": return "medium";
    default: return null;
  }
}

export async function POST(req: NextRequest) {
  let terugstorten = async () => {};
  let tmpVideo: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const b = (await req.json()) as Body;
    const tekst = (b.text ?? "").trim();
    const cast = Array.isArray(b.cast) ? b.cast : [];
    // Een VERTELLER hoort bij geen personage: eigen stem, en niemand in beeld
    // hoeft zijn mond te bewegen. Alleen geldig boven een actiebeeld.
    const isVerteller = b.speakerId === VERTELLER_ID;
    const spreker = cast.find((c) => c.id === b.speakerId);
    const luisteraars = isVerteller ? cast : cast.filter((c) => c.id !== b.speakerId);

    // Een ACTIEBEELD heeft geen gesproken tekst: geen stem, geen spreker om te
    // controleren. Alleen een handeling die in beeld gebracht wordt.
    const isActieBeeld = b.kind === "actie";
    const actieTekst = (b.actie ?? "").trim();
    // Een actiebeeld MET tekst is een voice-over: je ziet het beeld, je hoort de
    // stem eroverheen. Dat vraagt wel een stem, maar geen sprekercontrole — er
    // beweegt immers geen mond die bij die stem moet horen.
    const heeftVoiceOver = isActieBeeld && !!tekst;

    if (!b.twoShotUrl) return NextResponse.json({ error: "Geen twee-shot voor deze scène" }, { status: 400 });
    if (isActieBeeld) {
      if (!actieTekst) return NextResponse.json({ error: "Geen handeling opgegeven" }, { status: 400 });
      if (heeftVoiceOver && !isVerteller && !spreker) return NextResponse.json({ error: "Onbekende stem voor de voice-over" }, { status: 400 });
    } else {
      if (!tekst) return NextResponse.json({ error: "Geen tekst" }, { status: 400 });
      if (!spreker) {
        // Deze 400 kwam terug als een kale "onderdeel mislukt" in de browser, zonder
        // spoor in de log. Wie zeven mislukte regels ziet moet kunnen nazoeken waarom.
        console.error(`[dialogue-line] onbekende spreker "${b.speakerId}"; cast: ${cast.map((c) => c.id).join(", ")}`);
        return NextResponse.json({ error: "Onbekende spreker" }, { status: 400 });
      }
      // GEEN luisteraar is sinds de camerakaders normaal: een close-up van één
      // personage dat praat, of een scene waarin verder niemand is. Dit was een
      // harde weigering en liet zeven regels stuklopen zodra het scene-beeld nog
      // maar de spelers van die scene bevatte.
      if (luisteraars.length === 0 && cast.length > 1) {
        console.warn(`[dialogue-line] geen luisteraar naast ${spreker.name}; shot wordt een solo-opname`);
      }
    }

    // Bij een verteller pakken we de aparte vertellerstem uit de spec; die is
    // gekozen zodat hij niet klinkt als een van de personages.
    const gewensteStem = isVerteller ? (b.narratorVoice ?? "").trim() : spreker?.voice;
    const stem = kiesStem(gewensteStem);
    const snelheid = typeof b.speed === "number" && Number.isFinite(b.speed) ? Math.max(0.7, Math.min(1.2, b.speed)) : 1;
    const taalCode = TAALCODE[b.language ?? "Nederlands"] ?? "nl";
    const format = (b.format === "9:16" ? "9:16" : "16:9") as InfographicFormat;

    // Stem + bronbeeld + clip vooraf afrekenen.
    // Alleen afrekenen wat er daadwerkelijk gemaakt wordt. Wie alleen de beweging
    // overdoet betaalt geen stem en geen beeld.
    // Voor het storyboard alleen het beeld: geen stem en geen clip, en daar dus ook
    // niet voor betalen.
    const alleenBeeld = b.alleenBeeld === true;
    const stemNodig = !alleenBeeld && (!isActieBeeld || heeftVoiceOver) && !(b.hergebruikAudioUrl ?? "").trim();
    const beeldNodig = !( (b.hergebruikShotImageUrl ?? "").trim() && !(b.beeldInstructie ?? "").trim() );
    if (alleenBeeld && !beeldNodig) {
      return NextResponse.json({ error: "Dit shot heeft al een beeld" }, { status: 400 });
    }
    const kosten =
      (stemNodig ? CREDIT_COSTS.VOICE : 0) +
      (beeldNodig ? CREDIT_COSTS.IMAGE_GENERATION : 0) +
      (alleenBeeld ? 0 : CREDIT_COSTS.VIDEO_GENERATION);
    const credit = await deductCredits(
      user.id, kosten,
      alleenBeeld
        ? "Dialoog: storyboardbeeld"
        : isActieBeeld ? (heeftVoiceOver ? "Dialoog: actiebeeld met stem" : "Dialoog: actiebeeld") : `Dialoogregel (${spreker!.name})`
    );
    if (!credit.success) {
      return NextResponse.json({ error: "insufficient_credits", credits: credit.credits, required: kosten }, { status: 402 });
    }
    const userId = user.id;
    let besteed = 0;
    terugstorten = async () => {
      const terug = kosten - besteed;
      if (terug > 0) { try { await addCredits(userId, terug, "Refund: dialoogregel"); } catch {} }
    };

    // ---------- 1. Inspreken (alleen bij dialoog) ----------
    let audioUrl: string | null = null;
    let audioDuration = 0;

    const bestaandeAudio = (b.hergebruikAudioUrl ?? "").trim();
    if (alleenBeeld) {
      // Alleen het beeld voor het storyboard: de stem komt pas bij de clip.
    } else if ((!isActieBeeld || heeftVoiceOver) && bestaandeAudio) {
      // Tekst is niet veranderd, dus de bestaande opname deugt nog.
      audioUrl = bestaandeAudio;
      audioDuration = typeof b.hergebruikAudioDuration === "number" && b.hergebruikAudioDuration > 0
        ? b.hergebruikAudioDuration
        : 4;
    } else if (!isActieBeeld || heeftVoiceOver) {
      const tts = await fal.subscribe("fal-ai/elevenlabs/tts/eleven-v3", {
        input: { text: tekst, voice: stem, language_code: taalCode, stability: 0.5, similarity_boost: 0.75, speed: snelheid } as never,
      });
      const ttsUrl = (tts.data as { audio?: { url: string } }).audio?.url;
      if (!ttsUrl) { await terugstorten(); return NextResponse.json({ error: "Geen audio ontvangen" }, { status: 500 }); }
      besteed += CREDIT_COSTS.VOICE;

      const audioBuf = Buffer.from(await (await fetch(ttsUrl)).arrayBuffer());
      const tmpAudio = join(tmpdir(), `dline-${randomUUID()}.mp3`);
      await writeFile(tmpAudio, audioBuf);
      audioDuration = await ffprobeDuur(tmpAudio);
      await rm(tmpAudio, { force: true }).catch(() => {});

      const audioPad = `${user.id}/dialogue/${randomUUID()}.mp3`;
      const { error: upErr } = await supabase.storage.from("audio").upload(audioPad, audioBuf, { contentType: "audio/mpeg", upsert: true });
      if (upErr) { await terugstorten(); return NextResponse.json({ error: upErr.message }, { status: 500 }); }
      audioUrl = supabase.storage.from("audio").getPublicUrl(audioPad).data.publicUrl;
    } else {
      // Een actiebeeld duurt precies zo lang als het draaiboek voorschrijft.
      audioDuration = Math.max(ACTIE_MIN_SEC, Math.min(ACTIE_MAX_SEC,
        Math.round(typeof b.seconden === "number" ? b.seconden : ACTIE_STANDAARD_SEC)));
    }

    // ---------- 2. Bronbeeld: deze spreekt, de rest luistert ----------
    // Een bewerking van het twee-shot van de scène, zodat de personages tussen
    // regels op dezelfde plek en in dezelfde stijl blijven.
    //
    // POORT 1. Na elk bronbeeld kijkt een visie-model wie zijn mond open heeft.
    // Klopt dat niet met wie er hoort te praten, dan maken we het beeld opnieuw
    // vóórdat we aan de dure clip beginnen. Dit is de goedkope plek om de fout te
    // vangen: het bronbeeld kost $0,04 en bepaalt vrijwel volledig wat het
    // videomodel daarna doet.
    // Drie pogingen, en een vierde alleen als er dan nog iemand te veel of te weinig
    // in beeld staat (zie de lus).
    const MAX_BEELD_POGINGEN = 4;
    const bestaandBeeld = (b.hergebruikShotImageUrl ?? "").trim();
    const beeldInstructie = (b.beeldInstructie ?? "").trim();
    let shotImageUrl: string | null = bestaandBeeld && !beeldInstructie ? bestaandBeeld : null;
    let beeldOordeel: SprekerOordeel = "onduidelijk";
    let beeldFouten: string[] = [];
    let beeldPogingen = 0;

    // Het kader van dit shot. Vraagt het draaiboek er geen, dan blijft alles bij
    // het oude: hetzelfde beeld als de scène, alleen andere houdingen. Vraagt het
    // er wel een, dan controleren we of dat kader kán (geen close-up van drie
    // mensen, niemand die zichtbaar praat in een totaalbeeld) en of het niet
    // hetzelfde is als het vorige shot — twee dezelfde kaders achter elkaar lezen
    // als één lang shot.
    const gekozenKader: Kader | null = b.kader
      ? kaderZonderHerhaling(
          b.kader,
          b.vorigKader ?? null,
          isActieBeeld ? cast.length : 1 + luisteraars.length,
          !isActieBeeld,
        )
      : null;

    // Het kader dat we DEZE poging gebruiken. Blijft het uiterlijk wegdrijven, dan
    // vallen we terug op een rustiger standpunt: hoe dichter op een gezicht, hoe meer
    // het model moet verzinnen — en hoe groter de kans dat het haar of de kleding
    // verandert. Leeg betekent een gewoon medium shot.
    //
    // Een medium gesprek was hier een BEWERKING van het scènebeeld, tegen dubbele
    // personages (2.4 en 9.4 in de vijfde Wonderwagen-video). Dat is weer een nieuwe
    // tekening: een beeld dat van een eerder beeld wordt afgeleid, komt fel en
    // overscherp terug en valt uit de toon naast het plekbeeld. Tegen dubbele
    // personages staan nu het castblad, de telling in de beeldcontrole en de herkansingen.
    let kaderNu: Kader | null = gekozenKader;
    // Model sheets alleen als er één persoon in beeld komt. Bij meer mensen tellen
    // drie sheets plus het castblad plus het scènebeeld al snel vijftien getekende
    // figuren voor drie personages.
    const personenInShot = isActieBeeld ? cast.length : 1 + luisteraars.length;
    const metModelSheets = () => personenInShot === 1 || kaderNu === "close" || kaderNu === "extreme-close";
    const voorwerpen = (Array.isArray(b.voorwerpen) ? b.voorwerpen : [])
      .filter((v) => typeof v?.naam === "string" && typeof v?.uiterlijk === "string")
      .slice(0, 2);
    const voorwerpBladen = voorwerpen.map((v) => (v.bladUrl ?? "").trim()).filter(Boolean);
    // Wat je in dit shot ziet, uit de beeldregie. Begrensd, want wat achteraan een
    // te lange prompt staat komt niet aan (zie MAX_PROMPT_TEKENS in image-gen).
    const beeldRegie = (b.beeld ?? "").replace(/\s+/g, " ").trim().slice(0, 400) || null;
    // Wat de camera DOET tijdens de clip. Afgeleid van het kader — je zoomt in op
    // een gezicht, je draait om iemand heen, je onthult een plek door uit te
    // zoomen — met de scene-index erin zodat twee clips achter elkaar niet
    // hetzelfde doen. Een expliciete keuze uit het draaiboek gaat voor.
    const cameraBeweging: Beweging = isBeweging(b.beweging)
      ? b.beweging
      : bewegingVoorKader(kaderNu, typeof b.shotIndex === "number" ? b.shotIndex : 0);

    // Alleen de beweging opnieuw: het bronbeeld staat er al en is goedgekeurd.
    //
    // Deze lus stopte altijd na één poging: het afgekeurde beeld ging meteen in
    // shotImageUrl, en een lege shotImageUrl was juist de voorwaarde om door te gaan.
    // Elke afkeuring bleef zo een waarschuwing zonder herkansing — twee Tyrells of
    // een vreemd meisje gingen gewoon de clip in — terwijl er wél een credit voor de
    // herkansing werd afgeschreven. Nu houden we het minst foute beeld apart bij.
    const alHerbruikbaar = shotImageUrl !== null;
    let beste: { url: string; fouten: string[]; oordeel: SprekerOordeel; ernst: number } | null = null;
    for (let poging = 1; !alHerbruikbaar && poging <= MAX_BEELD_POGINGEN; poging++) {
      if (poging === MAX_BEELD_POGINGEN && !mensenFout(beeldFouten)) break;
      // De herkansingen zijn niet vooraf afgerekend; pas afschrijven als ze echt gebeuren.
      if (poging > 1) await deductCredits(userId, CREDIT_COSTS.IMAGE_GENERATION, "Dialoogregel: bronbeeld opnieuw");
      beeldPogingen = poging;
      try {
        const beeld = await generateImageWithStyle({
          // Altijd een nieuwe tekening vanaf de omschrijving, met dezelfde opbouw als
          // het plekbeeld (buildIllustrationPrompt). Eerst was dit een bewerking van
          // het plekbeeld, of een tekening met dat beeld als referentie. Beide kwamen
          // fel, overscherp en donkerder terug dan het plekbeeld zelf: een beeld dat
          // van een eerder gemaakt beeld afstamt, krijgt die harde afwerking.
          prompt: buildIllustrationPrompt(
            buildShotPrompt({
              setting: (b.setting ?? "").trim(),
              inBeeld: isActieBeeld ? cast : [spreker!, ...luisteraars],
              spreker: isActieBeeld ? null : spreker,
              emotion: b.emotion,
              actie: isActieBeeld ? actieTekst : null,
              beeld: beeldRegie,
              kader: kaderNu ?? "medium",
              styleId: b.styleId,
              licht: isLichtsoort(b.licht) ? b.licht : null,
            }),
            b.styleId,
            b.language ?? null,
            "omgeving",
          ),
          format,
          visualStyle: null,
          // Zonder seed bij een herkansing: dezelfde seed zou grofweg hetzelfde
          // (foute) beeld opleveren en dan blijven we betalen voor niets.
          seed: poging === 1 && typeof b.seed === "number" ? b.seed : undefined,
          // Geen plekbeeld als referentie meer (zie hierboven). De PORTRETTEN en het
          // castblad houden de identiteit vast; zonder portretten dobberde het haar,
          // de kleding en het gezicht zichtbaar weg over negen regels.
          // Het castblad weegt het zwaarst: het legt de identiteit én de
          // onderlinge lengte vast. Zonder blad (oudere projecten) doen de
          // portretten dat werk, maar die zeggen niets over lichaamsbouw.
          brandUrls: [(b.castSheetUrl ?? "").trim(), ...voorwerpBladen].filter(Boolean),
          // Identiteit: liefst de model sheet (voren, schuin, opzij), anders het
          // portret. Het portret toont maar één hoek; bij een shot van opzij moest
          // het model de rest van het hoofd zelf verzinnen en veranderde het haar.
          characterUrls: cast
            .map((c) => (metModelSheets() ? c.modelSheetUrl || c.portraitUrl : c.portraitUrl || c.modelSheetUrl))
            .filter(Boolean),
          extraContext: [
            illustratieContext(b.illustrationBrief),
            (b.castSheetUrl ?? "").trim()
              ? "One reference image is a CHARACTER LINE-UP SHEET of everyone in this video, full body. " +
                "The people in this shot must match that sheet exactly — same faces, hair, clothing, build, " +
                "and the same height difference between them. " +
                // Zie dialogue-twoshot: zonder dit verbod neemt het model ook de
                // OPSTELLING van het blad over (gespleten beeld, een rij portretten)
                // of tekent het de kaartjes als voorwerp in de scène.
                "The sheet tells you WHO these people are, nothing else. Do NOT copy its layout: this is one " +
                "continuous scene, never a split screen, never side-by-side panels, never a row of portraits. " +
                "Do not draw the sheet, or any framed portrait or card of these characters, as an object in the shot."
              : "",
            metModelSheets() && cast.some((c) => c.modelSheetUrl) ? MODELBLAD_UITLEG : "",
            // De cast is de cast. Dit stond alleen in de bewegings-prompt, waardoor
            // verzonnen figuranten al in het bronbeeld zaten en de videostap ze
            // netjes intact liet.
            `This shot contains ONLY these ${cast.length === 1 ? "person" : "people"}: ${cast.map((c) => c.name).join(" and ")}. ` +
              "Do not add another person — no extra adults, no children, no bystanders, no background figures. " +
              iederEenKeer(cast.map((c) => c.name)),
            voorwerpRegie(voorwerpen, isActieBeeld ? actieTekst : null),
            // Ook bij een actiebeeld, zolang de handeling zelf niets over zitten of
            // staan zegt; dat beslist de pagina (zie zegtIetsOverHouding).
            b.zit === true ? ZITTEN_REGEL : "",
            // Een gerichte correctie van de gebruiker op dít ene beeld weegt
            // zwaarder dan de algemene briefing, dus hij staat erachter.
            beeldInstructie ? `IMPORTANT CORRECTION for this specific shot: ${beeldInstructie}` : "",
          ].filter(Boolean).join(" ").trim() || undefined,
        });
        const kandidaat = await persistFalAssetSoft(supabase, user.id, beeld.imageUrl, "image");
        besteed += CREDIT_COSTS.IMAGE_GENERATION;

        // Eén aanroep, twee oordelen: praat de juiste persoon, en staat er iets in
        // dat fysiek niet kan (mensen ín een tank, zwevende voorwerpen, verzonnen
        // tekst op een scherm)? Bij een actiebeeld praat er niemand, dus dan telt
        // alleen het tweede.
        // Bij een actiebeeld staat de hele cast in beeld, ook wie eroverheen praat.
        // Hier ging alleen `luisteraars` mee: de cast MIN de stem. Praatte Lilly over
        // een actiebeeld, dan stond zij niet in de lijst en keurde de controle haar af
        // als "extra kind" — drie betaalde pogingen lang, en elke afkeuring zette het
        // camerakader een stap terug.
        const oordeel = await beoordeelBeeld(
          kandidaat,
          isActieBeeld ? null : spreker!,
          isActieBeeld ? cast : luisteraars,
          { iedereenZichtbaar: iedereenZichtbaar(kaderNu) },
        );
        beeldOordeel = oordeel.spreker;
        beeldFouten = oordeel.fouten;
        // Iemand te veel of te weinig weegt het zwaarst, een verkeerde spreker daarna.
        const ernst = (mensenFout(beeldFouten) ? 10 : 0) + (beeldOordeel === "verkeerd" ? 5 : 0) + beeldFouten.length;
        if (!beste || ernst < beste.ernst) beste = { url: kandidaat, fouten: beeldFouten, oordeel: beeldOordeel, ernst };

        if (ernst === 0) {
          // In de dialoogmodus hoort er geen tekst in beeld; wat het model er toch
          // bij tekent (kalenders, blaadjes, labels) is altijd verhaspeld.
          shotImageUrl = await zonderTekst(kandidaat, format, b.language);
          break;
        }

        console.warn(
          `[dialogue-line] poging ${poging} (kader ${kaderNu ?? "geen"}): ` +
          (beeldOordeel === "verkeerd" ? "verkeerde spreker" : "") +
          (beeldFouten.length ? ` beeldfouten: ${beeldFouten.join("; ")}` : "")
        );

        // Drijft het UITERLIJK weg, dan is het camerastandpunt de waarschijnlijke
        // oorzaak: hoe verder van het scenebeeld af, hoe meer het model zelf moet
        // invullen. Val dan terug op een rustiger kader in plaats van hetzelfde nog
        // twee keer te proberen. Bij de laatste poging laten we het kader helemaal
        // los: liever een saai beeld met de juiste Lily dan een mooi beeld met een
        // vreemde.
        if (uiterlijkWeggedreven(beeldFouten)) {
          kaderNu = poging >= MAX_BEELD_POGINGEN - 1 ? null : rustigerKader(kaderNu);
          console.warn(`[dialogue-line] uiterlijk dreef weg, kader terug naar ${kaderNu ?? "het scenebeeld"}`);
        }
      } catch (e) {
        console.error("[dialogue-line] bronbeeld mislukt:", e);
        break;
      }
    }

    // Geen enkele poging zonder fouten: neem de minst foute, niet zomaar de laatste.
    if (!shotImageUrl && beste) {
      shotImageUrl = beste.url;
      beeldFouten = beste.fouten;
      beeldOordeel = beste.oordeel;
    }

    if (!shotImageUrl) {
      await terugstorten();
      return NextResponse.json({ error: "Bronbeeld voor deze regel mislukt" }, { status: 500 });
    }

    // Voor het storyboard zijn we hier klaar: het beeld is gemaakt en gecontroleerd.
    // Stem en clip komen pas als de gebruiker het bord heeft bekeken.
    if (alleenBeeld) {
      await terugstorten();
      return NextResponse.json({
        shotImageUrl,
        sprekerZeker: beeldOordeel !== "verkeerd",
        beeldOordeel,
        beeldPogingen,
        beeldWaarschuwingen: beeldFouten.length ? beeldFouten.slice(0, 3) : null,
      });
    }

    // ---------- 3. Tot leven brengen, en controleren wie er beweegt ----------
    // Clipduur: Seedance kent alleen 5 of 10 seconden, en 10 kost het DUBBELE
    // ($0,216 tegen $0,108). De marge dekt de aanloop voordat de mond opengaat;
    // gemeten waarden daarvoor lagen tussen 0,04s en 0,97s, dus één seconde is
    // ruim. Met een grotere marge sprong bijna elke normale dialoogregel naar een
    // clip van tien seconden en verdubbelden de kosten van een hele video.
    const AANLOOP_MARGE = 1.0;
    const clipSec = audioDuration + AANLOOP_MARGE > 5 ? "10" : "5";

    const bewegingInstructie = (b.bewegingInstructie ?? "").replace(/\s+/g, " ").trim().slice(0, 500);

    async function maakClip(): Promise<string | null> {
      try {
        const { request_id } = await fal.queue.submit(SEEDANCE, {
          input: {
            image_url: shotImageUrl,
            prompt:
              (isActieBeeld
                ? buildActionMotionPrompt(actieTekst, b.styleId, cameraBeweging)
                : buildDialogueMotionPrompt(spreker!, luisteraars, b.styleId, cameraBeweging)) +
              // Achteraan, zodat de aanwijzing over déze clip gaat en de vaste regels
              // (wie praat, dezelfde mensen, dezelfde stijl) er niet door wegvallen.
              (bewegingInstructie
                ? ` IMPORTANT DIRECTION from the user for this clip (it may be written in Dutch): "${bewegingInstructie}". ` +
                  "Follow it, but keep the same people, their looks, who is speaking and the drawing style."
                : ""),
            duration: clipSec,
            resolution: "720p",
            // Stond op true, uit de tijd dat de prompt nog "static locked camera"
            // vroeg. Sindsdien vraagt de prompt om een langzame camerabeweging (zie
            // bewegingRegie), maar deze vlag zette de camera alsnog vast: twee
            // tegenstrijdige opdrachten in één aanroep. De bewegingen zijn nu zo
            // gekozen dat ze niets buiten het storyboardbeeld laten zien.
            camera_fixed: false,
          } as never,
        });
        const deadline = Date.now() + 240_000;
        let klaar = false;
        while (Date.now() < deadline) {
          const st = (await fal.queue.status(SEEDANCE, { requestId: request_id, logs: false })) as { status: string };
          if (st.status === "COMPLETED") { klaar = true; break; }
          if (st.status !== "IN_QUEUE" && st.status !== "IN_PROGRESS") break;
          await sleep(2000);
        }
        if (!klaar) return null;
        const result = await fal.queue.result(SEEDANCE, { requestId: request_id });
        const tijdelijk = (result.data as { video?: { url: string } }).video?.url ?? null;
        return tijdelijk ? await persistFalAssetSoft(supabase, user!.id, tijdelijk, "video") : null;
      } catch (e) {
        console.error("[dialogue-line] beweging mislukt:", e);
        return null;
      }
    }

    /**
     * POORT 2. Snijdt een frame uit het MIDDEN van de clip en laat het visie-model
     * kijken wie daar zijn mond open heeft.
     *
     * Hiervoor deed een pixelmeting dit werk: helderheidsverschil binnen een klein
     * kader dat de mond moest raken. Dat kader viel in de praktijk op de OGEN en
     * het HAAR, dus die controle mat knipperen en gaf ruis terug — en liet de fout
     * die hij moest vangen gewoon door. Waar een gezicht staat verschilt per
     * compositie, dus een vast kader kán dit niet betrouwbaar doen.
     */
    /**
     * POORT 2. Snijdt meerdere frames uit de clip en laat het visie-model ze
     * NAAST ELKAAR beoordelen.
     *
     * Twee vragen tegelijk: praat halverwege de juiste persoon, en is dit één
     * samenhangende opname? Dat tweede kan principieel niet met één frame — in een
     * testvideo vouwde een bus zichzelf op en reed daarna een gebouw binnen, en elk
     * frame apart zag er prima uit. Alleen door frames te vergelijken komt zoiets
     * boven water.
     */
    async function controleerClip(url: string): Promise<{ mouthStart: number; oordeel: SprekerOordeel; fouten: string[] }> {
      let pad: string | null = null;
      const framePaden: string[] = [];
      try {
        pad = join(tmpdir(), `dclip-${randomUUID()}.mp4`);
        await writeFile(pad, Buffer.from(await (await fetch(url)).arrayBuffer()));
        const clipDuur = await ffprobeDuur(pad);

        // Aanloop schatten: wanneer komt er beweging op gang aan de kant van de
        // spreker? Grove maat over een halve beeldhelft, alleen voor de timing.
        let start = 0;
        if (!isActieBeeld) {
          try {
            const { width, height } = storyCanvasSize(format);
            const reeks = await helderheidPerFrame(pad, sprekerHelft(spreker!.position, width, height));
            if (reeks.length > 2 && clipDuur > 0) {
              const act = reeks.slice(1).map((v, i) => Math.abs(v - reeks[i]));
              start = Math.min(mondOpening(act, act.length / clipDuur), Math.max(0, clipDuur - audioDuration));
            }
          } catch { /* timing is een verbetering, geen voorwaarde */ }
        }

        // Drie frames verspreid over de clip: begin, midden en eind. Minder dan
        // drie maakt een vormverandering onzichtbaar, meer maakt de aanroep duur.
        const bruikbaar = Math.max(clipDuur, 1);
        const momenten = [bruikbaar * 0.15, bruikbaar * 0.5, bruikbaar * 0.85];
        const frameUrls: string[] = [];
        for (const [i, moment] of momenten.entries()) {
          const framePad = join(tmpdir(), `dframe-${randomUUID()}.jpg`);
          framePaden.push(framePad);
          await snijFrame(pad, moment, framePad);
          const opslagPad = `${userId}/dialogue/check-${randomUUID()}.jpg`;
          const { error: fErr } = await supabase.storage
            .from("scene-assets").upload(opslagPad, await readFile(framePad), { contentType: "image/jpeg", upsert: true });
          if (fErr) continue;
          frameUrls.push(supabase.storage.from("scene-assets").getPublicUrl(opslagPad).data.publicUrl);
          void i;
        }
        if (frameUrls.length === 0) return { mouthStart: start, oordeel: "onduidelijk", fouten: [] };

        // Het middelste frame draagt de sprekervraag; alle frames samen de
        // vraag of de beweging klopt.
        const middelste = frameUrls[Math.floor(frameUrls.length / 2)];
        const [sprekerOordeel, bewegingsFouten] = await Promise.all([
          isActieBeeld
            ? Promise.resolve({ spreker: "onduidelijk" as SprekerOordeel, fouten: [] as string[] })
            : beoordeelBeeld(middelste, spreker!, luisteraars),
          beoordeelBeweging(frameUrls, isActieBeeld ? actieTekst : `${spreker!.name} praat, de ander luistert`),
        ]);

        return {
          mouthStart: start,
          oordeel: sprekerOordeel.spreker,
          fouten: [...sprekerOordeel.fouten, ...bewegingsFouten],
        };
      } catch (e) {
        console.error("[dialogue-line] clipcontrole mislukt:", e);
        return { mouthStart: 0, oordeel: "onduidelijk", fouten: [] };
      } finally {
        if (pad) await rm(pad, { force: true }).catch(() => {});
        for (const f of framePaden) await rm(f, { force: true }).catch(() => {});
      }
    }

    let videoUrl = await maakClip();
    let mouthStart = 0;
    let clipOordeel: SprekerOordeel = "onduidelijk";
    let clipFouten: string[] = [];

    if (videoUrl) {
      besteed += CREDIT_COSTS.VIDEO_GENERATION;
      const eerste = await controleerClip(videoUrl);
      mouthStart = eerste.mouthStart;
      clipOordeel = eerste.oordeel;
      clipFouten = eerste.fouten;

      // Eén herkansing als het videomodel de rollen omdraaide OF er iets
      // onmogelijks gebeurt tussen de frames. Twee keer achter elkaar fout is
      // zeldzaam, en vaker proberen maakt de video vooral duur.
      if (clipOordeel === "verkeerd" || clipFouten.length > 0) {
        console.warn(`[dialogue-line] clip deugt niet (${clipOordeel}; ${clipFouten.join("; ")}), opnieuw`);
        await deductCredits(userId, CREDIT_COSTS.VIDEO_GENERATION, "Dialoogregel: clip opnieuw");
        const tweede = await maakClip();
        if (tweede) {
          const m2 = await controleerClip(tweede);
          // Alleen overnemen als het écht beter is; anders houden we de eerste.
          const beterSpreker = m2.oordeel !== "verkeerd";
          const beterBeeld = m2.fouten.length < clipFouten.length || clipOordeel === "verkeerd";
          if (beterSpreker && beterBeeld) {
            videoUrl = tweede;
            mouthStart = m2.mouthStart;
            clipOordeel = m2.oordeel;
            clipFouten = m2.fouten;
          }
        }
      }
    }

    if (!videoUrl) {
      // Stem en bronbeeld zijn er wel; alleen de clip niet. Die teruggeven zodat
      // opnieuw proberen niet nog eens voor beeld en stem betaalt.
      try { await addCredits(userId, CREDIT_COSTS.VIDEO_GENERATION, "Refund: dialoogclip mislukt"); } catch {}
      return NextResponse.json({ audioUrl, audioDuration, shotImageUrl, videoUrl: null, mouthStart: 0 });
    }

    // De uitkomst van beide poorten meesturen, zodat de pagina een regel kan
    // markeren waar we niet zeker van zijn in plaats van hem stil door te laten.
    const sprekerZeker = beeldOordeel !== "verkeerd" && clipOordeel !== "verkeerd";
    // Wat er na alle herkansingen nog steeds niet klopte, zodat de pagina die regel
    // kan markeren in plaats van hem stilzwijgend in de video te laten belanden.
    const beeldWaarschuwingen = [...new Set([...beeldFouten, ...clipFouten])].slice(0, 3);
    return NextResponse.json({
      audioUrl, audioDuration, shotImageUrl, videoUrl, mouthStart,
      sprekerZeker, beeldOordeel, clipOordeel, beeldPogingen, beeldWaarschuwingen,
    });
  } catch (err: unknown) {
    if (tmpVideo) await rm(tmpVideo, { force: true }).catch(() => {});
    await terugstorten();
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-line failed:", msg);
    return NextResponse.json({ error: "Dialoogregel maken mislukt", detail: msg }, { status: 500 });
  }
}
