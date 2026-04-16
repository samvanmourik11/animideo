"use client";

import { useState } from "react";
import { Project } from "@/lib/types";
import Stepper from "./Stepper";
import StepFreeImages from "./StepFreeImages";
import Step4Motion from "./Step4Motion";
import Step5Voiceover from "./Step5Voiceover";
import Step6Editor from "./Step6Editor";

const STEPS = ["Afbeeldingen", "Beweging", "Voice-over", "Editor"];

function statusToStep(status: Project["status"]): number {
  switch (status) {
    case "Draft":        return 0;
    case "ImagesReady":  return 1;
    case "MotionReady":  return 2;
    case "VoiceReady":   return 3;
    case "Rendering":
    case "Done":
    case "Error":        return 3;
    default:             return 0;
  }
}

export default function FreeProjectWizard({
  initialProject,
  plan,
}: {
  initialProject: Project;
  plan: string;
}) {
  const [project, setProject] = useState<Project>({
    ...initialProject,
    scenes: initialProject.scenes ?? [],
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
          <StepFreeImages
            project={project}
            onUpdate={updateProject}
            onNext={goNext}
          />
        )}
        {step === 1 && (
          <Step4Motion
            project={project}
            onUpdate={updateProject}
            onNext={goNext}
            onBack={goBack}
            plan={plan}
          />
        )}
        {step === 2 && (
          <Step5Voiceover
            project={project}
            onUpdate={updateProject}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {step === 3 && (
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
