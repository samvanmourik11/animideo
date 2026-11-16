// Ondertitels als .srt-bestand, voor wie ze zelf wil gebruiken (YouTube, LinkedIn, een
// eigen montageprogramma). Zelfde indeling in regels als de balk-ondertitels in beeld
// (public/motion/kern.js, bouwOndertitels).
import type { WhisperWord } from "@/lib/openai";

/** De stem begint 0,3 s na het eerste beeld (kern.js, D). */
const D = 0.3;

export function regelsUit(woorden: WhisperWord[], staand: boolean): { van: number; tot: number; tekst: string }[] {
  const max = staand ? 26 : 44;
  const ws = woorden.filter((w) => String(w.word ?? "").trim());
  const groepen: WhisperWord[][] = [];
  ws.forEach((w, i) => {
    const r = groepen[groepen.length - 1];
    const vorige = ws[i - 1];
    const lengte = r ? r.reduce((n, x) => n + x.word.trim().length + 1, 0) : 0;
    if (!r || lengte + w.word.trim().length > max || (vorige && w.start - vorige.end > 0.45) || (vorige && /[.!?…]$/.test(vorige.word.trim()))) groepen.push([w]);
    else r.push(w);
  });
  return groepen.map((g, i) => {
    const volgende = groepen[i + 1];
    return {
      van: g[0].start + D,
      tot: Math.min(g[g.length - 1].end + 0.6, volgende ? volgende[0].start - 0.05 : Infinity) + D,
      tekst: g.map((w) => w.word.trim()).join(" "),
    };
  });
}

function tijd(s: number): string {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

export function srt(woorden: WhisperWord[], staand: boolean): string {
  return regelsUit(woorden, staand).map((r, i) => `${i + 1}\n${tijd(r.van)} --> ${tijd(r.tot)}\n${r.tekst}\n`).join("\n");
}
