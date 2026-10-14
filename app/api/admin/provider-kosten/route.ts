import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminAccount } from "@/lib/studio/access";
import { createServiceClient } from "@/lib/supabase/service";
import { vatKostenSamen, type KostenRij } from "@/lib/admin/provider-kosten";

export const dynamic = "force-dynamic";

// Wat fal ons kost, uit het kostenlogboek (tabel provider_kosten). Alleen voor
// beheerders, zelfde grendel als het abonnementen-dashboard.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin || !isAdminAccount(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();
  const sinds = new Date(Date.now() - 30 * 86400_000).toISOString();

  // Supabase geeft maximaal 1.000 rijen per keer; een drukke maand zijn er meer.
  const rijen: KostenRij[] = [];
  for (let van = 0; van < 100_000; van += 1000) {
    const { data, error } = await service
      .from("provider_kosten")
      .select("created_at, email, model, kosten_usd, actie")
      .gte("created_at", sinds)
      .order("created_at", { ascending: false })
      .range(van, van + 999);
    if (error) {
      // Meestal: migratie 044 is nog niet gedraaid.
      return NextResponse.json({ error: `Kostenlogboek niet leesbaar: ${error.message}` }, { status: 500 });
    }
    rijen.push(...((data ?? []) as KostenRij[]));
    if (!data || data.length < 1000) break;
  }

  // Intern = iedereen op ons eigen domein: daar vallen ook accounts onder die geen
  // credits afschrijven maar niet in de teamlijst staan (alyssa, nohaila).
  const intern = (email: string | null) => !!email && email.toLowerCase().endsWith("@jouwanimatievideo.nl");
  return NextResponse.json(vatKostenSamen(rijen, new Date(), intern));
}
