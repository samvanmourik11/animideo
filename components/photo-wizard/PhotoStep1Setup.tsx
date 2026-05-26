"use client";

import { useState } from "react";
import { Project, VisualStyle } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import StylePicker from "@/components/StylePicker";

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
}

export default function PhotoStep1Setup({ project, onUpdate, onNext }: Props) {
  const [title, setTitle]   = useState(project.title === "Untitled Project" ? "" : project.title);
  const [format, setFormat] = useState<"16:9" | "9:16">(project.format ?? "16:9");
  const [style, setStyle]   = useState<VisualStyle>(project.visual_style ?? "Cartoon");
  const [saving, setSaving] = useState(false);

  async function handleNext() {
    if (!title.trim()) return;
    setSaving(true);
    await fetch("/api/save-project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        title: title.trim(),
        format,
        visual_style: style,
      }),
    });
    onUpdate({ title: title.trim(), format, visual_style: style });
    setSaving(false);
    onNext();
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Project instellen</h2>
        <p className="text-sm text-slate-500">Geef je project een naam en kies de animatiestijl.</p>
      </div>

      {/* Titel */}
      <div>
        <label className="label">Projectnaam</label>
        <input
          type="text"
          className="input"
          placeholder="Bijv. Team introductievideo"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* Format */}
      <div>
        <label className="label">Video formaat</label>
        <div className="flex gap-3">
          {(["16:9", "9:16"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                format === f
                  ? "border-blue-500 bg-blue-500/10 text-blue-300"
                  : "border-white/10 text-slate-400 hover:border-white/20"
              }`}
            >
              {f === "16:9" ? "🖥 Landscape (16:9)" : "📱 Portrait (9:16)"}
            </button>
          ))}
        </div>
      </div>

      {/* Animatiestijl */}
      <StylePicker value={style} onChange={setStyle} label="Animatiestijl" />

      <button
        onClick={handleNext}
        disabled={!title.trim() || saving}
        className="btn-primary w-full"
      >
        {saving ? "Opslaan…" : "Verder →"}
      </button>
    </div>
  );
}
