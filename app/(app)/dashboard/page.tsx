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
        <div className="mb-6 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="text-xl">✨</span>
            <p className="text-sm text-blue-800">
              Je gebruikt de <strong>gratis versie</strong> — upgrade voor meer credits en geen watermark.
            </p>
          </div>
          <Link
            href="/pricing"
            className="shrink-0 ml-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Upgraden →
          </Link>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">My Projects</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {projects?.length ?? 0} project{(projects?.length ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <NewProjectButton userId={user!.id} />
      </div>

      {!projects || projects.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-gray-400 text-sm">No projects yet.</p>
          <p className="text-gray-400 text-sm mt-1">
            Click <strong>New Project</strong> to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {(projects as Project[]).map((project) => (
            <Link
              key={project.id}
              href={`/project/${project.id}`}
              className="card hover:border-blue-300 hover:shadow-sm transition-all flex items-center justify-between group"
            >
              <div>
                <p className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                  {project.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {project.language} · {project.format} ·{" "}
                  {new Date(project.created_at).toLocaleDateString()}
                </p>
              </div>
              <StatusBadge status={project.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
