import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import {
  HERZIE_DRAAIBOEK_TOOL,
  HERZIE_SCENE_TOOL,
  buildHerzieSysteem,
  toonDraaiboek,
} from "@/lib/infographics/dialogue-chat-tools";
import { STORY_STYLE_PRESETS } from "@/lib/infographics/story-style";
import {
  ACTIE_MIN_SEC, ACTIE_MAX_SEC, ACTIE_STANDAARD_SEC,
  type DialogueSpec, type DialogueScene, type DialogueLine,
} from "@/lib/infographics/dialogue-schema";

export const runtime = "nodejs";
export const maxDuration = 120;

// Aanpassen van een BESTAAND draaiboek — voor het hele verhaal of voor één scène.
//
// Waarom dit een aparte route is en niet de gewone chat: de assistent moet weten
// wat er al staat. Zonder de spec mee te sturen begon hij bij elke aanpassing
// opnieuw en beantwoordde "Marc moet afsluiten met het telefoonnummer" met
// "waar moet het gesprek over gaan?".
//
// En net zo belangrijk: al gerenderde clips blijven behouden voor regels die
// ongewijzigd zijn. Eén zin bijschaven mag niet betekenen dat je de hele video
// opnieuw moet betalen.

interface Body {
  spec?: DialogueSpec;
  instructie?: string;
  /** Alleen deze scène herzien. Weglaten = het hele draaiboek. */
  sceneIndex?: number;
}

const STIJLEN = new Set(STORY_STYLE_PRESETS.map((s) => s.id));

/**
 * Neemt de gerenderde onderdelen van de oude regel over als de inhoud niet
 * veranderd is. De clip hoort bij deze spreker en deze zin; verandert een van
 * beide, dan klopt de clip niet meer en moet hij opnieuw.
 */
function behoudRendering(nieuw: DialogueLine, oud: DialogueLine[]): DialogueLine {
  const match = oud.find((o) =>
    o.characterId === nieuw.characterId &&
    (nieuw.kind === "actie"
      ? o.kind === "actie" && (o.actie ?? "").trim() === (nieuw.actie ?? "").trim() &&
        o.text.trim() === nieuw.text.trim() && o.seconden === nieuw.seconden
      : o.kind !== "actie" && o.text.trim() === nieuw.text.trim())
  );
  if (!match) return nieuw;
  return {
    ...nieuw,
    shotImageUrl: match.shotImageUrl ?? null,
    audioUrl: match.audioUrl ?? null,
    audioDuration: match.audioDuration ?? null,
    videoUrl: match.videoUrl ?? null,
    mouthStart: match.mouthStart ?? null,
  };
}

