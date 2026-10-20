import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mijnHartjes, profielOpHandle } from "@/lib/delen/profiel";
import WerkTegel from "@/components/delen/WerkTegel";

// Het openbare profiel (animideo.nl/@handle, via een herschrijving in next.config.ts).
// Net als de deelpagina buiten de app: geen inlog nodig.

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const p = await profielOpHandle((await params).handle);
  if (!p) return { title: "Animideo" };
  const titel = `${p.profiel.naam} (@${p.profiel.handle}) · Animideo`;
  const plaatje = p.profiel.logo_url ?? p.werk.find((w) => w.soort === "beeld")?.url ?? p.werk[0]?.deel_poster ?? undefined;
  return {
    title: titel,
    description: p.profiel.bio ?? `Beelden en video's van ${p.profiel.naam}, gemaakt met Animideo.`,
    openGraph: { title: titel, ...(plaatje ? { images: [{ url: plaatje }] } : {}) },
  };
}

export default async function MakerPagina({ params }: { params: Promise<{ handle: string }> }) {
  const p = await profielOpHandle((await params).handle);
  if (!p) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const harten = user ? await mijnHartjes(user.id, p.werk.map((w) => w.id)) : new Set<string>();
  const { profiel, werk } = p;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="px-5 py-4 flex items-center justify-between">
        <a href="/" className="font-extrabold text-lg tracking-tight">Animideo<span className="text-blue-500">.</span></a>
        <a href="/signup" className="text-sm font-semibold bg-white text-slate-900 rounded-full px-4 py-1.5 hover:bg-slate-200">Gratis proberen</a>
      </header>
      <main className="max-w-6xl mx-auto px-4 pb-16">
        <div className="flex flex-col items-center text-center gap-3 py-8">
          {profiel.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profiel.logo_url} alt="" className="w-24 h-24 rounded-full object-cover bg-white border border-white/10" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-4xl font-bold">
              {profiel.naam.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{profiel.naam}</h1>
            <p className="text-slate-400 text-sm">@{profiel.handle}</p>
          </div>
          {profiel.bio && <p className="max-w-md text-slate-300 text-sm">{profiel.bio}</p>}
          {profiel.website && (
            <a href={profiel.website} target="_blank" rel="noreferrer nofollow" className="text-sm text-blue-400 hover:underline">
              {profiel.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          )}
        </div>
        {werk.length === 0 ? (
          <p className="text-center text-slate-500 py-16">Nog geen werk op dit profiel.</p>
        ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 gap-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
            {werk.map((w) => <WerkTegel key={w.id} werk={{ ...w, handle: null }} hartAan={harten.has(w.id)} donker />)}
          </div>
        )}
        <div className="text-center mt-12">
          <a href="/signup" className="inline-block bg-blue-600 hover:bg-blue-500 font-semibold rounded-2xl px-6 py-3">✨ Maak je eigen beelden en video&apos;s</a>
        </div>
      </main>
    </div>
  );
}
