import { readdir, rm, stat, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Werkruimte van de export. De export draait in een Vercel-functie met ~512 MB tijdelijke
// schijf, en die schijf is NIET per export schoon:
//   - een warme functie draait meerdere exports na elkaar (en tegelijk) op dezelfde schijf;
//   - wordt een export hard afgebroken (tijdslimiet van 300 seconden), dan draait de
//     opruimstap niet en blijft de werkmap met honderden MB tussenbestanden staan.
// Zo kreeg een klant met een film van 2:59 (die ruim binnen de oude vaste grens van
// 400 MB paste) toch "ENOSPC: no space left on device" en dacht hij dat het aan zijn
// laptop lag. Daarom: eerst resten van afgebroken exports opruimen, en rekenen met de
// ruimte die er ECHT vrij is in plaats van met een vaste grens.

export const WERKMAP_PREFIX = "export-";
/** Ouder dan dit kan een werkmap niet meer van een lopende export zijn (maxDuration is 300 s). */
const AFGEBROKEN_NA_MS = 6 * 60_000;
/** Speling voor ffmpeg-logs, de muziek en het concat-bestand. */
const MARGE_MB = 40;

/** Werkmappen van afgebroken exports weghalen. Lopende exports (jonger dan 6 minuten) blijven staan. */
export async function ruimAfgebrokenExportsOp(nu = Date.now(), map = tmpdir()): Promise<number> {
  let weg = 0;
  const namen = await readdir(map).catch(() => [] as string[]);
  for (const naam of namen) {
    if (!naam.startsWith(WERKMAP_PREFIX)) continue;
    const pad = join(map, naam);
    try {
      const s = await stat(pad);
      if (s.isDirectory() && nu - s.mtimeMs > AFGEBROKEN_NA_MS) {
        await rm(pad, { recursive: true, force: true });
        weg++;
      }
    } catch {
      // Een andere export ruimt hem net zelf op.
    }
  }
  return weg;
}

/** Vrije ruimte op de tijdelijke schijf in MB (Infinity als dat niet te meten is). */
export async function vrijeMB(map = tmpdir()): Promise<number> {
  try {
    const s = await statfs(map);
    return (s.bavail * s.bsize) / 1e6;
  } catch {
    return Infinity;
  }
}

/**
 * Past de rest van de export nog? `nodigMB` is de verwachte piek van de hele export,
 * `alGebruiktMB` wat deze export nu al op de schijf heeft staan (telt mee in de piek,
 * maar is van de vrije ruimte al af).
 */
export function pastNog(a: { nodigMB: number; alGebruiktMB: number; vrijMB: number }): boolean {
  return a.nodigMB - a.alGebruiktMB + MARGE_MB <= a.vrijMB;
}

export function isSchijfVol(err: unknown): boolean {
  const m = err instanceof Error ? `${(err as NodeJS.ErrnoException).code ?? ""} ${err.message}` : String(err);
  return /ENOSPC|no space left on device/i.test(m);
}

export const SCHIJF_VOL_MELDING =
  "Er was even te weinig werkruimte op onze exportserver. Dat ligt niet aan je computer. " +
  "Je project is gewoon bewaard; probeer het over een paar minuten opnieuw. Lukt het dan nog niet, laat het ons weten via de supportknop.";
