"use client";

// EEN FOTO OMZETTEN NAAR EEN BIBLIOTHEEKITEM.
//
// Gedeeld door het voorwerpen- en het omgevingentabje: dezelfde knop, dezelfde
// uitleg, alleen een ander woord. De server leest de foto, schrijft de vaste
// beschrijving en tekent het ding na in de gekozen stijl (zie
// /api/bibliotheek/uit-foto).

import { useRef, useState } from "react";
import StylePicker from "@/components/style/StylePicker";
import { DEFAULT_STORY_STYLE, stijlenVoor } from "@/lib/infographics/story-style";
import { CREDIT_COSTS } from "@/lib/credit-costs";

export default function FotoNaarItem({
  soort,
  magRealistisch = false,
  onKlaar,
  disabled = false,
}: {
  soort: "voorwerp" | "omgeving";
  magRealistisch?: boolean;
  /** Het nieuwe item, zoals de server het teruggaf. */
  onKlaar: (item: unknown) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [voorbeeld, setVoorbeeld] = useState<string | null>(null);
  const [naam, setNaam] = useState("");
  const [styleId, setStyleId] = useState<string>(DEFAULT_STORY_STYLE);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  const woord = soort === "voorwerp" ? "voorwerp" : "omgeving";
  const voorbeeldTekst =
    soort === "voorwerp"
      ? "Bijvoorbeeld een foto van jullie machine of product."
      : "Bijvoorbeeld een foto van jullie kantoor of werkplaats.";

  function kiesBestand(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!f) return;
    setFoto(f);
    setVoorbeeld(URL.createObjectURL(f));
    setMelding(null);
  }

  async function omzetten() {
    if (!foto) return;
    setBezig(true);
    setMelding(null);
    try {
      const form = new FormData();
      form.append("foto", foto);
      form.append("soort", soort);
      form.append("styleId", styleId);
      if (naam.trim()) form.append("naam", naam.trim());
      const res = await fetch("/api/bibliotheek/uit-foto", { method: "POST", body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error === "insufficient_credits" ? "Te weinig credits." : d.error || "Omzetten mislukt");
      onKlaar(d.item);
      setFoto(null);
      setVoorbeeld(null);
      setNaam("");
    } catch (e) {
      setMelding(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-5">
      <h2 className="text-sm font-semibold text-white mb-1">Uit een foto</h2>
      <p className="text-[11px] text-slate-400 mb-3">
        {voorbeeldTekst} De AI kijkt wat erop staat en tekent het na in de stijl die je kiest. De foto zelf komt niet in
        de video.
      </p>

      <input ref={inputRef} type="file" accept="image/*" onChange={kiesBestand} className="hidden" />

      {voorbeeld ? (
        <div className="flex items-start gap-3 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={voorbeeld} alt="gekozen foto" className="w-40 rounded border border-white/10" />
          <button
            onClick={() => { setFoto(null); setVoorbeeld(null); }}
            className="text-[11px] text-slate-400 hover:text-white underline"
          >
            andere foto
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="text-sm rounded px-4 py-2 bg-white/10 hover:bg-white/15 text-white disabled:opacity-40 mb-3"
        >
          📸 Foto kiezen
        </button>
      )}

      {foto && (
        <>
          <input
            value={naam}
            onChange={(e) => setNaam(e.target.value)}
            placeholder={`Naam (leeg laten = de AI verzint er een)`}
            className="w-full bg-slate-900/60 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-slate-600 mb-3"
          />
          <div className="mb-3">
            <span className="block text-[11px] text-slate-400 mb-1">In welke stijl tekenen?</span>
            <StylePicker value={styleId} onChange={setStyleId} presets={stijlenVoor(magRealistisch)} />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={omzetten}
              disabled={bezig || disabled}
              className="text-sm rounded px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-40"
            >
              {bezig ? "Omzetten…" : `Maak er een ${woord} van`}
            </button>
            <span className="text-[11px] text-slate-500">
              {CREDIT_COSTS.IMAGE_GENERATION} credit, daarna in al je video&apos;s te gebruiken.
            </span>
          </div>
        </>
      )}
      {melding && <p className="text-xs text-red-400 mt-2">{melding}</p>}
    </div>
  );
}
