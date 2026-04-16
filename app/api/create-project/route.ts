import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, goal, target_audience, language, format, visual_style } = await req.json();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title: title || "Nieuw project",
      goal: goal || null,
      target_audience: target_audience || null,
      language: language || "Dutch",
      format: format || "16:9",
      visual_style: visual_style || "Cinematic",
      status: "Draft",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projectId: data.id });
}
