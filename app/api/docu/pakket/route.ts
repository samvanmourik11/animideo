import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { DocuExtras } from "@/lib/docu/types";

export const runtime = "nodejs";

// PATCH {id, thumbnail} — de klant kiest een van de drie thumbnails van zijn docu.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; thumbnail?: unknown };
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({ error: "Onbekende docu" }, { status: 400 });
  const db = createServiceClient();
  const { data: c } = await db.from("creaties").select("invoer").eq("id", body.id).eq("user_id", user.id).eq("maker", "docu").maybeSingle();
  const invoer = c?.invoer as { docu?: { extras?: DocuExtras } } | undefined;
  const extras = invoer?.docu?.extras;
  // Alleen een thumbnail die we zelf voor deze docu maakten.
  if (!extras?.thumbnails?.includes(String(body.thumbnail))) return NextResponse.json({ error: "Onbekende thumbnail" }, { status: 400 });
  const nieuw = { ...invoer, docu: { ...invoer!.docu, extras: { ...extras, thumbnail: String(body.thumbnail) } } };
  const { error } = await db.from("creaties").update({ invoer: nieuw }).eq("id", body.id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Bewaren mislukt" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
