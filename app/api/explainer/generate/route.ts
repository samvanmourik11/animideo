import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
import { generateExplainerSpec } from "@/lib/explainer/generate";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId, targetSeconds } = (await req.json()) as { projectId?: string; targetSeconds?: number };
    if (!projectId) return NextResponse.json({ error: "projectId vereist" }, { status: 400 });

    const { data: project } = await supabase
      .from("projects")
      .select("title, notes, format")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();
    if (!project) return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });

    const source = (project.notes ?? "").trim();
    if (source.length < 30) {
      return NextResponse.json({ error: "Voeg eerst wat meer broninfo of een script toe." }, { status: 400 });
    }

    const credit = await deductCredits(user.id, CREDIT_COSTS.SCRIPT_GENERATION, "Explainer spec");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.SCRIPT_GENERATION },
        { status: 402 }
      );
    }

    const format = project.format === "9:16" ? "9:16" : "16:9";
    const spec = await generateExplainerSpec({ source, format, language: "Nederlands", targetSeconds });
    if (project.title) spec.title = project.title;

    await supabase
      .from("projects")
      .update({ explainer_spec: spec, status: "ScriptReady" })
      .eq("id", projectId)
      .eq("user_id", user.id);

    return NextResponse.json({ spec });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("explainer/generate failed:", msg);
    return NextResponse.json({ error: "Explainer genereren mislukt, probeer het opnieuw.", detail: msg }, { status: 500 });
  }
}
