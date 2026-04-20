"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Project, VisualStyle, BrandKit, ImageModel } from "@/lib/types";
import InsufficientCreditsModal from "@/components/InsufficientCreditsModal";

const LANGUAGES = [
  "English", "Dutch", "Spanish", "French", "German",
  "Portuguese", "Italian", "Japanese", "Chinese",
];

const VISUAL_STYLES: VisualStyle[] = [
  "Cinematic",
  "Realistic",
  "Whiteboard",
  "2D Cartoon",
  "2D SaaS",
  "Motion Graphic",
  "3D Pixar",
  "3D Animatie",
];

const TONES = [
  "Inspirerend", "Zakelijk & Professioneel", "Urgent & Overtuigend",
  "Humoristisch & Luchtig", "Educatief & Informatief", "Emotioneel & Persoonlijk",
];

const COLOR_MOODS = [
  "Warm & Zonnig", "Koel & Professioneel", "Donker & Dramatisch",
  "Fris & Energiek", "Pastel & Zacht", "Levendig & Kleurrijk",
];

const DURATIONS = ["~30 seconden (4-5 scenes)", "~45 seconden (5-6 scenes)", "~60 seconden (6-8 scenes)"];

export interface AdvancedOptions {
  hook: string;
  keyMessage: string;
  cta: string;
  tone: string;
  mainCharacter: string;
  environment: string;
  colorMood: string;
  productDetails: string;
  keyBenefit1: string;
  keyBenefit2: string;
  keyBenefit3: string;
  avoidContent: string;
  durationPreference: string;
  extraNotes: string;
}

const emptyAdvanced: AdvancedOptions = {
  hook: "", keyMessage: "", cta: "", tone: "",
  mainCharacter: "", environment: "", colorMood: "",
  productDetails: "", keyBenefit1: "", keyBenefit2: "", keyBenefit3: "",
  avoidContent: "", durationPreference: "", extraNotes: "",
};

interface Props {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
  onNext: () => void;
}

