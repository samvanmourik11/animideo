"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const PAKKETTEN = [
  { id: "starter", naam: "Starter", prijs: 49, credits: "500", punten: ["Alle maak-tools en studio's", "100 Nederlandse stemmen", "Je eigen stem klonen", "1 huisstijl"] },
  { id: "pro", naam: "Pro", prijs: 99, credits: "1.500", punten: ["Alles van Starter", "Automatisch vooruit posten", "Animideo in Claude", "5 huisstijlen", "Team van 3"], badge: "Meest gekozen" },
  { id: "agency", naam: "Agency", prijs: 249, credits: "4.000", punten: ["Alles van Pro", "Onbeperkt accounts en huisstijlen", "Team van 10", "Persoonlijke support"] },
] as const;

type PakketId = (typeof PAKKETTEN)[number]["id"];

export default function GratisWeekFormulier() {
  const zoek = useSearchParams();
  const begin = PAKKETTEN.some((p) => p.id === zoek.get("plan")) ? (zoek.get("plan") as PakketId) : "pro";
  const [plan, setPlan] = useState<PakketId>(begin);
  const [email, setEmail] = useState("");
  const [abonnement, setAbonnement] = useState(false);
  const [voorwaarden, setVoorwaarden] = useState(false);
  const [nieuwsbrief, setNieuwsbrief] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  const gekozen = PAKKETTEN.find((p) => p.id === plan)!;
  const startDatum = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("nl-NL", { day: "numeric", month: "long" });

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    if (!abonnement || !voorwaarden) return setFout("Vink de twee verplichte vakjes aan om door te gaan.");
    setFout("");
    setBezig(true);
    try {
      const res = await fetch("/api/gratis-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, plan, akkoordAbonnement: abonnement, akkoordVoorwaarden: voorwaarden, nieuwsbrief, bron: zoek.get("bron") ?? [zoek.get("utm_campaign"), zoek.get("utm_content")].filter(Boolean).join("/") }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Er ging iets mis.");
      window.location.href = d.checkoutUrl;
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Er ging iets mis.");
      setBezig(false);
    }
  }

  return (
    <form onSubmit={verstuur} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PAKKETTEN.map((p) => (
          <button
            type="button"
            key={p.id}
            onClick={() => setPlan(p.id)}
            className={`relative text-left rounded-2xl border p-4 transition ${plan === p.id ? "border-blue-500 ring-2 ring-blue-500/30 bg-blue-50 dark:bg-blue-500/10" : "border-rand bg-paneel hover:border-blue-300"}`}
          >
            {"badge" in p && <span className="absolute -top-2.5 right-3 text-[11px] font-semibold bg-blue-600 text-white rounded-full px-2 py-0.5">{p.badge}</span>}
            <div className="font-bold text-tekst">{p.naam}</div>
            <div className="text-sm text-tekst-2"><span className="text-xl font-black text-tekst">€{p.prijs}</span>/maand</div>
            <div className="text-xs text-tekst-3 mb-2">{p.credits} credits per maand</div>
            <ul className="text-xs text-tekst-2 space-y-1">
              {p.punten.map((x) => <li key={x}>✓ {x}</li>)}
            </ul>
          </button>
        ))}
      </div>

      <div className="bg-paneel border border-rand rounded-2xl p-6 shadow-[0_8px_30px_rgba(15,23,42,0.08)] space-y-4">
        <div className="rounded-xl bg-vlak border border-rand p-4 text-sm text-tekst-2 space-y-1">
          <div className="flex justify-between"><span>Vandaag</span><strong className="text-tekst">€0 · 200 credits</strong></div>
          <div className="flex justify-between"><span>Verificatie met iDEAL (direct terug)</span><span>€0,01 – €0,09</span></div>
          <div className="flex justify-between"><span>Vanaf {startDatum}</span><strong className="text-tekst">€{gekozen.prijs} per maand ({gekozen.naam})</strong></div>
        </div>

        <div>
          <label className="label">E-mailadres</label>
          <input type="email" className="input" placeholder="jij@voorbeeld.nl" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div className="space-y-2.5">
          <label className="flex items-start gap-2.5 text-xs text-tekst-2 cursor-pointer">
            <input type="checkbox" checked={abonnement} onChange={(e) => setAbonnement(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500" />
            <span>
              Ik begrijp dat dit een <strong className="text-tekst">doorlopend maandelijks abonnement</strong> is. Ik verifieer nu met iDEAL
              (een paar cent, dat ik direct terugkrijg). Zeg ik niet op binnen 7 dagen, dan betaal ik vanaf <strong className="text-tekst">{startDatum}</strong> automatisch
              <strong className="text-tekst"> €{gekozen.prijs} per maand</strong> voor {gekozen.naam}, totdat ik opzeg. Opzeggen kan altijd, per maand.
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-xs text-tekst-2 cursor-pointer">
            <input type="checkbox" checked={voorwaarden} onChange={(e) => setVoorwaarden(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500" />
            <span>
              Ik ga akkoord met de <Link href="/algemene-voorwaarden" target="_blank" className="text-blue-600 underline">algemene voorwaarden</Link> en
              het <Link href="/privacybeleid" target="_blank" className="text-blue-600 underline">privacybeleid</Link>.
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-xs text-tekst-3 cursor-pointer">
            <input type="checkbox" checked={nieuwsbrief} onChange={(e) => setNieuwsbrief(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-500" />
            <span>Ja, stuur me tips en updates (optioneel).</span>
          </label>
        </div>

        {fout && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2">{fout}</p>}

        <button type="submit" disabled={bezig || !email.includes("@") || !abonnement || !voorwaarden} className="btn-primary w-full py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed">
          {bezig ? "Doorsturen naar iDEAL…" : "Start mijn gratis week →"}
        </button>
        <p className="text-xs text-tekst-3 text-center">
          Beveiligd via Mollie en iDEAL. 7 dagen gratis, daarna €{gekozen.prijs}/maand. Maandelijks opzegbaar.
        </p>
      </div>
    </form>
  );
}
