"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PdfUploadButton from "@/components/infographics/PdfUploadButton";

const FORMATS = [
  { value: "16:9", label: "Liggend (16:9) - presentatie, web" },
  { value: "9:16", label: "Staand (9:16) - reels, stories" },
] as const;

export default function ExplainerCreateForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [format, setFormat] = useState<"16:9" | "9:16">("16:9");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (source.trim().length < 30) {
      setError("Plak wat meer info of een script (minimaal een paar zinnen).");
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { data: project, error: insErr } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        title: title.trim() || "Naamloze explainer",
        language: "Dutch",
        format,
        status: "Draft",
        mode: "explainer",
        notes: source.trim(),
      })
      .select()
      .single();

    if (insErr || !project) {
      setError("Kon project niet aanmaken: " + (insErr?.message ?? "onbekende fout"));
      setLoading(false);
      return;
    }
    router.push(`/explainer/${project.id}`);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Titel / onderwerp</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Bijv. Hoe onze sensor je vracht beschermt"
            className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
        </div>

        <div>
          <div className="flex items-end justify-between gap-3 mb-2">
            <label className="block text-sm font-medium text-slate-200">
              Info of voice-over script <span className="text-slate-500 font-normal">(plak je tekst of een PDF)</span>
            </label>
            <PdfUploadButton onExtracted={(text) => setSource((prev) => (prev.trim() ? prev.trim() + "\n\n" + text : text))} />
          </div>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={9}
            placeholder={"Beschrijf je product of dienst, of plak een kant-en-klaar voice-over script.\n\nDe AI knipt het in scenes, kiest per scene een passende flat illustratie en icoon-callouts, en schrijft de voice-over."}
            className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 leading-relaxed"
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Flat animated explainer in de stijl van moderne uitleg-video&apos;s. Geen cartoon-poppetjes, wel beweging, iconen en een ingesproken voice-over.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">Formaat</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "16:9" | "9:16")}
            className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button onClick={create} disabled={loading} className="btn-primary text-sm">
        {loading ? "Aanmaken…" : "Explainer starten"}
      </button>
    </div>
  );
}
