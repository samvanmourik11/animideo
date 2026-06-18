import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { StorySpec } from "@/lib/infographics/story-schema";

export const runtime = "nodejs";

// Bewaart een story-spec op een project (mode 'story'). Zonder projectId maken we
// een nieuw project aan; met projectId werken we het bestaande bij (alleen als de
// ingelogde gebruiker de eigenaar is). Geeft het project-id terug zodat de
// pagina de URL kan bijwerken (?project=id) en verdere autosaves kan richten.
interface Body {
  projectId?: string;
  title?: string;
  spec?: StorySpec;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Body;
    if (!body.spec || !Array.isArray(body.spec.scenes)) {
      return NextResponse.json({ error: "Geen geldige story-spec" }, { status: 400 });
    }
    const title = (body.title ?? body.spec.title ?? "").trim() || "Naamloos verhaal";

    if (body.projectId) {
      // Bestaand project bijwerken; .eq op user_id borgt eigenaarschap.
      const { data, error } = await supabase
        .from("projects")
        .update({ title, story_spec: body.spec, status: "Draft" })
        .eq("id", body.projectId)
        .eq("user_id", user.id)
        .eq("mode", "story")
        .select("id")
        .single();
      if (error || !data) {
        return NextResponse.json({ error: error?.message ?? "Project niet gevonden" }, { status: 404 });
      }
      return NextResponse.json({ id: data.id });
    }

    // Nieuw story-project aanmaken.
    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        title,
        language: "Dutch",
        format: body.spec.format ?? "16:9",
        status: "Draft",
        mode: "story",
        story_spec: body.spec,
      })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Aanmaken mislukt" }, { status: 500 });
    }
    return NextResponse.json({ id: data.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("save-story failed:", msg);
    return NextResponse.json({ error: "Opslaan mislukt", detail: msg }, { status: 500 });
  }
}
