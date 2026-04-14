import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Project } from "@/lib/types";
import NewProjectButton from "@/components/NewProjectButton";
import StatusBadge from "@/components/StatusBadge";
import { getProfile } from "@/lib/credits";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
      {/* Free plan upgrade banner */}
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
          <Link
            href="/pricing"
            className="shrink-0 ml-4 btn-primary text-sm py-2 px-4"
          >
            Upgraden →
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Mijn projecten</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {projects?.length ?? 0} project{(projects?.length ?? 0) !== 1 ? "en" : ""}
          </p>
        </div>
        <NewProjectButton userId={user!.id} />
      </div>

      {/* Empty state */}
      {!projects || projects.length === 0 ? (
        <div className="card text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🎬</span>
          </div>
          <p className="text-white font-semibold text-lg mb-1">Nog geen projecten</p>
          <p className="text-slate-500 text-sm mb-6">
            Klik op <strong className="text-slate-300">Nieuw project</strong> om te beginnen.
          </p>
          <div className="flex justify-center">
            <NewProjectButton userId={user!.id} />
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {(projects as Project[]).map((project) => (
            <Link
              key={project.id}
              href={`/project/${project.id}`}
              className="group flex items-center justify-between bg-[#0c1428] border border-white/[0.07] hover:border-blue-500/30 rounded-2xl px-6 py-4 transition-all duration-200 hover:shadow-[0_4px_24px_rgba(59,130,246,0.1)]"
            >
              <div className="min-w-0">
                <p className="font-semibold text-white group-hover:text-blue-300 transition-colors truncate">
                  {project.title}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {project.language} · {project.format} ·{" "}
                  {new Date(project.created_at).toLocaleDateString("nl-NL")}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <StatusBadge status={project.status} />
                <span className="text-slate-600 group-hover:text-slate-400 transition-colors">›</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
