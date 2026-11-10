import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verversLopende } from "@/lib/creaties/wachtrij";
import type { Creatie } from "@/lib/creaties/types";

export const runtime = "nodejs";
// Een reclame wordt na het antwoord gemonteerd (after() in lib/reclame/regie.ts); die
// montage valt binnen de tijd van dít verzoek.
// 800 s sinds de Motion graphics-studio: het tekenen (Claude) en het maken van de video
// lopen na het antwoord door in dit verzoek (lib/motion/regie.ts).
export const maxDuration = 800;

// Voor het wachtrij-teller in het menu: hoeveel is er nog in de maak. Laat de wachtrij
// meteen doorlopen, zodat iets ook klaarkomt als de klant op een heel andere pagina zit.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  const { data } = await supabase
    .from("creaties")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "bezig")
    .order("created_at", { ascending: true });

  const ververst = await verversLopende((data ?? []) as Creatie[]);
  return NextResponse.json({ bezig: ververst.filter((c) => c.status === "bezig").length });
}
