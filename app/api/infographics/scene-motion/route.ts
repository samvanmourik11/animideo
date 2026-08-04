import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { buildMotionPrompt, MICRO_MOTION_STEER } from "@/lib/infographics/motion-prompt";
import { planMotion } from "@/lib/infographics/motion-director";
import { extractFrames, critiqueMotion } from "@/lib/infographics/motion-critic";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

export const runtime = "nodejs";
export const maxDuration = 300;

// Image-to-video: animeert één stilstaande scene-illustratie tot een bewegende
// clip (Seedance Lite). Na elke animatie beoordeelt een "kritisch oog" of de
// beweging klopt (geen vervorming + passend bij voice-over/context); bij afkeuring
// wordt automatisch en GRATIS opnieuw geanimeerd (max 2 herpogingen).
//
// Harde regel: verschijnt er iets dat NIET in het bronbeeld staat (een hand die
// in beeld komt, een extra object of persoon), dan is die clip onbruikbaar — hij
// wordt nooit getoond, ook niet als "beste poging". De slotpoging valt dan terug
// op een geforceerde micro-beweging, die te klein is om iets bij te verzinnen, zodat
// de scène tóch beweegt. Lukt zelfs dat niet, dan blijft het beeld staan (met de
// subtiele camerabeweging uit de player/export) en gaat de credit terug.
// Een te grote of net-niet-perfecte beweging mag wél als beste poging.
const SEEDANCE_LITE = "fal-ai/bytedance/seedance/v1/lite/image-to-video";
// 1 eerste poging + 2 gratis herpogingen wanneer het kritische oog afkeurt.
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { imageUrl, steer, prompt, voiceover, illustration, title } = (await req.json()) as {
      imageUrl?: string;
      steer?: string;
      prompt?: string;
      // Ankers voor het kritische oog (tekst + context van het verhaal).
      voiceover?: string;
      illustration?: string;
      title?: string;
    };
    if (!imageUrl) return NextResponse.json({ error: "Geen beeld" }, { status: 400 });

    // Beelden met tekst worden NIET meer overgeslagen: ze werden dan stilgehouden
    // met een waarschuwing, en dat leverde dode scènes op. Het kritische oog is
    // hier de bewaker — het keurt af zodra tekst vervormt, morpht of verandert.

    // Credits worden ÉÉN keer afgerekend; de kwaliteits-herpogingen zijn gratis.
    const credit = await deductCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Story scene animeren");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.VIDEO_GENERATION },
        { status: 402 }
      );
    }

    // Eén animatie-poging: submit + poll → tijdelijke video-URL (of null).
    async function generateClip(steerText: string | undefined): Promise<string | null> {
      const safePrompt = buildMotionPrompt(steerText);
      const { request_id } = await fal.queue.submit(SEEDANCE_LITE, {
        input: { image_url: imageUrl, prompt: safePrompt, duration: "5", resolution: "720p", camera_fixed: true } as never,
      });
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        const st = (await fal.queue.status(SEEDANCE_LITE, { requestId: request_id, logs: false })) as { status: string };
        if (st.status === "COMPLETED") break;
        if (st.status !== "IN_QUEUE" && st.status !== "IN_PROGRESS") return null;
        await sleep(1500);
      }
      const result = await fal.queue.result(SEEDANCE_LITE, { requestId: request_id });
      return (result.data as { video?: { url: string } }).video?.url ?? null;
    }

    // VOORAF: bepaal exact de (minimale) beweging voor deze specifieke scène.
    const plan = await planMotion({ imageUrl, voiceover, illustration, title, steer: steer ?? prompt });
    let currentSteer = plan ?? steer ?? prompt;
    // "Schoon" = het kritische oog zag niets in beeld verschijnen dat niet in het
    // bronbeeld stond. Alleen zulke pogingen mogen getoond worden.
    let bestCleanUrl: string | null = null;
    let bestCleanScore = -1;
    let approved = false;
    let attempts = 0;
    let lastReason = "";
    let sawAddedElements = false;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      attempts = i + 1;
      // Slotpoging na eerdere hallucinaties: forceer de micro-beweging. Die is zo
      // klein dat het model niets kan bijverzinnen — zo houdt de scène tóch
      // beweging in plaats van een dood stilstaand beeld.
      if (i === MAX_ATTEMPTS - 1 && sawAddedElements) currentSteer = MICRO_MOTION_STEER;
      const tempUrl = await generateClip(currentSteer);
      if (!tempUrl) continue; // deze poging mislukte technisch; probeer opnieuw

      // Kritisch oog: toets STRENG tegen het plan (en het bronbeeld) én geef een score.
      const frames = await extractFrames(tempUrl, 4);
      const verdict = await critiqueMotion({ frames, voiceover, illustration, title, plan, sourceImageUrl: imageUrl });
      lastReason = verdict.reason;
      if (verdict.addedElements) {
        // Harde veto: er kwam iets bij (hand, persoon, object). Deze clip komt
        // NOOIT in beeld, ook niet als "beste poging".
        sawAddedElements = true;
        currentSteer = `${verdict.betterSteer || currentSteer} Absolutely nothing new may appear: no hand, finger, arm, person or object that is not already in the source image, and nothing enters the frame from any edge. If in doubt, keep the image almost completely still.`;
        continue;
      }
      // Onthoud de BESTE schone poging tot nu toe (op score).
      if (verdict.score > bestCleanScore) { bestCleanScore = verdict.score; bestCleanUrl = tempUrl; }
      if (verdict.ok) { approved = true; break; } // goedgekeurd → klaar
      // Afgekeurd → nog voorzichtiger opnieuw, dichter bij het plan.
      currentSteer = verdict.betterSteer || currentSteer;
    }

    // Geen enkele schone poging? Dan liever het STILLE beeld dan een animatie die
    // dingen verzint. De credit gaat terug: er is geen bruikbare clip geleverd.
    if (!bestCleanUrl) {
      try { await addCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Refund: animatie voegde elementen toe, stil gehouden"); } catch {}
      return NextResponse.json({
        skipped: true,
        reason: sawAddedElements ? "added" : "quality",
        attempts,
        detail: lastReason,
      });
    }
    const bestUrl = bestCleanUrl;

    const videoUrl = await persistFalAssetSoft(supabase, user.id, bestUrl, "video");
    return NextResponse.json({ videoUrl, qc: { attempts, approved, reason: lastReason } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("scene-motion failed:", msg);
    return NextResponse.json({ error: "Animeren mislukt", detail: msg }, { status: 500 });
  }
}
