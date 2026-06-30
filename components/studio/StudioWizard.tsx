"use client";

import { useEffect, useState } from "react";
import { Project, Character } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import Stepper from "@/components/wizard/Stepper";
import StudioStepScript from "./StudioStepScript";
import StudioStepImages from "./StudioStepImages";
import Step4Motion from "@/components/wizard/Step4Motion";
import Step5Voiceover from "@/components/wizard/Step5Voiceover";
import StudioStepEditor from "./StudioStepEditor";
import StudioChatPanel, { type RegenResult } from "./StudioChatPanel";
import { useProjectAutosave, AutosaveIndicator } from "@/lib/use-project-autosave";
import { computeProjectUpdate } from "@/lib/studio/chat-context";
import type { ChatAction } from "@/lib/studio/chat-tools";

const STEPS = ["Idee", "Beelden", "Beweging", "Voice-over", "Editor"];

function statusToStep(status: Project["status"]): number {
  switch (status) {
    case "Draft":        return 0;
    case "ScriptReady":  return 1;
    case "ImagesReady":  return 2;
    case "MotionReady":  return 3;
    case "VoiceReady":   return 4;
    case "Rendering":
    case "Done":
    case "Error":        return 4;
    default:             return 0;
  }
}

export default function StudioWizard({
  initialProject,
  plan,
  targetScenes,
  characters = [],
  buddyEnabled = false,
}: {
  initialProject: Project;
  plan: string;
  targetScenes: number;
  characters?: Character[];
  // De AI-buddy is tijdens de soft-launch alleen voor toegestane account(s); de
  // Studio zelf blijft open voor alle huidige gebruikers.
  buddyEnabled?: boolean;
}) {
  const [project, setProject] = useState<Project>(initialProject);
  const [step, setStep] = useState(() => statusToStep(initialProject.status));
  const [chatOpen, setChatOpen] = useState(false);
  const saveState = useProjectAutosave(project);

  // Restore the furthest step the user actually reached. The persisted `status`
  // lags behind the visible step (it only advances when a step's action
  // completes), so without this a reload or remount drops the user back on an
  // earlier tab. Done in an effect (not the initializer) to avoid an SSR
  // hydration mismatch. Never moves the user behind what `status` already implies.
  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(`studio-step-${initialProject.id}`));
      if (Number.isFinite(stored) && stored > 0) {
        setStep(prev => Math.max(prev, Math.min(stored, STEPS.length - 1)));
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the current position so a reload or remount keeps the user in place.
  useEffect(() => {
    try {
      window.localStorage.setItem(`studio-step-${project.id}`, String(step));
    } catch {}
  }, [step, project.id]);

  // Koppel de wizard-stap aan de browser-history. Zo gaat browser-terug naar de
  // VORIGE STAP binnen hetzelfde project (de pagina blijft gemount, niets gaat
  // verloren) i.p.v. dat je het hele project verlaat. Cruciaal: in de demo ging
  // de gebruiker vanuit de editor "terug" en raakte alles kwijt.
  useEffect(() => {
    try {
      window.history.replaceState({ ...(window.history.state ?? {}), studioStep: step }, "");
    } catch {}
    const onPop = (e: PopStateEvent) => {
      const s = e.state && typeof (e.state as { studioStep?: number }).studioStep === "number"
        ? (e.state as { studioStep: number }).studioStep
        : null;
      if (s !== null) setStep(Math.max(0, Math.min(s, STEPS.length - 1)));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile met de DB bij laden. Als de pagina (via de Next Router Cache of een
  // verouderde load) een lege/oude versie van het project meekreeg, maar de DB
  // heeft wél scènes, dan nemen we de DB-versie over. Zo kan een stale load nooit
  // leiden tot een autosave die het project leegt — en zie je nooit "alles weg".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("projects")
          .select("*")
          .eq("id", initialProject.id)
          .single();
        if (cancelled || !data) return;
        const dbScenes = Array.isArray((data as Project).scenes) ? (data as Project).scenes : [];
        setProject(prev => {
          // Alleen overnemen als de client momenteel minder scènes heeft dan de DB
          // (client is stale). Nooit een verder-staande client overschrijven.
          if (dbScenes.length > (prev.scenes?.length ?? 0)) {
            return { ...prev, ...(data as Project) };
          }
          return prev;
        });
      } catch { /* offline / RLS: laat de bestaande state staan */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateProject(updates: Partial<Project>) {
    setProject(prev => {
      const next = { ...prev, ...updates };
      // Veiligheidsklep: een lege scènes-array mag bestaande scènes NOOIT wissen
      // (voorkomt dataverlies door een verouderde/stale update). Idem voor
      // project-brede assets die al gevuld zijn.
      if (Array.isArray(updates.scenes) && updates.scenes.length === 0 && (prev.scenes?.length ?? 0) > 0) {
        next.scenes = prev.scenes;
      }
      for (const k of ["voice_audio_url", "video_url", "bg_music_url"] as const) {
        if (k in updates && !updates[k] && prev[k]) next[k] = prev[k];
      }
      return next;
    });
  }

  // AI-buddy: pas een (goedgekeurd) voorstel toe op de project-state. Loopt via
  // dezelfde functionele setProject + autosave als alle andere mutaties; de
  // veiligheidsklep ("lege scènes mag bestaande nooit wissen") geldt ook hier.
  function applyChatAction(action: ChatAction) {
    setProject(prev => {
      const upd = computeProjectUpdate(prev, action);
      if (!upd) return prev;
      const next = { ...prev, ...upd };
      if (Array.isArray(upd.scenes) && upd.scenes.length === 0 && (prev.scenes?.length ?? 0) > 0) {
        next.scenes = prev.scenes;
      }
      return next;
    });
  }

  // AI-buddy: een scène-beeld opnieuw genereren (na goedkeuring). Hergebruikt de
  // bestaande generate-scene-image route en mergt het resultaat terug.
  async function regenerate(action: ChatAction): Promise<RegenResult> {
    if (action.type !== "regenerate_scene_image") return { status: "error", message: "Onbekende actie" };
    try {
      const res = await fetch("/api/studio/generate-scene-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, sceneId: action.args.sceneId, clientScenes: project.scenes }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) return { status: "insufficient", credits: data.credits ?? 0, required: data.required ?? 1 };
      if (!res.ok) return { status: "error", message: data.error ?? "Genereren mislukt" };
      if (Array.isArray(data.scenes)) updateProject({ scenes: data.scenes });
      else if (data.imageUrl) updateProject({ scenes: (project.scenes ?? []).map(s => s.id === action.args.sceneId ? { ...s, image_url: data.imageUrl } : s) });
      return { status: "ok" };
    } catch (e) {
      return { status: "error", message: e instanceof Error ? e.message : "Fout" };
    }
  }

  // Stapwissel = een history-entry, zodat browser-terug/-vooruit door de stappen
  // navigeert binnen het project.
  function gotoStep(target: number) {
    const t = Math.max(0, Math.min(target, STEPS.length - 1));
    if (t === step) return;
    try {
      window.history.pushState({ ...(window.history.state ?? {}), studioStep: t }, "");
    } catch {}
    setStep(t);
  }

  function goNext() {
    gotoStep(step + 1);
  }

  function goBack() {
    gotoStep(step - 1);
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded">studio</span>
            <h1 className="text-xl font-bold text-white truncate">{project.title}</h1>
          </div>
          <p className="text-xs text-slate-500 line-clamp-1">{project.notes}</p>
        </div>
        {(project.style_reference_url || project.character_reference_urls.length > 0 || project.outro_logo_url) && (
          <div className="flex gap-1.5 shrink-0">
            {project.style_reference_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={project.style_reference_url}
                alt="style anchor"
                title="Style reference"
                className="w-10 h-10 object-cover rounded-md border border-cyan-500/30"
              />
            )}
            {project.character_reference_urls.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt={`character ${i + 1}`}
                title={`Character reference ${i + 1}`}
                className="w-10 h-10 object-cover rounded-md border border-cyan-500/30"
              />
            ))}
            {project.outro_logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={project.outro_logo_url}
                alt="outro logo"
                title="Outro logo (verschijnt op de eindscene)"
                className="w-10 h-10 object-contain bg-white/5 p-1 rounded-md border border-amber-500/30"
              />
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mb-1">
        <Stepper steps={STEPS} current={step} onSelect={gotoStep} maxReached={STEPS.length - 1} />
        <div className="shrink-0"><AutosaveIndicator state={saveState} /></div>
      </div>

      <div className="mt-6">
        {step === 0 && (
          <StudioStepScript
            project={project}
            targetScenes={targetScenes}
            onUpdate={updateProject}
            onNext={goNext}
            characters={characters}
          />
        )}
        {step === 1 && (
          <StudioStepImages
            project={project}
            onUpdate={updateProject}
            onNext={goNext}
            onBack={goBack}
            characters={characters}
          />
        )}
        {step === 2 && (
          <Step4Motion
            project={project}
            onUpdate={updateProject}
            onNext={goNext}
            onBack={goBack}
            plan={plan}
          />
        )}
        {step === 3 && (
          <Step5Voiceover
            project={project}
            onUpdate={updateProject}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {step === 4 && (
          <StudioStepEditor project={project} onBack={goBack} />
        )}
      </div>

      {buddyEnabled && (project.scenes?.length ?? 0) > 0 && (
        <button
          type="button"
          onClick={() => setChatOpen(o => !o)}
          title="AI-buddy"
          aria-label="AI-buddy"
          className="fixed bottom-6 right-4 z-40 w-14 h-14 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_8px_24px_rgba(34,211,238,0.45)] flex items-center justify-center text-2xl hover:scale-105 transition-transform"
        >
          {chatOpen ? "✕" : "🤖"}
        </button>
      )}
      {buddyEnabled && chatOpen && (project.scenes?.length ?? 0) > 0 && (
        <StudioChatPanel
          project={project}
          applyAction={applyChatAction}
          regenerate={regenerate}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
