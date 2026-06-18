"use client";

import { useState } from "react";
import { Project, InfographicSpec } from "@/lib/types";
import PdfUploadButton from "./PdfUploadButton";

export default function InfographicStepInput({
  project,
  onUpdate,
  onNext,
}: {
  project: Project;
  onUpdate: (u: Partial<Project>) => void;
  onNext: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if ((project.notes ?? "").trim().length < 20) {
      setError("Voeg eerst wat meer tekst of data toe.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/infographics/generate-spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error === "insufficient_credits" ? "Onvoldoende credits." : json.error || "Genereren mislukt.");
        setLoading(false);
        return;
      }
      onUpdate({ infographic_spec: json.spec as InfographicSpec, status: "ScriptReady" });
      setLoading(false);
      onNext();
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Titel / onderwerp</label>
          <input
            value={project.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>

        <div>
          <div className="flex items-end justify-between gap-3 mb-2">
            <label className="block text-sm font-medium text-slate-200">Tekst of data</label>
            <PdfUploadButton
              onExtracted={(text) =>
                onUpdate({
                  notes: (project.notes ?? "").trim()
                    ? (project.notes ?? "").trim() + "\n\n" + text
                    : text,
                })
              }
            />
          </div>
          <textarea
            value={project.notes ?? ""}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            rows={10}
            className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white leading-relaxed"
          />
          <p className="text-xs text-slate-500 mt-1.5">
            De AI haalt hier de cijfers en feiten uit en zet ze om in een gestructureerde infographic.
            Tekst en getallen worden daarna scherp gerenderd, niet door een beeldmodel.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={generate} disabled={loading} className="btn-primary text-sm">
          {loading ? "Bezig met genereren…" : project.infographic_spec ? "Opnieuw genereren" : "Genereer infographic"}
        </button>
        {project.infographic_spec && !loading && (
          <button onClick={onNext} className="text-sm text-slate-300 hover:text-white">
            Naar bewerken →
          </button>
        )}
      </div>
    </div>
  );
}
