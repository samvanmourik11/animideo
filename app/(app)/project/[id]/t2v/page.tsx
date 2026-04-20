import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Project } from "@/lib/types";
import T2VWizard from "@/components/t2v-wizard/T2VWizard";
import { getProfile } from "@/lib/credits";

export default async function T2VProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: project }, profile] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).eq("user_id", user!.id).single(),
    getProfile(user!.id),
  ]);

  if (!project) notFound();

  return <T2VWizard initialProject={project as Project} plan={profile.plan} />;
}
