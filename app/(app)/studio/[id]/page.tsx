import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { Project } from "@/lib/types";
import { getProfile } from "@/lib/credits";
import StudioWizard from "@/components/studio/StudioWizard";

export default async function StudioProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scenes?: string }>;
}) {
  const { id } = await params;
  const { scenes } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profileRow?.is_admin) redirect("/dashboard");

  const [{ data: project }, profile] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    getProfile(user.id),
  ]);

  if (!project) notFound();
  if (project.mode !== "studio") redirect(`/project/${id}`);

  const targetScenes = scenes ? Math.max(1, Math.min(15, Number(scenes))) : 5;

  return (
    <StudioWizard
      initialProject={project as Project}
      plan={profile.plan}
      targetScenes={targetScenes}
    />
  );
}
