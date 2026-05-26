import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

// Sinds de model-consolidatie draait video-generatie altijd op Seedance Lite.
// De Kling- en Seedance-Pro constants zijn weg; runway-status accepteert
// "seedance-lite" en mapt nog naar dezelfde fal-slug.
const SEEDANCE_LITE = "fal-ai/bytedance/seedance/v1/lite/image-to-video";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const authHeader = req.headers.get("authorization");
  let user = null;
  if (authHeader?.startsWith("Bearer ")) {
    const { data } = await supabase.auth.getUser(authHeader.slice(7));
    user = data.user;
  } else {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  const credit = await deductCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Video beweging genereren");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.VIDEO_GENERATION },
      { status: 402 }
    );
  }

  const { imageUrl, motionPrompt } = await req.json();
  const safePrompt = (motionPrompt || "Smooth cinematic camera movement").slice(0, 950);

  // Signed URL zodat externe services de afbeelding kunnen ophalen
  let promptImage: string = imageUrl;
  const storageMatch = imageUrl.match(/\/object\/(?:public|sign)\/scene-assets\/(.+?)(?:\?|$)/);
  if (storageMatch) {
    const { data: signed } = await supabase.storage
      .from("scene-assets")
      .createSignedUrl(storageMatch[1], 3600);
    if (signed?.signedUrl) promptImage = signed.signedUrl;
  }

  // Vanaf de model-refactor draait alle motion op Seedance Lite. De
  // videoModel-parameter is uit de UI verdwenen, maar de polling-route
  // (/api/runway-status) verwacht hem nog wel, dus we geven hem terug.
  const videoModel = "seedance-lite";

  try {
    const { request_id } = await fal.queue.submit(SEEDANCE_LITE, {
      input: {
        image_url:  promptImage,
        prompt:     safePrompt.slice(0, 2500),
        duration:   "5",
        resolution: "720p",
      },
    });
    return NextResponse.json({ taskId: request_id, videoModel });
  } catch (err: unknown) {
    // Refund bij submit failure (video is nooit gestart)
    try { await addCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Refund: video submit mislukt"); } catch {}
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-motion] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
