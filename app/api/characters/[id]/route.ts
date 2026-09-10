import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Character } from "@/lib/types";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("characters")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 400 });
  }

  const rawName = (body as { name?: unknown } | null)?.name;
  if (typeof rawName !== "string") {
    return NextResponse.json({ error: "Naam ontbreekt" }, { status: 400 });
  }
  const name = rawName.trim();
  if (!name) return NextResponse.json({ error: "Naam mag niet leeg zijn" }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "Naam is te lang (max 80 tekens)" }, { status: 400 });

  // updated_at expliciet meesturen: de tabel heeft alleen een default, geen
  // trigger, dus zonder deze regel blijft een hernoemd karakter op zijn oude
  // plek in de op updated_at gesorteerde lijst staan.
  const { data, error } = await supabase
    .from("characters")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    // maybeSingle i.p.v. single: een id van een ander account matcht geen rij
    // en dat moet een nette 404 geven, geen PGRST116-fout als 500.
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Karakter niet gevonden" }, { status: 404 });

  return NextResponse.json({ character: data as Character });
}
