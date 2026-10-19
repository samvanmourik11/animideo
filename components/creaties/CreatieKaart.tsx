"use client";

import type { Creatie } from "@/lib/creaties/types";

// Eén tegel in de bibliotheek of de resultatenrij: het beeld of de video zelf, met
// zichtbaar of het nog bezig is of mislukt. Klikken opent de detailweergave.

const SOORT_ICOON: Record<string, string> = { beeld: "🖼️", video: "🎬", audio: "🎵" };

export function verhouding(c: Creatie): string {
  const f = (c.invoer as { formaat?: string }).formaat;
  if (f === "9:16") return "9 / 16";
  if (f === "16:9") return "16 / 9";
  if (c.soort === "video") return "16 / 9";
  return "1 / 1";
}

/** Doorzichtige beelden (achtergrond weg) op een schaakbord, anders zie je niet dat het werkte. */
export const SCHAAKBORD =
  "bg-[length:16px_16px] bg-[conic-gradient(#cbd5e1_25%,#f1f5f9_0_50%,#cbd5e1_0_75%,#f1f5f9_0)]";

export function isDoorzichtig(c: Creatie): boolean {
  return !!c.url && /\.png($|\?)/i.test(c.url);
}

export default function CreatieKaart({
  creatie,
  onOpen,
  onFavoriet,
}: {
  creatie: Creatie;
  onOpen: () => void;
  onFavoriet?: () => void;
}) {
  const c = creatie;
  return (
    <div className="group relative rounded-2xl overflow-hidden bg-paneel border border-rand hover:border-blue-500/50 transition-colors">
      <button
        onClick={onOpen}
        className={`block w-full text-left ${isDoorzichtig(c) ? SCHAAKBORD : ""}`}
        style={{ aspectRatio: verhouding(c) }}
      >
        {c.status === "klaar" && c.url && c.soort === "beeld" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.url}
            alt={c.prompt ?? ""}
            className={`w-full h-full ${isDoorzichtig(c) ? "object-contain" : "object-cover"}`}
            loading="lazy"
          />
        )}
        {c.status === "klaar" && c.url && c.soort === "video" && (
          <video
            src={c.url}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
            preload="metadata"
            onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => e.currentTarget.pause()}
          />
        )}
        {c.status === "bezig" && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-blue-500/10 to-transparent">
            <div className="w-8 h-8 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
            <span className="text-xs text-tekst-3">{c.soort === "video" ? "Video wordt gemaakt…" : "Wordt gemaakt…"}</span>
          </div>
        )}
        {c.status === "mislukt" && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center bg-red-500/5">
            <span className="text-2xl">⚠️</span>
            <span className="text-xs text-red-600 dark:text-red-300">Mislukt</span>
            {c.credits > 0 && <span className="text-[11px] text-tekst-3">Credits zijn terug</span>}
          </div>
        )}
      </button>

      <span className="absolute top-2 left-2 text-xs bg-black/50 backdrop-blur px-1.5 py-0.5 rounded-md">
        {c.maker === "upload" ? "📷" : SOORT_ICOON[c.soort]}
      </span>
      {onFavoriet && c.status === "klaar" && (
        <button
          onClick={onFavoriet}
          className={`absolute top-2 right-2 text-sm px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur transition-opacity ${
            c.favoriet ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          aria-label={c.favoriet ? "Uit favorieten" : "Favoriet maken"}
        >
          {c.favoriet ? "❤️" : "🤍"}
        </button>
      )}
    </div>
  );
}
