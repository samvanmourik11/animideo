// AI-buddy chat-endpoint. Streamt de buddy-tekst (SSE) en sluit af met een
// `actions`-event: de voorgestelde, gestructureerde wijzigingen (tool-calls) die
// de client als kaartjes toont en pas na goedkeuring toepast. De server muteert
// het project NIET — hij stelt alleen voor (en bewaart het gesprek).

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@/lib/openai";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import { CHAT_TOOLS, type ChatAction, type ChatActionType } from "@/lib/studio/chat-tools";
import { buildSystemPrompt } from "@/lib/studio/chat-prompt";
import type { CompactProject } from "@/lib/studio/chat-context";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ChatBody {
  projectId?: string;
  message?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  context?: CompactProject;
}

// Nederlandse kop voor het voorstel-kaartje, op basis van type + scènenummer.
function labelFor(type: ChatActionType, args: Record<string, unknown>, sceneNum?: number): string {
  const s = sceneNum ? `Scène ${sceneNum}` : "Scène";
  switch (type) {
    case "edit_scene_voiceover": return `${s} — voice-over herschrijven`;
    case "edit_image_prompt": return `${s} — beeld-prompt aanpassen`;
    case "edit_motion_prompt": return `${s} — beweging aanpassen`;
    case "set_scene_duration": return `${s} — duur → ${Number(args.duration) || "?"}s`;
    case "add_scene": return `Nieuwe scène toevoegen`;
    case "delete_scene": return `${s} — verwijderen`;
    case "reorder_scene": return `${s} — ${args.direction === "up" ? "omhoog" : "omlaag"} verplaatsen`;
    case "set_cast_for_scene": return `${s} — personages instellen`;
    case "update_brief": return `Briefing bijwerken`;
    case "rewrite_full_script": return `Volledig script herschrijven`;
    case "regenerate_scene_image": return `${s} — beeld opnieuw genereren (${CREDIT_COSTS.IMAGE_GENERATION} credit)`;
    default: return "Wijziging";
  }
}

const SCENE_TARGETED: ChatActionType[] = [
  "edit_scene_voiceover", "edit_image_prompt", "edit_motion_prompt",
  "set_scene_duration", "delete_scene", "reorder_scene", "set_cast_for_scene",
  "regenerate_scene_image",
];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: ChatBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { projectId, message, context } = body;
  if (!projectId || !message || !context) {
    return NextResponse.json({ error: "projectId, message en context vereist" }, { status: 400 });
  }

  // Eigendom verifiëren.
  const { data: project } = await supabase
    .from("projects").select("id").eq("id", projectId).eq("user_id", user.id).single();
  if (!project) return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });

  // Credits vooraf afschrijven; bij fout/lege uitkomst geven we terug.
  const credit = await deductCredits(user.id, CREDIT_COSTS.CHAT, "Buddy-chat");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.CHAT },
      { status: 402 }
    );
  }
  let refunded = false;
  const refund = async () => { if (refunded) return; refunded = true; try { await addCredits(user.id, CREDIT_COSTS.CHAT, "Refund: buddy-chat"); } catch {} };

  // Lookup voor validatie + labels.
  const sceneNum = new Map<string, number>();
  for (const sc of context.scenes ?? []) sceneNum.set(sc.id, sc.number);

  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
  const messages = [
    { role: "system" as const, content: buildSystemPrompt(context) },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: message },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch {}
      };

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          stream: true,
          temperature: 0.6,
          tools: CHAT_TOOLS,
          tool_choice: "auto",
          parallel_tool_calls: true,
          messages,
        });

        let text = "";
        // Accumuleer tool-calls per index: { name, args(string) }.
        const rawCalls: { name: string; args: string }[] = [];

        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;
          if (delta.content) { text += delta.content; emit({ type: "delta", text: delta.content }); }
          for (const tc of delta.tool_calls ?? []) {
            const i = tc.index ?? 0;
            if (!rawCalls[i]) rawCalls[i] = { name: "", args: "" };
            if (tc.function?.name) rawCalls[i].name = tc.function.name;
            if (tc.function?.arguments) rawCalls[i].args += tc.function.arguments;
          }
        }

        // Tool-calls valideren → ChatAction[].
        const actions: ChatAction[] = [];
        for (const c of rawCalls) {
          if (!c || !c.name) continue;
          const type = c.name as ChatActionType;
          let args: Record<string, unknown>;
          try { args = c.args ? JSON.parse(c.args) : {}; } catch { continue; }

          // Scène-gerichte acties: onbekende id's droppen.
          if (SCENE_TARGETED.includes(type)) {
            const sid = args.sceneId;
            if (typeof sid !== "string" || !sceneNum.has(sid)) continue;
          }
          if (type === "set_scene_duration") {
            const d = Number(args.duration);
            if (!Number.isFinite(d)) continue;
            args.duration = Math.max(1, Math.min(15, Math.round(d)));
          }
          if (type === "rewrite_full_script" && !Array.isArray((args as { scenes?: unknown }).scenes)) continue;

          const num = typeof args.sceneId === "string" ? sceneNum.get(args.sceneId) : undefined;
          actions.push({ id: randomUUID(), type, label: labelFor(type, args, num), args } as ChatAction);
        }

        // Niks bruikbaars terug? Geld terug.
        if (!text.trim() && actions.length === 0) {
          await refund();
          emit({ type: "error", message: "Geen antwoord ontvangen. Probeer het opnieuw." });
          return;
        }

        // Lege bubbel voorkomen: synthetiseer een zin uit de labels.
        if (!text.trim() && actions.length > 0) {
          text = `Ik stel ${actions.length} wijziging${actions.length > 1 ? "en" : ""} voor:\n` +
            actions.map(a => `• ${a.label}`).join("\n");
          emit({ type: "delta", text });
        }

        emit({ type: "actions", actions });
        emit({ type: "done" });

        // Gesprek bewaren (best-effort; faalt stil).
        try {
          await supabase.from("studio_chat_messages").insert([
            { project_id: projectId, user_id: user.id, role: "user", content: message, actions: [] },
            { project_id: projectId, user_id: user.id, role: "assistant", content: text, actions },
          ]);
        } catch {}
      } catch (err) {
        await refund();
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[studio-chat]", err);
        emit({ type: "error", message: msg });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
