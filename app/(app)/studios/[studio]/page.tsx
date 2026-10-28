import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { studio as zoekStudio } from "@/lib/studios";
import StudioVideos from "@/components/studios/StudioVideos";
import StudioProjecten, { type ProjectRij } from "@/components/studios/StudioProjecten";

export async function generateMetadata({ params }: { params: Promise<{ studio: string }> }) {
  const s = zoekStudio((await params).studio);
  return { title: s ? `${s.naam} · Animideo` : "Animideo" };
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
    // Alles: bestaande projecten moeten na de overstap gewoon terug te vinden zijn.
    .limit(1000);
  let projecten = (data ?? []) as unknown as ProjectRij[];

  // Verhalen uit de oude Creator Studio horen voor klanten bij Storytelling; ze openen
  // wel in hun eigen editor, want ze zijn anders opgebouwd dan een Storytelling-verhaal.
  if (s.mode === "story") {
    const { data: oud } = await supabase
      .from("projects")
      .select("id, title, updated_at, created_at, thumb:scenes->0->>image_url")
      .eq("user_id", user.id)
      .eq("mode", "studio")
      .limit(1000);
    const creator = ((oud ?? []) as unknown as ProjectRij[]).map((p) => ({ ...p, href: `/studio/${p.id}` }));
    projecten = [...projecten, ...creator].sort((a, b) =>
      (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at));
  }

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
        <StudioProjecten projecten={projecten} pad={s.pad} icoon={s.icoon} nieuw={s.nieuw} />
      </section>

      <StudioVideos maker={s.maker} />
    </div>
  );
}
