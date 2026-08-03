import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { buildMotionPrompt } from "@/lib/infographics/motion-prompt";
import { imageHasText } from "@/lib/infographics/detect-text";
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
const SEEDANCE_LITE = "fal-ai/bytedance/seedance/v1/lite/image-to-video";
// 1 eerste poging + 2 gratis herpogingen wanneer het kritische oog afkeurt.
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { imageUrl, steer, prompt, force, voiceover, illustration, title } = (await req.json()) as {
      imageUrl?: string;
      steer?: string;
      prompt?: string;
      force?: boolean;
      // Ankers voor het kritische oog (tekst + context van het verhaal).
      voiceover?: string;
      illustration?: string;
      title?: string;
    };
    if (!imageUrl) return NextResponse.json({ error: "Geen beeld" }, { status: 400 });

    // Tekst-garantie: beeld met leesbare tekst → niet animeren (video-modellen
    // vervormen tekst). Check vóór de creditafschrijving.
    if (!force && (await imageHasText(imageUrl))) {
      return NextResponse.json({ skipped: true, reason: "text" });
    }

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
    let acceptedUrl: string | null = null;
    let attempts = 0;
    let lastReason = "";

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      attempts = i + 1;
      const tempUrl = await generateClip(currentSteer);
      if (!tempUrl) continue; // deze poging mislukte technisch; probeer opnieuw

      // Kritisch oog: toets de clip STRENG tegen het vooraf bepaalde plan.
      const frames = await extractFrames(tempUrl, 4);
      const verdict = await critiqueMotion({ frames, voiceover, illustration, title, plan });
      lastReason = verdict.reason;
      if (verdict.ok) { acceptedUrl = tempUrl; break; }
      // Afgekeurd → nog voorzichtiger opnieuw, dichter bij het plan.
      currentSteer = verdict.betterSteer || currentSteer;
    }

    // Geen enkele poging goedgekeurd? Dan liever het STILLE beeld dan een slechte
    // animatie. De credit wordt teruggestort (er is geen bruikbare clip geleverd).
    if (!acceptedUrl) {
      try { await addCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Refund: animatie afgekeurd, stil gehouden"); } catch {}
      return NextResponse.json({ skipped: true, reason: "quality", attempts, detail: lastReason });
    }

    const videoUrl = await persistFalAssetSoft(supabase, user.id, acceptedUrl, "video");
    return NextResponse.json({ videoUrl, qc: { attempts, approved: true, reason: lastReason } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("scene-motion failed:", msg);
    return NextResponse.json({ error: "Animeren mislukt", detail: msg }, { status: 500 });
  }
}
