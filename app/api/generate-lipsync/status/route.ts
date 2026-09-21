import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { isTeamAccount } from "@/lib/studio/access";
import { persistFalAssetSoft } from "@/lib/infographics/persist-asset";
import { LIPSYNC_MODEL } from "@/lib/lipsync";

fal.config({ credentials: process.env.FAL_KEY });

export const runtime = "nodejs";
export const maxDuration = 60;

// Stand van een lipsync-clip. Klaar = de video naar onze eigen opslag, want de link van
// fal verloopt en editors halen de clip soms pas later op.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  if (!isTeamAccount(user.email)) return NextResponse.json({ error: "Deze functie is niet beschikbaar" }, { status: 403 });

  const requestId = req.nextUrl.searchParams.get("requestId");
  if (!requestId) return NextResponse.json({ error: "requestId ontbreekt" }, { status: 400 });

  try {
    const st = (await fal.queue.status(LIPSYNC_MODEL, { requestId, logs: false })) as { status: string };
    if (st.status === "IN_QUEUE" || st.status === "IN_PROGRESS") return NextResponse.json({ status: "BEZIG" });
    if (st.status !== "COMPLETED") return NextResponse.json({ status: "MISLUKT", error: `Lipsync mislukt (${st.status})` });

    const result = await fal.queue.result(LIPSYNC_MODEL, { requestId });
    const tijdelijk = (result.data as { video?: { url: string } }).video?.url;
    if (!tijdelijk) return NextResponse.json({ status: "MISLUKT", error: "Geen video ontvangen" });
    const videoUrl = await persistFalAssetSoft(supabase, user.id, tijdelijk, "video");
    return NextResponse.json({ status: "KLAAR", videoUrl });
  } catch (err: unknown) {
    // Een afgekeurde opdracht staat als COMPLETED in de wachtrij; result() gooit dan een
    // fout met de reden in body.detail (err.message is leeg).
    const detail = (err as { body?: { detail?: { msg?: string }[] | string } }).body?.detail;
    const reden = (Array.isArray(detail) ? detail[0]?.msg : detail) || (err instanceof Error ? err.message : String(err));
    console.error("[generate-lipsync/status]", reden);
    const uitleg = /no recognizable elements|face/i.test(reden)
      ? "Kling ziet geen personage in dit beeld. Gebruik een beeld waarop het gezicht groot en duidelijk te zien is."
      : `Lipsync mislukt: ${reden}`;
    return NextResponse.json({ status: "MISLUKT", error: uitleg });
  }
}
