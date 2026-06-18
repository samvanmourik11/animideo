"use client";

import { useRef, useState } from "react";

/**
 * Uploadt een PDF, laat de server de tekst extraheren en geeft die terug via
 * onExtracted. Gebruikt voor de infographic-bron: cijfers en feiten uit een PDF.
 */
export default function PdfUploadButton({
  onExtracted,
  className = "",
}: {
  onExtracted: (text: string) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // zelfde bestand opnieuw kunnen kiezen
    if (!file) return;
    setError(null);
    setNote(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/infographics/extract-pdf", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "PDF verwerken mislukt.");
        return;
      }
      onExtracted(json.text as string);
      setNote(
        json.truncated
          ? "PDF was lang, alleen het eerste deel is overgenomen. Controleer de tekst."
          : "Tekst uit PDF toegevoegd. Controleer en pas waar nodig aan."
      );
    } catch {
      setError("Er ging iets mis bij het uploaden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="text-xs bg-white/10 hover:bg-white/15 text-white px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        {loading ? "PDF lezen…" : "PDF uploaden"}
      </button>
      {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
      {note && !error && <p className="text-xs text-emerald-400 mt-1.5">{note}</p>}
    </div>
  );
}
