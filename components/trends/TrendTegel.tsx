import Link from "next/link";
import { METHODE_INFO, eersteBeeld, telling, type PubliekeTrend } from "@/lib/trends/types";

// Eén trend in het raster, zoals de bewegingsbibliotheek van Higgsfield: groot het voorbeeld
// (een geslaagd resultaat, anders de trendvideo, anders een screenshot van de trend), met de
// naam eroverheen en een knop om hem na te maken. Niets om te tonen? Dan een kleurvlak.
export default function TrendTegel({ trend: t, vers }: { trend: PubliekeTrend; vers?: boolean }) {
  const video = t.voorbeeld_url ? (t.voorbeeld_soort === "video" ? t.voorbeeld_url : null) : t.voorbeeldclip;
  const beeld = t.voorbeeld_url && t.voorbeeld_soort === "beeld" ? t.voorbeeld_url : !video ? eersteBeeld(t) : null;
  const iets = !!(video || beeld);
  // Hoe viral: de best bekeken TikTok van deze trend.
  const top = Math.max(0, ...t.bron_links.map((l) => l.tiktok?.weergaven ?? 0));
  return (
    <Link
      href={`/studios/trends/${t.id}`}
      className={`group relative block aspect-[3/4] rounded-3xl overflow-hidden border border-rand bg-paneel hover:border-orange-500/60 transition-all ${
        iets ? "" : "bg-gradient-to-br from-orange-500/30 to-transparent"
      }`}
    >
      {video && <video src={video} poster={eersteBeeld(t) ?? undefined} autoPlay muted loop playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />}
      {beeld && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={beeld} alt={t.titel} loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
      )}
      {iets && <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />}
      <div className="relative h-full flex flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-2">
          {!iets && <span className="text-4xl drop-shadow-sm">{t.icoon}</span>}
          <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${iets ? "bg-black/50 text-white" : "bg-paneel-2 text-tekst-2"}`}>
            {METHODE_INFO[t.methode].soort === "video" ? "▶ Video" : "🖼 Beeld"}
          </span>
          {vers && t.hotness >= 8 && (
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide bg-orange-600 text-white px-2 py-0.5 rounded-full">🔥 hot</span>
          )}
        </div>
        <div>
          <h3 className={`font-bold leading-tight ${iets ? "text-white" : "text-tekst"}`}>{t.titel}</h3>
          <p className={`text-xs mt-1 line-clamp-2 ${iets ? "text-white/80" : "text-tekst-2"}`}>{t.uitleg}</p>
          <div className="mt-3 flex items-center justify-between">
            <span className={`text-[11px] ${iets ? "text-white/70" : "text-tekst-3"}`}>
              {top > 0 && <span className={`font-semibold ${iets ? "text-white" : "text-tekst"}`}>▶ {telling(top)} · </span>}
              {t.credits} cr
            </span>
            <span className="rounded-full bg-orange-500 text-white text-xs font-semibold px-3 py-1 group-hover:bg-orange-400">Maak na</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
