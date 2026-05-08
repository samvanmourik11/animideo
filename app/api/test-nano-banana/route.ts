import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";

fal.config({ credentials: process.env.FAL_KEY });

type FalImageResult = { images?: { url: string }[] };

type AspectRatio = "16:9" | "21:9" | "3:2" | "4:3" | "5:4" | "1:1" | "4:5" | "3:4" | "2:3" | "9:16";
type Resolution = "1K" | "2K" | "4K";

const ASPECT_RATIOS: AspectRatio[] = ["16:9", "21:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"];
const RESOLUTIONS: Resolution[] = ["1K", "2K", "4K"];

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

  try {
    const { prompt, referenceImages, aspectRatio, resolution } = await req.json() as {
      prompt: string;
      referenceImages?: string[];
      aspectRatio?: string;
      resolution?: string;
    };

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt is verplicht" }, { status: 400 });
    }

    const refs = (referenceImages ?? []).filter(Boolean).slice(0, 14);
    const ar: AspectRatio = ASPECT_RATIOS.includes(aspectRatio as AspectRatio) ? (aspectRatio as AspectRatio) : "16:9";
    const res_: Resolution = RESOLUTIONS.includes(resolution as Resolution) ? (resolution as Resolution) : "2K";
    const startedAt = Date.now();

    let result;
    if (refs.length > 0) {
      result = await fal.subscribe("fal-ai/nano-banana-pro/edit", {
        input: {
          prompt:        prompt.slice(0, 4000),
          image_urls:    refs,
          aspect_ratio:  ar,
          resolution:    res_,
          num_images:    1,
          output_format: "jpeg",
        },
      });
    } else {
      result = await fal.subscribe("fal-ai/nano-banana-pro", {
        input: {
          prompt:        prompt.slice(0, 4000),
          aspect_ratio:  ar,
          resolution:    res_,
          num_images:    1,
          output_format: "jpeg",
        },
      });
    }

    const url = (result.data as FalImageResult).images?.[0]?.url;
    if (!url) throw new Error("Geen afbeelding ontvangen van Nano Banana Pro");

    return NextResponse.json({
      imageUrl: url,
      model: refs.length > 0 ? "nano-banana-pro/edit" : "nano-banana-pro",
      referenceCount: refs.length,
      processingMs: Date.now() - startedAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[test-nano-banana] Fout:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
