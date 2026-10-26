"use client";

import { SCENE_STAP_LABEL, type SceneStap } from "@/lib/film/types";
import type { Creatie } from "@/lib/creaties/types";
import { klantReden } from "@/lib/creaties/melding";
import { STAP_LABEL, type ReclameStap } from "@/lib/reclame/types";
import { UGC_STAP_LABEL, type UgcStap } from "@/lib/ugc/types";
import { TRAILER_STAP_LABEL, type TrailerStap } from "@/lib/trailer/types";

// Eén tegel in de bibliotheek of de resultatenrij: het beeld of de video zelf, met
// zichtbaar of het nog bezig is of mislukt. Klikken opent de detailweergave.

const SOORT_ICOON: Record<string, string> = { beeld: "🖼️", video: "🎬", audio: "🎵" };

export function verhouding(c: Creatie): string {
  const f = (c.invoer as { formaat?: string }).formaat;
  if (f === "9:16") return "9 / 16";
  if (f === "16:9") return "16 / 9";
  if (c.soort === "video") return "16 / 9";
  if (c.soort === "audio") return "4 / 3";
  return "1 / 1";
}

/** Doorzichtige beelden (achtergrond weg) op een schaakbord, anders zie je niet dat het werkte. */
export const SCHAAKBORD =
  "bg-[length:16px_16px] bg-[conic-gradient(#cbd5e1_25%,#f1f5f9_0_50%,#cbd5e1_0_75%,#f1f5f9_0)]";

export function isDoorzichtig(c: Creatie): boolean {
  return !!c.url && /\.png($|\?)/i.test(c.url);
}

function gestoptAls(c: Creatie): string | undefined {
  return (c.invoer as { gestopt?: string }).gestopt;
}

function bezigLabel(c: Creatie): string {
  // Een reclame loopt minutenlang door drie stappen; laat zien waar hij is.
  const stap = (c.invoer as { voortgang?: { stap?: ReclameStap } }).voortgang?.stap;
  if (c.maker === "reclame" && stap) return STAP_LABEL[stap];
  if (c.maker === "trailer" && stap) return TRAILER_STAP_LABEL[stap as unknown as TrailerStap] ?? "Wordt gemaakt…";
  if (c.maker === "ugc" && stap) return UGC_STAP_LABEL[stap as unknown as UgcStap] ?? "Wordt gemaakt…";
  if (c.maker === "film-scene" && stap) return SCENE_STAP_LABEL[stap as unknown as SceneStap] ?? "Wordt gemaakt…";
  if (c.maker === "film") return "Film wordt gemonteerd…";
  return c.soort === "video" ? "Video wordt gemaakt…" : "Wordt gemaakt…";
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
        {c.status === "klaar" && c.url && c.soort === "audio" && (
          // Geen speler in de tegel (die is zelf een knop); afspelen gaat in het detailvenster.
          <div className="w-full h-full flex flex-col justify-between p-3 bg-gradient-to-br from-violet-500/20 via-blue-500/10 to-transparent">
            <div className="flex items-end gap-0.5 h-8 opacity-70">
              {[3, 6, 4, 8, 5, 7, 3, 6, 9, 4, 6, 3, 7, 5].map((h, i) => (
                <span key={i} className="w-1 rounded-full bg-blue-500" style={{ height: `${h * 10}%` }} />
              ))}
            </div>
            <div className="text-xs text-tekst-2 line-clamp-3">{c.prompt}</div>
          </div>
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
            <span className="text-xs text-tekst-3 px-3 text-center">{bezigLabel(c)}</span>
            <span className="text-[11px] text-tekst-3">Klik om te bekijken of te stoppen</span>
          </div>
        )}
        {c.status === "mislukt" && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center bg-red-500/5">
            <span className="text-2xl">⚠️</span>
            <span className="text-xs text-red-600 dark:text-red-300">{gestoptAls(c) ? "Gestopt" : "Mislukt"}</span>
            {gestoptAls(c) ? (
              <span className="text-[11px] text-tekst-3">{gestoptAls(c) === "verbruikt" ? "Credits verbruikt" : "Credits zijn terug"}</span>
            ) : (
              <>
                <span className="text-[11px] text-tekst-2 line-clamp-3">{klantReden(c.foutmelding)}</span>
                {c.credits > 0 && <span className="text-[11px] text-tekst-3">Credits zijn terug</span>}
              </>
            )}
            <span className="text-[11px] text-blue-600 dark:text-blue-400">Klik om opnieuw te proberen</span>
          </div>
        )}
      </button>

      <span className="absolute top-2 left-2 text-xs bg-black/50 backdrop-blur px-1.5 py-0.5 rounded-md">
        {c.maker === "upload" && c.soort === "beeld" ? "📷" : SOORT_ICOON[c.soort]}
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
