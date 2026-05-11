"use client";

import { useState } from "react";
import { Project } from "@/lib/types";
import Stepper from "@/components/wizard/Stepper";
import StudioStepScript from "./StudioStepScript";
import StudioStepImages from "./StudioStepImages";
import Step4Motion from "@/components/wizard/Step4Motion";
import Step5Voiceover from "@/components/wizard/Step5Voiceover";
import Step6Editor from "@/components/wizard/Step6Editor";
import { useProjectAutosave, AutosaveIndicator } from "@/lib/use-project-autosave";

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
  const saveState = useProjectAutosave(project);

  function updateProject(updates: Partial<Project>) {
    setProject(prev => ({ ...prev, ...updates }));
  }

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
        <Stepper steps={STEPS} current={step} onSelect={setStep} maxReached={STEPS.length - 1} />
        <div className="shrink-0"><AutosaveIndicator state={saveState} /></div>
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
          <Step5Voiceover
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
