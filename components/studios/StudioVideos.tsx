"use client";

import { useState } from "react";
import type { Creatie } from "@/lib/creaties/types";
import CreatieKaart from "@/components/creaties/CreatieKaart";
import CreatieDetail from "@/components/creaties/CreatieDetail";
import { useCreaties, zetFavoriet } from "@/components/creaties/gebruik-creaties";

// De geëxporteerde video's van deze studio; dezelfde als in de bibliotheek.
export default function StudioVideos({ maker }: { maker: string }) {
  const lijst = useCreaties({ maker });
  const [open, setOpen] = useState<Creatie | null>(null);
  if (!lijst.laden && lijst.creaties.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold text-tekst-2 mb-3">Je video&apos;s</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 items-start">
        {lijst.creaties.map((c) => (
          <CreatieKaart key={c.id} creatie={c} onOpen={() => setOpen(c)} onFavoriet={async () => lijst.werkBij(await zetFavoriet(c))} />
        ))}
      </div>
      {open && (
        <CreatieDetail
          creatie={lijst.creaties.find((c) => c.id === open.id) ?? open}
          onSluit={() => setOpen(null)}
          onGewijzigd={lijst.werkBij}
          onWeg={lijst.haalWeg}
          onNieuw={() => {}}
        />
      )}
    </section>
  );
}
