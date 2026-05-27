import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: lessonId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing } = await supabase
    .from("lesson_progress")
    .select("lesson_id")
    .eq("user_id", user.id)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("lesson_progress")
      .delete()
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ watched: false });
  }

  const { error } = await supabase
    .from("lesson_progress")
    .insert({ user_id: user.id, lesson_id: lessonId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ watched: true });
}
