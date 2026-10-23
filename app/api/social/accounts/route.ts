import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accountsVan, koppelUrl, ontkoppel, ZernioFout } from "@/lib/social/zernio";
import { PLATFORMS, type PlatformId } from "@/lib/social/types";

export const runtime = "nodejs";

async function gebruiker() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function fout(e: unknown) {
  console.error("[social/accounts]", e);
  const status = e instanceof ZernioFout && e.status < 500 ? e.status : 500;
  return NextResponse.json({ error: e instanceof Error ? e.message : "Er ging iets mis." }, { status });
}

// De gekoppelde accounts. Met ?koppel=instagram: het adres waar de klant inlogt.
export async function GET(req: NextRequest) {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const koppel = req.nextUrl.searchParams.get("koppel");
  try {
    if (koppel) {
      if (!PLATFORMS.some((p) => p.id === koppel)) return NextResponse.json({ error: "Onbekend platform." }, { status: 400 });
      const terug = `${req.nextUrl.origin}/studios/social?gekoppeld=${koppel}`;
      return NextResponse.json({ url: await koppelUrl(user.id, koppel as PlatformId, terug) });
    }
    return NextResponse.json({ accounts: await accountsVan(user.id) });
  } catch (e) {
    return fout(e);
  }
}

export async function DELETE(req: NextRequest) {
  const user = await gebruiker();
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  try {
    await ontkoppel(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fout(e);
  }
}
