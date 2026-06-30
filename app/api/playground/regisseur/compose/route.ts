import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";

// AI-regisseur: stelt op basis van de huidige playground-beelden een
// compleet videoconcept voor (volgorde, voice-over per shot, overgangen,
// muziek-suggestie en outro-tekst) en slaat dat direct op.
//
// Kost 1 credit (gelijk aan een script-generatie). Bij mislukken refunden.

const ALLOWED_TRANSITIONS = ["cut", "fade", "dissolve", "slide-left", "slide-right", "zoom-in"] as const;
type Transition = (typeof ALLOWED_TRANSITIONS)[number];

interface RegisseurShot {
  nodeId: string;
  voiceover_text: string;
  duration_sec: number;
  transition_out: Transition;
}

interface RegisseurResult {
  shots: RegisseurShot[];
  music_mood: string;
  outro_text: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sessie ongeldig, log opnieuw in" }, { status: 401 });
  }

  const { projectId } = (await req.json().catch(() => ({}))) as { projectId?: string };
  if (!projectId) {
    return NextResponse.json({ error: "projectId is verplicht" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (!project || project.user_id !== user.id || project.mode !== "playground") {
    return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });
  }

  const { data: nodes } = await supabase
    .from("playground_nodes")
    .select("id, prompt, image_url, in_video, sort_order")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .eq("kind", "image")
    .not("image_url", "is", null)
    .order("created_at", { ascending: true });
  const candidates = (nodes ?? []).filter((n) => n.image_url);

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "Genereer eerst minstens één beeld voordat de regisseur aan de slag kan." },
      { status: 400 }
    );
  }

  const credit = await deductCredits(user.id, CREDIT_COSTS.SCRIPT_GENERATION, "Playground: AI-regisseur");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.SCRIPT_GENERATION },
      { status: 402 }
    );
  }

  const userId = user.id;
  async function refund() {
    try {
      await addCredits(userId, CREDIT_COSTS.SCRIPT_GENERATION, "Refund: AI-regisseur mislukt");
    } catch {}
  }

  try {
    const language = project.language ?? "Dutch";
    const brief = (project.notes ?? "").toString().slice(0, 1000);

    const beeldenList = candidates
      .map((n, i) => `${i + 1}. id=${n.id} — prompt: "${(n.prompt ?? "").slice(0, 300)}"`)
      .join("\n");

    const systemPrompt =
      "Je bent een ervaren videoregisseur die korte uitlegvideo's monteert uit een set " +
      "vooraf gegenereerde beelden. Je kiest een logische volgorde, schrijft een vlotte, " +
      "natuurlijke voice-over per shot (geen overdreven marketingtaal), bepaalt duur en " +
      "overgangen, en stelt een muziekstemming en een korte outro-tekst voor. Antwoord " +
      "altijd in geldig JSON dat exact het opgegeven schema volgt, niets erbuiten.";

    const userPrompt = `Brief van de gebruiker: ${brief || "geen aanvullende brief, gebruik wat je ziet in de beelden"}.
Taal voor de voice-over: ${language}.
Formaat: ${project.format}.

Beschikbare beelden (kies welke je gebruikt en in welke volgorde, je hoeft niet alle te gebruiken):
${beeldenList}

Maak een compleet videoconcept van 4 tot 8 shots, totaal ongeveer 25 tot 50 seconden.

Geef het resultaat als JSON met dit schema, en NIETS erbuiten:
{
  "shots": [
    { "nodeId": "<exacte id uit de lijst hierboven>", "voiceover_text": "<1 of 2 zinnen voor dit shot>", "duration_sec": <getal tussen 2 en 8>, "transition_out": "<cut|fade|dissolve|slide-left|slide-right|zoom-in>" }
  ],
  "music_mood": "<korte omschrijving sfeer, bv. warm en optimistisch, lichte piano>",
  "outro_text": "<1 zin afsluitende tekst voor de outro>"
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      max_tokens: 1500,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: RegisseurResult;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Regisseur leverde geen geldig JSON");
    }

    const validIds = new Set(candidates.map((n) => n.id));
    const cleanShots: RegisseurShot[] = (Array.isArray(parsed.shots) ? parsed.shots : [])
      .filter((s) => s && typeof s.nodeId === "string" && validIds.has(s.nodeId))
      .slice(0, 12)
      .map((s) => ({
        nodeId: s.nodeId,
        voiceover_text: typeof s.voiceover_text === "string" ? s.voiceover_text.slice(0, 600) : "",
        duration_sec: Math.max(1, Math.min(15, Number(s.duration_sec) || 4)),
        transition_out: ALLOWED_TRANSITIONS.includes(s.transition_out as Transition)
          ? (s.transition_out as Transition)
          : "cut",
      }));

    if (cleanShots.length === 0) {
      throw new Error("Regisseur leverde geen bruikbare shots");
    }

    // Eerst alles uit de video halen, dan opnieuw opbouwen volgens voorstel.
    await supabase
      .from("playground_nodes")
      .update({ in_video: false, sort_order: null })
      .eq("project_id", projectId)
      .eq("user_id", userId);

    for (let i = 0; i < cleanShots.length; i++) {
      const s = cleanShots[i];
      await supabase
        .from("playground_nodes")
        .update({
          in_video: true,
          sort_order: i,
          voiceover_text: s.voiceover_text,
          duration_sec: s.duration_sec,
          transition_out: s.transition_out,
        })
        .eq("id", s.nodeId)
        .eq("user_id", userId)
        .eq("project_id", projectId);
    }

    const outroText = typeof parsed.outro_text === "string" ? parsed.outro_text.slice(0, 300) : "";
    const musicMood = typeof parsed.music_mood === "string" ? parsed.music_mood.slice(0, 200) : "";
    const existingContact = (project.outro_contact ?? {}) as Record<string, unknown>;
    await supabase
      .from("projects")
      .update({ outro_contact: { ...existingContact, tagline: outroText } })
      .eq("id", projectId)
      .eq("user_id", userId);

    const { data: refreshedNodes } = await supabase
      .from("playground_nodes")
      .select("*")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    const { data: refreshedProject } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    return NextResponse.json({
      nodes: refreshedNodes ?? [],
      project: refreshedProject,
      music_mood: musicMood,
    });
  } catch (err: unknown) {
    await refund();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[playground/regisseur/compose] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
