"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import StylePicker from "@/components/StylePicker";
import type { VisualStyle } from "@/lib/types";

export default function PlaygroundEntryPage() {
  const router = useRouter();
  const [withBrief, setWithBrief] = useState(false);
  const [brief, setBrief] = useState("");
  const [format, setFormat] = useState<"16:9" | "9:16">("16:9");
  const [visualStyle, setVisualStyle] = useState<VisualStyle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function start(useBrief: boolean) {
    setError("");
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { data, error: insErr } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        title: "Playground " + new Date().toLocaleDateString("nl-NL"),
        mode: "playground",
        format,
        visual_style: visualStyle,
        language: "Dutch",
        status: "Draft",
        notes: useBrief ? brief.trim() || null : null,
      })
      .select("id")
      .single();

    if (insErr || !data) {
      setError(insErr?.message ?? "Aanmaken mislukt");
      setLoading(false);
      return;
    }
    router.push(`/playground/${data.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-blue-300 bg-clip-text text-transparent mb-1">
          Playground
        </h1>
        <p className="text-slate-500 text-sm">
          Vrij spelen met beelden. Genereer, klik en stuur bij. Geen vaste volgorde.
        </p>
      </div>

      {/* Formaat */}
      <div className="card mb-5">
        <label className="label">Formaat</label>
        <div className="flex gap-2">
          {(["16:9", "9:16"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                format === f
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                  : "text-slate-400 border-white/10 hover:text-white"
              }`}
            >
              {f === "16:9" ? "Liggend 16:9" : "Staand 9:16"}
            </button>
          ))}
        </div>
      </div>

      {/* Stijl */}
      <div className="card mb-5">
        <StylePicker
          value={visualStyle}
          onChange={setVisualStyle}
          label="Stijl (optioneel — bepaalt de look van alle beelden)"
        />
      </div>

      {/* Keuze: blanco of met brief */}
      <div className="grid sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => start(false)}
          disabled={loading}
          className="card-hover text-left disabled:opacity-50"
        >
          <div className="text-2xl mb-2">⚡</div>
          <h2 className="font-bold text-white">Blanco beginnen</h2>
          <p className="text-sm text-slate-500 mt-1">
            Leeg vlak, meteen spelen. Richting geef je wanneer jij wilt.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setWithBrief((v) => !v)}
          disabled={loading}
          className={`card-hover text-left disabled:opacity-50 ${
            withBrief ? "border-blue-500/30" : ""
          }`}
        >
          <div className="text-2xl mb-2">🎯</div>
          <h2 className="font-bold text-white">Met een korte brief</h2>
          <p className="text-sm text-slate-500 mt-1">
            Eén of twee zinnen als kompas. Mag je later nog aanpassen.
          </p>
        </button>
      </div>

      {withBrief && (
        <div className="card mt-4">
          <label className="label">Waar gaat de video over?</label>
          <textarea
            className="input min-h-[90px] resize-y"
            placeholder="Voor wie is de video en wat is de boodschap? Bijvoorbeeld: een korte uitlegvideo voor MKB-ondernemers over onze boekhoud-app."
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            maxLength={600}
            autoFocus
          />
          <button
            type="button"
            onClick={() => start(true)}
            disabled={loading}
            className="btn-primary w-full mt-3"
          >
            {loading ? "Bezig…" : "Start playground →"}
          </button>
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mt-4">
          {error}
        </p>
      )}

      {loading && !withBrief && (
        <p className="text-slate-500 text-sm text-center mt-4">Playground openen…</p>
      )}
    </div>
  );
}
