import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Project, PlaygroundNode, Character } from "@/lib/types";
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

  const [{ data: project }, { data: nodes }, { data: characters }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase
      .from("playground_nodes")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("characters")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
  ]);

  if (!project || project.user_id !== user.id || project.mode !== "playground") {
    redirect("/playground");
  }

  return (
    <PlaygroundCanvas
      project={project as Project}
      initialNodes={(nodes ?? []) as PlaygroundNode[]}
      characters={(characters ?? []) as Character[]}
    />
  );
}
