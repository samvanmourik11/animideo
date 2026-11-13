import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Links in de bio van de niche-pagina's: ai.animideo.com/ig/<naam> en /tt/<naam>.
// De klik wordt geteld, de bezoeker krijgt 30 dagen een cookie met de pagina, en wie daarna
// iets koopt wordt in bio_aankopen aan die pagina gekoppeld. Het CRM telt het op.

export const BRON_COOKIE = "animideo_bron";
const GELDIG = /^(ig|tt):[a-z0-9._]{1,40}$/;
const SITE = "https://animideo.com/";

export function bronUit(req: NextRequest): string | null {
  const b = req.cookies.get(BRON_COOKIE)?.value?.toLowerCase() ?? "";
  return GELDIG.test(b) ? b : null;
}

export async function klik(req: NextRequest, platform: "ig" | "tt", naam: string) {
  const bron = `${platform}:${decodeURIComponent(naam).toLowerCase().replace(/^@/, "")}`;
  const doel = new URL(SITE);
  doel.searchParams.set("utm_source", platform === "ig" ? "instagram" : "tiktok");
  doel.searchParams.set("utm_medium", "bio");
  if (!GELDIG.test(bron)) return NextResponse.redirect(doel, 307);
  doel.searchParams.set("utm_campaign", bron.slice(3));
  // Bots en voorvertoningen (Instagram haalt de link zelf op) tellen niet als klik.
  const ua = req.headers.get("user-agent") ?? "";
  if (!/bot|crawl|spider|preview|facebookexternalhit|curl|wget/i.test(ua) && req.method === "GET") {
    await createServiceClient().from("bio_kliks").insert({ bron }).then(({ error }) => error && console.error("[bio] klik:", error.message));
  }
  const res = NextResponse.redirect(doel, 307);
  const host = (req.headers.get("host") ?? "").split(":")[0];
  res.cookies.set(BRON_COOKIE, bron, {
    maxAge: 30 * 24 * 3600,
    path: "/",
    sameSite: "lax",
    secure: true,
    // Ook op animideo.com zelf geldig, zodat de cookie meegaat naar /start op de app.
    ...(host.endsWith("animideo.com") ? { domain: ".animideo.com" } : {}),
  });
  return res;
}

/** Een aankoop/aanmelding aan de bio-pagina koppelen (als de klant via zo'n link kwam). */
export async function bewaarAankoop(req: NextRequest, a: { soort: string; plan?: string | null; email?: string | null; klant?: string | null; betaling?: string | null }) {
  const bron = bronUit(req);
  if (!bron) return;
  const { error } = await createServiceClient().from("bio_aankopen").insert({
    bron, soort: a.soort, plan: a.plan ?? null, email: a.email?.toLowerCase() ?? null, mollie_customer_id: a.klant ?? null, mollie_payment_id: a.betaling ?? null,
  });
  if (error) console.error("[bio] aankoop:", error.message);
}