export default function Step1Setup({ project, onUpdate, onNext }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creditModal, setCreditModal] = useState<{ credits: number; required: number } | null>(null);
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [selectedBrandKitId, setSelectedBrandKitId] = useState<string>(project.brand_kit_id ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advanced, setAdvanced] = useState<AdvancedOptions>(emptyAdvanced);
  const [imageModel, setImageModel] = useState<ImageModel>(
    (project.image_model as ImageModel) ?? "flux-schnell"
  );

  useEffect(() => {
    fetch("/api/brand-kits")
      .then((r) => r.json())
      .then((d) => setBrandKits(d.brandKits ?? []));
  }, []);

  const fields = {
    title: project.title,
    goal: project.goal ?? "",
    target_audience: project.target_audience ?? "",
    language: project.language,
    format: project.format,
    visual_style: project.visual_style ?? "Cinematic",
  };

  function set(key: string, value: string) {
    onUpdate({ [key]: value } as Partial<Project>);
  }

  function setAdv(key: keyof AdvancedOptions, value: string) {
    setAdvanced((prev) => ({ ...prev, [key]: value }));
  }

  const advancedFilledCount = Object.values(advanced).filter((v) => v.trim() !== "").length;

  async function handleGenerateScript() {
    if (!fields.title || !fields.goal || !fields.target_audience) {
      setError("Vul minimaal Titel, Doel en Doelgroep in.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      // Sla brand kit + image model op
      await fetch("/api/save-project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          brand_kit_id: selectedBrandKitId || null,
          image_model: imageModel,
        }),
      });
      onUpdate({ brand_kit_id: selectedBrandKitId || null, image_model: imageModel });

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
          brandKitId: selectedBrandKitId || null,
          advanced,
        }),
      });
      const data = await res.json();
      if (res.status === 402) {
        setCreditModal({ credits: data.credits, required: data.required });
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Script genereren mislukt");
      onUpdate({ scenes: data.scenes, status: "ScriptReady" });
      router.refresh();
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

          {/* Brand kit selector */}
          <div className="bg-blue-500/5 border border-blue-500/15 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-white">Huisstijl</label>
              <Link href="/brand/new" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                + Nieuwe aanmaken
              </Link>
            </div>
            <select
              className="input"
              value={selectedBrandKitId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedBrandKitId(id);
                const kit = brandKits.find((k) => k.id === id);
                if (kit) {
                  onUpdate({
                    language: kit.default_language,
                    format: kit.default_format as "16:9" | "9:16",
                  });
                }
              }}
            >
              <option value="">Geen huisstijl</option>
              {brandKits.map((kit) => (
                <option key={kit.id} value={kit.id}>{kit.name}</option>
              ))}
            </select>
            {selectedBrandKitId && (
              <p className="text-xs text-blue-400/70 mt-1.5">
                Kleuren, stijl en omgeving worden automatisch meegenomen in alle generaties.
              </p>
            )}
          </div>

          {/* Basis velden */}
          <div>
            <label className="label">Video titel</label>
            <input
              className="input"
              placeholder="bijv. Hoe werkt ons product?"
              value={project.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div>
            <label className="label">Doel van de video</label>
            <input
              className="input"
              placeholder="bijv. Onboarding uitleggen aan nieuwe gebruikers"
              value={fields.goal}
              onChange={(e) => set("goal", e.target.value)}
            />
          </div>

          <div>
            <label className="label">Doelgroep</label>
            <input
              className="input"
              placeholder="bijv. MKB-ondernemers van 30-50 jaar"
              value={fields.target_audience}
              onChange={(e) => set("target_audience", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Taal</label>
              <select className="input" value={project.language} onChange={(e) => set("language", e.target.value)}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Formaat</label>
              <select className="input" value={project.format} onChange={(e) => set("format", e.target.value)}>
                <option value="16:9">16:9 — Landschap</option>
                <option value="9:16">9:16 — Portret</option>
              </select>
            </div>
            <div>
              <label className="label">Visuele stijl</label>
              <select className="input" value={fields.visual_style} onChange={(e) => set("visual_style", e.target.value)}>
                {VISUAL_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Beeldgeneratie model */}
          <div>
            <label className="label">Beeldgeneratie model</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {([
                {
                  value: "flux-schnell" as ImageModel,
                  label: "Flux Schnell",
                  badge: "Snel",
                  badgeColor: "bg-emerald-500/15 text-emerald-400",
                  description: "Snel & goedkoop, goed voor prototypen",
                },
                {
                  value: "flux-pro" as ImageModel,
                  label: "Flux Pro Ultra",
                  badge: "Kwaliteit",
                  badgeColor: "bg-purple-500/15 text-purple-400",
                  description: "Maximale beeldkwaliteit, meer detail",
                },
                {
                  value: "seedream" as ImageModel,
                  label: "Seedream 4.0",
                  badge: "Tekst",
                  badgeColor: "bg-cyan-500/15 text-cyan-400",
                  description: "Kan tekst in beeld renderen, ByteDance",
                },
                {
                  value: "recraft" as ImageModel,
                  label: "Recraft v3",
                  badge: "Top",
                  badgeColor: "bg-pink-500/15 text-pink-400",
                  description: "Midjourney-niveau kwaliteit, rijke stijlen",
                },
                {
                  value: "dall-e-3" as ImageModel,
                  label: "DALL·E 3",
                  badge: "OpenAI",
                  badgeColor: "bg-blue-500/15 text-blue-400",
                  description: "Uitstekende promptopvolging, consistente stijl",
                },
              ] as const).map((m) => (
                <button
                  key={m.value}
                  type="button"
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

          {/* Geavanceerde opties toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Geavanceerde opties</span>
              {advancedFilledCount > 0 && (
                <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                  {advancedFilledCount} ingevuld
                </span>
              )}
            </div>
            <svg
              className={`w-4 h-4 text-slate-500 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showAdvanced && (
            <div className="border border-white/[0.08] rounded-2xl p-5 space-y-6 bg-white/[0.02]">
              <p className="text-xs text-slate-500">
                Alles hieronder is optioneel. De AI gebruikt wat je invult en slaat lege velden over.
              </p>

              {/* Verhaal & Boodschap */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Verhaal &amp; Boodschap</h3>

                <div>
                  <label className="label">Openingshaak</label>
                  <input
                    className="input"
                    placeholder="bijv. 'Elke dag verliezen bedrijven €500 door dit ene probleem...'"
                    value={advanced.hook}
                    onChange={(e) => setAdv("hook", e.target.value)}
                  />
                  <p className="text-xs text-slate-400 mt-1">Het eerste beeld of de eerste zin die direct aandacht trekt.</p>
                </div>

                <div>
                  <label className="label">Kernboodschap</label>
                  <input
                    className="input"
                    placeholder="bijv. 'Onze app bespaart je 2 uur per dag'"
                    value={advanced.keyMessage}
                    onChange={(e) => setAdv("keyMessage", e.target.value)}
                  />
                  <p className="text-xs text-slate-400 mt-1">Wat moet de kijker onthouden na het zien van de video?</p>
                </div>

                <div>
                  <label className="label">Call-to-action</label>
                  <input
                    className="input"
                    placeholder="bijv. 'Bezoek onze website en start gratis'"
                    value={advanced.cta}
                    onChange={(e) => setAdv("cta", e.target.value)}
                  />
                  <p className="text-xs text-slate-400 mt-1">Wat moet de kijker doen na de video? Wordt de laatste scene.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Toon</label>
                    <select className="input" value={advanced.tone} onChange={(e) => setAdv("tone", e.target.value)}>
                      <option value="">— Geen voorkeur —</option>
                      {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Gewenste lengte</label>
                    <select className="input" value={advanced.durationPreference} onChange={(e) => setAdv("durationPreference", e.target.value)}>
                      <option value="">— Geen voorkeur —</option>
                      {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Visuele details */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Visuele Details</h3>

                <div>
                  <label className="label">Hoofdpersoon</label>
                  <input
                    className="input"
                    placeholder="bijv. 'Vrouw van ~35, professioneel maar toegankelijk, zakelijke kleding'"
                    value={advanced.mainCharacter}
                    onChange={(e) => setAdv("mainCharacter", e.target.value)}
                  />
                  <p className="text-xs text-slate-400 mt-1">Beschrijving van een terugkerende persoon in de video (optioneel).</p>
                </div>

                <div>
                  <label className="label">Terugkerende omgeving</label>
                  <input
                    className="input"
                    placeholder="bijv. 'Modern licht kantoor, grote ramen, planten'"
                    value={advanced.environment}
                    onChange={(e) => setAdv("environment", e.target.value)}
                  />
                  <p className="text-xs text-slate-400 mt-1">Locatie of setting die door de video heen terugkomt.</p>
                </div>

                <div>
                  <label className="label">Kleursfeer</label>
                  <select className="input" value={advanced.colorMood} onChange={(e) => setAdv("colorMood", e.target.value)}>
                    <option value="">— Geen voorkeur —</option>
                    {COLOR_MOODS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Inhoud */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Inhoud &amp; Product</h3>

                <div>
                  <label className="label">Product / dienst details</label>
                  <textarea
                    className="input resize-none text-sm"
                    rows={3}
                    placeholder="bijv. 'Een mobiele app die facturen automatisch scant en verwerkt. Werkt met iOS en Android. Integreert met Exact en Moneybird.'"
                    value={advanced.productDetails}
                    onChange={(e) => setAdv("productDetails", e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">Voordelen om te benadrukken</label>
                  <div className="space-y-2">
                    {(["keyBenefit1", "keyBenefit2", "keyBenefit3"] as const).map((key, i) => (
                      <input
                        key={key}
                        className="input text-sm"
                        placeholder={`Voordeel ${i + 1} — bijv. 'Bespaart 2 uur per week'`}
                        value={advanced[key]}
                        onChange={(e) => setAdv(key, e.target.value)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label">Wat mag er NIET in?</label>
                  <input
                    className="input"
                    placeholder="bijv. 'Geen concurrenten noemen, geen prijzen tonen, geen medische claims'"
                    value={advanced.avoidContent}
                    onChange={(e) => setAdv("avoidContent", e.target.value)}
                  />
                </div>
              </div>

              {/* Vrije instructies */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Extra instructies</h3>
                <textarea
                  className="input resize-none text-sm"
                  rows={3}
                  placeholder="Alles wat je verder wilt meegeven aan de AI. bijv. 'Begin met een statistiek', 'Gebruik een metafoor van een reis', 'Verwerk de slogan: Slimmer werken, meer leven'"
                  value={advanced.extraNotes}
                  onChange={(e) => setAdv("extraNotes", e.target.value)}
                />
              </div>
            </div>
          )}
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
            {loading ? "Script genereren…" : "Script genereren →"}
          </button>
        </div>
      </div>
    </>
  );
}
