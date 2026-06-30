"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Project } from "@/lib/types";
import { type ChatAction, REGENERATE_ACTIONS } from "@/lib/studio/chat-tools";
import { buildCompactProject } from "@/lib/studio/chat-context";
import { createClient } from "@/lib/supabase/client";

// Resultaat van een regenereer-actie (loopt via een API-call in de wizard).
export type RegenResult =
  | { status: "ok" }
  | { status: "insufficient"; credits: number; required: number }
  | { status: "error"; message: string };

type ChatMsg = { role: "user" | "assistant"; content: string };
type CardStatus = "proposed" | "applied" | "dismissed" | "running";

export default function StudioChatPanel({
  project, applyAction, regenerate, onClose,
}: {
  project: Project;
  applyAction: (action: ChatAction) => void;
  regenerate: (action: ChatAction) => Promise<RegenResult>;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState("");        // huidige assistant-bubbel
  const [cards, setCards] = useState<{ action: ChatAction; status: CardStatus }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creditModal, setCreditModal] = useState<{ credits: number; required: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Historie laden (RLS scoopt naar de ingelogde user).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("studio_chat_messages")
          .select("role, content")
          .eq("project_id", project.id)
          .order("created_at", { ascending: true })
          .limit(50);
        if (!cancelled && Array.isArray(data)) {
          setMessages(data.filter(m => m.content).map(m => ({ role: m.role as ChatMsg["role"], content: m.content })));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [project.id]);

  // Autoscroll naar onder bij nieuwe content.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming, cards]);

  async function send() {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput("");
    setError(null);
    setCards([]);
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setSending(true);
    setStreaming("");

    try {
      const res = await fetch("/api/studio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          message: msg,
          history: messages.slice(-6),
          context: buildCompactProject(project),
        }),
      });

      if (!res.ok || !res.body) {
        // 402 e.d. komen als JSON vóór de stream.
        const data = await res.json().catch(() => ({}));
        if (res.status === 402) { setCreditModal({ credits: data.credits ?? 0, required: data.required ?? 1 }); }
        else setError(data.error ?? "Er ging iets mis.");
        setSending(false);
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      let gotActions: ChatAction[] = [];

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find(l => l.startsWith("data: "));
          if (!line) continue;
          let ev: { type: string; text?: string; actions?: ChatAction[]; message?: string };
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (ev.type === "delta" && ev.text) { acc += ev.text; setStreaming(acc); }
          else if (ev.type === "actions" && Array.isArray(ev.actions)) { gotActions = ev.actions; }
          else if (ev.type === "error") { setError(ev.message ?? "Er ging iets mis."); }
        }
      }

      if (acc.trim()) setMessages(prev => [...prev, { role: "assistant", content: acc }]);
      setStreaming("");
      setCards(gotActions.map(action => ({ action, status: "proposed" as CardStatus })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verbinding verbroken.");
    } finally {
      setSending(false);
    }
  }

  async function runCard(idx: number) {
    const card = cards[idx];
    if (!card || card.status !== "proposed") return;
    const { action } = card;

    if (REGENERATE_ACTIONS.includes(action.type)) {
      setCards(cs => cs.map((c, i) => i === idx ? { ...c, status: "running" } : c));
      const r = await regenerate(action);
      if (r.status === "ok") setCards(cs => cs.map((c, i) => i === idx ? { ...c, status: "applied" } : c));
      else {
        setCards(cs => cs.map((c, i) => i === idx ? { ...c, status: "proposed" } : c));
        if (r.status === "insufficient") setCreditModal({ credits: r.credits, required: r.required });
        else setError(r.message);
      }
      return;
    }

    applyAction(action);
    setCards(cs => cs.map((c, i) => i === idx ? { ...c, status: "applied" } : c));
  }

  function dismissCard(idx: number) {
    setCards(cs => cs.map((c, i) => i === idx ? { ...c, status: "dismissed" } : c));
  }

  async function applyAll() {
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].status === "proposed") await runCard(i);
    }
  }

  const proposedCount = cards.filter(c => c.status === "proposed").length;

  return (
    <>
      <aside className="fixed bottom-24 right-4 z-40 w-[min(420px,calc(100vw-2rem))] max-h-[72vh] bg-[#060d1f] border border-white/10 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.6)] flex flex-col">
        <div className="flex items-center justify-between px-4 h-12 shrink-0 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <h2 className="text-sm font-semibold text-white">Buddy</h2>
            <span className="text-[10px] text-slate-500">je AI-assistent</span>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-sm">Sluiten ✕</button>
        </div>

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && !streaming && (
            <div className="text-xs text-slate-500 space-y-2">
              <p>Vraag me om je video bij te schaven. Bijvoorbeeld:</p>
              <ul className="space-y-1">
                {["Maak de voice-over van scène 2 korter en rustiger", "Scherp de beeld-prompt van scène 3 aan", "Voeg een korte intro-scène toe", "Maak het hele script energieker"].map((s, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => setInput(s)} className="text-left text-slate-400 hover:text-cyan-300">“{s}”</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap ${m.role === "user" ? "bg-blue-600/30 text-white" : "bg-white/5 text-slate-200"}`}>
                {m.content}
              </div>
            </div>
          ))}

          {streaming && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap bg-white/5 text-slate-200">{streaming}<span className="animate-pulse">▍</span></div>
            </div>
          )}

          {cards.length > 0 && (
            <div className="space-y-2">
              {cards.map((c, i) => (
                <ProposalCard key={c.action.id} project={project} action={c.action} status={c.status}
                  onApply={() => runCard(i)} onDismiss={() => dismissCard(i)} />
              ))}
              {proposedCount > 1 && (
                <button type="button" onClick={applyAll} className="btn-primary w-full text-xs py-2">Alles toepassen ({proposedCount})</button>
              )}
            </div>
          )}

          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>

        <div className="shrink-0 border-t border-white/10 p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={2}
              disabled={sending}
              placeholder="Vraag Buddy iets…"
              className="flex-1 resize-none bg-[#060d1f] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 placeholder-slate-600 disabled:opacity-50"
            />
            <button type="button" onClick={send} disabled={sending || !input.trim()} className="btn-primary text-xs py-2 px-3 shrink-0">
              {sending ? "…" : "Stuur"}
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-1">Buddy stelt wijzigingen voor — jij keurt ze goed.</p>
        </div>
      </aside>

      {creditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0c1428] border border-white/[0.08] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7)] p-8 max-w-sm w-full mx-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4"><span className="text-3xl">💸</span></div>
            <h2 className="text-xl font-bold text-white mb-2">Credits op!</h2>
            <p className="text-slate-400 text-sm mb-6">Je hebt <strong className="text-white">{creditModal.credits}</strong> credits over, maar deze actie kost <strong className="text-white">{creditModal.required}</strong>.</p>
            <Link href="/pricing" className="block w-full text-center btn-primary py-3 mb-3">Upgrade nu →</Link>
            <button onClick={() => setCreditModal(null)} className="block w-full text-center text-slate-500 hover:text-slate-300 text-sm py-2">Sluiten</button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Voorstel-kaartje met voor→na diff ───────────────────────────────────────
function ProposalCard({
  project, action, status, onApply, onDismiss,
}: {
  project: Project;
  action: ChatAction;
  status: CardStatus;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const diff = diffFor(project, action);

  return (
    <div className={`rounded-xl border p-2.5 text-xs ${status === "dismissed" ? "border-white/5 bg-white/[0.02] opacity-50" : "border-cyan-500/30 bg-cyan-500/[0.06]"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-cyan-200">{action.label}</span>
        {status === "applied" && <span className="text-[10px] text-green-400 shrink-0">✓ Toegepast</span>}
        {status === "dismissed" && <span className="text-[10px] text-slate-500 shrink-0">Verworpen</span>}
        {status === "running" && <span className="text-[10px] text-cyan-300 shrink-0 animate-pulse">Bezig…</span>}
      </div>

      {diff && (
        <div className="mt-1.5 space-y-1">
          {diff.before !== undefined && (
            <p className="text-[11px] text-slate-500 line-through line-clamp-2">{diff.before || "(leeg)"}</p>
          )}
          <p className={`text-[11px] text-slate-200 ${expanded ? "" : "line-clamp-3"}`}>{diff.after}</p>
          {diff.after.length > 140 && (
            <button type="button" onClick={() => setExpanded(e => !e)} className="text-[10px] text-cyan-400 hover:text-cyan-300">{expanded ? "Minder" : "Meer"}</button>
          )}
        </div>
      )}

      {status === "proposed" && (
        <div className="flex gap-2 mt-2">
          <button type="button" onClick={onApply} className="btn-primary text-[11px] py-1 px-3">Toepassen</button>
          <button type="button" onClick={onDismiss} className="btn-secondary text-[11px] py-1 px-3">Verwerp</button>
        </div>
      )}
    </div>
  );
}

// Bepaal de voor→na tekst voor het kaartje. `before` ontbreekt bij acties zonder
// duidelijke oude waarde (toevoegen, herschrijven, regenereren).
function diffFor(project: Project, action: ChatAction): { before?: string; after: string } | null {
  const scene = "sceneId" in action.args ? project.scenes?.find(s => s.id === (action.args as { sceneId: string }).sceneId) : undefined;
  switch (action.type) {
    case "edit_scene_voiceover": return { before: scene?.voiceover_text, after: action.args.voiceover_text };
    case "edit_image_prompt": return { before: scene?.image_prompt, after: action.args.image_prompt };
    case "edit_motion_prompt": return { before: scene?.motion_prompt, after: action.args.motion_prompt };
    case "set_scene_duration": return { before: scene ? `${scene.duration}s` : undefined, after: `${action.args.duration}s` };
    case "add_scene": return { after: action.args.voiceover_text };
    case "update_brief": return { after: Object.entries(action.args).map(([k, v]) => `${k}: ${v}`).join("\n") };
    case "rewrite_full_script": return { after: `${action.args.scenes.length} scènes worden herschreven.` };
    case "delete_scene":
    case "reorder_scene":
    case "set_cast_for_scene":
    case "regenerate_scene_image":
      return null;
    default: return null;
  }
}
