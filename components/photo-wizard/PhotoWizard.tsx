"use client";

import { useState } from "react";
import { Project, Scene } from "@/lib/types";
import Stepper from "@/components/wizard/Stepper";
import PhotoStep1Setup from "./PhotoStep1Setup";
import PhotoStep2Upload, { PhotoScene } from "./PhotoStep2Upload";
import PhotoStep3Transform from "./PhotoStep3Transform";
import Step4Motion from "@/components/wizard/Step4Motion";
import Step5Voiceover from "@/components/wizard/Step5Voiceover";
import Step6Editor from "@/components/wizard/Step6Editor";

const STEPS = ["Setup", "Foto's", "Transformeer", "Motion", "Voice-over", "Editor"];

function statusToStep(status: Project["status"]): number {
  switch (status) {
    case "Draft":       return 0;
    case "ImagesReady": return 3;
    case "MotionReady": return 4;
    case "VoiceReady":  return 5;
    case "Rendering":
    case "Done":
    case "Error":       return 5;
    default:            return 0;
  }
}

export default function PhotoWizard({ initialProject, plan }: { initialProject: Project; plan: string }) {
  const [project, setProject] = useState<Project>({
    ...initialProject,
    scenes:       initialProject.scenes ?? [],
    visual_style: initialProject.visual_style ?? "2D Cartoon",
    bg_music_url: initialProject.bg_music_url ?? null,
  });
  const [step, setStep]             = useState(() => statusToStep(initialProject.status));
  const [maxReached, setMaxReached] = useState(() => statusToStep(initialProject.status));
  const [photoScenes, setPhotoScenes] = useState<PhotoScene[]>([]);

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

  function handleTransformNext(scenes: Scene[]) {
    // Sla scenes op in project state zodat Motion ze heeft
    updateProject({ scenes, status: "ImagesReady" });
    goNext();
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white truncate">{project.title}</h1>
      </div>

      <Stepper steps={STEPS} current={step} onSelect={setStep} maxReached={maxReached} />

      <div className="mt-6">
        {step === 0 && (
          <PhotoStep1Setup project={project} onUpdate={updateProject} onNext={goNext} />
        )}
        {step === 1 && (
          <PhotoStep2Upload
            project={project}
            photoScenes={photoScenes}
            onScenesChange={setPhotoScenes}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {step === 2 && (
          <PhotoStep3Transform
            project={project}
            photoScenes={photoScenes}
            onScenesChange={setPhotoScenes}
            onNext={handleTransformNext}
            onBack={goBack}
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
