import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateImageWithStyle } from "@/lib/image-gen";

export const runtime = "nodejs";
export const maxDuration = 120;

// PROOF OF CONCEPT — storytelling infographic scene.
// Het beeldmodel maakt ALLEEN de platte illustratie (geen tekst). De typografie,
// cijfers en callouts komen later deterministisch in SVG eroverheen (zie de
// prototype-pagina). Dit endpoint test puur de illustratie-kwaliteit.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const subject = (body.prompt || "").trim() ||
    "a cozy detached house with a pitched dark-navy roof and light-blue walls, a small chimney, a green bush and a tree beside it, set against soft grey mountains";

  // Stijl-instructie die de "animatiemarkt flat infographic" look ankert.
  const stylePreamble =
    "Flat vector illustration in a professional animated-explainer / infographic style, the kind made by studios like Yum Yum Videos. " +
    "Clean geometric shapes, flat colors with a subtle paper-grain texture, crisp edges, no realistic shading, no gradients, modern corporate explainer aesthetic. " +
    "Generous negative space and a calm, balanced composition with empty room in the upper area for a headline to be placed later. ";

  const framing =
    " Centered, full-bleed scene on a soft off-white background. Do not include any people unless the subject asks for them." +
    " CRITICAL: absolutely NO text, NO numbers, NO letters, NO labels anywhere in the image, including on signs, screens, price tags, or bills.";

  const result = await generateImageWithStyle({
    prompt: `${stylePreamble}Scene: ${subject}.${framing}`,
    format: "16:9",
    visualStyle: null,
  });

  return Response.json({
    imageUrl: result.imageUrl,
    promptUsed: result.promptUsed,
    model: result.usedModel,
  });
}
