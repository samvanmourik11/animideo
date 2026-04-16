"use client";

import { useState } from "react";
import { Project, VisualStyle, ImageModel } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

const ANIMATION_STYLES: { value: VisualStyle; label: string; description: string }[] = [
  { value: "2D Cartoon",     label: "2D Cartoon",     description: "Kurzgesagt-stijl, kleurrijke platte kleuren" },
  { value: "3D Pixar",       label: "3D Pixar",       description: "Pixar CGI-stijl, vriendelijke 3D karakters" },
  { value: "Whiteboard",     label: "Whiteboard",     description: "RSA Animate-stijl, zwart op wit" },
  { value: "2D SaaS",        label: "2D SaaS",        description: "Flat design, Stripe/Linear-stijl" },
  { value: "Motion Graphic", label: "Motion Graphic", description: "Geometrische vormen, grafisch design" },
  { value: "3D Animatie",    label: "3D Animatie",    description: "Fotorealistisch 3D CGI, Unreal Engine-kwaliteit" },
];

const IMAGE_MODELS: { value: ImageModel; label: string; badge: string; badgeColor: string; description: string }[] = [
  {
    value: "flux-schnell",
    label: "Flux Schnell",
    badge: "Snel",
    badgeColor: "bg-emerald-500/15 text-emerald-400",
    description: "Snel & goedkoop, goed voor prototypen",
  },
  {
    value: "flux-pro",
    label: "Flux Pro Ultra",
    badge: "Kwaliteit",
    badgeColor: "bg-purple-500/15 text-purple-400",
    description: "Maximale beeldkwaliteit, meer detail",
  },
  {
    value: "controlnet",
    label: "ControlNet",
    badge: "Compositie",
    badgeColor: "bg-orange-500/15 text-orange-400",
    description: "Bewaart compositie exact via edge detection",
  },
  {
    value: "dall-e-3",
    label: "DALL·E 3",
    badge: "Tekst→Beeld",
    badgeColor: "bg-blue-500/15 text-blue-400",
    description: "Geen foto-referentie, puur op prompt",
  },
];

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
}

export default function PhotoStep1Setup({ project, onUpdate, onNext }: Props) {
  const [title, setTitle]   = useState(project.title === "Untitled Project" ? "" : project.title);
  const [format, setFormat] = useState<"16:9" | "9:16">(project.format ?? "16:9");
  const [style, setStyle]   = useState<VisualStyle>(
    (project.visual_style && project.visual_style !== "Cinematic" && project.visual_style !== "Realistic")
      ? project.visual_style
      : "2D Cartoon"
  );
  const [imageModel, setImageModel] = useState<ImageModel>(
    (project.image_model as ImageModel) ?? "flux-schnell"
  );
  const [saving, setSaving] = useState(false);

  async function handleNext() {
    if (!title.trim()) return;
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("projects")
      .update({ title: title.trim(), format, visual_style: style, image_model: imageModel })
      .eq("id", project.id);
    onUpdate({ title: title.trim(), format, visual_style: style, image_model: imageModel });
    setSaving(false);
    onNext();
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Project instellen</h2>
        <p className="text-sm text-slate-500">Geef je project een naam, kies de animatiestijl en het transformatiemodel.</p>
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
      <div>
        <label className="label">Animatiestijl</label>
        <div className="grid grid-cols-2 gap-3">
          {ANIMATION_STYLES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStyle(s.value)}
              className={`text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                style === s.value
                  ? "border-blue-500 bg-blue-500/10 text-white"
                  : "border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300"
              }`}
            >
              <p className="font-medium">{s.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Transformatiemodel */}
      <div>
        <label className="label">Transformatiemodel</label>
        <div className="grid grid-cols-3 gap-3">
          {IMAGE_MODELS.map((m) => (
            <button
              key={m.value}
              onClick={() => setImageModel(m.value)}
              className={`text-left p-3 rounded-xl border transition-all ${
                imageModel === m.value
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-white/10 hover:border-white/20"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-white">{m.label}</p>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${m.badgeColor}`}>{m.badge}</span>
              </div>
              <p className="text-xs text-slate-500">{m.description}</p>
            </button>
          ))}
        </div>
      </div>

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
