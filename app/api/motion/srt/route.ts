import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { voorProef } from "@/lib/motion/regie";
import { srt } from "@/lib/motion/ondertitels";

export const runtime = "nodejs";

// GET ?id=... — de ondertitels van een klare motion- of docu-video als .srt-bestand.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Onbekende video" }, { status: 400 });
  const { data: c } = await createServiceClient().from("creaties").select("invoer, maker").eq("id", id).eq("user_id", user.id).in("maker", ["motion", "docu"]).maybeSingle();
  const werkUrl = (c?.invoer as { voortgang?: { werk?: string } } | undefined)?.voortgang?.werk;
  if (!c || !werkUrl) return NextResponse.json({ error: "Voor deze video zijn (nog) geen ondertitels" }, { status: 404 });
  const werk = await voorProef.leesWerk(werkUrl);
  const staand = (c.invoer as { formaat?: string }).formaat === "9:16";
  return new NextResponse(srt(werk.woorden, staand), {
    headers: { "content-type": "application/x-subrip; charset=utf-8", "content-disposition": `attachment; filename="ondertitels-${id.slice(0, 8)}.srt"` },
  });
}
