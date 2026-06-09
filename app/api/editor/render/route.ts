import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { migrateTimeline, type TimelineDoc } from "@/lib/editor/timeline";
import { renderTimeline } from "@/lib/editor/render-server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let body: { projectId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!body.projectId) return new Response("projectId vereist", { status: 400 });

  const { data: project } = await supabase
    .from("editor_projects")
    .select("*")
    .eq("id", body.projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return new Response("Project niet gevonden", { status: 404 });

  const doc = migrateTimeline(project.timeline as TimelineDoc);
  // De render-pagina moet van DEZELFDE draaiende server komen (met de huidige
  // code), niet van de publieke productie-URL. Gebruik dus de request-origin.
  const appUrl = req.nextUrl.origin;
  const projectId = project.id as string;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          // controller mogelijk al gesloten
        }
      };
      const setStatus = async (status: string) => {
        try {
          await supabase.from("editor_projects").update({ status }).eq("id", projectId);
        } catch {
          // niet kritiek
        }
      };

      try {
        await setStatus("rendering");
        emit({ type: "phase", phase: "Starten", pct: 1 });

        const buf = await renderTimeline(doc, appUrl, (pct, label) =>
          emit({ type: "progress", pct, label })
        );

        const storagePath = `${user.id}/editor/${projectId}/export-${Date.now()}.mp4`;
        const { error: upErr } = await supabase.storage
          .from("scene-assets")
          .upload(storagePath, buf, { contentType: "video/mp4", upsert: true });
        if (upErr) throw new Error("Upload mislukt: " + upErr.message);

        const downloadName = `${String(project.title || "video").replace(/\s+/g, "-")}.mp4`;
        const { data: urlData } = supabase.storage
          .from("scene-assets")
          .getPublicUrl(storagePath, { download: downloadName });
        // Cache-bust met & als de URL al een ?download=... query heeft, anders
        // breekt de Content-Disposition (bestandsnaam) van Supabase.
        const base = urlData.publicUrl;
        const finalUrl = `${base}${base.includes("?") ? "&" : "?"}t=${Date.now()}`;

        await supabase
          .from("editor_projects")
          .update({ export_url: finalUrl, status: "done" })
          .eq("id", projectId);

        emit({ type: "complete", url: finalUrl, pct: 100 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[editor-render]", err);
        await setStatus("error");
        emit({ type: "error", message: msg });
      } finally {
        try {
          controller.close();
        } catch {
          // al gesloten
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
