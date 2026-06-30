// Per-scène nabewerking via fal.ai, opt-in (gecontroleerd door de gebruiker):
//  * "face"    → CodeFormer: herstelt vervormde AI-gezichten (veilig, goedkoop).
//  * "relight" → IC-Light v2: stelt de belichting bij (experimenteel; kan de
//    illustratie-stijl iets verschuiven, daarom alleen op verzoek).
// Vervangt scene.image_url door het bewerkte beeld (merge-veilig opgeslagen).

import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { deductCredits, addCredits, CREDIT_COSTS } from "@/lib/credits";
import { Scene } from "@/lib/types";

fal.config({ credentials: process.env.FAL_KEY });

type Op = "face" | "relight";
const LIGHT_DIRS = new Set(["None", "Left", "Right", "Top", "Bottom"]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const credit = await deductCredits(user.id, CREDIT_COSTS.ENHANCE, "Studio scene verbeteren");
  if (!credit.success) {
    return NextResponse.json({ error: "insufficient_credits", credits: credit.credits, required: CREDIT_COSTS.ENHANCE }, { status: 402 });
  }
  const refund = async () => { try { await addCredits(user.id, CREDIT_COSTS.ENHANCE, "Refund: scene verbeteren"); } catch {} };

  try {
    const { projectId, sceneId, op, lightDir, clientScenes } = await req.json() as {
      projectId: string; sceneId: string; op: Op; lightDir?: string; clientScenes?: Scene[];
    };
    if (!projectId || !sceneId || (op !== "face" && op !== "relight")) {
      await refund();
      return NextResponse.json({ error: "projectId, sceneId en geldige op zijn verplicht" }, { status: 400 });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("scenes, format")
      .eq("id", projectId).eq("user_id", user.id).single();
    if (!project) { await refund(); return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 }); }

    const scenes: Scene[] = clientScenes && clientScenes.length > 0 ? clientScenes : (project.scenes ?? []) as Scene[];
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene?.image_url) { await refund(); return NextResponse.json({ error: "Scene heeft nog geen beeld" }, { status: 400 }); }
    const srcUrl = scene.image_url.split("?")[0];

    let outUrl: string | undefined;
    try {
      if (op === "face") {
        const r = await fal.subscribe("fal-ai/codeformer", {
          input: { image_url: srcUrl, fidelity: 0.7, upscale_factor: 1, face_upscale: true },
        });
        outUrl = (r.data as { image?: { url: string } }).image?.url;
      } else {
        const portrait = project.format === "9:16";
        const dir = typeof lightDir === "string" && LIGHT_DIRS.has(lightDir) ? lightDir : "None";
        const r = await fal.subscribe("fal-ai/iclight-v2", {
          input: {
            image_url:      srcUrl,
            prompt:         `${(scene.image_prompt || "").split("\n")[0].slice(0, 300)} — same illustration style, natural consistent lighting`,
            initial_latent: dir as "None" | "Left" | "Right" | "Top" | "Bottom",
            image_size:     portrait ? "portrait_16_9" : "landscape_16_9",
            num_images:     1,
            output_format:  "jpeg",
          },
        });
        outUrl = (r.data as { images?: { url: string }[] }).images?.[0]?.url;
      }
    } catch (e) {
      await refund();
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
    if (!outUrl) { await refund(); return NextResponse.json({ error: "Geen beeld ontvangen" }, { status: 500 }); }

    // Naar storage hosten (stabiel) + scene.image_url updaten.
    const imgRes = await fetch(outUrl);
    if (!imgRes.ok) { await refund(); return NextResponse.json({ error: `Download mislukt (${imgRes.status})` }, { status: 500 }); }
    const fileName = `${user.id}/${projectId}/${sceneId}-image.jpg`;
    const { error: upErr } = await supabase.storage.from("scene-assets").upload(fileName, await imgRes.arrayBuffer(), { contentType: "image/jpeg", upsert: true });
    if (upErr) { await refund(); return NextResponse.json({ error: upErr.message }, { status: 500 }); }
    const cacheBusted = `${supabase.storage.from("scene-assets").getPublicUrl(fileName).data.publicUrl}?t=${Date.now()}`;

    const updatedScenes = scenes.map(s => s.id === sceneId ? { ...s, image_url: cacheBusted } : s);
    const { error: dbErr } = await supabase.from("projects").update({ scenes: updatedScenes }).eq("id", projectId).eq("user_id", user.id);
    if (dbErr) return NextResponse.json({ error: `Bewerkt maar opslaan mislukt: ${dbErr.message}`, imageUrl: cacheBusted }, { status: 500 });

    return NextResponse.json({ imageUrl: cacheBusted, scenes: updatedScenes });
  } catch (err) {
    await refund();
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
