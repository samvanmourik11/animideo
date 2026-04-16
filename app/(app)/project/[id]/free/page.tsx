import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { Project } from "@/lib/types";
import FreeProjectWizard from "@/components/wizard/FreeProjectWizard";
import { getProfile } from "@/lib/credits";

export default async function FreeProjectPage({
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

  // Wizard-projecten horen niet op de free-pagina
  if (project.mode === "wizard") {
    redirect(`/project/${id}`);
  }

  return (
    <FreeProjectWizard initialProject={project as Project} plan={profile.plan} />
  );
}
