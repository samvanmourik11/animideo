import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Project, PlaygroundNode } from "@/lib/types";
import PlaygroundCanvas from "./PlaygroundCanvas";

export default async function PlaygroundProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project || project.user_id !== user.id || project.mode !== "playground") {
    redirect("/playground");
  }

  const { data: nodes } = await supabase
    .from("playground_nodes")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  return (
    <PlaygroundCanvas
      project={project as Project}
      initialNodes={(nodes ?? []) as PlaygroundNode[]}
    />
  );
}
