import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Scene } from "@/lib/types";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const projectId = String(form.get("projectId") ?? "");
  const sceneId   = String(form.get("sceneId") ?? "");
  const file      = form.get("file");

  if (!projectId || !sceneId || !(file instanceof Blob)) {
    return NextResponse.json({ error: "projectId, sceneId en file zijn verplicht" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("scenes")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project niet gevonden" }, { status: 404 });

  const scenes: Scene[] = (project.scenes ?? []) as Scene[];
  if (!scenes.find(s => s.id === sceneId)) {
    return NextResponse.json({ error: "Scene niet gevonden" }, { status: 404 });
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const path = `${user.id}/${projectId}/${sceneId}-outro.jpg`;

  const { error: upErr } = await supabase.storage
    .from("scene-assets")
    .upload(path, buf, { contentType: "image/jpeg", upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const publicUrl = supabase.storage.from("scene-assets").getPublicUrl(path).data.publicUrl;
  const cacheBusted = `${publicUrl}?t=${Date.now()}`;

  const updatedScenes = scenes.map(s =>
    s.id === sceneId ? { ...s, image_url: cacheBusted } : s
  );

  const { error: dbErr } = await supabase
    .from("projects")
    .update({ scenes: updatedScenes })
    .eq("id", projectId)
    .eq("user_id", user.id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ imageUrl: cacheBusted, scenes: updatedScenes });
}
