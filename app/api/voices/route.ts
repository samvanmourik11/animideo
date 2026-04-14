import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY!,
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch voices" }, { status: 500 });
  }

  const data = await res.json();
  // Return only the fields we need
  const voices = (data.voices ?? []).map((v: { voice_id: string; name: string; labels?: { accent?: string; gender?: string } }) => ({
    voice_id: v.voice_id,
    name: v.name,
    accent: v.labels?.accent ?? null,
    gender: v.labels?.gender ?? null,
  }));

  return NextResponse.json({ voices });
}
