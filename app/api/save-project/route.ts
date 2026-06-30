import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await req.json();

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, _merge, ...fields } = (await req.json()) as Record<string, unknown> & { projectId: string; _merge?: boolean };

  // Bulletproof achtergrond-save (autosave): een verouderde autosave mag NOOIT
  // een al opgeslagen asset met leeg overschrijven — niet per scène (image/video)
  // én niet project-breed (voice-over, eind-video, muziek, referenties, specs).
  // Ook een per ongeluk lege scènes-array overschrijft de bestaande scènes niet.
  // Expliciete acties (bv. clip/scene verwijderen) zetten _merge NIET en mogen
  // dus wél bewust overschrijven.
  if (_merge) {
    const { data: cur } = await supabase
      .from("projects")
      .select("scenes, voice_audio_url, video_url, bg_music_url, style_reference_url, outro_logo_url, script_text, character_reference_urls, infographic_spec, explainer_spec")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (cur) {
      const db = cur as Record<string, unknown>;

      // Scènes: nooit een gevulde array met leeg overschrijven; per scène de
      // door de server opgeslagen image_url/video_url/canvas_json behouden.
      if (Array.isArray(fields.scenes)) {
        const dbScenes = Array.isArray(db.scenes) ? (db.scenes as Array<Record<string, unknown>>) : [];
        if (fields.scenes.length === 0 && dbScenes.length > 0) {
          delete fields.scenes;
        } else {
          const dbById = new Map(dbScenes.map((s) => [s.id as string, s]));
          fields.scenes = (fields.scenes as Array<Record<string, unknown>>).map((s) => {
            const d = dbById.get(s.id as string);
            if (!d) return s;
            return {
              ...s,
              image_url: s.image_url ?? d.image_url ?? null,
              video_url: s.video_url ?? d.video_url ?? null,
              canvas_json: s.canvas_json ?? d.canvas_json ?? null,
            };
          });
        }
      }

      // Project-brede asset-velden: leeg incoming + gevulde DB → DB behouden.
      const isEmpty = (v: unknown) => v === null || v === undefined || v === "";
      for (const k of ["voice_audio_url", "video_url", "bg_music_url", "style_reference_url", "outro_logo_url", "script_text", "infographic_spec", "explainer_spec"]) {
        if (k in fields && isEmpty(fields[k]) && !isEmpty(db[k])) delete fields[k];
      }
      // Referentie-array: leeg incoming + gevulde DB → DB behouden.
      if ("character_reference_urls" in fields) {
        const inc = fields.character_reference_urls;
        const dbVal = db.character_reference_urls;
        if ((!Array.isArray(inc) || inc.length === 0) && Array.isArray(dbVal) && dbVal.length > 0) {
          delete fields.character_reference_urls;
        }
      }
    }
  }

  const { error } = await supabase
    .from("projects")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
