import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await req.json();

  // Mark as Rendering immediately
  await supabase
    .from("projects")
    .update({ status: "Rendering" })
    .eq("id", projectId)
    .eq("user_id", user.id);

  // -------------------------------------------------------------------
  // PLACEHOLDER: Replace this block with your actual video render call.
  // Example: POST to a Creatomate / RunwayML / custom render service.
  // The service should return a video URL when done.
  // -------------------------------------------------------------------
  await new Promise((r) => setTimeout(r, 3000)); // simulate latency

  const placeholderVideoUrl =
    "https://www.w3schools.com/html/mov_bbb.mp4"; // replace with real URL

  await supabase
    .from("projects")
    .update({ video_url: placeholderVideoUrl, status: "Done" })
    .eq("id", projectId)
    .eq("user_id", user.id);

  return NextResponse.json({ videoUrl: placeholderVideoUrl });
}
