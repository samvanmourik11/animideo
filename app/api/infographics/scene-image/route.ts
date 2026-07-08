import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImageWithStyle, editIllustration, cleanupIllustration } from "@/lib/image-gen";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { buildIllustrationPrompt, STYLE_MATCH_ANCHOR, brandPaletteHint } from "@/lib/infographics/story-style";
import { refineEditInstruction } from "@/lib/infographics/refine-edit";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
import type { InfographicFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Eén scene-illustratie (her)maken:
// - mode "generate": volledig opnieuw genereren uit de (aangepaste) briefing.
// - mode "edit": gericht aanpassen met behoud van compositie/stijl, bijv.
//   "verwijder het prijskaartje" of "maak het dak blauw".
interface Body {
  mode?: "generate" | "edit";
  illustration?: string;
  sourceImageUrl?: string;
  instruction?: string;
  format?: InfographicFormat;
  // Consistentie: vaste verhaal-seed + anker-beeld (scene 0) als stijl-referentie,
  // zodat een geregenereerde scene bij de rest van de set blijft passen.
  seed?: number | null;
  anchorImageUrl?: string | null;
  // Zacht huisstijl-palet (hex) voor het beeld.
  brandColors?: { primary?: string; accent?: string };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Body;
    const format = (body.format === "9:16" ? "9:16" : "16:9") as InfographicFormat;

    const credit = await deductCredits(user.id, CREDIT_COSTS.IMAGE_GENERATION, "Story scene-beeld");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.IMAGE_GENERATION },
        { status: 402 }
      );
    }

    if (body.mode === "edit") {
      if (!body.sourceImageUrl) return NextResponse.json({ error: "Geen bronafbeelding" }, { status: 400 });
      if (!body.instruction?.trim()) return NextResponse.json({ error: "Geen aanpassing opgegeven" }, { status: 400 });
      // Vage/korte wens eerst omzetten naar een precieze, visuele instructie —
      // dat verhoogt de slagingskans van het beeld-edit-model flink.
      const refined = await refineEditInstruction(body.instruction.trim(), body.illustration);
      const result = await editIllustration(body.sourceImageUrl, refined, format);
      const imageUrl = await persistFalAssetSoft(supabase, user.id, result.imageUrl, "image");
      return NextResponse.json({ imageUrl });
    }

    // default: generate
    if (!body.illustration?.trim()) return NextResponse.json({ error: "Geen briefing opgegeven" }, { status: 400 });
    const anchor = body.anchorImageUrl?.trim() || null;
    const paletteHint = brandPaletteHint(body.brandColors?.primary, body.brandColors?.accent);
    const extraContext = [paletteHint, anchor ? STYLE_MATCH_ANCHOR : ""].filter(Boolean).join(" ").trim() || undefined;
    const result = await generateImageWithStyle({
      prompt: buildIllustrationPrompt(body.illustration),
      format,
      visualStyle: null,
      seed: typeof body.seed === "number" ? body.seed : undefined,
      ingredientUrls: anchor ? [anchor] : undefined,
      extraContext,
    });
    // Tweede pass: sfeer-decoratie wegvegen (zie cleanupIllustration). Faalt het,
    // dan val terug op het ruwe beeld.
    let cleanUrl = result.imageUrl;
    try {
      cleanUrl = (await cleanupIllustration(result.imageUrl, format)).imageUrl;
    } catch (e) {
      console.error("[scene-image] cleanup mislukt, ruw beeld behouden:", e);
    }
    const imageUrl = await persistFalAssetSoft(supabase, user.id, cleanUrl, "image");
    return NextResponse.json({ imageUrl });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("scene-image failed:", msg);
    return NextResponse.json({ error: "Beeld bijwerken mislukt", detail: msg }, { status: 500 });
  }
}
