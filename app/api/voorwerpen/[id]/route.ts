import { canUseDialoog } from "@/lib/studio/access";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseDialoog(user.email)) return NextResponse.json({ error: "Deze tool is nog niet beschikbaar" }, { status: 403 });

  // Video's die dit voorwerp al gebruikten houden hun eigen kopie (naam, beschrijving
  // en blad staan in hun draaiboek), dus die veranderen hier niet door.
  const { error } = await supabase
    .from("voorwerpen")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
