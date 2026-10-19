import Link from "next/link";
import { receptPad, type Recept } from "@/lib/creaties/recepten";
import { voorbeeld } from "@/lib/creaties/voorbeelden";

// Eén tegel in het effecten- of appsraster: groot het voorbeeld van wat je krijgt (bij
// effecten een spelend filmpje), met de naam eroverheen. Nog geen voorbeeld? Dan een
// kleurvlak met icoon.
export default function ReceptTegel({ recept: r }: { recept: Recept }) {
  const v = voorbeeld(r.id);
  return (
    <Link
      href={receptPad(r)}
      className={`group relative block aspect-[4/5] rounded-3xl overflow-hidden border border-rand bg-paneel hover:border-blue-500/60 hover:-translate-y-0.5 transition-all ${
        v ? "" : `bg-gradient-to-br ${r.kleur} to-transparent`
      }`}
    >
      {v?.soort === "video" && (
        <video
          src={v.resultaat}
          poster={v.invoer}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {v?.soort === "beeld" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={v.resultaat}
          alt={r.naam}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
      )}
      {v && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />}

      <div className="relative h-full flex flex-col justify-between p-4">
        <div className="flex items-start justify-between">
          {!v && <span className="text-4xl drop-shadow-sm">{r.icoon}</span>}
          {r.nieuw && (
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide bg-blue-600 text-white px-2 py-0.5 rounded-full">nieuw</span>
          )}
        </div>
        <div>
          <h3 className={`font-bold leading-tight ${v ? "text-white" : "text-tekst"}`}>{r.naam}</h3>
          <p className={`text-xs mt-1 line-clamp-2 ${v ? "text-white/80" : "text-tekst-2"}`}>{r.uitleg}</p>
          <p className={`text-[11px] mt-2 ${v ? "text-white/60" : "text-tekst-3"}`}>
            {r.soort === "video" ? "🎬 video" : "🖼️ beeld"} · {r.credits} cr.
          </p>
        </div>
      </div>
    </Link>
  );
}
