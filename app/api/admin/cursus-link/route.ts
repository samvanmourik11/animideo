import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email } = await req.json() as { email: string };
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Ongeldig e-mailadres" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return NextResponse.json({ error: "App niet geconfigureerd" }, { status: 500 });

  const service = createServiceClient();
  const { data: pending, error } = await service
    .from("pending_checkouts")
    .insert({
      email: email.toLowerCase(),
      plan: "starter",
      status: "pending",
      is_cursus: true,
    })
    .select("id")
    .single();

  if (error || !pending) {
    return NextResponse.json({ error: "Database fout" }, { status: 500 });
  }

  return NextResponse.json({ url: `${appUrl}/checkout/cursus/${pending.id}` });
}
