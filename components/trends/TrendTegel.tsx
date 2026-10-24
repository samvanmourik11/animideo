import Link from "next/link";
import { METHODE_INFO, type PubliekeTrend } from "@/lib/trends/types";

// Eén trend in het raster: het voorbeeld (een geslaagd resultaat, anders de trendvideo zelf)
// groot, met de naam eroverheen. Nog niets om te tonen? Dan een kleurvlak met icoon.
export default function TrendTegel({ trend: t, vers }: { trend: PubliekeTrend; vers?: boolean }) {
  const video = t.voorbeeld_url ? (t.voorbeeld_soort === "video" ? t.voorbeeld_url : null) : t.voorbeeldclip;
  const beeld = t.voorbeeld_url && t.voorbeeld_soort === "beeld" ? t.voorbeeld_url : null;
  const iets = !!(video || beeld);
  return (
    <Link
      href={`/studios/trends/${t.id}`}
      className={`group relative block aspect-[4/5] rounded-3xl overflow-hidden border border-rand bg-paneel hover:border-orange-500/60 hover:-translate-y-0.5 transition-all ${
        iets ? "" : "bg-gradient-to-br from-orange-500/30 to-transparent"
      }`}
    >
      {video && <video src={video} autoPlay muted loop playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />}
      {beeld && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={beeld} alt={t.titel} loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      )}
      {iets && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />}
      <div className="relative h-full flex flex-col justify-between p-4">
        <div className="flex items-start justify-between">
          {!iets && <span className="text-4xl drop-shadow-sm">{t.icoon}</span>}
          {vers && t.hotness >= 8 && (
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide bg-orange-600 text-white px-2 py-0.5 rounded-full">🔥 hot</span>
          )}
        </div>
        <div>
          <h3 className={`font-bold leading-tight ${iets ? "text-white" : "text-tekst"}`}>{t.titel}</h3>
          <p className={`text-xs mt-1 line-clamp-2 ${iets ? "text-white/80" : "text-tekst-2"}`}>{t.uitleg}</p>
          <p className={`text-[11px] mt-2 ${iets ? "text-white/60" : "text-tekst-3"}`}>
            {METHODE_INFO[t.methode].soort === "video" ? "Video" : "Beeld"} · {t.credits} credits
          </p>
        </div>
      </div>
    </Link>
  );
}
