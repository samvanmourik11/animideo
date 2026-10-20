"use client";

import { useState } from "react";
import Link from "next/link";
import { herkomst } from "@/lib/delen/herkomst";
import type { OpenbaarWerk } from "@/lib/delen/profiel";

// Eén openbaar werk: op Ontdek en op een profiel. Klikken opent de deelpagina; daar staat
// "Maak dit ook". Het hartje telt mee voor de volgorde op de voorpagina.
export default function WerkTegel({
  werk,
  hartAan = false,
  donker = false,
}: {
  werk: OpenbaarWerk;
  hartAan?: boolean;
  donker?: boolean;
}) {
  const h = herkomst({ maker: werk.maker, invoer: werk.invoer, soort: werk.soort });
  const [aan, setAan] = useState(hartAan);
  const [aantal, setAantal] = useState(werk.hartjes);
  const [melding, setMelding] = useState<string | null>(null);
  const formaat = werk.invoer.formaat;
  const verhouding = formaat === "9:16" ? "9 / 16" : formaat === "16:9" ? "16 / 9" : werk.soort === "video" ? "16 / 9" : "1 / 1";

  async function hartje() {
    // Meteen tonen; terugdraaien als het niet lukt.
    setAan(!aan);
    setAantal((n) => n + (aan ? -1 : 1));
    const res = await fetch(`/api/creaties/${werk.id}/hartje`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setAan(d.aan);
      setAantal(d.hartjes);
    } else {
      setAan(aan);
      setAantal(werk.hartjes);
      setMelding(d.error ?? "Dat lukte niet.");
      setTimeout(() => setMelding(null), 2500);
    }
  }

  return (
    <div className={`group relative rounded-2xl overflow-hidden border ${donker ? "border-white/10 bg-white/5" : "border-rand bg-paneel"}`}>
      <Link href={`/d/${werk.deel_code}`} className="block" style={{ aspectRatio: verhouding }}>
        {werk.soort === "video" ? (
          <video
            src={werk.url}
            poster={werk.deel_poster ?? undefined}
            muted
            loop
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
            onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => e.currentTarget.pause()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={werk.url} alt={h.naam} loading="lazy" className="w-full h-full object-cover" />
        )}
      </Link>
      <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/75 to-transparent flex items-end gap-2 pointer-events-none">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-white truncate">{h.naam}</div>
          {werk.handle && <div className="text-[11px] text-white/70 truncate">@{werk.handle}</div>}
        </div>
        <button
          onClick={hartje}
          className="pointer-events-auto text-xs text-white bg-black/40 backdrop-blur rounded-full px-2 py-1"
          aria-label={aan ? "Hartje weghalen" : "Hartje geven"}
        >
          {aan ? "❤️" : "🤍"} {aantal}
        </button>
      </div>
      {melding && <div className="absolute top-2 inset-x-2 text-[11px] bg-black/70 text-white rounded-lg px-2 py-1">{melding}</div>}
    </div>
  );
}
