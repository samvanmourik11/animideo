import { NextRequest, NextResponse } from "next/server";
import RunwayML from "@runwayml/sdk";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, CREDIT_COSTS } from "@/lib/credits";

const runway = new RunwayML({ apiKey: process.env.RUNWAY_API_KEY });

/** Haal het storage-pad op uit een Supabase public URL */
function extractStoragePath(url: string): string | null {
  const match = url.match(/\/object\/(?:public|sign)\/scene-assets\/(.+?)(?:\?|$)/);
  return match ? match[1] : null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Bearer token of cookie auth
  const authHeader = req.headers.get("authorization");
  let user = null;
  if (authHeader?.startsWith("Bearer ")) {
    const { data } = await supabase.auth.getUser(authHeader.slice(7));
    user = data.user;
  } else {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) return NextResponse.json({ error: "Sessie ongeldig — log opnieuw in" }, { status: 401 });

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

  // Prompt trunceren tot 950 tekens (gen3a_turbo max = 1000)
  const safePrompt = (motionPrompt || "Smooth cinematic camera movement").slice(0, 950);

  // Maak een signed URL aan zodat Runway de afbeelding zeker kan ophalen
  let promptImage: string = imageUrl;
  const storagePath = extractStoragePath(imageUrl);
  if (storagePath) {
    const { data: signed } = await supabase.storage
      .from("scene-assets")
      .createSignedUrl(storagePath, 3600); // 1 uur geldig
    if (signed?.signedUrl) {
      promptImage = signed.signedUrl;
    }
  }

  console.log("[generate-motion] imageUrl:", imageUrl);
  console.log("[generate-motion] promptImage:", promptImage.slice(0, 100));
  console.log("[generate-motion] promptLength:", safePrompt.length);

  try {
    const task = await runway.imageToVideo.create({
      model: "gen3a_turbo",
      promptImage,
      promptText: safePrompt,
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
