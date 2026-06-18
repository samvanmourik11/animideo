import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { buildMotionPrompt } from "@/lib/infographics/motion-prompt";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

export const runtime = "nodejs";
export const maxDuration = 300;

// Image-to-video: animeert één stilstaande scene-illustratie tot een bewegende
// clip (zelfde model als de hoofd-app: Seedance Lite). Submit + poll in één
// request.
const SEEDANCE_LITE = "fal-ai/bytedance/seedance/v1/lite/image-to-video";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // `steer` = optionele bijsturing van de gebruiker (wat er wél/niet moet
    // bewegen). De vuistregel "verzin niets bij" zit vast in buildMotionPrompt;
    // `prompt` blijft geaccepteerd voor achterwaartse compatibiliteit.
    const { imageUrl, steer, prompt } = (await req.json()) as {
      imageUrl?: string;
      steer?: string;
      prompt?: string;
    };
    if (!imageUrl) return NextResponse.json({ error: "Geen beeld" }, { status: 400 });

    const credit = await deductCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Story scene animeren");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.VIDEO_GENERATION },
        { status: 402 }
      );
    }

    const safePrompt = buildMotionPrompt(steer ?? prompt);

    const { request_id } = await fal.queue.submit(SEEDANCE_LITE, {
      // camera_fixed: vergrendelt de camera, zodat het model het kader niet
      // herframet en daardoor de achtergrond/teksten/grafieken niet hertekent.
      input: { image_url: imageUrl, prompt: safePrompt, duration: "5", resolution: "720p", camera_fixed: true } as never,
    });

    // Pollen tot klaar (binnen maxDuration)
    const deadline = Date.now() + 280_000;
    while (Date.now() < deadline) {
      const st = (await fal.queue.status(SEEDANCE_LITE, { requestId: request_id, logs: false })) as { status: string };
      if (st.status === "COMPLETED") break;
      if (st.status !== "IN_QUEUE" && st.status !== "IN_PROGRESS") {
        return NextResponse.json({ error: `Animatie mislukt: ${st.status}` }, { status: 500 });
      }
      await sleep(1500);
    }

    const result = await fal.queue.result(SEEDANCE_LITE, { requestId: request_id });
    const tempVideoUrl = (result.data as { video?: { url: string } }).video?.url;
    if (!tempVideoUrl) return NextResponse.json({ error: "Geen video-URL ontvangen" }, { status: 500 });

    // De clip naar onze eigen bucket kopieren; fal-video-links verlopen.
    const videoUrl = await persistFalAssetSoft(supabase, user.id, tempVideoUrl, "video");
    return NextResponse.json({ videoUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("scene-motion failed:", msg);
    return NextResponse.json({ error: "Animeren mislukt", detail: msg }, { status: 500 });
  }
}
