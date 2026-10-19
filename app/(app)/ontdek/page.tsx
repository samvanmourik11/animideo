import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Creatie } from "@/lib/creaties/types";
import { RECEPTEN } from "@/lib/creaties/recepten";
import ReceptTegel from "@/components/creaties/ReceptTegel";

export const metadata = { title: "Ontdek · Animideo" };

// De nieuwe voorpagina. In fase 1 nog eenvoudig: wat je kunt maken, en je laatste werk.
// Straks komen hier de trends van de week, nieuwe effecten en uitgelicht werk van anderen.

interface Tegel {
  href: string;
  titel: string;
  uitleg: string;
  icoon: string;
  kleur: string;
  binnenkort?: boolean;
}

const TEGELS: Tegel[] = [
  { href: "/maak/beeld", titel: "Beeld", uitleg: "Typ wat je wilt zien en krijg een beeld.", icoon: "🖼️", kleur: "from-blue-500/20 to-transparent" },
  { href: "/maak/video", titel: "Video", uitleg: "Breng een beeld tot leven, of beschrijf wat er gebeurt.", icoon: "🎬", kleur: "from-violet-500/20 to-transparent" },
  { href: "/effecten", titel: "Effecten", uitleg: "Foto erin, viraal filmpje eruit.", icoon: "⚡", kleur: "from-amber-500/20 to-transparent" },
  { href: "/apps", titel: "Apps", uitleg: "Eén klik: productfoto, profielfoto, achtergrond weg.", icoon: "🧩", kleur: "from-emerald-500/20 to-transparent" },
  { href: "/stem", titel: "Stem & Lipsync", uitleg: "Nederlandse stemmen en pratende foto's.", icoon: "🗣️", kleur: "from-pink-500/20 to-transparent", binnenkort: true },
  { href: "/dashboard", titel: "Studio's", uitleg: "De grote videotools: uitleg-, verhaal- en dialoogvideo's.", icoon: "🏗️", kleur: "from-slate-500/20 to-transparent" },
];

export default async function OntdekPagina() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase
    .from("creaties")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "klaar")
    .order("created_at", { ascending: false })
    .limit(8);
  const recent = (data ?? []) as Creatie[];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-tekst tracking-tight">Wat ga je vandaag maken?</h1>
        <p className="text-tekst-3 mt-2">Beelden, video&apos;s en stemmen met AI. In het Nederlands, zonder gedoe.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TEGELS.map((t) => {
          const inhoud = (
            <div className={`relative h-full rounded-3xl p-5 bg-paneel bg-gradient-to-br ${t.kleur} border border-rand ${t.binnenkort ? "opacity-60" : "hover:border-blue-500/50 transition-colors"}`}>
              <div className="text-3xl">{t.icoon}</div>
              <h2 className="mt-3 text-lg font-bold text-tekst">{t.titel}</h2>
              <p className="text-sm text-tekst-2 mt-1">{t.uitleg}</p>
              {t.binnenkort && (
                <span className="absolute top-4 right-4 text-[10px] uppercase tracking-wide bg-paneel-2 text-tekst-3 px-2 py-0.5 rounded">binnenkort</span>
              )}
            </div>
          );
          return t.binnenkort ? <div key={t.titel}>{inhoud}</div> : <Link key={t.titel} href={t.href}>{inhoud}</Link>;
        })}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-tekst">✨ Nieuw deze week</h2>
          <Link href="/apps" className="text-xs text-blue-500 hover:text-blue-400">Alle apps →</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {RECEPTEN.filter((r) => r.nieuw).slice(0, 6).map((r) => <ReceptTegel key={r.id} recept={r} />)}
        </div>
      </div>

      {recent.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-tekst-2">Laatst gemaakt</h2>
            <Link href="/mijn-werk" className="text-xs text-blue-500 hover:text-blue-400">Naar je bibliotheek →</Link>
          </div>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {recent.map((c) => (
              <Link key={c.id} href="/mijn-werk" className="block aspect-square rounded-xl overflow-hidden bg-paneel-2">
                {c.soort === "video" ? (
                  <video src={c.url ?? undefined} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.url ?? ""} alt="" className="w-full h-full object-cover" />
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
