import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseMotion } from "@/lib/studio/access";
import { lengteVoorWoorden, schrijfPlan, telWoorden } from "@/lib/motion/plan";
import { leesBeelden } from "@/lib/motion/beelden";
import { MOTION_LENGTES, WOORDEN_PER_SEC, isMotionLengte, maxWoorden } from "@/lib/motion/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const kort = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

// Motion graphics, stap 1: het script. Gratis, zo vaak als de klant wil.
// Twee manieren: wij schrijven het script bij een onderwerp, of de klant levert een eigen
// script aan en wij verdelen het in scenes zonder aan de tekst te komen.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  if (!canUseMotion(user.email)) return NextResponse.json({ error: "Deze studio is nog niet beschikbaar voor jouw account." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const eigenScript = body.eigenScript === true;
  const onderwerp = typeof body.onderwerp === "string" ? body.onderwerp.trim().slice(0, eigenScript ? 6000 : 4000) : "";
  const bedrijf = kort(body.bedrijf, 40);
  if (onderwerp.length < 10) return NextResponse.json({ error: eigenScript ? "Plak of upload eerst je script." : "Vertel eerst waar de video over moet gaan." }, { status: 400 });
  if (!bedrijf) return NextResponse.json({ error: "Vul eerst de naam van je bedrijf in." }, { status: 400 });

  const langste = MOTION_LENGTES[MOTION_LENGTES.length - 1].sec;
  let lengte = isMotionLengte(body.lengte) ? body.lengte : 30;
  if (eigenScript) {
    // Ruim gemeten (in het script staan vaak ook aanwijzingen die niet worden uitgesproken):
    // pas afwijzen als het er echt niet in past.
    const woorden = onderwerp.split(/\s+/).filter(Boolean).length;
    if (woorden > maxWoorden(langste) * 1.6) {
      return NextResponse.json(
        { error: `Je script is ongeveer ${Math.round(woorden / WOORDEN_PER_SEC / 5) * 5} seconden. Een video is nu hooguit ±${langste} seconden. Kort het script in, of zet "Gebruik mijn tekst letterlijk" uit: dan korten wij het voor je in.` },
        { status: 400 },
      );
    }
    lengte = langste;
  }

  try {
    const { plan, afwijkend } = await schrijfPlan({
      onderwerp,
      bedrijf,
      lengte,
      staand: body.formaat === "9:16",
      eigenScript,
      toon: kort(body.toon, 600),
      nietDoen: kort(body.nietDoen, 600),
      beelden: leesBeelden(body.beelden),
    });
    // Bij een eigen script bepaalt de tekst de lengte (en dus de prijs), niet andersom.
    if (eigenScript) lengte = lengteVoorWoorden(telWoorden(plan)) ?? langste;
    return NextResponse.json({ plan, afwijkend, lengte });
  } catch (e) {
    console.error("[motion/plan]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Script schrijven mislukt." }, { status: 500 });
  }
}
