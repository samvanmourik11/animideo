import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCredits } from "@/lib/credits";
import { betalerVan } from "@/lib/team/team";

/** Actueel credit-saldo van de ingelogde gebruiker (voor live NavBar-refresh). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // In een team (nieuwe app) is het saldo de gedeelde pot van de eigenaar.
  const betaler = await betalerVan(user.id);
  const credits = await getCredits(betaler, { service: betaler !== user.id });
  return NextResponse.json({ credits });
}