/** Bouwt een scène op uit het antwoord van het model, met behoud van wat kan. */
function bouwScene(
  ruw: { setting?: string; lines?: { kind?: string; characterId?: string; text?: string; emotion?: string; actie?: string; seconden?: number; verband?: string }[] },
  oudeScene: DialogueScene | undefined,
  naarCastId: (ruw?: string) => string | null,
  index: number
): DialogueScene | null {
  const lines = (ruw.lines ?? [])
    .map((l) => {
      const cid = naarCastId(l.characterId);
      if (!cid) return null;

      // Actiebeeld: geen gesproken tekst, wel een handeling en een lengte.
      if (l.kind === "actie") {
        const actie = (l.actie ?? "").trim();
        if (!actie) return null;
        const basis: DialogueLine = {
          kind: "actie", characterId: cid,
          text: (l.text ?? "").trim(), emotion: (l.emotion ?? "").trim(),
          actie, seconden: Math.max(ACTIE_MIN_SEC, Math.min(ACTIE_MAX_SEC, Math.round(l.seconden ?? ACTIE_STANDAARD_SEC))),
          verband: (l.verband ?? "").trim() || null,
        };
        return behoudRendering(basis, oudeScene?.lines ?? []);
      }

      const text = (l.text ?? "").trim();
      if (!text) return null;
      const basis: DialogueLine = { kind: "dialoog", characterId: cid, text, emotion: (l.emotion ?? "").trim() || "neutraal" };
      return behoudRendering(basis, oudeScene?.lines ?? []);
    })
    .filter((l): l is DialogueLine => l !== null);
  if (lines.length === 0) return null;

  const setting = (ruw.setting ?? "").trim() || oudeScene?.setting || "";
  // Het twee-shot hoort bij de omgeving. Verandert die, dan moet het beeld opnieuw.
  const zelfdeOmgeving = oudeScene && oudeScene.setting.trim() === setting;
  return {
    id: oudeScene?.id ?? `scene-${index}`,
    setting,
    lines,
    twoShotUrl: zelfdeOmgeving ? oudeScene?.twoShotUrl ?? null : null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as Body;
    const spec = body.spec;
    const instructie = (body.instructie ?? "").trim();
    if (!spec || !Array.isArray(spec.scenes) || spec.scenes.length === 0) {
      return NextResponse.json({ error: "Geen draaiboek meegestuurd" }, { status: 400 });
    }
    if (!instructie) return NextResponse.json({ error: "Geen aanwijzing" }, { status: 400 });

    const eenScene = typeof body.sceneIndex === "number";
    const si = body.sceneIndex ?? -1;
    if (eenScene && (si < 0 || si >= spec.scenes.length)) {
      return NextResponse.json({ error: "Onbekende scène" }, { status: 400 });
    }

    const draaiboek = toonDraaiboek(spec.cast, spec.scenes, eenScene ? si : undefined);
    const taal = spec.language ?? "Nederlands";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: 8000,
      tools: [eenScene ? HERZIE_SCENE_TOOL : HERZIE_DRAAIBOEK_TOOL],
      messages: [
        { role: "system", content: buildHerzieSysteem(draaiboek, taal, eenScene) },
        { role: "user", content: instructie },
      ],
    });

    const keuze = completion.choices[0]?.message;
    const toolCall = keuze?.tool_calls?.[0];

    // Geen tool-aanroep = de assistent snapt het verzoek niet en vraagt door.
    if (!toolCall) {
      return NextResponse.json({ reply: keuze?.content?.trim() || "Kun je iets preciezer zeggen wat er moet veranderen?" });
    }

    let uit: Record<string, unknown>;
    try {
      uit = JSON.parse(toolCall.function.arguments || "{}");
    } catch {
      return NextResponse.json({ reply: "Ik kreeg mijn eigen aanpassing niet rond. Probeer het nog eens." });
    }

    // Het model verwijst soms met de bibliotheek-UUID of met de naam in plaats van
    // met het cast-id; alle drie moeten hier landen op hetzelfde personage.
    const tabel = new Map<string, string>();
    for (const c of spec.cast) {
      tabel.set(c.id.toLowerCase(), c.id);
      tabel.set(c.characterId.toLowerCase(), c.id);
      tabel.set(c.name.toLowerCase(), c.id);
    }
    const naarCastId = (ruw?: string) => tabel.get((ruw ?? "").trim().toLowerCase()) ?? null;
    const nieuw: DialogueSpec = structuredClone(spec);

    if (eenScene) {
      const scene = bouwScene(
        uit as { setting?: string; lines?: { kind?: string; characterId?: string; text?: string; emotion?: string; actie?: string; seconden?: number; verband?: string }[] },
        spec.scenes[si],
        naarCastId,
        si
      );
      if (!scene) return NextResponse.json({ reply: "Daar kon ik geen bruikbare scène van maken. Kun je het anders formuleren?" });
      nieuw.scenes[si] = scene;
    } else {
      const ruweScenes = Array.isArray(uit.scenes) ? (uit.scenes as { setting?: string; lines?: { kind?: string; characterId?: string; text?: string; emotion?: string; actie?: string; seconden?: number; verband?: string }[] }[]) : [];
      const scenes = ruweScenes
        .map((s, i) => bouwScene(s, spec.scenes[i], naarCastId, i))
        .filter((s): s is DialogueScene => s !== null);
      if (scenes.length === 0) {
        return NextResponse.json({ reply: "Daar kwam geen bruikbaar draaiboek uit. Kun je het anders formuleren?" });
      }
      // Vangnet: had het draaiboek actiebeelden en zijn ze allemaal weg, dan is er
      // iets misgegaan in plaats van iets verbeterd — tenzij daar juist om gevraagd is.
      const hadActie = spec.scenes.some((sc) => sc.lines.some((l) => l.kind === "actie"));
      const heeftActie = scenes.some((sc) => sc.lines.some((l) => l.kind === "actie"));
      const wilMinderActie = /actie|tussenbeeld|tussenscene|tussenscène/i.test(instructie);
      if (hadActie && !heeftActie && !wilMinderActie) {
        return NextResponse.json({
          reply: "Daarbij verdwenen alle actiebeelden, dus ik heb het draaiboek zo gelaten. Kun je preciezer zeggen wat er moet veranderen?",
        });
      }
      nieuw.scenes = scenes;
      if (typeof uit.title === "string" && uit.title.trim()) nieuw.title = uit.title.trim();
      if (typeof uit.styleId === "string" && STIJLEN.has(uit.styleId)) nieuw.styleId = uit.styleId;
      if (typeof uit.illustrationBrief === "string") nieuw.illustrationBrief = uit.illustrationBrief.trim() || null;
    }

    return NextResponse.json({
      reply: (typeof uit.toelichting === "string" && uit.toelichting.trim()) || "Aangepast.",
      spec: nieuw,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("dialogue-revise failed:", msg);
    return NextResponse.json({ error: "Aanpassen mislukt", detail: msg }, { status: 500 });
  }
}
