import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { buildDialoguePrompt } from "@/lib/infographics/build-dialogue-prompt";
import {
  DIALOGUE_SPEC_SCHEMA,
  MAX_CAST,
  type DialogueSpec,
  type DialogueCastMember,
  type DialogueScene,
} from "@/lib/infographics/dialogue-schema";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";
import type { InfographicFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Body {
  topic?: string;
  text?: string;
  format?: InfographicFormat;
  targetSeconds?: number;
  language?: string;
  keepTerms?: string[];
  avoidTerms?: string[];
  tone?: string;
  angle?: string;
  styleId?: string;
  // De cast die de gebruiker uit zijn karakterbibliotheek heeft samengesteld.
  cast?: DialogueCastMember[];
  // Uit de opzet: waar het gesprek naartoe werkt en waar het omslaat.
  kern?: string | null;
  wending?: string | null;
  // Regie die voor élk beeld geldt. Hoort bij de spec zodat latere beelden
  // (twee-shots, losse regels) hem ook meekrijgen.
  illustrationBrief?: string | null;
}

// Een dialoogregel duurt gesproken ~4 seconden; daaruit leiden we het aantal
// regels, het aantal scènes en de richtlengte per regel af.
const WORDS_PER_SEC = 2.6;
const SECONDS_PER_LINE = 4;
const LINES_PER_SCENE = 3;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function planDialogue(targetSeconds: number) {
  const secs = clamp(Math.round(targetSeconds), 20, 240);
  const lineCount = clamp(Math.round(secs / SECONDS_PER_LINE), 4, 30);
  const sceneCount = clamp(Math.round(lineCount / LINES_PER_SCENE), 2, 10);
  const wordsPerLine = clamp(Math.round(SECONDS_PER_LINE * WORDS_PER_SEC), 6, 20);
  return { secs, lineCount, sceneCount, wordsPerLine };
}

// De AI-scènes opschonen: regels zonder bestaand cast-id weggooien, lege scènes
// verwijderen, id's invullen. De cast zelf komt van de gebruiker en blijft intact.
function sanitizeScenes(scenes: unknown, cast: DialogueCastMember[]): DialogueScene[] {
  const geldig = new Set(cast.map((c) => c.id));
  const opNaam = new Map(cast.map((c) => [c.name.toLowerCase(), c.id]));

  return (Array.isArray(scenes) ? (scenes as DialogueScene[]) : [])
    .map((s, i) => {
      const lines = (Array.isArray(s.lines) ? s.lines : [])
        .map((l) => {
          let cid = (l.characterId || "").trim();
          // Het model verwijst soms naar de naam in plaats van het id.
          if (!geldig.has(cid)) cid = opNaam.get(cid.toLowerCase()) ?? "";
          if (!geldig.has(cid)) return null;
          const text = (l.text || "").trim();
          if (!text) return null;
          return { characterId: cid, text, emotion: (l.emotion || "").trim() || "neutraal" };
        })
        .filter((l): l is NonNullable<typeof l> => l !== null);
      return { id: (s.id || "").trim() || `scene-${i}`, setting: (s.setting || "").trim(), lines };
    })
    .filter((s) => s.lines.length > 0);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Body;
    const rawText = (body.text ?? "").trim();
    if (!rawText) return NextResponse.json({ error: "Geen brontekst opgegeven" }, { status: 400 });

    const cast = (Array.isArray(body.cast) ? body.cast : []).slice(0, MAX_CAST);
    if (cast.length < 2) {
      return NextResponse.json({ error: "Kies minstens twee personages voor een gesprek" }, { status: 400 });
    }
    // Het portret is het identiteits-anker voor elk twee-shot; zonder heeft
    // renderen geen zin, dus liever nu een duidelijke fout.
    const zonderPortret = cast.filter((c) => !c.portraitUrl);
    if (zonderPortret.length) {
      return NextResponse.json(
        { error: `Deze personages hebben nog geen afbeelding: ${zonderPortret.map((c) => c.name).join(", ")}` },
        { status: 400 }
      );
    }

    const format = (body.format === "9:16" ? "9:16" : "16:9") as InfographicFormat;
    const language = body.language ?? "Nederlands";
    const { secs, lineCount, sceneCount, wordsPerLine } = planDialogue(body.targetSeconds ?? 60);

    // Alleen het script wordt hier gemaakt; beeld/stem/beweging volgen later.
    const credit = await deductCredits(user.id, CREDIT_COSTS.SCRIPT_GENERATION, "Dialoog-script genereren");
    if (!credit.success) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.SCRIPT_GENERATION },
        { status: 402 }
      );
    }

    const { system, user: userPrompt } = buildDialoguePrompt({
      topic: body.topic ?? "",
      rawText,
      format,
      cast,
      language,
      keepTerms: Array.isArray(body.keepTerms) ? body.keepTerms : [],
      avoidTerms: Array.isArray(body.avoidTerms) ? body.avoidTerms : [],
      tone: body.tone,
      angle: body.angle,
      kern: body.kern,
      wending: body.wending,
      targetSeconds: secs,
      lineCount,
      sceneCount,
      wordsPerLine,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.5,
      max_tokens: clamp(lineCount * 220 + 1200, 4000, 16000),
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "dialogue_spec", strict: true, schema: DIALOGUE_SPEC_SCHEMA as unknown as Record<string, unknown> },
      },
    });

    let ruw: { title?: string; scenes?: unknown };
    try {
      ruw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    } catch {
      return NextResponse.json({ error: "Ongeldige JSON van model" }, { status: 500 });
    }

    const scenes = sanitizeScenes(ruw.scenes, cast);
    if (scenes.length === 0) {
      return NextResponse.json({ error: "Geen bruikbare dialoog gegenereerd" }, { status: 500 });
    }

    const spec: DialogueSpec = {
      version: 1,
      title: (ruw.title || body.topic || "Naamloze dialoog").trim(),
      format,
      cast,
      scenes,
      mode: "dialogue",
      language,
      styleId: body.styleId ?? "flat-vector",
      illustrationBrief: body.illustrationBrief?.trim() || null,
      kern: body.kern?.trim() || null,
      wending: body.wending?.trim() || null,
      targetSeconds: secs,
      seed: Math.floor(Math.random() * 2_000_000),
    };
    return NextResponse.json({ spec });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generate-dialogue failed:", msg);
    return NextResponse.json({ error: "Dialoog genereren mislukt", detail: msg }, { status: 500 });
  }
}
