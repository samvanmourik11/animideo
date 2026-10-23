"use client";

import { useCallback, useEffect, useState } from "react";

// Animideo koppelen aan Claude Code (en andere MCP-programma's): een persoonlijke sleutel
// maken en het commando kopiëren. De sleutel staat maar één keer in beeld.

interface Sleutel { id: string; naam: string; begin: string; laatst_gebruikt: string | null; created_at: string }

function Kopieer({ tekst }: { tekst: string }) {
  const [klaar, setKlaar] = useState(false);
  return (
    <div className="relative">
      <pre className="whitespace-pre-wrap break-all rounded-xl bg-paneel-2 p-3 pr-20 text-xs text-tekst">{tekst}</pre>
      <button
        onClick={() => navigator.clipboard.writeText(tekst).then(() => { setKlaar(true); setTimeout(() => setKlaar(false), 1500); })}
        className="absolute top-2 right-2 n-knop2 text-xs"
      >
        {klaar ? "✓ Gekopieerd" : "Kopieer"}
      </button>
    </div>
  );
}

export default function ClaudeKoppeling() {
  const [sleutels, setSleutels] = useState<Sleutel[]>([]);
  const [nieuw, setNieuw] = useState<string | null>(null);
  const [naam, setNaam] = useState("Claude Code");
  const [fout, setFout] = useState<string | null>(null);
  const [adres, setAdres] = useState("https://ai.jouwanimatievideo.nl/api/mcp");

  const laad = useCallback(async () => {
    const d = await fetch("/api/mcp-sleutels", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    setSleutels(d.sleutels ?? []);
  }, []);
  useEffect(() => {
    laad();
    setAdres(`${window.location.origin}/api/mcp`);
  }, [laad]);

  async function maak() {
    setFout(null);
    const res = await fetch("/api/mcp-sleutels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ naam }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setFout(d.error ?? "Dat lukte niet.");
    setNieuw(d.sleutel);
    laad();
  }

  async function trekIn(id: string) {
    await fetch(`/api/mcp-sleutels?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    laad();
  }

  const sleutel = nieuw ?? "JOUW-SLEUTEL";
  const claudeCode = `claude mcp add --transport http animideo ${adres} --header "Authorization: Bearer ${sleutel}"`;
  const json = JSON.stringify({ mcpServers: { animideo: { type: "http", url: adres, headers: { Authorization: `Bearer ${sleutel}` } } } }, null, 2);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-tekst">🤖 Animideo in Claude</h1>
        <p className="text-sm text-tekst-2 mt-1">
          Koppel Animideo aan Claude Code (of een ander programma dat MCP kent). Dan maak je beelden, video&apos;s, voice-overs, montages en contentkalenders gewoon door het Claude te vragen, met jouw credits en in jouw bibliotheek. Claude krijgt er ons regieboek bij, dus hij weet hoe je een goede video opbouwt.
        </p>
      </div>

      <section className="n-kaart space-y-3">
        <h2 className="font-semibold text-tekst">1. Maak een sleutel</h2>
        {nieuw ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-700 dark:text-amber-300">Kopieer hem nu: je ziet hem maar één keer. Deel hem met niemand; met deze sleutel kun je credits uitgeven.</p>
            <Kopieer tekst={nieuw} />
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={60} className="n-invoer flex-1 text-sm" placeholder="Waarvoor? Bijv. Claude Code op mijn laptop" />
            <button onClick={maak} className="btn-primary text-sm">Sleutel maken</button>
          </div>
        )}
        {fout && <p className="text-sm text-red-600 dark:text-red-300">{fout}</p>}
      </section>

      <section className="n-kaart space-y-3">
        <h2 className="font-semibold text-tekst">2. Koppel hem aan Claude</h2>
        <p className="text-sm text-tekst-2"><strong>Claude Code:</strong> plak dit in je terminal.</p>
        <Kopieer tekst={claudeCode} />
        <p className="text-sm text-tekst-2"><strong>Andere programma&apos;s</strong> (Cursor, …): zet dit in hun MCP-instellingen.</p>
        <Kopieer tekst={json} />
        <p className="text-sm text-tekst-2">
          Probeer daarna bijvoorbeeld: <em>&ldquo;Maak met Animideo een reclamevideo van 20 seconden voor mijn bakkerij.&rdquo;</em> Claude vraagt je akkoord voordat er credits af gaan.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-tekst">Je sleutels</h2>
        {sleutels.length === 0 && <p className="text-sm text-tekst-3">Nog geen sleutels.</p>}
        {sleutels.map((s) => (
          <div key={s.id} className="n-kaart !p-3 flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <div className="font-medium text-tekst truncate">{s.naam} <span className="text-tekst-3 font-mono text-xs">{s.begin}</span></div>
              <div className="text-xs text-tekst-3">
                Gemaakt {new Date(s.created_at).toLocaleDateString("nl-NL")} · {s.laatst_gebruikt ? `laatst gebruikt ${new Date(s.laatst_gebruikt).toLocaleString("nl-NL")}` : "nog niet gebruikt"}
              </div>
            </div>
            <button onClick={() => trekIn(s.id)} className="text-sm text-red-600 dark:text-red-300 hover:underline shrink-0">Intrekken</button>
          </div>
        ))}
      </section>
    </div>
  );
}
