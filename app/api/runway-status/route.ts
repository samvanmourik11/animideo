import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import RunwayML from "@runwayml/sdk";
import { createClient } from "@/lib/supabase/server";

fal.config({ credentials: process.env.FAL_KEY });

const runway     = new RunwayML({ apiKey: process.env.RUNWAY_API_KEY });
const KLING_PRO      = "fal-ai/kling-video/v1.6/pro/image-to-video";
const KLING_STANDARD = "fal-ai/kling-video/v1.6/standard/image-to-video";

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

    if (videoModel === "runway") {
      // ── Runway polling ────────────────────────────────────────
      const task = await runway.tasks.retrieve(taskId);

      if (task.status === "FAILED" || task.status === "CANCELLED") {
        const reason = (task as { failure?: string; failureCode?: string }).failure
          ?? (task as { failure?: string; failureCode?: string }).failureCode
          ?? task.status;
        console.error("[runway-status] Runway taak mislukt:", JSON.stringify(task));
        return NextResponse.json({ status: "FAILED", error: `Runway: ${reason}` });
      }
      if (task.status !== "SUCCEEDED") {
        return NextResponse.json({ status: "RUNNING" });
      }
      videoUrl = Array.isArray(task.output) ? task.output[0] : undefined;
      if (!videoUrl) return NextResponse.json({ status: "FAILED", error: "Geen video URL van Runway" });

    } else {
      // ── Kling polling (Pro of Standard) ──────────────────────
      const klingModel  = videoModel === "kling-standard" ? KLING_STANDARD : KLING_PRO;
      const statusResult = await fal.queue.status(klingModel, {
        requestId: taskId,
        logs: false,
      }) as { status: string };

      if (statusResult.status === "IN_QUEUE" || statusResult.status === "IN_PROGRESS") {
        return NextResponse.json({ status: "RUNNING" });
      }
      if (statusResult.status !== "COMPLETED") {
        return NextResponse.json({ status: "FAILED", error: `Kling status: ${statusResult.status}` });
      }

      const result = await fal.queue.result(klingModel, { requestId: taskId });
      videoUrl = (result.data as { video?: { url: string } }).video?.url;
      if (!videoUrl) return NextResponse.json({ status: "FAILED", error: "Geen video URL van Kling" });
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
