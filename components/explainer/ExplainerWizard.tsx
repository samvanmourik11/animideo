"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Project } from "@/lib/types";
import type { ExplainerSpec, ExplainerScene, ExplainerStyle } from "@/lib/explainer/spec";
import { EXPLAINER_ILLUSTRATIONS, EXPLAINER_STYLES } from "@/lib/explainer/schema";
import Stepper from "@/components/wizard/Stepper";
import { useProjectAutosave, AutosaveIndicator } from "@/lib/use-project-autosave";
import PdfUploadButton from "@/components/infographics/PdfUploadButton";
import ExplainerStage from "@/components/explainer/ExplainerStage";
import IconPicker from "@/components/explainer/IconPicker";

const STEPS = ["Invoer", "Scenes", "Export"];
const VOICES = ["Charlotte", "Sarah", "Alice", "Matilda", "Daniel", "Brian", "George"];

export default function ExplainerWizard({ initialProject }: { initialProject: Project }) {
  const [project, setProject] = useState<Project>(initialProject);
  const [step, setStep] = useState(initialProject.explainer_spec ? 1 : 0);
  const saveState = useProjectAutosave(project);

  function updateProject(updates: Partial<Project>) {
    setProject((prev) => ({ ...prev, ...updates }));
  }
  const maxReached = project.explainer_spec ? STEPS.length - 1 : 0;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
              explainer
            </span>
            <h1 className="text-xl font-bold text-white truncate">{project.title}</h1>
          </div>
          <p className="text-xs text-slate-500 line-clamp-1">{project.format}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-1">
        <Stepper steps={STEPS} current={step} onSelect={setStep} maxReached={maxReached} />
        <div className="shrink-0"><AutosaveIndicator state={saveState} /></div>
      </div>

      <div className="mt-6">
        {step === 0 && <StepInput project={project} onUpdate={updateProject} onNext={() => setStep(1)} />}
        {step === 1 && project.explainer_spec && (
          <StepScenes project={project} onUpdate={updateProject} onBack={() => setStep(0)} onNext={() => setStep(2)} />
        )}
        {step === 2 && project.explainer_spec && (
          <StepExport project={project} onUpdate={updateProject} onBack={() => setStep(1)} />
        )}
      </div>
    </div>
  );
}

// ── Stap 1: invoer + genereren ───────────────────────────────────────────────
const LENGTHS = [20, 30, 45, 60, 90, 120];

