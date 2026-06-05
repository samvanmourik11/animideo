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

  const { email, hide } = await req.json() as { email: string; hide: boolean };
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Ongeldig e-mailadres" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: updated, error } = await service
    .from("profiles")
    .update({ hide_leren: hide })
    .eq("email", email.toLowerCase())
    .select("email, hide_leren");

  if (error) {
    return NextResponse.json({ error: "Database fout" }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "Geen gebruiker met dit e-mailadres gevonden" },
      { status: 404 }
    );
  }

  return NextResponse.json({ email: updated[0].email, hide_leren: updated[0].hide_leren });
}
