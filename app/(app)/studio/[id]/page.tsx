import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { Project, Character } from "@/lib/types";
import { getProfile } from "@/lib/credits";
import { canUseStudio } from "@/lib/studio/access";
import StudioWizard from "@/components/studio/StudioWizard";

// Altijd vers laden: nooit een verouderde (lege) projectstaat serveren bij
// terug-navigeren — dat veroorzaakte het dataverlies.
export const dynamic = "force-dynamic";

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
  // De Creator Studio blijft open voor alle huidige gebruikers; alleen de nieuwe
  // AI-buddy is tijdens de soft-launch beperkt tot toegestane account(s).
  const buddyEnabled = canUseStudio(user.email);

  const [{ data: project }, profile, { data: characters }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    getProfile(user.id),
    supabase
      .from("characters")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (!project) notFound();
  if (project.mode !== "studio") redirect(`/project/${id}`);

  const targetScenes = scenes ? Math.max(1, Math.min(15, Number(scenes))) : 5;

  return (
    <StudioWizard
      initialProject={project as Project}
      plan={profile.plan}
      targetScenes={targetScenes}
      characters={(characters ?? []) as Character[]}
      buddyEnabled={buddyEnabled}
    />
  );
}
