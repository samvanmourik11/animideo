// ÉÉN OPNAME PER STEM, DAARNA IN ZINNEN GEKNIPT.
//
// Elke zin werd los ingesproken, en ElevenLabs v3 kiest bij elke aanroep net een
// andere klemtoon, toonhoogte en vaart: dezelfde oma klonk van zin tot zin als een
// iets andere oma. Alle zinnen van één stem in één opname houdt de stem gelijk.
// ElevenLabs geeft per letter terug wanneer die klinkt; daarmee vinden we waar elke
// zin begint en eindigt, en de stilte ertussen bepaalt waar we precies knippen.
//
// Alles hier is rekenwerk zonder netwerk, zodat het getest kan worden op een echte
// opname (zie de test).

export interface Tijdvak {
  start: number;
  eind: number;
}

/**
 * Hoeveel tekst er hooguit in één opname gaat. ElevenLabs v3 neemt er 5000; ruim
 * daaronder blijft de stem stabiel en blijft een mislukte opname een klein verlies.
 */
export const MAX_TEKENS_PER_OPNAME = 2500;

/** De tekst voor één opname: elke zin een eigen alinea, zodat er een echte pauze tussen valt. */
export function opnameTekst(zinnen: string[]): string {
  return zinnen.map((z) => z.replace(/\s+/g, " ").trim()).join("\n\n");
}

/** De zinnen per stem, in verhaalvolgorde, verdeeld over opnames die niet te lang worden. */
export function opnamesPerStem<T extends { stem: string; tekst: string }>(
  regels: T[],
  maxTekens = MAX_TEKENS_PER_OPNAME,
): { stem: string; regels: T[] }[] {
  const uit: { stem: string; regels: T[]; tekens: number }[] = [];
  const open = new Map<string, { stem: string; regels: T[]; tekens: number }>();
  for (const r of regels) {
    const lengte = r.tekst.length + 2;
    let groep = open.get(r.stem);
    if (!groep || (groep.regels.length > 0 && groep.tekens + lengte > maxTekens)) {
      groep = { stem: r.stem, regels: [], tekens: 0 };
      open.set(r.stem, groep);
      uit.push(groep);
    }
    groep.regels.push(r);
    groep.tekens += lengte;
  }
  return uit.map(({ stem, regels }) => ({ stem, regels }));
}

/**
 * Begin en eind van elke zin, uit de tijden per letter die ElevenLabs teruggeeft.
 *
 * De alinea-overgangen staan als "\n" in die letters; daartussen zit één zin.
 * Klopt het aantal niet met wat we instuurden, dan null: liever per zin opnieuw
 * inspreken dan de zin van oma aan Lilly geven.
 */
export function zinTijden(timestamps: unknown, aantal: number): Tijdvak[] | null {
  if (!Array.isArray(timestamps)) return null;
  const zinnen: Tijdvak[] = [];
  let huidig: Tijdvak | null = null;
  for (const blok of timestamps) {
    const b = blok as { characters?: unknown; character_start_times_seconds?: unknown; character_end_times_seconds?: unknown };
    const tekens = b.characters;
    const starts = b.character_start_times_seconds;
    const einden = b.character_end_times_seconds;
    if (!Array.isArray(tekens) || !Array.isArray(starts) || !Array.isArray(einden)) return null;
    for (let i = 0; i < tekens.length; i++) {
      const teken = tekens[i];
      if (teken === "\n") {
        if (huidig) zinnen.push(huidig);
        huidig = null;
        continue;
      }
      const s = Number(starts[i]);
      const e = Number(einden[i]);
      if (typeof teken !== "string" || !teken.trim() || !Number.isFinite(s) || !Number.isFinite(e)) continue;
      if (huidig) huidig.eind = e;
      else huidig = { start: s, eind: e };
    }
  }
  if (huidig) zinnen.push(huidig);
  return zinnen.length === aantal ? zinnen : null;
}

/** De stiltes uit de uitvoer van ffmpeg's silencedetect. */
export function stiltesUitLog(log: string): Tijdvak[] {
  const uit: Tijdvak[] = [];
  let start: number | null = null;
  for (const regel of log.split("\n")) {
    const s = regel.match(/silence_start:\s*(-?[\d.]+)/);
    if (s) start = Math.max(0, parseFloat(s[1]));
    const e = regel.match(/silence_end:\s*([\d.]+)/);
    if (e && start !== null) {
      uit.push({ start, eind: parseFloat(e[1]) });
      start = null;
    }
  }
  return uit;
}

/**
 * Waar we elke zin uit de opname knippen.
 *
 * De tijden per letter lopen een paar tienden van een seconde voor of achter op het
 * echte geluid: in een proefopname eindigde zin twee volgens ElevenLabs op 6,16s,
 * terwijl de stilte al op 5,78s begon. Knippen op die tijden alleen zou een staartje
 * van de ene zin aan de volgende plakken. Daarom knippen we in de stilte die het
 * dichtst bij de overgang ligt: kort na het begin ervan, en kort voor het eind ervan
 * begint de volgende zin. Zo zit er ook geen seconde stilte vóór een zin, wat het
 * mondbewegen in de clip zou laten beginnen voordat er iets klinkt.
 */
export function knipPunten(zinnen: Tijdvak[], stiltes: Tijdvak[], duur: number): Tijdvak[] {
  const n = zinnen.length;
  const uit = zinnen.map((z) => ({ ...z }));
  for (let i = 0; i < n - 1; i++) {
    const a = zinnen[i].eind;
    const b = zinnen[i + 1].start;
    const midden = (a + b) / 2;
    const stilte = stiltes
      .filter((s) => s.start <= Math.max(a, b) + 0.5 && s.eind >= Math.min(a, b) - 0.5)
      .sort((x, y) => Math.abs((x.start + x.eind) / 2 - midden) - Math.abs((y.start + y.eind) / 2 - midden))[0];
    const eind = stilte ? Math.min(stilte.start + 0.2, stilte.eind) : midden;
    const start = stilte ? Math.max(stilte.eind - 0.12, eind) : midden;
    uit[i].eind = eind;
    uit[i + 1].start = start;
  }
  if (n > 0) {
    uit[0].start = Math.max(0, zinnen[0].start - 0.05);
    uit[n - 1].eind = duur > 0 ? Math.min(duur, zinnen[n - 1].eind + 0.3) : zinnen[n - 1].eind + 0.3;
  }
  return uit;
}
