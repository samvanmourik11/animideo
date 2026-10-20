import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DeelFout } from "./delen";

// Gedeeld door de routes van delen, profiel en voorpagina.
export async function gebruiker() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export const nietIngelogd = () => NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

export function foutAntwoord(e: unknown, waar: string) {
  if (e instanceof DeelFout) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`[${waar}]`, e);
  return NextResponse.json({ error: "Er ging iets mis. Probeer het opnieuw." }, { status: 500 });
}
