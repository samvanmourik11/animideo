import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, script } = await req.json();

  const prompt = `Based on the following animated video script, create a detailed storyboard.

SCRIPT:
${script}

For each scene write:
Scene [N]: [short title]
Visual: [what the viewer sees — background, characters, animations]
Text on screen: [any on-screen text or captions]
Voiceover: [exact narrator lines]
Duration: [~X seconds]

Separate each scene with a blank line. Output only the storyboard.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1500,
  });

  const storyboard = completion.choices[0].message.content ?? "";

  await supabase
    .from("projects")
    .update({ storyboard_text: storyboard, status: "StoryboardReady" })
    .eq("id", projectId)
    .eq("user_id", user.id);

  return NextResponse.json({ storyboard });
}
