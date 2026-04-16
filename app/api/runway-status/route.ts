import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";

fal.config({ credentials: process.env.FAL_KEY });

const KLING_MODEL = "fal-ai/kling-video/v1.6/pro/image-to-video";

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  // Bearer token of cookie auth
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
  const taskId    = searchParams.get("taskId");
  const projectId = searchParams.get("projectId");
  const sceneId   = searchParams.get("sceneId");

  if (!taskId) return NextResponse.json({ error: "Missing taskId" }, { status: 400 });

  try {
    const statusResult = await fal.queue.status(KLING_MODEL, {
      requestId: taskId,
      logs: false,
    }) as { status: string };

    if (statusResult.status === "IN_QUEUE" || statusResult.status === "IN_PROGRESS") {
      return NextResponse.json({ status: "RUNNING" });
    }

    if (statusResult.status !== "COMPLETED") {
      console.error("[kling-status] Onverwachte status:", statusResult.status);
      return NextResponse.json({ status: "FAILED", error: `Kling status: ${statusResult.status}` });
    }

    // COMPLETED — haal resultaat op
    const result = await fal.queue.result(KLING_MODEL, { requestId: taskId });
    const data = result.data as { video?: { url: string } };
    const videoUrl = data.video?.url;

    if (!videoUrl) {
      return NextResponse.json({ status: "FAILED", error: "Geen video URL ontvangen van Kling" });
    }

    if (!projectId || !sceneId) {
      return NextResponse.json({ status: "SUCCEEDED", videoUrl });
    }

    // Download en opslaan in Supabase (Kling URLs verlopen)
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      return NextResponse.json({ status: "SUCCEEDED", videoUrl });
    }
    const videoBuffer = await videoRes.arrayBuffer();
    const fileName = `${user.id}/${projectId}/${sceneId}-video.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("scene-assets")
      .upload(fileName, videoBuffer, { contentType: "video/mp4", upsert: true });

    if (uploadError) {
      return NextResponse.json({ status: "SUCCEEDED", videoUrl });
    }

    const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(fileName);
    return NextResponse.json({ status: "SUCCEEDED", videoUrl: urlData.publicUrl });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kling-status] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
