"use client";

import { useRef, useState } from "react";

/**
 * Uploadt een PDF of Word-bestand, laat de server de tekst extraheren en geeft
 * die terug via onExtracted. Gebruikt voor de infographic-bron (cijfers en
 * feiten) én voor aangeleverde draaiboeken, die vrijwel altijd .docx zijn.
 */
export default function PdfUploadButton({
  onExtracted,
  className = "",
  label = "PDF of Word uploaden",
}: {
  onExtracted: (text: string) => void;
  className?: string;
  label?: string;
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
      // Word gaat langs een eigen lezer die de tabellen heel laat: in een
      // draaiboek zit de shotlijst in een tabel, en platte tekst plakt de
      // kolommen (beeld / voice-over) aan elkaar.
      const isWord = /\.docx$/i.test(file.name) || file.type.includes("wordprocessingml");
      const res = await fetch(isWord ? "/api/infographics/extract-docx" : "/api/infographics/extract-pdf", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `${isWord ? "Word-bestand" : "PDF"} verwerken mislukt.`);
        return;
      }
      onExtracted(json.text as string);
      setNote(
        json.truncated
          ? "Het document was lang, alleen het eerste deel is overgenomen. Controleer de tekst."
          : "Tekst toegevoegd. Controleer en pas waar nodig aan."
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
        accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="text-xs bg-white/10 hover:bg-white/15 text-white px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        {loading ? "Document lezen…" : label}
      </button>
      {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
      {note && !error && <p className="text-xs text-emerald-400 mt-1.5">{note}</p>}
    </div>
  );
}
