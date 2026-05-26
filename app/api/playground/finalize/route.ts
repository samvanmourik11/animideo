import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Scene, TransitionType } from "@/lib/types";

// Fase 4: zet de in_video-nodes van een playground-project om in een
// klassiek `project.scenes`-array, zodat de bestaande Step6Editor (timeline,
// transitions, ffmpeg-export) hetzelfde project kan renderen als een wizard-
// project. Voice-over en bg-muziek worden door de client geregeld via
// `/api/generate-voice` zodat we de bestaande pipeline niet hoeven dupliceren.

const ALLOWED_TRANSITIONS: TransitionType[] = [
  "cut",
  "fade",
  "dissolve",
  "slide-left",
  "slide-right",
  "zoom-in",
];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessie ongeldig, log opnieuw in" }, { status: 401 });
  }

  const { projectId } = (await req.json().catch(() => ({}))) as { projectId?: string };
  if (!projectId) {
    return NextResponse.json({ error: "projectId is verplicht" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, mode, status")
    .eq("id", projectId)
    .single();
  if (!project || project.user_id !== user.id || project.mode !== "playground") {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }

  const { data: rawNodes } = await supabase
    .from("playground_nodes")
    .select("id, kind, prompt, image_url, video_url, in_video, sort_order, voiceover_text, duration_sec, transition_out")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .eq("in_video", true)
    .order("sort_order", { ascending: true });

  const nodes = (rawNodes ?? []).filter((n) => n.image_url || n.video_url);
  if (nodes.length === 0) {
    return NextResponse.json(
      { error: "Voeg eerst minstens één beeld toe aan de video voordat je kunt afronden." },
      { status: 400 }
    );
  }

  const scenes: Scene[] = nodes.map((n, i) => {
    const trans = ALLOWED_TRANSITIONS.includes(n.transition_out as TransitionType)
      ? (n.transition_out as TransitionType)
      : "cut";
    return {
      id: n.id,
      number: i + 1,
      duration: Math.max(1, Math.min(30, Number(n.duration_sec) || 4)),
      voiceover_text: (n.voiceover_text ?? "").toString(),
      image_prompt: (n.prompt ?? "").toString(),
      motion_prompt: "",
      image_url: n.image_url ?? null,
      video_url: n.video_url ?? null,
      canvas_json: null,
      transition_out: trans,
    };
  });

  // Voor de status: zodra alle shots een video_url hebben staan we op
  // MotionReady, anders ImagesReady. Behoud Done als die al gezet was.
  const allHaveVideo = scenes.every((s) => !!s.video_url);
  const nextStatus =
    project.status === "Done" ? "Done" : allHaveVideo ? "MotionReady" : "ImagesReady";

  const { data: updated, error } = await supabase
    .from("projects")
    .update({ scenes, status: nextStatus })
    .eq("id", projectId)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Opslaan mislukt" }, { status: 500 });
  }

  return NextResponse.json({ project: updated });
}
