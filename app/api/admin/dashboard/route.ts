import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildDashboard, type DashboardData } from "@/lib/admin/metrics";

export const dynamic = "force-dynamic";

// Server-side cache: ~60s TTL zodat het ~60s-pollen van het dashboard Mollie niet
// overbelast. `?refresh=1` omzeilt de cache voor een verse ophaal.
const TTL_MS = 60_000;
let cache: { data: DashboardData; ts: number } | null = null;
let inflight: Promise<DashboardData> | null = null;

export async function GET(req: NextRequest) {
  // Admin-gate (zelfde patroon als app/api/admin/leren-access/route.ts)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const force = req.nextUrl.searchParams.get("refresh") === "1";
  const now = Date.now();

  if (!force && cache && now - cache.ts < TTL_MS) {
    return NextResponse.json({ ...cache.data, cached: true });
  }

  try {
    // Dedupe gelijktijdige builds (bv. meerdere tabs die tegelijk pollen).
    if (!inflight) {
      inflight = buildDashboard().finally(() => {
        inflight = null;
      });
    }
    const data = await inflight;
    cache = { data, ts: Date.now() };
    return NextResponse.json({ ...data, cached: false });
  } catch (err) {
    // Bij een fout: val terug op de laatst bekende cache i.p.v. crashen.
    if (cache) {
      return NextResponse.json({ ...cache.data, cached: true, stale: true });
    }
    const message = err instanceof Error ? err.message : "Onbekende fout";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
