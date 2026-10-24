// Leest trending Higgsfield-presets in als trendvoorstellen (zie lib/trends/higgsfield.ts).
// De lijst (json) komt uit de Higgsfield-koppeling van Claude Code:
//   npx tsx --env-file=.env.local scripts/higgsfield-trends.ts <lijst.json>
import { readFile } from "node:fs/promises";
import { bekendeHiggsfieldIds, importeer, type HiggsfieldTrend } from "@/lib/trends/higgsfield";

(async () => {
  const lijst = JSON.parse(await readFile(process.argv[2], "utf8")) as HiggsfieldTrend[];
  const bekend = await bekendeHiggsfieldIds();
  const nieuw = lijst.filter((h) => !bekend.has(h.id));
  console.log(`${nieuw.length} nieuw (${lijst.length - nieuw.length} al bekend)`);
  // Vier tegelijk: snel genoeg, zonder Higgsfields opslag of Claude te overspoelen.
  for (let i = 0; i < nieuw.length; i += 4) {
    await Promise.all(
      nieuw.slice(i, i + 4).map(async (h) => {
        try {
          console.log(`${h.soort} ${h.naam}: ${await importeer(h)}`);
        } catch (e) {
          console.log(`${h.soort} ${h.naam}: FOUT ${String(e).slice(0, 200)}`);
        }
      }),
    );
  }
})();
