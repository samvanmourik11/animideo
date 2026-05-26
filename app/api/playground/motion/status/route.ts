import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { addCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

const SEEDANCE_LITE = "fal-ai/bytedance/seedance/v1/lite/image-to-video";

// Polling-endpoint voor playground-motion. Bij SUCCEEDED downloaden we de
// clip van fal, slaan we hem op in scene-assets en zetten we de video_url
// op het playground_node zodat de finalize-stap hem mee kan nemen.

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessie ongeldig, log opnieuw in" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId");
  const projectId = searchParams.get("projectId");
  const nodeId = searchParams.get("nodeId");
  if (!taskId || !projectId || !nodeId) {
    return NextResponse.json({ error: "taskId, projectId en nodeId zijn verplicht" }, { status: 400 });
  }

  try {
    const statusResult = (await fal.queue.status(SEEDANCE_LITE, {
      requestId: taskId,
      logs: false,
    })) as { status: string };

    if (statusResult.status === "IN_QUEUE" || statusResult.status === "IN_PROGRESS") {
      return NextResponse.json({ status: "RUNNING" });
    }
    if (statusResult.status !== "COMPLETED") {
      try {
        await addCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Refund: Seedance generatie mislukt");
      } catch {}
      return NextResponse.json({ status: "FAILED", error: `Seedance status: ${statusResult.status}` });
    }

    const result = await fal.queue.result(SEEDANCE_LITE, { requestId: taskId });
    const tempUrl = (result.data as { video?: { url: string } }).video?.url;
    if (!tempUrl) {
      try {
        await addCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Refund: geen video URL");
      } catch {}
      return NextResponse.json({ status: "FAILED", error: "Geen video URL van Seedance" });
    }

    // Download en opslaan in Supabase scene-assets (zelfde bucket als wizard)
    const videoRes = await fetch(tempUrl);
    if (!videoRes.ok) {
      return NextResponse.json({ status: "SUCCEEDED", videoUrl: tempUrl });
    }
    const videoBuffer = await videoRes.arrayBuffer();
    const fileName = `${user.id}/${projectId}/${nodeId}-playground.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("scene-assets")
      .upload(fileName, videoBuffer, { contentType: "video/mp4", upsert: true });
    if (uploadError) {
      return NextResponse.json({ status: "SUCCEEDED", videoUrl: tempUrl });
    }
    const { data: urlData } = supabase.storage.from("scene-assets").getPublicUrl(fileName);
    const finalUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    // Persisteer op de node zodat een refresh of nieuwe Afronden-poging de
    // clip terugvindt en niet opnieuw genereert.
    await supabase
      .from("playground_nodes")
      .update({ video_url: finalUrl })
      .eq("id", nodeId)
      .eq("user_id", user.id)
      .eq("project_id", projectId);

    return NextResponse.json({ status: "SUCCEEDED", videoUrl: finalUrl });
  } catch (err: unknown) {
    try {
      await addCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Refund: motion status fout");
    } catch {}
    const message = err instanceof Error ? err.message : String(err);
    console.error("[playground/motion/status] Fout:", message);
    return NextResponse.json({ status: "FAILED", error: message });
  }
}
