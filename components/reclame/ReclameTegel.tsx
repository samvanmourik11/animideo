import Link from "next/link";
import { RECLAME_CREDITS } from "@/lib/reclame/types";

// De tegel van Link → reclame tussen de apps. Geen recept (dat is één foto, één klik),
// maar wel dezelfde vorm, zodat hij er gewoon tussen staat.
export default function ReclameTegel() {
  return (
    <Link
      href="/apps/reclame"
      className="group relative block aspect-[4/5] rounded-3xl overflow-hidden border border-rand bg-paneel bg-gradient-to-br from-rose-500/30 via-amber-400/10 to-transparent hover:border-blue-500/60 hover:-translate-y-0.5 transition-all"
    >
      <div className="relative h-full flex flex-col justify-between p-4">
        <div className="flex items-start justify-between">
          <span className="text-4xl drop-shadow-sm">🛍️</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide bg-blue-600 text-white px-2 py-0.5 rounded-full">nieuw</span>
        </div>
        <div>
          <h3 className="font-bold leading-tight text-tekst">Link → reclame</h3>
          <p className="text-xs mt-1 line-clamp-2 text-tekst-2">Plak een productlink, krijg een reclamefilmpje met voice-over.</p>
          <p className="text-[11px] mt-2 text-tekst-3">🎬 video · {RECLAME_CREDITS} cr.</p>
        </div>
      </div>
    </Link>
  );
}
