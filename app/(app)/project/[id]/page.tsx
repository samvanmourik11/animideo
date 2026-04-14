import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Project } from "@/lib/types";
import ProjectWizard from "@/components/wizard/ProjectWizard";
import { getProfile } from "@/lib/credits";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: project }, profile] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .eq("user_id", user!.id)
      .single(),
    getProfile(user!.id),
  ]);

  if (!project) notFound();

  return <ProjectWizard initialProject={project as Project} plan={profile.plan} />;
}
