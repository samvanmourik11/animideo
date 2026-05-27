import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig, log opnieuw in" }, { status: 401 });

  const { projectId, imageUrl } = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    imageUrl?: string;
  };
  if (!projectId || !imageUrl) {
    return NextResponse.json({ error: "projectId en imageUrl zijn verplicht" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, mode, format")
    .eq("id", projectId)
    .single();
  if (!project || project.user_id !== user.id || project.mode !== "playground") {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }

  const aspectRatio = project.format === "9:16" ? "9:16" : "16:9";

  const { data: node, error: nodeErr } = await supabase
    .from("playground_nodes")
    .insert({
      project_id: projectId,
      user_id: user.id,
      parent_id: null,
      kind: "image",
      prompt: "Geüpload referentiebeeld",
      image_url: imageUrl,
      meta: { source: "upload", format: aspectRatio },
    })
    .select()
    .single();

  if (nodeErr || !node) {
    return NextResponse.json({ error: nodeErr?.message ?? "Node opslaan mislukt" }, { status: 500 });
  }

  return NextResponse.json({ node });
}
