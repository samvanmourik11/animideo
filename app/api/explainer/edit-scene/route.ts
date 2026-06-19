import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
import {
  EXPLAINER_SCENE_SCHEMA,
  EXPLAINER_TEMPLATES,
  EXPLAINER_ILLUSTRATIONS,
  EXPLAINER_ICONS,
} from "@/lib/explainer/schema";
import { normalizeScene } from "@/lib/explainer/validate";
import type { ExplainerSpec } from "@/lib/explainer/spec";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId, sceneIndex, instruction } = (await req.json()) as {
      projectId?: string;
      sceneIndex?: number;
      instruction?: string;
    };
    if (!projectId || typeof sceneIndex !== "number" || !instruction?.trim()) {
      return NextResponse.json({ error: "projectId, sceneIndex en instruction vereist" }, { status: 400 });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("explainer_spec")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();
    const spec = project?.explainer_spec as ExplainerSpec | undefined;
    const scene = spec?.scenes?.[sceneIndex];
    if (!spec || !scene) return NextResponse.json({ error: "Scene niet gevonden" }, { status: 404 });

    const credit = await deductCredits(user.id, CREDIT_COSTS.SCRIPT_GENERATION, "Explainer scene edit");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.SCRIPT_GENERATION },
        { status: 402 }
      );
    }

    const system = `Je past EEN scene van een flat animated explainer aan op basis van een instructie van de gebruiker. Behoud alles wat niet gevraagd wordt om te wijzigen. Verzin geen cijfers die niet in de scene of instructie staan. Houd labels kort (1 tot 3 woorden) en de voice-over in het Nederlands.
Toegestane templates: ${EXPLAINER_TEMPLATES.join(", ")}.
Toegestane centrale illustraties: ${EXPLAINER_ILLUSTRATIONS.join(", ")}.
Toegestane icon-keywords: ${EXPLAINER_ICONS.join(", ")}.
title/outro hebben geen center of callouts. deviceMetrics/orbitIcons gebruiken 3 tot 6 callouts, boxesCallouts 2 tot 3. Output ALLEEN de aangepaste scene volgens het schema.`;

    const userMsg = `HUIDIGE SCENE (JSON):
${JSON.stringify(scene)}

INSTRUCTIE VAN DE GEBRUIKER:
"""
${instruction.trim().slice(0, 600)}
"""

Geef de volledige aangepaste scene terug.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: 1200,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "explainer_scene", strict: true, schema: EXPLAINER_SCENE_SCHEMA as unknown as Record<string, unknown> },
      },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const next = normalizeScene(parsed, sceneIndex);
    if (!next) return NextResponse.json({ error: "Geen bruikbare scene terug van AI" }, { status: 500 });
    next.id = scene.id; // behoud de scene-id

    const scenes = spec.scenes.map((s, i) => (i === sceneIndex ? next : s));
    const newSpec: ExplainerSpec = { ...spec, scenes };

    await supabase
      .from("projects")
      .update({ explainer_spec: newSpec })
      .eq("id", projectId)
      .eq("user_id", user.id);

    return NextResponse.json({ scene: next, spec: newSpec });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("explainer/edit-scene failed:", msg);
    return NextResponse.json({ error: "Scene aanpassen mislukt, probeer het opnieuw.", detail: msg }, { status: 500 });
  }
}
