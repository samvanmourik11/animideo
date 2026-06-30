import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
import { buildInfographicPrompt } from "@/lib/infographics/build-prompt";
import { INFOGRAPHIC_SPEC_SCHEMA } from "@/lib/infographics/spec-schema";
import { validateAndNormalizeSpec } from "@/lib/infographics/validate-spec";
import type { InfographicFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const credit = await deductCredits(user.id, CREDIT_COSTS.SCRIPT_GENERATION, "Infographic spec");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.SCRIPT_GENERATION },
        { status: 402 }
      );
    }

    const { projectId } = (await req.json()) as { projectId: string };

    const { data: project } = await supabase
      .from("projects")
      .select("title, notes, format, language, brand_kit_id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();
    if (!project) return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });

    const rawText = (project.notes ?? "").trim();
    if (!rawText) {
      return NextResponse.json({ error: "Geen tekst/data gevonden in het project" }, { status: 400 });
    }

    // Brandkit voor merkkleuren, tone en logo (optioneel)
    let brand: {
      name?: string | null;
      toneOfVoice?: string | null;
      primary?: string | null;
      secondary?: string | null;
      accent?: string | null;
      background?: string | null;
      textColor?: string | null;
    } | null = null;
    let logoUrl: string | null = null;
    if (project.brand_kit_id) {
      const { data: bk } = await supabase
        .from("brand_kits")
        .select("name, tone_of_voice, colors, logo_url")
        .eq("id", project.brand_kit_id)
        .eq("user_id", user.id)
        .single();
      if (bk) {
        const colors = (bk.colors ?? {}) as Record<string, string>;
        brand = {
          name: bk.name,
          toneOfVoice: bk.tone_of_voice,
          primary: colors.primary ?? null,
          secondary: colors.secondary ?? null,
          accent: colors.accent ?? null,
          background: colors.background ?? null,
        };
        logoUrl = bk.logo_url ?? null;
      }
    }

    const format = (project.format === "16:9" ? "16:9" : "9:16") as InfographicFormat;
    const { system, user: userPrompt } = buildInfographicPrompt({
      topic: project.title ?? "",
      rawText,
      format,
      brand,
      language: project.language ?? "Nederlands",
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: 4000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "infographic_spec",
          strict: true,
          schema: INFOGRAPHIC_SPEC_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Ongeldige JSON van model", raw }, { status: 500 });
    }

    let spec;
    try {
      spec = validateAndNormalizeSpec(parsed, {
        fallbackTitle: project.title ?? "Infographic",
        fallbackFormat: format,
        brand: brand ?? undefined,
        logoUrl,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg, raw: parsed }, { status: 500 });
    }

    await supabase
      .from("projects")
      .update({ infographic_spec: spec, status: "ScriptReady" })
      .eq("id", projectId)
      .eq("user_id", user.id);

    return NextResponse.json({ spec });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generate-spec failed:", msg);
    return NextResponse.json(
      { error: "Infographic genereren mislukt, probeer het opnieuw.", detail: msg },
      { status: 500 }
    );
  }
}
