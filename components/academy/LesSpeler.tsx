"use client";

import { useState } from "react";
import Link from "next/link";
import type { Opdracht } from "@/lib/academy/lessen";

// De video van een les met de opdracht ernaast. Kijk je hem af, dan telt hij als bekeken.
export default function LesSpeler({ les, video, poster, bekeken: begin, gedaan: gedaanBegin, opdracht }: {
  les: string; video: string; poster: string; bekeken: boolean; gedaan: boolean; opdracht: Opdracht;
}) {
  const [bekeken, setBekeken] = useState(begin);
  const [gedaan, setGedaan] = useState(gedaanBegin);

  async function meld(wat: "bekeken" | "afgevinkt") {
    if (wat === "bekeken") setBekeken(true);
    else setGedaan(true);
    await fetch("/api/academy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ les, wat }) }).catch(() => {});
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
      <div className="rounded-2xl overflow-hidden border border-rand bg-black">
        <video
          src={video}
          poster={poster}
          controls
          playsInline
          preload="metadata"
          className="w-full aspect-video"
          onEnded={() => !bekeken && meld("bekeken")}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            // Bijna tot het eind gekeken telt ook: niet iedereen wacht op de laatste seconde.
            if (!bekeken && v.duration && v.currentTime / v.duration > 0.9) meld("bekeken");
          }}
        />
      </div>
      <div className="n-kaart flex flex-col gap-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-tekst-3">Opdracht</div>
        <p className="text-sm font-semibold text-tekst">{opdracht.tekst}</p>
        <Link href={opdracht.link} className="btn-primary text-sm text-center">{opdracht.knop} →</Link>
        {gedaan ? (
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">✓ Opdracht gedaan</p>
        ) : opdracht.check === "geen" ? (
          <button onClick={() => meld("afgevinkt")} className="n-knop2 text-sm">Gedaan</button>
        ) : (
          <p className="text-xs text-tekst-3">Deze vinkt zichzelf af zodra je het gemaakt hebt.</p>
        )}
        <div className="mt-auto pt-3 border-t border-rand text-xs">
          {bekeken ? (
            <span className="text-emerald-600 dark:text-emerald-400">✓ Les bekeken</span>
          ) : (
            <button onClick={() => meld("bekeken")} className="text-tekst-3 hover:text-tekst">Markeer als bekeken</button>
          )}
        </div>
      </div>
    </div>
  );
}
