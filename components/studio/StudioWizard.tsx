"use client";

import { useState, useEffect, useRef } from "react";
import { Project } from "@/lib/types";
import Stepper from "@/components/wizard/Stepper";
import StudioStepScript from "./StudioStepScript";
import StudioStepImages from "./StudioStepImages";
import StudioStepVoiceover from "./StudioStepVoiceover";
import Step4Motion from "@/components/wizard/Step4Motion";
import Step6Editor from "@/components/wizard/Step6Editor";

const STEPS = ["Script", "Beelden", "Beweging", "Voice-over", "Editor"];

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

// Fields that change during the wizard and need persisting via /api/save-project
const PERSIST_FIELDS = [
  "scenes",
  "status",
  "title",
  "voice_audio_url",
  "selected_voice",
  "video_url",
  "bg_music_url",
] as const;

function pickPersistable(project: Project): Partial<Project> {
  const out: Partial<Project> = {};
  for (const k of PERSIST_FIELDS) {
    // @ts-expect-error - dynamic key access
    out[k] = project[k];
  }
  return out;
}

export default function StudioWizard({
  initialProject,
  plan,
  targetScenes,
}: {
  initialProject: Project;
  plan: string;
  targetScenes: number;
}) {
  const [project, setProject] = useState<Project>(initialProject);
  const [step, setStep] = useState(() => statusToStep(initialProject.status));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const skipFirstSaveRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateProject(updates: Partial<Project>) {
    setProject(prev => ({ ...prev, ...updates }));
  }

  // Auto-save: debounce 800ms after any project change. Skips initial mount.
  useEffect(() => {
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/save-project", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: project.id, ...pickPersistable(project) }),
        });
        setSaveState(res.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [project]);

  function goNext() {
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStep(s => Math.max(s - 1, 0));
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
        {(project.style_reference_url || project.character_reference_urls.length > 0) && (
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
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mb-1">
        <Stepper steps={STEPS} current={step} onSelect={setStep} maxReached={STEPS.length - 1} />
        <div className="text-xs text-slate-500 shrink-0">
          {saveState === "saving" && "Opslaan..."}
          {saveState === "saved"  && <span className="text-emerald-400">Opgeslagen</span>}
          {saveState === "error"  && <span className="text-red-400">Opslaan mislukt</span>}
        </div>
      </div>

      <div className="mt-6">
        {step === 0 && (
          <StudioStepScript
            project={project}
            targetScenes={targetScenes}
            onUpdate={updateProject}
            onNext={goNext}
          />
        )}
        {step === 1 && (
          <StudioStepImages
            project={project}
            onUpdate={updateProject}
            onNext={goNext}
            onBack={goBack}
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
          <StudioStepVoiceover
            project={project}
            onUpdate={updateProject}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {step === 4 && (
          <Step6Editor
            project={project}
            onUpdate={updateProject}
            onBack={goBack}
            plan={plan}
          />
        )}
      </div>
    </div>
  );
}
