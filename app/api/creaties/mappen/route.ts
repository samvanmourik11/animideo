import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  const { data, error } = await supabase
    .from("creatie_mappen")
    .select("*")
    .eq("user_id", user.id)
    .order("naam");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mappen: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

  let naam = "";
  try {
    naam = String((await req.json()).naam ?? "").trim().slice(0, 80);
  } catch {}
  if (!naam) return NextResponse.json({ error: "Geef de map een naam" }, { status: 400 });

  const { data, error } = await supabase
    .from("creatie_mappen")
    .insert({ user_id: user.id, naam })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ map: data });
}
