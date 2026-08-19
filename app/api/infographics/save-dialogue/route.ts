import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { DialogueSpec } from "@/lib/infographics/dialogue-schema";

export const runtime = "nodejs";

// Bewaart een dialoog-spec op een project (mode 'dialogue'). Zonder projectId
// maken we een nieuw project; met projectId werken we het bestaande bij (alleen de
// eigenaar). Geeft het project-id terug zodat de pagina de URL kan bijwerken.
interface Body {
  projectId?: string;
  title?: string;
  spec?: DialogueSpec;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Body;
    if (!body.spec || !Array.isArray(body.spec.scenes) || !Array.isArray(body.spec.cast)) {
      return NextResponse.json({ error: "Geen geldige dialoog-spec" }, { status: 400 });
    }
    const title = (body.title ?? body.spec.title ?? "").trim() || "Naamloze dialoog";

    if (body.projectId) {
      const { data, error } = await supabase
        .from("projects")
        .update({ title, story_spec: body.spec, status: "Draft" })
        .eq("id", body.projectId)
        .eq("user_id", user.id)
        .eq("mode", "dialogue")
        .select("id")
        .single();
      if (error || !data) {
        return NextResponse.json({ error: error?.message ?? "Project niet gevonden" }, { status: 404 });
      }
      return NextResponse.json({ id: data.id });
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        title,
        language: "Dutch",
        format: body.spec.format ?? "16:9",
        status: "Draft",
        mode: "dialogue",
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
    console.error("save-dialogue failed:", msg);
    return NextResponse.json({ error: "Opslaan mislukt", detail: msg }, { status: 500 });
  }
}
