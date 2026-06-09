import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canUseEditor } from "@/lib/editor/access";
import { createEmptyTimeline, RATIO_PRESETS, type Ratio } from "@/lib/editor/timeline";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  if (!canUseEditor(user.email)) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { ratio?: Ratio; title?: string };
  const ratio: Ratio = body.ratio && body.ratio in RATIO_PRESETS ? body.ratio : "16:9";
  const { width, height } = RATIO_PRESETS[ratio];
  const timeline = createEmptyTimeline(ratio);

  const { data, error } = await supabase
    .from("editor_projects")
    .insert({
      user_id: user.id,
      title: body.title?.trim() || "Naamloos project",
      ratio,
      width,
      height,
      fps: timeline.fps,
      timeline,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Kon project niet aanmaken" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: data.id });
}
