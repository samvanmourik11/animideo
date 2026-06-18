"use client";

import { useState } from "react";
import { Project } from "@/lib/types";
import Stepper from "@/components/wizard/Stepper";
import { useProjectAutosave, AutosaveIndicator } from "@/lib/use-project-autosave";
import InfographicStepInput from "./InfographicStepInput";
import InfographicStepEdit from "./InfographicStepEdit";
import InfographicStepExport from "./InfographicStepExport";

const STEPS = ["Invoer", "Bewerken", "Export"];

export default function InfographicWizard({
  initialProject,
  plan,
}: {
  initialProject: Project;
  plan: string;
}) {
  const [project, setProject] = useState<Project>(initialProject);
  const [step, setStep] = useState(initialProject.infographic_spec ? 1 : 0);
  const saveState = useProjectAutosave(project);

  function updateProject(updates: Partial<Project>) {
    setProject((prev) => ({ ...prev, ...updates }));
  }

  const maxReached = project.infographic_spec ? STEPS.length - 1 : 0;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">
              infographic
            </span>
            <h1 className="text-xl font-bold text-white truncate">{project.title}</h1>
          </div>
          <p className="text-xs text-slate-500 line-clamp-1">{project.format}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-1">
        <Stepper steps={STEPS} current={step} onSelect={setStep} maxReached={maxReached} />
        <div className="shrink-0">
          <AutosaveIndicator state={saveState} />
        </div>
      </div>

      <div className="mt-6">
        {step === 0 && (
          <InfographicStepInput
            project={project}
            onUpdate={updateProject}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && project.infographic_spec && (
          <InfographicStepEdit
            project={project}
            onUpdate={updateProject}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && project.infographic_spec && (
          <InfographicStepExport
            project={project}
            plan={plan}
            onBack={() => setStep(1)}
          />
        )}
      </div>
    </div>
  );
}
