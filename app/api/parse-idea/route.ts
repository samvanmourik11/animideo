import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { idea } = await req.json();
  if (!idea) return NextResponse.json({ error: "Geen idee opgegeven" }, { status: 400 });

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
  "visual_style": "<één van: Flat Illustration, 3D Render, Realistic, Whiteboard, Cinematic>",
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
