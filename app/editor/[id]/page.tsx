import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { migrateTimeline, type TimelineDoc } from "@/lib/editor/timeline";
import EditorShell from "@/components/editor/EditorShell";

export default async function EditorProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ studio?: string }>;
}) {
  const { id } = await params;
  const { studio } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("editor_projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!project) notFound();

  const timeline = migrateTimeline(project.timeline as TimelineDoc);

  return (
    <EditorShell
      projectId={project.id}
      userId={user.id}
      title={project.title}
      ratio={project.ratio}
      initialTimeline={timeline}
      backHref={studio ? `/studio/${studio}` : "/editor"}
    />
  );
}
