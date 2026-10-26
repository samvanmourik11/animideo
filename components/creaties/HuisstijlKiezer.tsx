"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Kies met welke huisstijl een beeld gemaakt wordt. De eerste huisstijl staat meteen aan:
// wie er een heeft vastgelegd, wil hem ook gebruikt zien (Maxims testronde: de huisstijl
// was nergens te kiezen en het model verzon een eigen bedrijfsnaam op de gevel).
// Zonder huisstijl verschijnt een klein linkje om er een te maken.

interface Kit {
  id: string;
  name: string;
}

export default function HuisstijlKiezer({ waarde, onKies }: { waarde: string; onKies: (id: string) => void }) {
  const [kits, setKits] = useState<Kit[] | null>(null);

  useEffect(() => {
    let weg = false;
    fetch("/api/brand-kits")
      .then((r) => (r.ok ? r.json() : { brandKits: [] }))
      .then((d: { brandKits?: Kit[] }) => {
        if (weg) return;
        const lijst = d.brandKits ?? [];
        setKits(lijst);
        if (lijst.length && waarde === "") onKies(lijst[0].id);
      })
      .catch(() => !weg && setKits([]));
    return () => {
      weg = true;
    };
    // Alleen bij het openen: daarna kiest de gebruiker zelf (ook "geen").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (kits === null) return null;
  if (kits.length === 0) {
    return (
      <p className="text-[11px] text-tekst-3">
        Wil je je bedrijfsnaam, kleuren en lettertype erin? <Link href="/brand" className="underline">Leg je huisstijl vast</Link>.
      </p>
    );
  }
  return (
    <div>
      <label className="n-label">Huisstijl</label>
      <select value={waarde} onChange={(e) => onKies(e.target.value)} className="n-invoer mt-1.5">
        {kits.map((k) => (
          <option key={k.id} value={k.id}>{k.name}</option>
        ))}
        <option value="geen">Geen huisstijl</option>
      </select>
    </div>
  );
}

/** Wat er naar de server gaat: alleen een echt id, nooit "geen" of nog leeg. */
export function huisstijlVoorServer(waarde: string): { huisstijlId?: string } {
  return waarde && waarde !== "geen" ? { huisstijlId: waarde } : {};
}
