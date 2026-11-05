// Claude weigert een verzoek met méér dan 20 beelden zodra één ervan groter is dan 2000 px
// (fout 400, "many-image requests"). Grote eigen foto's van klanten zijn heel gewoon, dus na
// een tijdje liep elk gesprek met foto's vast en kreeg de klant geen antwoord meer
// (Sterrenrijk, 03-11-2026). Daarom sturen we alleen de nieuwste beelden mee; oudere worden
// een tekstregel met het adres. Het opgeslagen gesprek blijft ongewijzigd.

export const MAX_BEELDEN = 20;

type Blok = { type?: string; source?: { type?: string; url?: string }; content?: unknown };
type Bericht = { role: string; content: unknown };

export function beperkBeelden<T extends Bericht>(berichten: T[], max = MAX_BEELDEN): T[] {
  let teller = 0;
  const vervang = (blokken: Blok[]): Blok[] => {
    // Van achter naar voren: de nieuwste beelden blijven staan.
    const uit = [...blokken];
    for (let i = uit.length - 1; i >= 0; i--) {
      const b = uit[i];
      if (b?.type === "image") {
        teller++;
        if (teller > max) {
          const url = b.source?.type === "url" ? b.source.url : undefined;
          uit[i] = { type: "text", text: url ? `(Eerder getoond beeld: ${url})` : "(Eerder getoond beeld.)" } as Blok;
        }
      } else if (b?.type === "tool_result" && Array.isArray(b.content)) {
        uit[i] = { ...b, content: vervang(b.content as Blok[]) };
      }
    }
    return uit;
  };
  const uit = [...berichten];
  for (let i = uit.length - 1; i >= 0; i--) {
    const m = uit[i];
    if (Array.isArray(m.content)) uit[i] = { ...m, content: vervang(m.content as Blok[]) };
  }
  return uit;
}
