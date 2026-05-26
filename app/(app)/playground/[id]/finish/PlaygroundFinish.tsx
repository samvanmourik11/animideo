"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/types";
import Step6Editor from "@/components/wizard/Step6Editor";
import { useProjectAutosave, AutosaveIndicator } from "@/lib/use-project-autosave";

// Wrapper rond Step6Editor zodat de playground-modus dezelfde timeline en
// MP4-export krijgt als de wizard. Voice-over wordt hier on-demand gegenereerd
// via de bestaande /api/generate-voice endpoint (leest project.scenes).

export default function PlaygroundFinish({
  initialProject,
  plan,
}: {
  initialProject: Project;
  plan: string;
}) {
  const router = useRouter();
  const [project, setProject] = useState<Project>(initialProject);
  const saveState = useProjectAutosave(project);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState("");

  function updateProject(updates: Partial<Project>) {
    setProject((prev) => ({ ...prev, ...updates }));
  }

  async function generateVoice() {
    if (voiceBusy) return;
    setVoiceError("");
    setVoiceBusy(true);
    try {
      const res = await fetch("/api/generate-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          voice: project.selected_voice ?? "Charlotte",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVoiceError(
          data.error === "insufficient_credits"
            ? "Je hebt geen credits meer."
            : data.error ?? "Voice-over genereren mislukt."
        );
        return;
      }
      updateProject({
        voice_audio_url: data.audioUrl,
        selected_voice: data.voice,
        status: "VoiceReady",
      });
    } catch {
      setVoiceError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setVoiceBusy(false);
    }
  }

  const hasVoiceText = project.scenes.some((s) => (s.voiceover_text ?? "").trim().length > 0);
  const needsVoice = hasVoiceText && !project.voice_audio_url;

  return (
    <div className="pb-16">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-200 px-2 py-0.5 rounded">
              playground · afronden
            </span>
            <h1 className="text-xl font-bold text-white truncate">{project.title}</h1>
          </div>
          <p className="text-xs text-slate-500">
            {project.scenes.length} shots in de eindmontage
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <AutosaveIndicator state={saveState} />
          <button
            type="button"
            onClick={() => router.push(`/playground/${project.id}`)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/[0.06] transition-colors"
          >
            ← Terug naar canvas
          </button>
        </div>
      </div>

      {needsVoice && (
        <div className="mb-4 rounded-xl border border-purple-500/30 bg-purple-500/[0.06] p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-white font-medium">Voice-over nog niet gegenereerd</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Klik om de voice-over te maken met stem <span className="text-slate-200">{project.selected_voice ?? "Charlotte"}</span>. Kost 1 credit.
            </p>
          </div>
          <button
            type="button"
            onClick={generateVoice}
            disabled={voiceBusy}
            className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {voiceBusy ? "Bezig…" : "Genereer voice-over"}
          </button>
        </div>
      )}

      {voiceError && (
        <p className="mb-4 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
          {voiceError}
        </p>
      )}

      <Step6Editor
        project={project}
        onUpdate={updateProject}
        onBack={() => router.push(`/playground/${project.id}`)}
        plan={plan}
      />
    </div>
  );
}
