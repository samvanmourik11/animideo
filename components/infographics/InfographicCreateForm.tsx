"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandKit } from "@/lib/types";
import PdfUploadButton from "./PdfUploadButton";

const FORMATS = [
  { value: "9:16", label: "Staand (9:16) - social, poster" },
  { value: "16:9", label: "Liggend (16:9) - presentatie, scherm" },
] as const;

export default function InfographicCreateForm({
  userId,
  brandKits,
}: {
  userId: string;
  brandKits: BrandKit[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [data, setData] = useState("");
  const [format, setFormat] = useState<"9:16" | "16:9">("9:16");
  const [brandKitId, setBrandKitId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyBrandKit(id: string) {
    setBrandKitId(id);
    const kit = brandKits.find((k) => k.id === id);
    if (kit && (kit.default_format === "9:16" || kit.default_format === "16:9")) {
      setFormat(kit.default_format);
    }
  }

  async function create() {
    if (data.trim().length < 20) {
      setError("Plak wat meer tekst of data (minimaal een paar zinnen met cijfers).");
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data: project, error: insErr } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        title: title.trim() || "Naamloze infographic",
        language: "Dutch",
        format,
        status: "Draft",
        mode: "infographics",
        notes: data.trim(),
        brand_kit_id: brandKitId || null,
      })
      .select()
      .single();

    if (insErr || !project) {
      setError("Kon project niet aanmaken: " + (insErr?.message ?? "onbekende fout"));
      setLoading(false);
      return;
    }
    router.push(`/infographics/${project.id}`);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Titel / onderwerp</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Bijv. Omzetgroei 2025"
            className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
        </div>

        <div>
          <div className="flex items-end justify-between gap-3 mb-2">
            <label className="block text-sm font-medium text-slate-200">
              Tekst of data <span className="text-slate-500 font-normal">(plak hier je cijfers, feiten of een stuk tekst)</span>
            </label>
            <PdfUploadButton
              onExtracted={(text) =>
                setData((prev) => (prev.trim() ? prev.trim() + "\n\n" + text : text))
              }
            />
          </div>
          <textarea
            value={data}
            onChange={(e) => setData(e.target.value)}
            rows={9}
            placeholder={"Plak hier de cijfers en feiten waar de infographic op gebaseerd moet worden.\n\nBijv.: In 2025 groeide de omzet met 38% naar 12,4 miljoen euro. Het klanttevredenheidscijfer steeg van 7,2 naar 8,6. 73% van de klanten beveelt ons aan..."}
            className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 leading-relaxed"
          />
          <p className="text-xs text-slate-500 mt-1.5">
            De AI gebruikt alleen cijfers die echt in deze tekst staan. Hoe concreter de data, hoe scherper de infographic.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">Formaat</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as "9:16" | "16:9")}
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Huisstijl <span className="text-slate-500 font-normal">(optioneel)</span>
            </label>
            <select
              value={brandKitId}
              onChange={(e) => applyBrandKit(e.target.value)}
              className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Geen huisstijl</option>
              {brandKits.map((k) => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1.5">
              {brandKits.length === 0
                ? "Beheer huisstijlen via Brand Kits"
                : "Gebruikt de merkkleuren en het logo in de infographic"}
            </p>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button onClick={create} disabled={loading} className="btn-primary text-sm">
        {loading ? "Aanmaken…" : "Infographic starten"}
      </button>
    </div>
  );
}
