import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits } from "@/lib/credits";
import { videoModel as kiesModel, isVideoModel, STANDAARD_VIDEO_MODEL } from "@/lib/video-modellen";

fal.config({ credentials: process.env.FAL_KEY });

// Welk model het beeld laat bewegen, staat in video-modellen.ts. Seedance Lite is de
// standaard; wie daar niet uitkomt kan een ander model proberen (elk model beweegt
// anders). Elk model heeft zijn eigen prijs in credits.

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

  const { imageUrl, motionPrompt, videoModel: gevraagd } = await req.json();
  const model = kiesModel(isVideoModel(gevraagd) ? gevraagd : STANDAARD_VIDEO_MODEL);

  const credit = await deductCredits(user.id, model.credits, `Video beweging genereren (${model.naam})`);
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: model.credits },
      { status: 402 }
    );
  }

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

  try {
    const { request_id } = await fal.queue.submit(model.slug, {
      input: model.invoer({ image_url: promptImage, prompt: safePrompt.slice(0, 2500) }),
    });
    return NextResponse.json({ taskId: request_id, videoModel: model.id });
  } catch (err: unknown) {
    try { await addCredits(user.id, model.credits, "Refund: video submit mislukt"); } catch {}
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-motion] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
