"use client";

import { useEffect, useState } from "react";
import { CREATIES_GEWIJZIGD } from "@/components/app-shell/Zijbalk";

// Onder een eindresultaat: sterren + een zin, beloond met credits. De uitleg zegt kort wat
// we ermee doen, zodat de klant ziet dat zijn mening ergens heen gaat.

interface Gegeven { sterren: number; tekst: string; beloond: number }

export default function FeedbackBlok({ creatieId }: { creatieId: string }) {
  const [gegeven, setGegeven] = useState<Gegeven | null | undefined>(undefined);
  const [sterren, setSterren] = useState(0);
  const [tekst, setTekst] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    fetch(`/api/creaties/${creatieId}/feedback`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setGegeven(d.feedback ?? null))
      .catch(() => setGegeven(null));
  }, [creatieId]);

  async function stuur() {
    setBezig(true);
    setFout(null);
    const res = await fetch(`/api/creaties/${creatieId}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sterren, tekst }) });
    const d = await res.json().catch(() => ({}));
    setBezig(false);
    if (!res.ok) return setFout(d.error ?? "Dat lukte niet.");
    setGegeven({ sterren, tekst, beloond: d.beloond ?? 0 });
    // Het saldo in de zijbalk ververst op dit seintje.
    window.dispatchEvent(new Event(CREATIES_GEWIJZIGD));
  }

  if (gegeven === undefined) return null;
  if (gegeven)
    return (
      <div className="rounded-2xl border border-rand p-3 text-sm space-y-1">
        <div className="text-tekst">{"★".repeat(gegeven.sterren)}<span className="text-tekst-3">{"★".repeat(5 - gegeven.sterren)}</span></div>
        <p className="text-tekst-2">Dank je voor je feedback!{gegeven.beloond ? ` Je kreeg er ${gegeven.beloond} credits voor.` : ""}</p>
      </div>
    );

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
      <div className="text-sm font-semibold text-tekst">Wat vind je ervan? <span className="text-blue-600 dark:text-blue-300">+5 credits</span></div>
      <p className="text-xs text-tekst-3">We lezen elke week alle feedback. Wat vaker misgaat, wordt een vaste regel voor de AI, zodat je volgende video&apos;s beter worden.</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Sterren">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setSterren(n)} aria-label={`${n} ${n === 1 ? "ster" : "sterren"}`} className={`text-2xl leading-none ${n <= sterren ? "text-amber-400" : "text-tekst-3/40 hover:text-amber-300"}`}>★</button>
        ))}
      </div>
      <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={2} placeholder="Wat is goed, en wat kan beter? Bijv.: de stem past goed, maar de handen in scène 2 zien er raar uit." className="n-invoer w-full text-sm" />
      {fout && <p className="text-xs text-red-600 dark:text-red-300">{fout}</p>}
      <button onClick={stuur} disabled={bezig || !sterren || tekst.trim().length < 15} className="btn-primary w-full text-sm disabled:opacity-50">
        {bezig ? "Even…" : "Verstuur feedback"}
      </button>
    </div>
  );
}
