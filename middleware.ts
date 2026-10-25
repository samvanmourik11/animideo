import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// animideo.com is de website, ai.animideo.com de app; beide draaien op deze ene app
// (Sam, 25-10-2026). Op animideo.com tonen we de pagina's onder /site; al het andere daar
// (inloggen, betalen, oude links) sturen we door naar de app.
const SITE_HOSTS = new Set(["animideo.com", "www.animideo.com"]);
const SITE_PADEN = new Set(["/youtube", "/bedrijven", "/kinderen", "/nederlands"]);
const APP_ADRES = "https://ai.animideo.com";

export async function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const { pathname, search } = request.nextUrl;

  if (SITE_HOSTS.has(host)) {
    if (host.startsWith("www.")) return NextResponse.redirect(`https://animideo.com${pathname}${search}`, 308);
    if (pathname === "/" || SITE_PADEN.has(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = pathname === "/" ? "/site" : `/site${pathname}`;
      return NextResponse.rewrite(url);
    }
    if (pathname.startsWith("/_next") || pathname.startsWith("/site")) return NextResponse.next();
    return NextResponse.redirect(`${APP_ADRES}${pathname}${search}`, 307);
  }

  // Op het app-adres (en lokaal) werken de landingspagina's ook, onder hun eigen naam.
  if (SITE_PADEN.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/site${pathname}`;
    return NextResponse.rewrite(url);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
