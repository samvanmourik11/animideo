"use client";

import { useState } from "react";
import { Project, VisualStyle } from "@/lib/types";
import InsufficientCreditsModal from "@/components/InsufficientCreditsModal";

const LANGUAGES = [
  "English", "Dutch", "Spanish", "French", "German",
  "Portuguese", "Italian", "Japanese", "Chinese",
];

const VISUAL_STYLES: VisualStyle[] = [
  "Flat Illustration", "3D Render", "Realistic", "Whiteboard", "Cinematic",
];

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
}

export default function Step1Setup({ project, onUpdate, onNext }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creditModal, setCreditModal] = useState<{ credits: number; required: number } | null>(null);

  const fields = {
    title: project.title,
    goal: project.goal ?? "",
    target_audience: project.target_audience ?? "",
    language: project.language,
    format: project.format,
    visual_style: project.visual_style ?? "Flat Illustration",
  };

  function set(key: string, value: string) {
    onUpdate({ [key]: value } as Partial<Project>);
  }

  async function handleGenerateScript() {
    if (!fields.title || !fields.goal || !fields.target_audience) {
      setError("Please fill in Title, Goal, and Target Audience.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          title: fields.title,
          goal: fields.goal,
          targetAudience: fields.target_audience,
          language: fields.language,
          format: fields.format,
          visualStyle: fields.visual_style,
        }),
      });
      const data = await res.json();
      if (res.status === 402) {
        setCreditModal({ credits: data.credits, required: data.required });
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Script genereren mislukt");
      onUpdate({ scenes: data.scenes, status: "ScriptReady" });
      onNext();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {creditModal && (
        <InsufficientCreditsModal
          credits={creditModal.credits}
          required={creditModal.required}
          onClose={() => setCreditModal(null)}
        />
      )}
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Project instellen</h2>
        <p className="text-slate-500 mt-1 text-sm">
          Vul de details in. GPT-4 genereert automatisch een scene-voor-scene script.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="label">Video Title</label>
          <input
            className="input"
            placeholder="e.g. How Our Product Works"
            value={project.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>

        <div>
          <label className="label">Goal</label>
          <input
            className="input"
            placeholder="e.g. Explain our SaaS onboarding to new users"
            value={fields.goal}
            onChange={(e) => set("goal", e.target.value)}
          />
        </div>

        <div>
          <label className="label">Target Audience</label>
          <input
            className="input"
            placeholder="e.g. Small business owners aged 30-50"
            value={fields.target_audience}
            onChange={(e) => set("target_audience", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Language</label>
            <select
              className="input"
              value={project.language}
              onChange={(e) => set("language", e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Aspect Ratio</label>
            <select
              className="input"
              value={project.format}
              onChange={(e) => set("format", e.target.value)}
            >
              <option value="16:9">16:9 — Landscape</option>
              <option value="9:16">9:16 — Portrait</option>
            </select>
          </div>

          <div>
            <label className="label">Visual Style</label>
            <select
              className="input"
              value={fields.visual_style}
              onChange={(e) => set("visual_style", e.target.value)}
            >
              {VISUAL_STYLES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
      )}

      <div className="mt-8">
        <button
          className="btn-primary px-8 py-3 text-base"
          onClick={handleGenerateScript}
          disabled={loading}
        >
          {loading ? "Generating Script…" : "Generate Script →"}
        </button>
      </div>
    </div>
    </>
  );
}
