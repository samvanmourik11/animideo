import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Creatie } from "@/lib/creaties/types";

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
  { href: "/maak/beeld", titel: "Beeld", uitleg: "Typ wat je wilt zien en krijg een beeld.", icoon: "🖼️", kleur: "from-blue-600/40 to-blue-400/10" },
  { href: "/mijn-werk", titel: "Video", uitleg: "Maak van elk beeld een bewegend filmpje.", icoon: "🎬", kleur: "from-violet-600/40 to-violet-400/10" },
  { href: "/effecten", titel: "Effecten", uitleg: "Foto erin, viraal filmpje eruit.", icoon: "⚡", kleur: "from-amber-500/40 to-amber-300/10", binnenkort: true },
  { href: "/apps", titel: "Apps", uitleg: "Eén klik: productfoto, profielfoto, achtergrond weg.", icoon: "🧩", kleur: "from-emerald-600/40 to-emerald-400/10", binnenkort: true },
  { href: "/stem", titel: "Stem & Lipsync", uitleg: "Nederlandse stemmen en pratende foto's.", icoon: "🗣️", kleur: "from-pink-600/40 to-pink-400/10", binnenkort: true },
  { href: "/dashboard", titel: "Studio's", uitleg: "De grote videotools: uitleg-, verhaal- en dialoogvideo's.", icoon: "🏗️", kleur: "from-slate-500/40 to-slate-400/10" },
];

export default async function OntdekPagina() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("creaties")
    .select("*")
    .eq("user_id", user!.id)
    .eq("status", "klaar")
    .order("created_at", { ascending: false })
    .limit(8);
  const recent = (data ?? []) as Creatie[];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">Wat ga je vandaag maken?</h1>
        <p className="text-slate-400 mt-2">Beelden, video&apos;s en stemmen met AI. In het Nederlands, zonder gedoe.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TEGELS.map((t) => {
          const inhoud = (
            <div className={`relative h-full rounded-3xl p-5 bg-gradient-to-br ${t.kleur} border border-white/[0.07] ${t.binnenkort ? "opacity-60" : "hover:border-white/20 transition-colors"}`}>
              <div className="text-3xl">{t.icoon}</div>
              <h2 className="mt-3 text-lg font-bold text-white">{t.titel}</h2>
              <p className="text-sm text-slate-300 mt-1">{t.uitleg}</p>
              {t.binnenkort && (
                <span className="absolute top-4 right-4 text-[10px] uppercase tracking-wide bg-black/30 text-slate-300 px-2 py-0.5 rounded">binnenkort</span>
              )}
            </div>
          );
          return t.binnenkort ? <div key={t.titel}>{inhoud}</div> : <Link key={t.titel} href={t.href}>{inhoud}</Link>;
        })}
      </div>

      {recent.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300">Laatst gemaakt</h2>
            <Link href="/mijn-werk" className="text-xs text-blue-300 hover:text-blue-200">Naar je bibliotheek →</Link>
          </div>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {recent.map((c) => (
              <Link key={c.id} href="/mijn-werk" className="block aspect-square rounded-xl overflow-hidden bg-[#0c1428]">
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
