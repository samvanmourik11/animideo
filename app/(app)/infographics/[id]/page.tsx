import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { Project } from "@/lib/types";
import { getProfile } from "@/lib/credits";
import InfographicWizard from "@/components/infographics/InfographicWizard";

export default async function InfographicProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: project }, profile] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).eq("user_id", user.id).single(),
    getProfile(user.id),
  ]);

  if (!project) notFound();
  if (project.mode !== "infographics") redirect(`/project/${id}`);

  return <InfographicWizard initialProject={project as Project} plan={profile.plan} />;
}
