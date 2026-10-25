import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

// Voor de bedankpagina: is de week gestart, nog onderweg, of was deze rekening al eens gratis?
// Alleen de status, op het (onraadbare) checkout-id; geen e-mail of andere gegevens terug.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ status: "onbekend" });
  const { data } = await createServiceClient().from("gratis_weken").select("status").eq("checkout_id", id).maybeSingle();
  return NextResponse.json({ status: data?.status ?? "onbekend" });
}
