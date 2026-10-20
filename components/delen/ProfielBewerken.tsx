"use client";

import { useEffect, useState } from "react";
import BeeldKiezer, { type GekozenBeeld } from "@/components/creaties/BeeldKiezer";
import { controleerHandle } from "@/lib/delen/profiel-regels";
import type { MakerProfiel } from "@/lib/delen/profiel";

// Je openbare profiel instellen. Wat erop staat, kies je per werk in de bibliotheek
// ("Op mijn profiel"); hier alleen wie je bent.
export default function ProfielBewerken() {
  const [geladen, setGeladen] = useState(false);
  const [bestaat, setBestaat] = useState(false);
  const [handle, setHandle] = useState("");
  const [naam, setNaam] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [logo, setLogo] = useState<GekozenBeeld | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [opgeslagen, setOpgeslagen] = useState(false);

  useEffect(() => {
    fetch("/api/profiel")
      .then((r) => r.json())
      .then((d: { profiel: MakerProfiel | null }) => {
        if (d.profiel) {
          setBestaat(true);
          setHandle(d.profiel.handle);
          setNaam(d.profiel.naam);
          setBio(d.profiel.bio ?? "");
          setWebsite(d.profiel.website ?? "");
          setLogo(d.profiel.logo_url ? { url: d.profiel.logo_url } : null);
        }
      })
      .finally(() => setGeladen(true));
  }, []);

  const handleFout = handle ? controleerHandle(handle).fout : null;

  async function bewaar() {
    setBezig(true);
    setFout(null);
    setOpgeslagen(false);
    const res = await fetch("/api/profiel", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle, naam, bio, website, logo_url: logo?.url ?? "" }),
    });
    const d = await res.json().catch(() => ({}));
    setBezig(false);
    if (!res.ok) return setFout(d.error ?? "Opslaan mislukt.");
    setHandle(d.profiel.handle);
    setBestaat(true);
    setOpgeslagen(true);
  }

  if (!geladen) return <p className="text-sm text-tekst-3">Laden…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-tekst tracking-tight">🌐 Mijn profiel</h1>
        <p className="text-tekst-3 mt-1">
          Je eigen openbare pagina met je mooiste werk. Wat erop komt, kies je zelf per werk in je bibliotheek.
        </p>
      </div>

      {bestaat && (
        <a
          href={`/@${handle}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-2xl border border-rand bg-paneel px-4 py-3 hover:border-blue-500/50"
        >
          <span className="text-sm text-tekst">Jouw profiel: <strong>/@{handle}</strong></span>
          <span className="text-sm text-blue-500">Bekijk →</span>
        </a>
      )}

      <div className="n-kaart space-y-4">
        <div>
          <label className="n-label">Profielnaam</label>
          <div className="mt-1.5 flex items-center rounded-xl border border-rand bg-paneel-2 focus-within:border-blue-500">
            <span className="pl-3 text-tekst-3">@</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
              placeholder="bakkerijjansen"
              className="flex-1 bg-transparent px-1 py-2.5 text-tekst outline-none"
            />
          </div>
          {handleFout && <p className="text-xs text-red-500 mt-1">{handleFout}</p>}
        </div>
        <div>
          <label className="n-label">Naam</label>
          <input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bakkerij Jansen" className="n-invoer mt-1.5" />
        </div>
        <div>
          <label className="n-label">Over jou (mag leeg)</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} maxLength={300} placeholder="Ambachtelijke bakker in Utrecht sinds 1952." className="n-invoer mt-1.5 resize-none" />
        </div>
        <div>
          <label className="n-label">Website (mag leeg)</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="bakkerijjansen.nl" className="n-invoer mt-1.5" />
        </div>
        <div>
          <label className="n-label">Logo of foto (mag leeg)</label>
          <div className="mt-1.5">
            <BeeldKiezer waarde={logo} onKies={setLogo} leeg="Upload je logo" />
          </div>
        </div>
        <button onClick={bewaar} disabled={bezig || !!handleFout || !handle || !naam.trim()} className="btn-primary disabled:opacity-50">
          {bezig ? "Opslaan…" : bestaat ? "Opslaan" : "Profiel aanmaken"}
        </button>
        {fout && <p className="text-sm text-red-600 dark:text-red-300 bg-red-500/10 rounded-xl px-3 py-2">{fout}</p>}
        {opgeslagen && <p className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 rounded-xl px-3 py-2">Opgeslagen.</p>}
      </div>

      <p className="text-xs text-tekst-3">
        Zo zet je iets op je profiel: open een beeld of video in je bibliotheek en kies &ldquo;Op mijn profiel&rdquo;.
      </p>
    </div>
  );
}
