"use client";

import { useState } from "react";
import Link from "next/link";

export interface ProjectRij {
  id: string;
  title: string | null;
  updated_at: string | null;
  created_at: string;
  thumb: string | null;
}

// Alle projecten van een studio, nieuwste eerst. Klanten die al jaren bezig zijn, hebben
// er tientallen: dan een zoekveld, zodat een oud verhaal binnen een paar tellen terug is.
export default function StudioProjecten({ projecten, pad, icoon, nieuw }: { projecten: ProjectRij[]; pad: string; icoon: string; nieuw: string }) {
  const [zoek, setZoek] = useState("");
  const z = zoek.trim().toLowerCase();
  const lijst = z ? projecten.filter((p) => (p.title ?? "").toLowerCase().includes(z)) : projecten;

  if (projecten.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-rand p-12 text-center text-tekst-3">
        <div className="text-4xl mb-3">{icoon}</div>
        Nog niets gemaakt. Klik op &ldquo;{nieuw}&rdquo; om te beginnen.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {projecten.length > 10 && (
        <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={`🔍 Zoek in je ${projecten.length} projecten`} className="n-invoer max-w-sm" />
      )}
      {lijst.length === 0 && <p className="text-sm text-tekst-3">Geen project met &ldquo;{zoek}&rdquo; in de titel.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {lijst.map((p) => (
          <Link
            key={p.id}
            href={`${pad}?project=${p.id}`}
            className="group rounded-2xl overflow-hidden border border-rand bg-paneel hover:border-blue-500/50 transition-colors"
          >
            <div className="aspect-[4/5] bg-paneel-2 overflow-hidden">
              {p.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumb} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl opacity-60">{icoon}</div>
              )}
            </div>
            <div className="p-3">
              <div className="text-sm font-medium text-tekst truncate">{p.title || "Zonder titel"}</div>
              <div className="text-[11px] text-tekst-3">
                {new Date(p.updated_at ?? p.created_at).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
