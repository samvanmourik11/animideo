import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { Project } from "@/lib/types";
import ExplainerWizard from "@/components/explainer/ExplainerWizard";

export default async function ExplainerProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!project) notFound();
  if (project.mode !== "explainer") redirect(`/project/${id}`);

  return <ExplainerWizard initialProject={project as Project} />;
}
