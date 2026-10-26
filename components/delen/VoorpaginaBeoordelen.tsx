"use client";

import { useEffect, useState } from "react";
import { herkomst } from "@/lib/delen/herkomst";
import type { OpenbaarWerk } from "@/lib/delen/profiel";

type Ingestuurd = OpenbaarWerk & { email: string | null };

// Voor Sam: wat klanten insturen voor de voorpagina. Eén klik goed of niet; pas na
// "Goedkeuren" komt het op Ontdek.
export default function VoorpaginaBeoordelen() {
  const [werk, setWerk] = useState<Ingestuurd[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/voorpagina")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setWerk(d.werk);
      })
      .catch((e) => setFout(e.message));
  }, []);

  async function besluit(id: string, goed: boolean) {
    setWerk((w) => w?.filter((x) => x.id !== id) ?? null);
    const r = await fetch("/api/admin/voorpagina", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, goed }),
    });
    if (r.ok) setWerk((await r.json()).werk);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-tekst tracking-tight">⭐ Voorpagina beoordelen</h1>
        <p className="text-tekst-3 mt-1">Ingestuurd werk van klanten. Wat je goedkeurt, komt op Ontdek voor iedereen.</p>
      </div>
      {fout && <p className="text-sm text-red-500">{fout}</p>}
      {werk && werk.length === 0 && <p className="text-tekst-3">Niets te beoordelen. 🎉</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {werk?.map((w) => (
          <div key={w.id} className="n-kaart space-y-3">
            {w.soort === "video" ? (
              <video src={w.url} poster={w.deel_poster ?? undefined} controls muted playsInline className="w-full rounded-xl" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={w.url} alt="" className="w-full rounded-xl" />
            )}
            <div className="text-xs text-tekst-3">
              {herkomst({ maker: w.maker, invoer: w.invoer, soort: w.soort }).naam} · {w.handle ? `@${w.handle}` : "geen profiel"} · {w.email}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => besluit(w.id, true)} className="btn-primary">Goedkeuren</button>
              <button onClick={() => besluit(w.id, false)} className="n-knop2">Niet nu</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
