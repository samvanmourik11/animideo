import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ALLE_LESSEN, lesVan, posterVan, videoVan } from "@/lib/academy/lessen";
import { voortgangVan } from "@/lib/academy/voortgang";
import LesSpeler from "@/components/academy/LesSpeler";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ les: string }> }) {
  const l = lesVan((await params).les);
  return { title: `${l?.titel ?? "Les"} · Academy · Animideo` };
}

export default async function LesPagina({ params }: { params: Promise<{ les: string }> }) {
  const { les: slug } = await params;
  const les = lesVan(slug);
  if (!les) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Klanten met de losse cursus zien de e-learning niet (zelfde regel als het oude Leren).
  const { data: profiel } = await supabase.from("profiles").select("hide_leren").eq("id", user.id).single();
  if (profiel?.hide_leren) redirect("/ontdek");
  const { bekeken, gedaan } = await voortgangVan(user.id);
  const i = ALLE_LESSEN.findIndex((l) => l.slug === slug);
  const vorige = ALLE_LESSEN[i - 1];
  const volgende = ALLE_LESSEN[i + 1];
  const nummer = `${les.hoofdstuk.nummer}.${les.hoofdstuk.lessen.findIndex((l) => l.slug === slug) + 1}`;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/academy" className="text-xs text-blue-500 hover:text-blue-400">← Academy</Link>
        <div className="text-xs font-semibold text-tekst-3 mt-2">Hoofdstuk {les.hoofdstuk.nummer}: {les.hoofdstuk.titel} · Les {nummer}</div>
        <h1 className="text-3xl font-extrabold text-tekst tracking-tight">{les.titel}</h1>
        <p className="text-sm text-tekst-2 mt-1">{les.kort}</p>
      </div>

      <LesSpeler
        les={les.slug}
        video={videoVan(les.slug)}
        poster={posterVan(les.slug)}
        bekeken={bekeken.has(les.slug)}
        gedaan={gedaan.has(les.slug)}
        opdracht={les.opdracht}
      />

      <div className="n-kaart">
        <h2 className="text-sm font-bold text-tekst mb-2">Wat je onthoudt</h2>
        <ul className="space-y-1.5">
          {les.punten.map((p) => (
            <li key={p} className="text-sm text-tekst-2 flex gap-2"><span className="text-blue-500">●</span>{p}</li>
          ))}
        </ul>
      </div>

      <div className="flex justify-between gap-3">
        {vorige ? <Link href={`/academy/${vorige.slug}`} className="n-knop2 text-sm">← {vorige.titel}</Link> : <span />}
        {volgende ? <Link href={`/academy/${volgende.slug}`} className="btn-primary text-sm">Volgende: {volgende.titel} →</Link> : <Link href="/academy" className="btn-primary text-sm">Terug naar de Academy</Link>}
      </div>
    </div>
  );
}
