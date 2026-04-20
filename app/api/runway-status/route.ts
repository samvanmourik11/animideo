import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { addCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

const KLING_PRO          = "fal-ai/kling-video/v1.6/pro/image-to-video";
const KLING_STANDARD     = "fal-ai/kling-video/v1.6/standard/image-to-video";
const KLING_PRO_T2V      = "fal-ai/kling-video/v1.6/pro/text-to-video";
const KLING_STANDARD_T2V = "fal-ai/kling-video/v1.6/standard/text-to-video";
const SEEDANCE_PRO       = "fal-ai/bytedance/seedance/v1/pro/image-to-video";
const SEEDANCE_LITE      = "fal-ai/bytedance/seedance/v1/lite/image-to-video";
const SEEDANCE_PRO_T2V   = "fal-ai/bytedance/seedance/v1/pro/text-to-video";
const SEEDANCE_LITE_T2V  = "fal-ai/bytedance/seedance/v1/lite/text-to-video";

export async function GET(req: NextRequest) {
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const taskId     = searchParams.get("taskId");
  const projectId  = searchParams.get("projectId");
  const sceneId    = searchParams.get("sceneId");
  const videoModel = searchParams.get("videoModel") ?? "kling-pro";

  if (!taskId) return NextResponse.json({ error: "Missing taskId" }, { status: 400 });

  try {
    let videoUrl: string | undefined;

    // ── Video polling (Kling + Seedance varianten) ───────────
    const klingModel =
      videoModel === "kling-standard"     ? KLING_STANDARD :
      videoModel === "kling-standard-t2v" ? KLING_STANDARD_T2V :
      videoModel === "kling-pro-t2v"      ? KLING_PRO_T2V :
      videoModel === "seedance-pro"       ? SEEDANCE_PRO :
      videoModel === "seedance-lite"      ? SEEDANCE_LITE :
      videoModel === "seedance-pro-t2v"   ? SEEDANCE_PRO_T2V :
      videoModel === "seedance-lite-t2v"  ? SEEDANCE_LITE_T2V :
      KLING_PRO;
    const statusResult = await fal.queue.status(klingModel, {
      requestId: taskId,
      logs: false,
    }) as { status: string };

    if (statusResult.status === "IN_QUEUE" || statusResult.status === "IN_PROGRESS") {
      return NextResponse.json({ status: "RUNNING" });
    }
    if (statusResult.status !== "COMPLETED") {
      // Refund: video generatie is definitief mislukt
      try { await addCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Refund: Kling generatie mislukt"); } catch {}
      return NextResponse.json({ status: "FAILED", error: `Kling status: ${statusResult.status}` });
    }

    const result = await fal.queue.result(klingModel, { requestId: taskId });
    videoUrl = (result.data as { video?: { url: string } }).video?.url;
    if (!videoUrl) {
      try { await addCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Refund: geen video URL"); } catch {}
      return NextResponse.json({ status: "FAILED", error: "Geen video URL van Kling" });
    }

    if (!projectId || !sceneId) {
      return NextResponse.json({ status: "SUCCEEDED", videoUrl });
    }

    // Download en opslaan in Supabase
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) return NextResponse.json({ status: "SUCCEEDED", videoUrl });

    const videoBuffer = await videoRes.arrayBuffer();
    const fileName    = `${user.id}/${projectId}/${sceneId}-video.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("scene-assets")
      .upload(fileName, videoBuffer, { contentType: "video/mp4", upsert: true });

    if (uploadError) return NextResponse.json({ status: "SUCCEEDED", videoUrl });

    const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(fileName);
    return NextResponse.json({ status: "SUCCEEDED", videoUrl: urlData.publicUrl });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[runway-status] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
