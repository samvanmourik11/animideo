import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planVan } from "@/lib/plan-rechten-server";
import { HUISSTIJLEN } from "@/lib/plan-rechten";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ brandKits: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const max = HUISSTIJLEN[await planVan(user.id)];
  const { count } = await supabase.from("brand_kits").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= max) {
    return NextResponse.json({ error: `Je pakket heeft ruimte voor ${max} huisstijl${max === 1 ? "" : "en"}. Met Pro krijg je er 5, met Agency onbeperkt.` }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("brand_kits")
    .insert({ ...body, user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ brandKit: data });
}
