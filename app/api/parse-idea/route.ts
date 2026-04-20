import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { idea } = await req.json();
  if (!idea) return NextResponse.json({ error: "Geen idee opgegeven" }, { status: 400 });
  if (typeof idea !== "string" || idea.length > 2000) {
    return NextResponse.json({ error: "Idee te lang of ongeldig" }, { status: 400 });
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: `Je bent een expert in het maken van animatievideo scripts. Een gebruiker heeft dit idee ingetypt:

"${idea}"

Zet dit om naar een gestructureerd video-project. Geef ALLEEN een JSON object terug, geen markdown, geen uitleg.

{
  "title": "<korte pakkende videotitel, max 60 tekens>",
  "goal": "<wat wil de video bereiken, 1 zin>",
  "target_audience": "<wie is de doelgroep, specifiek>",
  "language": "<taal van de video: Dutch, English, etc.>",
  "visual_style": "<één van: Cinematic, Realistic, Whiteboard, 2D Cartoon, 2D SaaS, Motion Graphic, 3D Pixar, 3D Animatie>",
  "format": "<16:9 of 9:16 — kies 9:16 voor social media/TikTok/Instagram, anders 16:9>"
}`,
    }],
    max_tokens: 300,
    temperature: 0.3,
  });

  const raw = completion.choices[0].message.content ?? "{}";
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "Kon idee niet verwerken" }, { status: 500 });
  }
}
