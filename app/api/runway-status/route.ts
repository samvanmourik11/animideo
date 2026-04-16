import { NextRequest, NextResponse } from "next/server";
import RunwayML from "@runwayml/sdk";
import { createClient } from "@/lib/supabase/server";

const runway = new RunwayML({ apiKey: process.env.RUNWAY_API_KEY });

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const taskId    = searchParams.get("taskId");
  const projectId = searchParams.get("projectId");
  const sceneId   = searchParams.get("sceneId");

  if (!taskId) return NextResponse.json({ error: "Missing taskId" }, { status: 400 });

  try {
    const task = await runway.tasks.retrieve(taskId);

    if (task.status === "FAILED" || task.status === "CANCELLED") {
      return NextResponse.json({ status: "FAILED", error: "Runway generatie mislukt" });
    }

    if (task.status !== "SUCCEEDED") {
      return NextResponse.json({ status: "RUNNING" });
    }

    // SUCCEEDED — haal video URL op
    const videoUrl: string | undefined = Array.isArray(task.output) ? task.output[0] : undefined;

    if (!videoUrl) {
      return NextResponse.json({ status: "FAILED", error: "Geen video URL ontvangen van Runway" });
    }

    if (!projectId || !sceneId) {
      return NextResponse.json({ status: "SUCCEEDED", videoUrl });
    }

    // Download en opslaan in Supabase voor permanente toegang
    const videoRes = await fetch(videoUrl);
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
    console.error("[runway-status] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
