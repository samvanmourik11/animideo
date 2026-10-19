import Link from "next/link";
import { receptPad, type Recept } from "@/lib/creaties/recepten";

// Eén tegel in het effecten- of appsraster. Zolang er nog geen voorbeeldbeelden zijn,
// een kleurvlak met een groot icoon; later komt hier een voorbeeldfilmpje.
export default function ReceptTegel({ recept: r }: { recept: Recept }) {
  return (
    <Link
      href={receptPad(r)}
      className={`group relative flex flex-col justify-between aspect-[4/5] rounded-3xl p-4 bg-paneel bg-gradient-to-br ${r.kleur} to-transparent border border-rand hover:border-blue-500/60 hover:-translate-y-0.5 transition-all`}
    >
      <div className="flex items-start justify-between">
        <span className="text-4xl drop-shadow-sm">{r.icoon}</span>
        {r.nieuw && (
          <span className="text-[10px] font-semibold uppercase tracking-wide bg-blue-600 text-white px-2 py-0.5 rounded-full">nieuw</span>
        )}
      </div>
      <div>
        <h3 className="font-bold text-tekst leading-tight">{r.naam}</h3>
        <p className="text-xs text-tekst-2 mt-1 line-clamp-2">{r.uitleg}</p>
        <p className="text-[11px] text-tekst-3 mt-2">
          {r.soort === "video" ? "🎬 video" : "🖼️ beeld"} · {r.credits} cr.
        </p>
      </div>
    </Link>
  );
}
