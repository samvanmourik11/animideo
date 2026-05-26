import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Project-niveau storyboard-instellingen voor een playground-project:
// stem voor voice-over, achtergrondmuziek-URL en outro-tekst.
// Hergebruikt bestaande velden uit `projects` zodat fase 4 (afrond/export)
// naadloos kan aansluiten op de bestaande render-pipeline.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessie ongeldig, log opnieuw in" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    selected_voice?: string | null;
    bg_music_url?: string | null;
    outro_text?: string | null;
  };
  if (!body.projectId) {
    return NextResponse.json({ error: "projectId is verplicht" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, mode, outro_contact")
    .eq("id", body.projectId)
    .single();
  if (!project || project.user_id !== user.id || project.mode !== "playground") {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  if (body.selected_voice !== undefined) patch.selected_voice = body.selected_voice;
  if (body.bg_music_url !== undefined) patch.bg_music_url = body.bg_music_url;
  if (body.outro_text !== undefined) {
    // Outro-tekst leeft in outro_contact.tagline, daar pakt de render-pipeline het al op.
    const existingContact = (project.outro_contact ?? {}) as Record<string, unknown>;
    patch.outro_contact = { ...existingContact, tagline: body.outro_text ?? "" };
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Niets om te updaten" }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", body.projectId)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Opslaan mislukt" }, { status: 500 });
  }
  return NextResponse.json({ project: updated });
}
