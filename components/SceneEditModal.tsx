"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Scene } from "@/lib/types";

// "Google Flow"-stijl bewerken van één scene-beeld. Geen volledige prompt
// aanpassen, alleen een instructie ("maak het polo blauw", "verwijder de
// laptop") — server houdt de rest van het beeld intact.

export default function SceneEditModal({
  open,
  onClose,
  projectId,
  sceneId,
  currentImageUrl,
  clientScenes,
  onUpdated,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  sceneId: string;
  currentImageUrl: string;
  // Optioneel: huidige scenes-state (kan onopgeslagen prompt-edits bevatten).
  // Server valt anders terug op DB.
  clientScenes?: Scene[];
  onUpdated: (newImageUrl: string, updatedScenes?: Scene[]) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const trimmed = instruction.trim();
    if (trimmed.length < 2 || busy) return;
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const res = await fetch("/api/edit-scene-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ projectId, sceneId, instruction: trimmed, clientScenes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.imageUrl) {
        setError(
          data.error === "insufficient_credits"
            ? "Je hebt geen credits meer."
            : data.error ?? "Bewerken mislukt."
        );
        return;
      }
      onUpdated(data.imageUrl as string, data.scenes as Scene[] | undefined);
      setInstruction("");
      onClose();
    } catch {
      setError("Er ging iets mis. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#060d1f] border border-white/10 rounded-2xl overflow-hidden flex flex-col">
        <div className="px-4 h-12 shrink-0 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Beeld bewerken</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-white text-sm disabled:opacity-50"
          >
            Sluiten ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="rounded-xl overflow-hidden border border-white/10 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentImageUrl}
              alt=""
              className="w-full max-h-72 object-contain"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
              Wat moet er veranderen?
            </label>
            <textarea
              className="input w-full text-sm min-h-[72px] resize-none"
              placeholder="bv. maak het polo blauw, verwijder de laptop, plaats hem buiten in een park"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              autoFocus
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <p className="text-[11px] text-slate-500 mt-1">
              De rest van het beeld blijft staan — alleen wat je hier vraagt wordt aangepast. ⌘+Enter om te versturen.
            </p>
          </div>
          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
              {error}
            </p>
          )}
        </div>

        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || instruction.trim().length < 2}
            className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Bewerken…" : "Pas aan (1 credit)"}
          </button>
        </div>
      </div>
    </div>
  );
}
