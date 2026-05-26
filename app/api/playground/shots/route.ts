import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Acties op een shot in de eindmontage van een playground-project.
// Eén endpoint, vier acties, gekozen op `action` zodat de UI niet hoeft te
// jongleren met meerdere URLs voor wat conceptueel één toolbox is.
//
//   add      voeg een node toe aan de eindmontage (in_video=true, achteraan)
//   remove   haal een node uit de eindmontage (in_video=false)
//   reorder  geef een nieuwe volgorde van nodeIds (sort_order 0..n)
//   update   pas voiceover-tekst, duur en/of overgang aan op één node

type Action = "add" | "remove" | "reorder" | "update";

const ALLOWED_TRANSITIONS = new Set([
  "cut",
  "fade",
  "dissolve",
  "slide-left",
  "slide-right",
  "zoom-in",
]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessie ongeldig, log opnieuw in" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: Action;
    projectId?: string;
    nodeId?: string;
    nodeIds?: string[];
    voiceover_text?: string | null;
    duration_sec?: number | null;
    transition_out?: string | null;
  };
  const { action, projectId } = body;

  if (!projectId || !action) {
    return NextResponse.json({ error: "projectId en action zijn verplicht" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, mode")
    .eq("id", projectId)
    .single();
  if (!project || project.user_id !== user.id || project.mode !== "playground") {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }

  if (action === "add") {
    if (!body.nodeId) {
      return NextResponse.json({ error: "nodeId is verplicht" }, { status: 400 });
    }
    const { data: existing } = await supabase
      .from("playground_nodes")
      .select("sort_order")
      .eq("project_id", projectId)
      .eq("in_video", true)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (existing?.sort_order ?? -1) + 1;

    const { data: node, error } = await supabase
      .from("playground_nodes")
      .update({ in_video: true, sort_order: nextOrder })
      .eq("id", body.nodeId)
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .select()
      .single();
    if (error || !node) {
      return NextResponse.json({ error: error?.message ?? "Toevoegen mislukt" }, { status: 500 });
    }
    return NextResponse.json({ node });
  }

  if (action === "remove") {
    if (!body.nodeId) {
      return NextResponse.json({ error: "nodeId is verplicht" }, { status: 400 });
    }
    const { data: node, error } = await supabase
      .from("playground_nodes")
      .update({ in_video: false, sort_order: null })
      .eq("id", body.nodeId)
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .select()
      .single();
    if (error || !node) {
      return NextResponse.json({ error: error?.message ?? "Verwijderen mislukt" }, { status: 500 });
    }
    return NextResponse.json({ node });
  }

  if (action === "reorder") {
    const ids = Array.isArray(body.nodeIds) ? body.nodeIds.filter((s): s is string => !!s) : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "nodeIds is verplicht" }, { status: 400 });
    }
    // Eén update per node. Voor 20 shots is dat verwaarloosbaar.
    for (let i = 0; i < ids.length; i++) {
      await supabase
        .from("playground_nodes")
        .update({ sort_order: i, in_video: true })
        .eq("id", ids[i])
        .eq("user_id", user.id)
        .eq("project_id", projectId);
    }
    const { data: nodes } = await supabase
      .from("playground_nodes")
      .select("*")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    return NextResponse.json({ nodes: nodes ?? [] });
  }

  if (action === "update") {
    if (!body.nodeId) {
      return NextResponse.json({ error: "nodeId is verplicht" }, { status: 400 });
    }
    const patch: Record<string, unknown> = {};
    if (body.voiceover_text !== undefined) patch.voiceover_text = body.voiceover_text;
    if (body.duration_sec !== undefined) {
      const n = body.duration_sec;
      patch.duration_sec = n === null ? null : Math.max(1, Math.min(30, Number(n)));
    }
    if (body.transition_out !== undefined) {
      if (body.transition_out === null) patch.transition_out = null;
      else if (ALLOWED_TRANSITIONS.has(body.transition_out)) patch.transition_out = body.transition_out;
      else return NextResponse.json({ error: "Onbekende overgang" }, { status: 400 });
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Niets om te updaten" }, { status: 400 });
    }

    const { data: node, error } = await supabase
      .from("playground_nodes")
      .update(patch)
      .eq("id", body.nodeId)
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .select()
      .single();
    if (error || !node) {
      return NextResponse.json({ error: error?.message ?? "Bijwerken mislukt" }, { status: 500 });
    }
    return NextResponse.json({ node });
  }

  return NextResponse.json({ error: "Onbekende action" }, { status: 400 });
}
