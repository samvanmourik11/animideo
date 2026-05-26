import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

fal.config({ credentials: process.env.FAL_KEY });

// Hardcoded: gebruiker kiest geen model in playground, we draaien altijd
// Seedance Lite (snelste + goedkoopste image-to-video). De voice-over en
// editor verschijnen pas nadat álle shots een clip hebben.
const SEEDANCE_LITE = "fal-ai/bytedance/seedance/v1/lite/image-to-video";

const DEFAULT_MOTION_PROMPT =
  "Subtiele, natuurlijke camerabeweging: lichte zoom of pan, behoud onderwerp en compositie.";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessie ongeldig, log opnieuw in" }, { status: 401 });
  }

  const { projectId, nodeId, regenerate, motionPrompt } = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    nodeId?: string;
    regenerate?: boolean;
    motionPrompt?: string;
  };
  if (!projectId || !nodeId) {
    return NextResponse.json({ error: "projectId en nodeId zijn verplicht" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, mode, format")
    .eq("id", projectId)
    .single();
  if (!project || project.user_id !== user.id || project.mode !== "playground") {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }

  const { data: node } = await supabase
    .from("playground_nodes")
    .select("id, prompt, image_url, video_url, in_video, meta")
    .eq("id", nodeId)
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .single();
  if (!node) {
    return NextResponse.json({ error: "Beeld niet gevonden" }, { status: 404 });
  }
  if (!node.image_url) {
    return NextResponse.json({ error: "Geen brongegevens om uit te animeren" }, { status: 400 });
  }
  if (node.video_url && !regenerate) {
    // Idempotent: niet opnieuw genereren als de clip er al staat, tenzij de
    // gebruiker expliciet om regeneratie vraagt.
    return NextResponse.json({ alreadyHasVideo: true, videoUrl: node.video_url });
  }
  if (regenerate && node.video_url) {
    // Eerst de oude clip-URL wissen, anders ziet de UI per ongeluk nog de
    // oude beweging staan als de nieuwe submit faalt.
    await supabase
      .from("playground_nodes")
      .update({ video_url: null })
      .eq("id", nodeId)
      .eq("user_id", user.id)
      .eq("project_id", projectId);
  }

  const credit = await deductCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Playground: animatie");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.VIDEO_GENERATION },
      { status: 402 }
    );
  }

  try {
    // Signed URL als de bron in onze eigen bucket staat, zodat fal de bytes
    // kan ophalen ook al wordt de bucket op private gezet.
    let promptImage = node.image_url;
    const storageMatch = node.image_url.match(/\/object\/(?:public|sign)\/scene-assets\/(.+?)(?:\?|$)/);
    if (storageMatch) {
      const { data: signed } = await supabase.storage
        .from("scene-assets")
        .createSignedUrl(storageMatch[1], 3600);
      if (signed?.signedUrl) promptImage = signed.signedUrl;
    }

    // Prioriteit: door client meegegeven motionPrompt > eerder opgeslagen
    // meta.motion_prompt > standaardomschrijving. Beelden-prompt wordt erbij
    // gehaald als context voor Seedance, zodat het onderwerp consistent blijft.
    const metaPrompt =
      typeof (node.meta as Record<string, unknown> | null)?.motion_prompt === "string"
        ? ((node.meta as Record<string, unknown>).motion_prompt as string)
        : "";
    const userMotion = (motionPrompt ?? metaPrompt ?? "").toString().trim();
    const motionDirection = userMotion.length > 0 ? userMotion : DEFAULT_MOTION_PROMPT;
    const fullPrompt =
      (node.prompt ?? "").toString().trim().length > 0
        ? `${node.prompt}. ${motionDirection}`
        : motionDirection;

    // Persist de motion-prompt op de node zodat de UI hem volgende keer kan
    // voorvullen en een regenerate niet "random" voelt.
    if (userMotion.length > 0) {
      const existingMeta = (node.meta ?? {}) as Record<string, unknown>;
      await supabase
        .from("playground_nodes")
        .update({ meta: { ...existingMeta, motion_prompt: userMotion } })
        .eq("id", nodeId)
        .eq("user_id", user.id)
        .eq("project_id", projectId);
    }

    const { request_id } = await fal.queue.submit(SEEDANCE_LITE, {
      input: {
        image_url: promptImage,
        prompt: fullPrompt.slice(0, 2500),
        duration: "5",
        resolution: "720p",
      },
    });
    return NextResponse.json({ taskId: request_id });
  } catch (err: unknown) {
    try {
      await addCredits(user.id, CREDIT_COSTS.VIDEO_GENERATION, "Refund: playground motion submit mislukt");
    } catch {}
    const message = err instanceof Error ? err.message : String(err);
    console.error("[playground/motion/submit] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
