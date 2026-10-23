import type { NextRequest } from "next/server";

// Het eigen adres zoals de buitenwereld het ziet (achter Vercel: de host uit het verzoek).
// Alle OAuth-adressen moeten precies hierop aansluiten, anders weigert Claude ze.
export function origin(req: NextRequest | Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}
