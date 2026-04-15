"use client";

import { useState } from "react";
import { Project } from "@/lib/types";
import Stepper from "./Stepper";
import Step1Setup from "./Step1Setup";
import Step2Script from "./Step2Script";
import Step3Images from "./Step3Images";
import Step4Motion from "./Step4Motion";
import Step5Voiceover from "./Step5Voiceover";
import Step6Editor from "./Step6Editor";

const STEPS = [
  "Setup",
  "Script",
  "Images",
  "Motion",
  "Voice-over",
  "Editor",
];

function statusToStep(status: Project["status"]): number {
  switch (status) {
    case "Draft":        return 0;
    case "ScriptReady":  return 1;
    case "ImagesReady":  return 2;
    case "MotionReady":  return 3;
    case "VoiceReady":   return 4;
    case "Rendering":
    case "Done":
    case "Error":        return 5;
    default:             return 0;
  }
}

export default function ProjectWizard({ initialProject, plan }: { initialProject: Project; plan: string }) {
  const [project, setProject] = useState<Project>({
    ...initialProject,
    scenes: initialProject.scenes ?? [],
    visual_style: initialProject.visual_style ?? "Flat Illustration",
    bg_music_url: initialProject.bg_music_url ?? null,
  });
  const [step, setStep] = useState(() => statusToStep(initialProject.status));
  const [maxReached, setMaxReached] = useState(() => statusToStep(initialProject.status));

  function updateProject(updates: Partial<Project>) {
    setProject((prev) => ({ ...prev, ...updates }));
  }

  function goNext() {
    setStep((s) => {
      const next = Math.min(s + 1, STEPS.length - 1);
      setMaxReached((m) => Math.max(m, next));
      return next;
    });
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white truncate">{project.title}</h1>
      </div>

      <Stepper steps={STEPS} current={step} onSelect={setStep} maxReached={maxReached} />

      <div className="mt-6">
        {step === 0 && (
          <Step1Setup
            project={project}
            onUpdate={updateProject}
            onNext={goNext}
          />
        )}
        {step === 1 && (
          <Step2Script
            project={project}
            onUpdate={updateProject}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {step === 2 && (
          <Step3Images
            project={project}
            onUpdate={updateProject}
            onNext={goNext}
            onBack={goBack}
            plan={plan}
          />
        )}
        {step === 3 && (
          <Step4Motion
            project={project}
            onUpdate={updateProject}
            onNext={goNext}
            onBack={goBack}
            plan={plan}
          />
        )}
        {step === 4 && (
          <Step5Voiceover
            project={project}
            onUpdate={updateProject}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {step === 5 && (
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
