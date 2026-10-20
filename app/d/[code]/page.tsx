import { notFound } from "next/navigation";
import { gedeeld } from "@/lib/delen/delen";
import { herkomst } from "@/lib/delen/herkomst";

// De openbare deelpagina. Bewust buiten de app: geen menu, geen inlog, snel te openen
// vanuit WhatsApp. Onderaan de uitnodiging om het zelf te maken — elke gedeelde creatie
// is zo een klein reclamebord voor Animideo.

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const c = await gedeeld((await params).code);
  if (!c) return { title: "Animideo" };
  const h = herkomst(c);
  const titel = `Gemaakt met ${h.naam} · Animideo`;
  const beschrijving = "Beelden en video's maken met AI, in het Nederlands. Maak het zelf ook.";
  const plaatje = c.soort === "video" ? c.deel_poster : c.url;
  return {
    title: titel,
    description: beschrijving,
    openGraph: {
      title: titel,
      description: beschrijving,
      type: c.soort === "video" ? "video.other" : "website",
      ...(plaatje ? { images: [{ url: plaatje }] } : {}),
      ...(c.soort === "video" ? { videos: [{ url: c.url!, type: "video/mp4" }] } : {}),
    },
    twitter: { card: "summary_large_image", title: titel, description: beschrijving, ...(plaatje ? { images: [plaatje] } : {}) },
  };
}

export default async function DeelPagina({ params }: { params: Promise<{ code: string }> }) {
  const c = await gedeeld((await params).code);
  if (!c) notFound();
  const h = herkomst(c);
  const formaat = (c.invoer as { formaat?: string }).formaat;
  const staand = formaat === "9:16";

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="px-5 py-4 flex items-center justify-between">
        <a href="/" className="font-extrabold text-lg tracking-tight">
          Animideo<span className="text-blue-500">.</span>
        </a>
        <a href="/signup" className="text-sm font-semibold bg-white text-slate-900 rounded-full px-4 py-1.5 hover:bg-slate-200">
          Gratis proberen
        </a>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-10 gap-6">
        <div className={`w-full ${staand ? "max-w-sm" : "max-w-3xl"}`}>
          {c.soort === "video" ? (
            <video
              src={c.url!}
              poster={c.deel_poster ?? undefined}
              controls
              autoPlay
              muted
              loop
              playsInline
              className="w-full rounded-3xl shadow-2xl shadow-blue-500/10"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.url!} alt={`Gemaakt met ${h.naam}`} className="w-full rounded-3xl shadow-2xl shadow-blue-500/10" />
          )}
        </div>

        <div className="text-center space-y-3">
          <p className="text-slate-400 text-sm">
            Gemaakt met <span className="text-white font-semibold">{h.naam}</span> op Animideo
          </p>
          <a
            href={h.pad}
            className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl px-6 py-3"
          >
            ✨ Maak dit ook
          </a>
          <p className="text-xs text-slate-500">Beelden en video&apos;s met AI, in het Nederlands. Zonder gedoe.</p>
        </div>
      </main>
    </div>
  );
}
