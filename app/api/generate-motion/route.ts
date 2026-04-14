import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RUNWAY_BASE = "https://api.dev.runwayml.com/v1";
const RUNWAY_VERSION = "2024-11-06";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { imageUrl, motionPrompt, format } = await req.json();

  const ratio = format === "9:16" ? "768:1280" : "1280:768";

  const res = await fetch(`${RUNWAY_BASE}/image_to_video`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`,
      "X-Runway-Version": RUNWAY_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gen3a_turbo",
      promptImage: imageUrl,
      promptText: motionPrompt,
      duration: 5,
      ratio,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Runway API error: ${err}` }, { status: res.status });
  }

  const { id: taskId } = await res.json();
  return NextResponse.json({ taskId });
}
