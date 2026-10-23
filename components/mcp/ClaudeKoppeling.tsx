"use client";

import { useCallback, useEffect, useState } from "react";

// Animideo koppelen aan Claude Code (en andere MCP-programma's): een persoonlijke sleutel
// maken en het commando kopiëren. De sleutel staat maar één keer in beeld.

interface Sleutel { id: string; naam: string; begin: string; laatst_gebruikt: string | null; created_at: string; soort: string; client_id: string | null }

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
  const [gevorderd, setGevorderd] = useState(false);

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

  const verbonden = sleutels.filter((x) => x.soort === "oauth");
  const eigen = sleutels.filter((x) => x.soort !== "oauth");

  const rij = (x: Sleutel, knop: string) => (
    <div key={x.id} className="n-kaart !p-3 flex items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <div className="font-medium text-tekst truncate">{x.naam}{x.soort !== "oauth" && <span className="text-tekst-3 font-mono text-xs"> {x.begin}</span>}</div>
        <div className="text-xs text-tekst-3">
          Sinds {new Date(x.created_at).toLocaleDateString("nl-NL")} · {x.laatst_gebruikt ? `laatst gebruikt ${new Date(x.laatst_gebruikt).toLocaleString("nl-NL")}` : "nog niet gebruikt"}
        </div>
      </div>
      <button onClick={() => trekIn(x.id)} className="text-sm text-red-600 dark:text-red-300 hover:underline shrink-0">{knop}</button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-tekst">🤖 Animideo in Claude</h1>
        <p className="text-sm text-tekst-2 mt-1">
          Voeg Animideo toe aan de Claude-app (op je computer, in de browser of op je telefoon). Dan maak je beelden, video&apos;s, voice-overs, montages en contentkalenders gewoon door het Claude te vragen, met jouw credits en in jouw bibliotheek. Claude krijgt ons regieboek erbij, dus hij weet hoe je een goede video opbouwt.
        </p>
      </div>

      <section className="n-kaart space-y-3">
        <h2 className="font-semibold text-tekst">Zo voeg je Animideo toe aan Claude</h2>
        <ol className="text-sm text-tekst-2 list-decimal pl-5 space-y-1.5">
          <li>Open Claude en ga naar <strong>Instellingen → Connectors</strong>.</li>
          <li>Kies <strong>Aangepaste connector toevoegen</strong>, noem hem <strong>Animideo</strong> en plak dit adres:</li>
        </ol>
        <Kopieer tekst={adres} />
        <ol start={3} className="text-sm text-tekst-2 list-decimal pl-5 space-y-1.5">
          <li>Klik op <strong>Verbinden</strong>. Je komt bij Animideo; log in als dat nodig is en klik <strong>Toestaan</strong>.</li>
          <li>Klaar. Vraag Claude bijvoorbeeld: <em>&ldquo;Maak met Animideo een reclamevideo van 20 seconden voor mijn bakkerij.&rdquo;</em> Claude noemt altijd eerst wat iets kost.</li>
        </ol>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-tekst">Verbonden met Animideo</h2>
        {verbonden.length ? verbonden.map((x) => rij(x, "Verbreken")) : <p className="text-sm text-tekst-3">Nog niets verbonden.</p>}
      </section>

      <section className="space-y-3">
        <button onClick={() => setGevorderd((x) => !x)} className="text-sm text-tekst-3 hover:text-tekst">
          {gevorderd ? "▾" : "▸"} Voor gevorderden: Claude Code, Cursor en andere programma&apos;s (met een sleutel)
        </button>
        {gevorderd && (
          <div className="space-y-4">
            <div className="n-kaart space-y-3">
              <h3 className="font-semibold text-tekst text-sm">1. Maak een sleutel</h3>
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
            </div>
            <div className="n-kaart space-y-3">
              <h3 className="font-semibold text-tekst text-sm">2. Koppel hem</h3>
              <p className="text-sm text-tekst-2"><strong>Claude Code:</strong> plak dit in je terminal.</p>
              <Kopieer tekst={claudeCode} />
              <p className="text-sm text-tekst-2"><strong>Andere programma&apos;s:</strong> zet dit in hun MCP-instellingen.</p>
              <Kopieer tekst={json} />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-tekst text-sm">Je sleutels</h3>
              {eigen.length ? eigen.map((x) => rij(x, "Intrekken")) : <p className="text-sm text-tekst-3">Nog geen sleutels.</p>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
