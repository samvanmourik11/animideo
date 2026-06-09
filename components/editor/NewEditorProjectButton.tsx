"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Ratio } from "@/lib/editor/timeline";

const RATIOS: { value: Ratio; label: string; hint: string }[] = [
  { value: "16:9", label: "Liggend 16:9", hint: "YouTube, website" },
  { value: "9:16", label: "Staand 9:16", hint: "Reels, TikTok, Shorts" },
  { value: "1:1", label: "Vierkant 1:1", hint: "Feed-posts" },
];

export default function NewEditorProjectButton() {
  const router = useRouter();
  const [busy, setBusy] = useState<Ratio | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(ratio: Ratio) {
    setBusy(ratio);
    setError(null);
    try {
      const res = await fetch("/api/editor/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Kon project niet aanmaken");
      router.push(`/editor/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Er ging iets mis");
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {RATIOS.map((r) => (
          <button
            key={r.value}
            onClick={() => create(r.value)}
            disabled={busy !== null}
            className="card-hover text-left disabled:opacity-50"
          >
            <div className="text-sm font-semibold text-white">{r.label}</div>
            <div className="text-xs text-slate-400 mt-1">{r.hint}</div>
            {busy === r.value && (
              <div className="text-xs text-blue-400 mt-2">Aanmaken...</div>
            )}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
    </div>
  );
}
