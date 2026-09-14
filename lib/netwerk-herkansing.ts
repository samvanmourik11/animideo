// VERBINDINGSHAPERINGEN NAAR SUPABASE OPVANGEN.
//
// Node 26 praat HTTP/2 met Supabase. Terwijl er drie lange clips tegelijk liepen, via
// een telefoonhotspot, sloot de server af en toe een stroom ("NGHTTP2_ENHANCE_YOUR_CALM",
// "NGHTTP2_INTERNAL_ERROR"). Het ergste gevolg: `auth.getUser()` kreeg geen antwoord,
// de route zag geen gebruiker en gaf "Unauthorized" terwijl Sam gewoon ingelogd was.
// Het bewaren en vier clips mislukten zo in één keer.
//
// Alleen lezen (GET/HEAD) wordt opnieuw geprobeerd. Bij een schrijfactie weet je niet
// of die al is uitgevoerd, en een dubbele creditafschrijving is erger dan een foutmelding.

const HAPERING = /ERR_HTTP2_|NGHTTP2_|ECONNRESET|EPIPE|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|UND_ERR_SOCKET|UND_ERR_CLOSED|other side closed/i;

/** Haperde de verbinding (geen antwoord), in plaats van dat de server iets terugzei? */
export function isVerbindingsHapering(fout: unknown): boolean {
  if (!(fout instanceof Error) || fout.name === "AbortError") return false;
  const oorzaak = (fout as Error & { cause?: { code?: unknown; message?: unknown } }).cause;
  if (fout instanceof TypeError && /fetch failed/i.test(fout.message)) return true;
  return HAPERING.test([fout.message, oorzaak?.code, oorzaak?.message].filter((x) => typeof x === "string").join(" "));
}

export function methodeVan(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

export const magOpnieuw = (methode: string) => methode === "GET" || methode === "HEAD";

/** Twee herkansingen: kort, en dan iets langer. Samen ruim een seconde. */
export const WACHTTIJDEN_MS = [300, 1000];

const wacht = (ms: number) => new Promise<void>((klaar) => setTimeout(klaar, ms));

export function maakFetchMetHerkansing(
  // Lui opgehaald: Next.js vervangt de globale fetch pas tijdens het draaien.
  basis: typeof fetch = (input, init) => globalThis.fetch(input, init),
  wachttijden: number[] = WACHTTIJDEN_MS,
  slaap: (ms: number) => Promise<void> = wacht,
): typeof fetch {
  return async (input, init) => {
    const methode = methodeVan(input, init);
    for (let poging = 0; ; poging++) {
      try {
        return await basis(input, init);
      } catch (fout) {
        const opnieuw =
          magOpnieuw(methode) && poging < wachttijden.length && isVerbindingsHapering(fout) && !init?.signal?.aborted;
        if (!opnieuw) throw fout;
        const code = (fout as Error & { cause?: { code?: string } }).cause?.code ?? (fout as Error).message;
        console.warn(`[supabase] verbinding haperde (${code}), poging ${poging + 2}`);
        await slaap(wachttijden[poging]);
      }
    }
  };
}

/** Voor de Supabase-clients op de server: `global: { fetch: fetchMetHerkansing }`. */
export const fetchMetHerkansing = maakFetchMetHerkansing();
