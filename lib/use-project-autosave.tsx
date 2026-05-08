"use client";

import { useEffect, useRef, useState } from "react";
import { Project } from "@/lib/types";

// Fields the wizard mutates that need to survive page reload
const PERSIST_FIELDS = [
  "scenes",
  "status",
  "title",
  "voice_audio_url",
  "selected_voice",
  "video_url",
  "bg_music_url",
  "script_text",
  "storyboard_text",
  "image_model",
  "video_model",
  "visual_style",
  "format",
  "language",
  "notes",
  "goal",
  "target_audience",
  "brand_kit_id",
  "style_reference_url",
  "character_reference_urls",
] as const;

function pickPersistable(project: Project): Partial<Project> {
  const out: Partial<Project> = {};
  for (const k of PERSIST_FIELDS) {
    if (project[k] !== undefined) {
      // @ts-expect-error - dynamic key access
      out[k] = project[k];
    }
  }
  return out;
}

export type AutosaveState = "idle" | "saving" | "saved" | "error";

/**
 * App-wide safety net: debounce-saves the project to /api/save-project
 * whenever the project state changes. Prevents data loss when step
 * components forget (or fail) to save explicitly.
 */
export function useProjectAutosave(project: Project): AutosaveState {
  const [state, setState] = useState<AutosaveState>("idle");
  const skipFirstRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (skipFirstRef.current) {
      skipFirstRef.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setState("saving");
      try {
        const res = await fetch("/api/save-project", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: project.id, ...pickPersistable(project) }),
        });
        setState(res.ok ? "saved" : "error");
      } catch {
        setState("error");
      }
    }, 800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [project]);

  return state;
}

export function AutosaveIndicator({ state }: { state: AutosaveState }) {
  if (state === "saving") return <span className="text-xs text-slate-500">Opslaan...</span>;
  if (state === "saved")  return <span className="text-xs text-emerald-400">Opgeslagen</span>;
  if (state === "error")  return <span className="text-xs text-red-400">Opslaan mislukt</span>;
  return null;
}
