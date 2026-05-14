import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Project } from "@/lib/types";
import NewProjectButton from "@/components/NewProjectButton";
import StatusBadge from "@/components/StatusBadge";
import { getProfile } from "@/lib/credits";
import PendingIdeaHandler from "@/components/PendingIdeaHandler";
import PendingCheckoutHandler from "@/components/PendingCheckoutHandler";
import ProjectLibrary from "@/components/ProjectLibrary";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: projects }, profile] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false }),
    getProfile(user!.id),
  ]);

  return (
    <div>
      <PendingIdeaHandler userId={user!.id} />
      <PendingCheckoutHandler userId={user!.id} userEmail={user!.email ?? ""} />

      {profile.plan === "free" && (
        <div className="mb-6 flex items-center justify-between bg-gradient-to-r from-blue-600/10 to-blue-500/5 border border-blue-500/20 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
              <span className="text-base">✨</span>
            </div>
            <p className="text-sm text-slate-300">
              Je gebruikt de <span className="text-white font-semibold">gratis versie</span> — upgrade voor meer credits en video&apos;s zonder watermark.
            </p>
          </div>
          <Link href="/pricing" className="shrink-0 ml-4 btn-primary text-sm py-2 px-4">
            Upgraden →
          </Link>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Mijn projecten</h1>
          <p className="text-sm text-slate-300 mt-0.5">
            {projects?.length ?? 0} project{(projects?.length ?? 0) !== 1 ? "en" : ""}
          </p>
        </div>
        <NewProjectButton userId={user!.id} />
      </div>

      <ProjectLibrary projects={(projects ?? []) as Project[]} userId={user!.id} />
    </div>
  );
}
