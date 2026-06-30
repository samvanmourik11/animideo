// Maakt (of hergebruikt) een editor-project op basis van een Studio-project en
// geeft de timeline terug, zodat de laatste wizard-stap de nieuwe editor inline
// met de gemaakte video kan tonen.
//
// Idempotent: de client onthoudt het editor-project-id en stuurt het mee. Bestaat
// dat project nog, dan geven we het ongewijzigd terug (zo blijven bewerkingen die
// de gebruiker in de editor maakte behouden). Pas zonder geldig id bouwen we een
// verse timeline uit de Studio-assets.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseEditor } from "@/lib/editor/access";
import { buildEditorTimeline } from "@/lib/studio/build-editor-timeline";
import { RATIO_PRESETS, type Ratio } from "@/lib/editor/timeline";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  if (!canUseEditor(user.email)) {
    return NextResponse.json({ error: "Geen toegang tot de editor" }, { status: 403 });
  }

  const { projectId, editorProjectId } = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    editorProjectId?: string;
  };
  if (!projectId) return NextResponse.json({ error: "projectId vereist" }, { status: 400 });

  // Altijd een verse timeline uit het Studio-project bouwen, zodat de editor de
  // laatste render toont (incl. gesyncte opsommingen en op de stem gealigneerde
  // duraties). Bestaat er al een editor-project voor dit Studio-project, dan
  // werken we de timeline ervan bij i.p.v. een tweede project te maken.
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (error || !project) {
    return NextResponse.json({ error: "Studio-project niet gevonden" }, { status: 404 });
  }

  const timeline = buildEditorTimeline(project as Project);
  const ratio = timeline.ratio as Ratio;
  const { width, height } = RATIO_PRESETS[ratio];

  if (editorProjectId) {
    const { data: existing } = await supabase
      .from("editor_projects")
      .select("id, title")
      .eq("id", editorProjectId)
      .eq("user_id", user.id)
      .single();
    if (existing) {
      const { error: updErr } = await supabase
        .from("editor_projects")
        .update({ ratio, width, height, fps: timeline.fps, timeline })
        .eq("id", existing.id)
        .eq("user_id", user.id);
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
      return NextResponse.json({
        id: existing.id,
        userId: user.id,
        title: existing.title,
        ratio,
        timeline,
        reused: true,
      });
    }
  }

  const { data: created, error: insErr } = await supabase
    .from("editor_projects")
    .insert({
      user_id: user.id,
      title: `${(project as Project).title?.trim() || "Studio-project"} (Studio)`,
      ratio,
      width,
      height,
      fps: timeline.fps,
      timeline,
    })
    .select("id, title, ratio, timeline")
    .single();
  if (insErr || !created) {
    return NextResponse.json({ error: insErr?.message ?? "Kon editor-project niet aanmaken" }, { status: 500 });
  }

  return NextResponse.json({
    id: created.id,
    userId: user.id,
    title: created.title,
    ratio: created.ratio,
    timeline: created.timeline,
    reused: false,
  });
}
