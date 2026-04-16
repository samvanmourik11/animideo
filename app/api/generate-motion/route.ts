import { NextRequest, NextResponse } from "next/server";
import RunwayML from "@runwayml/sdk";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";

const runway = new RunwayML({ apiKey: process.env.RUNWAY_API_KEY });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Credits check
  const credit = await deductCredits(user.id, CREDIT_COSTS.RUNWAY_GENERATION, "Video beweging genereren");
  if (!credit.success) {
    return NextResponse.json(
      { error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.RUNWAY_GENERATION },
      { status: 402 }
    );
  }

  const { imageUrl, motionPrompt, format } = await req.json();

  const ratio = format === "9:16" ? "768:1280" : "1280:768";

  try {
    // Runway kan Supabase URLs niet altijd ophalen — download en stuur als base64
    let promptImage: string = imageUrl;
    try {
      const imgRes = await fetch(imageUrl);
      if (imgRes.ok) {
        const imgBuffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(imgBuffer).toString("base64");
        const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
        promptImage = `data:${contentType};base64,${base64}`;
      }
    } catch {
      // Fallback: originele URL gebruiken
    }

    const task = await runway.imageToVideo.create({
      model: "gen3a_turbo",
      promptImage,
      promptText: motionPrompt || "Smooth cinematic camera movement",
      duration: 5,
      ratio,
    });

    return NextResponse.json({ taskId: task.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-motion] Volledige fout:", JSON.stringify(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
