import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCredits } from "@/lib/credits";

/** Actueel credit-saldo van de ingelogde gebruiker (voor live NavBar-refresh). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const credits = await getCredits(user.id);
  return NextResponse.json({ credits });
}
