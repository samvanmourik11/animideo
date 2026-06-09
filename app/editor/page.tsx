import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewEditorProjectButton from "@/components/editor/NewEditorProjectButton";

// Startpagina van de nieuwe editor: lijst met eigen editor-projecten plus de
// knop om een nieuw project te starten. Auth + allow-list zitten in layout.tsx.
export default async function EditorHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projects } = await supabase
    .from("editor_projects")
    .select("id, title, ratio, updated_at, status")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold">Editor</h1>
          <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white">
            Terug naar dashboard
          </Link>
        </div>
        <p className="text-sm text-slate-400 mb-8">
          Interne preview. Nog volop in aanbouw.
        </p>

        <section className="mb-10">
          <h2 className="text-sm font-medium text-slate-400 mb-3">Nieuw project</h2>
          <NewEditorProjectButton />
        </section>

        <section>
          <h2 className="text-sm font-medium text-slate-400 mb-3">Jouw projecten</h2>
          {!projects || projects.length === 0 ? (
            <p className="text-sm text-slate-500">Nog geen projecten.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {projects.map((p) => (
                <Link key={p.id} href={`/editor/${p.id}`} className="card-hover">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{p.title}</span>
                    <span className="text-xs text-slate-500">{p.ratio}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Bijgewerkt {new Date(p.updated_at).toLocaleDateString("nl-NL")}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
