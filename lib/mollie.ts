// Gedeelde Mollie-client. Vervangt de per-route herhaalde `fetch`-logica en
// centraliseert paginatie (hergebruikt uit scripts/abonnementen-pdf-mollie.mjs).
// Alleen server-side gebruiken — de MOLLIE_API_KEY mag nooit naar de client lekken.

const MOLLIE_BASE = "https://api.mollie.com/v2";

function apiKey(): string {
  const k = process.env.MOLLIE_API_KEY;
  if (!k || /x{4,}/.test(k)) {
    throw new Error("MOLLIE_API_KEY ontbreekt of is een placeholder");
  }
  return k;
}

/** Enkele Mollie-call. `path` mag relatief (`/subscriptions`) of absoluut zijn. */
export async function mollieFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${MOLLIE_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mollie ${res.status} op ${path}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

interface PaginateOpts {
  /** Aantal per pagina (max 250). */
  limit?: number;
  /** Harde bovengrens op het totaal aantal items. */
  max?: number;
  /**
   * Stop met verder pagineren zodra de laatste item op een pagina ouder is dan
   * deze ISO-datum. Mollie levert nieuwste-eerst, dus dit begrenst het ophalen
   * tot een relevant tijdsvenster (bv. betalingen van de laatste 90 dagen).
   */
  stopAtOlderThan?: string;
}

/**
 * Haalt alle pagina's van een Mollie-list op door `_links.next` te volgen.
 * `embedded` is de sleutel in `_embedded` (bv. "subscriptions", "payments").
 */
export async function molliePaginate<T = Record<string, unknown>>(
  path: string,
  embedded: string,
  opts: PaginateOpts = {}
): Promise<T[]> {
  const limit = opts.limit ?? 250;
  const max = opts.max ?? Infinity;
  const sep = path.includes("?") ? "&" : "?";
  let url: string | null = `${MOLLIE_BASE}${path}${sep}limit=${limit}`;
  const out: T[] = [];

  type Page = { _embedded?: Record<string, T[]>; _links?: { next?: { href: string } | null } };
  while (url && out.length < max) {
    const j: Page = await mollieFetch<Page>(url);
    const items = j._embedded?.[embedded] ?? [];
    out.push(...items);

    if (opts.stopAtOlderThan) {
      const last = items[items.length - 1] as { createdAt?: string } | undefined;
      if (last?.createdAt && new Date(last.createdAt) < new Date(opts.stopAtOlderThan)) break;
    }
    url = j._links?.next?.href ?? null;
  }

  return out.slice(0, max);
}
