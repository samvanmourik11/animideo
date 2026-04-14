import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RUNWAY_BASE = "https://api.dev.runwayml.com/v1";
const RUNWAY_VERSION = "2024-11-06";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId");
  const projectId = searchParams.get("projectId");
  const sceneId = searchParams.get("sceneId");

  if (!taskId) return NextResponse.json({ error: "Missing taskId" }, { status: 400 });

  const res = await fetch(`${RUNWAY_BASE}/tasks/${taskId}`, {
    headers: {
      "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`,
      "X-Runway-Version": RUNWAY_VERSION,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Runway API error: ${err}` }, { status: res.status });
  }

  const task = await res.json();
  // task.status: PENDING | RUNNING | SUCCEEDED | FAILED
  const status = task.status as string;

  if (status === "FAILED") {
    return NextResponse.json({ status: "FAILED", error: task.failure ?? "Runway generation failed" });
  }

  if (status !== "SUCCEEDED") {
    return NextResponse.json({ status });
  }

  // Download video and store in Supabase for permanent access
  const runwayVideoUrl: string = task.output?.[0];
  if (!runwayVideoUrl) {
    return NextResponse.json({ status: "FAILED", error: "No output URL from Runway" });
  }

  if (!projectId || !sceneId) {
    // Return Runway URL directly if no storage info provided
    return NextResponse.json({ status: "SUCCEEDED", videoUrl: runwayVideoUrl });
  }

  const videoRes = await fetch(runwayVideoUrl);
  const videoBuffer = await videoRes.arrayBuffer();
  const fileName = `${user.id}/${projectId}/${sceneId}-video.mp4`;

  const { error: uploadError } = await supabase.storage
    .from("scene-assets")
    .upload(fileName, videoBuffer, { contentType: "video/mp4", upsert: true });

  if (uploadError) {
    // Return Runway URL as fallback
    return NextResponse.json({ status: "SUCCEEDED", videoUrl: runwayVideoUrl });
  }

  const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(fileName);
  return NextResponse.json({ status: "SUCCEEDED", videoUrl: urlData.publicUrl });
}
