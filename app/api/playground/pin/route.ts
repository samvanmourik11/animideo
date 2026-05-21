import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Pin of ontpin een node als ingrediënt: een herbruikbare referentie die je
// kunt meegeven bij het genereren van nieuwe beelden, voor consistentie.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig, log opnieuw in" }, { status: 401 });

  const { projectId, nodeId, pinned } = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    nodeId?: string;
    pinned?: boolean;
  };
  if (!projectId || !nodeId || typeof pinned !== "boolean") {
    return NextResponse.json(
      { error: "projectId, nodeId en pinned zijn verplicht" },
      { status: 400 }
    );
  }

  const { data: node } = await supabase
    .from("playground_nodes")
    .select("id, user_id, project_id, meta")
    .eq("id", nodeId)
    .single();
  if (!node || node.user_id !== user.id || node.project_id !== projectId) {
    return NextResponse.json({ error: "Node niet gevonden" }, { status: 404 });
  }

  const newMeta = { ...(node.meta ?? {}), is_ingredient: pinned };
  const { data: updated, error } = await supabase
    .from("playground_nodes")
    .update({ meta: newMeta })
    .eq("id", nodeId)
    .select()
    .single();
  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Opslaan mislukt" }, { status: 500 });
  }

  return NextResponse.json({ node: updated });
}
