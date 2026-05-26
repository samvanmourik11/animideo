import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/credits";
import type { Project } from "@/lib/types";
import PlaygroundFinish from "./PlaygroundFinish";

export default async function PlaygroundFinishPage({
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

  const [{ data: project }, profile] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    getProfile(user.id),
  ]);

  if (!project || project.user_id !== user.id || project.mode !== "playground") {
    redirect("/playground");
  }

  // Geen scenes betekent: gebruiker is hier rechtstreeks geland zonder eerst
  // af te ronden. Stuur terug naar het canvas zodat hij shots kan kiezen.
  if (!Array.isArray(project.scenes) || project.scenes.length === 0) {
    redirect(`/playground/${id}`);
  }

  return <PlaygroundFinish initialProject={project as Project} plan={profile.plan} />;
}
