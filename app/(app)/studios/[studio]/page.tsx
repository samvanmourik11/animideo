import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { studio as zoekStudio } from "@/lib/studios";
import StudioVideos from "@/components/studios/StudioVideos";

export async function generateMetadata({ params }: { params: Promise<{ studio: string }> }) {
  const s = zoekStudio((await params).studio);
  return { title: s ? `${s.naam} · Animideo` : "Animideo" };
}

interface ProjectRij {
  id: string;
  title: string | null;
  updated_at: string | null;
  created_at: string;
  thumb: string | null;
}

// De startpagina van een studio: nieuw beginnen, of verder met een eerder project. Het
// voorbeeldplaatje komt rechtstreeks uit het opgeslagen verhaal (eerste scene), zonder
// het hele verhaal op te halen.
export default async function StudioStart({ params }: { params: Promise<{ studio: string }> }) {
  const s = zoekStudio((await params).studio);
  if (!s) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const thumb = s.mode === "story" ? "thumb:story_spec->scenes->0->>imageUrl" : "thumb:story_spec->scenes->0->lines->0->>shotImageUrl";
  const { data } = await supabase
    .from("projects")
    .select(`id, title, updated_at, created_at, ${thumb}`)
    .eq("user_id", user.id)
    .eq("mode", s.mode)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(48);
  const projecten = (data ?? []) as unknown as ProjectRij[];

  return (
    <div className="space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-tekst-3">Studio</div>
          <h1 className="text-3xl font-extrabold text-tekst tracking-tight">{s.icoon} {s.naam}</h1>
          <p className="text-tekst-3 mt-1 max-w-2xl">{s.uitleg}</p>
        </div>
        <Link href={s.pad} className="btn-primary shrink-0">＋ {s.nieuw}</Link>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-tekst-2 mb-3">Je projecten</h2>
        {projecten.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-rand p-12 text-center text-tekst-3">
            <div className="text-4xl mb-3">{s.icoon}</div>
            Nog niets gemaakt. Klik op &ldquo;{s.nieuw}&rdquo; om te beginnen.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {projecten.map((p) => (
              <Link
                key={p.id}
                href={`${s.pad}?project=${p.id}`}
                className="group rounded-2xl overflow-hidden border border-rand bg-paneel hover:border-blue-500/50 transition-colors"
              >
                <div className="aspect-[4/5] bg-paneel-2 overflow-hidden">
                  {p.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumb} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl opacity-60">{s.icoon}</div>
                  )}
                </div>
                <div className="p-3">
                  <div className="text-sm font-medium text-tekst truncate">{p.title || "Zonder titel"}</div>
                  <div className="text-[11px] text-tekst-3">
                    {new Date(p.updated_at ?? p.created_at).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <StudioVideos maker={s.maker} />
    </div>
  );
}