function StepInput({ project, onUpdate, onNext }: { project: Project; onUpdate: (u: Partial<Project>) => void; onNext: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetSeconds, setTargetSeconds] = useState(60);

  async function generate() {
    if ((project.notes ?? "").trim().length < 30) {
      setError("Voeg eerst wat meer info of een script toe.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/explainer/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, targetSeconds }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error === "insufficient_credits" ? "Onvoldoende credits." : json.error || "Genereren mislukt.");
        setLoading(false);
        return;
      }
      onUpdate({ explainer_spec: json.spec as ExplainerSpec, status: "ScriptReady" });
      setLoading(false);
      onNext();
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="flex items-end justify-between gap-3 mb-2">
          <label className="block text-sm font-medium text-slate-200">Info of voice-over script</label>
          <PdfUploadButton
            onExtracted={(text) =>
              onUpdate({ notes: (project.notes ?? "").trim() ? (project.notes ?? "").trim() + "\n\n" + text : text })
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
          De AI knipt dit in scenes, kiest per scene een flat illustratie en icoon-callouts, en schrijft de voice-over.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <label className="text-sm font-medium text-slate-200">Videolengte</label>
          <select
            value={targetSeconds}
            onChange={(e) => setTargetSeconds(Number(e.target.value))}
            className="bg-slate-900/60 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-white"
          >
            {LENGTHS.map((s) => <option key={s} value={s}>{s} seconden</option>)}
          </select>
          <span className="text-[11px] text-slate-500">de AI schrijft de voice-over op deze duur</span>
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button onClick={generate} disabled={loading} className="btn-primary text-sm">
          {loading ? "Bezig met genereren…" : project.explainer_spec ? "Opnieuw genereren" : "Genereer explainer"}
        </button>
        {project.explainer_spec && !loading && (
          <button onClick={onNext} className="text-sm text-slate-300 hover:text-white">Naar scenes →</button>
        )}
      </div>
    </div>
  );
}

// ── Stap 2: scenes previewen + bewerken ──────────────────────────────────────
const inputCls = "w-full bg-slate-900/60 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-white";

function StepScenes({
  project,
  onUpdate,
  onBack,
  onNext,
}: {
  project: Project;
  onUpdate: (u: Partial<Project>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const spec = project.explainer_spec as ExplainerSpec;
  const [sel, setSel] = useState(0);
  const [instruction, setInstruction] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const scene = spec.scenes[sel];
  const isText = scene.template === "title" || scene.template === "outro";

  function updateScene(patch: Partial<ExplainerScene>) {
    const scenes = spec.scenes.map((s, i) => (i === sel ? { ...s, ...patch } : s));
    onUpdate({ explainer_spec: { ...spec, scenes } });
  }
  function setCallouts(callouts: ExplainerScene["callouts"]) {
    updateScene({ callouts });
  }

  async function applyAi() {
    if (!instruction.trim() || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch("/api/explainer/edit-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, sceneIndex: sel, instruction }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAiError(json.error === "insufficient_credits" ? "Onvoldoende credits." : json.error || "Aanpassen mislukt.");
        setAiBusy(false);
        return;
      }
      onUpdate({ explainer_spec: json.spec });
      setInstruction("");
      setAiBusy(false);
    } catch {
      setAiError("Er ging iets mis.");
      setAiBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
        <label className="text-xs font-medium text-slate-300">Stijl van de video</label>
        <select
          value={spec.style ?? "flat"}
          onChange={(e) => onUpdate({ explainer_spec: { ...spec, style: e.target.value as ExplainerStyle } })}
          className="bg-slate-900/60 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-white"
        >
          {EXPLAINER_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-[11px] text-slate-500">past alle scenes in één keer aan</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
        {/* scene-lijst */}
        <div className="space-y-2">
          {spec.scenes.map((sc, i) => (
            <button
              key={sc.id}
              onClick={() => setSel(i)}
              className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                i === sel ? "border-amber-500/60 bg-amber-500/10" : "border-white/10 bg-white/5 hover:bg-white/[0.07]"
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">{i + 1}. {sc.template}</span>
              <p className="text-xs text-slate-300 line-clamp-2 mt-0.5">{sc.narration}</p>
              {sc.callouts.length > 0 && (
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{sc.callouts.map((c) => c.label).join(" · ")}</p>
              )}
            </button>
          ))}
        </div>

        {/* preview + bewerken */}
        <div className="space-y-4">
          <div className="rounded-xl overflow-hidden border border-white/10 bg-black [&_svg]:!w-full [&_svg]:!h-auto">
            <ExplainerStage spec={spec} sceneIndex={sel} progress={1} />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Scene {sel + 1} bewerken</h3>
              <span className="text-[11px] text-slate-500">wijzigingen worden automatisch opgeslagen</span>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Voice-over tekst</label>
              <textarea value={scene.narration} onChange={(e) => updateScene({ narration: e.target.value })} rows={2} className={inputCls} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Titel</label>
                <input value={scene.title ?? ""} onChange={(e) => updateScene({ title: e.target.value })} className={inputCls} />
              </div>
              {isText ? (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Subtitel</label>
                  <input value={scene.subtitle ?? ""} onChange={(e) => updateScene({ subtitle: e.target.value })} className={inputCls} />
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Centrale illustratie</label>
                  <select value={scene.center} onChange={(e) => updateScene({ center: e.target.value as ExplainerScene["center"] })} className={inputCls}>
                    {EXPLAINER_ILLUSTRATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Achtergrondkleur</label>
              <div className="flex items-center gap-2 max-w-[220px]">
                <input type="color" value={scene.bg} onChange={(e) => updateScene({ bg: e.target.value })} className="h-9 w-12 bg-transparent rounded-md border border-white/10" />
                <input value={scene.bg} onChange={(e) => updateScene({ bg: e.target.value })} className={inputCls} />
              </div>
            </div>

            {!isText && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Callouts (icoon + label)</label>
                <div className="space-y-2">
                  {scene.callouts.map((c, ci) => (
                    <div key={ci} className="flex items-center gap-2">
                      <IconPicker
                        value={c.icon}
                        onChange={(icon) => setCallouts(scene.callouts.map((x, j) => (j === ci ? { ...x, icon } : x)))}
                      />
                      <input
                        value={c.label}
                        onChange={(e) => setCallouts(scene.callouts.map((x, j) => (j === ci ? { ...x, label: e.target.value } : x)))}
                        className={inputCls}
                      />
                      <button
                        onClick={() => setCallouts(scene.callouts.filter((_, j) => j !== ci))}
                        className="text-slate-500 hover:text-red-400 text-lg leading-none px-1"
                        title="Verwijderen"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {scene.callouts.length < 6 && (
                    <button
                      onClick={() => setCallouts([...scene.callouts, { icon: "check", label: "Nieuw" }])}
                      className="text-xs bg-white/10 hover:bg-white/15 text-white px-3 py-1.5 rounded-md"
                    >
                      + Callout
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-white/10">
              <label className="block text-xs text-slate-400 mb-1">Of: pas aan met AI</label>
              <div className="flex items-center gap-2">
                <input
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") applyAi(); }}
                  disabled={aiBusy}
                  placeholder="Bijv. maak er een vergelijking 2024 vs 2025 van, of voeg een GPS-icoon toe"
                  className={inputCls}
                />
                <button
                  onClick={applyAi}
                  disabled={aiBusy || !instruction.trim()}
                  className="btn-primary text-xs whitespace-nowrap disabled:opacity-50"
                >
                  {aiBusy ? "Bezig…" : "Pas aan"}
                </button>
              </div>
              {aiError && <p className="text-xs text-red-400 mt-1">{aiError}</p>}
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Statische preview van scene {sel + 1}. In de geexporteerde video animeren de iconen in en is er voice-over.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm bg-white/10 hover:bg-white/15 text-white px-4 py-2 rounded-md">← Terug</button>
        <button onClick={onNext} className="btn-primary text-sm">Naar export →</button>
      </div>
    </div>
  );
}

// ── Stap 3: voice (met preview) + export ─────────────────────────────────────
function StepExport({ project, onUpdate, onBack }: { project: Project; onUpdate: (u: Partial<Project>) => void; onBack: () => void }) {
  const router = useRouter();
  const [voice, setVoice] = useState(VOICES[0]);
  const [busy, setBusy] = useState<null | "editor" | "mp4">(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function preview(v: string) {
    setPreviewing(v);
    try {
      const res = await fetch("/api/explainer/voice-sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: v }),
      });
      const json = await res.json();
      if (json.url) {
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.src = json.url;
        await audioRef.current.play().catch(() => {});
      }
    } catch {
      /* stil */
    }
    setPreviewing(null);
  }

  async function exportTo(kind: "editor" | "mp4") {
    setError(null);
    setBusy(kind);
    try {
      const url = kind === "editor" ? "/api/explainer/export-to-editor" : "/api/explainer/export";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, voice }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error === "insufficient_credits" ? "Onvoldoende credits." : json.error || "Export mislukt.");
        setBusy(null);
        return;
      }
      if (kind === "editor") {
        router.push(`/editor/${json.editorId}`);
        return;
      }
      onUpdate({ video_url: json.url as string, status: "Done" });
      setBusy(null);
    } catch {
      setError("Er ging iets mis tijdens de export.");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Voice-over stem</label>
          <div className="space-y-1.5">
            {VOICES.map((v) => (
              <div
                key={v}
                onClick={() => setVoice(v)}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                  voice === v ? "border-amber-500/60 bg-amber-500/10" : "border-white/10 bg-white/5 hover:bg-white/[0.07]"
                }`}
              >
                <span className="flex items-center gap-2 text-sm text-white">
                  <span className={`w-3.5 h-3.5 rounded-full border ${voice === v ? "bg-amber-400 border-amber-400" : "border-white/30"}`} />
                  {v}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); preview(v); }}
                  className="text-xs bg-white/10 hover:bg-white/15 text-white px-2.5 py-1 rounded-md"
                >
                  {previewing === v ? "Laden…" : "▶ Beluister"}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button onClick={() => exportTo("editor")} disabled={busy !== null} className="btn-primary text-sm disabled:opacity-50">
            {busy === "editor" ? "Naar editor… (kan een minuut duren)" : "Open in editor"}
          </button>
          <button onClick={() => exportTo("mp4")} disabled={busy !== null} className="text-sm bg-white/10 hover:bg-white/15 text-white px-4 py-2 rounded-md disabled:opacity-50">
            {busy === "mp4" ? "MP4 renderen…" : "Direct als MP4"}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Open in editor zet elke scene als clip en de voice-over per scene als losse audio-track, zodat je alles nog kunt bewerken.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {project.video_url && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
          <p className="text-sm font-medium text-emerald-400">MP4 klaar</p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={project.video_url} controls className="w-full rounded-lg border border-white/10" />
          <a href={project.video_url} download className="inline-block btn-primary text-sm">Download MP4</a>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm bg-white/10 hover:bg-white/15 text-white px-4 py-2 rounded-md">← Terug</button>
      </div>
    </div>
  );
}
