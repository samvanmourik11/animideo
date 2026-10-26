"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Creatie, CreatieMap } from "@/lib/creaties/types";
import CreatieKaart from "./CreatieKaart";
import CreatieDetail from "./CreatieDetail";
import { useCreaties, zetFavoriet, type CreatieFilter } from "./gebruik-creaties";
import { uploadFoto } from "./BeeldKiezer";

// Mijn bibliotheek: alles wat iemand in de nieuwe app maakte, ongeacht met welke knop.
// Links filters en mappen, rechts het raster. Vanuit elke tegel ga je verder.

const SOORTEN = [
  { id: "", label: "Alles", icoon: "✨" },
  { id: "beeld", label: "Beelden", icoon: "🖼️" },
  { id: "video", label: "Video's", icoon: "🎬" },
];

export default function Bibliotheek() {
  const [soort, setSoort] = useState("");
  const [favoriet, setFavoriet] = useState(false);
  const [map, setMap] = useState("");
  const [zoekInvoer, setZoekInvoer] = useState("");
  const [zoek, setZoek] = useState("");
  const [open, setOpen] = useState<Creatie | null>(null);
  const [mappen, setMappen] = useState<CreatieMap[]>([]);
  const [nieuweMap, setNieuweMap] = useState("");
  const [uploaden, setUploaden] = useState(false);
  const [uploadFout, setUploadFout] = useState<string | null>(null);
  const [teamNaam, setTeamNaam] = useState<string | null>(null);
  const [heelTeam, setHeelTeam] = useState(false);

  // Pas zoeken als er even niet getypt wordt; anders een verzoek per toetsaanslag.
  useEffect(() => {
    const t = setTimeout(() => setZoek(zoekInvoer.trim()), 350);
    return () => clearTimeout(t);
  }, [zoekInvoer]);

  // Favorieten en mappen zijn persoonlijk; bij "hele team" tellen alleen soort en zoeken.
  const filter: CreatieFilter = heelTeam
    ? { soort: soort || undefined, zoek: zoek || undefined, team: true }
    : { soort: soort || undefined, favoriet, map: map || undefined, zoek: zoek || undefined };
  const lijst = useCreaties(filter);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((d) => setTeamNaam(d.team?.naam ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/creaties/mappen")
      .then((r) => r.json())
      .then((d) => setMappen(d.mappen ?? []))
      .catch(() => {});
  }, []);

  async function maakMap() {
    const naam = nieuweMap.trim();
    if (!naam) return;
    const res = await fetch("/api/creaties/mappen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naam }),
    });
    const d = await res.json();
    if (res.ok) {
      setMappen((m) => [...m, d.map].sort((a, b) => a.naam.localeCompare(b.naam)));
      setNieuweMap("");
    }
  }

  async function gooiMapWeg(id: string) {
    if (!confirm("Map weggooien? Wat erin zit blijft gewoon in je bibliotheek.")) return;
    await fetch(`/api/creaties/mappen/${id}`, { method: "DELETE" });
    setMappen((m) => m.filter((x) => x.id !== id));
    if (map === id) setMap("");
  }

  const knop = (actief: boolean) =>
    `w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-left transition-colors ${
      actief ? "bg-paneel-2 text-tekst font-medium" : "text-tekst-3 hover:text-tekst hover:bg-paneel-2"
    }`;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-6 items-start">
      <aside className="space-y-5 md:sticky md:top-8">
        <h1 className="text-xl font-bold text-tekst">📚 Mijn bibliotheek</h1>
        {teamNaam && (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-paneel-2 p-1 text-xs">
            <button
              onClick={() => setHeelTeam(false)}
              className={`rounded-lg py-1.5 ${!heelTeam ? "bg-paneel text-tekst font-semibold shadow-sm" : "text-tekst-3"}`}
            >
              Van mij
            </button>
            <button
              onClick={() => { setHeelTeam(true); setFavoriet(false); setMap(""); }}
              className={`rounded-lg py-1.5 ${heelTeam ? "bg-paneel text-tekst font-semibold shadow-sm" : "text-tekst-3"}`}
              title={teamNaam}
            >
              👥 Hele team
            </button>
          </div>
        )}
        <div className="space-y-0.5">
          {SOORTEN.map((s) => (
            <button key={s.id} onClick={() => { setSoort(s.id); setFavoriet(false); setMap(""); }} className={knop(soort === s.id && !favoriet && !map)}>
              <span>{s.icoon}</span>{s.label}
            </button>
          ))}
          <button onClick={() => { setFavoriet(true); setMap(""); }} className={knop(favoriet)}>
            <span>❤️</span>Favorieten
          </button>
        </div>

        <div>
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-tekst-3">Mappen</div>
          <div className="space-y-0.5">
            {mappen.map((m) => (
              <div key={m.id} className="group flex items-center">
                <button onClick={() => { setMap(m.id); setFavoriet(false); }} className={knop(map === m.id)}>
                  <span>📁</span><span className="truncate">{m.naam}</span>
                </button>
                <button onClick={() => gooiMapWeg(m.id)} className="px-1 text-xs text-tekst-3 opacity-0 group-hover:opacity-100 hover:text-red-300" aria-label="Map weggooien">✕</button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1 px-1">
            <input
              value={nieuweMap}
              onChange={(e) => setNieuweMap(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && maakMap()}
              placeholder="Nieuwe map"
              className="n-invoer py-1.5 text-xs"
            />
            <button onClick={maakMap} className="text-sm text-blue-500 px-2">＋</button>
          </div>
        </div>
      </aside>

      <section>
        <div className="flex gap-2 mb-4">
          <input
            value={zoekInvoer}
            onChange={(e) => setZoekInvoer(e.target.value)}
            placeholder="🔍 Zoek op wat je ooit opgaf…"
            className="n-invoer"
          />
          <label className={`n-knop2 shrink-0 cursor-pointer ${uploaden ? "opacity-50" : ""}`}>
            {uploaden ? "Uploaden…" : "📷 Foto uploaden"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploaden}
              onChange={async (e) => {
                const bestand = e.target.files?.[0];
                e.target.value = "";
                if (!bestand) return;
                setUploaden(true);
                setUploadFout(null);
                try {
                  lijst.zetVoor(await uploadFoto(bestand));
                } catch (err) {
                  setUploadFout(err instanceof Error ? err.message : String(err));
                } finally {
                  setUploaden(false);
                }
              }}
            />
          </label>
        </div>
        {uploadFout && <p className="text-sm text-red-600 dark:text-red-300 mb-3">{uploadFout}</p>}
        {lijst.fout && <p className="text-sm text-red-600 dark:text-red-300 mb-3">{lijst.fout}</p>}
        {lijst.laden && lijst.creaties.length === 0 ? (
          <p className="text-sm text-tekst-3">Laden…</p>
        ) : lijst.creaties.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-rand p-12 text-center text-tekst-3">
            <div className="text-4xl mb-3">🗂️</div>
            {zoek || favoriet || map ? "Niets gevonden met dit filter." : (
              <>Nog niets gemaakt. <Link href="/maak/beeld" className="text-blue-500 underline">Maak je eerste beeld</Link>.</>
            )}
          </div>
        ) : (
          <>
            <div className="columns-2 md:columns-3 xl:columns-4 gap-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
              {lijst.creaties.map((c) => (
                <CreatieKaart
                  key={c.id}
                  creatie={c}
                  onOpen={() => setOpen(c)}
                  onFavoriet={async () => lijst.werkBij(await zetFavoriet(c))}
                />
              ))}
            </div>
            {lijst.meer && (
              <div className="text-center mt-4">
                <button onClick={lijst.laadMeer} className="n-knop2 text-sm">Meer laden</button>
              </div>
            )}
          </>
        )}
      </section>

      {open && (
        <CreatieDetail
          creatie={lijst.creaties.find((c) => c.id === open.id) ?? open}
          mappen={mappen}
          onSluit={() => setOpen(null)}
          onGewijzigd={lijst.werkBij}
          onWeg={lijst.haalWeg}
          onNieuw={lijst.zetVoor}
        />
      )}
    </div>
  );
}
