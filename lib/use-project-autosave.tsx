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
  "outro_logo_url",
  "outro_contact",
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
  const abortRef = useRef<AbortController | null>(null);
  // Monotonic save sequence so an in-flight slow save's response can never
  // clobber a newer save's state, and a stale PATCH cannot overwrite the DB.
  const seqRef = useRef(0);
  // Is there an edit that has not yet been confirmed saved?
  const dirtyRef = useRef(false);
  // Always-current project so the unmount / tab-close flush writes the latest edit.
  const latestRef = useRef(project);
  latestRef.current = project;

  // Kept in a ref so the mount-once flush effect always calls the latest closure
  // instead of capturing a stale project.
  const runSaveRef = useRef<(p: Project, opts?: { keepalive?: boolean }) => void>(() => {});
  runSaveRef.current = async (p: Project, opts?: { keepalive?: boolean }) => {
    const mySeq = ++seqRef.current;
    // Abort the *previous* in-flight save: it carries older data and could land
    // after this one and overwrite the DB with stale content.
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState("saving");
    try {
      const res = await fetch("/api/save-project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id, ...pickPersistable(p) }),
        signal: controller.signal,
        // Lets the request finish even when the page is unloading.
        keepalive: opts?.keepalive,
      });
      if (mySeq !== seqRef.current) return; // a newer save already started/finished
      dirtyRef.current = false;
      setState(res.ok ? "saved" : "error");
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (mySeq !== seqRef.current) return;
      setState("error");
    }
  };

  // Debounced save on every change.
  useEffect(() => {
    if (skipFirstRef.current) {
      skipFirstRef.current = false;
      return;
    }
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      runSaveRef.current(project);
    }, 800);
    // IMPORTANT: cleanup only cancels the pending debounce timer. We deliberately
    // do NOT abort an in-flight save on unmount/navigation here. Aborting on
    // unmount is exactly what made the user's last edit silently disappear.
    // Superseded saves are aborted inside runSave when a newer save starts.
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [project]);

  // Safety net: if the wizard unmounts (step remount / internal navigation) or the
  // tab is hidden or closed while an edit is still inside the 800ms debounce window,
  // flush it immediately so "automatisch opgeslagen" is actually true.
  useEffect(() => {
    function flush() {
      if (!dirtyRef.current) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      runSaveRef.current(latestRef.current, { keepalive: true });
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") flush();
    }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

export function AutosaveIndicator({ state }: { state: AutosaveState }) {
  if (state === "saving") return <span className="text-xs text-slate-500">Opslaan...</span>;
  if (state === "saved")  return <span className="text-xs text-emerald-400">Opgeslagen</span>;
  if (state === "error")  return <span className="text-xs text-red-400">Opslaan mislukt</span>;
  return null;
}
