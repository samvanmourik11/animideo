import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ALLE_LESSEN, HOOFDSTUKKEN, posterVan } from "@/lib/academy/lessen";
import { voortgangVan } from "@/lib/academy/voortgang";

export const metadata = { title: "Academy · Animideo" };
export const dynamic = "force-dynamic";

// De Academy: hoofdstukken met videolessen en opdrachten. Bovenaan waar je gebleven was.
export default async function AcademyPagina() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Klanten met de losse cursus zien de e-learning niet (zelfde regel als het oude Leren).
  const { data: profiel } = await supabase.from("profiles").select("hide_leren").eq("id", user.id).single();
  if (profiel?.hide_leren) redirect("/ontdek");
  const { bekeken, gedaan } = await voortgangVan(user.id);
  const klaar = ALLE_LESSEN.filter((l) => bekeken.has(l.slug) && gedaan.has(l.slug)).length;
  const volgende = ALLE_LESSEN.find((l) => !bekeken.has(l.slug) || !gedaan.has(l.slug));

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-tekst tracking-tight">🎓 Academy</h1>
          <p className="text-sm text-tekst-2 mt-1 max-w-xl">
            Korte videolessen met een opdracht erbij. Zo leer je in een paar uur alles wat Animideo kan, door het meteen zelf te doen.
          </p>
        </div>
        <div className="n-kaart min-w-[260px]">
          <div className="text-xs text-tekst-3">Jouw voortgang</div>
          <div className="text-2xl font-extrabold text-tekst">{klaar} <span className="text-sm font-medium text-tekst-3">van {ALLE_LESSEN.length} lessen af</span></div>
          <div className="h-2 rounded-full bg-paneel-2 mt-2 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.round((klaar / ALLE_LESSEN.length) * 100)}%` }} />
          </div>
          {volgende && (
            <Link href={`/academy/${volgende.slug}`} className="btn-primary text-sm w-full mt-3 text-center block">
              {klaar === 0 && !bekeken.size ? "Begin bij les 1" : "Verder met"}: {volgende.titel}
            </Link>
          )}
        </div>
      </div>

      {HOOFDSTUKKEN.map((h) => (
        <section key={h.nummer}>
          <div className="mb-3">
            <h2 className="text-lg font-bold text-tekst">{h.icoon} Hoofdstuk {h.nummer}: {h.titel}</h2>
            <p className="text-sm text-tekst-3">{h.uitleg}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {h.lessen.map((l, i) => {
              const b = bekeken.has(l.slug);
              const g = gedaan.has(l.slug);
              return (
                <Link key={l.slug} href={`/academy/${l.slug}`} className="group rounded-2xl border border-rand bg-paneel overflow-hidden hover:border-blue-500/60 transition">
                  <div className="relative aspect-video bg-paneel-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={posterVan(l.slug)} alt="" className="w-full h-full object-cover" loading="lazy" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-12 h-12 rounded-full bg-black/55 text-white flex items-center justify-center text-lg group-hover:scale-110 transition">▶</span>
                    </span>
                    {b && g && <span className="absolute top-2 right-2 rounded-full bg-emerald-500 text-white text-xs font-bold px-2 py-0.5">✓ Klaar</span>}
                  </div>
                  <div className="p-3">
                    <div className="text-[11px] font-semibold text-tekst-3">Les {h.nummer}.{i + 1}</div>
                    <div className="text-sm font-bold text-tekst leading-snug">{l.titel}</div>
                    <div className="text-xs text-tekst-2 mt-1 line-clamp-2">{l.kort}</div>
                    <div className="flex gap-3 mt-2 text-[11px]">
                      <span className={b ? "text-emerald-600 dark:text-emerald-400" : "text-tekst-3"}>{b ? "✓" : "○"} Bekeken</span>
                      <span className={g ? "text-emerald-600 dark:text-emerald-400" : "text-tekst-3"}>{g ? "✓" : "○"} Opdracht</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
